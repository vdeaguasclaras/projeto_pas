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
    escore = Escore(pesos=bruto.get("pesos") or {}, grupos=list(bruto.get("grupos") or []))
    return Pacote(molde=molde, elenco=elenco, notas=notas, escore=escore)


__all__ = ["Pacote", "Estudante", "Notas", "Escore", "carregar", "GabaritoIncompativel"]
