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

Na versão mais recente, na lista de **Assets**, clique em
**`PAS-Leitor-windows.zip`** — cerca de 100 MB.

> ⚠️ **Não baixe o “Source code (zip)”.** O GitHub sempre oferece esses dois
> arquivos logo abaixo dos anexos; eles são o código-fonte do projeto e **não
> têm o programa dentro**. Se você extraiu e não achou nenhum `.exe`, foi este o
> arquivo que veio. Baixe o `PAS-Leitor-windows.zip`, que é o de 100 MB.

**2. Extrair.** Na pasta de downloads, clique com o botão direito no arquivo →
**Extrair tudo…** → **Extrair**. Sai uma pasta com o `PAS-Leitor.exe` dentro.

> ⚠️ **A pasta inteira é o programa.** Não adianta copiar só o `PAS-Leitor.exe`
> de dentro dela: ele não funciona sozinho.

**3. Guardar num lugar fixo.** Mova essa pasta para algum lugar estável —
`C:\PAS-Leitor` é uma boa escolha. Deixá-la em *Downloads* dá problema no dia em
que alguém limpar a pasta.

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

> **Se a versão nova só mostrar “Source code”, espere dois minutos.** O programa
> não fica guardado no repositório: uma máquina do GitHub o monta na hora em que
> a versão é publicada, e o `PAS-Leitor-windows.zip` (uns 100 MB) só aparece na
> lista quando ela termina. Recarregue a página.

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

## Parte 3 · Usar — os sete passos

A janela tem sete passos no menu à esquerda, na ordem do trabalho. **Cada um só
abre quando o anterior deu o que ele precisa.**

### 1 · Prova

*Escolher o pacote…* → o arquivo `.json` que você exportou. A tela mostra a
prova, quantos itens e quantos estudantes, para você conferir que é a prova
certa.

### 2 · Itens anulados

Item que a coordenação **anulou** — porque estava mal formulado, ou porque não
tinha alternativa correta — tem a pontuação concedida a **todos os estudantes**,
como se todos o tivessem acertado, e sai no boletim com **`*`**.

**O que a coordenação anulou no sistema já vem marcado aqui**, e travado: para
desanular, é lá, na tela de Correção — e depois exporte o pacote de novo.

Marque nesta tela o que foi anulado **depois** de o pacote ser exportado, que é o
caso comum: a decisão costuma vir com a prova já aplicada.

- cada linha é um **item**, com o número que ele tem em cada versão
  (**A1 nº 12 · A2 nº 10**) — as duas provas numeram os seus itens de 1 a N, e
  uma marcação resolve as duas;
- **não precisa de botão**: marcar a caixa já vale, e as notas se refazem na
  hora se o lote já tiver sido lido;
- o que você marcar aqui fica **guardado ao lado do arquivo do pacote** e volta
  sozinho quando você abrir esta prova de novo;
- item anulado **sai da conferência**: o que o estudante marcou nele não muda
  mais nota nenhuma, e a linha dele aparece desligada.

> Nenhum item anulado? É o caso mais comum — clique em **Continuar para a
> leitura**.

### 3 · Ler cartões

Escolha **a pasta** das digitalizações ou **o arquivo** direto (o PDF do lote) e
clique em **Ler os cartões**. A barra mostra o andamento; um lote grande leva
alguns minutos.

Ao terminar, o programa diz quantas folhas leu, quantas eram cartão-gabarito e
quantas marcações ficaram em dúvida.

> ⚠️ **Conte os cartões da pilha e compare com os estudantes do passo 5.** Quando
> uma folha não entra na nota de ninguém, o programa avisa **em rosa** — aqui, na
> Conferência, nos Resultados e na Exportação — com a **página** dela no PDF e o
> motivo. Essa folha **não aparece na lista da Conferência**: ali só há marcação
> duvidosa, e folha sem dono não chegou a ter marcação de ninguém. O que fazer
> com cada caso está na [Parte 5](#folhas-que-não-entraram-na-nota-de-ninguém).

### 4 · Conferência

Aqui aparece **tudo o que o programa não leu com certeza** — nunca um palpite.
Cada linha traz o **pedaço do papel** onde está a marcação. **Clique na imagem**
para vê-la ampliada, com o entorno da folha ao lado.

No campo à direita, escreva o que está no papel:

| Se no papel… | Escreva |
|---|---|
| há uma marcação clara | a letra (ou o número, no tipo B) |
| **não há marca nenhuma** | deixe o campo **vazio** |
| há **duas alternativas marcadas** | **`NULO`** — o estudante anulou o item |
| no **tipo B**, uma coluna está **sem marca** | deixe o **traço** no lugar dela (**`10_`**) — número incompleto vale como erro |

> Marcação dupla já chega proposta como `NULO`: é o que o papel diz, e você só
> precisa concordar. No PAS, quem marca duas alternativas **anula o item dele**,
> e isso vale como erro — sai marcado com **N** no boletim.
>
> Não confunda com o **item anulado** do passo 2, que é a coordenação anulando o
> item para a prova inteira: esse vale como **acerto para todos** e sai com `*`.
>
> No **tipo B**, o traço (`_`) marca a coluna em que o programa não achou
> algarismo. Se no papel o algarismo está lá, escreva-o no lugar do traço. Se a
> coluna está em branco, **deixe o traço**: `10_` é “centena 1, dezena 0, unidade
> em branco”, e apagar o traço transformaria a resposta em `10`, que vale `010`
> — um número que o estudante não marcou.

Clique em **Aplicar e recorrigir**. Os resultados e os boletins se refazem na
hora.

> ⚠️ **Resolva a conferência inteira antes de emitir boletins ou exportar
> notas.** O que ficar pendente não entra em nota nenhuma, sai impresso com
> **?** e leva um aviso no alto do boletim. O programa avisa em rosa quantas
> marcações ainda faltam.

### 5 · Resultados

A planilha de quem fez quanto: acertos, erros, brancos, as **duas notas** e a
posição na turma.

- **Escore** — o escore bruto do PAS, que desconta erro e **pode ser negativo**.
- **Marista** — a proporção de acertos na escala de 2 pontos, sem desconto. É a
  nota que a escola lança.

O botão *Abrir a pasta do resultado* mostra os arquivos no Explorador.

### 6 · Boletins

Um boletim por estudante, com o desempenho por grupo de habilidades comparado à
turma e ao geral, as respostas item a item e as notas. Abre no navegador:
para virar PDF, use **Imprimir → Salvar como PDF**.

> Na hora de imprimir, marque **Gráficos de plano de fundo** — sem isso o
> Chrome não imprime as barras coloridas.

No gabarito item a item, cada marca quer dizer uma coisa: **verde** acertou ·
**vermelho** errou · **`.`** deixou em branco · **`N`** marcou duas alternativas
(vale como erro) · **`*`** o item foi anulado, e a pontuação foi para todos. Se
houver item anulado, o boletim traz um aviso dizendo quais foram.

### 7 · Exportar notas

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
| `folhas.csv` | uma linha por página digitalizada: o rastro do lote. A coluna `sem_nota` diz qual folha ficou de fora, e por quê |
| `E3_P3-1serie.txt` | as notas para o sistema acadêmico (quando você pede) |

Um arquivo fica **fora** dessa pasta: `pas-anulados-<prova>.json`, ao lado do
pacote da prova. É ele que guarda os itens que **você** anulou no passo 2 (os que
vieram do sistema já estão dentro do pacote), e é por isso que eles voltam
sozinhos quando você abre a mesma prova de novo.

---

## Parte 5 · Quando alguma coisa não sai como esperado

| O que aconteceu | O que fazer |
|---|---|
| **Não achei o `.exe`** depois de extrair | você baixou o *Source code (zip)*. Volte à página de versões e clique no `PAS-Leitor-windows.zip`, o de 100 MB, na lista de *Assets*. |
| **A tela azul do Windows** ao abrir | *Mais informações → Executar assim mesmo*. É por não ter certificado comprado. |
| **“Não achei digitalização aqui”** | você apontou para uma pasta sem imagens. Aponte para a pasta certa, ou direto para o PDF do lote. |
| **Muitas folhas na conferência** | quase sempre o cartão-gabarito ficou de fora da digitalização. Digitalize o lote de novo com ele na frente. |
| **Há menos estudantes nos Resultados do que cartões na pilha** | uma folha ficou sem dono. O aviso em rosa diz a página e o motivo — veja logo abaixo o que fazer com cada caso. |
| **Um item saiu com `*` e ninguém anulou nada** | alguém anulou esse item — no sistema, ou nesta máquina antes. Veja o passo 2: o que veio do sistema aparece travado, com a marca “anulado no sistema”; o resto você desmarca aí mesmo. |
| **Aviso de que o cartão-gabarito divergiu** | **pare.** Quer dizer que os itens mudaram depois de os cartões serem impressos. Fale com a coordenação antes de lançar o lote. |
| **A janela abriu e fechou sozinha** | abra o `PAS-Leitor-terminal.exe`, na mesma pasta: é o mesmo programa, com uma janela preta que **mostra o erro**. Mande a mensagem para quem cuida do sistema. |

### Folhas que não entraram na nota de ninguém

O aviso em rosa traz a **página do PDF** de cada uma — é por ela que se acha o
papel na pilha. Na pasta `conferencia/` há ainda uma imagem com o nome da página
(`…-p34.png`), para reconhecer a folha sem procurar.

| O aviso diz… | O que é | O que fazer |
|---|---|---|
| **não achei as quatro âncoras** | os quadrados pretos dos cantos não foram reconhecidos: folha muito cortada ou dobrada, mal encostada no vidro — ou **rabiscada por cima dos quadrados**. Assinatura fina que só encosta num deles o programa resolve sozinho, e **um** canto que não apareceu também (ele lê pelos outros três e avisa); quadrado coberto de tinta, ou dois cantos faltando, não. | Passe o lote de novo pelo scanner, com essa folha inteira e bem encostada. Se não houver jeito, lance as respostas à mão no sistema on-line. |
| **a faixa de blocos do rodapé não pôde ser lida** | a faixa que diz de quem é a folha está rasurada, dobrada ou cortada. | Passe o lote de novo pelo scanner; se a faixa estiver danificada, lance as respostas à mão no sistema on-line. |
| **cartão extra com a matrícula em branco** (ou ilegível, ou fora do padrão) | o estudante usou o cartão de reserva e não preencheu os alvéolos da matrícula — escrever o nome não basta, o programa não lê letra. As marcações foram lidas e estão esperando dono. | Descubra de quem é (o nome está no cabeçalho), **preencha os nove alvéolos da matrícula no papel** e passe o lote de novo pelo scanner. O estudante precisa estar na lista da prova — veja a linha de baixo. |
| **a matrícula … não está no elenco desta prova** | o cartão é de **outra prova** (outra série esquecida na pilha — o aviso diz quando parece ser isso), ou o estudante não estava na lista quando o pacote foi exportado. | Cartão de outra prova: leia-o no lote dela, com o pacote dela. Estudante que falta na lista: cadastre-o no sistema, exporte o pacote de novo e mande ler outra vez. |

**“Lida por só três âncoras”** é outro aviso, e não é folha sem nota: um canto
da folha não apareceu na digitalização (dobrado, rasgado, fora do vidro), o
programa alinhou pelos outros três e **a folha entrou na nota**. O que ele não
tem como saber é se havia marcação no pedaço que faltou — ali ele não viu nada,
e deu como em branco. O aviso diz a página e o canto: olhe o papel uma vez e, se
houver marcação naquele canto, lance-a na conferência do sistema on-line.

> ⚠️ **Antes de exportar as notas**, toda folha desta lista que for de estudante
> desta prova precisa estar resolvida. Quem tem cartão na pilha e ficou sem dono
> sai no arquivo do sistema acadêmico com **nota 0 e COMPARECEU=N** — como se
> tivesse faltado.

---

## Em resumo

1. Digitalize o lote a 300 dpi, com o cartão-gabarito na frente.
2. Abra o programa e escolha o pacote da prova.
3. Marque os **itens anulados**, se a coordenação tiver anulado algum.
4. Mande ler.
5. **Resolva a conferência inteira** — e confira se nenhuma folha ficou sem
   dono: o número de estudantes tem de bater com o de cartões.
6. Imprima os boletins e exporte as notas.

Nada disso usa internet, e nada sai do computador da secretaria.
