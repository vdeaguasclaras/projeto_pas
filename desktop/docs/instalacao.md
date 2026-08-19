# Instalar o leitor na máquina da secretaria

> **Estado: a receita está escrita, o `.exe` ainda não foi gerado nem testado.**
> O empacotamento tem de rodar **no Windows** — o PyInstaller não gera executável
> de Windows a partir de outro sistema —, e isso ainda não foi feito. O que está
> aqui é o caminho; a primeira geração vai encontrar detalhes que só aparecem lá.

## Por que um `.exe`

A máquina da secretaria não tem Python, e pedir para instalar Python numa
máquina administrativa da escola é um pedido que não passa. O aplicativo tem de
ser um programa que se copia e se abre.

## Gerar o pacote (numa máquina Windows, uma vez por versão)

```powershell
git clone https://github.com/vdeaguasclaras/projeto_pas.git
cd projeto_pas\desktop
python -m pip install -r requirements.txt pyinstaller
pyinstaller empacotar.spec
```

Sai `dist\PAS-Leitor\`. É essa pasta inteira que vai para a secretaria — copiada
para o disco, para um pendrive, para onde for. Dentro dela, `PAS-Leitor.exe`.

**Pasta, e não arquivo único**: o `--onefile` descompacta tudo num diretório
temporário a cada abertura, e com o OpenCV dentro isso leva dezenas de segundos.
Quem abre acha que travou e clica de novo.

## Usar

1. Abrir o `PAS-Leitor.exe`.
2. **Prova** — escolher o pacote exportado pelo sistema em Cartões-resposta.
3. **Ler cartões** — escolher a pasta com as digitalizações e mandar ler.
4. **Conferência** — o que ficou em dúvida, com a imagem do papel ao lado.
5. **Resultados** e **Boletins** — a planilha e os boletins, que abrem no
   navegador para imprimir ou salvar em PDF.

Tudo o que sai fica numa pasta `resultado-<nome>` ao lado das digitalizações.
Nada é enviado para lugar nenhum: o aplicativo não usa internet.

## O que falta conferir na primeira geração

- Se o `pypdfium2` entra sozinho ou precisa de mais que o `hiddenimports` atual;
- se o Windows Defender reclama do executável não assinado (é comum com
  PyInstaller) e o que a escola prefere fazer a respeito;
- o tamanho final da pasta, e se compensa excluir mais módulos do Qt.
