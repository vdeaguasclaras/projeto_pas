#!/usr/bin/env python3
"""O TXT do sistema acadêmico, conferido contra o arquivo que a escola importou.

O formato é contrato com um programa que já existe: vírgula, CRLF, latin-1,
conceito com ponto e sem o `.0` do inteiro. Nada disso se descobre lendo a
documentação dele — descobriu-se lendo o arquivo de 2025 que a coordenação
mandou. Este roteiro monta o mesmo arquivo pelo nosso caminho e compara
**byte a byte** com aquele.

`referencia/academico-2025.txt` é um trecho ANONIMIZADO do arquivo real: mesmas
turmas, mesmos códigos de disciplina, mesma prova e mesmas notas, com duas
matrículas inventadas no lugar das de verdade. O que precisa ficar versionado é o
formato; matrícula de estudante, não.

    python3 desktop/testes/testar-academico.py
"""
from __future__ import annotations

import csv
import io
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

RAIZ = Path(__file__).resolve().parents[2]
REFERENCIA = Path(__file__).resolve().parent / "referencia" / "academico-2025.txt"
sys.path.insert(0, str(RAIZ / "desktop" / "src"))


def _resultado(estudante, nota: float | None, pendentes: int = 0):
    """Um resultado com a Nota Marista pedida, sem passar pela correção inteira.

    A nota é derivada (`acertos / avaliáveis × escala`), então é ela que se
    monta. Mil itens para o valor cair exato na primeira casa decimal.
    """
    from leitor.correcao import Resultado
    if nota is None:
        return Resultado(estudante=estudante, tem_resposta=False, escala_marista=2.0)
    return Resultado(estudante=estudante, tem_resposta=True, escala_marista=2.0,
                     itens_avaliaveis=1000, acertos_marista=nota / 2.0 * 1000,
                     pendentes=pendentes)


def main() -> int:
    from leitor import academico
    from leitor.pacote import Estudante

    if not REFERENCIA.exists():
        print(f"falta o arquivo de referência em {REFERENCIA}", file=sys.stderr)
        return 2

    falhas: list[str] = []
    serie = "1ª série EM"
    # A turma do elenco é texto livre, e é assim que a coordenação a digita.
    # Sair daqui como `EM-1ªA-M` é metade do teste.
    elenco = [Estudante("225000001", "ESTUDANTE UM", "1ª A", "regular"),
              Estudante("225000002", "ESTUDANTE DOIS", "1ª C", "adaptada")]
    pacote = SimpleNamespace(elenco=elenco,
                             molde=SimpleNamespace(prova={"serie": serie}))
    resultados = [_resultado(elenco[0], 1.4), _resultado(elenco[1], 2.0)]

    # As nove disciplinas do arquivo de referência, na ordem dos códigos.
    esperadas = ["Língua Portuguesa", "Matemática", "História", "Geografia",
                 "Produção textual", "Literatura", "Biologia", "Física", "Química"]
    disciplinas = {nome: codigo for _a, nome, codigo in academico.disciplinas_da_serie(serie)}
    escolhidas = sorted(esperadas, key=lambda n: disciplinas.get(n, ""))

    with tempfile.TemporaryDirectory() as temporario:
        alvo = Path(temporario) / "saiu.txt"
        academico.escrever(alvo, academico.linhas_do_arquivo(
            pacote, resultados, "E3_P3", 2025, escolhidas, turno="M", serie=serie))
        saiu, referencia = alvo.read_bytes(), REFERENCIA.read_bytes()

        if saiu != referencia:
            falhas.append("o arquivo gerado não é igual ao de referência")
            a = saiu.decode("latin-1").splitlines()
            b = referencia.decode("latin-1").splitlines()
            for i, (x, y) in enumerate(zip(a, b)):
                if x != y:
                    falhas.append(f"  linha {i + 1}: saiu {x!r}, esperava {y!r}")
                    break
            if len(a) != len(b):
                falhas.append(f"  {len(a)} linha(s) contra {len(b)} da referência")

        # E o que o byte a byte não mostraria se as duas pontas estivessem erradas.
        if b"\r\n" not in saiu:
            falhas.append("o arquivo saiu sem CRLF")
        if "ª".encode("latin-1") not in saiu:
            falhas.append("o “ª” da turma não saiu em latin-1")
        try:
            saiu.decode("utf-8")
            falhas.append("o arquivo saiu legível como UTF-8 — a acentuação não é latin-1")
        except UnicodeDecodeError:
            pass

    # O código de nove algarismos, decomposto — o exemplo que a coordenação deu.
    if disciplinas.get("Língua Portuguesa") != "225031001":
        falhas.append(f"Língua Portuguesa da 1ª série: esperava 225031001, "
                      f"veio {disciplinas.get('Língua Portuguesa')}")
    nono = {nome: codigo for _a, nome, codigo in academico.disciplinas_da_serie("9º ano")}
    if "Biologia" in nono or nono.get("Ciências") != "225029005":
        falhas.append("no 9º ano tem de haver Ciências (225029005) e NÃO Biologia — "
                      f"veio Ciências={nono.get('Ciências')}, Biologia={nono.get('Biologia')}")

    # A turma livre, em suas formas conhecidas, e a que já vem pronta.
    for livre, esperado in (("1ª A", "EM-1ªA-M"), ("1B", "EM-1ªB-M"), ("1 c", "EM-1ªC-M"),
                            ("EM-1ªB-M", "EM-1ªB-M")):
        veio = academico.turma_oficial(livre, serie, "M")
        if veio != esperado:
            falhas.append(f"turma {livre!r}: esperava {esperado}, veio {veio}")

    # O conceito, com e sem casa decimal.
    for nota, esperado in ((2.0, "2"), (1.4, "1.4"), (0.0, "0"), (None, "0"), (1.25, "1.2")):
        if academico.conceito(nota) != esperado:
            falhas.append(f"conceito({nota}) devia ser {esperado!r}, "
                          f"veio {academico.conceito(nota)!r}")

    # Quem não fez a prova entra como ausente, com zero — e não some do arquivo.
    ausente = [_resultado(elenco[0], 1.4), _resultado(elenco[1], None)]
    linhas = academico.linhas_do_arquivo(pacote, ausente, "E1_P1", 2026,
                                         ["Matemática"], serie=serie)
    faltou = [l for l in linhas if l[0] == "225000002"]
    if len(linhas) != 2 or not faltou or faltou[0][-1] != "N" or faltou[0][-2] != "0":
        falhas.append(f"quem não fez a prova tinha de sair com 0 e N — veio {faltou}")

    # E o que a exportação PRECISA recusar.
    def recusa(o_que, **kw) -> None:
        argumentos = {"pacote": pacote, "resultados": resultados, "prova": "E3_P3",
                      "ano": 2025, "disciplinas": ["Matemática"], "serie": serie, **kw}
        try:
            academico.linhas_do_arquivo(**argumentos)
        except academico.NaoDaParaExportar:
            return
        falhas.append(f"a exportação aceitou {o_que}")

    recusa("um código de prova sem sentido", prova="prova 3")
    recusa("nenhum componente escolhido", disciplinas=[])
    recusa("um componente que não existe na série", disciplinas=["Ciências"])
    recusa("marcações ainda em conferência",
           resultados=[_resultado(elenco[0], 1.4, pendentes=2)])

    if falhas:
        print("FALHOU:", file=sys.stderr)
        for f in falhas:
            print(f"  · {f}", file=sys.stderr)
        return 1
    print(f"{len(escolhidas)} disciplina(s) × {len(elenco)} estudante(s) — "
          f"igual byte a byte ao arquivo que a escola importou em 2025")
    print("\nPASSOU: o TXT sai no formato do sistema acadêmico, e recusa o que não pode lançar.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
