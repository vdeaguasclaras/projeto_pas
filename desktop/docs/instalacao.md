# Instalar o leitor na máquina da secretaria

> **Estado: a receita foi ensaiada duas vezes e o pacote roda; falta gerar no
> Windows.**
> O PyInstaller não produz executável de Windows a partir de outro sistema, então
> o `.exe` em si continua por fazer. O ensaio foi feito em Linux, e serviu para o
> que ensaio serve: encontrar o que está errado na receita antes de alguém perder
> a tarde com ela.
>
> **O que o ensaio já provou:** a `empacotar.spec` está correta; o `pypdfium2` e o
> OpenCV entram no pacote; o executável lê um lote inteiro de 22 folhas, corrige e
> monta os boletins — com as duas notas e o boletim novo dentro; e a janela abre.
> **O que só o Windows pode dizer:** se o Defender reclama do executável não
> assinado, se os plugins do Qt para Windows entram sozinhos, e o tamanho final
> por lá.
>
> **E um defeito que o ensaio pegou**, que teria custado caro: o script de entrada
> chamava-se `leitor.py`, o mesmo nome do pacote `leitor/`. O PyInstaller resolvia
> `from leitor.cli import cli` para o próprio script, não seguia nenhum import, e
> produzia um executável de 25 MB — sem OpenCV, sem Qt, sem pdfium — que só falhava
> ao abrir, com um `No module named 'leitor'` que não explica nada. Por isso o
> script se chama `principal.py`, e há um comentário na spec pedindo que não seja
> renomeado.

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
para o disco, para um pendrive, para onde for. Dentro dela, **dois executáveis**:

| Arquivo | Para quê |
|---|---|
| `PAS-Leitor.exe` | o de sempre: clicar duas vezes e usar a janela |
| `PAS-Leitor-terminal.exe` | o mesmo programa com console — a linha de comando e, sobretudo, o lugar onde dá para LER o erro |

São o mesmo programa, da mesma análise, dividindo a mesma pasta `_internal`: o
segundo custa uns 5 MB, não o dobro. Ele existe porque, sem console, o Windows
não dá saída nenhuma ao processo — `PAS-Leitor.exe ler …` roda mudo, e a
conferência da primeira geração, que é toda ela ler o que o programa diz, não
teria o que ler. É também para onde ir no dia em que a janela fechar sozinha sem
explicar por quê.

**Espere uns 350 MB**, e não se assuste: quase tudo é OpenCV (150 MB), Qt (100 MB)
e NumPy (40 MB). É o preço de a máquina da secretaria não precisar ter Python.

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

## Conferir na primeira geração no Windows

Depois de `pyinstaller empacotar.spec`, dentro de `dist\PAS-Leitor\`:

```powershell
# 1. o executável abre e enxerga o pacote da prova?
.\PAS-Leitor-terminal.exe conferir --gabarito C:\caminho\pas-pacote-pr-2em.json

# 2. lê um lote de verdade, do começo ao fim?
.\PAS-Leitor-terminal.exe ler --gabarito C:\caminho\pas-pacote-pr-2em.json ^
    --entrada C:\caminho\digitalizacoes --saida C:\caminho\resultado

# 3. e a janela abre?
.\PAS-Leitor.exe
```

Os dois primeiros vão pelo `-terminal`, que é o que mostra o que aconteceu. O
terceiro é o de verdade: um duplo clique no `PAS-Leitor.exe` faz o mesmo.

O passo 2 é o que importa: é ele que prova que o `pypdfium2` e o OpenCV entraram
no pacote. Se o executável abrir e só falhar quando alguém escolhe um PDF, é
porque o `pypdfium2` ficou de fora — o pior momento para descobrir.

Se algum passo falhar, o que sair do `-terminal` é o diagnóstico: `No module
named …` é módulo que ficou de fora da spec; erro só ao escolher um PDF é o
`pypdfium2`; a janela que não abre reclama do Qt pelo nome.

Falta saber, e só o Windows dirá:

- se o **Defender** ou o **SmartScreen** reclamam do executável não assinado (é
  comum com PyInstaller — a tela azul de “Windows protegeu o computador” tem um
  “Mais informações → Executar assim mesmo”) e o que a escola prefere fazer a
  respeito;
- se os **plugins do Qt para Windows** entram sozinhos;
- o tamanho final por lá, e se compensa excluir mais módulos do Qt.
