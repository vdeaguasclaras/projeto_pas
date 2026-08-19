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

import csv
import sys
from pathlib import Path

import click

from . import __version__
from .ancoras import SemAncoras, girar, homografia, voltas_para_endireitar
from .codigo import FaixaIlegivel
from .imagem import DPI_PADRAO, Pagina, digitalizacoes, paginas
from .leitura import Leitura, Limiares, calibrar, ler_faixa, ler_folha, limiar_de_tinta
from .molde import GabaritoIncompativel, Molde
from . import boletim, saida
from .correcao import corrigir_todos
from .pacote import Pacote, carregar

# Quantas páginas do começo da pilha são varridas atrás do cartão-gabarito antes
# de a leitura começar. O sistema o imprime na frente; esta folga cobre a capa
# de rosto que a secretaria às vezes põe por cima, e custa segundos.
TOPO_DA_PILHA = 8


@click.group(help="Leitor de cartões-resposta PAS Marista (OMR local).")
@click.version_option(__version__)
def cli() -> None:
    pass


def _pacote(caminho: Path) -> Pacote:
    try:
        return carregar(caminho)
    except GabaritoIncompativel as erro:
        click.echo(f"ERRO: {erro}", err=True)
        sys.exit(2)


def _marcacoes_dos_csv(pacote: Pacote, caminhos: list[Path]) -> tuple[dict, int, int]:
    """Junta as marcações de um ou mais CSVs, na ordem em que vierem.

    A ordem importa: o CSV da conferência vem DEPOIS do da leitura, e o que a
    pessoa decidiu olhando o recorte vale sobre o que a máquina achou. Resposta
    vazia apaga a marcação, como na importação do sistema on-line.
    """
    marcacoes: dict[str, dict[int, str]] = {}
    lidas = fora = 0
    for caminho in caminhos:
        if not caminho or not caminho.exists():
            continue
        with caminho.open(encoding="utf-8-sig") as arquivo:
            for linha in csv.DictReader(arquivo, delimiter=";"):
                matricula = (linha.get("matricula") or "").strip()
                numero = (linha.get("item") or "").strip()
                if not matricula or not numero.isdigit():
                    continue
                estudante = pacote.casar(matricula)
                if estudante is None:
                    fora += 1
                    continue
                resposta = (linha.get("resposta") or "").strip().upper()
                alvo = marcacoes.setdefault(estudante.matricula, {})
                if resposta:
                    alvo[int(numero)] = resposta
                    lidas += 1
                else:
                    alvo.pop(int(numero), None)
    return marcacoes, lidas, fora


def _resultados(pacote: Pacote, marcacoes: dict, saida_dir: Path) -> None:
    """Corrige, grava a planilha de resultados e monta os boletins."""
    resultados = corrigir_todos(pacote, marcacoes)
    linhas = []
    for r in sorted(resultados, key=lambda r: (r.estudante.turma, r.estudante.nome)):
        if not r.tem_resposta:
            continue
        linhas.append([
            r.estudante.matricula, r.estudante.nome, r.estudante.turma, r.estudante.versao,
            r.acertos, r.erros, r.brancos,
            f"{r.escore:.2f}".replace(".", ","),
            "" if r.nr is None else f"{r.nr:.1f}".replace(".", ","),
            r.posicao or "", r.de or "",
            *[f"{r.por_grupo[g].proporcao:.2f}".replace(".", ",") if g in r.por_grupo
              and r.por_grupo[g].total else "" for g in pacote.escore.grupos],
        ])
    cabecalho = ["matricula", "nome", "turma", "versao", "certas", "erradas", "brancos",
                 "escore_bruto", "redacao_nr", "posicao", "de",
                 *[f"grupo_{g.lower()}" for g in pacote.escore.grupos]]
    with (saida_dir / "resultados.csv").open("w", encoding="utf-8", newline="") as arquivo:
        escritor = csv.writer(arquivo, delimiter=";", lineterminator="\n")
        escritor.writerow(cabecalho)
        escritor.writerows(linhas)
    pagina = boletim.escrever(saida_dir, pacote, resultados)
    click.echo(f"{len(linhas)} estudante(s) em {saida_dir / 'resultados.csv'}")
    if pagina:
        click.echo(f"Boletins de desempenho em {pagina}")


def _alinhar(pagina: Pagina, molde: Molde):
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
    pacote = _pacote(gabarito_path)
    molde = pacote.molde
    click.echo(f"Simulado: {molde.simulado} · {molde.etapa}")
    click.echo(f"Prova: {molde.prova.get('serie')} ({molde.prova.get('id')})")

    arquivos = digitalizacoes(entrada_dir)
    if not arquivos:
        click.echo(f"ERRO: nenhuma digitalização em {entrada_dir}.", err=True)
        sys.exit(2)
    click.echo(f"Digitalizações: {len(arquivos)} arquivo(s) em {entrada_dir}")

    limiares, avisos, divergencias = _procurar_referencia(arquivos, molde, dpi)
    click.echo(f"Limiar de tinta: {limiares}")
    for aviso in avisos + divergencias:
        click.echo(f"  ATENÇÃO — {aviso}", err=True)

    saida_dir.mkdir(parents=True, exist_ok=True)
    pasta_conferencia = saida_dir / "conferencia"
    leituras: list[Leitura] = []
    achados: list[dict] = []

    with click.progressbar(paginas(arquivos, dpi), label="Lendo") as fila:
        for pagina in fila:
            leitura, cinza, matriz = _ler_pagina(pagina, molde, limiares)
            if leitura.identificacao and leitura.identificacao.eh_referencia:
                # A folha de referência não é de estudante: ela não gera resposta.
                leitura.respostas.clear()
                leitura.conferir.clear()
                leitura.situacao = "referencia"
            leituras.append(leitura)
            if matriz is not None:
                achados.extend(saida.recortes(pasta_conferencia, cinza, matriz, leitura))
            if leitura.situacao not in ("lida", "referencia"):
                saida.miniatura(pasta_conferencia, cinza, matriz, molde.campo_matricula,
                                pagina.onde.replace(":", "-p"))

    n_resp = saida.respostas(saida_dir, leituras)
    n_conf = saida.conferir(saida_dir, leituras)
    n_perc = saida.percentuais(saida_dir, leituras)
    saida.folhas(saida_dir, leituras)
    pagina_conferencia = saida.conferencia(saida_dir, molde.prova, achados)

    lidas = sum(1 for l in leituras if l.situacao == "lida")
    referencia = sum(1 for l in leituras if l.situacao == "referencia")
    # Lote inteiro deitado é o scanner configurado de lado. O leitor resolve
    # sozinho, mas quem opera merece saber — na próxima vez sai mais rápido.
    deitadas = sum(1 for l in leituras if l.voltas % 2)
    click.echo(f"\n{len(leituras)} página(s) · {lidas} lida(s) · {referencia} de referência · "
               f"{len(leituras) - lidas - referencia} para conferência")
    click.echo(f"{n_resp} marcação(ões) em respostas.csv")
    click.echo(f"{n_conf} linha(s) em respostas_conferir.csv")
    if n_perc:
        click.echo(f"{n_perc} percentual(is) de acerto em percentuais.csv")
    click.echo(f"Rastro folha a folha em {saida_dir / 'folhas.csv'}")
    if pagina_conferencia:
        click.echo(f"\nPara conferir o que ficou em dúvida, com a imagem de cada marcação:\n"
                   f"  {pagina_conferencia}")

    # E a correção, quando o arquivo é o pacote da prova e não o gabarito sozinho.
    if pacote.tem_boletim:
        click.echo("")
        marcacoes, _, fora = _marcacoes_dos_csv(pacote, [saida_dir / "respostas.csv"])
        if fora:
            click.echo(f"{fora} marcação(ões) de estudante fora do elenco desta prova, ignoradas.",
                       err=True)
        _resultados(pacote, marcacoes, saida_dir)
    else:
        click.echo("\nSem elenco no arquivo — só a leitura. Para os resultados e os boletins, "
                   "exporte o PACOTE da prova em Cartões-resposta.")
    if deitadas:
        click.echo(f"{deitadas} folha(s) entraram deitadas na mesa e foram endireitadas aqui — "
                   "digitalizar em pé é mais rápido.")
    if divergencias:
        click.echo("\nO cartão-gabarito impresso divergiu do gabarito exportado. Confira antes de "
                   "importar: alguém pode ter mexido nos itens depois de imprimir os cartões.",
                   err=True)
        sys.exit(1)


def _ler_pagina(pagina: Pagina, molde: Molde, limiares: Limiares):
    """Uma página, do começo ao fim. Nunca levanta: recusa é resultado."""
    try:
        cinza, matriz, ident, voltas = _alinhar(pagina, molde)
    except SemAncoras as erro:
        return (Leitura(onde=pagina.onde, situacao="descartada", motivo=f"sem_ancoras: {erro}"),
                pagina.cinza, None)
    except FaixaIlegivel as erro:
        return (Leitura(onde=pagina.onde, situacao="conferir", motivo=f"faixa_ilegivel: {erro}"),
                pagina.cinza, None)
    leitura = ler_folha(cinza, matriz, molde, ident, limiares, pagina.onde)
    leitura.voltas = voltas
    return leitura, cinza, matriz


def _procurar_referencia(arquivos: list[Path], molde: Molde, dpi: int):
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
    achou_referencia = False
    for indice, pagina in enumerate(paginas(arquivos, dpi)):
        if indice >= TOPO_DA_PILHA:
            break
        try:
            cinza, matriz, ident, _ = _alinhar(pagina, molde)
        except (SemAncoras, FaixaIlegivel):
            continue
        if not ident.eh_referencia:
            continue
        achou_referencia = True
        medido, achados = calibrar(cinza, matriz, molde, ident)
        divergencias.extend(achados)
        if medido.origem != "padrão":
            limiares = medido
    avisos = [] if achou_referencia else [
        "não achei o cartão-gabarito no topo da pilha — o limiar de tinta fica no padrão, "
        "e o lote segue sem a conferência entre o papel e o gabarito exportado"]
    return limiares, avisos, divergencias


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
    marcacoes, lidas, fora = _marcacoes_dos_csv(pacote, list(respostas_csv))
    click.echo(f"Prova: {pacote.molde.prova.get('serie')} · {lidas} marcação(ões) de "
               f"{len(marcacoes)} estudante(s)")
    if fora:
        click.echo(f"{fora} marcação(ões) de estudante fora do elenco desta prova, ignoradas.",
                   err=True)
    _resultados(pacote, marcacoes, saida_dir)


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
