# PAS Marista — Leitor de Cartões (app local Windows)

> **Situação: projetado, não implementado.** Esta pasta tem o desenho do
> pipeline, o contrato de dados e o esqueleto da linha de comando — o
> `python -m src.leitor.cli ler` valida o gabarito e lista as digitalizações,
> mas ainda não lê bolha nenhuma (sai com código 3). Hoje as marcações são
> lançadas à mão na tela **Correção e boletins**.
>
> O material veio da PR #3, fechada porque a metade `web/` dela virou o sistema
> que está em produção. Esta metade não virou nada, e é a única frente do plano
> original que continua aberta — por isso foi resgatada para cá, em vez de ficar
> enterrada numa PR fechada. As duas pontas que a ligam ao sistema web **já
> existem e funcionam**: “⬇ Exportar gabarito p/ leitor local (JSON)” na tela de
> Cartões-resposta e “⬆ Importar respostas (CSV do leitor)” na de Correção.

Aplicativo local para **digitalização em lote e leitura óptica (OMR)** dos
cartões-resposta impressos pelo sistema web. É a única parte do fluxo que
precisa rodar na máquina da escola, junto ao scanner de mesa.

## Papel no fluxo completo

```
Sistema web (on-line)                      App local (Windows)
─────────────────────                      ───────────────────
1. Imprime cartões nominais  ──────────►   2. Digitaliza em lote (300 dpi)
   com âncoras + matrícula                 3. Lê âncoras, alinha e detecta bolhas
4. Exporta gabarito JSON     ──────────►   (usa o JSON para saber nº/tipo dos itens)
                                           5. Gera CSV: matrícula;item;resposta
6. Importa o CSV na tela     ◄──────────   (marcações duvidosas ficam sinalizadas
   "Correção e boletins"                    para conferência manual)
```

O contrato de dados entre as duas pontas está em
[`docs/contrato-dados.md`](docs/contrato-dados.md).

## Stack escolhida

| Camada | Escolha | Por quê |
|---|---|---|
| Linguagem | Python 3.12+ | ecossistema de visão computacional maduro |
| Leitura óptica | OpenCV + NumPy | detecção de âncoras, homografia e threshold de bolhas |
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
└── src/leitor/
    ├── __init__.py
    └── cli.py                 ← esqueleto da linha de comando
```

## Desenvolvimento

```bash
cd desktop
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
python -m src.leitor.cli --ajuda
```

## Roteiro (ver docs/plano-implantacao.md na raiz)

- [x] Definição de stack, estrutura e contrato de dados (esta pasta)
- [ ] Pipeline OMR: âncoras → homografia → grade de bolhas → CSV
- [ ] Tratamento de dupla marcação / leitura duvidosa (fila de conferência)
- [ ] GUI simples (arrastar pasta de digitalizações, barra de progresso)
- [ ] Empacotamento `.exe` com PyInstaller + guia de instalação
