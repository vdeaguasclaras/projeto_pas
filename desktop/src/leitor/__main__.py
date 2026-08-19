"""`python -m leitor` abre a janela; com argumentos, vira a linha de comando.

É o ponto de entrada do `.exe`: quem clica duas vezes no ícone não digitou
argumento nenhum e quer a janela. Quem chama pelo terminal com `ler`, `corrigir`
ou `conferir` quer a linha de comando, e a recebe.
"""
import sys

from .cli import cli

if __name__ == "__main__":
    if len(sys.argv) == 1:
        sys.argv.append("janela")
    cli()
