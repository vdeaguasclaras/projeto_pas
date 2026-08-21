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


def _chaves_de(pacote: Pacote, caminhos) -> set[tuple[str, int]]:
    """Os `(matrícula, item)` que aparecem nestes CSVs — decididos ou não.

    A matrícula sai normalizada pela do elenco (`casar`), porque a da faixa vem
    em algarismos e a da planilha pode vir pontuada: comparar como texto solto
    faria a mesma pessoa parecer duas.
    """
    chaves: set[tuple[str, int]] = set()
    for caminho in caminhos:
        if not caminho or not Path(caminho).exists():
            continue
        with Path(caminho).open(encoding="utf-8-sig") as arquivo:
            for linha in csv.DictReader(arquivo, delimiter=";"):
                matricula = (linha.get("matricula") or "").strip()
                numero = (linha.get("item") or "").strip()
                if not matricula or not numero.isdigit():
                    continue
                estudante = pacote.casar(matricula)
                if estudante is not None:
                    chaves.add((estudante.matricula, int(numero)))
    return chaves


def pendencias_de(pacote: Pacote, conferir: Path, decisoes) -> dict[str, set[int]]:
    """O que foi para a conferência e ninguém decidiu ainda.

    A diferença entre “resolvido como branco” e “ninguém olhou” não está nas
    marcações: as duas chegam ali como ausência. Está em ter havido uma DECISÃO —
    uma linha, ainda que de resposta vazia, no CSV da conferência. Por isso a
    conta é por chave `(matrícula, item)`, e não por valor.

    Sem isto, item duvidoso não conferido virava “em branco” no boletim, com
    nota, posição na turma e tudo — uma afirmação sobre o papel que ninguém
    tinha feito.
    """
    decididos = _chaves_de(pacote, decisoes)
    pendentes: dict[str, set[int]] = {}
    for matricula, numero in _chaves_de(pacote, [conferir]):
        if (matricula, numero) not in decididos:
            pendentes.setdefault(matricula, set()).add(numero)
    return pendentes


def apurar(pacote: Pacote, marcacoes: dict, saida_dir: Path, decisoes=()):
    """Corrige, grava `resultados.csv` e monta `boletins.html`.

    `decisoes` são CSVs de conferência fora do lugar de sempre — a linha de
    comando aceita `--respostas` de onde a pessoa quiser. O da janela
    (`conferido.csv`, ao lado da saída) entra sozinho.

    Devolve `(resultados, quantos saíram na planilha, caminho dos boletins)`.
    """
    pendencias = pendencias_de(pacote, saida_dir / "respostas_conferir.csv",
                               [saida_dir / "conferido.csv", *decisoes])
    resultados = corrigir_todos(pacote, marcacoes, pendencias)
    linhas = []
    for r in sorted(resultados, key=lambda r: (r.estudante.turma, r.estudante.nome)):
        if not r.tem_resposta:
            continue
        linhas.append([
            r.estudante.matricula, r.estudante.nome, r.estudante.turma, r.estudante.versao,
            r.acertos, r.erros, r.brancos, r.nulos, r.pendentes,
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
    # `anulados` está DENTRO de `erradas` (dupla marcação vale como erro), e
    # `pendentes` está fora de tudo — são os itens que continuavam na fila de
    # conferência na hora de corrigir. Coluna com número diferente de zero ali é
    # trabalho por fazer, não característica da prova.
    cabecalho = ["matricula", "nome", "turma", "versao", "certas", "erradas", "brancos",
                 "anulados", "pendentes",
                 "escore_bruto", "percentual_acerto", "nota_marista", "redacao_nr",
                 "posicao", "de",
                 *[f"grupo_{g.lower()}" for g in pacote.escore.grupos]]
    saida_dir.mkdir(parents=True, exist_ok=True)
    with (saida_dir / "resultados.csv").open("w", encoding="utf-8", newline="") as arquivo:
        escritor = csv.writer(arquivo, delimiter=";", lineterminator="\n")
        escritor.writerow(cabecalho)
        escritor.writerows(linhas)
    return resultados, len(linhas), boletim.escrever(saida_dir, pacote, resultados)
