"""O molde do cartão — a geometria com que o leitor procura cada alvéolo.

**Nada aqui é medida escrita à mão, e é de propósito.** Onde fica cada alvéolo
na folha nasce do flex do CSS do sistema web: muda com o número de itens, com a
quantidade de colunas, com a altura do bloco de orientações. Um leitor com a
geometria decorada do lado de cá acertaria hoje e erraria calado na primeira vez
que alguém mexesse numa medida do cartão — que é o defeito que a régua do
próprio cartão (`medirCartao`, js/app.js) existe para não repetir.

Então o navegador mede o cartão montado e manda tudo dentro do gabarito, no
formato `pas-marista/gabarito-v4`. Este módulo só lê o que veio.

As coordenadas estão em PONTOS, na folha de 595×842pt, com origem no canto
superior esquerdo — o mesmo sistema em que as âncoras foram medidas.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

FORMATO = "pas-marista/gabarito-v4"
FORMATOS_ANTIGOS = {
    "pas-marista/gabarito-v1", "pas-marista/gabarito-v2", "pas-marista/gabarito-v3",
}


class GabaritoIncompativel(Exception):
    """O arquivo não serve de molde — e a mensagem diz o que fazer."""


@dataclass(frozen=True)
class Alveolo:
    """Um alvéolo e o que ele significa, já em pontos da folha."""
    x: float
    y: float
    r: float


@dataclass
class Folha:
    """Uma folha do cartão, com os alvéolos agrupados pelo que decidem.

    O agrupamento é o que permite decidir por CONJUNTO em vez de por alvéolo
    solto: “o item 7 tem duas marcas” é uma afirmação sobre o grupo, e é a que
    manda a folha para conferência em vez de inventar resposta.
    """
    tipo: str                                          # objetiva · discursiva · redacao
    itens: dict[int, dict[str, Alveolo]] = field(default_factory=dict)
    tipo_b: dict[int, dict[str, dict[int, Alveolo]]] = field(default_factory=dict)
    matricula: dict[int, dict[int, Alveolo]] = field(default_factory=dict)
    percentuais: dict[int, dict[int, Alveolo]] = field(default_factory=dict)

    @property
    def tem_alveolo(self) -> bool:
        return bool(self.itens or self.tipo_b or self.matricula or self.percentuais)


@dataclass
class Molde:
    """O cartão inteiro: as âncoras, a faixa do rodapé e as folhas de cada versão."""
    prova: dict
    simulado: str
    etapa: str
    ancoras: list[tuple[float, float]]
    codigo: list[tuple[float, float]]
    codigo_largura: float
    codigo_altura: float
    campo_matricula: dict | None
    folha_pt: tuple[float, float]
    familias: dict[tuple[str, str], list[Folha]]
    tipos_do_item: dict[tuple[str, int], str]
    gabarito: dict[tuple[str, int], str]

    def folhas(self, versao: str, familia: str) -> list[Folha]:
        chave = (versao, familia)
        if chave not in self.familias:
            raise GabaritoIncompativel(
                f"o gabarito não traz o molde {familia} da versão {versao} — "
                "exporte-o de novo pela tela de Cartões-resposta")
        return self.familias[chave]

    def folha(self, versao: str, familia: str, numero: int) -> Folha | None:
        folhas = self.folhas(versao, familia)
        return folhas[numero - 1] if 1 <= numero <= len(folhas) else None

    def tipo_do_item(self, versao: str, numero: int) -> str | None:
        return self.tipos_do_item.get((versao, numero))


def _alveolos(brutos: list[dict], folha: Folha) -> None:
    for a in brutos:
        alv = Alveolo(float(a["x"]), float(a["y"]), float(a["r"]))
        if a.get("campo") == "matricula":
            folha.matricula.setdefault(int(a["posicao"]), {})[int(a["digito"])] = alv
        elif "valor" in a:
            folha.itens.setdefault(int(a["item"]), {})[str(a["valor"])] = alv
        elif "coluna" in a:
            folha.tipo_b.setdefault(int(a["item"]), {}) \
                        .setdefault(str(a["coluna"]), {})[int(a["digito"])] = alv
        elif "percentual" in a:
            folha.percentuais.setdefault(int(a["item"]), {})[int(a["percentual"])] = alv


def carregar(caminho: Path) -> Molde:
    """Lê o gabarito exportado e monta o molde. Recusa formato sem geometria."""
    dados = json.loads(Path(caminho).read_text(encoding="utf-8"))
    formato = dados.get("formato")
    if formato in FORMATOS_ANTIGOS:
        raise GabaritoIncompativel(
            f"este gabarito é {formato}, e não traz a geometria do cartão. Exporte-o de novo "
            f"em Cartões-resposta → “Exportar gabarito p/ leitor local (JSON)”, que hoje sai "
            f"em {FORMATO}. Sem a geometria o leitor não sabe onde procurar os alvéolos — e "
            "adivinhá-la seria pior do que recusar.")
    if formato != FORMATO:
        raise GabaritoIncompativel(f"formato inesperado ({formato!r}; esperava {FORMATO})")

    layout = dados.get("layout")
    if not layout:
        raise GabaritoIncompativel(
            "o gabarito veio sem `layout` — provavelmente foi exportado de uma prova sem "
            "nenhum item aprovado. Aprove os itens e exporte de novo.")

    familias: dict[tuple[str, str], list[Folha]] = {}
    for versao, por_familia in (layout.get("cartoes") or {}).items():
        for familia, cartao in por_familia.items():
            folhas = []
            for bruta in cartao.get("folhas", []):
                f = Folha(tipo=bruta.get("tipo", "objetiva"))
                _alveolos(bruta.get("alveolos", []), f)
                folhas.append(f)
            familias[(versao, familia)] = folhas

    tipos: dict[tuple[str, int], str] = {}
    chave: dict[tuple[str, int], str] = {}
    for versao, conteudo in (dados.get("versoes") or {}).items():
        for folha in conteudo.get("folhas", []):
            for item in folha.get("itens", []) or []:
                tipos[(versao, int(item["numero"]))] = str(item.get("tipo", "?"))
                if item.get("gabarito") not in (None, ""):
                    chave[(versao, int(item["numero"]))] = str(item["gabarito"])

    cod = layout.get("codigo") or {}
    folha_pt = layout.get("folhaPt") or {}
    return Molde(
        prova=dados.get("prova") or {},
        simulado=dados.get("simulado") or "",
        etapa=dados.get("etapa") or "",
        ancoras=[(float(a["x"]), float(a["y"])) for a in layout["ancoras"]],
        codigo=[(float(c["x"]), float(c["y"])) for c in cod.get("celulas", [])],
        codigo_largura=float(cod.get("largura", 4.2)),
        codigo_altura=float(cod.get("altura", 5.0)),
        campo_matricula=(layout.get("campos") or {}).get("matricula"),
        folha_pt=(float(folha_pt.get("largura", 595)), float(folha_pt.get("altura", 842))),
        familias=familias,
        tipos_do_item=tipos,
        gabarito=chave,
    )
