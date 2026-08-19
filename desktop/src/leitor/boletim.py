"""O boletim de desempenho individual, em HTML pronto para imprimir.

O desenho é o do sistema on-line — mesmo cabeçalho em degradê azul, mesmas
barras por grupo de habilidades com o traço rosa da média da turma, mesmos três
números em destaque. O CSS abaixo foi copiado de `css/estilo.css` (as regras
`.bol-*` e `.hbar`), e é bom que continue reconhecível: a família recebe este
papel em casa, e ele tem de parecer da mesma escola que mandou o cartão.

Duas diferenças em relação ao boletim da tela, e as duas de propósito:

- **o gabarito sai inteiro, não um trecho.** Na tela, mostrar dez itens era
  economia de espaço numa prévia; no papel que vai para casa, o estudante quer
  conferir a prova toda — e numa prova de 110 itens dez não dizem nada;
- **o boletim não se parte entre folhas.** É a mesma regra do caderno: meio
  boletim numa página e meio na seguinte é um documento que ninguém consegue ler
  junto.
"""
from __future__ import annotations

from pathlib import Path

from .correcao import Resultado, medias_da_turma
from .pacote import Pacote

# Copiado de css/estilo.css — regras .folha, .bol-*, .hbar. Ao mexer no boletim
# da tela, mexa aqui também: o estudante recebe os dois, e são o mesmo documento.
ESTILO = """
  *{box-sizing:border-box}
  body{margin:0;background:#e9e4de;font-family:Arial,Helvetica,sans-serif;padding:18px}
  .bol{background:#fff;color:#111;width:520px;max-width:100%;margin:0 auto 18px;
    box-shadow:0 3px 10px rgba(0,0,0,.28);break-inside:avoid;page-break-inside:avoid}
  .bol-cab{background:linear-gradient(115deg,#0d2f8a,#1d5cff);color:#fff;padding:12px 16px}
  .bol-cab h4{margin:0;font-size:13px}
  .bol-cab p{margin:2px 0 0;font-size:10px;opacity:.88}
  .bol-sec{padding:12px 16px;border-bottom:1px solid #eee}
  .bol-sec h5{margin:0 0 8px;font-size:10px;color:#e5007e;text-transform:uppercase;letter-spacing:.5px}
  .hbar{display:flex;align-items:center;gap:8px;font-size:9.5px;margin:5px 0;color:#333}
  .hbar span{min-width:64px}
  .hbar .trilho{flex:1;height:9px;background:#eef1fb;border-radius:99px;overflow:hidden}
  .hbar .trilho i{display:block;height:100%;background:linear-gradient(90deg,#1d5cff,#06b6d4);border-radius:99px}
  .hbar .trilho i.media{background:#e5007e;height:4px;margin-top:-6.5px;opacity:.8}
  .bol-notas{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px 16px}
  .bol-notas.sem-red{grid-template-columns:repeat(2,1fr)}
  .bol-nota{border:1px solid #eee;border-radius:8px;padding:8px;text-align:center}
  .bol-nota b{display:block;font-size:16px;color:#0d2f8a;font-variant-numeric:tabular-nums}
  .bol-nota span{font-size:8px;color:#777;text-transform:uppercase;letter-spacing:.4px}
  .legenda{font-size:7.5px;color:#777;margin-top:5px}
  .grade{display:flex;flex-wrap:wrap;gap:3px}
  .cel{border:1px solid #eee;border-radius:4px;padding:2px 0;width:34px;text-align:center;
    font-family:ui-monospace,Consolas,monospace;font-size:8px;line-height:1.35}
  .cel u{display:block;text-decoration:none;color:#8a8178;font-size:7px}
  .cel b{display:block;font-size:9px}
  .cel.certa b{color:#12b76a} .cel.errada b{color:#e5484d} .cel.branca b{color:#b9b1a8}
  .cel small{display:block;color:#9a9088;font-size:6.5px}
  @media print{
    body{background:#fff;padding:0}
    .bol{box-shadow:none;width:100%;margin:0 0 10mm;border:1px solid #ddd}
    .bol-cab,.cel.certa b,.cel.errada b{print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .hbar .trilho,.hbar .trilho i{print-color-adjust:exact;-webkit-print-color-adjust:exact}
    @page{size:A4;margin:12mm}
  }
"""


def _esc(texto) -> str:
    return (str(texto).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def _num(valor, casas: int = 2) -> str:
    if valor is None:
        return "—"
    return f"{valor:.{casas}f}".replace(".", ",")


def _barras(resultado: Resultado, medias: dict[str, float], grupos: list[str]) -> str:
    partes = []
    for grupo in grupos:
        dados = resultado.por_grupo.get(grupo)
        if not dados or not dados.total:
            continue
        media = medias.get(grupo, 0.0)
        partes.append(
            f'<div class="hbar"><span>{_esc(grupo)}</span><div class="trilho">'
            f'<i style="width:{round(dados.proporcao * 100)}%"></i>'
            f'<i class="media" style="width:{round(media * 100)}%"></i></div>'
            f'<b style="font-size:9px">{_num(dados.proporcao)}</b></div>')
    return "".join(partes) or '<p style="font-size:9px;color:#777">Sem itens corrigidos.</p>'


def _grade(resultado: Resultado) -> str:
    celulas = []
    for d in resultado.detalhes:
        classe = "branca" if d.marcada is None else ("certa" if d.certa else "errada")
        celulas.append(
            f'<div class="cel {classe}"><u>{d.numero}</u>'
            f'<b>{_esc(d.marcada or "—")}</b><small>{_esc(d.gabarito)}</small></div>')
    return f'<div class="grade">{"".join(celulas)}</div>'


def html_de(pacote: Pacote, resultado: Resultado, medias: dict[str, float]) -> str:
    """Um boletim."""
    prova = pacote.molde.prova
    est = resultado.estudante
    com_redacao = pacote.tem_redacao
    nota_nr = (f'<div class="bol-nota"><b>{_num(resultado.nr, 1)}</b>'
               f'<span>Redação (NR)</span></div>') if com_redacao else ""
    posicao = f"{resultado.posicao}º" if resultado.posicao else "—"
    return f"""
  <div class="bol">
    <div class="bol-cab"><h4>Boletim de Desempenho Individual</h4>
      <p>{_esc(prova.get('nome', ''))} · {_esc(prova.get('serie', ''))} ·
         {_esc(prova.get('etapa', ''))} · {_esc(est.nome).upper()} ·
         Matrícula {_esc(est.matricula)} · {_esc(est.turma)}</p></div>
    <div class="bol-sec">
      <h5>Proporção de acertos por grupo de habilidades</h5>
      {_barras(resultado, medias, pacote.escore.grupos)}
      <div class="legenda">Barra azul: estudante · traço rosa: média da turma</div>
    </div>
    <div class="bol-notas{'' if com_redacao else ' sem-red'}">
      <div class="bol-nota"><b>{_num(resultado.escore)}</b><span>Escore bruto</span></div>
      {nota_nr}
      <div class="bol-nota"><b>{posicao}</b><span>de {resultado.de or 1}</span></div>
    </div>
    <div class="bol-sec" style="border-bottom:none">
      <h5>Suas marcações × gabarito</h5>
      {_grade(resultado)}
      <div class="legenda">Em cada quadro: número do item, o que você marcou e, embaixo,
        a resposta certa. Verde acertou, vermelho errou, cinza ficou em branco.</div>
    </div>
  </div>"""


def escrever(pasta: Path, pacote: Pacote, resultados: list[Resultado]) -> Path | None:
    """Todos os boletins numa página só, pronta para imprimir ou salvar em PDF."""
    com_resposta = [r for r in resultados if r.tem_resposta]
    if not com_resposta:
        return None
    com_resposta.sort(key=lambda r: (r.estudante.turma, r.estudante.nome))
    medias_por_turma: dict[str, dict[str, float]] = {}
    corpo = []
    for r in com_resposta:
        turma = r.estudante.turma
        if turma not in medias_por_turma:
            medias_por_turma[turma] = medias_da_turma(resultados, turma, pacote.escore.grupos)
        corpo.append(html_de(pacote, r, medias_por_turma[turma]))

    prova = pacote.molde.prova
    alvo = pasta / "boletins.html"
    alvo.write_text(f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Boletins — {_esc(prova.get('serie', ''))}</title>
<style>{ESTILO}</style></head><body>
{''.join(corpo)}
</body></html>""", encoding="utf-8")
    return alvo
