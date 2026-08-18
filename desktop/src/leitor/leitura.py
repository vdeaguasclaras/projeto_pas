"""A leitura de uma folha: da homografia à resposta — ou à recusa.

A regra que manda em tudo aqui é a do critério de aceite da v1: **zero resposta
inventada**. Alvéolo ambíguo, dupla marcação, faixa que não fecha o CRC, tipo B
com uma coluna em branco — nada disso vira resposta. Vai para a fila de
conferência, com o motivo, e alguém lança à mão. A prova de um estudante lançada
errada custa mais do que dez folhas conferidas à mão.

O limiar de “alvéolo preenchido” não é escolhido no escuro. O lote sai da
impressora com um CARTÃO-GABARITO na frente — uma folha em que se sabe, alvéolo
por alvéolo, o que devia estar marcado. É dela que sai o limiar desta impressora
e deste scanner (`calibrar`), e é ela que denuncia, antes de o lote inteiro ser
lançado, que a chave exportada não corresponde ao papel (`conferir_referencia`).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .ancoras import em_pixels
from .codigo import CELULAS, FaixaIlegivel, Identificacao, decodificar
from .molde import Alveolo, Folha, Molde

# Sem folha de referência, estes são os limiares de partida. Um alvéolo
# preenchido a caneta passa de 90%; um vazio fica perto de zero, porque a
# amostra é o MIOLO do círculo e o anel impresso fica de fora.
CHEIO_PADRAO = 0.55
VAZIO_PADRAO = 0.25

# Quanto do raio do alvéolo entra na amostra. O anel impresso é rosa, que em
# tons de cinza é escuro; medi-lo junto acusaria alvéolo cheio em folha limpa.
FRACAO_DO_RAIO = 0.55


@dataclass
class Marcacao:
    item: int
    resposta: str
    motivo: str | None = None


@dataclass
class Limiares:
    cheio: float = CHEIO_PADRAO
    vazio: float = VAZIO_PADRAO
    origem: str = "padrão"

    def __str__(self) -> str:
        return f"cheio ≥ {self.cheio:.0%} · vazio ≤ {self.vazio:.0%} ({self.origem})"


@dataclass
class Leitura:
    onde: str
    situacao: str                       # lida · conferir · descartada
    identificacao: Identificacao | None = None
    respostas: list[Marcacao] = field(default_factory=list)
    conferir: list[Marcacao] = field(default_factory=list)
    percentuais: list[Marcacao] = field(default_factory=list)
    motivo: str = ""
    voltas: int = 0            # quartos de volta que foi preciso dar na página

    @property
    def matricula(self) -> str:
        return self.identificacao.matricula if self.identificacao else ""


# ---------------------------------------------------------------- amostragem

def limiar_de_tinta(cinza: np.ndarray) -> float:
    """O nível de cinza abaixo do qual há tinta, nesta digitalização.

    Medido contra o PAPEL desta folha, não contra um valor absoluto: scanner
    escuro, papel amarelado e digitalização clara mudam a escala inteira, e um
    limiar fixo acertaria numa e erraria na seguinte.
    """
    papel = float(np.percentile(cinza, 90))
    return max(40.0, papel * 0.55)


def _proporcoes(cinza: np.ndarray, matriz: np.ndarray, alveolos: list[Alveolo],
                limiar: float) -> list[float]:
    """Que fração do miolo de cada alvéolo está com tinta."""
    if not alveolos:
        return []
    centros = em_pixels(matriz, [(a.x, a.y) for a in alveolos])
    bordas = em_pixels(matriz, [(a.x + a.r * FRACAO_DO_RAIO, a.y) for a in alveolos])
    altura, largura = cinza.shape[:2]
    saida = []
    for (cx, cy), (bx, by) in zip(centros, bordas):
        raio = max(1.5, float(np.hypot(bx - cx, by - cy)))
        x0, x1 = int(round(cx - raio)), int(round(cx + raio)) + 1
        y0, y1 = int(round(cy - raio)), int(round(cy + raio)) + 1
        if x0 < 0 or y0 < 0 or x1 > largura or y1 > altura:
            saida.append(float("nan"))      # alvéolo fora da página digitalizada
            continue
        recorte = cinza[y0:y1, x0:x1]
        ys, xs = np.ogrid[y0:y1, x0:x1]
        dentro = (xs - cx) ** 2 + (ys - cy) ** 2 <= raio ** 2
        saida.append(float(((recorte < limiar) & dentro).sum() / max(1, dentro.sum())))
    return saida


def _decidir(valores: dict, proporcoes: list[float], lim: Limiares):
    """De um grupo de alvéolos a uma resposta — ou a um motivo para não dar uma.

    Devolve `(resposta, motivo)`. Resposta sem motivo é leitura limpa; motivo
    sem resposta é recusa; os dois juntos são um palpite que vai para a
    conferência com o nome de palpite, para o operador confirmar de olho.
    """
    chaves = list(valores)
    if any(np.isnan(p) for p in proporcoes):
        return None, "fora_da_pagina"
    cheios = [k for k, p in zip(chaves, proporcoes) if p >= lim.cheio]
    duvidosos = [k for k, p in zip(chaves, proporcoes) if lim.vazio < p < lim.cheio]
    if len(cheios) > 1:
        return None, "dupla_marcacao"
    if len(cheios) == 1 and duvidosos:
        # Uma marca firme e um borrão ao lado: quase sempre resposta rasurada.
        # O valor firme vai junto, como palpite — quem decide é quem confere.
        return cheios[0], "leitura_duvidosa"
    if len(cheios) == 1:
        return cheios[0], None
    if duvidosos:
        return (duvidosos[0] if len(duvidosos) == 1 else None), "leitura_duvidosa"
    return None, None                      # em branco: não gera linha nenhuma


# ------------------------------------------------------------- faixa e folha

def ler_faixa(cinza: np.ndarray, matriz: np.ndarray, molde: Molde,
              limiar: float) -> Identificacao:
    """As células do rodapé, lidas e traduzidas. Levanta `FaixaIlegivel`."""
    if len(molde.codigo) != CELULAS:
        raise FaixaIlegivel(
            f"o molde traz {len(molde.codigo)} células e o leitor espera {CELULAS} — "
            "gabarito e leitor estão em versões diferentes")
    # A célula é retangular; amostra-se o miolo dela, com folga para a borda.
    falsos = [Alveolo(x, y, min(molde.codigo_largura, molde.codigo_altura) / 2)
              for x, y in molde.codigo]
    proporcoes = _proporcoes(cinza, matriz, falsos, limiar)
    if any(np.isnan(p) for p in proporcoes):
        raise FaixaIlegivel("a faixa do rodapé caiu fora da página digitalizada")
    return decodificar([1 if p >= 0.5 else 0 for p in proporcoes])


def _ler_objetiva(cinza, matriz, folha: Folha, limiar: float,
                  lim: Limiares, leitura: Leitura) -> None:
    for numero in sorted(folha.itens):
        valores = folha.itens[numero]
        resposta, motivo = _decidir(valores, _proporcoes(cinza, matriz, list(valores.values()),
                                                         limiar), lim)
        if motivo:
            leitura.conferir.append(Marcacao(numero, resposta or "", motivo))
        elif resposta:
            leitura.respostas.append(Marcacao(numero, resposta))

    for numero in sorted(folha.tipo_b):
        colunas = folha.tipo_b[numero]
        algarismos, motivos = [], []
        for coluna in ("C", "D", "U"):
            digitos = colunas.get(coluna, {})
            resposta, motivo = _decidir(digitos, _proporcoes(cinza, matriz, list(digitos.values()),
                                                             limiar), lim)
            algarismos.append(str(resposta) if resposta is not None else "")
            if motivo:
                motivos.append(f"{coluna}:{motivo}")
        preenchidas = [a for a in algarismos if a != ""]
        if not preenchidas and not motivos:
            continue                                    # item em branco
        if motivos:
            leitura.conferir.append(Marcacao(numero, "".join(algarismos), ";".join(motivos)))
        elif len(preenchidas) < 3:
            # Número pela metade não é resposta: `9__` tanto pode ser 900 quanto
            # 960. Vai inteiro para a conferência, com o que se conseguiu ler.
            leitura.conferir.append(
                Marcacao(numero, "".join(a or "_" for a in algarismos), "tipo_b_incompleto"))
        else:
            leitura.respostas.append(Marcacao(numero, "".join(algarismos)))


def _ler_matricula(cinza, matriz, folha: Folha, limiar: float,
                   lim: Limiares, formato) -> tuple[str, str]:
    """A matrícula em alvéolos do cartão extra. Devolve `(matrícula, motivo)`."""
    algarismos, duvida = [], ""
    for posicao in sorted(folha.matricula):
        digitos = folha.matricula[posicao]
        resposta, motivo = _decidir(digitos, _proporcoes(cinza, matriz, list(digitos.values()),
                                                         limiar), lim)
        if motivo:
            duvida = duvida or f"matricula_{motivo}"
        algarismos.append("" if resposta is None else str(resposta))
    # Posição em branco no meio da matrícula é ambiguidade, não abreviação:
    # não dá para saber se o estudante pulou a casa ou deixou de preencher.
    miolo = "".join(algarismos).strip()
    if not duvida and any(a == "" for a in algarismos[
            next((i for i, a in enumerate(algarismos) if a), 0):
            len(algarismos) - next((i for i, a in enumerate(reversed(algarismos)) if a), 0)]):
        duvida = "matricula_com_vao"
    # E a última conferência possível: a matrícula lida parece da escola?
    # Aqui não há CRC — o que sai destes alvéolos é leitura óptica pura —, e o
    # formato (nove algarismos começando em 225) é o que separa “o estudante
    # preencheu” de “o leitor entendeu um algarismo a mais”.
    if not duvida and miolo:
        duvida = formato.recusa(miolo)
    return miolo, duvida


def ler_folha(cinza: np.ndarray, matriz: np.ndarray, molde: Molde,
              ident: Identificacao, lim: Limiares, onde: str) -> Leitura:
    """Lê uma folha já identificada e alinhada."""
    limiar = limiar_de_tinta(cinza)
    leitura = Leitura(onde=onde, situacao="lida", identificacao=ident)
    folha = molde.folha(ident.versao, ident.molde, ident.folha)
    if folha is None:
        leitura.situacao = "conferir"
        leitura.motivo = (f"a faixa diz folha {ident.folha} da versão {ident.versao}, "
                          "e o molde não tem essa folha")
        return leitura
    if not folha.tem_alveolo:
        return leitura                       # folha de redação: nada a ler

    if folha.matricula:
        matricula, duvida = _ler_matricula(cinza, matriz, folha, limiar, lim,
                                           molde.formato_matricula)
        if duvida or not matricula:
            leitura.situacao = "conferir"
            leitura.motivo = duvida or "matricula_em_branco"
        else:
            leitura.identificacao = ident = Identificacao(
                ident.versao, ident.tipo, ident.folha, ident.total, matricula)

    _ler_objetiva(cinza, matriz, folha, limiar, lim, leitura)

    for numero in sorted(folha.percentuais):
        opcoes = folha.percentuais[numero]
        resposta, motivo = _decidir(opcoes, _proporcoes(cinza, matriz, list(opcoes.values()),
                                                        limiar), lim)
        if resposta is not None and not motivo:
            leitura.percentuais.append(Marcacao(numero, str(resposta)))
        elif motivo:
            leitura.conferir.append(Marcacao(numero, str(resposta or ""), f"percentual_{motivo}"))

    if leitura.conferir and leitura.situacao == "lida":
        # Sem motivo de folha: quem explica são as linhas de item, logo abaixo,
        # cada uma com o seu. `motivo` fica reservado ao que impediu a FOLHA de
        # ser lida — é ele que manda o operador procurar o papel na pilha.
        leitura.situacao = "conferir"

    # Folha lida e sem dono — o cartão extra cuja matrícula não fechou. As
    # marcações não podem ir para `respostas.csv`, que é indexado por matrícula,
    # e jogá-las fora seria pedir que alguém as digitasse de novo olhando o
    # papel. Vão inteiras para a conferência: o operador identifica o estudante
    # uma vez e lança o que já está lido.
    # O cartão-gabarito fica de fora: ele também não tem matrícula, e o que está
    # marcado nele é o gabarito, não a resposta de ninguém.
    if not leitura.matricula and not ident.eh_referencia and leitura.respostas:
        leitura.conferir.extend(
            Marcacao(m.item, m.resposta, "folha_sem_matricula") for m in leitura.respostas)
        leitura.respostas.clear()
    return leitura


# ------------------------------------------------------------- a referência

def calibrar(cinza: np.ndarray, matriz: np.ndarray, molde: Molde,
             ident: Identificacao) -> tuple[Limiares, list[str]]:
    """Tira o limiar desta impressora e deste scanner do cartão-gabarito.

    Mede a tinta de todos os alvéolos da folha de referência e separa em dois
    grupos — os que o gabarito manda marcar e os demais. Se os dois grupos se
    separam bem, o limiar vai para o meio do vão entre eles; se não se separam,
    o limiar medido seria pior que o padrão, e o padrão fica.

    Devolve também as divergências: alvéolo que devia estar marcado e não está,
    ou o contrário. Divergência aqui quase nunca é do scanner — é a chave
    exportada não corresponder ao papel que foi impresso.
    """
    folha = molde.folha(ident.versao, ident.molde, ident.folha)
    if folha is None or not folha.itens and not folha.tipo_b:
        return Limiares(), []

    limiar = limiar_de_tinta(cinza)
    esperados, medidos, divergencias = [], [], []

    def medir(alveolos: dict, marcado_certo) -> None:
        chaves = list(alveolos)
        props = _proporcoes(cinza, matriz, list(alveolos.values()), limiar)
        for chave, prop in zip(chaves, props):
            if np.isnan(prop):
                continue
            esperados.append(bool(marcado_certo(chave)))
            medidos.append(prop)

    for numero, valores in folha.itens.items():
        chave = molde.gabarito.get((ident.versao, numero))
        medir(valores, lambda v, chave=chave: chave is not None and str(chave).strip().upper() == v)
    for numero, colunas in folha.tipo_b.items():
        chave = molde.gabarito.get((ident.versao, numero))
        numero_certo = "".join(c for c in str(chave or "") if c.isdigit()).rjust(3, "0")[-3:]
        for indice, coluna in enumerate(("C", "D", "U")):
            medir(colunas.get(coluna, {}),
                  lambda d, i=indice: chave is not None and numero_certo[i] == str(d))

    marcados = [p for p, e in zip(medidos, esperados) if e]
    vazios = [p for p, e in zip(medidos, esperados) if not e]
    lim = Limiares()
    if marcados and vazios:
        # Percentis, e não o mínimo e o máximo: basta UM item divergente entre a
        # chave exportada e o papel — um alvéolo que devia estar cheio e está
        # vazio — para o mínimo dos marcados cair a zero, o vão entre os grupos
        # sumir e o limiar do lote inteiro ir junto. O que se quer aqui é onde
        # ficam os dois grupos, não onde fica o pior caso de cada um; a
        # divergência é denunciada logo abaixo, à parte, que é o lugar dela.
        piso = float(np.percentile(marcados, 10))
        teto = float(np.percentile(vazios, 90))
        if piso > teto + 0.15:
            lim = Limiares(cheio=round((piso + teto) / 2, 3), vazio=round(teto + 0.02, 3),
                           origem="medido no cartão-gabarito")
        else:
            divergencias.append(
                f"a tinta do cartão-gabarito não separa marcado de vazio "
                f"(marcados a partir de {piso:.0%}, vazios até {teto:.0%}) — "
                "seguindo com o limiar padrão")

    # E agora a conferência que só esta folha permite: o que está impresso é o
    # mesmo que o gabarito exportado diz?
    for numero, valores in sorted(folha.itens.items()):
        chave = molde.gabarito.get((ident.versao, numero))
        resposta, motivo = _decidir(valores, _proporcoes(cinza, matriz, list(valores.values()), limiar), lim)
        if chave is None:
            continue
        if motivo or resposta != str(chave).strip().upper():
            divergencias.append(
                f"item {numero}: o gabarito exportado diz “{chave}” e o cartão-gabarito "
                f"impresso mostra “{resposta or motivo}”")
    return lim, divergencias
