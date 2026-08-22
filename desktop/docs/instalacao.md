# Instalar o leitor na máquina da secretaria

> Este documento é de quem **gera** o pacote e mantém o projeto. Quem vai
> **usar** o programa na secretaria tem um manual próprio, escrito para ser
> enviado à equipe: [`docs/manual-do-leitor.md`](../../docs/manual-do-leitor.md)
> — instalação, os seis passos e o que fazer quando algo não sai como esperado.

> **Estado: gerado e rodado no Windows.** A coordenação seguiu esta receita numa
> máquina da escola (Windows, Python 3.14, instalação só para o usuário), gerou o
> pacote e percorreu o fluxo inteiro — ler, conferir, resultados, boletins.
>
> Depois disso o empacotamento virou automático: uma máquina do GitHub monta o
> `.exe` e devolve um `.zip`, e a instalação na secretaria passou a ser baixar e
> descompactar. Os quatro comandos abaixo continuam valendo, e viraram o caminho
> de quem mexe no código.
>
> Antes disso a receita foi ensaiada em Linux, e o ensaio serviu para o que ensaio
> serve: encontrar o que estava errado nela antes de alguém perder a tarde. Três
> defeitos vieram do Windows mesmo assim, e estão consertados aqui — o
> `pyinstaller` fora do PATH, o executável mudo e o `--entrada` que só aceitava
> pasta.
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

## Os três caminhos, do mais fácil ao mais trabalhoso

| | Precisa de | Quando usar |
|---|---|---|
| **1. Baixar o .zip pronto** | um navegador | é o caminho normal, e o único que a secretaria precisa conhecer |
| **2. Clicar no `gerar-exe.bat`** | Python e uma cópia do repositório | quando você mexeu no código e quer o pacote na hora |
| **3. Comando a comando** | idem | quando algo deu errado no 2 e você quer ver cada passo |

### 1. Baixar o `.zip` pronto (sem comando nenhum)

O `.exe` é montado **por uma máquina do GitHub**, numa instalação limpa do
Windows, pela receita em
[`.github/workflows/leitor-windows.yml`](../../.github/workflows/leitor-windows.yml).
Ninguém precisa ter Python, nem clonar o repositório, nem abrir terminal.

Para publicar uma versão nova, no repositório:

- **Actions** → *“Leitor de cartões — executável Windows”* → **Run workflow**.
  Ao fim, a própria execução traz o `PAS-Leitor-windows.zip` como anexo, e ele
  dura 30 dias. Serve para conferir.
- Para a versão que vai para a escola, publique uma **etiqueta** `leitor-v1`,
  `leitor-v2`… O mesmo `.zip` vira uma **Release**, que não expira e tem
  endereço fixo para mandar por e-mail.

Na máquina da secretaria:

1. Baixar o `PAS-Leitor-windows.zip` da aba **Releases**.
2. Clicar com o botão direito → **Extrair tudo**. **A pasta inteira** é o
   programa; não adianta copiar só o `.exe` de dentro dela.
3. Abrir o `PAS-Leitor.exe`. Na primeira vez o Windows mostra a tela azul do
   SmartScreen — *Mais informações → Executar assim mesmo*.
4. Botão direito no `PAS-Leitor.exe` → **Enviar para → Área de trabalho (criar
   atalho)**, e daí em diante é um ícone como qualquer outro.

Guarde a pasta num lugar estável (`C:\PAS-Leitor`, por exemplo) antes de criar o
atalho: atalho para dentro de `Downloads` quebra quando alguém limpa a pasta.

### 2. Clicar no `gerar-exe.bat`

Numa máquina que já tenha Python e uma cópia do repositório, um duplo clique em
`desktop\gerar-exe.bat` instala as dependências, monta o pacote e diz onde ele
ficou. A janela **não fecha sozinha** — se der errado, o erro fica na tela.

### 3. Comando a comando

```powershell
git clone https://github.com/vdeaguasclaras/projeto_pas.git
cd projeto_pas\desktop
python -m pip install -r requirements.txt pyinstaller
python -m PyInstaller empacotar.spec
```

**`python -m PyInstaller`, e não `pyinstaller` solto** (com as maiúsculas: é o nome
do módulo). Quando o Python está instalado só para o usuário — que é o caso numa
máquina administrativa, e o pip avisa com um *“Defaulting to user installation”* —
os comandos vão parar em `AppData\Roaming\Python\PythonXXX\Scripts`, que não
costuma estar no PATH. `pyinstaller empacotar.spec` responde *“não é reconhecido
como um comando”* mesmo com o PyInstaller instalado e funcionando: o programa
está lá, o Windows é que não sabe onde. Chamá-lo pelo `python -m` dispensa o PATH,
como o `python -m pip` que instalou tudo.

A compilação leva alguns minutos e imprime muita coisa. Terminou bem quando a
última linha diz `Building COLLECT COLLECT-00.toc completed successfully`.

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

A pasta `dist\` nasce onde o comando foi rodado — em
`…\projeto_pas\desktop\dist\PAS-Leitor\`. Lá dentro:

```powershell
# 1. o executável abre e enxerga o pacote da prova?
.\PAS-Leitor-terminal.exe conferir --gabarito C:\caminho\pas-pacote-pr-2em.json

# 2. lê um lote de verdade, do começo ao fim?
#    `--entrada` aceita a pasta das digitalizações ou o próprio PDF do lote;
#    caminho com espaço vai entre aspas.
.\PAS-Leitor-terminal.exe ler --gabarito C:\caminho\pas-pacote-pr-2em.json ^
    --entrada "C:\caminho\com espaço\lote.pdf" --saida C:\caminho\resultado

# 3. e a janela abre?
.\PAS-Leitor.exe
```

Os dois primeiros vão pelo `-terminal`, que é o que mostra o que aconteceu. O
terceiro é o de verdade: um duplo clique no `PAS-Leitor.exe` faz o mesmo.

**`--gabarito` é do programa todo; `--entrada` e `--saida` são só do `ler`.** O
`conferir` apenas descreve a prova — ele não lê digitalização nenhuma, e por isso
recusa as outras duas opções com um `No such option: --entrada` que parece dizer
que o executável saiu incompleto, e não diz.

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
