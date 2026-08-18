"""A faixa de identificação do rodapé — os blocos que dizem de quem é a folha.

Do lado do sistema web quem escreve estes bits é `bitsDaFolha()` em js/app.js.
As duas contas são a mesma conta, e precisam continuar sendo: se uma mudar sem a
outra, o leitor passa a atribuir folha ao estudante errado — e, pior, sem
reclamar, porque o CRC continuaria fechando dos dois lados da mudança.

O que a faixa carrega, na ordem em que os blocos são impressos:

    sinc  4 bits   1010, sempre
    versao 1 bit   0 regular · 1 adaptada
    tipo   2 bits  0 nominal · 1 extra · 2 gabarito (a folha de referência)
    folha  4 bits  número desta folha
    total  4 bits  quantas folhas o estudante recebeu
    nDig   4 bits  quantos algarismos tem a matrícula
    mat   48 bits  12 algarismos BCD
    crc    8 bits  CRC-8/ATM sobre tudo entre `versao` e `mat`

O CRC é o coração disto. Sem ele o leitor não teria como distinguir “não
consegui ler a faixa” de “li a faixa errado”, e as duas coisas têm desfechos
opostos: a primeira manda a folha para conferência, a segunda lança a prova de
um estudante na linha de outro — em silêncio, e só se descobre quando alguém
reclamar da nota.
"""
from __future__ import annotations

from dataclasses import dataclass

SINC = (1, 0, 1, 0)
DIGITOS = 12
BITS_CORPO = 1 + 2 + 4 + 4 + 4 + 4 * DIGITOS      # 63
CELULAS = len(SINC) + BITS_CORPO + 8              # 75

NOMES_DO_TIPO = {0: "nominal", 1: "extra", 2: "gabarito"}


class FaixaIlegivel(Exception):
    """A faixa não fecha — sincronismo fora do lugar ou CRC recusado."""


def crc8(bits: list[int]) -> int:
    """CRC-8/ATM (polinômio 0x07, sem reflexão) sobre os bits em bytes cheios.

    Os bits que sobram do último byte entram como zero, exatamente como do lado
    do navegador — é por isso que o corpo tem 63 bits e a conta anda por 64.
    """
    crc = 0
    for i in range(0, len(bits), 8):
        byte = 0
        for j in range(8):
            byte = (byte << 1) | (bits[i + j] if i + j < len(bits) else 0)
        crc ^= byte
        for _ in range(8):
            crc = ((crc << 1) ^ 0x07) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


@dataclass(frozen=True)
class Identificacao:
    """O que a faixa de uma folha diz."""
    versao: str            # 'regular' ou 'adaptada'
    tipo: str              # 'nominal', 'extra' ou 'gabarito'
    folha: int
    total: int
    matricula: str         # só algarismos; vazia no extra e no gabarito

    @property
    def eh_referencia(self) -> bool:
        return self.tipo == "gabarito"

    @property
    def molde(self) -> str:
        """A família de molde desta folha. O cartão-gabarito é desenhado como o
        nominal — o que muda nele são os alvéolos preenchidos, não a geometria."""
        return "extra" if self.tipo == "extra" else "nominal"


def _inteiro(bits: list[int], comeco: int, largura: int) -> int:
    valor = 0
    for b in bits[comeco:comeco + largura]:
        valor = (valor << 1) | b
    return valor


def decodificar(bits: list[int]) -> Identificacao:
    """Traduz as células lidas. Levanta `FaixaIlegivel` em vez de chutar."""
    if len(bits) != CELULAS:
        raise FaixaIlegivel(f"a faixa tem {len(bits)} células, esperava {CELULAS}")
    if tuple(bits[:len(SINC)]) != SINC:
        raise FaixaIlegivel("o sincronismo não bate — a faixa não foi lida no lugar certo")

    corpo = bits[len(SINC):len(SINC) + BITS_CORPO]
    lido = _inteiro(bits, len(SINC) + BITS_CORPO, 8)
    if crc8(corpo) != lido:
        raise FaixaIlegivel("CRC recusado — a faixa foi lida, mas não confere")

    tipo = _inteiro(corpo, 1, 2)
    if tipo not in NOMES_DO_TIPO:
        raise FaixaIlegivel(f"tipo de cartão desconhecido ({tipo})")
    n_dig = _inteiro(corpo, 11, 4)
    if n_dig > DIGITOS:
        raise FaixaIlegivel(f"a faixa diz ter {n_dig} algarismos, e só cabem {DIGITOS}")
    inicio = 15
    algarismos = [_inteiro(corpo, inicio + 4 * i, 4) for i in range(n_dig)]
    if any(a > 9 for a in algarismos):
        raise FaixaIlegivel("algarismo fora de 0–9 na matrícula")

    return Identificacao(
        versao="adaptada" if corpo[0] else "regular",
        tipo=NOMES_DO_TIPO[tipo],
        folha=_inteiro(corpo, 3, 4),
        total=_inteiro(corpo, 7, 4),
        matricula="".join(str(a) for a in algarismos),
    )
