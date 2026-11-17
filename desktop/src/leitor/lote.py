"""A leitura de um lote inteiro — o miolo que a linha de comando e a janela usam.

Estava dentro da linha de comando, e ficou impossível quando a janela apareceu:
duas cascas chamando o mesmo trabalho, e o trabalho escrito dentro de uma delas.
Copiá-lo para a outra é como copiar a regra do escore — funciona na segunda-feira
e diverge na quarta.

Aqui não há `print` nem `click`: quem quiser contar o andamento passa uma função
`progresso`, e quem não quiser não passa. É o que permite a mesma leitura sair
numa barra de progresso da janela e numa barra de texto do terminal.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from .ancoras import (NOME_DO_CANTO, SemAncoras, com_tres_ancoras, girar, homografia,
                      voltas_para_endireitar)
from .codigo import FaixaIlegivel
from .imagem import DPI_PADRAO, Pagina, contar_paginas, paginas
from .leitura import Leitura, Limiares, calibrar, ler_faixa, ler_folha, limiar_de_tinta
from .molde import Molde
from .pacote import Pacote
from . import saida

# Quantas páginas do começo da pilha são varridas atrás do cartão-gabarito antes
# de a leitura começar. O sistema o imprime na frente; esta folga cobre a capa
# de rosto que a secretaria às vezes põe por cima, e custa segundos.
TOPO_DA_PILHA = 8

Progresso = Callable[[int, int, str], None]


def lugar_da_folha(onde: str) -> str:
    """“lote.pdf, página 34” — é pelo número da página que se acha o papel."""
    arquivo, _, numero = onde.rpartition(":")
    if arquivo.lower().endswith(".pdf"):
        return f"{arquivo}, página {numero}"
    return arquivo or onde


@dataclass
class SemNota:
    """Uma folha do lote que não entrou na nota de ninguém, e por quê."""
    onde: str               # arquivo:página, como em `folhas.csv`
    motivo: str             # frase para quem vai procurar o papel na pilha
    matricula: str = ""     # quando a folha chegou a dizer de quem é

    @property
    def lugar(self) -> str:
        return lugar_da_folha(self.onde)

    def __str__(self) -> str:
        return f"{self.lugar} — {self.motivo}"


@dataclass
class SemCanto:
    """Uma folha lida por só três âncoras: um canto não apareceu na digitalização.

    A folha ENTROU na nota — a faixa do rodapé conferiu, e os alvéolos foram
    lidos onde o molde os põe. O que ninguém sabe é o que havia no pedaço que
    não apareceu: alvéolo que estivesse ali o leitor não viu, e ele o dá como em
    branco. Por isso a folha é dita a quem opera, com a página e o canto.
    """
    onde: str
    canto: str              # “de baixo à direita”
    matricula: str = ""

    def __str__(self) -> str:
        return f"{lugar_da_folha(self.onde)} — faltou o canto {self.canto}"


@dataclass
class Lote:
    """O resultado da leitura de um lote."""
    leituras: list[Leitura] = field(default_factory=list)
    achados: list[dict] = field(default_factory=list)
    limiares: Limiares = field(default_factory=Limiares)
    avisos: list[str] = field(default_factory=list)
    divergencias: list[str] = field(default_factory=list)
    sem_nota: list[SemNota] = field(default_factory=list)
    sem_canto: list[SemCanto] = field(default_factory=list)

    @property
    def lidas(self) -> int:
        return sum(1 for l in self.leituras if l.situacao == "lida")

    @property
    def referencia(self) -> int:
        return sum(1 for l in self.leituras if l.situacao == "referencia")

    @property
    def a_conferir(self) -> int:
        return len(self.leituras) - self.lidas - self.referencia

    @property
    def deitadas(self) -> int:
        return sum(1 for l in self.leituras if l.voltas % 2)


def motivo_sem_nota(leitura: Leitura, pacote: Pacote) -> str:
    """Por que esta folha não entra na nota de ninguém — ou "" se entra.

    **É a conta que fecha o lote.** Entraram 49 folhas e saíram 46 notas, e o
    programa não dizia em lugar nenhum da tela onde estavam as outras três: uma
    descartada por causa de uma assinatura por cima da âncora, um cartão extra
    com a matrícula em branco e um cartão de outra série esquecido na pilha. As
    três estavam no `folhas.csv`, cada uma com um nome diferente (`descartada`,
    `conferir` com motivo, `conferir` sem motivo nenhum), e nenhuma aparecia na
    conferência — que mostra MARCAÇÃO duvidosa, e folha sem dono não tem
    marcação a mostrar. Quem operava ficou sabendo pelo estudante sem nota.

    São quatro jeitos de uma folha ficar de fora, e este é o lugar único que
    conhece os quatro: sem âncoras, faixa ilegível, matrícula que não é do
    elenco e folha recusada inteira (o cartão extra sem matrícula é o caso de
    todo dia; o cartão de uma versão para estudante cadastrado na outra, o
    mais traiçoeiro — ver `barrar_versao_trocada`). O do elenco só existe
    quando o arquivo é o pacote da prova; com o gabarito sozinho não há elenco
    a cobrar.
    """
    ident = leitura.identificacao
    if ident is None:
        if leitura.motivo.startswith("faixa_ilegivel"):
            return ("a faixa de blocos do rodapé não pôde ser lida, e sem ela não dá "
                    "para saber de quem é a folha")
        return ("não achei as quatro âncoras (os quadrados pretos dos cantos): "
                "a folha não foi lida")
    if ident.eh_referencia:
        return ""

    if ident.matricula and pacote.elenco and pacote.casar(ident.matricula) is None:
        motivo = f"a matrícula {ident.matricula} não está no elenco desta prova"
        # A faixa não diz de que PROVA é a folha, e as âncoras ficam no mesmo
        # lugar em todo cartão: um cartão do 9º ano esquecido na pilha da 3ª
        # série alinha, fecha o CRC e é lido com o molde errado. O que a faixa
        # traz é quantas folhas o estudante recebeu, e quando esse número não é
        # o desta prova o cartão quase certamente é de outra. É INDÍCIO, e por
        # isso só entra na frase: a redação desligada depois de imprimir também
        # muda a conta, sem mudar a folha objetiva.
        desta = min(15, len(pacote.molde.familias.get((ident.versao, ident.molde), [])))
        if desta and ident.total != desta:
            motivo += (f" — e parece cartão de OUTRA prova: a faixa diz {ident.total} "
                       f"folha(s) por estudante, e nesta são {desta}")
        return motivo

    # `motivo` na leitura é reservado ao que impediu a FOLHA de ser lida (item
    # duvidoso não o preenche). Sem ele, a folha tem dono e foi lida — inclusive
    # a de redação do cartão extra, que não tem matrícula nem alvéolo.
    if not leitura.motivo:
        return ""
    if leitura.motivo.startswith(VERSAO_TROCADA):
        return leitura.motivo[len(VERSAO_TROCADA):].lstrip(": ")
    lidas = sum(1 for m in leitura.conferir if m.motivo == "folha_sem_matricula")
    resto = (f" — {lidas} marcação(ões) lida(s), esperando saber de quem são"
             if lidas else "")
    if leitura.motivo == "matricula_em_branco":
        return "cartão extra com a matrícula em branco nos alvéolos" + resto
    if leitura.motivo.startswith("matricula_"):
        return (f"cartão extra com a matrícula ilegível ou fora do padrão "
                f"({leitura.motivo})" + resto)
    return leitura.motivo


# Como a versão se diz a quem opera: é o código que está impresso no cartão que
# a pessoa tem na mão. “Adaptada” é palavra de bastidor — ver o CLAUDE.md.
CODIGO_DA_VERSAO = {"regular": "A1", "adaptada": "A2"}
VERSAO_TROCADA = "versao_trocada"


def barrar_versao_trocada(leitura: Leitura, pacote: Pacote) -> None:
    """Cartão de uma versão, estudante cadastrado na outra: a folha não se corrige.

    **A chave vem do cadastro, e o que foi respondido vem do cartão.** As
    marcações saem daqui como `matrícula; item; resposta`, sem dizer de que
    versão era a folha, e a correção procura o item pelo número na versão em que
    o estudante está cadastrado. Cada versão numera os seus de 1 a N: o nº 7 da
    A2 não é o nº 7 da A1. Uma estudante cadastrada na A1 fez a prova A2 num
    cartão extra, e a folha dela — lida certa, alvéolo por alvéolo — seria
    corrigida com a chave da outra prova: Nota Marista 0,23 onde eram 1,12, sem
    aviso nenhum e com cara de nota. Só não aconteceu antes porque aquela folha
    era descartada por outro motivo.

    Aqui nada é adivinhado: escolher a chave pelo cartão faria o aplicativo e o
    sistema on-line darem notas diferentes ao mesmo estudante, porque lá a
    versão também vem do cadastro. A folha fica DE FORA — nenhuma marcação dela
    vai para os CSVs, nem para a conferência — e vira folha sem nota, com o que
    fazer dito por extenso. Acertado o cadastro e exportado o pacote de novo,
    ler outra vez leva segundos.
    """
    ident = leitura.identificacao
    if ident is None or ident.eh_referencia or not ident.matricula or not pacote.elenco:
        return
    estudante = pacote.casar(ident.matricula)
    if estudante is None or estudante.versao == ident.versao:
        return
    # Folha sem marcação nenhuma (a de redação, ou a objetiva em branco) não tem
    # o que corrigir com chave nenhuma — e não é ela que vai avisar do cadastro.
    lidas = len(leitura.respostas) + len(leitura.conferir) + len(leitura.percentuais)
    if not lidas:
        return
    leitura.respostas.clear()
    leitura.conferir.clear()
    leitura.percentuais.clear()
    do_cartao = CODIGO_DA_VERSAO.get(ident.versao, ident.versao)
    do_cadastro = CODIGO_DA_VERSAO.get(estudante.versao, estudante.versao)
    leitura.situacao = "conferir"
    leitura.motivo = (
        f"{VERSAO_TROCADA}: o cartão da matrícula {ident.matricula} é da versão {do_cartao} e o "
        f"cadastro diz {do_cadastro} — com a chave da outra versão a nota sairia errada, e por "
        f"isso a folha ficou de fora ({lidas} marcação(ões) lida(s)). Acerte a versão do "
        f"estudante no sistema, exporte o pacote de novo e mande ler outra vez")


def alinhar(pagina: Pagina, molde: Molde):
    """Alinha e identifica a página, em qualquer das quatro posições.

    A folha chega da mesa do scanner como der: em pé, deitada, de cabeça para
    baixo. As duas coisas se resolvem em ordem, e cada uma tem quem a responda:

    - **em pé ou deitada** quem diz são as ÂNCORAS, pela proporção do retângulo
      que elas formam. Isso reduz quatro posições possíveis a duas;
    - **de cabeça para baixo ou não** quem diz é o CRC da faixa do rodapé. Ler
      ao contrário devolveria lixo com cara de matrícula, e é o CRC que recusa.

    Sem o CRC nada disso seria seguro; com ele, tentar é barato.

    E quando nada disso fecha, a última tentativa é a das TRÊS âncoras
    (`com_tres_ancoras`): um canto que não apareceu na digitalização não pode
    custar a folha inteira. Ela só roda aqui embaixo, depois de as quatro terem
    falhado — a folha que já era lida continua sendo lida do mesmo jeito —, e
    quem a valida é o mesmo CRC.

    Devolve `(imagem em pé, matriz, identificação, voltas, canto que faltou)`;
    o último vem vazio na folha alinhada pelas quatro âncoras.
    """
    ultimo = None
    for n in voltas_para_endireitar(pagina.cinza, molde.ancoras):
        cinza = girar(pagina.cinza, n)
        try:
            matriz = homografia(cinza, molde.ancoras)
            return cinza, matriz, ler_faixa(cinza, matriz, molde, limiar_de_tinta(cinza)), n, ""
        except (SemAncoras, FaixaIlegivel) as erro:
            ultimo = erro

    giradas: dict[int, tuple] = {}
    for n, matriz, falta in com_tres_ancoras(pagina.cinza, molde.ancoras):
        if n not in giradas:
            cinza = girar(pagina.cinza, n)
            giradas[n] = (cinza, limiar_de_tinta(cinza))
        cinza, limiar = giradas[n]
        try:
            return cinza, matriz, ler_faixa(cinza, matriz, molde, limiar), n, NOME_DO_CANTO[falta]
        except FaixaIlegivel:
            continue        # três manchas que formavam um “L” e não eram o cartão
    # Nada fechou: a recusa é a que as quatro âncoras deram — sem elas, a folha
    # sai como sempre saiu.
    raise ultimo if ultimo else SemAncoras("não achei as quatro âncoras do cartão nesta página")


def ler_pagina(pagina: Pagina, molde: Molde, limiares: Limiares):
    """Uma página, do começo ao fim. Nunca levanta: recusa é resultado."""
    try:
        cinza, matriz, ident, voltas, canto_ausente = alinhar(pagina, molde)
    except SemAncoras as erro:
        return (Leitura(onde=pagina.onde, situacao="descartada", motivo=f"sem_ancoras: {erro}"),
                pagina.cinza, None)
    except FaixaIlegivel as erro:
        return (Leitura(onde=pagina.onde, situacao="conferir", motivo=f"faixa_ilegivel: {erro}"),
                pagina.cinza, None)
    leitura = ler_folha(cinza, matriz, molde, ident, limiares, pagina.onde)
    leitura.voltas = voltas
    leitura.canto_ausente = canto_ausente
    return leitura, cinza, matriz


def procurar_referencia(arquivos: list[Path], molde: Molde, dpi: int):
    """Varre o topo da pilha atrás do cartão-gabarito e calibra por ele.

    Devolve `(limiares, avisos, divergências)`, e a diferença entre os dois
    últimos é o que separa um lote que segue de um lote que para. **Aviso** é
    “não achei a folha de referência”: o lote é lido assim mesmo, com o limiar
    padrão, e o que se perde é a conferência. **Divergência** é a folha de
    referência ter aparecido e DISCORDADO do gabarito exportado — aí alguém
    mexeu nos itens depois de imprimir os cartões, e seguir seria corrigir a
    prova inteira com a chave errada.
    """
    limiares, divergencias = Limiares(), []
    achou = False
    for indice, pagina in enumerate(paginas(arquivos, dpi)):
        if indice >= TOPO_DA_PILHA:
            break
        try:
            cinza, matriz, ident, _voltas, _canto = alinhar(pagina, molde)
        except (SemAncoras, FaixaIlegivel):
            continue
        if not ident.eh_referencia:
            continue
        achou = True
        medido, achados = calibrar(cinza, matriz, molde, ident)
        divergencias.extend(achados)
        if medido.origem != "padrão":
            limiares = medido
    avisos = [] if achou else [
        "não achei o cartão-gabarito no topo da pilha — o limiar de tinta fica no padrão, "
        "e o lote segue sem a conferência entre o papel e o gabarito exportado"]
    return limiares, avisos, divergencias


def ler_lote(pacote: Pacote, arquivos: list[Path], saida_dir: Path,
             dpi: int = DPI_PADRAO, progresso: Progresso | None = None) -> Lote:
    """Lê o lote inteiro e grava tudo o que sai dele."""
    molde = pacote.molde
    contar = lambda feito, total, texto: progresso(feito, total, texto) if progresso else None

    total = contar_paginas(arquivos)
    contar(0, total, "procurando o cartão-gabarito…")
    limiares, avisos, divergencias = procurar_referencia(arquivos, molde, dpi)
    lote = Lote(limiares=limiares, avisos=avisos, divergencias=divergencias)

    saida_dir.mkdir(parents=True, exist_ok=True)
    pasta_conferencia = saida_dir / "conferencia"
    for indice, pagina in enumerate(paginas(arquivos, dpi), 1):
        leitura, cinza, matriz = ler_pagina(pagina, molde, limiares)
        if leitura.identificacao and leitura.identificacao.eh_referencia:
            # A folha de referência não é de estudante: ela não gera resposta.
            leitura.respostas.clear()
            leitura.conferir.clear()
            leitura.situacao = "referencia"
        # Antes de qualquer recorte ou CSV: desta folha não sai marcação nenhuma.
        barrar_versao_trocada(leitura, pacote)
        lote.leituras.append(leitura)
        if matriz is not None:
            lote.achados.extend(saida.recortes(pasta_conferencia, cinza, matriz, leitura))
        # A miniatura sai também para a folha lida sem dúvida nenhuma e que não
        # é de ninguém do elenco: é por ela que se reconhece o papel.
        sem_nota = motivo_sem_nota(leitura, pacote)
        if sem_nota:
            lote.sem_nota.append(SemNota(pagina.onde, sem_nota, leitura.matricula))
        if leitura.canto_ausente:
            lote.sem_canto.append(SemCanto(pagina.onde, leitura.canto_ausente, leitura.matricula))
        if sem_nota or leitura.situacao not in ("lida", "referencia"):
            saida.miniatura(pasta_conferencia, cinza, matriz, molde.campo_matricula,
                            pagina.onde.replace(":", "-p"))
        contar(indice, total, pagina.onde)

    saida.respostas(saida_dir, lote.leituras)
    saida.conferir(saida_dir, lote.leituras)
    saida.percentuais(saida_dir, lote.leituras)
    saida.folhas(saida_dir, lote.leituras, {s.onde: s.motivo for s in lote.sem_nota})
    saida.conferencia(saida_dir, molde.prova, lote.achados)
    return lote
