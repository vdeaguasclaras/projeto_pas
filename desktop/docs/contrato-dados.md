# Contrato de dados — web ⇄ app local

Dois arquivos ligam o sistema on-line ao leitor de cartões. Nenhum dos dois
carrega dado sensível além de matrícula e marcações.

## 1. O pacote da prova (`pas-pacote-<prova>.json`)

Exportado no sistema web em **Cartões-resposta → “Exportar pacote da prova
(leitor e boletins)”**. Diz ao aplicativo local de que prova é o arquivo, quantas
folhas cada estudante recebe, o que procurar em cada uma, **onde** — e, desde que
o aplicativo passou a gerar os boletins, **quem** fez a prova e **quanto vale**
cada resposta.

> **Formato `pacote-v1`.** A `gabarito-v1` descrevia cada versão da prova como
> uma lista simples de itens. A `v3` acrescentou a identificação da prova e a
> divisão em folhas (objetiva, discursiva, redação). A `v4` acrescentou a
> **geometria medida do cartão** e a **faixa de identificação** do rodapé — sem
> elas o leitor teria de guardar o desenho da folha do lado dele, e erraria em
> silêncio na primeira mudança de medida.
>
> O `pacote-v1` é o `gabarito-v4` **inteiro**, com tudo no mesmo lugar, mais
> três coisas que só o boletim precisa: o **elenco**, as **notas já lançadas** e
> a **tabela de pesos** do escore (§6). É um superconjunto de propósito — o
> leitor aceita os dois formatos, e ninguém precisa escolher entre exportar
> “para ler” e exportar “para o boletim”.
>
> Formato anterior à `v4` é **recusado**, com mensagem dizendo para exportar de
> novo: adivinhar a geometria seria pior do que recusar.

```json
{
  "formato": "pas-marista/gabarito-v4",
  "prova": { "id": "pr-2em", "serie": "2ª série EM", "etapa": "1ª Etapa", "nome": "Simulado PAS 2026" },
  "simulado": "Simulado PAS 2026",
  "etapa": "1ª Etapa",
  "geradoEm": "2026-08-18T17:15:56.702Z",
  "identificacao": { "…": "ver §3" },
  "referencia": { "…": "ver §4" },
  "layout":     { "…": "ver §6" },
  "elenco":     [ "…" ], "notas": { "…": "…" }, "escore": { "…": "ver §5" },
  "versoes": {
    "regular": {
      "totalItens": 42,
      "folhas": [
        { "folha": 1, "tipo": "objetiva", "itens": [
            { "numero": 1, "tipo": "A", "gabarito": "C" },
            { "numero": 29, "tipo": "B", "gabarito": "960" },
            { "numero": 34, "tipo": "C", "gabarito": "B" } ] },
        { "folha": 2, "tipo": "discursiva", "percentuais": [0, 25, 50, 75, 100],
          "itens": [ { "numero": 42, "tipo": "D", "linhas": 8 } ] },
        { "folha": 3, "tipo": "redacao", "linhas": 30 }
      ]
    },
    "adaptada": { "totalItens": 28, "folhas": [ "…" ] }
  }
}
```

- **`folha 1 · objetiva`** é a que o OMR lê: `tipo A` → 2 alvéolos (C/E) ·
  `tipo C` → 4 alvéolos (A–D) · `tipo B` → 3 colunas de 10 algarismos (centena,
  dezena, unidade). Quando os itens não cabem numa folha, seguem em folhas de
  continuação, e o `layout` traz uma entrada por folha.
- **`folha · discursiva`** traz os alvéolos de percentual (0, 25, 50, 75, 100%)
  marcados por **quem corrige**, não pelo estudante. São lidos na mesma passagem
  e saem em `percentuais.csv`, à parte.
- **`folha · redacao`** é pauta de linhas: não tem alvéolo e o leitor a ignora.
- O campo `gabarito` é o que permite a conferência local contra o cartão-gabarito
  (§4). A correção continua acontecendo no sistema web.
- **`prova.id`** identifica a prova. O sistema recusa, na importação, marcação de
  estudante que não está no elenco daquela prova.

## 2. Respostas lidas (`*.csv`)

Saída do leitor, importada no sistema web em **Correção e boletins →
“Importar respostas (CSV do leitor)”**. Uma marcação por linha, separador `;`:

```
matricula;item;resposta
20260142;1;C
20260142;2;E
20260142;29;960
```

Regras:

- `resposta` para tipo A: `C` ou `E` · tipos C/D: `A`–`D` · tipo B: número
  `000`–`999`, sempre com três algarismos.
- Item **em branco**: a linha não sai (ou sai com `resposta` vazia — o web apaga
  a marcação).
- **A matrícula sai em ALGARISMOS.** A do Marista Águas Claras tem nove e começa
  em `225`, que identifica a unidade. A faixa do rodapé é numérica, então
  qualquer pontuação que a planilha da secretaria traga (`225.100.142`) volta de
  lá sem ela. A importação do sistema web casa primeiro pelo texto exato e
  depois pelos algarismos; matrículas do elenco que só se distinguem pela
  pontuação são recusadas nas duas, porque atribuir a prova ao estudante errado
  é pior do que não atribuir.
- **Dupla marcação, leitura duvidosa ou tipo B pela metade**: NÃO vira valor. Vai
  para `respostas_conferir.csv` (mesmas colunas + `motivo` e `folha`), com uma
  miniatura em `conferencia/`, para lançamento manual.
- Codificação UTF-8; a importação aceita `;`, `,` ou tabulação.

Saem junto, na mesma pasta: `percentuais.csv` (os percentuais do discursivo — o
sistema web **ainda não os importa**), `folhas.csv`, uma linha por página
digitalizada, que é o rastro do lote, e `conferencia.html`, a fila de dúvidas com
a imagem recortada de cada marcação e um botão que monta o CSV corrigido.

## 3. Identificação da folha

O cartão impresso traz, para o leitor:

### 3.1 As quatro âncoras

Quadrados pretos de 9pt, dois no topo e dois no rodapé da área útil. Estão
**sempre na mesma posição**, em toda folha de todo cartão — a exportação confere
isso e se recusa a exportar se algum dia deixarem de estar. É essa invariância
que permite alinhar a folha por homografia **antes** de saber que folha é.

### 3.2 A faixa de identificação

Uma linha de blocos no rodapé — em `v3` ainda era um enfeite de largura fixa
(`▮▯▮▮▯▮▮▯`), igual em toda folha. Hoje carrega, na ordem em que os blocos são
impressos:

| campo | bits | conteúdo |
|---|---|---|
| `sinc` | 4 | `1010`, sempre |
| `versao` | 1 | 0 regular · 1 adaptada |
| `tipo` | 2 | 0 nominal · 1 extra · 2 gabarito |
| `folha` | 4 | número desta folha |
| `total` | 4 | quantas folhas o estudante recebeu |
| `nDigitos` | 4 | quantos algarismos tem a matrícula |
| `matricula` | 48 | 12 algarismos BCD |
| `crc8` | 8 | CRC-8/ATM (0x07) sobre `versao`…`matricula`, completado com zeros até fechar bytes |

São 75 células. O CRC é o que separa “não consegui ler” de “li errado”: folha
torta, dobrada ou digitalizada pela metade falha no CRC e vai para a conferência.
É ele também que permite ao leitor resolver sozinho a folha que entrou de cabeça
para baixo — gira 180° e tenta de novo.

O bloco de campos está descrito dentro do próprio JSON, em
`identificacao.faixa`, para que o arquivo continue legível sem esta tabela.

### 3.3 O formato da matrícula

```json
"identificacao": {
  "matricula": { "digitos": 9, "prefixo": "225",
                 "descricao": "nove algarismos, começando em 225 (código da unidade)" }
}
```

É regra da escola, e por isso desce ao leitor pelo arquivo em vez de ficar
escrita do lado dele — como a geometria. Serve para **duvidar de leitura**, e o
lugar onde isso decide alguma coisa é o cartão extra (§3.4).

### 3.4 O cartão extra

O cartão de reserva sai sem identificação impressa: no momento de imprimi-lo não
se sabe de quem ele vai ser. A faixa dele traz `tipo = extra` e nenhum algarismo
de matrícula; quem a informa é o estudante, na **grade de alvéolos** do alto da
folha (9 posições × 10 algarismos), e é o OMR que a lê.

**Esta é a única matrícula do sistema que não tem CRC por baixo.** Nas folhas
nominais ela viaja na faixa, e leitura torta falha em vez de mentir; aqui o que
sai são nove alvéolos lidos opticamente, e um algarismo a mais ou a menos
atribuiria a prova a outra pessoa em silêncio. Duas conferências fecham isso, e
as duas mandam a folha para a fila em vez de corrigi-la:

- **posição em branco no meio** da matrícula — não dá para saber se o estudante
  pulou a casa ou deixou de preencher;
- **matrícula fora do formato** de §3.3 — nove algarismos, começando em 225.

Folha recusada assim não perde o que foi lido: as marcações vão inteiras para
`respostas_conferir.csv` com motivo `folha_sem_matricula`, para o operador
identificar o estudante uma vez e lançar o que já está lido.

## 4. O cartão-gabarito (`referencia`)

O sistema web imprime, à frente do lote, um cartão por versão com os alvéolos do
gabarito preenchidos, marcado na faixa com `tipo = gabarito`. Ele calibra o
limiar de tinta desta impressora e deste scanner, confere que o molde exportado
corresponde ao papel, e confere que a chave exportada é a mesma que foi impressa.
Divergência aí interrompe o lote com código de saída 1.

Ele nunca gera resposta: a faixa o identifica, e a matrícula dele é vazia.

## 5. Elenco, notas e pesos — o que o boletim precisa

O aplicativo local gera os boletins de desempenho, e boletim precisa de coisas
que o gabarito não tinha: o **nome** de quem fez a prova, a **turma**, e as notas
que só existem no banco — a do **discursivo**, lançada por quem corrige, e a da
**redação**, lançada pela professora.

```json
"elenco": [ { "matricula": "225100142", "nome": "Antonia Silva",
              "turma": "1ª B", "versao": "regular" } ],
"notas": { "225100142": { "discursivas": { "42": 8.5 },
                          "redacao": { "nc": 8, "ne": 2, "tl": 25 } } },
"escore": {
  "pesos": { "A": {"certo":1,"errado":-1,"branco":0},
             "B": {"certo":1,"errado":0,"branco":0},
             "C": {"certo":1,"errado":-1,"branco":0},
             "D": {"escala":10} },
  "grupos": ["Interpretar","Planejar","Executar","Criticar"],
  "redacao": { "formula": "NR = NC − 2·NE/TL", "piso": 0 }
}
```

- As notas do discursivo são chaveadas pelo **número do item**, não pelo `id`
  interno: o número é o que está impresso no cartão e o que o leitor conhece.
- Cada item em `versoes[].folhas[].itens[]` passou a trazer também `grupo` (o
  grupo de habilidades) e `componente` — é deles que sai a barra “proporção de
  acertos por grupo” do boletim, e deduzi-los do número do item seria adivinhação.
- **A tabela de pesos viaja como DADO, e não é detalhe.** O escore é calculado
  dos dois lados agora — no sistema, para a tela de Correção; no aplicativo, para
  os boletins — e regra escrita em dois lugares diverge em silêncio: bastaria a
  fase 5 mudar o peso de um tipo num lado e esquecer o outro para a mesma prova
  valer notas diferentes conforme quem a corrigiu. Do lado do sistema a tabela é
  `PESOS_DO_ESCORE` (js/dados.js); do lado do leitor **não há número de pontuação
  escrito em lugar nenhum**. Um teste (`desktop/testes/testar-correcao.py`) faz
  os dois corrigirem as mesmas marcações e compara nota a nota.

> ⚠️ **Este arquivo leva nome de estudante**, o que o gabarito evitava de
> propósito. É dado da escola indo para uma máquina da escola, e sem ele não há
> boletim — mas trata-se dele como se trata a lista de estudantes, e não como se
> tratava o gabarito.

## 6. A geometria (`layout`)

Medida pelo navegador no ato da exportação, em **pontos**, na folha de 595×842pt,
com origem no canto superior esquerdo.

```json
"layout": {
  "unidade": "pt",
  "folhaPt": { "largura": 595, "altura": 842 },
  "ancoras": [ {"x":29.89,"y":107.79}, {"x":565.11,"y":107.79},
               {"x":29.89,"y":801.06}, {"x":565.11,"y":801.06} ],
  "codigo":  { "celulas": [ {"x":27.49,"y":815.77}, "…" ],
               "largura": 4.2, "altura": 4.99, "sinc": "1010", "digitos": 12 },
  "campos":  { "matricula": {"x":355.5,"y":31.09,"largura":145.37,"altura":11.79} },
  "cartoes": {
    "regular": {
      "nominal": { "folhas": [ { "tipo": "objetiva", "alveolos": [
        {"x":51.89,"y":203.04,"r":4.25,"item":1,"valor":"C"},
        {"x":70.07,"y":203.04,"r":4.25,"item":1,"valor":"E"},
        {"x":"…","y":"…","r":4.25,"item":29,"coluna":"C","digito":7},
        {"x":"…","y":"…","r":4.25,"campo":"matricula","posicao":0,"digito":3},
        {"x":"…","y":"…","r":4.25,"item":42,"percentual":50}
      ] } ] },
      "extra": { "folhas": [ "…" ] }
    },
    "adaptada": { "…": "…" }
  }
}
```

- As âncoras e a faixa são **uma só** para o cartão inteiro: valem em toda folha.
- Há duas famílias de molde por versão. `extra` traz a grade da matrícula no alto
  e por isso empurra o corpo para baixo; `nominal` serve também ao
  cartão-gabarito, que tem a mesma geometria.
- A ordem de `cartoes.<versao>.<familia>.folhas` é a ordem impressa, e casa com o
  campo `folha` da faixa.
- Cada alvéolo diz o que decide: `valor` (tipos A e C), `coluna`+`digito`
  (tipo B), `campo`+`posicao`+`digito` (matrícula do extra) ou `percentual`
  (folha discursiva). `r` é o raio externo; o leitor amostra só o miolo, porque o
  anel impresso é rosa — que em tons de cinza é escuro.
