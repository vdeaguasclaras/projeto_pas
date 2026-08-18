"""As quatro âncoras e a homografia que põe a folha no lugar.

O cartão traz quatro quadrados pretos de 9pt — dois no alto, dois no rodapé — e
eles estão SEMPRE na mesma posição, em toda folha de todo cartão. Isso não é
coincidência: a exportação do gabarito confere e se recusa a exportar se algum
dia deixarem de estar (`mapaDoCartao`, js/app.js). É essa invariância que permite
alinhar a folha ANTES de saber que folha é — só depois de alinhada é que dá para
ler a faixa do rodapé, que é quem diz de quem é o papel.

Achar as âncoras é o passo que separa “digitalização torta” de “digitalização
inútil”: com elas, rotação, escala e a perspectiva de um papel mal encostado no
vidro somem numa homografia. Sem elas, não há o que fazer, e a página vai para a
fila de conferência com `sem_ancoras` em vez de render marcações inventadas.
"""
from __future__ import annotations

import cv2
import numpy as np

LADO_PT = 9.0          # o quadrado impresso
TOLERANCIA_LADO = (0.65, 1.45)
PROPORCAO_MINIMA = 0.86   # área / área da caixa: quadrado ~1, círculo ~0,79


class SemAncoras(Exception):
    """Não deu para achar as quatro âncoras nesta página."""


def _candidatos(cinza: np.ndarray, escala: float) -> np.ndarray:
    """Manchas sólidas, quadradas e do tamanho da âncora."""
    borrado = cv2.GaussianBlur(cinza, (3, 3), 0)
    _, preto = cv2.threshold(borrado, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
    n, _, stats, centroides = cv2.connectedComponentsWithStats(preto, connectivity=8)

    lado = LADO_PT * escala
    minimo, maximo = lado * TOLERANCIA_LADO[0], lado * TOLERANCIA_LADO[1]
    achados = []
    for i in range(1, n):
        x, y, largura, altura, area = stats[i]
        if not (minimo <= largura <= maximo and minimo <= altura <= maximo):
            continue
        # Alvéolo preenchido tem quase o mesmo tamanho da âncora, e é redondo:
        # a proporção entre a mancha e a caixa que a contém é o que os separa
        # (~0,79 no círculo, ~1 no quadrado). Sem este teste, o cartão-gabarito
        # — que sai com dezenas de alvéolos cheios — viraria um campo minado de
        # âncoras falsas.
        if area / float(largura * altura) < PROPORCAO_MINIMA:
            continue
        if not 0.8 <= largura / float(altura) <= 1.25:
            continue
        achados.append(centroides[i])
    return np.array(achados, dtype=np.float32)


def _quatro_cantos(pontos: np.ndarray) -> np.ndarray:
    """Os quatro extremos, na ordem: alto-esq, alto-dir, baixo-esq, baixo-dir.

    Pelas somas e diferenças das coordenadas — funciona com a folha deslocada e
    girada alguns graus, que é como o papel sai do alimentador.
    """
    soma, diferenca = pontos[:, 0] + pontos[:, 1], pontos[:, 0] - pontos[:, 1]
    return np.array([
        pontos[np.argmin(soma)],        # alto-esquerda
        pontos[np.argmax(diferenca)],   # alto-direita
        pontos[np.argmin(diferenca)],   # baixo-esquerda
        pontos[np.argmax(soma)],        # baixo-direita
    ], dtype=np.float32)


def _plausivel(cantos: np.ndarray, referencia: np.ndarray) -> bool:
    """O quadrilátero achado tem a forma do quadrilátero impresso?

    Quatro manchas quadradas quaisquer também dão um quadrilátero. O que faz
    destas quatro AS âncoras é a proporção entre a largura e a altura do
    retângulo que elas formam — a mesma do cartão, a menos da inclinação com que
    o papel entrou.
    """
    if len({tuple(c) for c in cantos}) != 4:
        return False
    largura = (np.linalg.norm(cantos[1] - cantos[0]) + np.linalg.norm(cantos[3] - cantos[2])) / 2
    altura = (np.linalg.norm(cantos[2] - cantos[0]) + np.linalg.norm(cantos[3] - cantos[1])) / 2
    if largura < 1 or altura < 1:
        return False
    esperada = (np.linalg.norm(referencia[1] - referencia[0]) /
                np.linalg.norm(referencia[2] - referencia[0]))
    return abs((largura / altura) / esperada - 1) <= 0.12


def homografia(cinza: np.ndarray, referencia: list[tuple[float, float]]) -> np.ndarray:
    """A matriz que leva PONTOS da folha a PIXELS desta digitalização.

    A escala é estimada pela largura da página em pixels contra os 595pt da
    folha: serve só para saber de que tamanho procurar a âncora, e uma
    digitalização com margem sobrando ainda cai dentro da tolerância.
    """
    ref = np.array(referencia, dtype=np.float32)
    escala = cinza.shape[1] / 595.0
    pontos = _candidatos(cinza, escala)
    if len(pontos) < 4:
        raise SemAncoras(f"achei {len(pontos)} âncora(s) candidata(s), e são precisas 4")
    cantos = _quatro_cantos(pontos)
    if not _plausivel(cantos, ref):
        raise SemAncoras("as quatro manchas achadas não formam o retângulo do cartão")
    return cv2.getPerspectiveTransform(ref, cantos)


def em_pixels(matriz: np.ndarray, pontos_pt) -> np.ndarray:
    """Converte pontos da folha (pt) para pixels da digitalização."""
    origem = np.array([[list(p) for p in pontos_pt]], dtype=np.float32)
    return cv2.perspectiveTransform(origem, matriz)[0]
