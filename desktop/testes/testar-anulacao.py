#!/usr/bin/env python3
"""O item anulado e o item pendente: duas coisas que NÃO são “em branco”.

Dupla marcação é item anulado — no PAS o estudante marcou duas alternativas e
isso vale como erro. Item que continua na fila de conferência não vale nada:
ninguém decidiu ainda o que está no papel. Antes, os dois viravam a mesma coisa
— ausência de marcação — e saíam do boletim como branco, com nota e posição na
turma calculadas em cima disso.

Este roteiro não precisa de scanner nem de navegador: monta as marcações à mão,
apura, e confere o que cada caso fez com a nota e com o que sai impresso.

    python3 desktop/testes/testar-anulacao.py [amostras]
"""
from __future__ import annotations

import csv
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


def _discursivos_de(pacote, estudante) -> float:
    """O que o discursivo já lançado soma ao escore — que o anulado não mexe."""
    notas = pacote.notas.get(estudante.matricula)
    if not notas:
        return 0.0
    escala = pacote.escore.escala_do_discursivo
    numeros = {i["numero"] for i in pacote.molde.itens_da_versao(estudante.versao)
               if i["tipo"] == "D"}
    return sum(max(0.0, min(escala, float(v))) / escala
               for n, v in notas.discursivas.items() if n in numeros)


def main() -> int:
    from leitor.apuracao import apurar, marcacoes_de
    from leitor.correcao import NULO
    from leitor.pacote import carregar

    caminho = AMOSTRAS / "pacote.json"
    if not caminho.exists():
        print(f"Faltam as amostras em {AMOSTRAS}. Rode antes:\n"
              "  node desktop/testes/gerar-amostras.mjs", file=sys.stderr)
        return 2

    pacote = carregar(caminho)
    estudante = next(e for e in pacote.elenco if e.versao == "regular")
    itens = [i for i in pacote.molde.itens_da_versao(estudante.versao) if i["tipo"] != "D"]
    if len(itens) < 3:
        print("a prova de exemplo tem poucos itens objetivos para este teste", file=sys.stderr)
        return 2
    acertado, anulado, pendente = itens[0], itens[1], itens[2]
    peso_do_anulado = float(pacote.escore.peso(anulado["tipo"]).get("errado", 0))
    falhas: list[str] = []

    with tempfile.TemporaryDirectory() as temporario:
        saida = Path(temporario)
        # O leitor leu com certeza só o primeiro; os outros dois foram para a fila.
        _escrever(saida / "respostas.csv", ["matricula", "item", "resposta"],
                  [[estudante.matricula, acertado["numero"], acertado["gabarito"]]])
        _escrever(saida / "respostas_conferir.csv",
                  ["matricula", "item", "resposta", "motivo", "folha"],
                  [[estudante.matricula, anulado["numero"], "", "dupla_marcacao", "f:1"],
                   [estudante.matricula, pendente["numero"], "", "leitura_duvidosa", "f:1"]])
        # E quem conferiu resolveu UM deles: confirmou a dupla marcação.
        _escrever(saida / "conferido.csv", ["matricula", "item", "resposta"],
                  [[estudante.matricula, anulado["numero"], NULO]])

        marcacoes, _, _ = marcacoes_de(
            pacote, [saida / "respostas.csv", saida / "conferido.csv"])
        resultados, _, boletins = apurar(pacote, marcacoes, saida)
        r = next(x for x in resultados if x.estudante.matricula == estudante.matricula)

        if r.nulos != 1:
            falhas.append(f"anulados: esperava 1, veio {r.nulos}")
        if r.erros != 1:
            falhas.append(f"o anulado tem de contar como erro — erradas veio {r.erros}")
        if r.pendentes != 1:
            falhas.append(f"pendentes: esperava 1, veio {r.pendentes}")
        # O pendente sai da conta inteiro: nem acerto, nem erro, nem branco.
        if r.brancos != len(itens) - 3:
            falhas.append(f"brancos: esperava {len(itens) - 3} (o pendente não é branco), "
                          f"veio {r.brancos}")
        if r.itens_avaliaveis != r.acertos + r.erros + r.brancos + r.discursivas_lancadas:
            falhas.append("o pendente entrou no denominador da Nota Marista")
        esperado = (float(pacote.escore.peso(acertado["tipo"]).get("certo", 0))
                    + peso_do_anulado + _discursivos_de(pacote, estudante))
        if abs(r.escore - esperado) > 0.005:
            falhas.append(f"escore: esperava {round(esperado, 2)} (1 certo + 1 anulado como "
                          f"erro + o discursivo já lançado), veio {round(r.escore, 2)}")

        detalhes = {d.numero: d for d in r.detalhes}
        if not detalhes[anulado["numero"]].nulo:
            falhas.append("o item anulado não saiu marcado como anulado no detalhe")
        if not detalhes[pendente["numero"]].pendente:
            falhas.append("o item pendente não saiu marcado como pendente no detalhe")

        # E o que chega ao papel: o N, o ?, e o aviso de que o boletim saiu cedo.
        html = Path(boletins).read_text(encoding="utf-8") if boletins else ""
        for pedaco, o_que in (('class="nula">N<', "o “N” do item anulado"),
                              ('class="pendente">?<', "o “?” do item pendente"),
                              ('class="pendencia"', "o aviso de que há item em conferência"),
                              ("item anulado", "a legenda do item anulado")):
            if pedaco not in html:
                falhas.append(f"o boletim não trouxe {o_que}")
        if "não entra aqui" in html:
            falhas.append("o boletim ainda diz que a marcação dupla não aparece")

        # A planilha também tem de contar os dois.
        with (saida / "resultados.csv").open(encoding="utf-8") as arquivo:
            linha = next(l for l in csv.DictReader(arquivo, delimiter=";")
                         if l["matricula"] == estudante.matricula)
        if linha.get("anulados") != "1" or linha.get("pendentes") != "1":
            falhas.append(f"resultados.csv: anulados={linha.get('anulados')!r}, "
                          f"pendentes={linha.get('pendentes')!r}")

    if falhas:
        print("FALHOU:", file=sys.stderr)
        for f in falhas:
            print(f"  · {f}", file=sys.stderr)
        return 1
    print(f"item {anulado['numero']} anulado (conta como erro, sai “N”) · "
          f"item {pendente['numero']} pendente (fora de toda conta, sai “?”)")
    print("\nPASSOU: anulado e pendente não viraram branco, e o boletim diz o que são.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
