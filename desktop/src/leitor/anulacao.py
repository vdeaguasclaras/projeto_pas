"""Item anulado — a decisão que se toma DEPOIS de a prova ter sido aplicada.

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

A escolha é do lado de cá de propósito: ela acontece depois de o pacote ter sido
exportado — às vezes depois de os cartões já estarem digitalizados —, e quem a
toma está com o boletim para emitir na mão. Ela NÃO viaja de volta ao sistema
on-line: a tela de Correção de lá segue corrigindo sem a anulação.

**E ela fica lembrada ao lado do pacote.** Anular é decidir uma vez e valer para
todo o resto: quem abre o programa de novo no dia seguinte, para resolver uma
conferência, não pode depender de lembrar sozinho — nota errada por anulação
esquecida ninguém confere, descobre-se pelo estudante que reclama.
"""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

FORMATO = "pas-marista/anulados-v1"


def _apelido(prova: dict) -> str:
    """Um nome de arquivo que só tem letra, algarismo e traço."""
    bruto = str(prova.get("id") or prova.get("serie") or "prova")
    limpo = re.sub(r"[^A-Za-z0-9]+", "-", bruto).strip("-").lower()
    return limpo or "prova"


def caminho_de(caminho_do_pacote: Path, prova: dict) -> Path:
    """Onde ficam lembrados os itens anulados desta prova.

    Ao lado do pacote, e com o id da prova no nome: a secretaria roda mais de uma
    série no mesmo dia, da mesma pasta de downloads, e um arquivo só faria a
    anulação da 2ª série chegar à prova da 3ª.
    """
    return Path(caminho_do_pacote).parent / f"pas-anulados-{_apelido(prova)}.json"


def lembrados(caminho_do_pacote: Path, prova: dict,
              numeros: set[int]) -> tuple[set[int], list[str]]:
    """Lê o que ficou lembrado. Devolve `(itens, avisos)` — nunca levanta.

    `numeros` são os itens que existem nesta prova: item lembrado que não está
    mais nela sai da lista COM AVISO. Some calado seria pior — a pessoa anulou
    alguma coisa, e precisa saber que aquilo não vale mais.

    Arquivo ilegível também vira aviso, não exceção: o trabalho do dia não pode
    parar por causa dele, mas ninguém pode achar que nada estava anulado.
    """
    alvo = caminho_de(caminho_do_pacote, prova)
    if not alvo.exists():
        return set(), []
    try:
        dados = json.loads(alvo.read_text(encoding="utf-8"))
        brutos = {int(n) for n in (dados.get("itens") or [])}
    except (OSError, ValueError, TypeError) as erro:
        return set(), [f"não deu para ler os itens anulados de {alvo.name} ({erro}). "
                       f"Nenhum item está anulado — confira antes de emitir os boletins."]
    fora = sorted(brutos - numeros)
    avisos = []
    if fora:
        avisos.append(f"{alvo.name} lembra o(s) item(ns) {', '.join(str(n) for n in fora)}, "
                      f"que não existe(m) nesta prova — ficaram de fora.")
    return brutos & numeros, avisos


def lembrar(caminho_do_pacote: Path, prova: dict, itens: set[int]) -> Path:
    """Grava a escolha ao lado do pacote. Lista vazia apaga o arquivo."""
    alvo = caminho_de(caminho_do_pacote, prova)
    if not itens:
        alvo.unlink(missing_ok=True)
        return alvo
    alvo.write_text(json.dumps({
        "formato": FORMATO,
        "prova": {"id": prova.get("id"), "serie": prova.get("serie"),
                  "etapa": prova.get("etapa")},
        "itens": sorted(itens),
        "em": date.today().isoformat(),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return alvo


def em_texto(itens) -> str:
    """“12, 47” — como os itens anulados aparecem escritos em toda tela."""
    return ", ".join(str(n) for n in sorted(itens))


__all__ = ["FORMATO", "caminho_de", "lembrados", "lembrar", "em_texto"]
