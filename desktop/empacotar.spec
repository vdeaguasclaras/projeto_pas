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
  quem não é da área. Em compensação, a linha de comando (`ler`, `corrigir`,
  `conferir`) não mostra saída no `.exe`: para usá-la, rode pelo código-fonte.
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
coll = COLLECT(
    exe, a.binaries, a.datas,
    strip=False, upx=False,
    name='PAS-Leitor',
)
