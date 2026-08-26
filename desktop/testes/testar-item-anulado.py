#!/usr/bin/env python3
"""Item anulado pela coordenação: a pontuação vai para todos, e o boletim diz.

Item com defeito de formulação, ou sem alternativa correta, é anulado depois da
aplicação: quem errou, quem deixou em branco e quem ficou na fila de conferência
recebem a pontuação dele igualmente. É a única coisa que muda a nota sem estar no
papel nem no pacote exportado — e por isso é a que mais precisa de roteiro.

(Não confundir com a dupla marcação, que é o ESTUDANTE anulando o item dele e
vale como erro. Essa tem roteiro próprio em `testar-dupla-marcacao.py`.)

Cinco perguntas, e a última é a que impede um estrago silencioso:

1. o item anulado conta como acerto, no escore e na Nota Marista;
2. ele sai da fila de conferência — marcação que não conta ninguém precisa
   decidir;
3. o discursivo anulado vale a nota cheia, e a nota lançada nele deixa de valer;
4. o boletim mostra o `*`, o traço no lugar do gabarito e o aviso do que houve;
5. **sem anulação nenhuma, tudo continua exatamente como era** — o caminho de
   todo lote normal não pode ter mudado de conta.

    python3 desktop/testes/testar-item-anulado.py [amostras]
"""
from __future__ import annotations

import csv
import shutil
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
AMOSTRAS = Path(__file__).resolve().parent / (
    sys.argv[1] if len(sys.argv) > 1 else "amostras")
sys.path.insert(0, str(RAIZ / "desktop" / "src"))


def _escrever(caminho: Path, cabecalho: list[str], linhas: list[list]) -> None:
    with caminho.open("w", encoding="utf-8", newline="") as arquivo:
        escritor = csv.writer(arquivo, delimiter=";", lineterminator="\n")
        escritor.writerow(cabecalho)
        escritor.writerows(linhas)


def _errada(item: dict) -> str:
    """Uma resposta certamente errada para este item — seja qual for o tipo."""
    gabarito = str(item.get("gabarito") or "").strip().upper()
    if item["tipo"] == "B":
        return "999" if gabarito.lstrip("0") != "999" else "111"
    for opcao in ("A", "B", "C", "D", "E"):
        if opcao != gabarito:
            return opcao
    return "X"


def _apurar(pacote, saida: Path, matricula: str):
    from leitor.apuracao import apurar, marcacoes_de
    marcacoes, _, _ = marcacoes_de(pacote, [saida / "respostas.csv"])
    resultados, _, boletins = apurar(pacote, marcacoes, saida)
    return next(r for r in resultados if r.estudante.matricula == matricula), boletins


def main() -> int:
    from leitor import anulacao
    from leitor.pacote import carregar

    origem = AMOSTRAS / "pacote.json"
    if not origem.exists():
        print(f"Faltam as amostras em {AMOSTRAS}. Rode antes:\n"
              "  node desktop/testes/gerar-amostras.mjs", file=sys.stderr)
        return 2

    falhas: list[str] = []
    with tempfile.TemporaryDirectory() as temporario:
        base = Path(temporario)
        # O pacote é copiado: a anulação fica lembrada AO LADO dele, e um teste
        # não deixa arquivo solto na pasta das amostras.
        caminho = base / "pacote.json"
        shutil.copy(origem, caminho)
        saida = base / "resultado"
        saida.mkdir()

        pacote = carregar(caminho)
        estudante = next(e for e in pacote.elenco
                         if e.versao == "regular" and pacote.notas.get(e.matricula)
                         and pacote.notas[e.matricula].discursivas)
        itens = pacote.molde.itens_da_versao(estudante.versao)
        objetivos = [i for i in itens if i["tipo"] != "D"]
        discursivos = [i for i in itens if i["tipo"] == "D"]
        if len(objetivos) < 4 or not discursivos:
            print("a prova de exemplo não tem itens suficientes para este roteiro",
                  file=sys.stderr)
            return 2
        certo, anulado_errado, anulado_pendente, errado = objetivos[:4]
        discursivo = discursivos[0]
        peso = lambda item, chave: float(pacote.escore.peso(item["tipo"]).get(chave, 0))
        nota_lancada = float(pacote.notas[estudante.matricula].discursivas[discursivo["numero"]])
        escala = pacote.escore.escala_do_discursivo

        # O que o leitor leu: um certo, um errado no item que será anulado, um
        # errado de verdade — e um que ficou na fila de conferência, sem decisão.
        _escrever(saida / "respostas.csv", ["matricula", "item", "resposta"],
                  [[estudante.matricula, certo["numero"], certo["gabarito"]],
                   [estudante.matricula, anulado_errado["numero"], _errada(anulado_errado)],
                   [estudante.matricula, errado["numero"], _errada(errado)]])
        _escrever(saida / "respostas_conferir.csv",
                  ["matricula", "item", "resposta", "motivo", "folha"],
                  [[estudante.matricula, anulado_pendente["numero"], "",
                    "leitura_duvidosa", "f:1"]])

        # ---------------------------------------- 5. sem anulação, nada mudou
        antes, _ = _apurar(pacote, saida, estudante.matricula)
        esperado = (peso(certo, "certo") + peso(anulado_errado, "errado")
                    + peso(errado, "errado") + nota_lancada / escala)
        if abs(antes.escore - esperado) > 0.005:
            falhas.append(f"sem anulação o escore mudou: esperava {round(esperado, 2)}, "
                          f"veio {round(antes.escore, 2)}")
        if antes.anulados or antes.pendentes != 1:
            falhas.append(f"sem anulação: anulados={antes.anulados}, "
                          f"pendentes={antes.pendentes} (esperava 0 e 1)")

        # ------------------------------------------------- 1 e 2. com anulação
        anulados = {anulado_errado["numero"], anulado_pendente["numero"]}
        anulacao.lembrar(caminho, pacote.molde.prova, anulados)
        pacote = carregar(caminho)                     # e volta lembrado do arquivo
        if pacote.anulados != anulados:
            falhas.append(f"os itens anulados não voltaram do arquivo: {pacote.anulados}")

        depois, boletins = _apurar(pacote, saida, estudante.matricula)
        esperado = (peso(certo, "certo") + peso(anulado_errado, "certo")
                    + peso(anulado_pendente, "certo") + peso(errado, "errado")
                    + nota_lancada / escala)
        if abs(depois.escore - esperado) > 0.005:
            falhas.append(f"escore com dois itens anulados: esperava {round(esperado, 2)} "
                          f"(os anulados valem como certo), veio {round(depois.escore, 2)}")
        if depois.anulados != 2:
            falhas.append(f"anulados: esperava 2, veio {depois.anulados}")
        if depois.acertos != 3:
            falhas.append(f"o anulado tem de contar como acerto — certas veio {depois.acertos}")
        if depois.pendentes:
            falhas.append(f"o item anulado continuou na conta das pendências "
                          f"({depois.pendentes}) — marcação que não conta ninguém confere")
        if depois.erros != 1 or depois.brancos:
            falhas.append(f"erros={depois.erros}, brancos={depois.brancos} "
                          f"(esperava 1 e 0: o anulado não é erro nem branco)")
        marista = (3 + nota_lancada / escala) / 5 * pacote.escore.escala_marista
        if depois.nota_marista is None or abs(depois.nota_marista - marista) > 0.005:
            falhas.append(f"Nota Marista: esperava {round(marista, 2)}, veio "
                          f"{depois.nota_marista}")
        detalhes = {d.numero: d for d in depois.detalhes}
        for numero in anulados:
            if not detalhes[numero].anulado:
                falhas.append(f"o item {numero} não saiu marcado como anulado no detalhe")

        # ------------------------------------------- 4. o que chega ao papel
        html = Path(boletins).read_text(encoding="utf-8") if boletins else ""
        for pedaco, o_que in (('class="anulado">*<', "o “*” da marcação anulada"),
                              (f'class="anulado">{anulado_errado["numero"]}*<',
                               "o asterisco no número do item"),
                              ('class="anulado">—<', "o traço no lugar do gabarito anulado"),
                              ('class="anulacao"', "o aviso de que houve item anulado"),
                              ("pontuação foi concedida a", "a legenda do item anulado")):
            if pedaco not in html:
                falhas.append(f"o boletim não trouxe {o_que}")

        # ------------------------------- 3. o discursivo anulado vale a nota cheia
        anulacao.lembrar(caminho, pacote.molde.prova, {discursivo["numero"]})
        pacote = carregar(caminho)
        so_d, boletins_d = _apurar(pacote, saida, estudante.matricula)
        esperado = (peso(certo, "certo") + peso(anulado_errado, "errado")
                    + peso(errado, "errado") + 1.0)
        if abs(so_d.escore - esperado) > 0.005:
            falhas.append(f"discursivo anulado: esperava {round(esperado, 2)} (nota cheia no "
                          f"lugar da lançada), veio {round(so_d.escore, 2)}")
        html_d = Path(boletins_d).read_text(encoding="utf-8") if boletins_d else ""
        if "Desempenho nos itens do tipo D" in html_d:
            falhas.append("o discursivo anulado continuou desenhado no gráfico do boletim")

        # ------------------------------------------ e a planilha conta os dois
        anulacao.lembrar(caminho, pacote.molde.prova, anulados)
        pacote = carregar(caminho)
        _apurar(pacote, saida, estudante.matricula)
        with (saida / "resultados.csv").open(encoding="utf-8") as arquivo:
            linha = next(l for l in csv.DictReader(arquivo, delimiter=";")
                         if l["matricula"] == estudante.matricula)
        if linha.get("anulados") != "2" or linha.get("certas") != "3":
            falhas.append(f"resultados.csv: anulados={linha.get('anulados')!r}, "
                          f"certas={linha.get('certas')!r}")

        # ------------------ item lembrado que não existe mais sai, mas com aviso
        anulacao.lembrar(caminho, pacote.molde.prova, {max(pacote.numeros_dos_itens) + 40})
        orfao = carregar(caminho)
        if orfao.anulados or not orfao.avisos:
            falhas.append("item anulado que não existe nesta prova tinha de sair COM aviso — "
                          f"anulados={orfao.anulados}, avisos={orfao.avisos}")

    if falhas:
        print("FALHOU:", file=sys.stderr)
        for f in falhas:
            print(f"  · {f}", file=sys.stderr)
        return 1
    print(f"itens {anulacao.em_texto(anulados)} anulados: contam como acerto para todos, "
          f"saem da conferência e saem com “*” no boletim")
    print(f"item {discursivo['numero']} (tipo D) anulado: vale a nota cheia, e a lançada "
          f"nele deixa de valer")
    print("\nPASSOU: a anulação dá a pontuação a todos, e sem ela nada mudou.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
