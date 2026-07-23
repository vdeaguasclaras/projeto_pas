# Plano de implantação — Sistema PAS Marista

Atualizado em 23/07/2026. Objetivo: sistema de simulados no formato PAS/UnB
para o Colégio Marista Águas Claras, com interface on-line e um aplicativo
local (Windows) para leitura óptica dos cartões-resposta.

## Visão das fases

| Fase | Entrega | Status |
|---|---|---|
| 0 | Protótipo navegável v2 + revisão de design | ✅ concluída |
| 1 | **MVP funcional on-line** + organização do app local | ✅ esta entrega |
| 2 | Backend Supabase (login, banco on-line, multiusuário real) | ⏳ próxima |
| 3 | Calibração de fidelidade dos documentos contra os PDFs reais do PAS | ⏳ |
| 4 | App local de leitura óptica funcionando de ponta a ponta | ⏳ |
| 5 | Piloto com um simulado real + ajustes | ⏳ |

## Fase 1 — MVP (esta entrega)

**Interface on-line** (pasta `web/`, publicada no Vercel):

- 6 telas funcionais: Painel, Textos e alocação, Itens e revisão, Caderno,
  Cartões-resposta, Correção e boletins.
- Textos-base com slots livres (docentes alocam itens; coordenação aprova
  sugestões e registra regras por texto).
- Itens A/B/C/D com texto-base sempre visível, linhas de referência
  destacadas, e fluxo de revisão em dois níveis com conversa registrada
  (docente → coordenação de área → coordenação geral → aprovado).
- Duas versões de prova (regular/adaptada) com numeração contínua automática.
- Caderno de provas e cartões nominais gerados em HTML fiel ao padrão de
  papel, impressos via navegador ("Salvar como PDF").
- Correção: lançamento manual por estudante, importação de CSV do leitor
  local, redação pela planilha oficial (NR = NC − 2·NE/TL), relatório por
  turma, boletins individuais em lote e planilha de notas.
- Perfis Coordenação/Docente (troca livre, sem senha nesta fase).

**Limitações deliberadas do MVP** (resolvidas na fase 2):

- Persistência em `localStorage` do navegador — um "banco" por máquina.
  Botões de backup (exportar/importar JSON) cobrem o intervalo até o
  Supabase. A camada de dados está isolada em `web/js/store.js` justamente
  para essa troca.
- Pontuação simplificada e parametrizável: A ±1 · B +1 · C/D ±1 · branco 0.
  Pesos oficiais (parâmetro *x*) entram na fase 3.
- Sem paginação tipográfica real do caderno (fase 3, calibrada contra os
  PDFs do PAS que o Raul forneceu).

**Organização do app local** (pasta `desktop/`): stack definida
(Python + OpenCV, empacotado com PyInstaller), estrutura criada, contrato
de dados web ⇄ leitor documentado (`desktop/docs/contrato-dados.md`),
pipeline OMR especificado (`desktop/docs/pipeline-omr.md`) e esqueleto de
CLI que já valida o gabarito JSON exportado pelo web.

## Fase 2 — Backend Supabase

- Criar projeto Supabase dedicado. **Atenção**: a conta está no limite de
  2 projetos ativos do plano gratuito (`mapa-de-sala` e
  `sistema-acompanhamento-pedagogico`). Decidir: pausar um projeto,
  ou upgrade do plano.
- Esquema: `usuarios` (papéis: coordenacao, coord_area, docente), `textos`,
  `itens`, `comentarios`, `estudantes`, `respostas`, `simulados` — com RLS
  por papel.
- Trocar `web/js/store.js` por chamadas supabase-js (Auth + Postgres),
  mantendo a interface atual da camada de dados.
- Migração: o backup JSON do MVP importa direto no novo banco.

## Fase 3 — Fidelidade documental

- Calibrar caderno página a página contra os PDFs reais (tipografia,
  numeração de linhas de 3 em 3, comandos, capa, quebras).
- Congelar a geometria do cartão-resposta e versionar o layout junto com o
  leitor (`desktop/src/leitor/layout.py`).
- Pesos/parâmetro *x* oficiais na correção.

## Fase 4 — Leitor local

- Implementar o pipeline OMR conforme especificação; testes com lote real
  digitalizado no scanner da escola; empacotar `.exe`.

## Fase 5 — Piloto

- Rodar um simulado completo de ponta a ponta com uma turma; coletar
  ajustes; só então ampliar para todas as turmas.

## Implantação contínua

- **Interface on-line hoje (MVP publicado)**:
  https://claude.ai/code/artifact/6d2cf29c-fda5-4214-83ba-0ab28b870fed
  (versão single-file do `web/`, privada, compartilhável pelo menu da página).
- **Vercel (destino definitivo)**: a integração conectada não tem permissão
  para *criar* projetos no time "Raul Cardoso's projects" (erro 403 em
  23/07/2026). Destrave com um destes passos:
  1. criar manualmente um projeto vazio chamado `pas-marista` no painel do
     Vercel (aí o deploy da pasta `web/` sai por aqui mesmo); ou
  2. elevar o papel do token da integração para poder criar projetos.
  O conteúdo publicado é a pasta `web/` como site estático, sem build.
- Repositório: `vdeaguasclaras/projeto_pas`, trabalho em branches +
  pull request.
