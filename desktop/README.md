# PAS Marista — Leitor de Cartões (app local Windows)

> **Situação: o pipeline OMR funciona.** `python -m src.leitor.cli ler` alinha as
> folhas pelas âncoras, descobre de quem é cada uma pela faixa de identificação
> do rodapé, lê os alvéolos e gera os CSVs. O que falta é a interface gráfica e o
> empacotamento `.exe` — a leitura em si está de pé e testada ponta a ponta
> contra os PDFs que o sistema web imprime.
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

## As três decisões que sustentam o resto

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

**3. Nada duvidoso vira resposta.** Dupla marcação, alvéolo a meio caminho, tipo
B com uma coluna vazia, faixa que não fecha: tudo isso sai em
`respostas_conferir.csv`, com o motivo e uma miniatura da folha para o operador
achar o papel na pilha. Resposta inventada é o único defeito que ninguém
descobre a tempo.

## O cartão-gabarito

O sistema web imprime, **à frente do lote**, um cartão por versão com os alvéolos
do gabarito já preenchidos. Ele não é de estudante nenhum, e faz três coisas:

- **calibra a tinta** desta impressora e deste scanner — o limiar de “alvéolo
  preenchido” sai de uma folha onde se sabe, alvéolo por alvéolo, o que devia
  estar marcado, em vez de ser um número escolhido no escuro;
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
├── src/leitor/
│   ├── cli.py                 ← a linha de comando: `ler` e `conferir`
│   ├── molde.py               ← a geometria que veio do gabarito v4
│   ├── imagem.py              ← ingestão de PDF/JPEG/PNG
│   ├── ancoras.py             ← as 4 âncoras e a homografia
│   ├── codigo.py              ← a faixa de identificação (e o CRC-8)
│   ├── leitura.py             ← decisão por alvéolo, e a calibração
│   └── saida.py               ← os CSVs e as miniaturas de conferência
└── testes/
    ├── gerar-amostras.mjs     ← imprime cartões DE VERDADE, pelo sistema web
    └── testar-leitura.py      ← digitaliza-os torto e cobra o resultado
```

## Uso

```bash
cd desktop
python -m venv .venv && .venv\Scripts\activate      # Windows
pip install -r requirements.txt

# o que o gabarito exportado contém, sem ler digitalização nenhuma
python -m src.leitor.cli conferir --gabarito pas-gabarito-pr-2em.json

# a leitura do lote
python -m src.leitor.cli ler --gabarito pas-gabarito-pr-2em.json \
    --entrada ./digitalizacoes --saida ./resultado
```

Sai em `./resultado`:

| Arquivo | O que é |
|---|---|
| `respostas.csv` | o que se leu sem dúvida — este entra no sistema web |
| `respostas_conferir.csv` | o que precisa de olho humano, com o motivo |
| `percentuais.csv` | os percentuais de acerto do discursivo, quando marcados |
| `folhas.csv` | uma linha por página digitalizada: o rastro do lote |
| `conferencia/*.png` | miniatura de cada folha que caiu na fila |

Código de saída: `0` tudo certo · `1` o cartão-gabarito divergiu do gabarito
exportado · `2` erro de uso (gabarito velho, pasta vazia).

## Teste

O teste não desenha cartão nenhum: ele **imprime os cartões pelo sistema web de
verdade**, num Chromium, e depois sujeita esses PDFs ao que um scanner de mesa
faz com o papel — gira, desloca, borra, chuvisca, recomprime em JPEG e vira uma
folha de cabeça para baixo. Um leitor testado contra imagem limpa e reta passaria
aqui e falharia na secretaria.

```bash
npm install playwright                            # ou NODE_PATH para a global
node desktop/testes/gerar-amostras.mjs            # a prova de exemplo
node desktop/testes/gerar-amostras.mjs --grande   # 42 itens, 32 estudantes
python3 desktop/testes/testar-leitura.py
python3 desktop/testes/testar-leitura.py amostras-grande
```

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
- [ ] GUI simples (arrastar pasta de digitalizações, barra de progresso)
- [ ] Empacotamento `.exe` com PyInstaller + guia de instalação
- [ ] Importação dos percentuais de acerto do discursivo pelo sistema web
