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


# A resposta que não é resposta, e que precisa aparecer assim mesmo.
#
# Dupla marcação é item ANULADO: no PAS o estudante marcou duas alternativas e a
# regra é clara — vale como erro. Antes disso virava silêncio: a marcação ia para
# a conferência, e se ninguém a resolvesse o item saía do boletim como "em
# branco", que é outra coisa e conta diferente. O boletim tem de mostrar o que
# aconteceu no papel, e "você anulou este item" é informação que o estudante
# precisa ler — é o que ele vai evitar na prova de verdade.
#
# É um valor de resposta como "A" ou "096": viaja no CSV da conferência, entra na
# correção e sai impresso com marca própria.
NULO = "NULO"


@dataclass
class Detalhe:
    numero: int
    tipo: str
    gabarito: str
    marcada: str | None
    certa: bool
    # Anulado: marcou duas. Conta como erro, e aparece com marca própria.
    nulo: bool = False
    # Ainda na fila de conferência quando o boletim foi gerado. NÃO conta como
    # nada — nem acerto, nem erro, nem branco: ninguém decidiu ainda, e afirmar
    # qualquer das três seria inventar. Sai do numerador E do denominador, como o
    # discursivo que ainda não foi corrigido.
    pendente: bool = False


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
    # Anulados por dupla marcação. Estão DENTRO de `erros` — contam como erro,
    # com o peso de erro do tipo —, e são contados à parte só para poderem
    # aparecer com marca própria no boletim e na planilha.
    nulos: int = 0
    # Itens que continuavam na fila de conferência na hora de corrigir.
    pendentes: int = 0
    total_itens: int = 0
    tem_resposta: bool = False
    posicao: int = 0
    de: int = 0
    # A segunda nota — ver `percentual`. `acertos_marista` é fracionário porque
    # o discursivo entra proporcional à nota lançada.
    acertos_marista: float = 0.0
    itens_avaliaveis: int = 0
    escala_marista: float = 2.0

    @property
    def percentual(self) -> float | None:
        """A fração da prova que o estudante acertou — sem desconto, sem peso.

        Outra pergunta que o escore bruto do PAS: ele desconta erro e pode ser
        negativo, e nenhuma família já viu isso num boletim. Este número é o que
        a escola lança, e é o que qualquer pessoa entende sem explicação.

        `None` quando não há item avaliável nenhum — prova sem resposta, ou só
        com discursivo ainda por corrigir. Zero e “não dá para calcular” são
        coisas diferentes, e mostrar 0% no lugar de “—” afirmaria uma nota que
        ninguém apurou.
        """
        if not self.itens_avaliaveis:
            return None
        return self.acertos_marista / self.itens_avaliaveis

    @property
    def nota_marista(self) -> float | None:
        """O percentual convertido para a escala em que a escola lança nota."""
        proporcao = self.percentual
        return None if proporcao is None else proporcao * self.escala_marista


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


def corrigir(pacote: Pacote, estudante: Estudante, marcacoes: dict[int, str],
             pendentes: set[int] | frozenset = frozenset()) -> Resultado:
    """Corrige um estudante. `marcacoes` é {número do item: resposta lida}.

    `pendentes` são os itens que ainda estavam na fila de conferência. Eles não
    entram em conta nenhuma: quem decide o que está no papel é quem confere, e
    até lá não há acerto, erro nem branco a afirmar.
    """
    escore = pacote.escore
    notas = pacote.notas.get(estudante.matricula)
    itens = pacote.molde.itens_da_versao(estudante.versao)
    resultado = Resultado(estudante=estudante, total_itens=len(itens),
                          escala_marista=escore.escala_marista)
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
                # Proporcional: 8,5 num item vale 0,85 de um acerto. Discursivo
                # ainda não corrigido não entra nem como acerto nem como item —
                # seria virar erro por atraso de quem corrige.
                resultado.acertos_marista += nota / escala
                resultado.itens_avaliaveis += 1
            continue

        esperada = _chave_esperada(item)
        if item["numero"] in pendentes:
            resultado.pendentes += 1
            resultado.detalhes.append(
                Detalhe(item["numero"], item["tipo"], esperada, None, False, pendente=True))
            continue

        marcada = str(marcacoes.get(item["numero"], "") or "").strip().upper()
        if marcada == NULO:
            # Anulado vale como erro — com o peso de erro DO TIPO, que no tipo B
            # é zero: no PAS o tipo B não desconta, e anular não pode inventar um
            # desconto que a prova não tem.
            peso = escore.peso(item["tipo"])
            resultado.erros += 1
            resultado.nulos += 1
            resultado.escore += float(peso.get("errado", 0))
            grupo.total += 1
            resultado.itens_avaliaveis += 1
            resultado.detalhes.append(
                Detalhe(item["numero"], item["tipo"], esperada, NULO, False, nulo=True))
            continue

        # A partir daqui é resposta de verdade. O tipo B se compara por
        # algarismos — e por isso `NULO` tinha de sair antes: aqui ele viraria
        # texto sem número nenhum, ou seja, um branco.
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
        resultado.itens_avaliaveis += 1
        if certa:
            resultado.acertos_marista += 1
        resultado.detalhes.append(
            Detalhe(item["numero"], item["tipo"], esperada, marcada or None, certa))

    resultado.nr = nota_da_redacao(notas.redacao if notas else None)
    # Quem só tem item pendente também FEZ a prova: se ficasse de fora, sumiria
    # da planilha e dos boletins justamente enquanto espera conferência.
    resultado.tem_resposta = (bool(marcacoes) or resultado.discursivas_lancadas > 0
                              or resultado.pendentes > 0)
    return resultado


def corrigir_todos(pacote: Pacote, marcacoes: dict[str, dict[int, str]],
                   pendencias: dict[str, set[int]] | None = None) -> list[Resultado]:
    """Corrige o elenco inteiro e resolve a posição de cada um.

    A posição é dentro da PRÓPRIA versão da prova: a adaptada tem menos itens, e
    ordenar as duas juntas compararia quem fez provas diferentes.
    """
    pendencias = pendencias or {}
    resultados = [corrigir(pacote, e, marcacoes.get(e.matricula, {}),
                           pendencias.get(e.matricula, frozenset()))
                  for e in pacote.elenco]
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
