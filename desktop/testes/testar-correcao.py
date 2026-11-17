#!/usr/bin/env python3
"""Prova que a correção do aplicativo local e a do sistema on-line concordam.

O escore passou a ser calculado nos dois lados: no sistema, para a tela de
Correção; aqui, para os boletins da secretaria. **Regra escrita em dois lugares
diverge em silêncio** — e o silêncio é o problema, porque ninguém confere nota
de prova contra uma segunda implementação; descobre-se pelo estudante que
reclama.

A tabela de pesos viajar dentro do pacote reduz o risco (os números são os
mesmos dos dois lados), mas não o elimina: a FORMA da conta continua escrita
duas vezes. Este teste é o que fecha essa brecha.

Ele faz os dois lados corrigirem EXATAMENTE as mesmas marcações — as que o
leitor tirou dos cartões impressos — e compara nota a nota.

E corrige TRÊS vezes: como o lote chega, com um item anulado, e com um item do
tipo B respondido pela metade. A anulação é a segunda regra escrita dos dois
lados (item anulado vale como acerto para todos), e escrever a mesma regra duas
vezes é o que este roteiro existe para vigiar. O item é escolhido pelo `id` que
o pacote traz, e não pelo número: cada versão numera os seus de 1 a N, e o nº 12
da regular pode ser o nº 10 da adaptada.

A terceira rodada é a que este roteiro não tinha, e as duas correções
DISCORDAVAM nela: o leitor manda para a conferência o tipo B com uma coluna em
branco como `60_`, o aplicativo local tirava o traço e completava com zero
(`060`), e o sistema on-line não. Com chave menor que 100, o mesmo cartão dava
ponto de um lado e erro do outro.

    python3 desktop/testes/testar-correcao.py [amostras]
"""
from __future__ import annotations

import csv
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
AMOSTRAS = Path(__file__).resolve().parent / (
    sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else "amostras")
sys.path.insert(0, str(RAIZ / "desktop" / "src"))


def _numero(texto: str) -> float | None:
    texto = (texto or "").strip().replace(",", ".")
    if texto == "":
        return None
    try:
        return float(texto)
    except ValueError:
        return None


def main() -> int:
    from leitor import pacote as pacote_mod
    from leitor.correcao import corrigir_todos

    caminho_pacote = AMOSTRAS / "pacote.json"
    if not caminho_pacote.exists():
        print(f"Faltam as amostras em {AMOSTRAS}. Rode antes:\n"
              "  node desktop/testes/gerar-amostras.mjs", file=sys.stderr)
        return 2

    with tempfile.TemporaryDirectory() as temporario:
        base = Path(temporario)
        entrada, saida = base / "digitalizacoes", base / "resultado"

        # 1. As marcações saem dos cartões de verdade, passando pelo leitor.
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "amostrar", Path(__file__).resolve().parent / "testar-leitura.py")
        amostrar = importlib.util.module_from_spec(spec)
        guardado, sys.argv[:] = sys.argv[:], ["testar-leitura"]
        spec.loader.exec_module(amostrar)
        sys.argv[:] = guardado
        amostrar.digitalizar(AMOSTRAS / "cartoes-preenchidos.pdf", entrada)
        subprocess.run(
            [sys.executable, "-m", "src.leitor.cli", "ler", "--gabarito", str(caminho_pacote),
             "--entrada", str(entrada), "--saida", str(saida)],
            cwd=RAIZ / "desktop", capture_output=True, text=True, check=False)
        respostas = saida / "respostas.csv"
        if not respostas.exists():
            print("o leitor não gerou respostas.csv", file=sys.stderr)
            return 1

        # 2. O item que será anulado na segunda rodada. Escolhido pelo `id`, e
        # entre os que aparecem NAS DUAS versões: é aí que anular por número
        # daria errado, e é isso que interessa vigiar.
        pct = pacote_mod.carregar(caminho_pacote)
        porId: dict[str, list] = {}
        for chave, item in pct.molde.itens.items():
            if item.get("id") and item["tipo"] != "D":
                porId.setdefault(item["id"], []).append(chave)
        nasDuas = sorted((i for i, chaves in porId.items() if len(chaves) > 1),
                         key=lambda i: sorted(porId[i]))
        anulado = nasDuas[0] if nasDuas else (sorted(porId)[0] if porId else "")
        if not anulado:
            print("o pacote de exemplo não traz `id` de item — regere as amostras",
                  file=sys.stderr)
            return 2

        # 3. As marcações, iguais para os dois lados.
        marcacoes: dict[str, dict[int, str]] = {}
        with respostas.open(encoding="utf-8") as arquivo:
            for linha in csv.DictReader(arquivo, delimiter=";"):
                estudante = pct.casar(linha["matricula"])
                if estudante:
                    marcacoes.setdefault(estudante.matricula, {})[int(linha["item"])] = linha["resposta"]

        # 4. O tipo B pela metade. A chave do item passa a ser 060 — menor que
        #    100 de propósito: é só aí que completar com zero rende ponto a quem
        #    não marcou o número — e três estudantes respondem de três jeitos:
        #    centena em branco, unidade em branco, e `60` digitado por gente, que
        #    é 060 e tem de continuar valendo.
        CHAVE_B = "060"
        casos_b = [("_60", False), ("60_", False), ("60", True)]
        item_b = next((i for i in sorted(porId)
                       if pct.molde.itens[porId[i][0]]["tipo"] == "B"), "")
        numero_b = {versao: numero for versao, numero in porId.get(item_b, [])}
        alunos_b = [e for e in pct.elenco if e.versao in numero_b][:len(casos_b)]
        if not item_b or len(alunos_b) < len(casos_b):
            print("o pacote de exemplo não tem item do tipo B com estudantes bastantes para "
                  "a rodada do número incompleto", file=sys.stderr)
            return 2
        esperado_b = {e.matricula: (numero_b[e.versao], resposta, certa)
                      for e, (resposta, certa) in zip(alunos_b, casos_b)}
        marcacoes_b = {m: dict(itens) for m, itens in marcacoes.items()}
        for matricula, (numero, resposta, _certa) in esperado_b.items():
            marcacoes_b.setdefault(matricula, {})[numero] = resposta
        # As linhas novas vão no FIM do CSV: na importação a última vale, como
        # vale o CSV da conferência sobre o da leitura.
        respostas_b = base / "respostas-tipo-b.csv"
        respostas_b.write_text(
            respostas.read_text(encoding="utf-8").rstrip("\n") + "\n"
            + "".join(f"{m};{n};{r}\n" for m, (n, r, _c) in esperado_b.items()),
            encoding="utf-8")

        # 5. E as três rodadas, cada uma com o mesmo estado dos dois lados.
        rodadas = []
        for rotulo, anular, gabaritos, csv_da_rodada, marcacoes_da_rodada in (
                ("sem anulação", "", {}, respostas, marcacoes),
                (f"com o item {anulado} anulado", anulado, {}, respostas, marcacoes),
                ("com o tipo B pela metade", "", {item_b: CHAVE_B}, respostas_b, marcacoes_b)):
            notas_sistema = base / f"notas-do-sistema-{len(rodadas)}.csv"
            comando = ["node", str(Path(__file__).resolve().parent / "notas-do-sistema.mjs"),
                       str(csv_da_rodada), str(notas_sistema)]
            if anular:
                comando.append(f"--anular={anular}")
            if gabaritos:
                comando.append("--gabarito=" + ",".join(f"{i}:{g}" for i, g in gabaritos.items()))
            processo = subprocess.run(comando, capture_output=True, text=True)
            if processo.returncode != 0 or not notas_sistema.exists():
                print(f"não deu para obter as notas do sistema on-line ({rotulo}):\n"
                      + processo.stdout + processo.stderr, file=sys.stderr)
                return 2

            pct = pacote_mod.carregar(caminho_pacote)
            if anular:
                pct.anulados = {chave for chave, item in pct.molde.itens.items()
                                if item.get("id") == anular}
            for item in pct.molde.itens.values():
                if item.get("id") in gabaritos:
                    item["gabarito"] = gabaritos[item["id"]]
            daqui = {r.estudante.matricula: r
                     for r in corrigir_todos(pct, marcacoes_da_rodada)}
            with notas_sistema.open(encoding="utf-8-sig") as arquivo:
                rodadas.append((rotulo, daqui, list(csv.DictReader(arquivo, delimiter=";"))))

    falhas, comparados = [], 0
    for rotulo, daqui, de_la in rodadas:
        for linha in de_la:
            matricula = linha["matricula"]
            aqui = daqui.get(matricula)
            if aqui is None:
                falhas.append(f"[{rotulo}] {matricula}: o sistema corrigiu e o aplicativo não "
                              "conhece este estudante")
                continue
            comparar = [
                ("certas", float(linha["certas"]), float(aqui.acertos)),
                ("erradas", float(linha["erradas"]), float(aqui.erros)),
                ("brancos", float(linha["brancos"]), float(aqui.brancos)),
                ("anulados", float(linha["anulados"]), float(aqui.anulados)),
                ("escore_bruto", _numero(linha["escore_bruto"]), round(aqui.escore, 2)),
            ]
            comparados = len(comparar) + 1
            nr_la, nr_aqui = _numero(linha["redacao_nr"]), aqui.nr
            if (nr_la is None) != (nr_aqui is None):
                falhas.append(f"[{rotulo}] {matricula} redação: sistema {linha['redacao_nr']!r}, "
                              f"aplicativo {nr_aqui!r}")
            elif nr_la is not None and abs(nr_la - round(nr_aqui, 1)) > 0.05:
                falhas.append(f"[{rotulo}] {matricula} redação: sistema {nr_la}, "
                              f"aplicativo {round(nr_aqui, 1)}")
            for nome, la, aq in comparar:
                if la is None or abs(la - aq) > 0.005:
                    falhas.append(f"[{rotulo}] {matricula} {nome}: sistema {la}, aplicativo {aq}")

        lidos = {r for r in daqui if daqui[r].tem_resposta}
        sistema = {l["matricula"] for l in de_la}
        for sobrando in sorted(lidos - sistema):
            falhas.append(f"[{rotulo}] {sobrando}: o aplicativo corrigiu e o sistema não trouxe "
                          "na planilha")

    # E a anulação tem de ter MUDADO alguma coisa: se as duas rodadas derem o
    # mesmo, o teste passaria comparando nada com nada.
    sem, com = rodadas[0][1], rodadas[1][1]
    if not any(abs(sem[m].escore - com[m].escore) > 0.005 for m in sem if m in com):
        falhas.append("anular um item não mudou nota nenhuma — as duas rodadas ficaram iguais, "
                      "e a comparação não provou nada")

    # E o número pela metade não pode render ponto — nem aqui, nem lá. As duas
    # correções concordarem não basta: concordariam também se as duas
    # completassem com zero. O que se cobra é o que cada resposta VALE.
    do_tipo_b = rodadas[2][1]
    for matricula, (numero, resposta, certa) in esperado_b.items():
        detalhe = next((d for d in do_tipo_b[matricula].detalhes if d.numero == numero), None)
        if detalhe is None:
            falhas.append(f"[tipo B pela metade] {matricula}: o item {numero} sumiu da correção")
        elif detalhe.certa != certa:
            falhas.append(f"[tipo B pela metade] {matricula}: respondeu “{resposta}” com a chave "
                          f"{CHAVE_B} e saiu como {'certo' if detalhe.certa else 'errado'}")
        elif "_" in resposta and detalhe.marcada != resposta:
            falhas.append(f"[tipo B pela metade] {matricula}: no papel estava “{resposta}” e o "
                          f"boletim mostraria “{detalhe.marcada}”")

    print(f"{len(rodadas[0][2])} estudante(s) corrigidos dos dois lados, {comparados} número(s) "
          f"comparados em cada, em 3 rodadas (sem anulação, com o item {anulado} anulado e com "
          f"o tipo B pela metade)")
    if falhas:
        print("\nFALHOU — as duas correções discordam:", file=sys.stderr)
        for f in falhas:
            print(f"  · {f}", file=sys.stderr)
        return 1
    print("\nPASSOU: o sistema on-line e o aplicativo local dão a mesma nota — com item anulado, "
          "sem, e com o tipo B respondido pela metade.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
