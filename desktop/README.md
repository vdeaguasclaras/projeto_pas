# PAS Marista — Leitor de Cartões (app local Windows)

> **Situação: está de pé.** O aplicativo tem janela, lê os cartões, corrige,
> monta os boletins e exporta as notas para o sistema acadêmico da escola. O
> `.exe` foi **gerado e rodado numa máquina Windows** da escola, com o fluxo
> inteiro percorrido ali, e hoje é montado **por uma máquina do GitHub**: a
> instalação na secretaria é baixar um `.zip` e descompactar, sem comando nenhum
> (ver [`docs/instalacao.md`](docs/instalacao.md)).
>
> **E o pipeline OMR foi conferido no papel.** Quatro cartões
> da prova da 2ª série impressos na impressora da escola, dois preenchidos à mão
> e os quatro digitalizados no scanner da secretaria: **165 marcações, todas
> conferidas contra o papel, todas certas**, nenhuma na fila de conferência.
>
> O material veio da PR #3, fechada porque a metade `web/` dela virou o sistema
> que está em produção. As duas pontas que ligam este app ao sistema web já
> existiam: “⬇ Exportar gabarito p/ leitor local (JSON)” na tela de Cartões e
> “⬆ Importar respostas (CSV do leitor)” na de Correção. O que faltava era o
> miolo, e é ele que está aqui.

Aplicativo local para **digitalização em lote e leitura óptica (OMR)** dos
cartões-resposta impressos pelo sistema web. É a única parte do fluxo que
precisa rodar na máquina da escola, junto ao scanner de mesa.

## Papel no fluxo completo

```
Sistema web (on-line)                      App local (Windows)
─────────────────────                      ───────────────────
1. Imprime o CARTÃO-GABARITO e os     ──►  2. Digitaliza em lote (300 dpi)
   cartões nominais, com âncoras e         3. Lê âncoras, alinha por homografia
   faixa de identificação no rodapé        4. Lê a faixa: de quem é a folha
5. Exporta o gabarito JSON            ──►  5. Lê os alvéolos e decide
   (com a GEOMETRIA do cartão medida)      6. Gera CSV: matrícula;item;resposta
7. Importa o CSV na tela              ◄──  (o duvidoso vai para conferência,
   “Correção e boletins”                    com miniatura da folha)
```

O contrato de dados entre as duas pontas está em
[`docs/contrato-dados.md`](docs/contrato-dados.md); o caminho da imagem à
resposta, em [`docs/pipeline-omr.md`](docs/pipeline-omr.md).

## As quatro decisões que sustentam o resto

**1. A geometria do cartão não mora aqui.** Onde fica cada alvéolo nasce do flex
do CSS do sistema web — muda com o número de itens, com a quantidade de colunas,
com a altura do bloco de orientações. Um leitor com essas medidas decoradas
acertaria hoje e erraria calado na primeira mudança do cartão. Então o navegador
**mede** o cartão montado no ato da exportação e manda tudo dentro do gabarito
(`pas-marista/gabarito-v4`). O leitor recebe o desenho; não o adivinha.

**2. A folha diz de quem é.** O rodapé traz uma faixa de blocos que carrega
versão, tipo de cartão, número da folha e os algarismos da matrícula, fechada por
CRC-8. Sem ela, identificar um lote de 100 folhas custaria 100 digitações — e um
erro de digitação lança a prova de um estudante na conta de outro. Com o CRC,
folha torta ou dobrada **falha** em vez de mentir.

No **cartão extra** a faixa sai sem matrícula — na hora de imprimi-lo não se sabe
de quem ele vai ser —, e quem a informa é o estudante, em nove alvéolos. É a
única matrícula do sistema sem CRC por baixo, e o que a confere é o formato da
escola (nove algarismos começando em `225`), que vem no gabarito junto com a
geometria. Fora do padrão, a folha vai para a fila de conferência, com as
marcações já lidas junto.

**3. A pontuação não está escrita aqui, e são duas notas.** O aplicativo corrige e monta os
boletins, e o sistema on-line também corrige — a mesma prova, duas
implementações. Quanto vale cada resposta vem da **tabela de pesos que o pacote
traz**, a mesma que o sistema usa. Regra escrita em dois lugares diverge em
silêncio, e nota de prova ninguém confere contra uma segunda implementação:
descobre-se pelo estudante que reclama. Um teste faz os dois lados corrigirem as
mesmas marcações e compara nota a nota.

O boletim traz **duas notas**, porque são duas perguntas. O **escore do PAS**
desconta erro e pode ser negativo — é o que prepara para a prova de verdade, e é
por ele que se ordena a turma. A **Nota Marista** é a fração da prova que o
estudante acertou, sem desconto, na escala em que a escola lança nota; o
discursivo entra proporcional à nota recebida, e o que ainda não foi corrigido
sai da conta em vez de contar como erro. A escala vem no pacote
(`escore.marista`), como os pesos.

**4. Nada duvidoso vira resposta.** Dupla marcação, alvéolo a meio caminho, tipo
B com uma coluna vazia, faixa que não fecha: tudo isso sai em
`respostas_conferir.csv`, com o motivo. Resposta inventada é o único defeito que
ninguém descobre a tempo.

E, do outro lado da conferência, **três coisas diferentes que já foram a mesma**:
a resposta (a letra ou o número), o **item anulado** (`NULO` — o estudante marcou
duas alternativas; no PAS vale como erro, e o boletim imprime `N`) e o **item em
branco** (campo vazio; imprime `.`). O que continua na fila não é nenhuma das
três: não entra em conta nenhuma, imprime `?` e põe um aviso no alto do boletim.
Boletim com `?` é boletim emitido antes de a conferência estar resolvida — que é
o que esse aviso existe para impedir.

O preço disso é uma fila para alguém olhar, e ela vem com **a imagem de cada
marcação**: um recorte da folha, endireitado, com o número do item e a letra da
opção dentro. Tudo reunido em `conferencia.html`, que abre com dois cliques, sem
internet e sem programa instalado — confere-se no recorte, corrige-se no campo
ao lado, e um botão monta o CSV pronto para colar em “Importar respostas”.

## O cartão-gabarito

O sistema web imprime, **à frente do lote**, um cartão por versão com os alvéolos
do gabarito já preenchidos. Ele não é de estudante nenhum, e faz três coisas:

- **mede o papel** desta impressora e deste scanner — o quanto escurece um
  alvéolo vazio —, e isso vira a régua de reserva. O nível da MARCA não sai
  daqui: as dele são de toner e passam de 80% sempre, e o estudante escreve a
  caneta, que enche de 30% a 100%. A régua de cada folha preenchida sai da
  própria folha, do vão entre os alvéolos cheios e os vazios;
- **confere a geometria** — se o molde exportado não corresponder ao papel, isso
  aparece na primeira folha, não depois do lote lançado;
- **confere o próprio gabarito** — se a chave exportada discordar do que está
  impresso, alguém mexeu nos itens depois de imprimir os cartões, e o leitor
  interrompe com aviso e código de saída 1.

> Esta folha **é a chave da prova em papel** e viaja com o lote. Guarde-a como se
> guarda a prova.

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Linguagem | Python 3.11+ | ecossistema de visão computacional maduro |
| Leitura óptica | OpenCV + NumPy | âncoras, homografia e limiar de alvéolo |
| PDF → imagem | pypdfium2 | scanners geralmente salvam PDF multipágina |
| Interface | CLI primeiro; GUI (PySide6) na sequência | valida o pipeline antes de investir em tela |
| Empacotamento | PyInstaller (`.exe` único) | instala sem Python na máquina da secretaria |

## Estrutura

```
desktop/
├── README.md                  ← este arquivo
├── requirements.txt
├── docs/
│   ├── contrato-dados.md      ← formatos JSON/CSV compartilhados com o web
│   └── pipeline-omr.md        ← etapas da leitura óptica e casos de erro
├── principal.py               ← ponto de entrada do `.exe`
├── empacotar.spec             ← receita do PyInstaller
├── gerar-exe.bat              ← monta o pacote com dois cliques, no Windows
├── ferramentas/
│   └── extrair-tema.py        ← lê as cores do css/estilo.css do sistema
├── src/leitor/
│   ├── cli.py                 ← a linha de comando: `ler`, `corrigir`, `exportar`, `janela`
│   ├── lote.py                ← a leitura de um lote (a janela e o CLI usam esta)
│   ├── pacote.py              ← o pacote da prova: elenco, notas e pesos
│   ├── correcao.py            ← escore, desempenho por grupo e posição
│   ├── apuracao.py            ← das marcações à planilha e aos boletins
│   ├── boletim.py             ← o boletim individual, no desenho do boletim do PAS
│   ├── academico.py           ← o TXT de notas do sistema acadêmico da escola
│   ├── ui/                    ← a janela (PySide6) e o tema vindo do CSS
│   ├── molde.py               ← a geometria que veio do gabarito v4
│   ├── imagem.py              ← ingestão de PDF/JPEG/PNG
│   ├── ancoras.py             ← as 4 âncoras e a homografia
│   ├── codigo.py              ← a faixa de identificação (e o CRC-8)
│   ├── leitura.py             ← decisão por alvéolo, e a calibração
│   └── saida.py               ← os CSVs, os recortes e a página de conferência
└── testes/
    ├── gerar-amostras.mjs     ← imprime cartões DE VERDADE, pelo sistema web
    ├── testar-leitura.py      ← digitaliza-os torto e cobra o resultado
    ├── testar-correcao.py     ← o sistema e o app corrigem o mesmo, e se comparam
    ├── testar-anulacao.py     ← anulado e pendente não são “em branco”
    ├── testar-academico.py    ← o TXT, byte a byte, contra o arquivo de 2025
    ├── testar-janela.py       ← percorre os seis passos da janela
    └── referencia/            ← o trecho anonimizado do arquivo de 2025
```

## A janela

Seis passos, na ordem do trabalho na secretaria: **Prova** (escolher o pacote),
**Ler cartões** (a pasta das digitalizações, ou o PDF do lote, com barra de
progresso), **Conferência** (o que ficou em dúvida, com o pedaço do papel ao lado
e um campo para corrigir), **Resultados** (a planilha), **Boletins** e **Exportar
notas** (o TXT do sistema acadêmico). Um passo só abre quando o anterior deu o
que ele precisa.

A **exportação** pergunta só o que o aplicativo não tem como saber: o código da
prova no calendário da escola (`E3_P3`), o ano, o turno e para quais componentes
curriculares esta nota conta. O resto — matrícula, turma, nota e o código de nove
algarismos da disciplina — sai do pacote e da correção. **Ela se recusa a
acontecer enquanto houver marcação na fila de conferência**: essa nota vai para o
histórico escolar, e nota provisória lançada lá ninguém descobre que era
provisória.

A conferência já chega com a dupla marcação **proposta como `NULO`** — é o que o
papel diz, e quem confere só precisa concordar. Enquanto sobrar item na fila, a
tela de Boletins mostra em rosa quantos são e o que eles fazem com as notas.

Na conferência, **clicar no recorte abre a marcação ampliada**, e ao lado dela um
segundo recorte com o pedaço da folha em volta. O recorte justo mostra o alvéolo;
o de contexto mostra de que item ele é, qual a coluna e o que o vizinho recebeu —
que é o que a pessoa precisa para decidir sem ir buscar o papel na pilha. No tipo
B o recorte justo já vem com a coluna dos algarismos, porque o alvéolo sozinho
não diz nada ali.

O desenho é o do sistema on-line, e as cores vêm de lá **de verdade**:
`ferramentas/extrair-tema.py` lê o `:root` do `css/estilo.css` e gera
`src/leitor/ui/tema.py`. Nenhum código de cor da identidade está escrito à mão
deste lado — dois azuis quase iguais, e ninguém sabendo qual é o certo, é pior do
que um só. Ao mexer nas cores do sistema, rode a ferramenta de novo.

O que a janela **não** faz é repetir trabalho: ler o lote é `lote.ler_lote`,
corrigir é `apuracao.apurar` — os mesmos que a linha de comando chama. Casca não
é dona de regra.

```bash
python -m src.leitor.cli janela      # ou, no .exe, clicar duas vezes
```

## Uso

```bash
cd desktop
python -m venv .venv && .venv\Scripts\activate      # Windows
pip install -r requirements.txt

# o que o pacote exportado contém, sem ler digitalização nenhuma
python -m src.leitor.cli conferir --gabarito pas-pacote-pr-2em.json

# a leitura do lote — e, se o arquivo for o pacote, já os resultados e boletins
python -m src.leitor.cli ler --gabarito pas-pacote-pr-2em.json \
    --entrada ./digitalizacoes --saida ./resultado

# `--entrada` aceita a pasta OU o arquivo: o scanner salva o lote inteiro num PDF
# de várias páginas, e apontar para a pasta onde ele caiu mandaria ler todo PDF e
# toda imagem que houver ali dentro
python -m src.leitor.cli ler --gabarito pas-pacote-pr-2em.json \
    --entrada ./lote-2em.pdf --saida ./resultado

# depois de resolver a conferência: refaz a correção com o que foi decidido
python -m src.leitor.cli corrigir --gabarito pas-pacote-pr-2em.json \
    --respostas ./resultado/respostas.csv --respostas ./conferido.csv \
    --saida ./resultado

# as notas no formato do sistema acadêmico. Sem `--componente`, ele lista os
# componentes daquela série, com o código de cada um, e para
python -m src.leitor.cli exportar --gabarito pas-pacote-pr-2em.json \
    --respostas ./resultado/respostas.csv --respostas ./conferido.csv \
    --prova E3_P3 --componente "Matemática" --componente Biologia \
    --saida ./resultado
```

Sai em `./resultado`:

| Arquivo | O que é |
|---|---|
| `respostas.csv` | o que se leu sem dúvida — este entra no sistema web |
| `respostas_conferir.csv` | o que precisa de olho humano, com o motivo |
| `percentuais.csv` | os percentuais de acerto do discursivo, quando marcados |
| `folhas.csv` | uma linha por página digitalizada: o rastro do lote |
| `resultados.csv` | acertos, erros, brancos, anulados, pendentes, escore do PAS, % de acerto, Nota Marista, redação, posição e desempenho por grupo |
| `boletins.html` | o boletim de desempenho de cada estudante, pronto para imprimir |
| `conferencia.html` | a fila de conferência com a imagem de cada marcação duvidosa |
| `conferencia/*.png` | os recortes e as miniaturas das folhas que caíram na fila |
| `E3_P3-1serie.txt` | as notas no formato que o sistema acadêmico importa (só quando pedido) |

Código de saída: `0` tudo certo · `1` o cartão-gabarito divergiu do gabarito
exportado · `2` erro de uso (gabarito velho, pasta vazia).

## Teste

O teste não desenha cartão nenhum: ele **imprime os cartões pelo sistema web de
verdade**, num Chromium, e depois sujeita esses PDFs ao que o scanner da escola
faz com o papel — **mesa A3 com o cartão A4 deitado e solto no meio**, torto,
deslocado, borrado, chuviscado, recomprimido em JPEG, e uma folha ainda por cima
de cabeça para baixo. Um leitor testado contra imagem limpa e reta passaria aqui
e falharia na secretaria: foi assim que a primeira digitalização de verdade
recusou o lote inteiro, com as âncoras perfeitas e o cartão de lado.

```bash
npm install playwright && npx playwright install chromium   # uma vez só
node desktop/testes/gerar-amostras.mjs            # a prova de exemplo
node desktop/testes/gerar-amostras.mjs --grande   # 42 itens, 32 estudantes
python3 desktop/testes/testar-leitura.py
python3 desktop/testes/testar-leitura.py amostras-grande
python3 desktop/testes/testar-correcao.py
python3 desktop/testes/testar-anulacao.py
python3 desktop/testes/testar-academico.py
QT_QPA_PLATFORM=offscreen python3 desktop/testes/testar-janela.py
```

`testar-anulacao.py` não precisa de scanner nem de navegador: monta as marcações
à mão para cobrir os dois casos que já viraram “em branco” por descuido — o item
anulado e o item que ficou na fila — e confere o que cada um fez com a nota e com
o que sai impresso.

`testar-academico.py` compara o TXT gerado, **byte a byte**, com um trecho
anonimizado do arquivo que a escola importou em 2025. Formato de importação é
contrato com um programa que já existe, e que recusa o arquivo inteiro se uma
vírgula mudar de lugar.

`testar-correcao.py` é de outra natureza: ele faz o **sistema on-line** e o
aplicativo local corrigirem exatamente as mesmas marcações — as que o leitor
tirou dos cartões impressos — e compara nota a nota. É o que impede as duas
implementações do escore de divergirem.

Se o Chromium já estiver instalado em outro lugar, `CHROMIUM=/caminho/do/chrome`
dispensa o download; e `PLAYWRIGHT_BROWSERS_PATH`, se estiver definido, é
consultado sozinho.

O teste falha se alguma marcação impressa não voltar, se voltar diferente, se o
leitor devolver marcação que não foi impressa, ou se um dos casos difíceis
(dupla marcação, item em branco, tipo B pela metade) escapar da conferência.

## Roteiro

- [x] Definição de stack, estrutura e contrato de dados
- [x] Geometria do cartão medida e exportada pelo sistema web (gabarito v4)
- [x] Faixa de identificação no rodapé, com CRC-8 — a folha diz de quem é
- [x] Cartão-gabarito à frente do lote, para calibrar e conferir
- [x] Pipeline OMR: âncoras → homografia → faixa → alvéolos → CSV
- [x] Dupla marcação / leitura duvidosa / tipo B incompleto → fila de conferência
- [x] Teste ponta a ponta contra os PDFs impressos pelo sistema web
- [x] Correção, resultados e boletins no próprio aplicativo
- [x] Janela (PySide6) com a identidade visual do sistema
- [x] Gerar e testar o `.exe` numa máquina Windows
- [x] Exportação das notas para o sistema acadêmico da escola (TXT)
- [ ] Importação dos percentuais de acerto do discursivo pelo sistema web
