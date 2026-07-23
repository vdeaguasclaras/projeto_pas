# Contrato de dados — web ⇄ app local

Dois arquivos ligam o sistema on-line ao leitor de cartões. Nenhum dos dois
carrega dado sensível além de matrícula e marcações.

## 1. Gabarito para o leitor (`pas-gabarito-leitor.json`)

Exportado no sistema web em **Cartões-resposta → “Exportar gabarito p/ leitor
local (JSON)”**. Diz ao leitor quantos itens existem em cada versão da prova e
de que tipo é cada um (para saber quantas bolhas procurar por linha).

```json
{
  "formato": "pas-marista/gabarito-v1",
  "simulado": "Simulado PAS 2026",
  "etapa": "1ª Etapa",
  "geradoEm": "2026-07-23T14:00:00.000Z",
  "versoes": {
    "regular": [
      { "numero": 1, "tipo": "A", "gabarito": "C" },
      { "numero": 2, "tipo": "C", "gabarito": "B" },
      { "numero": 3, "tipo": "B", "gabarito": "960" }
    ],
    "adaptada": [ { "numero": 1, "tipo": "A", "gabarito": "C" } ]
  }
}
```

- `tipo A` → 2 bolhas (C/E) · `tipo C/D` → 4 bolhas (A–D) · `tipo B` → 3 linhas de 10 dígitos.
- O campo `gabarito` é opcional para o leitor (a correção acontece no web),
  mas permite conferência local quando conveniente.

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
