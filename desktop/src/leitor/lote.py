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

from .ancoras import SemAncoras, girar, homografia, voltas_para_endireitar
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


@dataclass
class Lote:
    """O resultado da leitura de um lote."""
    leituras: list[Leitura] = field(default_factory=list)
    achados: list[dict] = field(default_factory=list)
    limiares: Limiares = field(default_factory=Limiares)
    avisos: list[str] = field(default_factory=list)
    divergencias: list[str] = field(default_factory=list)

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


def alinhar(pagina: Pagina, molde: Molde):
    """Alinha e identifica a página, em qualquer das quatro posições.

    A folha chega da mesa do scanner como der: em pé, deitada, de cabeça para
    baixo. As duas coisas se resolvem em ordem, e cada uma tem quem a responda:

    - **em pé ou deitada** quem diz são as ÂNCORAS, pela proporção do retângulo
      que elas formam. Isso reduz quatro posições possíveis a duas;
    - **de cabeça para baixo ou não** quem diz é o CRC da faixa do rodapé. Ler
      ao contrário devolveria lixo com cara de matrícula, e é o CRC que recusa.

    Sem o CRC nada disso seria seguro; com ele, tentar é barato.
    """
    voltas = voltas_para_endireitar(pagina.cinza, molde.ancoras)
    if not voltas:
        raise SemAncoras("não achei as quatro âncoras do cartão nesta página")
    ultimo = None
    for n in voltas:
        cinza = girar(pagina.cinza, n)
        try:
            matriz = homografia(cinza, molde.ancoras)
            return cinza, matriz, ler_faixa(cinza, matriz, molde, limiar_de_tinta(cinza)), n
        except (SemAncoras, FaixaIlegivel) as erro:
            ultimo = erro
    raise ultimo if ultimo else SemAncoras("página sem âncoras")


def ler_pagina(pagina: Pagina, molde: Molde, limiares: Limiares):
    """Uma página, do começo ao fim. Nunca levanta: recusa é resultado."""
    try:
        cinza, matriz, ident, voltas = alinhar(pagina, molde)
    except SemAncoras as erro:
        return (Leitura(onde=pagina.onde, situacao="descartada", motivo=f"sem_ancoras: {erro}"),
                pagina.cinza, None)
    except FaixaIlegivel as erro:
        return (Leitura(onde=pagina.onde, situacao="conferir", motivo=f"faixa_ilegivel: {erro}"),
                pagina.cinza, None)
    leitura = ler_folha(cinza, matriz, molde, ident, limiares, pagina.onde)
    leitura.voltas = voltas
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
            cinza, matriz, ident, _ = alinhar(pagina, molde)
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
        lote.leituras.append(leitura)
        if matriz is not None:
            lote.achados.extend(saida.recortes(pasta_conferencia, cinza, matriz, leitura))
        if leitura.situacao not in ("lida", "referencia"):
            saida.miniatura(pasta_conferencia, cinza, matriz, molde.campo_matricula,
                            pagina.onde.replace(":", "-p"))
        contar(indice, total, pagina.onde)

    saida.respostas(saida_dir, lote.leituras)
    saida.conferir(saida_dir, lote.leituras)
    saida.percentuais(saida_dir, lote.leituras)
    saida.folhas(saida_dir, lote.leituras)
    saida.conferencia(saida_dir, molde.prova, lote.achados)
    return lote
