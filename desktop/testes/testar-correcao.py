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

E corrige DUAS vezes: uma como o lote chega, e outra com um item anulado. A
anulação é a segunda regra escrita dos dois lados (item anulado vale como acerto
para todos), e escrever a mesma regra duas vezes é o que este roteiro existe para
vigiar. O item é escolhido pelo `id` que o pacote traz, e não pelo número: cada
versão numera os seus de 1 a N, e o nº 12 da regular pode ser o nº 10 da
adaptada.

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

        # 4. E as duas rodadas: sem anulação e com o mesmo item anulado dos dois
        #    lados.
        rodadas = []
        for rotulo, anular in (("sem anulação", ""), (f"com o item {anulado} anulado", anulado)):
            notas_sistema = base / f"notas-do-sistema{'-anulado' if anular else ''}.csv"
            comando = ["node", str(Path(__file__).resolve().parent / "notas-do-sistema.mjs"),
                       str(respostas), str(notas_sistema)]
            if anular:
                comando.append(f"--anular={anular}")
            processo = subprocess.run(comando, capture_output=True, text=True)
            if processo.returncode != 0 or not notas_sistema.exists():
                print(f"não deu para obter as notas do sistema on-line ({rotulo}):\n"
                      + processo.stdout + processo.stderr, file=sys.stderr)
                return 2

            pct = pacote_mod.carregar(caminho_pacote)
            if anular:
                pct.anulados = {chave for chave, item in pct.molde.itens.items()
                                if item.get("id") == anular}
            daqui = {r.estudante.matricula: r for r in corrigir_todos(pct, marcacoes)}
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

    print(f"{len(rodadas[0][2])} estudante(s) corrigidos dos dois lados, {comparados} número(s) "
          f"comparados em cada, em 2 rodadas (sem anulação e com o item {anulado} anulado)")
    if falhas:
        print("\nFALHOU — as duas correções discordam:", file=sys.stderr)
        for f in falhas:
            print(f"  · {f}", file=sys.stderr)
        return 1
    print("\nPASSOU: o sistema on-line e o aplicativo local dão a mesma nota, com item anulado "
          "e sem.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
