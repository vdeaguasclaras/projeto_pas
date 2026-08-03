# Contrato de dados — web ⇄ app local

Dois arquivos ligam o sistema on-line ao leitor de cartões. Nenhum dos dois
carrega dado sensível além de matrícula e marcações.

## 1. Gabarito para o leitor (`pas-gabarito-leitor.json`)

Exportado no sistema web em **Cartões-resposta → “Exportar gabarito p/ leitor
local (JSON)”**. Diz ao leitor de que prova é o arquivo, quantas folhas cada
estudante recebe e o que procurar em cada uma.

> **Formato `v3`.** Este documento nasceu descrevendo a `v1`, quando cada versão
> da prova era uma lista simples de itens. Desde então o sistema passou a
> imprimir **mais de uma folha por estudante** (objetiva, discursiva e redação) e
> a atender **quatro provas** — e o gabarito precisou dizer de qual delas é, ou o
> leitor não distinguiria a folha do 9º ano da folha da 3ª série. O que está
> abaixo é o que o sistema exporta hoje, conferido contra um arquivo real.

```json
{
  "formato": "pas-marista/gabarito-v3",
  "prova": { "id": "pr-2em", "serie": "2ª série EM", "etapa": "1ª Etapa", "nome": "Simulado PAS 2026" },
  "simulado": "Simulado PAS 2026",
  "etapa": "1ª Etapa",
  "geradoEm": "2026-08-03T17:15:56.702Z",
  "identificacao": {
    "chave": "matricula",
    "ancoras": "quatro quadrados pretos, dois no topo e dois no rodapé de cada folha"
  },
  "versoes": {
    "regular": {
      "totalItens": 4,
      "folhas": [
        { "folha": 1, "tipo": "objetiva", "itens": [
            { "numero": 1, "tipo": "A", "gabarito": "C" },
            { "numero": 2, "tipo": "B", "gabarito": "960" },
            { "numero": 3, "tipo": "C", "gabarito": "B" } ] },
        { "folha": 2, "tipo": "discursiva", "percentuais": [0, 25, 50, 75, 100],
          "itens": [ { "numero": 4, "tipo": "D", "linhas": 8 } ] },
        { "folha": 3, "tipo": "redacao", "linhas": 30 }
      ]
    },
    "adaptada": { "totalItens": 4, "folhas": [ "…" ] }
  }
}
```

- **`folha 1 · objetiva`** é a única que o OMR lê: `tipo A` → 2 bolhas (C/E) ·
  `tipo C` → 4 bolhas (A–D) · `tipo B` → 3 colunas de 10 dígitos (centena,
  dezena, unidade).
- **`folha · discursiva`** traz as bolhas de percentual (0, 25, 50, 75, 100%)
  marcadas por **quem corrige**, não pelo estudante. Podem ser lidas na mesma
  passagem, mas não são resposta de estudante.
- **`folha · redacao`** é pauta de linhas: não tem bolha e não interessa ao OMR.
- A folha discursiva e a de redação só existem quando a prova as tem — o
  arquivo traz apenas as folhas que foram impressas.
- O campo `gabarito` é opcional para o leitor (a correção acontece no web), mas
  permite conferência local quando conveniente.
- **`prova.id`** identifica a prova. O sistema recusa, na importação, marcação de
  estudante que não está no elenco daquela prova.

## 2. Respostas lidas (`*.csv`)

Saída do leitor, importada no sistema web em **Correção e boletins →
“Importar respostas (CSV do leitor)”**. Uma marcação por linha, separador `;`:

```
matricula;item;resposta
2026-0142;1;C
2026-0142;2;E
2026-0142;28;960
```

Regras:

- `resposta` para tipo A: `C` ou `E` · tipos C/D: `A`–`D` · tipo B: número `0`–`999`.
- Item **em branco**: omitir a linha (ou enviar `resposta` vazia — o web apaga a marcação).
- **Dupla marcação ou leitura duvidosa**: NÃO inventar valor. O leitor deve
  gravar essas ocorrências em um segundo arquivo (`*_conferir.csv`, mesmas
  colunas + coluna `motivo`) para lançamento manual na tela de correção.
- Codificação UTF-8; aceita também `,` ou tabulação como separador.

## 3. Identificação da folha

O cartão impresso traz, para o leitor:

- **4 âncoras pretas** (quadrados) nos cantos da área útil — alinhamento por homografia;
- **matrícula impressa** em texto e em faixa de blocos no rodapé — a v1 do
  leitor pode pedir confirmação/entrada da matrícula por folha; a leitura
  automática da faixa entra na fase seguinte.
