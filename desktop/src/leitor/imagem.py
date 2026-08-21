"""Ingestão: transforma a pasta de digitalizações numa sequência de páginas.

O scanner da secretaria salva PDF de várias páginas; alguns salvam uma imagem
por folha. Os dois entram por aqui e saem iguais: uma matriz em tons de cinza,
com o nome do arquivo e o número da página, para que qualquer recusa mais
adiante saiba dizer QUAL folha recusou. Relatório que diz “12 folhas foram para
conferência” sem dizer quais não serve para o operador achar o papel na pilha.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

EXTENSOES = {".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}
DPI_PADRAO = 300


@dataclass
class Pagina:
    arquivo: Path
    numero: int          # 1-based dentro do arquivo
    cinza: np.ndarray

    @property
    def onde(self) -> str:
        return f"{self.arquivo.name}:{self.numero}"


def digitalizacoes(caminho: Path) -> list[Path]:
    """As digitalizações de uma PASTA ou de um ARQUIVO só, em ordem.

    A pasta é o caso do lote grande, e a ordem dos arquivos é a ordem da pilha.
    O arquivo único é o caso comum e foi o que faltava: o scanner da secretaria
    salva o lote inteiro num PDF de várias páginas, e esse PDF vai parar em
    Downloads ou na Área de Trabalho, no meio de centenas de outros arquivos.
    Mandar a pasta ali seria mandar ler tudo o que houver de PDF e de imagem
    dentro dela.
    """
    caminho = Path(caminho)
    if caminho.is_file():
        return [caminho] if caminho.suffix.lower() in EXTENSOES else []
    return sorted(p for p in caminho.iterdir()
                  if p.is_file() and p.suffix.lower() in EXTENSOES)


def _do_pdf(caminho: Path, dpi: int):
    import pypdfium2 as pdfium
    documento = pdfium.PdfDocument(caminho)
    try:
        for i in range(len(documento)):
            imagem = documento[i].render(scale=dpi / 72, grayscale=True).to_numpy()
            # pypdfium2 devolve (altura, largura) no cinza e (…, 1) em algumas
            # versões; achatar aqui evita espalhar `squeeze` pelo resto.
            yield Pagina(caminho, i + 1, imagem if imagem.ndim == 2 else imagem[:, :, 0])
    finally:
        documento.close()


def _da_imagem(caminho: Path):
    bruto = cv2.imread(str(caminho), cv2.IMREAD_GRAYSCALE)
    if bruto is None:
        raise ValueError(f"não consegui abrir {caminho.name}")
    yield Pagina(caminho, 1, bruto)


def contar_paginas(arquivos: list[Path]) -> int:
    """Quantas páginas o lote tem, sem rasterizar nenhuma.

    A barra de progresso precisa do total antes de começar, e abrir os PDFs só
    para contar custa milissegundos — rasterizar custa segundos por página.
    """
    total = 0
    for caminho in arquivos:
        if caminho.suffix.lower() != ".pdf":
            total += 1
            continue
        import pypdfium2 as pdfium
        documento = pdfium.PdfDocument(caminho)
        try:
            total += len(documento)
        finally:
            documento.close()
    return total


def paginas(arquivos: list[Path], dpi: int = DPI_PADRAO):
    """Todas as páginas dos arquivos, na ordem em que vieram."""
    for caminho in arquivos:
        if caminho.suffix.lower() == ".pdf":
            yield from _do_pdf(caminho, dpi)
        else:
            yield from _da_imagem(caminho)
