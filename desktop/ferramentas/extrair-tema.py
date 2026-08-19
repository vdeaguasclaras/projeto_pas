#!/usr/bin/env python3
"""Extrai a identidade visual do sistema on-line para o aplicativo local.

A coordenação pediu a janela “seguindo o design do sistema on-line”. Numa janela
Qt não dá para reaproveitar o `css/estilo.css` — a folha de estilo do Qt é outra
linguagem. O que dá é não COPIAR as cores a olho: elas são lidas daqui, do
`:root` do CSS de verdade, e viram um módulo Python.

Isso não impede a divergência (o Qt desenha o resto à mão), mas tira dela a
parte que mais dói: o azul do sistema e o azul do aplicativo serem *quase* o
mesmo, e ninguém saber qual está certo.

    python3 desktop/ferramentas/extrair-tema.py

Rode ao mexer nas cores do sistema, e commite o `tema.py` gerado.
"""
from __future__ import annotations

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
CSS = RAIZ / "css" / "estilo.css"
ALVO = RAIZ / "desktop" / "src" / "leitor" / "ui" / "tema.py"


def variaveis(bloco: str) -> dict[str, str]:
    return {nome: valor.strip()
            for nome, valor in re.findall(r"--([\w-]+)\s*:\s*([^;}]+)", bloco)}


def bloco(css: str, seletor: str) -> str:
    inicio = css.index(seletor)
    return css[inicio:css.index("}", inicio)]


def main() -> int:
    css = CSS.read_text(encoding="utf-8")
    claro = variaveis(bloco(css, ":root{"))
    escuro = dict(claro)
    escuro.update(variaveis(bloco(css, ':root[data-theme="dark"]{')))

    def escrever(nome: str, tokens: dict[str, str]) -> str:
        linhas = "".join(f'    {chave!r}: {valor!r},\n'
                         for chave, valor in sorted(tokens.items()))
        return f"{nome} = {{\n{linhas}}}\n"

    ALVO.write_text(
        '"""As cores e as medidas do sistema on-line — GERADO, não escreva à mão.\n\n'
        "Saiu de `css/estilo.css` por `desktop/ferramentas/extrair-tema.py`. Ao mexer\n"
        "nas cores do sistema, rode a ferramenta de novo em vez de acertar os valores\n"
        "aqui: dois azuis quase iguais, e ninguém sabendo qual é o certo, é pior do\n"
        'que um só.\n"""\n\n'
        + escrever("CLARO", claro) + "\n" + escrever("ESCURO", escuro),
        encoding="utf-8")
    print(f"{len(claro)} variáveis do tema claro e {len(escuro)} do escuro → {ALVO}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
