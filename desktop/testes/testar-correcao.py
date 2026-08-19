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

        # 2. O sistema on-line corrige as mesmas marcações, num navegador.
        notas_sistema = base / "notas-do-sistema.csv"
        processo = subprocess.run(
            ["node", str(Path(__file__).resolve().parent / "notas-do-sistema.mjs"),
             str(respostas), str(notas_sistema)],
            capture_output=True, text=True)
        if processo.returncode != 0 or not notas_sistema.exists():
            print("não deu para obter as notas do sistema on-line:\n"
                  + processo.stdout + processo.stderr, file=sys.stderr)
            return 2

        # 3. E o aplicativo local corrige as mesmas marcações.
        pct = pacote_mod.carregar(caminho_pacote)
        marcacoes: dict[str, dict[int, str]] = {}
        with respostas.open(encoding="utf-8") as arquivo:
            for linha in csv.DictReader(arquivo, delimiter=";"):
                estudante = pct.casar(linha["matricula"])
                if estudante:
                    marcacoes.setdefault(estudante.matricula, {})[int(linha["item"])] = linha["resposta"]
        daqui = {r.estudante.matricula: r for r in corrigir_todos(pct, marcacoes)}

        with notas_sistema.open(encoding="utf-8-sig") as arquivo:
            de_la = list(csv.DictReader(arquivo, delimiter=";"))

    falhas = []
    for linha in de_la:
        matricula = linha["matricula"]
        aqui = daqui.get(matricula)
        if aqui is None:
            falhas.append(f"{matricula}: o sistema corrigiu e o aplicativo não conhece este estudante")
            continue
        comparar = [
            ("certas", float(linha["certas"]), float(aqui.acertos)),
            ("erradas", float(linha["erradas"]), float(aqui.erros)),
            ("brancos", float(linha["brancos"]), float(aqui.brancos)),
            ("escore_bruto", _numero(linha["escore_bruto"]), round(aqui.escore, 2)),
        ]
        nr_la, nr_aqui = _numero(linha["redacao_nr"]), aqui.nr
        if (nr_la is None) != (nr_aqui is None):
            falhas.append(f"{matricula} redação: sistema {linha['redacao_nr']!r}, aplicativo {nr_aqui!r}")
        elif nr_la is not None and abs(nr_la - round(nr_aqui, 1)) > 0.05:
            falhas.append(f"{matricula} redação: sistema {nr_la}, aplicativo {round(nr_aqui, 1)}")
        for nome, la, aq in comparar:
            if la is None or abs(la - aq) > 0.005:
                falhas.append(f"{matricula} {nome}: sistema {la}, aplicativo {aq}")

    lidos = {r for r in daqui if daqui[r].tem_resposta}
    sistema = {l["matricula"] for l in de_la}
    for sobrando in sorted(lidos - sistema):
        falhas.append(f"{sobrando}: o aplicativo corrigiu e o sistema não trouxe na planilha")

    print(f"{len(de_la)} estudante(s) corrigidos dos dois lados, {len(comparar) + 1} número(s) "
          "comparados em cada")
    if falhas:
        print("\nFALHOU — as duas correções discordam:", file=sys.stderr)
        for f in falhas:
            print(f"  · {f}", file=sys.stderr)
        return 1
    print("\nPASSOU: o sistema on-line e o aplicativo local dão a mesma nota.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
