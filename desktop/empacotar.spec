# -*- mode: python ; coding: utf-8 -*-
"""Receita do `.exe` — o aplicativo instalado na máquina da secretaria.

    pyinstaller desktop/empacotar.spec

Sai um `dist/PAS-Leitor/PAS-Leitor.exe` com tudo dentro: Python, OpenCV, o
pdfium e a janela. A máquina da secretaria não precisa ter Python instalado, e é
esse o ponto — instalar Python numa máquina administrativa da escola é um pedido
que não passa, e não deveria mesmo.

Duas escolhas que valem explicação:

- **pasta, e não arquivo único.** O `--onefile` descompacta tudo num diretório
  temporário a cada abertura, e com OpenCV dentro isso leva dezenas de segundos
  — quem abre acha que travou. A pasta abre na hora.
- **sem console.** É um programa de janela; um prompt preto atrás dela assusta
  quem não é da área. Só que, sem console, o Windows não dá saída nenhuma ao
  processo: `print` cai no vazio, e a linha de comando (`ler`, `corrigir`,
  `conferir`) fica muda — inclusive na hora de conferir se o pacote saiu inteiro,
  que é justamente quando se precisa ler o que ele diz. Por isso saem DOIS
  executáveis da mesma análise, na mesma pasta: `PAS-Leitor.exe`, o de clicar
  duas vezes, e `PAS-Leitor-terminal.exe`, o mesmo programa com console — para o
  teste da primeira geração e para o dia em que alguém precisar ver o erro que a
  janela não mostrou. Custam um executável a mais cada um; o resto da pasta é
  compartilhado.
"""
from PyInstaller.utils.hooks import collect_dynamic_libs

a = Analysis(
    # NÃO renomeie para `leitor.py`: o script de entrada com o mesmo nome do
    # pacote faz o PyInstaller resolver `from leitor.cli import cli` para o
    # próprio script, e o executável sai sem biblioteca nenhuma dentro.
    ['principal.py'],
    pathex=['src'],
    binaries=collect_dynamic_libs('pypdfium2'),
    datas=[],
    # O pdfium entra por binário, não por import — sem isto o `.exe` abre e só
    # falha quando alguém escolhe um PDF, que é o pior momento para descobrir.
    hiddenimports=['pypdfium2_raw', 'leitor.ui.janela'],
    excludes=[
        # Nada disto é usado, e cada um custa dezenas de megabytes no instalador.
        'tkinter', 'matplotlib', 'PySide6.QtWebEngineCore', 'PySide6.QtQuick',
        'PySide6.QtQml', 'PySide6.Qt3DCore', 'PySide6.QtMultimedia',
    ],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name='PAS-Leitor',
    console=False,
    disable_windowed_traceback=False,
)
# O mesmo programa, com console. Nasce da MESMA análise: mesma biblioteca, mesmo
# código, só a janelinha preta a mais. Duas análises seriam duas cópias de tudo.
exe_terminal = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name='PAS-Leitor-terminal',
    console=True,
    disable_windowed_traceback=False,
)
coll = COLLECT(
    exe, exe_terminal, a.binaries, a.datas,
    strip=False, upx=False,
    name='PAS-Leitor',
)
