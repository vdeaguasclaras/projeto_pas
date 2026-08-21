@echo off
rem  Gera o executavel do leitor com dois cliques, sem digitar comando nenhum.
rem
rem  SEM ACENTO DE PROPOSITO: o cmd.exe do Windows nao usa UTF-8 por padrao, e
rem  mensagem acentuada aqui sai como "Ol??". O resto do projeto e em portugues
rem  com acento; este arquivo e a excecao, e e por isso.
rem
rem  Precisa do Python instalado (python.org, marcando "Add python.exe to PATH").
rem  Quem nao quiser nem isso: baixe o .zip pronto na aba Releases do repositorio
rem  no GitHub - ver docs/instalacao.md.

setlocal
cd /d "%~dp0"

echo.
echo === Leitor de cartoes PAS - gerando o executavel ===
echo.

python --version >nul 2>&1
if errorlevel 1 (
  echo Nao encontrei o Python nesta maquina.
  echo Instale em https://python.org marcando "Add python.exe to PATH",
  echo feche esta janela e clique aqui de novo.
  echo.
  pause
  exit /b 1
)

echo [1/2] Instalando as dependencias...
python -m pip install --disable-pip-version-check -r requirements.txt pyinstaller
if errorlevel 1 goto :erro

echo.
echo [2/2] Montando o pacote. Isso leva alguns minutos.
python -m PyInstaller empacotar.spec --noconfirm
if errorlevel 1 goto :erro

if not exist "dist\PAS-Leitor\PAS-Leitor.exe" goto :erro

echo.
echo === Pronto ===
echo A pasta a copiar para a secretaria e esta:
echo   %cd%\dist\PAS-Leitor
echo Dentro dela, PAS-Leitor.exe abre o programa.
echo.
pause
exit /b 0

:erro
echo.
echo === Nao deu certo ===
echo O motivo esta nas linhas acima. Copie a ultima mensagem de erro
echo e mande para quem cuida do sistema.
echo.
pause
exit /b 1
