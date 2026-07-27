# Plano de implantação — Sistema PAS Marista

Estado em 27/07/2026.

## Onde estamos

| Fase | O que é | Situação |
|---|---|---|
| 1 · MVP navegável | Todas as telas funcionando com dados no navegador (localStorage) | **concluída** |
| 2 · Multiusuário | Banco on-line, login por conta, papéis e mesmo simulado para toda a equipe | **concluída** |
| 3 · Fidelidade dos documentos | Caderno e cartão calibrados página a página contra os PDFs reais do PAS | a fazer |
| 4 · Leitura óptica | Aplicativo local (Windows) que lê os cartões digitalizados em lote | a fazer |
| 5 · Calibração da pontuação | Parâmetro *x*, pesos oficiais por tipo de item e escore padronizado | a fazer |

## Arquitetura

Site estático, sem etapa de build: HTML + CSS + JavaScript de módulos nativos.

```
index.html            casca da página
css/estilo.css        identidade visual (Marista: azul #0d2f8a / rosa #e5007e)
js/config-supabase.js endereço e chave publicável do banco
js/dados.js           modelo de dados, dados de exemplo, cache local
js/nuvem.js           driver do Supabase (auth, tabelas, Edge Function)
js/app.js             as 7 telas, regras de prova e correção
js/vendor/supabase.js biblioteca supabase-js (cópia versionada — sem CDN)
supabase/migrations/  esquema e regras de acesso do banco
supabase/functions/   Edge Function `equipe` (administração de contas)
```

O estado do simulado vive em memória (`S`) e é espelhado no Supabase **linha a
linha** a cada alteração (`PERS` em `js/app.js`). Duas pessoas mexendo em coisas
diferentes não se sobrescrevem; o botão 🔄 e a volta à aba recarregam o que os
outros gravaram.

O `localStorage` continua como cache e como modo de contingência: se o banco
estiver fora do ar, dá para trabalhar off-line em “usar sem conexão” e exportar
o backup em JSON.

## Como o acesso funciona

1. A tabela `public.equipe` é a lista de quem pode entrar, com o **papel** de
   cada pessoa (coordenação, docente, professora de redação).
2. Um gatilho em `auth.users` recusa a criação de conta de e-mail fora dessa
   lista — mesmo que alguém chame a API do Supabase por fora do sistema.
3. O RLS de **todas** as tabelas exige `eh_equipe()`: sair da lista é perder o
   acesso aos dados no mesmo instante.
4. O papel exibido e aplicado pelo sistema vem da tabela, **não** do que a conta
   declara sobre si mesma. Ninguém vira coordenação por conta própria.
5. Criar conta, redefinir senha e remover acesso passam pela Edge Function
   `equipe`, a única que conhece a chave de serviço. Ela confere se quem chamou
   é da coordenação antes de qualquer coisa.

A chave que aparece em `js/config-supabase.js` é a chave **publicável**: ela é
feita para ficar no navegador e não dá acesso a nada sozinha — quem manda é o
login mais as regras de RLS.

## Fase 3 — fidelidade dos documentos (próximo passo)

O que precisa ser calibrado contra os PDFs reais do PAS/Cebraspe:

- tipografia e medidas de coluna do caderno;
- numeração das linhas do texto-base de 3 em 3;
- quebras de página (nenhum item partido entre páginas);
- posição das âncoras de leitura óptica no cartão-resposta;
- folha de rosto e instruções ao estudante.

Método: colocar o PDF real ao lado da impressão do sistema, página a página, e
ajustar `css/estilo.css` (blocos `.folha`, `.colunas`, `.item-prova`, `.cr-*`).

## Fase 5 — pontuação

Hoje o escore bruto usa a simplificação documentada na própria tela: tipo A
certo +1 / errado −1; tipo B certo +1; tipos C e D certo +1 / errado −1; branco
0. Redação pela planilha oficial, `NR = NC − 2·NE/TL`. Falta aplicar os pesos
oficiais e o parâmetro *x* de cada versão da prova.

## Pendências operacionais

- **Proteção contra senha vazada** (Supabase → Authentication → Passwords):
  ligar a verificação no HaveIBeenPwned. Não dá para ativar por API; é um
  clique no painel.
- **Contas da equipe**: criar pela tela “7 · Equipe” conforme os docentes
  entrarem no projeto.
