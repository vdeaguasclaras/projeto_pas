"""O que sai do leitor: os CSVs e as miniaturas da fila de conferência.

Três arquivos, e cada um responde a uma pergunta diferente:

- `respostas.csv` — o que se leu sem dúvida. É este que entra no sistema web,
  em Correção e boletins → “Importar respostas (CSV do leitor)”.
- `respostas_conferir.csv` — o que NÃO se leu sem dúvida, com o motivo e, quando
  há, o palpite. Lançamento à mão, na mesma tela.
- `folhas.csv` — uma linha por página digitalizada. É o rastro: quantas folhas
  entraram, quais foram lidas, quais caíram fora e por quê. Sem ele, “12 folhas
  para conferência” é um número que não leva ninguém ao papel na pilha.

E as miniaturas: para toda página que precisa de olho humano, um PNG com o
cabeçalho recortado — o operador reconhece a folha sem procurar na pilha.
"""
from __future__ import annotations

import csv
from pathlib import Path

import cv2
import numpy as np

from .ancoras import em_pixels
from .correcao import NULO
from .leitura import Leitura


def _escrever(caminho: Path, cabecalho: list[str], linhas: list[list]) -> int:
    with caminho.open("w", encoding="utf-8", newline="") as arquivo:
        escritor = csv.writer(arquivo, delimiter=";", lineterminator="\n")
        escritor.writerow(cabecalho)
        escritor.writerows(linhas)
    return len(linhas)


def respostas(pasta: Path, leituras: list[Leitura]) -> int:
    linhas = [[l.matricula, m.item, m.resposta]
              for l in leituras for m in l.respostas if l.matricula]
    return _escrever(pasta / "respostas.csv", ["matricula", "item", "resposta"], linhas)


def conferir(pasta: Path, leituras: list[Leitura]) -> int:
    linhas = []
    for l in leituras:
        # A recusa da FOLHA vem primeiro, e vem mesmo quando há itens duvidosos
        # abaixo dela. São coisas diferentes: “o item 7 está rasurado” não conta
        # que a folha inteira ficou sem dono, e é essa a que manda o operador
        # procurar o papel na pilha. Antes ela sumia quando havia item na lista.
        if l.motivo and l.situacao not in ("lida", "referencia"):
            linhas.append([l.matricula, "", "", l.motivo, l.onde])
        for m in l.conferir:
            linhas.append([l.matricula, m.item, m.resposta, m.motivo or "", l.onde])
    return _escrever(pasta / "respostas_conferir.csv",
                     ["matricula", "item", "resposta", "motivo", "folha"], linhas)


def percentuais(pasta: Path, leituras: list[Leitura]) -> int:
    """As bolhas de percentual da folha discursiva — marcadas por quem corrige.

    Ficam num arquivo próprio porque não são resposta de estudante. O sistema web
    ainda não as importa (o lançamento do discursivo é por nota, na tela de
    Correção); o arquivo sai porque o dado foi lido e jogá-lo fora seria pedir
    que alguém o digitasse de novo.
    """
    linhas = [[l.matricula, m.item, m.resposta]
              for l in leituras for m in l.percentuais if l.matricula]
    if not linhas:
        return 0
    return _escrever(pasta / "percentuais.csv", ["matricula", "item", "percentual"], linhas)


def folhas(pasta: Path, leituras: list[Leitura]) -> int:
    linhas = []
    for l in leituras:
        i = l.identificacao
        linhas.append([
            l.onde, l.situacao,
            i.tipo if i else "", i.versao if i else "",
            i.folha if i else "", i.total if i else "",
            l.matricula, len(l.respostas), len(l.conferir), l.motivo,
        ])
    return _escrever(pasta / "folhas.csv",
                     ["folha", "situacao", "tipo", "versao", "numero", "total",
                      "matricula", "lidas", "a_conferir", "motivo"], linhas)


def _recortar(cinza: np.ndarray, matriz, caixa, px_por_pt: float = 5.0) -> np.ndarray | None:
    """Endireita e recorta um pedaço da folha, em pontos, para PNG.

    Não basta cortar um retângulo da digitalização: a folha está torta, e às
    vezes deitada. O mesmo mapeamento que serve para achar os alvéolos serve
    para desentortar o recorte — quem confere recebe a marcação em pé, do jeito
    que ela foi impressa.
    """
    x, y, largura, altura = caixa
    if largura <= 0 or altura <= 0:
        return None
    origem = em_pixels(matriz, [(x, y), (x + largura, y),
                                (x + largura, y + altura), (x, y + altura)])
    l, a = int(largura * px_por_pt), int(altura * px_por_pt)
    destino = np.float32([[0, 0], [l, 0], [l, a], [0, a]])
    matriz_recorte = cv2.getPerspectiveTransform(origem.astype(np.float32), destino)
    return cv2.warpPerspective(cinza, matriz_recorte, (l, a), borderValue=255)


# A folha de 595×842pt: o recorte com contexto não pode sair dela.
FOLHA_PT = (595.0, 842.0)


def _com_folga(caixa, folga: float = 46.0):
    """A mesma caixa, com folha em volta, sem passar da borda do cartão."""
    x, y, largura, altura = caixa
    x0, y0 = max(0.0, x - folga), max(0.0, y - folga * 0.6)
    x1 = min(FOLHA_PT[0], x + largura + folga)
    y1 = min(FOLHA_PT[1], y + altura + folga * 0.6)
    return (x0, y0, x1 - x0, y1 - y0)


def recortes(pasta: Path, cinza: np.ndarray, matriz, leitura: Leitura) -> list[dict]:
    """Uma imagem por marcação duvidosa — o que quem confere precisa VER.

    “O item 47 ficou duvidoso” não resolve nada sozinho: para decidir, alguém
    teria de achar o papel na pilha, achar a linha na folha e olhar. Com o
    recorte, a decisão é de dois segundos, na tela.
    """
    achados = []
    for marcacao in leitura.conferir:
        if not marcacao.caixa:
            continue
        pedaco = _recortar(cinza, matriz, marcacao.caixa)
        if pedaco is None:
            continue
        pasta.mkdir(parents=True, exist_ok=True)
        base = (f"{leitura.matricula or 'sem-matricula'}"
                f"-{leitura.onde.replace(':', '-p').replace('/', '_')}"
                f"-item-{marcacao.item:03d}")
        cv2.imwrite(str(pasta / f"{base}.png"), pedaco)

        # E um segundo recorte, com FOLHA EM VOLTA. O apertado responde “o que
        # está marcado aqui”; este responde “e o que há em volta” — a linha de
        # cima, a de baixo, o rótulo da coluna. É o que resolve a dúvida de
        # verdade: quase toda marcação duvidosa se explica pelo vizinho (um
        # traço que invadiu, uma rasura ao lado), e o recorte apertado esconde
        # exatamente isso.
        contexto = _recortar(cinza, matriz, _com_folga(marcacao.caixa), px_por_pt=4.0)
        nome_contexto = ""
        if contexto is not None:
            nome_contexto = f"conferencia/{base}-contexto.png"
            cv2.imwrite(str(pasta / f"{base}-contexto.png"), contexto)

        achados.append({
            "matricula": leitura.matricula, "item": marcacao.item,
            "resposta": marcacao.resposta, "motivo": marcacao.motivo or "",
            "folha": leitura.onde, "imagem": f"conferencia/{base}.png",
            "contexto": nome_contexto,
        })
    return achados


def _esc(texto) -> str:
    return (str(texto).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def conferencia(pasta: Path, molde_prova: dict, achados: list[dict]) -> Path | None:
    """A tela de conferência, numa página HTML que abre sem instalar nada.

    O leitor recusa o que não é inequívoco — essa é a regra que sustenta tudo —,
    e o preço disso é uma fila de marcações para alguém olhar. Esta página é
    para tornar esse preço pequeno: cada linha traz o RECORTE do papel, o que o
    leitor achou que era, e um campo para corrigir. No fim, um botão monta o CSV
    com o que foi decidido, pronto para colar em “Importar respostas”.

    É HTML e JavaScript soltos, como o resto do projeto: abre com dois cliques,
    funciona sem internet e não precisa de programa nenhum instalado. A interface
    gráfica do leitor, quando vier, faz isto dentro do próprio aplicativo.
    """
    if not achados:
        return None
    linhas = "".join(f"""
    <tr>
      <td class="img"><img src="{_esc(a['imagem'])}" alt="marcação do item {a['item']}"></td>
      <td class="mat">{_esc(a['matricula'] or '—')}</td>
      <td class="num">{a['item']}</td>
      <td class="motivo">{_esc(a['motivo'])}<small>{_esc(a['folha'])}</small></td>
      <td><input value="{_esc(NULO if 'dupla_marcacao' in a['motivo'] else a['resposta'])}"
                 data-mat="{_esc(a['matricula'])}"
                 data-item="{a['item']}" size="6" autocomplete="off"></td>
    </tr>""" for a in achados)

    alvo = pasta / "conferencia.html"
    alvo.write_text(f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Conferência — {_esc(molde_prova.get('serie', ''))}</title>
<style>
 body{{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:0;background:#f5f2ee;color:#221c16}}
 header{{background:#0d2f8a;color:#fff;padding:16px 24px}}
 header h1{{margin:0;font-size:18px}} header p{{margin:4px 0 0;font-size:13px;opacity:.85}}
 main{{padding:20px 24px 80px;max-width:1000px;margin:0 auto}}
 table{{border-collapse:collapse;width:100%;background:#fff;border-radius:10px;overflow:hidden}}
 th,td{{padding:8px 10px;border-bottom:1px solid #e7e0d8;text-align:left;font-size:13px;vertical-align:middle}}
 th{{background:#efeae3;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b5f52}}
 td.img img{{display:block;max-width:340px;border:1px solid #ddd;border-radius:4px}}
 td.mat{{font-family:ui-monospace,Consolas,monospace}} td.num{{font-weight:700;text-align:right}}
 td.motivo{{color:#8a5a00}} td.motivo small{{display:block;color:#9a9088;font-size:11px}}
 input{{font:inherit;font-family:ui-monospace,Consolas,monospace;text-transform:uppercase;
   padding:6px 8px;border:1.5px solid #c9bfb4;border-radius:6px;width:76px}}
 .pe{{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #e0d8ce;
   padding:12px 24px;display:flex;gap:12px;align-items:center;justify-content:center}}
 button{{font:inherit;font-weight:600;background:#e5007e;color:#fff;border:0;
   padding:10px 18px;border-radius:8px;cursor:pointer}}
 textarea{{width:100%;height:140px;font-family:ui-monospace,Consolas,monospace;font-size:12px;
   margin-top:14px;border:1px solid #c9bfb4;border-radius:8px;padding:10px}}
</style></head><body>
<header>
  <h1>Conferência da leitura óptica — {_esc(molde_prova.get('serie', ''))}</h1>
  <p>{len(achados)} marcação(ões) que o leitor não leu com certeza. Confira no recorte,
     corrija o que estiver errado e apague o campo quando no papel não houver marca nenhuma.
     <b>Dupla marcação é item anulado</b> — deixe <b>{NULO}</b> no campo: vale como erro e sai
     marcado no boletim. O que ficar sem decisão não entra em nota nenhuma.</p>
</header>
<main>
<table><thead><tr><th>Marcação no papel</th><th>Matrícula</th><th>Item</th>
  <th>Por que veio parar aqui</th><th>Resposta</th></tr></thead>
<tbody>{linhas}</tbody></table>
<textarea id="csv" readonly placeholder="O CSV corrigido aparece aqui."></textarea>
</main>
<div class="pe">
  <button id="montar">Montar o CSV corrigido</button>
  <span id="aviso"></span>
</div>
<script>
document.getElementById('montar').onclick = () => {{
  const linhas = ['matricula;item;resposta'];
  let vazias = 0;
  for (const campo of document.querySelectorAll('input[data-item]')) {{
    const mat = campo.dataset.mat.trim(), valor = campo.value.trim().toUpperCase();
    // Sem matrícula não dá para lançar: é a folha que o leitor não identificou,
    // e ela precisa ser resolvida antes, no papel.
    if (!mat) {{ vazias++; continue; }}
    linhas.push(`${{mat}};${{campo.dataset.item}};${{valor}}`);
  }}
  const csv = linhas.join(String.fromCharCode(10));
  document.getElementById('csv').value = csv;
  navigator.clipboard?.writeText(csv);
  document.getElementById('aviso').textContent =
    `${{linhas.length - 1}} linha(s) prontas para colar em “Importar respostas”` +
    (vazias ? ` · ${{vazias}} sem matrícula ficaram de fora` : '');
}};
</script>
</body></html>""", encoding="utf-8")
    return alvo


def miniatura(pasta: Path, cinza: np.ndarray, matriz, campo: dict | None,
              nome: str) -> Path | None:
    """Recorta o cabeçalho da folha para o operador reconhecê-la.

    Com a homografia, recorta o campo da matrícula impressa; sem ela — que é
    justamente o caso `sem_ancoras` —, salva a página inteira reduzida, que é o
    que sobra para identificar o papel.
    """
    pasta.mkdir(parents=True, exist_ok=True)
    alvo = pasta / f"{nome}.png"
    if matriz is not None and campo:
        folga = 6.0
        cantos = em_pixels(matriz, [
            (campo["x"] - folga, campo["y"] - folga),
            (campo["x"] + campo["largura"] + folga, campo["y"] - folga),
            (campo["x"] + campo["largura"] + folga, campo["y"] + campo["altura"] + folga),
            (campo["x"] - folga, campo["y"] + campo["altura"] + folga)])
        x0, y0 = np.floor(cantos.min(axis=0)).astype(int)
        x1, y1 = np.ceil(cantos.max(axis=0)).astype(int)
        altura, largura = cinza.shape[:2]
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(largura, x1), min(altura, y1)
        if x1 - x0 > 10 and y1 - y0 > 10:
            cv2.imwrite(str(alvo), cinza[y0:y1, x0:x1])
            return alvo
    reduzida = cv2.resize(cinza, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(alvo), reduzida)
    return alvo
