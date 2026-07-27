# Convenções do projeto PAS

## Idioma

Código, comentários, commits, documentação e interface em **português do
Brasil**. Nomes de variáveis e funções em português (`textosAprovados`,
`corrigir`, `nomePerfil`) — é o padrão do código existente.

## Contas

O e-mail do responsável pelo projeto é **vde.aguasclaras@maristabrasil.org**
(corporativo). Use sempre este endereço para contas dele, inclusive contas de
teste. Não use e-mails pessoais.

Contas de teste criadas durante o desenvolvimento devem ser apagadas ao fim —
uma conta que existe fora da tabela `equipe` é credencial solta.

## Arquitetura

Site estático servido direto da raiz do repositório: HTML, CSS e módulos ES
nativos, **sem etapa de build** e sem framework. Não introduza bundler,
TypeScript ou dependências de CDN sem necessidade real.

Bibliotecas de terceiros ficam versionadas em `js/vendor/`.

## Banco

Supabase, projeto `pas-marista` (ref `wtlmkyeukkvviqqrgiei`).

- Toda mudança de esquema entra como arquivo em `supabase/migrations/`,
  numerado, além de aplicada no projeto.
- A chave em `js/config-supabase.js` é a **publicável** — pode ficar no
  navegador. A chave de serviço só existe dentro da Edge Function `equipe`;
  nunca a coloque no código do cliente.
- Papéis e permissões vêm do banco (`public.equipe` + RLS), nunca do
  `user_metadata`, que o próprio usuário controla.

## Rodar e testar

```bash
python3 -m http.server 8000   # abra http://127.0.0.1:8000
```

Mudanças na interface merecem uma passada de verdade no navegador (Chromium
headless via Playwright, com `executablePath` apontando para o binário do
ambiente) antes de commitar — o sistema não tem testes automatizados no
repositório.

## Publicação

Vercel (projeto `projeto-pas`) conectada ao GitHub: push na branch de produção
republica sozinho.
