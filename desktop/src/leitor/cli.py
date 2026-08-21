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
from .imagem import DPI_PADRAO, EXTENSOES, contar_paginas, digitalizacoes
from .lote import ler_lote
from .molde import GabaritoIncompativel
from .apuracao import apurar, marcacoes_de
from .pacote import Pacote, carregar



@click.group(help="Leitor de cartões-resposta PAS Marista (OMR local).")
@click.version_option(__version__)
def cli() -> None:
    pass


def _mostrar_apuracao(pacote: Pacote, marcacoes: dict, saida_dir: Path, decisoes=()) -> None:
    resultados, quantos, boletins = apurar(pacote, marcacoes, saida_dir, decisoes)
    click.echo(f"{quantos} estudante(s) em {saida_dir / 'resultados.csv'}")
    anulados = sum(r.nulos for r in resultados)
    if anulados:
        click.echo(f"{anulados} item(ns) anulado(s) por dupla marcação — contam como erro e "
                   "saem marcados no boletim.")
    pendentes = sum(r.pendentes for r in resultados)
    if pendentes:
        click.echo(f"ATENÇÃO: {pendentes} marcação(ões) continuam na conferência e ficaram FORA "
                   "das notas. Resolva-as e rode `corrigir` antes de entregar os boletins.",
                   err=True)
    if boletins:
        click.echo(f"Boletins de desempenho em {boletins}")


def _pacote(caminho: Path) -> Pacote:
    try:
        return carregar(caminho)
    except GabaritoIncompativel as erro:
        click.echo(f"ERRO: {erro}", err=True)
        sys.exit(2)





@cli.command(help="Lê uma pasta de digitalizações e gera os CSVs de respostas.")
@click.option("--gabarito", "gabarito_path", required=True,
              type=click.Path(exists=True, dir_okay=False, path_type=Path),
              help="Arquivo pas-gabarito-<prova>.json exportado pelo sistema web.")
@click.option("--entrada", "entrada_dir", required=True,
              type=click.Path(exists=True, path_type=Path),
              help="Pasta com as digitalizações, ou o próprio arquivo "
                   "(PDF/JPEG/PNG, 300 dpi).")
@click.option("--saida", "saida_dir", default=Path("resultado"), type=click.Path(path_type=Path),
              help="Pasta de saída para os CSVs e as miniaturas de conferência.")
@click.option("--dpi", default=DPI_PADRAO, show_default=True,
              help="Resolução com que as páginas de PDF são rasterizadas.")
def ler(gabarito_path: Path, entrada_dir: Path, saida_dir: Path, dpi: int) -> None:
    pacote = _pacote(gabarito_path)
    click.echo(f"Simulado: {pacote.molde.simulado} · {pacote.molde.etapa}")
    click.echo(f"Prova: {pacote.molde.prova.get('serie')} ({pacote.molde.prova.get('id')})")

    arquivos = digitalizacoes(entrada_dir)
    if not arquivos:
        click.echo(f"ERRO: nenhuma digitalização em {entrada_dir}.\n"
                   f"Aceito uma pasta ou um arquivo, nestes formatos: "
                   f"{', '.join(sorted(EXTENSOES))}.", err=True)
        sys.exit(2)
    click.echo(f"Digitalizações: {len(arquivos)} arquivo(s) em {entrada_dir}")

    with click.progressbar(length=contar_paginas(arquivos), label="Lendo") as barra:
        feito = 0

        def andou(atual: int, _total: int, _onde: str) -> None:
            nonlocal feito
            barra.update(max(0, atual - feito))
            feito = atual

        resultado = ler_lote(pacote, arquivos, saida_dir, dpi, progresso=andou)

    click.echo(f"Limiar de tinta: {resultado.limiares}")
    for aviso in resultado.avisos + resultado.divergencias:
        click.echo(f"  ATENÇÃO — {aviso}", err=True)

    click.echo(f"\n{len(resultado.leituras)} página(s) · {resultado.lidas} lida(s) · "
               f"{resultado.referencia} de referência · {resultado.a_conferir} para conferência")
    click.echo(f"Marcações em {saida_dir / 'respostas.csv'}")
    click.echo(f"Rastro folha a folha em {saida_dir / 'folhas.csv'}")
    if (saida_dir / "conferencia.html").exists():
        click.echo(f"\nPara conferir o que ficou em dúvida, com a imagem de cada marcação:\n"
                   f"  {saida_dir / 'conferencia.html'}")

    # E a correção, quando o arquivo é o pacote da prova e não o gabarito sozinho.
    if pacote.tem_boletim:
        click.echo("")
        marcacoes, _, fora = marcacoes_de(pacote, [saida_dir / "respostas.csv"])
        if fora:
            click.echo(f"{fora} marcação(ões) de estudante fora do elenco desta prova, ignoradas.",
                       err=True)
        _mostrar_apuracao(pacote, marcacoes, saida_dir)
    else:
        click.echo("\nSem elenco no arquivo — só a leitura. Para os resultados e os boletins, "
                   "exporte o PACOTE da prova em Cartões-resposta.")
    if resultado.deitadas:
        click.echo(f"\n{resultado.deitadas} folha(s) entraram deitadas na mesa e foram "
                   "endireitadas aqui — digitalizar em pé é mais rápido.")
    if resultado.divergencias:
        click.echo("\nO cartão-gabarito impresso divergiu do gabarito exportado. Confira antes de "
                   "importar: alguém pode ter mexido nos itens depois de imprimir os cartões.",
                   err=True)
        sys.exit(1)


@cli.command(help="Corrige a partir de CSVs de marcações e gera resultados e boletins.")
@click.option("--gabarito", "gabarito_path", required=True,
              type=click.Path(exists=True, dir_okay=False, path_type=Path),
              help="O pacote da prova exportado pelo sistema (pas-pacote-<prova>.json).")
@click.option("--respostas", "respostas_csv", required=True, multiple=True,
              type=click.Path(exists=True, dir_okay=False, path_type=Path),
              help="CSV de marcações. Pode repetir: o último vale sobre os anteriores.")
@click.option("--saida", "saida_dir", default=Path("resultado"), type=click.Path(path_type=Path))
def corrigir(gabarito_path: Path, respostas_csv: tuple[Path, ...], saida_dir: Path) -> None:
    """Refaz a correção depois de a conferência ter sido resolvida.

    O caminho normal é `ler`, que já corrige. Este comando existe para o depois:
    o operador abriu `conferencia.html`, decidiu as marcações duvidosas olhando o
    recorte, e agora quer os boletins com o que ele decidiu — sem digitalizar o
    lote de novo.
    """
    pacote = _pacote(gabarito_path)
    if not pacote.tem_boletim:
        click.echo("ERRO: este arquivo é o gabarito sozinho, sem elenco. Exporte o PACOTE da "
                   "prova em Cartões-resposta para gerar resultados e boletins.", err=True)
        sys.exit(2)
    saida_dir.mkdir(parents=True, exist_ok=True)
    marcacoes, lidas, fora = marcacoes_de(pacote, list(respostas_csv))
    click.echo(f"Prova: {pacote.molde.prova.get('serie')} · {lidas} marcação(ões) de "
               f"{len(marcacoes)} estudante(s)")
    if fora:
        click.echo(f"{fora} marcação(ões) de estudante fora do elenco desta prova, ignoradas.",
                   err=True)
    _mostrar_apuracao(pacote, marcacoes, saida_dir, list(respostas_csv))


@cli.command(help="Abre a janela do aplicativo.")
def janela() -> None:
    """A interface gráfica — é o que o `.exe` abre quando ninguém digita nada.

    O PySide6 só é importado aqui dentro: quem usa a linha de comando num
    servidor sem ambiente gráfico não deve esbarrar num `import` de Qt.
    """
    try:
        from .ui.janela import abrir
    except ImportError as erro:
        click.echo(f"ERRO: a janela precisa do PySide6 ({erro}). "
                   "Instale com `pip install -r requirements.txt`.", err=True)
        sys.exit(2)
    sys.exit(abrir())


@cli.command(help="Descreve um pacote ou gabarito exportado, sem ler digitalização nenhuma.")
@click.option("--gabarito", "gabarito_path", required=True,
              type=click.Path(exists=True, dir_okay=False, path_type=Path))
def conferir(gabarito_path: Path) -> None:
    pacote = _pacote(gabarito_path)
    molde = pacote.molde
    click.echo(f"Simulado: {molde.simulado} · {molde.etapa}")
    click.echo(f"Prova: {molde.prova.get('serie')} ({molde.prova.get('id')})")
    click.echo(f"Âncoras: {len(molde.ancoras)} · faixa de identificação: {len(molde.codigo)} células")
    if pacote.tem_boletim:
        click.echo(f"Elenco: {len(pacote.elenco)} estudante(s) · notas lançadas para "
                   f"{len(pacote.notas)} · pesos do escore: "
                   + ", ".join(f"{t}={p}" for t, p in sorted(pacote.escore.pesos.items())))
    else:
        click.echo("Sem elenco: dá para ler os cartões, mas não para gerar boletins.")
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
