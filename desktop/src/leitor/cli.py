"""CLI do leitor de cartões — esqueleto da fase de organização.

Uso previsto:
    python -m src.leitor.cli ler --gabarito pas-gabarito-leitor.json \
        --entrada ./digitalizacoes --saida ./resultado

Nesta fase o comando valida as entradas e descreve o que fará; o pipeline
OMR (desktop/docs/pipeline-omr.md) é implementado na próxima fase.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import click

FORMATO_GABARITO = "pas-marista/gabarito-v1"


@click.group(help="Leitor de cartões-resposta PAS Marista (OMR local).")
def cli() -> None:
    pass


@cli.command(help="Lê uma pasta de digitalizações e gera o CSV de respostas.")
@click.option("--gabarito", "gabarito_path", required=True, type=click.Path(exists=True, path_type=Path),
              help="Arquivo pas-gabarito-leitor.json exportado pelo sistema web.")
@click.option("--entrada", "entrada_dir", required=True, type=click.Path(exists=True, file_okay=False, path_type=Path),
              help="Pasta com as digitalizações (PDF/JPEG/PNG, 300 dpi).")
@click.option("--saida", "saida_dir", default=Path("resultado"), type=click.Path(path_type=Path),
              help="Pasta de saída para respostas.csv e respostas_conferir.csv.")
def ler(gabarito_path: Path, entrada_dir: Path, saida_dir: Path) -> None:
    gabarito = json.loads(gabarito_path.read_text(encoding="utf-8"))
    if gabarito.get("formato") != FORMATO_GABARITO:
        click.echo(f"ERRO: gabarito em formato inesperado (esperava {FORMATO_GABARITO}).", err=True)
        sys.exit(2)

    paginas = sorted(p for p in entrada_dir.iterdir()
                     if p.suffix.lower() in {".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff"})
    click.echo(f"Simulado: {gabarito.get('simulado')} · {gabarito.get('etapa')}")
    for versao, itens in gabarito.get("versoes", {}).items():
        click.echo(f"  versão {versao}: {len(itens)} itens")
    click.echo(f"Digitalizações encontradas: {len(paginas)} arquivo(s) em {entrada_dir}")
    saida_dir.mkdir(parents=True, exist_ok=True)

    # Próxima fase: pipeline OMR (âncoras → homografia → bolhas → CSV).
    click.echo("Pipeline OMR ainda não implementado nesta fase — ver desktop/docs/pipeline-omr.md.")
    sys.exit(3)


if __name__ == "__main__":
    cli()
