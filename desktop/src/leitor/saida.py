"""O que sai do leitor: os CSVs e as miniaturas da fila de conferência.

Três arquivos, e cada um responde a uma pergunta diferente:

- `respostas.csv` — o que se leu sem dúvida. É este que entra no sistema web,
  em Correção e boletins → “Importar respostas (CSV do leitor)”.
- `respostas_conferir.csv` — o que NÃO se leu sem dúvida, com o motivo e, quando
  há, o palpite. Lançamento à mão, na mesma tela.
- `folhas.csv` — uma linha por página digitalizada. É o rastro: quantas folhas
  entraram, quais foram lidas, quais caíram fora e por quê. Sem ele, “12 folhas
  para conferência” é um número que não leva ninguém ao papel na pilha.

E as miniaturas: para toda página que precisa de olho humano, um PNG com o
cabeçalho recortado — o operador reconhece a folha sem procurar na pilha.
"""
from __future__ import annotations

import csv
from pathlib import Path

import cv2
import numpy as np

from .ancoras import em_pixels
from .leitura import Leitura


def _escrever(caminho: Path, cabecalho: list[str], linhas: list[list]) -> int:
    with caminho.open("w", encoding="utf-8", newline="") as arquivo:
        escritor = csv.writer(arquivo, delimiter=";", lineterminator="\n")
        escritor.writerow(cabecalho)
        escritor.writerows(linhas)
    return len(linhas)


def respostas(pasta: Path, leituras: list[Leitura]) -> int:
    linhas = [[l.matricula, m.item, m.resposta]
              for l in leituras for m in l.respostas if l.matricula]
    return _escrever(pasta / "respostas.csv", ["matricula", "item", "resposta"], linhas)


def conferir(pasta: Path, leituras: list[Leitura]) -> int:
    linhas = []
    for l in leituras:
        for m in l.conferir:
            linhas.append([l.matricula, m.item, m.resposta, m.motivo or "", l.onde])
        # Página que nem chegou a ter item: a recusa é da folha inteira, e ela
        # também precisa aparecer aqui — senão sai do relatório sem sair da pilha.
        if not l.conferir and l.situacao not in ("lida", "referencia"):
            linhas.append([l.matricula, "", "", l.motivo or l.situacao, l.onde])
    return _escrever(pasta / "respostas_conferir.csv",
                     ["matricula", "item", "resposta", "motivo", "folha"], linhas)


def percentuais(pasta: Path, leituras: list[Leitura]) -> int:
    """As bolhas de percentual da folha discursiva — marcadas por quem corrige.

    Ficam num arquivo próprio porque não são resposta de estudante. O sistema web
    ainda não as importa (o lançamento do discursivo é por nota, na tela de
    Correção); o arquivo sai porque o dado foi lido e jogá-lo fora seria pedir
    que alguém o digitasse de novo.
    """
    linhas = [[l.matricula, m.item, m.resposta]
              for l in leituras for m in l.percentuais if l.matricula]
    if not linhas:
        return 0
    return _escrever(pasta / "percentuais.csv", ["matricula", "item", "percentual"], linhas)


def folhas(pasta: Path, leituras: list[Leitura]) -> int:
    linhas = []
    for l in leituras:
        i = l.identificacao
        linhas.append([
            l.onde, l.situacao,
            i.tipo if i else "", i.versao if i else "",
            i.folha if i else "", i.total if i else "",
            l.matricula, len(l.respostas), len(l.conferir), l.motivo,
        ])
    return _escrever(pasta / "folhas.csv",
                     ["folha", "situacao", "tipo", "versao", "numero", "total",
                      "matricula", "lidas", "a_conferir", "motivo"], linhas)


def miniatura(pasta: Path, cinza: np.ndarray, matriz, campo: dict | None,
              nome: str) -> Path | None:
    """Recorta o cabeçalho da folha para o operador reconhecê-la.

    Com a homografia, recorta o campo da matrícula impressa; sem ela — que é
    justamente o caso `sem_ancoras` —, salva a página inteira reduzida, que é o
    que sobra para identificar o papel.
    """
    pasta.mkdir(parents=True, exist_ok=True)
    alvo = pasta / f"{nome}.png"
    if matriz is not None and campo:
        folga = 6.0
        cantos = em_pixels(matriz, [
            (campo["x"] - folga, campo["y"] - folga),
            (campo["x"] + campo["largura"] + folga, campo["y"] - folga),
            (campo["x"] + campo["largura"] + folga, campo["y"] + campo["altura"] + folga),
            (campo["x"] - folga, campo["y"] + campo["altura"] + folga)])
        x0, y0 = np.floor(cantos.min(axis=0)).astype(int)
        x1, y1 = np.ceil(cantos.max(axis=0)).astype(int)
        altura, largura = cinza.shape[:2]
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(largura, x1), min(altura, y1)
        if x1 - x0 > 10 and y1 - y0 > 10:
            cv2.imwrite(str(alvo), cinza[y0:y1, x0:x1])
            return alvo
    reduzida = cv2.resize(cinza, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(alvo), reduzida)
    return alvo
