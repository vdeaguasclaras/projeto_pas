"""O boletim de desempenho individual, em HTML pronto para imprimir.

A estrutura é a do boletim do PAS/UnB, que a coordenação trouxe como modelo: a
faixa de título, a identificação, o grau de desenvolvimento por grupo de
habilidades com as barras comparadas, a legenda das marcações, o gabarito item a
item por tipo, o desempenho nos discursivos e o quadro de escores. Quem já viu o
boletim de verdade reconhece este.

As CORES, porém, são as do Marista — é um simulado da escola, e o boletim é dela.
Foram escolhidas por validação, não por gosto: verde, azul e rosa nessa ordem de
vizinhança passam nas seis checagens de paleta categórica (banda de luminosidade,
croma, separação sob daltonismo protan/deutan/tritan, separação com visão normal
e contraste contra o papel).

**Este é um documento impresso, não uma tela.** Não há passar o mouse, então
todo valor está escrito ao lado da sua barra: identidade nunca depende só da cor,
e quem imprimir em preto e branco continua conseguindo ler.

Duas diferenças em relação ao boletim que a tela do sistema mostra, e as duas de
propósito: o gabarito sai INTEIRO, não um trecho de dez (no papel que vai para
casa, numa prova de 110 itens, dez não dizem nada), e o boletim não se parte
entre folhas — a mesma regra do caderno.
"""
from __future__ import annotations

from pathlib import Path

from .correcao import Resultado, medias_da_turma
from .pacote import Pacote

# As três séries do gráfico de grupos, na ordem em que são desenhadas. A ORDEM
# IMPORTA: verde e rosa lado a lado são o par que o daltonismo deuteranope não
# separa (ΔE 4,8). Com o azul entre os dois, o pior par vai a 19,9 e a paleta
# passa limpa. Não reordene sem revalidar.
COR_GERAL = "#0f8f57"
COR_VOCE = "#1d5cff"
COR_TURMA = "#e5007e"

# As faixas com que o PAS lê a proporção de acertos de um grupo de habilidades.
# As faixas NÃO ganham cor própria, e é de propósito. Elas chegaram como quatro
# quadradinhos coloridos numa legenda — e duas dessas cores eram as das barras
# (o verde da média geral, o azul do estudante), dizendo ali outra coisa. Legenda
# que aponta para uma cor que nenhuma barra usa não explica nada; pior, empresta
# significado errado à cor que a barra ao lado está usando. O grau vai escrito
# por extenso ao lado da SUA barra, e o rodapé diz de que proporção é cada nome.
FAIXAS = [
    (0.4, "Modesto"),
    (0.6, "Mediano"),
    (0.8, "Bom"),
    (1.01, "Muito bom"),
]


def _grau(proporcao: float) -> str:
    """O nome que o PAS dá a este grau de desenvolvimento."""
    for teto, nome in FAIXAS:
        if proporcao < teto:
            return nome
    return FAIXAS[-1][1]

# O que cada grupo de habilidades avalia, como a Matriz de Objetos de Avaliação
# do PAS os define. Vai impresso porque o boletim vai para casa: “Criticar 0,60”
# não diz nada a quem não tem a matriz na mão.
GRUPOS_DESCRITOS = {
    "Interpretar": ("H1 a H3", "Compreender a plurissignificação da linguagem, identificar "
                    "informações centrais e periféricas em diferentes linguagens e "
                    "inter-relacionar objetos de conhecimento de áreas distintas."),
    "Planejar": ("H4 e H5", "Organizar estratégias de ação, selecionar métodos e modelos "
                 "explicativos, formular hipóteses e prever resultados."),
    "Executar": ("H6 a H9", "Elaborar textos coesos e coerentes, aplicar métodos de análise e "
                 "resolução de problemas, formular e articular argumentos e fazer inferências "
                 "indutivas, dedutivas e analógicas."),
    "Criticar": ("H10 a H12", "Analisar criticamente a solução encontrada para uma "
                 "situação-problema, confrontar soluções possíveis e julgar a pertinência de "
                 "opções técnicas, sociais, éticas e políticas na tomada de decisões."),
}

ESTILO = f"""
  *{{box-sizing:border-box}}
  body{{margin:0;background:#e9e4de;font-family:Arial,Helvetica,sans-serif;padding:18px;color:#1b2340}}
  .bol{{background:#fff;width:760px;max-width:100%;margin:0 auto 20px;padding:22px 26px 20px;
    box-shadow:0 3px 10px rgba(0,0,0,.28);break-inside:avoid;page-break-inside:avoid}}
  .faixa{{background:#e8efff;border-left:5px solid {COR_VOCE};padding:9px 14px;margin-bottom:12px}}
  .faixa h1{{margin:0;font-size:14px;color:#0d2f8a;letter-spacing:.2px}}
  .ident{{display:grid;grid-template-columns:2.2fr 1fr 1fr .7fr;gap:8px;margin-bottom:12px}}
  .ident div{{border:1px solid #e3e7f4;border-radius:6px;padding:5px 9px;min-width:0}}
  .ident span{{display:block;font-size:7.5px;letter-spacing:.7px;color:#5d6685;text-transform:uppercase}}
  .ident b{{display:block;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
  .intro{{font-size:9px;line-height:1.55;color:#5d6685;margin:0 0 14px;text-align:justify}}
  h2{{font-size:11.5px;color:{COR_TURMA};margin:0 0 8px;text-transform:uppercase;letter-spacing:.6px}}
  .col2{{display:grid;grid-template-columns:1.25fr 1fr;gap:16px;align-items:start}}
  .legenda-series{{display:flex;gap:12px;flex-wrap:wrap;font-size:8.5px;margin-bottom:8px;color:#5d6685}}
  .legenda-series i{{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;
    vertical-align:-1px}}
  .grupo{{margin-bottom:9px}}
  .grupo>b{{font-size:9.5px;display:block;margin-bottom:2px}}
  .hb{{display:flex;align-items:center;gap:6px;margin:1.5px 0}}
  .hb u{{text-decoration:none;font-size:7.5px;color:#5d6685;width:52px;flex:none}}
  .hb .trilho{{flex:1;background:#f1f3fa;border-radius:3px;height:9px;overflow:hidden}}
  .hb .trilho i{{display:block;height:100%;border-radius:3px}}
  .hb s{{text-decoration:none;font-size:8px;width:26px;flex:none;text-align:right;
    font-variant-numeric:tabular-nums;color:#1b2340}}
  .hb.voce u,.hb.voce s{{font-weight:800;color:#0d2f8a}}
  .hb.voce .trilho{{height:12px}}
  .grau{{font-size:7.5px;font-weight:700;color:#0d2f8a;background:#eef2ff;
    border-radius:999px;padding:1px 6px;flex:none;width:46px;text-align:center;
    -webkit-print-color-adjust:exact;print-color-adjust:exact}}
  .hb .grau.vazio{{background:none}}
  .desc{{font-size:8px;line-height:1.5;color:#5d6685;margin-bottom:8px}}
  .desc b{{color:#1b2340;font-size:8.5px}}
  .faixas{{font-size:7.5px;color:#5d6685;margin-top:6px;line-height:1.5}}
  .legenda-marc{{background:#f6f8ff;border:1px solid #e3e7f4;border-radius:6px;padding:5px 10px;
    font-size:8px;color:#5d6685;margin:14px 0 8px;text-align:center}}
  .tipos{{display:grid;grid-template-columns:1fr 1fr;gap:14px}}
  .tipos.solo{{grid-template-columns:1fr}}
  /* A tabela NÃO estica: com dois itens numa prova de exemplo, largura de 100%
     espalhava duas células por 700px e o gabarito ficava ilegível de tão solto.
     Ela cresce com o conteúdo até caber na folha. */
  table{{width:auto;max-width:100%;border-collapse:collapse;
    font-family:Consolas,"SF Mono",monospace;font-size:8px}}
  caption{{font-size:9px;font-weight:800;color:#0d2f8a;text-align:left;padding:0 0 3px}}
  th,td{{border:1px solid #e3e7f4;padding:2px 3px;text-align:center;min-width:19px}}
  th{{background:#f6f8ff;color:#5d6685;font-weight:700;font-size:7.5px;text-align:right;
    padding-right:4px;white-space:nowrap}}
  td.certa{{color:{COR_GERAL};font-weight:700}}
  td.errada{{color:#e5484d;font-weight:700}}
  td.branca{{color:#b9b1a8}}
  .notas{{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}}
  .nota{{border:1px solid #e3e7f4;border-radius:8px;padding:7px 10px;text-align:center;flex:1;
    min-width:78px}}
  .nota b{{display:block;font-size:15px;color:#0d2f8a;font-variant-numeric:tabular-nums;
    line-height:1.2}}
  .nota span{{font-size:7.5px;color:#5d6685;text-transform:uppercase;letter-spacing:.4px}}
  .nota.destaque{{background:#e8efff;border-color:{COR_VOCE}}}
  .nota.destaque b{{font-size:20px}}
  .nota.marista{{background:#fff4fa;border-color:{COR_TURMA}}}
  .nota.marista b{{color:{COR_TURMA};font-size:20px}}
  .dcol{{display:flex;gap:14px;align-items:flex-end;margin-top:4px;flex-wrap:wrap}}
  .ditem{{text-align:center}}
  .dbar{{display:flex;gap:3px;align-items:flex-end;height:56px}}
  .dbar i{{display:block;width:15px;border-radius:3px 3px 0 0}}
  .ditem u{{text-decoration:none;display:block;font-size:7.5px;color:#5d6685;margin-top:3px}}
  .ditem s{{text-decoration:none;display:block;font-size:8px;font-variant-numeric:tabular-nums}}
  .pe{{font-size:7.5px;color:#8a8178;margin-top:10px;line-height:1.5}}
  @media print{{
    body{{background:#fff;padding:0}}
    .bol{{box-shadow:none;width:100%;margin:0;padding:10mm 12mm}}
    .bol,.bol *{{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    @page{{size:A4;margin:0}}
  }}
"""


def _esc(texto) -> str:
    return (str(texto).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def _num(valor, casas: int = 2) -> str:
    return "—" if valor is None else f"{valor:.{casas}f}".replace(".", ",")


def _barras(resultado: Resultado, turma: dict[str, float], geral: dict[str, float],
            grupos: list[str]) -> str:
    """As três barras de cada grupo, com o valor escrito ao lado de cada uma.

    O valor escrito não é enfeite: o boletim é impresso, e muita gente o imprime
    em preto e branco. Sem o número, quem não distingue as cores não lê o
    gráfico — e o gráfico é o miolo deste documento.
    """
    partes = []
    for grupo in grupos:
        meu = resultado.por_grupo.get(grupo)
        if not meu or not meu.total:
            continue
        rotulo, _texto = GRUPOS_DESCRITOS.get(grupo, ("", ""))
        linhas = [("Média geral", geral.get(grupo, 0.0), COR_GERAL, ""),
                  ("Você", meu.proporcao, COR_VOCE, " voce"),
                  ("Sua turma", turma.get(grupo, 0.0), COR_TURMA, "")]
        barras = "".join(
            f'<div class="hb{classe}"><u>{nome}</u><div class="trilho">'
            f'<i style="width:{max(1, round(valor * 100))}%;background:{cor}"></i></div>'
            f'<s>{_num(valor)}</s>'
            f'<span class="grau{"" if classe else " vazio"}">'
            f'{_grau(valor) if classe else ""}</span></div>'
            for nome, valor, cor, classe in linhas)
        partes.append(f'<div class="grupo"><b>{_esc(grupo)} '
                      f'<span style="font-weight:400;color:#8a8178">({rotulo})</span></b>'
                      f'{barras}</div>')
    return "".join(partes)


def _tabela_de_tipo(resultado: Resultado, tipo: str, titulo: str, por_linha: int = 22) -> str:
    """Item, gabarito e marcação, como no boletim do PAS — em blocos que cabem."""
    detalhes = [d for d in resultado.detalhes if d.tipo == tipo]
    if not detalhes:
        return ""
    blocos = []
    for inicio in range(0, len(detalhes), por_linha):
        pedaco = detalhes[inicio:inicio + por_linha]
        itens = "".join(f"<td>{d.numero}</td>" for d in pedaco)
        gabaritos = "".join(f"<td>{_esc(d.gabarito)}</td>" for d in pedaco)
        marcadas = "".join(
            f'<td class="{"branca" if d.marcada is None else ("certa" if d.certa else "errada")}">'
            f'{_esc(d.marcada) if d.marcada is not None else "."}</td>' for d in pedaco)
        blocos.append(f"<tr><th>Item</th>{itens}</tr>"
                      f"<tr><th>Gabarito</th>{gabaritos}</tr>"
                      f"<tr><th>Sua marcação</th>{marcadas}</tr>")
    return (f'<table><caption>Itens do tipo {titulo}</caption>'
            f'{"".join(blocos)}</table>')


def _discursivos(resultado: Resultado, pacote: Pacote,
                 medias_d: dict[int, float]) -> str:
    """As notas dos discursivos, comparadas à média geral, item a item."""
    notas = pacote.notas.get(resultado.estudante.matricula)
    lancadas = notas.discursivas if notas else {}
    if not lancadas:
        return ""
    escala = pacote.escore.escala_do_discursivo
    colunas = []
    for numero in sorted(lancadas):
        minha, media = float(lancadas[numero]), medias_d.get(numero, 0.0)
        altura = lambda v: max(2, round(v / escala * 56))
        colunas.append(
            f'<div class="ditem"><div class="dbar">'
            f'<i style="height:{altura(minha)}px;background:{COR_VOCE}"></i>'
            f'<i style="height:{altura(media)}px;background:{COR_GERAL}"></i></div>'
            f'<s><b style="color:#0d2f8a">{_num(minha, 1)}</b> · {_num(media, 1)}</s>'
            f'<u>Item {numero}</u></div>')
    return (f'<h2 style="margin-top:14px">Desempenho nos itens do tipo D</h2>'
            f'<div class="legenda-series"><span><i style="background:{COR_VOCE}"></i>Você</span>'
            f'<span><i style="background:{COR_GERAL}"></i>Média geral</span>'
            f'<span>Notas de 0 a {_num(escala, 0)}.</span></div>'
            f'<div class="dcol">{"".join(colunas)}</div>')


def html_de(pacote: Pacote, resultado: Resultado, turma: dict[str, float],
            geral: dict[str, float], medias_d: dict[int, float], resumo: dict) -> str:
    """Um boletim."""
    prova = pacote.molde.prova
    est = resultado.estudante
    versao = "A2 — adaptada" if est.versao == "adaptada" else "A1 — regular"

    descricoes = "".join(
        f'<div class="desc"><b>{_esc(grupo)}</b> ({rotulo}) — {_esc(texto)}</div>'
        for grupo, (rotulo, texto) in GRUPOS_DESCRITOS.items()
        if grupo in pacote.escore.grupos)
    faixas = ("<b>Grau de desenvolvimento</b>, pela proporção de acertos do grupo: "
              "Modesto, até 40% &nbsp;·&nbsp; Mediano, de 40% a 60% &nbsp;·&nbsp; "
              "Bom, de 60% a 80% &nbsp;·&nbsp; Muito bom, 80% ou mais.")

    tabelas = [_tabela_de_tipo(resultado, "A", "A", 22)]
    lado = [_tabela_de_tipo(resultado, "B", "B", 8), _tabela_de_tipo(resultado, "C", "C", 12)]
    lado = [t for t in lado if t]

    nota_redacao = (f'<div class="nota"><b>{_num(resultado.nr, 1)}</b>'
                    f'<span>Redação (NR)</span></div>') if pacote.tem_redacao else ""

    return f"""
  <div class="bol">
    <div class="faixa"><h1>Boletim de Desempenho Individual &nbsp;|&nbsp;
      {_esc(prova.get('nome', ''))} &nbsp;|&nbsp; {_esc(prova.get('etapa', ''))}</h1></div>
    <div class="ident">
      <div><span>Estudante</span><b>{_esc(est.nome).upper()}</b></div>
      <div><span>Matrícula</span><b>{_esc(est.matricula)}</b></div>
      <div><span>Turma</span><b>{_esc(est.turma)}</b></div>
      <div><span>Versão</span><b>{versao}</b></div>
    </div>
    <p class="intro">Este boletim apresenta o seu grau de desenvolvimento em cada grupo de
      habilidades da Matriz de Objetos de Avaliação do PAS, a partir da correção das suas
      respostas — que aparecem adiante, item a item. Traz também as duas notas desta prova:
      o <b>escore bruto</b>, calculado como no PAS, com desconto por erro; e a
      <b>{_esc(pacote.escore.rotulo_marista)}</b>, que é simplesmente a proporção do que você
      acertou, na escala em que a escola lança nota.</p>

    <h2>Grau de desenvolvimento por grupo de habilidades</h2>
    <div class="col2">
      <div>
        <div class="legenda-series">
          <span><i style="background:{COR_GERAL}"></i>Média geral</span>
          <span><i style="background:{COR_VOCE}"></i>Você</span>
          <span><i style="background:{COR_TURMA}"></i>Sua turma</span>
        </div>
        {_barras(resultado, turma, geral, pacote.escore.grupos)}
        <div class="faixas">{faixas}</div>
      </div>
      <div>{descricoes}</div>
    </div>

    <div class="legenda-marc"><b>Legenda:</b> &nbsp; <b style="color:{COR_GERAL}">verde</b> acertou
      &nbsp;·&nbsp; <b style="color:#e5484d">vermelho</b> errou &nbsp;·&nbsp;
      <b>.</b> item em branco. Marcação dupla ou duvidosa não entra aqui: ela vai para a
      conferência e é lançada à mão.</div>
    {"".join(tabelas)}
    <div class="tipos{'' if len(lado) > 1 else ' solo'}" style="margin-top:10px">{"".join(lado)}</div>
    {_discursivos(resultado, pacote, medias_d)}

    <div class="notas">
      <div class="nota destaque"><b>{_num(resultado.escore)}</b><span>Escore bruto (PAS)</span></div>
      <div class="nota marista"><b>{_num(resultado.nota_marista)}</b>
        <span>{_esc(pacote.escore.rotulo_marista)}</span></div>
      <div class="nota"><b>{_num((resultado.percentual or 0) * 100, 1)}%</b>
        <span>Acertos na prova</span></div>
      {nota_redacao}
      <div class="nota"><b>{resultado.posicao or '—'}º</b><span>de {resultado.de or 1}</span></div>
    </div>
    <div class="notas">
      <div class="nota"><b>{_num(resumo.get('media'))}</b><span>Escore médio</span></div>
      <div class="nota"><b>{_num(resumo.get('minimo'))}</b><span>Escore mínimo</span></div>
      <div class="nota"><b>{_num(resumo.get('maximo'))}</b><span>Escore máximo</span></div>
    </div>
    <p class="pe">A proporção de acertos por grupo é o número de itens que você acertou dividido
      pelo número de itens que avaliam aquele grupo; os pesos do escore não entram nessa conta.
      O escore bruto pode ser negativo, porque no PAS o erro desconta — a
      {_esc(pacote.escore.rotulo_marista)} não desconta. Médias, mínimo e máximo referem-se a quem
      fez a mesma versão da prova.</p>
  </div>"""


def _resumo_da_versao(resultados: list[Resultado], versao: str) -> dict:
    escores = [r.escore for r in resultados if r.tem_resposta and r.estudante.versao == versao]
    if not escores:
        return {}
    return {"media": sum(escores) / len(escores), "minimo": min(escores), "maximo": max(escores)}


def _medias_dos_discursivos(pacote: Pacote, resultados: list[Resultado],
                            versao: str) -> dict[int, float]:
    """A nota média de cada discursivo, entre quem fez a mesma versão."""
    somas: dict[int, list[float]] = {}
    for r in resultados:
        if r.estudante.versao != versao:
            continue
        notas = pacote.notas.get(r.estudante.matricula)
        for numero, nota in (notas.discursivas if notas else {}).items():
            somas.setdefault(numero, []).append(float(nota))
    return {n: sum(v) / len(v) for n, v in somas.items() if v}


def escrever(pasta: Path, pacote: Pacote, resultados: list[Resultado]) -> Path | None:
    """Todos os boletins numa página só, pronta para imprimir ou salvar em PDF."""
    com_resposta = [r for r in resultados if r.tem_resposta]
    if not com_resposta:
        return None
    com_resposta.sort(key=lambda r: (r.estudante.turma, r.estudante.nome))

    grupos = pacote.escore.grupos
    por_turma: dict[str, dict[str, float]] = {}
    por_versao: dict[str, dict[str, float]] = {}
    resumos: dict[str, dict] = {}
    medias_d: dict[str, dict[int, float]] = {}
    corpo = []
    for r in com_resposta:
        turma, versao = r.estudante.turma, r.estudante.versao
        if turma not in por_turma:
            por_turma[turma] = medias_da_turma(resultados, turma, grupos)
        if versao not in por_versao:
            daVersao = [x for x in resultados if x.estudante.versao == versao]
            por_versao[versao] = {
                g: (sum(x.por_grupo[g].proporcao for x in daVersao
                        if g in x.por_grupo and x.por_grupo[g].total)
                    / max(1, sum(1 for x in daVersao
                                 if g in x.por_grupo and x.por_grupo[g].total)))
                for g in grupos}
            resumos[versao] = _resumo_da_versao(resultados, versao)
            medias_d[versao] = _medias_dos_discursivos(pacote, resultados, versao)
        corpo.append(html_de(pacote, r, por_turma[turma], por_versao[versao],
                             medias_d[versao], resumos.get(versao, {})))

    prova = pacote.molde.prova
    alvo = pasta / "boletins.html"
    alvo.write_text(f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Boletins — {_esc(prova.get('serie', ''))}</title>
<style>{ESTILO}</style></head><body>
{''.join(corpo)}
</body></html>""", encoding="utf-8")
    return alvo
