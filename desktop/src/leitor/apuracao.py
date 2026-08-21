"""A apuração: das marcações lidas à planilha de resultados e aos boletins.

Estas duas funções moravam dentro da linha de comando, e a janela começou
importando-as com o underscore e tudo — “eu sei que é privada, mas é a mesma
conta”. É sinal de que o lugar estava errado, não de que a importação era
esperta: casca não é dona de regra, e duas cascas puxando a mesma regra de dentro
de uma delas é como o escore estava antes de virar tabela.

`marcacoes_de` junta um ou mais CSVs, e a ORDEM importa: o da conferência vem
depois do da leitura, e o que a pessoa decidiu olhando o recorte vale sobre o que
a máquina achou.
"""
from __future__ import annotations

import csv
from pathlib import Path

from . import boletim
from .correcao import corrigir_todos
from .pacote import Pacote


def marcacoes_de(pacote: Pacote, caminhos: list[Path]) -> tuple[dict, int, int]:
    """Junta as marcações de um ou mais CSVs. Devolve `(marcações, lidas, fora)`.

    Resposta vazia APAGA a marcação, como na importação do sistema on-line: é
    assim que a conferência diz “no papel isto está em branco”.
    """
    marcacoes: dict[str, dict[int, str]] = {}
    lidas = fora = 0
    for caminho in caminhos:
        if not caminho or not caminho.exists():
            continue
        with caminho.open(encoding="utf-8-sig") as arquivo:
            for linha in csv.DictReader(arquivo, delimiter=";"):
                matricula = (linha.get("matricula") or "").strip()
                numero = (linha.get("item") or "").strip()
                if not matricula or not numero.isdigit():
                    continue
                estudante = pacote.casar(matricula)
                if estudante is None:
                    fora += 1
                    continue
                resposta = (linha.get("resposta") or "").strip().upper()
                alvo = marcacoes.setdefault(estudante.matricula, {})
                if resposta:
                    alvo[int(numero)] = resposta
                    lidas += 1
                else:
                    alvo.pop(int(numero), None)
    return marcacoes, lidas, fora


def apurar(pacote: Pacote, marcacoes: dict, saida_dir: Path):
    """Corrige, grava `resultados.csv` e monta `boletins.html`.

    Devolve `(resultados, quantos saíram na planilha, caminho dos boletins)`.
    """
    resultados = corrigir_todos(pacote, marcacoes)
    linhas = []
    for r in sorted(resultados, key=lambda r: (r.estudante.turma, r.estudante.nome)):
        if not r.tem_resposta:
            continue
        linhas.append([
            r.estudante.matricula, r.estudante.nome, r.estudante.turma, r.estudante.versao,
            r.acertos, r.erros, r.brancos,
            f"{r.escore:.2f}".replace(".", ","),
            # As duas notas, lado a lado: a do PAS (com desconto) e a da escola
            # (acertos sobre itens). São perguntas diferentes, e a planilha traz
            # as duas para ninguém precisar recalcular uma a partir da outra.
            "" if r.percentual is None else f"{r.percentual * 100:.1f}".replace(".", ","),
            "" if r.nota_marista is None else f"{r.nota_marista:.2f}".replace(".", ","),
            "" if r.nr is None else f"{r.nr:.1f}".replace(".", ","),
            r.posicao or "", r.de or "",
            *[f"{r.por_grupo[g].proporcao:.2f}".replace(".", ",")
              if g in r.por_grupo and r.por_grupo[g].total else "" for g in pacote.escore.grupos],
        ])
    cabecalho = ["matricula", "nome", "turma", "versao", "certas", "erradas", "brancos",
                 "escore_bruto", "percentual_acerto", "nota_marista", "redacao_nr",
                 "posicao", "de",
                 *[f"grupo_{g.lower()}" for g in pacote.escore.grupos]]
    saida_dir.mkdir(parents=True, exist_ok=True)
    with (saida_dir / "resultados.csv").open("w", encoding="utf-8", newline="") as arquivo:
        escritor = csv.writer(arquivo, delimiter=";", lineterminator="\n")
        escritor.writerow(cabecalho)
        escritor.writerows(linhas)
    return resultados, len(linhas), boletim.escrever(saida_dir, pacote, resultados)
