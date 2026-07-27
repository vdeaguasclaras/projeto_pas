# Plano de implantação — Sistema PAS Marista

Estado em 27/07/2026.

## Onde estamos

| Fase | O que é | Situação |
|---|---|---|
| 1 · MVP navegável | Todas as telas funcionando com dados no navegador (localStorage) | **concluída** |
| 2 · Multiusuário | Banco on-line, login por conta, papéis e mesmo simulado para toda a equipe | **concluída** |
| 3 · Fidelidade dos documentos | Caderno e cartão calibrados página a página contra os PDFs reais do PAS | **caderno concluído**; cartão pendente |
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

## Fase 3 — fidelidade dos documentos

### Caderno — concluído

Medidas extraídas dos cadernos CEBRASPE/UnB — PAS 1, 2 e 3, edital 2025 — e
reproduzidas em `css/estilo.css` (bloco “caderno de provas”):

| Elemento | Medida |
|---|---|
| Página | A4, 595×842pt |
| Fio do cabeçalho | y 41,3 · x 27→568,4 · cinza 50%, 1,4pt |
| Fio do rodapé | y 805,7 |
| Identificação | 9pt, alinhada à direita, y 31,9 |
| “-- PARTE 2 --” | 12pt, centralizado, y 49,7 |
| Colunas | 266,05pt cada, vão de 9pt, fio preto de 0,7pt em x 297,4 |
| Área de texto | y 69,8 → 802,3 (730pt por coluna) |
| Corpo | 10pt, entrelinha 13,3pt, justificado |
| Recuo de parágrafo | 28,4pt na primeira linha |
| Nº do item | 9pt em negrito, recuado 18pt para fora da coluna |
| Opções (tipo C) | letra em negrito, texto recuado 14,3pt |
| Crédito da fonte | 6pt, alinhado à direita |
| Pauta de resposta | linhas de 17pt, como no rascunho da redação |

A conferência é automatizável: gera-se o PDF pelo Chromium e comparam-se as
coordenadas com as dos PDFs de referência (PyMuPDF). Na última medição, **13 de
13 elementos ficaram dentro de 2pt** do original.

**Dois achados que corrigiram suposições do protótipo:**

1. **O PAS não numera as linhas dos textos-base.** O que parecia numeração nos
   PDFs é o número do item, recuado para fora da coluna. A numeração continua
   disponível por texto (formato “linhas numeradas”), mas desligada por padrão.
2. **Dentro de cada bloco, os itens vêm agrupados por tipo** (A, depois B, C e
   D). É isso que permite o comando contínuo do original — “julgue os itens de
   11 a 19 e assinale a opção correta no item 20, que é do tipo C”. O sistema
   agora ordena assim ao montar a prova e **redige o comando sozinho** a partir
   da composição do bloco; só a abertura da frase é escrita pela coordenação.

A paginação é feita em JavaScript (`medirPecas` e `distribuir` em `js/app.js`),
não pelo CSS de impressão: o Chrome posiciona cabeçalhos `position:fixed` de
forma errática entre páginas. Cada página é uma folha A4 completa, o que faz a
prévia na tela mostrar exatamente o que sai impresso.

### Cartão-resposta — pendente

Falta o modelo de referência. Para calibrar, é preciso um PDF do caderno de
respostas do PAS (não veio no lote de 2025): posição e diâmetro das bolhas,
âncoras de leitura óptica, área de identificação do estudante e o campo da
redação. Sem esse arquivo, o cartão segue no desenho do MVP.

### Capa

A capa reproduz a estrutura do caderno original: arte temática à esquerda com a
faixa de subprograma e etapa, instruções numeradas à direita e as observações no
rodapé. Tanto a imagem quanto o texto das instruções são editáveis na tela do
caderno (“Capa e instruções”), já que a arte muda a cada edição e costuma
remeter aos textos da prova ou ao tema da redação.

## Fase 5 — pontuação

Hoje o escore bruto usa a simplificação documentada na própria tela: tipo A
certo +1 / errado −1; tipo B certo +1; tipos C e D certo +1 / errado −1; branco
0. Redação pela planilha oficial, `NR = NC − 2·NE/TL`. Falta aplicar os pesos
oficiais e o parâmetro *x* de cada versão da prova.

## Hospedagem

Vercel (projeto `projeto-pas`), conectada ao repositório do GitHub. Sem etapa
de build: o site é servido direto da raiz do repositório. `.vercelignore` deixa
de fora `supabase/`, `docs/` e `.github/`, que existem só para o
desenvolvimento.

## Pendências operacionais

- **Proteção contra senha vazada** (Supabase → Authentication → Passwords):
  ligar a verificação no HaveIBeenPwned. Não dá para ativar por API; é um
  clique no painel.
- **Contas da equipe**: criar pela tela “7 · Equipe” conforme os docentes
  entrarem no projeto. A coordenação inicial é
  `vde.aguasclaras@maristabrasil.org`.
