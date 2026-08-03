"""CLI do leitor de cartões — esqueleto.

Uso previsto:
    python -m src.leitor.cli ler --gabarito pas-gabarito-pr-2em.json \
        --entrada ./digitalizacoes --saida ./resultado

Nesta fase o comando valida as entradas e descreve o que fará; o pipeline OMR
(desktop/docs/pipeline-omr.md) é implementado na fase seguinte.

O esqueleto nasceu validando `gabarito-v1`, quando cada versão da prova era uma
lista simples de itens. O sistema web hoje exporta `v3`, com uma FOLHA por tipo
de resposta (objetiva, discursiva, redação) e a identificação da prova — um
leitor preso à v1 recusaria todo arquivo que a escola consegue gerar. Este lê a
v3 e explica o que fazer quando vier arquivo antigo.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import click

FORMATO_GABARITO = "pas-marista/gabarito-v3"
FORMATOS_ANTIGOS = {"pas-marista/gabarito-v1", "pas-marista/gabarito-v2"}

# A única folha que o OMR lê: as outras são pauta (redação) ou percentuais
# marcados por quem corrige (discursiva).
FOLHA_LIDA = "objetiva"


@click.group(help="Leitor de cartões-resposta PAS Marista (OMR local).")
def cli() -> None:
    pass


def _folhas(versao) -> list[dict]:
    """As folhas de uma versão da prova, tolerando o formato antigo.

    Em v1 a versão ERA a lista de itens; em v3 é um dicionário com `folhas`.
    Aceitar os dois evita que um gabarito guardado de antes trave o leitor sem
    explicação.
    """
    if isinstance(versao, list):
        return [{"folha": 1, "tipo": FOLHA_LIDA, "itens": versao}]
    return versao.get("folhas", [])


@cli.command(help="Lê uma pasta de digitalizações e gera o CSV de respostas.")
@click.option("--gabarito", "gabarito_path", required=True, type=click.Path(exists=True, path_type=Path),
              help="Arquivo pas-gabarito-<prova>.json exportado pelo sistema web.")
@click.option("--entrada", "entrada_dir", required=True, type=click.Path(exists=True, file_okay=False, path_type=Path),
              help="Pasta com as digitalizações (PDF/JPEG/PNG, 300 dpi).")
@click.option("--saida", "saida_dir", default=Path("resultado"), type=click.Path(path_type=Path),
              help="Pasta de saída para respostas.csv e respostas_conferir.csv.")
def ler(gabarito_path: Path, entrada_dir: Path, saida_dir: Path) -> None:
    gabarito = json.loads(gabarito_path.read_text(encoding="utf-8"))
    formato = gabarito.get("formato")
    if formato in FORMATOS_ANTIGOS:
        click.echo(f"AVISO: gabarito em formato antigo ({formato}). Exporte de novo pelo "
                   f"sistema web para obter {FORMATO_GABARITO} — sem isso o leitor não sabe "
                   "de que prova é a folha.", err=True)
    elif formato != FORMATO_GABARITO:
        click.echo(f"ERRO: gabarito em formato inesperado ({formato!r}; "
                   f"esperava {FORMATO_GABARITO}).", err=True)
        sys.exit(2)

    prova = gabarito.get("prova") or {}
    click.echo(f"Simulado: {gabarito.get('simulado')} · {gabarito.get('etapa')}")
    if prova:
        click.echo(f"Prova: {prova.get('serie')} ({prova.get('id')})")

    for nome_versao, versao in (gabarito.get("versoes") or {}).items():
        folhas = _folhas(versao)
        objetivas = [f for f in folhas if f.get("tipo") == FOLHA_LIDA]
        n_itens = sum(len(f.get("itens", [])) for f in objetivas)
        outras = ", ".join(f.get("tipo", "?") for f in folhas if f.get("tipo") != FOLHA_LIDA)
        click.echo(f"  versão {nome_versao}: {len(folhas)} folha(s) por estudante · "
                   f"{n_itens} item(ns) com bolha na folha objetiva"
                   + (f" · também impressas: {outras}" if outras else ""))

    paginas = sorted(p for p in entrada_dir.iterdir()
                     if p.suffix.lower() in {".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff"})
    click.echo(f"Digitalizações encontradas: {len(paginas)} arquivo(s) em {entrada_dir}")
    saida_dir.mkdir(parents=True, exist_ok=True)

    # Próxima fase: pipeline OMR (âncoras → homografia → bolhas → CSV).
    click.echo("Pipeline OMR ainda não implementado — ver desktop/docs/pipeline-omr.md.")
    sys.exit(3)


if __name__ == "__main__":
    cli()
