"""O TXT que o sistema acadêmico da escola importa.

Uma linha por estudante **e por componente**, porque é assim que o sistema
acadêmico lança: a mesma prova conta para vários componentes curriculares, e
cada um deles recebe a mesma nota. Nove componentes e 101 estudantes viram 909
linhas — foi exatamente o que veio no arquivo de referência da 3ª etapa de 2025.

O formato não é escolha nossa: é contrato com um programa que já existe, e que
recusa o arquivo inteiro se uma vírgula mudar de lugar. Por isso está descrito
aqui, por extenso, e conferido contra o arquivo de referência por
`desktop/testes/testar-academico.py`:

    ALUNO,DISCIPLINA,TURMA,ANO,PERIODO,PROVA,CONCEITO,COMPARECEU
    225210327,225031001,EM1BM,2025,0,E3_P3,1.4,S

- separador **vírgula**, fim de linha **CRLF**, e a primeira linha é o cabeçalho;
- codificação **ISO-8859-1** (latin-1), não UTF-8 — é o que o arquivo de
  referência traz;
- `TURMA` é `EM1BM`: segmento, série, turma e turno, **sem separador**. O arquivo
  de 2025 traz `EM-1ªB-M`, com hífens e ordinal, e é a única coisa dele que NÃO
  se copia — a nomenclatura oficial da escola hoje é a de cima, e quem disse foi
  a coordenação;
- `CONCEITO` com **ponto** decimal e uma casa, e sem o `.0` quando é inteiro:
  `2`, `1.4`, `0`. É a Nota Marista — o percentual de acerto na escala de 2
  pontos —, a mesma para todos os componentes escolhidos;
- `PERIODO` é sempre `0`;
- `COMPARECEU` é `S` ou `N`.

**A nota daqui vai para o histórico escolar.** É o único lugar deste projeto em
que um número sai do sistema e entra na vida acadêmica do estudante, e por isso a
exportação se recusa a acontecer enquanto houver marcação na fila de conferência:
nota provisória lançada no sistema acadêmico ninguém descobre que era provisória.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path

from .correcao import Resultado
from .pacote import Pacote

CABECALHO = ["ALUNO", "DISCIPLINA", "TURMA", "ANO", "PERIODO", "PROVA",
             "CONCEITO", "COMPARECEU"]

CODIFICACAO = "latin-1"

# O código da prova, como a coordenação o escreve: etapa e número da prova.
# `E3_P3` é a terceira prova da terceira etapa. Quem sabe qual é a prova é quem
# exporta — o sistema não tem como adivinhar o P.
PADRAO_DA_PROVA = re.compile(r"^E[1-9]_P[1-9][0-9]?$")

# Cada série é uma coluna da planilha de códigos da escola, e o que a planilha
# deixa em branco repete a coluna anterior — foi assim que ela chegou. A
# repetição está RESOLVIDA aqui, à mão, porque tabela que exige interpretação na
# hora da leitura é tabela que alguém vai interpretar diferente. `None` é
# componente que não existe naquela série: no 9º ano não há Biologia, há
# Ciências; na 1ª série é o contrário.
#
# O código completo tem nove algarismos: 225 (Marista Águas Claras) + segmento
# (02 fundamental, 03 médio) + série (9, 1, 2, 3) + os três daqui.
SERIES = ["9º ano", "1ª série EM", "2ª série EM", "3ª série EM"]

DISCIPLINAS: list[tuple[str, str, dict[str, str | None]]] = [
    # (área, nome como o sistema acadêmico o chama, código por série)
    ("Linguagens", "Língua Portuguesa", {"9º ano": "001", "1ª série EM": "001",
                                         "2ª série EM": "001", "3ª série EM": "001"}),
    ("Linguagens", "Literatura", {"9º ano": None, "1ª série EM": "065",
                                  "2ª série EM": "065", "3ª série EM": "065"}),
    ("Linguagens", "Produção textual", {"9º ano": "055", "1ª série EM": "055",
                                        "2ª série EM": "055", "3ª série EM": "055"}),
    ("Linguagens", "Língua Inglesa", {"9º ano": "074", "1ª série EM": "081",
                                      "2ª série EM": "083", "3ª série EM": "083"}),
    ("Linguagens", "Educação Física", {"9º ano": "003", "1ª série EM": "003",
                                       "2ª série EM": "003", "3ª série EM": "003"}),
    ("Linguagens", "Arte", {"9º ano": "015", "1ª série EM": "014",
                            "2ª série EM": "069", "3ª série EM": "071"}),
    ("Matemática", "Matemática", {"9º ano": "004", "1ª série EM": "004",
                                  "2ª série EM": "004", "3ª série EM": "004"}),
    ("Humanidades", "História", {"9º ano": "007", "1ª série EM": "007",
                                 "2ª série EM": "007", "3ª série EM": "007"}),
    ("Humanidades", "Geografia", {"9º ano": "008", "1ª série EM": "008",
                                  "2ª série EM": "008", "3ª série EM": "008"}),
    ("Humanidades", "Filosofia", {"9º ano": None, "1ª série EM": "013",
                                  "2ª série EM": "013", "3ª série EM": "013"}),
    ("Humanidades", "Sociologia", {"9º ano": None, "1ª série EM": "015",
                                   "2ª série EM": "015", "3ª série EM": "015"}),
    ("Humanidades", "Interioridade", {"9º ano": "076", "1ª série EM": "083",
                                      "2ª série EM": "084", "3ª série EM": "084"}),
    ("Humanidades", "Ensino Religioso", {"9º ano": "009", "1ª série EM": None,
                                         "2ª série EM": None, "3ª série EM": None}),
    ("Humanidades", "Processos Formativos", {"9º ano": None, "1ª série EM": "085",
                                             "2ª série EM": "085", "3ª série EM": "085"}),
    ("Ciências da Natureza", "Ciências", {"9º ano": "005", "1ª série EM": None,
                                          "2ª série EM": None, "3ª série EM": None}),
    ("Ciências da Natureza", "Biologia", {"9º ano": None, "1ª série EM": "016",
                                          "2ª série EM": "016", "3ª série EM": "016"}),
    ("Ciências da Natureza", "Física", {"9º ano": None, "1ª série EM": "017",
                                        "2ª série EM": "017", "3ª série EM": "017"}),
    ("Ciências da Natureza", "Química", {"9º ano": None, "1ª série EM": "018",
                                         "2ª série EM": "018", "3ª série EM": "018"}),
]

# `EM1BM`: segmento, série, turma e turno, sem separador nenhum. Quem já vem
# assim do elenco passa direto.
PADRAO_DA_TURMA = re.compile(r"^(EF|EM)\d[A-Z][MVN]$")
TURNOS = "MVN"

# Unidade, segmento e o algarismo da série, para montar o código de nove.
UNIDADE = "225"
SEGMENTOS = {"9º ano": ("02", "EF", "9º"), "1ª série EM": ("03", "EM", "1ª"),
             "2ª série EM": ("03", "EM", "2ª"), "3ª série EM": ("03", "EM", "3ª")}


class NaoDaParaExportar(Exception):
    """O que impede a exportação — dito na língua de quem vai resolver."""


def serie_do_pacote(pacote: Pacote) -> str:
    """A série da prova, no vocabulário das SERIES. Levanta se não reconhecer."""
    bruta = str(pacote.molde.prova.get("serie") or "").strip()
    if bruta in SEGMENTOS:
        return bruta
    # “1ª série”, “1a serie EM”, “9º”: o que importa é o algarismo e o segmento.
    normal = bruta.lower().replace("º", "").replace("ª", "").replace("°", "")
    for serie in SERIES:
        algarismo = SEGMENTOS[serie][2][0]
        eh_fundamental = SEGMENTOS[serie][1] == "EF"
        if normal.startswith(algarismo) and (("ano" in normal) == eh_fundamental):
            return serie
    raise NaoDaParaExportar(
        f"não reconheci a série “{bruta}” da prova. As séries com código de "
        f"disciplina são: {', '.join(SERIES)}.")


def disciplinas_da_serie(serie: str) -> list[tuple[str, str, str]]:
    """As disciplinas que existem nesta série: `(área, nome, código completo)`."""
    segmento, _sigla, rotulo = SEGMENTOS[serie]
    saida = []
    for area, nome, codigos in DISCIPLINAS:
        codigo = codigos.get(serie)
        if codigo:
            saida.append((area, nome, f"{UNIDADE}{segmento}{rotulo[0]}{codigo}"))
    return saida


def turma_oficial(turma: str, serie: str, turno: str = "M") -> str:
    """A turma na nomenclatura do sistema acadêmico: `EM1BM`.

    Segmento (EF/EM), série, turma e turno, **sem separador nenhum** — nem hífen,
    nem o ordinal. O arquivo de 2025 traz `EM-1ªB-M`; a coordenação corrigiu, e a
    nomenclatura oficial é esta.

    A turma do elenco é texto livre: a coordenação digita “1ª B”, “1B”, “1 B”. O
    sistema acadêmico não perdoa nenhuma delas. Quem já vier no formato dele
    passa intacta; do resto se aproveita a LETRA, e o segmento e a série saem da
    prova, que é onde eles estão certos por construção.
    """
    limpa = re.sub(r"[^0-9A-Z]", "",
                   (turma or "").upper().replace("ª", "").replace("º", ""))
    if PADRAO_DA_TURMA.match(limpa):
        return limpa
    _segmento, sigla, rotulo = SEGMENTOS[serie]
    # Tira o segmento, se veio junto: senão o “M” de “EM” entra na disputa pela
    # letra da turma, e “EM-1ªB-M” viraria EM1MM.
    corpo = limpa[2:] if limpa[:2] in ("EF", "EM") else limpa
    partes = re.split(r"\d", corpo, maxsplit=1)
    letras = re.findall(r"[A-Z]", partes[-1] if len(partes) > 1 else corpo)
    # Turma que já traz o turno colado (“1BM”): o último é o turno, não a turma.
    if len(letras) >= 2 and letras[-1] in TURNOS:
        letras = letras[:-1]
    return f"{sigla}{rotulo[0]}{letras[0] if letras else 'A'}{turno.upper()}"


def conceito(nota: float | None) -> str:
    """A nota como o arquivo de referência a escreve: `2`, `1.4`, `0`.

    Ponto decimal, uma casa, e sem o `.0` do inteiro — é o que o sistema
    acadêmico recebeu em 2025, e não há por que descobrir se ele aceita outra
    coisa com o histórico escolar de 900 pessoas na mesa.
    """
    texto = f"{max(0.0, nota or 0.0):.1f}"
    return texto[:-2] if texto.endswith(".0") else texto


def _impedimentos(resultados: list[Resultado]) -> list[str]:
    pendentes = sum(r.pendentes for r in resultados)
    if pendentes:
        return [f"{pendentes} marcação(ões) continuam na fila de conferência. Essa nota vai "
                f"para o histórico escolar: resolva a conferência no passo 3, clique em "
                f"“Aplicar e recorrigir”, e volte aqui."]
    return []


def linhas_do_arquivo(pacote: Pacote, resultados: list[Resultado], prova: str,
                      ano: int, disciplinas: list[str], turno: str = "M",
                      serie: str | None = None) -> list[list[str]]:
    """Uma linha por estudante e por disciplina escolhida, na ordem do elenco.

    A mesma nota vai para todas as disciplinas: a prova é uma só, e é assim que
    a escola a lança. Quem não fez a prova entra com `COMPARECEU=N` e conceito
    `0` — deixá-lo de fora faria o sistema acadêmico ficar sem notícia de quem
    faltou, e lançá-lo como presente com zero seria pior ainda.
    """
    prova = (prova or "").strip().upper()
    if not PADRAO_DA_PROVA.match(prova):
        raise NaoDaParaExportar(
            f"“{prova}” não é um código de prova. Ele diz a etapa e a prova, "
            f"como em E3_P3 — terceira prova da terceira etapa.")
    serie = serie or serie_do_pacote(pacote)
    impedimento = _impedimentos(resultados)
    if impedimento:
        raise NaoDaParaExportar(" ".join(impedimento))

    codigos = {nome: codigo for _area, nome, codigo in disciplinas_da_serie(serie)}
    escolhidas = []
    for nome in disciplinas:
        if nome not in codigos:
            raise NaoDaParaExportar(
                f"“{nome}” não tem código nesta série ({serie}). "
                f"Escolha entre: {', '.join(codigos)}.")
        if codigos[nome] not in [c for _n, c in escolhidas]:
            escolhidas.append((nome, codigos[nome]))
    if not escolhidas:
        raise NaoDaParaExportar("escolha ao menos um componente curricular.")

    por_matricula = {r.estudante.matricula: r for r in resultados}
    # Um bloco por disciplina, e dentro dele o elenco — é a ordem do arquivo que
    # a escola importou em 2025. O sistema acadêmico não deve se importar com a
    # ordem, mas “não deve” é o que se diz antes de descobrir que se importa.
    linhas = []
    for _nome, codigo in escolhidas:
        for estudante in pacote.elenco:
            resultado = por_matricula.get(estudante.matricula)
            fez = bool(resultado and resultado.tem_resposta
                       and resultado.nota_marista is not None)
            linhas.append([estudante.matricula, codigo,
                           turma_oficial(estudante.turma, serie, turno), str(ano), "0", prova,
                           conceito(resultado.nota_marista if fez else 0.0),
                           "S" if fez else "N"])
    return linhas


def escrever(caminho: Path, linhas: list[list[str]]) -> Path:
    """Grava o TXT no formato do sistema acadêmico. Devolve o caminho."""
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    # `newline=""` deixa o csv escrever o CRLF que ele mesmo pede — sem isso, o
    # Windows dobraria o \r e o arquivo sairia com linha em branco no meio.
    with caminho.open("w", encoding=CODIFICACAO, newline="", errors="replace") as arquivo:
        escritor = csv.writer(arquivo, delimiter=",", lineterminator="\r\n")
        escritor.writerow(CABECALHO)
        escritor.writerows(linhas)
    return caminho


def nome_sugerido(prova: str, serie: str) -> str:
    """`E3_P3-1serie.txt` — o que a secretaria reconhece na pasta de downloads."""
    curta = SEGMENTOS[serie][2][0] + ("ano" if SEGMENTOS[serie][1] == "EF" else "serie")
    return f"{prova.strip().upper()}-{curta}.txt"
