# Projeto PAS — Sistema PAS Marista

Protótipo navegável do Sistema PAS Marista (simulados no formato PAS/UnB): painel de coordenação, textos-base com alocação de itens por slots, editor de itens com revisão comentada, caderno de provas, cartão-resposta e correção/boletins.

- `sistema-pas-marista.html` — **redesign "Ar & Luz" (v1a)**, arquivo único (HTML/CSS/JS inline). App com sidebar de navegação, mais respiro e animações (contadores, barras que crescem, cascata de entrada, blobs flutuantes). Abra direto no navegador. Implementa fielmente as 6 telas do design de referência publicado no claude.ai/design (projeto "Projeto PAS design review", arquivo `Sistema PAS Marista.dc.html`).
- `prototipo-pas-marista.html` — protótipo v2 anterior (abas horizontais, visual denso), arquivo único. Mantido como referência de conteúdo e regras de negócio.
- `assets/logo-marista.png` — brasão oficial do Colégio Marista Águas Claras.

## Telas do redesign

1. **Painel** (coordenação) — saudação, 3 KPIs animados, cards de versão regular/adaptada, tabela de entregas por componente curricular.
2. **Textos-base** — alocação livre de itens por texto, com cabeçalhos expansíveis e slots por tipo (A/B/C/D).
3. **Itens** — editor de item com o texto-base (linhas destacadas) e a conversa de revisão.
4. **Provas** — caderno de provas com diagramação fiel ao padrão PAS/Cebraspe.
5. **Cartão-resposta** — cartão óptico nominal com bolhas, marcadores e código de matrícula.
6. **Correção e boletins** — cartões lidos, desempenho por turma e boletim individual.

O redesign respeita `prefers-reduced-motion` (desliga todas as animações). Os dados são estáticos no protótipo; na implementação final viriam da API do projeto.

Fonte visual: design de alta fidelidade importado via claude.ai/design (atualizado em 07/2026). O protótipo v2 foi recuperado do artifact "Protótipo — Sistema PAS Marista" publicado no claude.ai.
