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

# Limiares de partida, para quando a folha não tiver o que dizer sobre si.
# Medidos em cartão preenchido à mão, digitalizado na escola: o alvéolo vazio
# fica abaixo de 20% (a amostra é o MIOLO do círculo, e o anel impresso fica de
# fora), e a marca a caneta vai de 30% a 100% conforme a pressão de quem
# escreve. **Caneta não é toner**: a marca impressa do cartão-gabarito passa de
# 80% sempre, e uma régua tirada dela ficaria alta demais para gente.
CHEIO_PADRAO = 0.45
VAZIO_PADRAO = 0.20

# O vão mínimo entre os dois grupos para a folha poder ditar a própria régua.
VAO_MINIMO = 0.12

# Quanto do raio do alvéolo entra na amostra. O anel impresso é rosa, que em
# tons de cinza é escuro; medi-lo junto acusaria alvéolo cheio em folha limpa.
FRACAO_DO_RAIO = 0.55


@dataclass
class Marcacao:
    item: int
    resposta: str
    motivo: str | None = None
    # O retângulo desta marcação na folha, em pontos. É por ele que a saída
    # recorta a imagem do que ficou em dúvida: quem confere precisa VER o
    # alvéolo, e não apenas ler que ele estava duvidoso.
    caixa: tuple[float, float, float, float] | None = None


@dataclass
class Limiares:
    cheio: float = CHEIO_PADRAO
    vazio: float = VAZIO_PADRAO
    origem: str = "padrão"

    def __str__(self) -> str:
        return f"cheio ≥ {self.cheio:.0%} · vazio ≤ {self.vazio:.0%} ({self.origem})"


def limiares_da_folha(proporcoes: list[float], herdados: Limiares) -> Limiares:
    """A régua tirada da PRÓPRIA folha, pelo vão entre marcado e vazio.

    Numa folha preenchida, os alvéolos formam dois grupos bem separados: os
    vazios, todos juntos lá embaixo, e os marcados, espalhados mais acima
    conforme a pressão de quem escreveu. Entre os dois há um vão sem ninguém.
    Achar esse vão e pôr a régua nele vale mais do que qualquer número escolhido
    de fora, porque ele mede ESTA folha — esta caneta, esta pressão, esta
    passagem pelo scanner.

    Foi o que a primeira digitalização de verdade mostrou. Duas folhas do mesmo
    lote, preenchidas por pessoas diferentes: numa, as marcas passavam de 80%;
    na outra, a maioria ficava entre 45% e 60%. Uma régua só para as duas
    manda dezenas de marcações legítimas para a conferência — e foi o que
    aconteceu, porque a régua vinha do cartão-gabarito, cujas marcas são de
    TONER e passam de 80% sempre.

    A margem em volta do vão é o que sobra de dúvida: alvéolo que caia ali é
    borrão ou rasura, e continua indo para a conferência. Sem vão claro — folha
    em branco, ou quase — a régua herdada é a que vale.
    """
    valores = sorted(p for p in proporcoes if not np.isnan(p))
    if len(valores) < 8:
        return herdados
    melhor, onde = 0.0, None
    for antes, depois in zip(valores, valores[1:]):
        # Só vãos no meio: o que está muito embaixo é papel, e muito em cima é
        # tinta cheia — nem um nem outro separam grupo nenhum.
        if depois <= 0.15 or antes >= 0.85:
            continue
        if depois - antes > melhor:
            melhor, onde = depois - antes, (antes + depois) / 2
    if onde is None or melhor < VAO_MINIMO:
        return herdados
    margem = min(0.10, melhor * 0.3)
    return Limiares(cheio=round(onde + margem, 3), vazio=round(onde - margem, 3),
                    origem="medido nesta folha")


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
    limiares: "Limiares | None" = None

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


def caixa_dos(alveolos, folga_esquerda: float = 5.0, folga_direita: float = 14.0,
              folga_topo: float = 4.0) -> tuple[float, float, float, float]:
    """O retângulo que contém estes alvéolos, com folga, em pontos.

    As folgas não são simetria — cada uma existe para trazer para dentro do
    recorte um rótulo que está fora dos alvéolos: à esquerda o NÚMERO do item, à
    direita a LETRA da opção, e em cima, no bloco do tipo B, o “ITEM 60” e as
    colunas C, D e U. Recorte apertado devolve círculos pretos sem contexto
    nenhum, e quem confere fica sem saber de que item nem de que algarismo eles
    são — que é justamente o que ele precisava saber.
    """
    xs = [a.x for a in alveolos]
    ys = [a.y for a in alveolos]
    r = max(a.r for a in alveolos)
    x0, x1 = min(xs) - r - folga_esquerda, max(xs) + r + folga_direita
    y0, y1 = min(ys) - r - folga_topo, max(ys) + r + 4
    return (x0, y0, x1 - x0, y1 - y0)


@dataclass
class _Grupo:
    """Um conjunto de alvéolos que decidem uma coisa só, já medido."""
    especie: str                    # item · b · matricula · percentual
    numero: int
    valores: dict
    proporcoes: list
    caixa: tuple
    coluna: str = ""


def _medir(cinza, matriz, folha: Folha, limiar: float) -> list[_Grupo]:
    """Mede TODOS os alvéolos da folha antes de decidir qualquer coisa.

    A ordem importa: é o conjunto da folha que diz onde está o vão entre o
    marcado e o vazio (`limiares_da_folha`), e sem medir tudo primeiro não há
    como saber disso. Decidir alvéolo a alvéolo, com uma régua trazida de fora,
    foi o que mandou marcação legítima para a conferência.
    """
    grupos = []
    medir = lambda alv: _proporcoes(cinza, matriz, list(alv.values()), limiar)

    for numero in sorted(folha.itens):
        valores = folha.itens[numero]
        grupos.append(_Grupo("item", numero, valores, medir(valores),
                             caixa_dos(list(valores.values()), folga_esquerda=24)))
    for numero in sorted(folha.tipo_b):
        colunas = folha.tipo_b[numero]
        # O recorte é o BLOCO inteiro do item, com as três colunas e o rótulo:
        # ver uma coluna solta não diz a quem confere que número foi marcado.
        todos = [a for c in colunas.values() for a in c.values()]
        caixa = caixa_dos(todos, folga_esquerda=10, folga_direita=8, folga_topo=17)
        for coluna in ("C", "D", "U"):
            digitos = colunas.get(coluna, {})
            if digitos:
                grupos.append(_Grupo("b", numero, digitos, medir(digitos), caixa, coluna))
    for posicao in sorted(folha.matricula):
        digitos = folha.matricula[posicao]
        todos = [a for d in folha.matricula.values() for a in d.values()]
        grupos.append(_Grupo("matricula", posicao, digitos, medir(digitos),
                             caixa_dos(todos, folga_direita=8, folga_topo=14)))
    for numero in sorted(folha.percentuais):
        opcoes = folha.percentuais[numero]
        grupos.append(_Grupo("percentual", numero, opcoes, medir(opcoes),
                             caixa_dos(list(opcoes.values()), folga_esquerda=40)))
    return grupos


def _decidir_itens(grupos: list[_Grupo], lim: Limiares, leitura: Leitura) -> None:
    for g in (x for x in grupos if x.especie == "item"):
        resposta, motivo = _decidir(g.valores, g.proporcoes, lim)
        if motivo:
            leitura.conferir.append(Marcacao(g.numero, resposta or "", motivo, g.caixa))
        elif resposta:
            leitura.respostas.append(Marcacao(g.numero, resposta))

    porItem: dict[int, list[_Grupo]] = {}
    for g in (x for x in grupos if x.especie == "b"):
        porItem.setdefault(g.numero, []).append(g)
    for numero, colunas in sorted(porItem.items()):
        algarismos, motivos = [], []
        for g in sorted(colunas, key=lambda x: "CDU".index(x.coluna)):
            resposta, motivo = _decidir(g.valores, g.proporcoes, lim)
            algarismos.append(str(resposta) if resposta is not None else "")
            if motivo:
                motivos.append(f"{g.coluna}:{motivo}")
        caixa = colunas[0].caixa
        preenchidas = [a for a in algarismos if a != ""]
        if not preenchidas and not motivos:
            continue                                    # item em branco
        if motivos:
            leitura.conferir.append(Marcacao(numero, "".join(algarismos), ";".join(motivos), caixa))
        elif len(preenchidas) < 3:
            # Número pela metade não é resposta: `9__` tanto pode ser 900 quanto
            # 960. Vai inteiro para a conferência, com o que se conseguiu ler.
            leitura.conferir.append(
                Marcacao(numero, "".join(a or "_" for a in algarismos), "tipo_b_incompleto", caixa))
        else:
            leitura.respostas.append(Marcacao(numero, "".join(algarismos)))


def _ler_matricula(grupos: list[_Grupo], lim: Limiares, formato) -> tuple[str, str]:
    """A matrícula em alvéolos do cartão extra. Devolve `(matrícula, motivo)`."""
    algarismos, duvida = [], ""
    for g in sorted((x for x in grupos if x.especie == "matricula"), key=lambda x: x.numero):
        resposta, motivo = _decidir(g.valores, g.proporcoes, lim)
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

    grupos = _medir(cinza, matriz, folha, limiar)
    lim = limiares_da_folha([p for g in grupos for p in g.proporcoes], lim)
    leitura.limiares = lim

    if folha.matricula:
        matricula, duvida = _ler_matricula(grupos, lim, molde.formato_matricula)
        if duvida or not matricula:
            leitura.situacao = "conferir"
            leitura.motivo = duvida or "matricula_em_branco"
        else:
            leitura.identificacao = ident = Identificacao(
                ident.versao, ident.tipo, ident.folha, ident.total, matricula)

    _decidir_itens(grupos, lim, leitura)

    for g in (x for x in grupos if x.especie == "percentual"):
        resposta, motivo = _decidir(g.valores, g.proporcoes, lim)
        if resposta is not None and not motivo:
            leitura.percentuais.append(Marcacao(g.numero, str(resposta)))
        elif motivo:
            leitura.conferir.append(
                Marcacao(g.numero, str(resposta or ""), f"percentual_{motivo}", g.caixa))

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
    """O que o cartão-gabarito tem a dizer sobre o lote.

    **Menos do que parecia, e é importante saber o quê.** A ideia original era
    tirar dele o limiar de tinta do lote inteiro: uma folha onde se sabe, alvéolo
    por alvéolo, o que devia estar marcado. Só que as marcas dele são de TONER,
    e passam de 80% sempre; o estudante escreve a CANETA, e aí a marca vai de
    30% a 100% conforme a pressão da mão. A régua tirada da folha impressa fica
    alta demais para gente — na primeira digitalização de verdade ela mandou 24
    marcações legítimas de uma única folha para a conferência.

    Então o que ele dá é:

    1. **o nível do PAPEL** — o quanto um alvéolo vazio escurece nesta
       impressora e neste scanner. Isso sim se transfere, e vira a régua de
       reserva para a folha que não tiver o que dizer sobre si (uma folha em
       branco não tem vão entre grupo nenhum);
    2. **a conferência entre a chave e o papel** — se o gabarito exportado
       discordar do que está impresso, alguém mexeu nos itens depois de imprimir
       os cartões, e corrigir o lote com a chave errada é o pior desfecho
       possível desta tela.

    O limiar de cada folha preenchida sai dela mesma (`limiares_da_folha`).
    """
    folha = molde.folha(ident.versao, ident.molde, ident.folha)
    if folha is None or (not folha.itens and not folha.tipo_b):
        return Limiares(), []

    limiar = limiar_de_tinta(cinza)
    esperados, medidos, divergencias = [], [], []

    def medir(alveolos: dict, marcado_certo) -> None:
        props = _proporcoes(cinza, matriz, list(alveolos.values()), limiar)
        for chave, prop in zip(alveolos, props):
            if not np.isnan(prop):
                esperados.append(bool(marcado_certo(chave)))
                medidos.append(prop)

    for numero, valores in folha.itens.items():
        chave = molde.gabarito.get((ident.versao, numero))
        medir(valores, lambda v, chave=chave: chave is not None and str(chave).strip().upper() == v)
    for numero, colunas in folha.tipo_b.items():
        chave = molde.gabarito.get((ident.versao, numero))
        certo = "".join(c for c in str(chave or "") if c.isdigit()).rjust(3, "0")[-3:]
        for indice, coluna in enumerate(("C", "D", "U")):
            medir(colunas.get(coluna, {}),
                  lambda d, i=indice: chave is not None and certo[i] == str(d))

    vazios = [p for p, e in zip(medidos, esperados) if not e]
    lim = Limiares()
    if len(vazios) >= 20:
        # Só o teto do papel. O piso da marca NÃO sai daqui — ver o docstring.
        teto = float(np.percentile(vazios, 99))
        lim = Limiares(vazio=round(teto + 0.04, 3), cheio=round(teto + 0.19, 3),
                       origem="papel medido no cartão-gabarito")

    # A conferência que só esta folha permite: o que está impresso é o mesmo que
    # o gabarito exportado diz? Decidida com a régua da própria folha, que numa
    # folha impressa é limpíssima.
    daFolha = limiares_da_folha(medidos, lim)
    for numero, valores in sorted(folha.itens.items()):
        chave = molde.gabarito.get((ident.versao, numero))
        if chave is None:
            continue
        resposta, motivo = _decidir(valores, _proporcoes(cinza, matriz, list(valores.values()), limiar), daFolha)
        if motivo or resposta != str(chave).strip().upper():
            divergencias.append(
                f"item {numero}: o gabarito exportado diz “{chave}” e o cartão-gabarito "
                f"impresso mostra “{resposta or motivo}”")
    return lim, divergencias
