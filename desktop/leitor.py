"""Ponto de entrada do aplicativo empacotado.

O PyInstaller precisa de um script, não de um módulo: é este arquivo que ele
transforma em `.exe`. Sem argumentos abre a janela — que é o que acontece quando
alguém clica duas vezes no ícone.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from leitor.cli import cli  # noqa: E402  (o caminho precisa existir antes do import)

if __name__ == "__main__":
    if len(sys.argv) == 1:
        sys.argv.append("janela")
    cli()
