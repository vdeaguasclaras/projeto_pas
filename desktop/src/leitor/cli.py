"""A linha de comando do leitor de cartões.

    python -m src.leitor.cli ler --gabarito pas-gabarito-pr-2em.json \
        --entrada ./digitalizacoes --saida ./resultado

O caminho inteiro está em desktop/docs/pipeline-omr.md. Em resumo, por página:
âncoras → homografia → faixa de identificação do rodapé → alvéolos → CSV.

Duas coisas valem por todo o resto:

1. **O cartão-gabarito vem na frente da pilha.** O sistema web o imprime
   automaticamente à frente do lote, um por versão. É dele que sai o limiar de
   tinta desta impressora e deste scanner, e é ele que denuncia — antes de o
   lote ser lançado — que o gabarito exportado não corresponde ao papel que foi
   impresso. Por isso as primeiras páginas são varridas antes de tudo.
2. **Nada duvidoso vira resposta.** O que não for inequívoco sai em
   `respostas_conferir.csv`, com o motivo e uma miniatura da folha.
"""
from __future__ import annotations

import sys
from pathlib import Path

import click

from . import __version__
from .ancoras import SemAncoras, homografia
from .codigo import FaixaIlegivel
from .imagem import DPI_PADRAO, Pagina, digitalizacoes, paginas
from .leitura import Leitura, Limiares, calibrar, ler_faixa, ler_folha, limiar_de_tinta
from .molde import GabaritoIncompativel, Molde, carregar
from . import saida

# Quantas páginas do começo da pilha são varridas atrás do cartão-gabarito antes
# de a leitura começar. O sistema o imprime na frente; esta folga cobre a capa
# de rosto que a secretaria às vezes põe por cima, e custa segundos.
TOPO_DA_PILHA = 8


@click.group(help="Leitor de cartões-resposta PAS Marista (OMR local).")
@click.version_option(__version__)
def cli() -> None:
    pass


def _molde(caminho: Path) -> Molde:
    try:
        return carregar(caminho)
    except GabaritoIncompativel as erro:
        click.echo(f"ERRO: {erro}", err=True)
        sys.exit(2)


def _alinhar(pagina: Pagina, molde: Molde):
    """Alinha e identifica a página, tentando também de cabeça para baixo.

    Folha virada é o defeito mais comum do alimentador, e é barato de resolver:
    se a faixa não fecha o CRC como está, gira 180° e tenta de novo. O CRC é o
    que torna isso seguro — sem ele, “ler ao contrário” devolveria lixo com cara
    de matrícula.
    """
    ultimo = None
    for girada in (False, True):
        cinza = pagina.cinza[::-1, ::-1] if girada else pagina.cinza
        try:
            matriz = homografia(cinza, molde.ancoras)
        except SemAncoras as erro:
            ultimo = erro
            continue
        try:
            return cinza, matriz, ler_faixa(cinza, matriz, molde, limiar_de_tinta(cinza)), girada
        except FaixaIlegivel as erro:
            ultimo = erro
    raise ultimo if ultimo else SemAncoras("página sem âncoras")


@cli.command(help="Lê uma pasta de digitalizações e gera os CSVs de respostas.")
@click.option("--gabarito", "gabarito_path", required=True,
              type=click.Path(exists=True, dir_okay=False, path_type=Path),
              help="Arquivo pas-gabarito-<prova>.json exportado pelo sistema web.")
@click.option("--entrada", "entrada_dir", required=True,
              type=click.Path(exists=True, file_okay=False, path_type=Path),
              help="Pasta com as digitalizações (PDF/JPEG/PNG, 300 dpi).")
@click.option("--saida", "saida_dir", default=Path("resultado"), type=click.Path(path_type=Path),
              help="Pasta de saída para os CSVs e as miniaturas de conferência.")
@click.option("--dpi", default=DPI_PADRAO, show_default=True,
              help="Resolução com que as páginas de PDF são rasterizadas.")
def ler(gabarito_path: Path, entrada_dir: Path, saida_dir: Path, dpi: int) -> None:
    molde = _molde(gabarito_path)
    click.echo(f"Simulado: {molde.simulado} · {molde.etapa}")
    click.echo(f"Prova: {molde.prova.get('serie')} ({molde.prova.get('id')})")

    arquivos = digitalizacoes(entrada_dir)
    if not arquivos:
        click.echo(f"ERRO: nenhuma digitalização em {entrada_dir}.", err=True)
        sys.exit(2)
    click.echo(f"Digitalizações: {len(arquivos)} arquivo(s) em {entrada_dir}")

    limiares, divergencias = _procurar_referencia(arquivos, molde, dpi)
    click.echo(f"Limiar de tinta: {limiares}")
    for aviso in divergencias:
        click.echo(f"  ATENÇÃO — {aviso}", err=True)

    saida_dir.mkdir(parents=True, exist_ok=True)
    pasta_miniaturas = saida_dir / "conferencia"
    leituras: list[Leitura] = []

    with click.progressbar(paginas(arquivos, dpi), label="Lendo") as fila:
        for pagina in fila:
            leitura, cinza, matriz = _ler_pagina(pagina, molde, limiares)
            if leitura.identificacao and leitura.identificacao.eh_referencia:
                # A folha de referência não é de estudante: ela não gera resposta.
                leitura.respostas.clear()
                leitura.situacao = "referencia"
            leituras.append(leitura)
            if leitura.situacao not in ("lida", "referencia"):
                saida.miniatura(pasta_miniaturas, cinza, matriz, molde.campo_matricula,
                                pagina.onde.replace(":", "-p"))

    n_resp = saida.respostas(saida_dir, leituras)
    n_conf = saida.conferir(saida_dir, leituras)
    n_perc = saida.percentuais(saida_dir, leituras)
    saida.folhas(saida_dir, leituras)

    lidas = sum(1 for l in leituras if l.situacao == "lida")
    referencia = sum(1 for l in leituras if l.situacao == "referencia")
    click.echo(f"\n{len(leituras)} página(s) · {lidas} lida(s) · {referencia} de referência · "
               f"{len(leituras) - lidas - referencia} para conferência")
    click.echo(f"{n_resp} marcação(ões) em respostas.csv")
    click.echo(f"{n_conf} linha(s) em respostas_conferir.csv")
    if n_perc:
        click.echo(f"{n_perc} percentual(is) de acerto em percentuais.csv")
    click.echo(f"Rastro folha a folha em {saida_dir / 'folhas.csv'}")
    if divergencias:
        click.echo("\nO cartão-gabarito impresso divergiu do gabarito exportado. Confira antes de "
                   "importar: alguém pode ter mexido nos itens depois de imprimir os cartões.",
                   err=True)
        sys.exit(1)


def _ler_pagina(pagina: Pagina, molde: Molde, limiares: Limiares):
    """Uma página, do começo ao fim. Nunca levanta: recusa é resultado."""
    try:
        cinza, matriz, ident, _ = _alinhar(pagina, molde)
    except SemAncoras as erro:
        return (Leitura(onde=pagina.onde, situacao="descartada", motivo=f"sem_ancoras: {erro}"),
                pagina.cinza, None)
    except FaixaIlegivel as erro:
        return (Leitura(onde=pagina.onde, situacao="conferir", motivo=f"faixa_ilegivel: {erro}"),
                pagina.cinza, None)
    return ler_folha(cinza, matriz, molde, ident, limiares, pagina.onde), cinza, matriz


def _procurar_referencia(arquivos: list[Path], molde: Molde, dpi: int):
    """Varre o topo da pilha atrás do cartão-gabarito e calibra por ele."""
    limiares, divergencias = Limiares(), []
    for indice, pagina in enumerate(paginas(arquivos, dpi)):
        if indice >= TOPO_DA_PILHA:
            break
        try:
            cinza, matriz, ident, _ = _alinhar(pagina, molde)
        except (SemAncoras, FaixaIlegivel):
            continue
        if not ident.eh_referencia:
            continue
        medido, avisos = calibrar(cinza, matriz, molde, ident)
        divergencias.extend(avisos)
        if medido.origem != "padrão":
            limiares = medido
    if limiares.origem == "padrão" and not divergencias:
        divergencias.append(
            "não achei o cartão-gabarito no topo da pilha — o limiar de tinta fica no padrão, "
            "e o lote segue sem a conferência entre o papel e o gabarito exportado")
    return limiares, divergencias


@cli.command(help="Descreve um gabarito exportado, sem ler digitalização nenhuma.")
@click.option("--gabarito", "gabarito_path", required=True,
              type=click.Path(exists=True, dir_okay=False, path_type=Path))
def conferir(gabarito_path: Path) -> None:
    molde = _molde(gabarito_path)
    click.echo(f"Simulado: {molde.simulado} · {molde.etapa}")
    click.echo(f"Prova: {molde.prova.get('serie')} ({molde.prova.get('id')})")
    click.echo(f"Âncoras: {len(molde.ancoras)} · faixa de identificação: {len(molde.codigo)} células")
    for (versao, familia), folhas in sorted(molde.familias.items()):
        click.echo(f"  {versao} · cartão {familia}: {len(folhas)} folha(s)")
        for numero, folha in enumerate(folhas, 1):
            partes = []
            if folha.itens:
                partes.append(f"{len(folha.itens)} item(ns) A/C")
            if folha.tipo_b:
                partes.append(f"{len(folha.tipo_b)} do tipo B")
            if folha.matricula:
                partes.append(f"matrícula em {len(folha.matricula)} posições")
            if folha.percentuais:
                partes.append(f"{len(folha.percentuais)} quadro(s) de percentual")
            click.echo(f"    folha {numero} ({folha.tipo}): " + (", ".join(partes) or "sem alvéolo"))


if __name__ == "__main__":
    cli()
