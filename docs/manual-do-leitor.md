# Manual — Leitor de Cartões PAS

Para quem digitaliza os cartões-resposta e emite os boletins. É um programa que
roda **na máquina da secretaria**, sem internet: nada do que você abrir nele sai
daquele computador.

---

## Parte 1 · Instalar (uma vez por máquina)

Não precisa instalar Python nem nada além do que está no arquivo. São quatro
passos.

**1. Baixar.** Abra a página de versões do sistema:

<https://github.com/vdeaguasclaras/projeto_pas/releases>

Na versão mais recente, clique em **`PAS-Leitor-windows.zip`**. São cerca de
100 MB.

**2. Extrair.** Na pasta de downloads, clique com o botão direito no arquivo →
**Extrair tudo…** → **Extrair**.

> ⚠️ **A pasta inteira é o programa.** Não adianta copiar só o `PAS-Leitor.exe`
> de dentro dela: ele não funciona sozinho.

**3. Guardar num lugar fixo.** Mova a pasta `PAS-Leitor` para algum lugar
estável — `C:\PAS-Leitor` é uma boa escolha. Deixá-la em *Downloads* dá
problema no dia em que alguém limpar a pasta.

**4. Abrir e criar o atalho.** Dê dois cliques em **`PAS-Leitor.exe`**.

Na primeira vez o Windows mostra uma tela azul: *“O Windows protegeu o seu
computador”*. Isso aparece com qualquer programa que não tenha certificado
comprado, e não quer dizer que haja algo errado. Clique em **Mais informações**
e depois em **Executar assim mesmo**.

Com o programa funcionando, feche-o, clique com o botão direito no
`PAS-Leitor.exe` → **Enviar para** → **Área de trabalho (criar atalho)**. Daí em
diante é só o ícone.

### Atualizar depois

Quando sair uma versão nova: baixe o `.zip` de novo, extraia, e **substitua a
pasta inteira**. Nada do seu trabalho fica dentro dela — os resultados ficam ao
lado das digitalizações.

---

## Parte 2 · Antes de cada lote

Tenha em mãos:

| O quê | De onde vem |
|---|---|
| **O pacote da prova** (`pas-pacote-….json`) | do sistema on-line, na tela **Cartões-resposta** → *Exportar pacote da prova*. É ele que traz o gabarito, a lista de estudantes e o desenho do cartão. |
| **As digitalizações** | do scanner, a **300 dpi**. Pode ser um PDF de várias páginas ou uma pasta de imagens. |

> **Mudou alguma coisa nos itens depois de imprimir os cartões?** Exporte o
> pacote de novo. O programa avisa se o gabarito não corresponder ao papel, mas
> é melhor não chegar lá.

### Como digitalizar

- **300 dpi**, tons de cinza ou colorido, tanto faz.
- **O cartão-gabarito de cada versão vai na frente da pilha.** É aquela folha
  que sai impressa já preenchida, e é dela que o programa aprende quanto de
  tinta esta impressora usa. Sem ela, a leitura fica pior.
- Folha torta, deitada na mesa ou até de cabeça para baixo o programa
  endireita sozinho. **Mas digitalizar em pé é mais rápido**, então vale
  alinhar.
- Cartão-gabarito é **papel sigiloso**: ele é a chave da prova. Guarde-o como
  se guarda a prova.

---

## Parte 3 · Usar — os seis passos

A janela tem seis passos no menu à esquerda, na ordem do trabalho. **Cada um só
abre quando o anterior deu o que ele precisa.**

### 1 · Prova

*Escolher o pacote…* → o arquivo `.json` que você exportou. A tela mostra a
prova, quantos itens e quantos estudantes, para você conferir que é a prova
certa.

### 2 · Ler cartões

Escolha **a pasta** das digitalizações ou **o arquivo** direto (o PDF do lote) e
clique em **Ler os cartões**. A barra mostra o andamento; um lote grande leva
alguns minutos.

Ao terminar, o programa diz quantas folhas leu, quantas eram cartão-gabarito e
quantas marcações ficaram em dúvida.

### 3 · Conferência

Aqui aparece **tudo o que o programa não leu com certeza** — nunca um palpite.
Cada linha traz o **pedaço do papel** onde está a marcação. **Clique na imagem**
para vê-la ampliada, com o entorno da folha ao lado.

No campo à direita, escreva o que está no papel:

| Se no papel… | Escreva |
|---|---|
| há uma marcação clara | a letra (ou o número, no tipo B) |
| **não há marca nenhuma** | deixe o campo **vazio** |
| há **duas alternativas marcadas** | **`NULO`** — o item foi anulado |

> Marcação dupla já chega proposta como `NULO`: é o que o papel diz, e você só
> precisa concordar. No PAS, item anulado **vale como erro**, e sai marcado com
> **N** no boletim.

Clique em **Aplicar e recorrigir**. Os resultados e os boletins se refazem na
hora.

> ⚠️ **Resolva a conferência inteira antes de emitir boletins ou exportar
> notas.** O que ficar pendente não entra em nota nenhuma, sai impresso com
> **?** e leva um aviso no alto do boletim. O programa avisa em rosa quantas
> marcações ainda faltam.

### 4 · Resultados

A planilha de quem fez quanto: acertos, erros, brancos, as **duas notas** e a
posição na turma.

- **Escore** — o escore bruto do PAS, que desconta erro e **pode ser negativo**.
- **Marista** — a proporção de acertos na escala de 2 pontos, sem desconto. É a
  nota que a escola lança.

O botão *Abrir a pasta do resultado* mostra os arquivos no Explorador.

### 5 · Boletins

Um boletim por estudante, com o desempenho por grupo de habilidades comparado à
turma e ao geral, as respostas item a item e as notas. Abre no navegador:
para virar PDF, use **Imprimir → Salvar como PDF**.

> Na hora de imprimir, marque **Gráficos de plano de fundo** — sem isso o
> Chrome não imprime as barras coloridas.

### 6 · Exportar notas

Gera o `.txt` que a secretaria importa no sistema acadêmico. Preencha:

- **Prova** — o código no calendário da escola, como `E3_P3` (3ª prova da 3ª
  etapa);
- **Ano** e **Turno**;
- **os componentes curriculares** que recebem esta nota — todos recebem a mesma.

Clique em **Gerar o arquivo…** e escolha onde salvar.

> O botão fica **desligado** enquanto houver marcação na conferência. Essa nota
> vai para o histórico escolar, e nota provisória lançada lá ninguém descobre
> depois que era provisória.

---

## Parte 4 · O que sai, e onde

Tudo vai para uma pasta **`resultado-<nome>`**, criada **ao lado das
digitalizações**.

| Arquivo | O que é |
|---|---|
| `boletins.html` | os boletins, prontos para imprimir |
| `resultados.csv` | a planilha com as duas notas, para abrir no Excel |
| `respostas.csv` | as marcações lidas — é este que o sistema on-line importa |
| `respostas_conferir.csv` | o que foi para a conferência, com o motivo |
| `conferencia.html` e `conferencia/` | a fila de dúvidas com as imagens |
| `folhas.csv` | uma linha por página digitalizada: o rastro do lote |
| `E3_P3-1serie.txt` | as notas para o sistema acadêmico (quando você pede) |

---

## Parte 5 · Quando alguma coisa não sai como esperado

| O que aconteceu | O que fazer |
|---|---|
| **A tela azul do Windows** ao abrir | *Mais informações → Executar assim mesmo*. É por não ter certificado comprado. |
| **“Não achei digitalização aqui”** | você apontou para uma pasta sem imagens. Aponte para a pasta certa, ou direto para o PDF do lote. |
| **Muitas folhas na conferência** | quase sempre o cartão-gabarito ficou de fora da digitalização. Digitalize o lote de novo com ele na frente. |
| **Uma folha veio como “sem âncoras”** | a folha saiu cortada ou dobrada demais. Digitalize aquela folha de novo. |
| **“Matrícula fora do padrão”** | acontece nos cartões extras, em que o estudante preenche a matrícula à mão. Confira no papel e corrija na conferência. |
| **Aviso de que o cartão-gabarito divergiu** | **pare.** Quer dizer que os itens mudaram depois de os cartões serem impressos. Fale com a coordenação antes de lançar o lote. |
| **A janela abriu e fechou sozinha** | abra o `PAS-Leitor-terminal.exe`, na mesma pasta: é o mesmo programa, com uma janela preta que **mostra o erro**. Mande a mensagem para quem cuida do sistema. |

---

## Em resumo

1. Digitalize o lote a 300 dpi, com o cartão-gabarito na frente.
2. Abra o programa, escolha o pacote da prova e mande ler.
3. **Resolva a conferência inteira.**
4. Imprima os boletins e exporte as notas.

Nada disso usa internet, e nada sai do computador da secretaria.
