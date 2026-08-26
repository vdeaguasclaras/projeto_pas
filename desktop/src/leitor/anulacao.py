"""Item anulado — a decisão que a coordenação toma depois da aplicação.

Item com defeito de formulação, ou sem alternativa correta, é anulado: a
pontuação dele vale para **todos** os estudantes, como se todos o tivessem
acertado, e o boletim tem de dizer quais itens foram esses. Sem a marca, o
estudante lê que acertou um item que ninguém acertou — e não é isso que
aconteceu no papel.

**Duas coisas neste aplicativo se chamavam “anulado”, e não são a mesma.** Vale
para todo este módulo e para quem for mexer na correção:

- **item anulado** — quem anulou foi a COORDENAÇÃO, e vale para a prova inteira.
  É o que está aqui. Conta como acerto para todo mundo, e sai com `*`;
- **dupla marcação** — quem anulou foi o ESTUDANTE, marcando duas alternativas
  na mesma linha. Vale só para ele, conta como erro, e sai com `N`. É o `NULO`
  de `correcao.py`, e continua sendo o que a fila de conferência propõe.

DE ONDE ELA VEM, E POR QUE DE DOIS LUGARES

A anulação nasce no sistema on-line, na tela de Correção, e viaja DENTRO do
pacote da prova (`anulado: true` em cada item de `versoes`). É de lá que ela deve
vir: o sistema também corrige, e as duas correções têm de dizer a mesma coisa.

Mas ela também se marca aqui, e por um motivo prático: a decisão de anular
costuma vir depois da prova aplicada — às vezes com o lote já digitalizado e o
pacote já exportado. Quem está com o boletim para emitir não pode depender de
alguém reexportar o arquivo. O que se marca deste lado fica lembrado num arquivo
ao lado do pacote e SOMA-SE ao que veio dele; o que veio do pacote não se
desmarca aqui — desanular é decisão do sistema, e desfazê-la em silêncio de um
lado só faria a mesma prova valer notas diferentes conforme quem a corrigiu.

A CHAVE É (VERSÃO, NÚMERO) — NUNCA O NÚMERO SOZINHO

Cada versão da prova numera os seus itens de 1 a N. A adaptada tem menos itens,
então o item que é o 12 na regular pode ser o 10 na adaptada — anular “o item 12”
nas duas anularia coisas diferentes. Quem sabe que dois números são o mesmo item
é o `id` que o pacote passou a trazer; é por ele que a tela agrupa as duas
versões numa linha só.
"""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

FORMATO = "pas-marista/anulados-v1"

# Item anulado, como ele é chamado em toda tela: “A1 nº 12”. `A1` e `A2` são os
# códigos impressos no cartão e no caderno — “adaptada” é palavra de bastidor.
CODIGO_DA_VERSAO = {"regular": "A1", "adaptada": "A2"}


def rotulo(versao: str, numero: int) -> str:
    return f"{CODIGO_DA_VERSAO.get(versao, versao)} nº {numero}"


# A regular vem primeiro em toda lista — é a prova da maioria, e é por ela que a
# coordenação chama o item. Ordenar pelo par cru poria a adaptada na frente, por
# acaso do alfabeto.
ORDEM_DA_VERSAO = {"regular": 0, "adaptada": 1}


def em_texto(itens) -> str:
    """“A1 nº 3 · A1 nº 7 · A2 nº 3” — a lista como ela aparece escrita."""
    ordenados = sorted(itens, key=lambda par: (ORDEM_DA_VERSAO.get(par[0], 9), par[1]))
    return " · ".join(rotulo(v, n) for v, n in ordenados)


def _apelido(prova: dict) -> str:
    """Um nome de arquivo que só tem letra, algarismo e traço."""
    bruto = str(prova.get("id") or prova.get("serie") or "prova")
    limpo = re.sub(r"[^A-Za-z0-9]+", "-", bruto).strip("-").lower()
    return limpo or "prova"


def caminho_de(caminho_do_pacote: Path, prova: dict) -> Path:
    """Onde ficam lembrados os itens anulados AQUI, desta prova.

    Ao lado do pacote, e com o id da prova no nome: a secretaria roda mais de uma
    série no mesmo dia, da mesma pasta de downloads, e um arquivo só faria a
    anulação da 2ª série chegar à prova da 3ª.
    """
    return Path(caminho_do_pacote).parent / f"pas-anulados-{_apelido(prova)}.json"


def _par(bruto) -> tuple[str, int] | None:
    """Uma entrada do arquivo virando `(versão, número)`, ou None se não for."""
    if not isinstance(bruto, dict):
        return None
    versao = "adaptada" if bruto.get("versao") == "adaptada" else "regular"
    try:
        return versao, int(bruto["numero"])
    except (KeyError, TypeError, ValueError):
        return None


def lembrados(caminho_do_pacote: Path, prova: dict,
              validos: set[tuple[str, int]]) -> tuple[set[tuple[str, int]], list[str]]:
    """Lê o que ficou lembrado aqui. Devolve `(itens, avisos)` — nunca levanta.

    `validos` são os `(versão, número)` que existem nesta prova: item lembrado
    que não está mais nela sai da lista COM AVISO. Some calado seria pior — a
    pessoa anulou alguma coisa, e precisa saber que aquilo não vale mais.

    Arquivo ilegível também vira aviso, não exceção: o trabalho do dia não pode
    parar por causa dele, mas ninguém pode achar que nada estava anulado.
    """
    alvo = caminho_de(caminho_do_pacote, prova)
    if not alvo.exists():
        return set(), []
    try:
        dados = json.loads(alvo.read_text(encoding="utf-8"))
        brutos = {p for p in (_par(b) for b in (dados.get("itens") or [])) if p}
    except (OSError, ValueError, TypeError) as erro:
        return set(), [f"não deu para ler os itens anulados de {alvo.name} ({erro}). "
                       f"Vale só o que vier no pacote — confira antes de emitir os boletins."]
    fora = brutos - validos
    avisos = []
    if fora:
        avisos.append(f"{alvo.name} lembra {em_texto(fora)}, que não existe(m) nesta prova — "
                      f"ficaram de fora.")
    return brutos & validos, avisos


def lembrar(caminho_do_pacote: Path, prova: dict, itens: set[tuple[str, int]]) -> Path:
    """Grava a escolha feita AQUI, ao lado do pacote. Lista vazia apaga o arquivo.

    Só entra o que foi marcado deste lado: o que veio dentro do pacote já volta
    com ele, e guardá-lo aqui também o deixaria anulado depois de o sistema o
    desanular.
    """
    alvo = caminho_de(caminho_do_pacote, prova)
    if not itens:
        alvo.unlink(missing_ok=True)
        return alvo
    alvo.write_text(json.dumps({
        "formato": FORMATO,
        "prova": {"id": prova.get("id"), "serie": prova.get("serie"),
                  "etapa": prova.get("etapa")},
        "itens": [{"versao": v, "numero": n} for v, n in sorted(itens)],
        "em": date.today().isoformat(),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return alvo


__all__ = ["FORMATO", "CODIGO_DA_VERSAO", "ORDEM_DA_VERSAO", "rotulo", "em_texto",
           "caminho_de", "lembrados", "lembrar"]
