"""Ponto de entrada do aplicativo empacotado.

O PyInstaller precisa de um script, não de um módulo: é este arquivo que ele
transforma em `.exe`. Sem argumentos abre a janela — que é o que acontece quando
alguém clica duas vezes no ícone.

**Não se chama `leitor.py`, e isso não é escolha de gosto.** O script de entrada
com o mesmo nome do pacote faz o PyInstaller resolver `from leitor.cli import
cli` para o PRÓPRIO script, em vez do pacote: a análise não segue nada, o
executável sai sem OpenCV, sem Qt e sem pdfium — 25 MB de nada — e só falha ao
abrir, com um `No module named 'leitor'` que não explica coisa alguma.
"""
import sys
from pathlib import Path

# Rodando do código-fonte, o pacote está em `src/`. Empacotado, ele vem de
# dentro do executável, e mexer no caminho aqui só atrapalharia.
if not getattr(sys, "frozen", False):
    sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from leitor.cli import cli  # noqa: E402  (o caminho precisa existir antes do import)

if __name__ == "__main__":
    if len(sys.argv) == 1:
        sys.argv.append("janela")
    cli()
