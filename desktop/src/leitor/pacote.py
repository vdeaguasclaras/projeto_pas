"""O pacote da prova — o que o sistema on-line manda para cá.

O leitor precisava só da geometria e do gabarito. Gerar BOLETIM precisa de mais:
do nome de quem fez a prova, da turma dele, das notas do discursivo (lançadas
por quem corrige) e da redação (lançada pela professora) — coisas que só existem
no banco. Sem elas o aplicativo produziria meio boletim, ou pediria que tudo
fosse digitado de novo.

Por isso a exportação da tela de Cartões-resposta virou `pas-marista/pacote-v1`:
o `gabarito-v4` inteiro, no mesmo lugar, mais o elenco, as notas lançadas e a
TABELA DE PESOS do escore. O leitor continua aceitando o gabarito sozinho — dá
para ler cartão sem boletim —, e avisa quando o boletim não é possível.

**A tabela de pesos viajar como dado não é detalhe.** O escore é calculado dos
dois lados agora, e regra escrita em dois lugares diverge: bastaria a fase 5
mudar o peso de um tipo no sistema e esquecer aqui para a mesma prova valer notas
diferentes conforme quem a corrigiu. Aqui não há número de pontuação nenhum
escrito — todos vêm do arquivo.

Uma observação sobre o conteúdo: este arquivo leva NOME de estudante, o que o
gabarito evitava de propósito. É dado da escola indo para uma máquina da escola,
e sem ele não há boletim; mas trata-se dele como se trata a lista de estudantes.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from . import anulacao
from .molde import GabaritoIncompativel, Molde, carregar as carregar_molde


@dataclass(frozen=True)
class Estudante:
    matricula: str
    nome: str
    turma: str
    versao: str


@dataclass
class Notas:
    """O que foi lançado no sistema para este estudante, fora da objetiva."""
    discursivas: dict[int, float] = field(default_factory=dict)
    redacao: dict | None = None


@dataclass
class Escore:
    """Quanto vale cada resposta. Vem do arquivo, nunca escrito aqui."""
    pesos: dict
    grupos: list[str]
    marista: dict = field(default_factory=dict)

    @property
    def escala_marista(self) -> float:
        """Em quantos pontos a Nota Marista é lançada. Vem do pacote."""
        return float(self.marista.get("escala") or 2)

    @property
    def rotulo_marista(self) -> str:
        return str(self.marista.get("rotulo") or "Nota Marista")

    def peso(self, tipo: str) -> dict:
        return self.pesos.get(tipo) or self.pesos.get("C") or {}

    @property
    def escala_do_discursivo(self) -> float:
        return float((self.pesos.get("D") or {}).get("escala") or 10)


@dataclass
class Pacote:
    molde: Molde
    elenco: list[Estudante]
    notas: dict[str, Notas]
    escore: Escore
    # Os itens anulados pela coordenação, como `(versão, número)` — ver
    # `anulacao.py`. Vêm de dois lugares que se SOMAM: o pacote (a decisão
    # tomada no sistema on-line, que também corrige) e o arquivo lembrado ao lado
    # dele (a decisão tomada aqui, depois de o pacote ter sido exportado).
    anulados: set[tuple[str, int]] = field(default_factory=set)
    # Os que vieram DENTRO do pacote. Ficam à parte porque não se desmarcam
    # aqui: desanular é decisão do sistema, e desfazê-la em silêncio de um lado
    # só faria a mesma prova valer notas diferentes conforme quem a corrigiu.
    anulados_do_pacote: set[tuple[str, int]] = field(default_factory=set)
    # O que deu errado ao abrir o pacote sem impedir de abri-lo — hoje, o arquivo
    # de itens anulados ilegível ou com item que não existe mais nesta prova.
    # Quem mostra é a casca; o que não pode é sumir.
    avisos: list[str] = field(default_factory=list)

    def anulado(self, versao: str, numero: int) -> bool:
        """Este item, nesta versão da prova, foi anulado?

        A chave é o par: cada versão numera os seus itens de 1 a N, e o nº 12 da
        regular pode ser o nº 10 da adaptada.
        """
        return (versao, numero) in self.anulados

    @property
    def itens_da_prova(self) -> set[tuple[str, int]]:
        """Todo `(versão, número)` que existe nesta prova."""
        return set(self.molde.itens)

    def mesmo_item(self, versao: str, numero: int) -> set[tuple[str, int]]:
        """Este item em TODA versão em que ele aparece, pelo `id` do sistema.

        É o que faz anular “o item” e não “o número”: marcar o nº 12 da regular
        marca também o nº 10 da adaptada, quando são o mesmo item. Pacote velho,
        sem `id`, devolve só o par pedido — melhor marcar de menos do que marcar
        um item que ninguém escolheu.
        """
        alvo = (self.molde.itens.get((versao, numero)) or {}).get("id")
        if not alvo:
            return {(versao, numero)}
        return {chave for chave, item in self.molde.itens.items() if item.get("id") == alvo}

    @property
    def quantos_anulados(self) -> int:
        """Quantos ITENS estão anulados — e não quantos pares `(versão, número)`.

        O mesmo item anulado nas duas versões são dois pares e um item só;
        contar pares diria “4 itens anulados” de uma prova com dois.
        """
        distintos = set()
        for versao, numero in self.anulados:
            item = self.molde.itens.get((versao, numero)) or {}
            distintos.add(item.get("id") or f"{versao}:{numero}")
        return len(distintos)

    @property
    def anulados_locais(self) -> set[tuple[str, int]]:
        """O que foi anulado AQUI — o que se grava no arquivo ao lado."""
        return self.anulados - self.anulados_do_pacote

    @property
    def tem_redacao(self) -> bool:
        """A prova tem folha de redação? É o que decide se o boletim mostra o NR."""
        return any(f.tipo == "redacao"
                   for folhas in self.molde.familias.values() for f in folhas)

    @property
    def tem_boletim(self) -> bool:
        """Dá para montar boletim, ou só ler cartão?"""
        return bool(self.elenco and self.escore.pesos)

    def estudante(self, matricula: str) -> Estudante | None:
        return self._por_matricula.get(matricula)

    def __post_init__(self) -> None:
        self._por_matricula = {e.matricula: e for e in self.elenco}
        # A matrícula volta do leitor em algarismos, sem a pontuação que a
        # planilha da secretaria porventura tenha. O casamento por algarismos é
        # a segunda tentativa, como na importação do sistema on-line.
        porDigitos: dict[str, Estudante | None] = {}
        for e in self.elenco:
            d = "".join(c for c in e.matricula if c.isdigit())
            if d:
                porDigitos[d] = None if d in porDigitos else e
        self._por_digitos = porDigitos

    def casar(self, matricula: str) -> Estudante | None:
        """O estudante desta matrícula, pelo texto ou pelos algarismos.

        Devolve None quando duas matrículas do elenco só se distinguem pela
        pontuação: atribuir a prova ao estudante errado é pior do que não
        atribuir.
        """
        achado = self._por_matricula.get(matricula)
        if achado:
            return achado
        return self._por_digitos.get("".join(c for c in matricula if c.isdigit()))


def carregar(caminho: Path) -> Pacote:
    """Lê o arquivo exportado. Aceita o pacote e o gabarito sozinho."""
    molde = carregar_molde(caminho)
    dados = json.loads(Path(caminho).read_text(encoding="utf-8"))

    elenco = [Estudante(matricula=str(e.get("matricula", "")), nome=str(e.get("nome", "")),
                        turma=str(e.get("turma", "")),
                        versao="adaptada" if e.get("versao") == "adaptada" else "regular")
              for e in (dados.get("elenco") or [])]

    notas: dict[str, Notas] = {}
    for matricula, bruto in (dados.get("notas") or {}).items():
        discursivas = {int(n): float(v) for n, v in (bruto.get("discursivas") or {}).items()}
        notas[str(matricula)] = Notas(discursivas=discursivas, redacao=bruto.get("redacao"))

    bruto = dados.get("escore") or {}
    escore = Escore(pesos=bruto.get("pesos") or {}, grupos=list(bruto.get("grupos") or []),
                    marista=bruto.get("marista") or {})
    pacote = Pacote(molde=molde, elenco=elenco, notas=notas, escore=escore)

    # Os itens anulados, das duas origens. Primeiro os que vieram DENTRO do
    # pacote — a decisão tomada no sistema, que é quem corrige do outro lado.
    pacote.anulados_do_pacote = {chave for chave, item in molde.itens.items()
                                 if item.get("anulado")}
    # Depois os que foram anulados aqui, lembrados no arquivo ao lado. É neste
    # ponto, e não em cada casca, porque casca esquece: a janela lembraria e a
    # linha de comando não, e a mesma prova valeria notas diferentes conforme
    # quem a corrigiu.
    locais, pacote.avisos = anulacao.lembrados(
        Path(caminho), molde.prova, pacote.itens_da_prova)
    pacote.anulados = pacote.anulados_do_pacote | locais
    return pacote


__all__ = ["Pacote", "Estudante", "Notas", "Escore", "carregar", "GabaritoIncompativel",
           "anulacao"]
