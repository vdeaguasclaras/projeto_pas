"""A correção: das marcações lidas ao escore, ao desempenho e à posição.

**Não há um número de pontuação escrito neste arquivo, e é de propósito.** Quanto
vale cada resposta vem da tabela que o pacote da prova traz (`escore.pesos`), que
é a mesma que o sistema on-line usa (`PESOS_DO_ESCORE`, js/dados.js). O escore
passou a ser calculado dos dois lados — aqui, para os boletins da secretaria, e
lá, para a tela de Correção — e regra escrita em dois lugares diverge: bastaria a
fase 5 mudar o peso de um tipo num lado e esquecer o outro para a mesma prova
valer notas diferentes conforme quem a corrigiu.

O que está escrito aqui é a FORMA da conta, não os números dela:

- item em branco não vale o mesmo que item errado, e nenhum dos dois vale o
  mesmo em todo tipo — no tipo B, errar não desconta;
- o discursivo não tem certo nem errado: a nota lançada de 0 a 10 entra como
  `nota / escala`;
- a redação vem da planilha oficial, `NR = NC − 2·NE/TL`, com piso em zero. A
  fórmula pode passar do zero; a nota, não.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .pacote import Estudante, Pacote


@dataclass
class Acertos:
    """Quanto se acertou de um grupo de habilidades, e de quanto."""
    acertos: float = 0.0
    total: float = 0.0

    @property
    def proporcao(self) -> float:
        return self.acertos / self.total if self.total else 0.0


@dataclass
class Detalhe:
    numero: int
    tipo: str
    gabarito: str
    marcada: str | None
    certa: bool


@dataclass
class Resultado:
    estudante: Estudante
    acertos: int = 0
    erros: int = 0
    brancos: int = 0
    escore: float = 0.0
    por_grupo: dict[str, Acertos] = field(default_factory=dict)
    nr: float | None = None
    detalhes: list[Detalhe] = field(default_factory=list)
    discursivas_lancadas: int = 0
    discursivas_total: int = 0
    total_itens: int = 0
    tem_resposta: bool = False
    posicao: int = 0
    de: int = 0


def nota_da_redacao(redacao: dict | None) -> float | None:
    """NR = NC − 2·NE/TL, com piso em zero. `None` quando não foi lançada."""
    if not redacao:
        return None
    try:
        tl = float(redacao.get("tl") or 0)
        if tl <= 0:
            return None
        nc = float(redacao.get("nc") or 0)
        ne = float(redacao.get("ne") or 0)
    except (TypeError, ValueError):
        return None
    return max(0.0, nc - 2 * ne / tl)


def _chave_esperada(item: dict) -> str:
    """A resposta certa, na forma em que ela é comparada.

    O tipo B é número de três algarismos, e `96` e `096` são a mesma resposta —
    comparar como texto solto reprovaria quem acertou.
    """
    bruta = str(item.get("gabarito") or "").strip()
    if item["tipo"] == "B":
        return "".join(c for c in bruta if c.isdigit()).rjust(3, "0")[-3:]
    return bruta.upper()


def corrigir(pacote: Pacote, estudante: Estudante,
             marcacoes: dict[int, str]) -> Resultado:
    """Corrige um estudante. `marcacoes` é {número do item: resposta lida}."""
    escore = pacote.escore
    notas = pacote.notas.get(estudante.matricula)
    itens = pacote.molde.itens_da_versao(estudante.versao)
    resultado = Resultado(estudante=estudante, total_itens=len(itens))
    for grupo in escore.grupos:
        resultado.por_grupo[grupo] = Acertos()

    for item in itens:
        grupo = resultado.por_grupo.setdefault(item["grupo"] or "—", Acertos())

        if item["tipo"] == "D":
            resultado.discursivas_total += 1
            bruta = (notas.discursivas if notas else {}).get(item["numero"])
            if bruta is not None:
                escala = escore.escala_do_discursivo
                nota = max(0.0, min(escala, float(bruta)))
                resultado.escore += nota / escala
                grupo.total += 1
                grupo.acertos += nota / escala
                resultado.discursivas_lancadas += 1
            continue

        marcada = str(marcacoes.get(item["numero"], "") or "").strip().upper()
        esperada = _chave_esperada(item)
        if item["tipo"] == "B" and marcada:
            marcada = "".join(c for c in marcada if c.isdigit()).rjust(3, "0")[-3:]
        certa = bool(marcada) and marcada == esperada

        peso = escore.peso(item["tipo"])
        if not marcada:
            resultado.brancos += 1
            resultado.escore += float(peso.get("branco", 0))
        elif certa:
            resultado.acertos += 1
            resultado.escore += float(peso.get("certo", 0))
        else:
            resultado.erros += 1
            resultado.escore += float(peso.get("errado", 0))

        grupo.total += 1
        if certa:
            grupo.acertos += 1
        resultado.detalhes.append(
            Detalhe(item["numero"], item["tipo"], esperada, marcada or None, certa))

    resultado.nr = nota_da_redacao(notas.redacao if notas else None)
    resultado.tem_resposta = bool(marcacoes) or resultado.discursivas_lancadas > 0
    return resultado


def corrigir_todos(pacote: Pacote,
                   marcacoes: dict[str, dict[int, str]]) -> list[Resultado]:
    """Corrige o elenco inteiro e resolve a posição de cada um.

    A posição é dentro da PRÓPRIA versão da prova: a adaptada tem menos itens, e
    ordenar as duas juntas compararia quem fez provas diferentes.
    """
    resultados = [corrigir(pacote, e, marcacoes.get(e.matricula, {})) for e in pacote.elenco]
    for versao in ("regular", "adaptada"):
        turma = sorted((r for r in resultados if r.estudante.versao == versao and r.tem_resposta),
                       key=lambda r: -r.escore)
        for posicao, r in enumerate(turma, 1):
            r.posicao, r.de = posicao, len(turma)
    return resultados


def medias_da_turma(resultados: list[Resultado], turma: str,
                    grupos: list[str]) -> dict[str, float]:
    """A proporção média de acertos por grupo, entre quem respondeu naquela turma.

    É a referência contra a qual o boletim desenha o traço rosa: sem ela, uma
    barra de 60% não diz se foi bem ou mal.
    """
    daTurma = [r for r in resultados if r.estudante.turma == turma and r.tem_resposta]
    medias = {}
    for grupo in grupos:
        valores = [r.por_grupo[grupo].proporcao for r in daTurma
                   if grupo in r.por_grupo and r.por_grupo[grupo].total > 0]
        medias[grupo] = sum(valores) / len(valores) if valores else 0.0
    return medias
