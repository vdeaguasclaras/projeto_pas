# Plano de implantação — Sistema PAS Marista

Atualizado em 23/07/2026 (2ª rodada). Objetivo: sistema de simulados no
formato PAS/UnB para o Colégio Marista Águas Claras, com interface on-line
e um aplicativo local (Windows) para leitura óptica dos cartões-resposta.

## Visão das fases

| Fase | Entrega | Status |
|---|---|---|
| 0 | Protótipo navegável v2 + revisão de design | ✅ concluída |
| 1 | **MVP funcional on-line** + organização do app local | ✅ concluída |
| 1.5 | Ajustes de UX/regras da revisão do Raul (23/07) | ✅ esta entrega |
| 2 | Backend Supabase (login, banco on-line, multiusuário real) | ✅ esta entrega |
| 3 | Calibração de fidelidade dos documentos contra os PDFs reais do PAS | ⏳ próxima |
| 4 | App local de leitura óptica funcionando de ponta a ponta | ⏳ |
| 5 | Piloto com um simulado real + ajustes | ⏳ |

## Fase 1.5 — ajustes da revisão (23/07/2026)

- Cabeçalho sem sobreposição das abas + alternador de tema claro/escuro.
- Configuração do simulado sem "sala padrão" (campo SALA fica em branco nos
  documentos, para preenchimento na aplicação).
- Textos: título, fonte e corpo obrigatórios; quantidade de itens e regra
  visíveis/editáveis apenas pela coordenação; coordenação reordena textos
  (▲▼) e itens dentro de cada texto (◀▶) — a numeração da prova segue.
- Editor de item sem rolagem horizontal (diálogo largo responsivo).
- **Tipo D = item discursivo**: enunciado + resposta esperada, com escolha
  de espaço de resposta (com/sem linhas e quantidade). Sai do
  cartão-resposta; no caderno reserva o espaço; a nota (0–10) é lançada na
  Correção e vale nota/10 no escore bruto do MVP.
- Componentes em ordem alfabética, sem Espanhol (única LE: Inglês).
- Correção por papel: professora de redação vê apenas a tabela de NC/NE/TL;
  docente com itens D aprovados vê apenas o lançamento de notas dos seus
  itens; coordenação vê tudo.

## Fase 2 — Backend Supabase (implantada)

- Projeto **pas-marista** criado (`wtlmkyeukkvviqqrgiei`, região sa-east-1,
  plano pago — US$ 10/mês confirmados pelo Raul).
- Esquema em `supabase/migrations/0001_esquema_inicial.sql`: tabelas jsonb
  (`simulado_config`, `textos`, `itens`, `estudantes`, `respostas`) com RLS
  "somente usuários autenticados" e trigger de `updated_at`.
- Web: modo nuvem em `web/js/config-supabase.js` (chave publicável — segura
  em código de navegador) + driver `web/js/nuvem.js` (supabase-js embutido
  em `web/js/vendor/`, com fallback CDN). Login por e-mail/senha, papéis em
  metadados da conta (coordenação/docente/redação), sincronização granular
  por linha a cada mutação e botão "usar sem conexão" (modo local).
- Primeiro login com banco vazio inicializa a nuvem com os dados do
  navegador; conta da coordenação criada para raul.cardoso@gmail.com
  (senha temporária informada no chat — trocar no primeiro acesso).
- Observação: contas novas criadas pela equipe exigem confirmação por
  e-mail (padrão do Supabase). Para dispensar a confirmação:
  painel Supabase → Authentication → Sign In / Up → Confirm email (off).

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
- Pontuação simplificada e parametrizável: A ±1 · B +1 · C ±1 · branco 0 ·
  D (discursivo) = nota lançada/10. Pesos oficiais (parâmetro *x*) entram
  na fase 3.
- Sem paginação tipográfica real do caderno (fase 3, calibrada contra os
  PDFs do PAS que o Raul forneceu).

**Organização do app local** (pasta `desktop/`): stack definida
(Python + OpenCV, empacotado com PyInstaller), estrutura criada, contrato
de dados web ⇄ leitor documentado (`desktop/docs/contrato-dados.md`),
pipeline OMR especificado (`desktop/docs/pipeline-omr.md`) e esqueleto de
CLI que já valida o gabarito JSON exportado pelo web.

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
