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

Bibliotecas de terceiros ficam versionadas em `js/vendor/` (supabase-js, KaTeX
com as fontes). Ícones do menu são SVG escrito à mão em `js/app.js` (`ICONES`) —
nove ícones não justificam uma biblioteca nem uma CDN.

## Papéis e telas

Quatro papéis, definidos em `public.equipe.papel`: `coordenacao`,
`coordenacao_area`, `docente` e `redacao`. Nove telas em `TELAS` (js/app.js), e
o menu mostra só as do papel de quem entrou.

- **Diálogo que se remonta lê a cópia de trabalho, nunca o registro gravado.**
  `dlgItem()` desenha `rasc`; `dlgTexto()` desenha `rascTexto`. O formulário do
  texto-base não tinha essa cópia, e anexar uma figura — que remonta o diálogo —
  devolvia os campos ao último estado salvo: quem sugeria um texto novo via
  título, fonte e corpo sumirem, e o “Salvar” então reclamava de campo
  obrigatório. Chegou como “a imagem não carrega e o Salvar não faz nada”, e
  deixou oito arquivos órfãos no bucket. Antes de remontar, chame
  `recolherCamposDoTexto()` / `mexerNoItem()`: o `change` de um `<input>` só
  dispara ao perder o foco, e não dá para contar com essa ordem.
- A **pastilha do menu é a posição na lista daquela pessoa**, não um número
  fixo — quando era fixo, o docente lia “1, 3, 4…” e procurava a tela 2, que é
  da coordenação. O manual (`docs/manual-da-equipe.md`) chama as telas pelo
  número da visão da coordenação; ao acrescentar ou remover tela, renumere lá.
- `redacao` não escreve item: não vê Textos nem Itens, e o painel dele é de
  redação, não de metas. Ao mexer no Painel, lembre que `painelDoDocente()`,
  `painelDaRedacao()` e `painelDasProvas()` são visões diferentes da mesma tela.

## Banco

Supabase, projeto `pas-marista` (ref `wtlmkyeukkvviqqrgiei`).

- Toda mudança de esquema entra como arquivo em `supabase/migrations/`,
  numerado, **além de** aplicada no projeto. Isso já se perdeu uma vez (a 0008
  existia no banco e não na pasta): ao mexer no esquema, confira
  `list_migrations` contra o conteúdo de `supabase/migrations/`.
- A chave em `js/config-supabase.js` é a **publicável** — pode ficar no
  navegador. A chave de serviço só existe dentro da Edge Function `equipe`;
  nunca a coloque no código do cliente.
- Papéis e permissões vêm do banco (`public.equipe` + RLS), nunca do
  `user_metadata`, que o próprio usuário controla.

## Segurança

Estas três já falharam uma vez. Valem como regra.

- **Nenhuma credencial como literal no repositório.** A senha provisória já foi
  uma constante em `js/app.js` — igual para toda conta nova, num arquivo que o
  site serve sem exigir login. Ela é sorteada por conta
  (`senhaProvisoria()`) e mostrada uma vez, em diálogo — nunca em `toast`, que
  some levando a única cópia.
- **A regra de acesso vale na tela E no banco.** A tela esconder o botão não é
  proteção: a API do PostgREST está aberta a qualquer conta autenticada. Item
  tem dono (`podeEditarItem()` em js/app.js, migração 0012 no banco) e texto-base
  também (`podeEditarTexto()`, migração 0013), e as duas pontas precisam
  concordar — inclusive em *como* reconhecem o dono. A tela chegou a reconhecer
  o autor do texto pelo nome e o banco pelo e-mail: o botão “Editar” aparecia e
  a gravação era recusada, o que é pior do que não oferecer.
- **A Edge Function não é publicada pela Vercel.** Ela vive no Supabase, e
  mesclar o PR não a atualiza — é preciso publicá-la à parte
  (`deploy_edge_function`). O CORS dela é restrito aos endereços do sistema.

## Rodar e testar

```bash
python3 -m http.server 8000   # abra http://127.0.0.1:8000
```

Mudanças na interface merecem uma passada de verdade no navegador antes de
commitar — o sistema não tem testes automatizados no repositório.

Chromium headless via Playwright, com o binário do ambiente em
`executablePath` (`/opt/pw-browsers/chromium-*/chrome-linux/chrome`). O jeito
mais rápido de testar um papel ou um caso de dado:

1. `addInitScript` grava o estado em `localStorage` (chave
   `pas-marista-mvp-v1`) antes de `app.js` rodar;
2. na tela de entrada, clicar em **“usar sem conexão”** — o sistema roda
   inteiro no navegador, com o perfil que o estado disser.

Isso dispensa credencial e cobre toda a lógica de papel e de tela.

## Publicação

Vercel (projeto `projeto-pas`), conectada ao GitHub.

**A branch de produção é `claude/locate-created-files-xzeih0`, não `main`.**
`main` ficou para trás, com só o protótipo antigo. É na branch de produção que
os PRs entram, e é o push nela que republica sozinho — PR aberto contra `main`
não chega ao ar.

## Ambiente de desenvolvimento remoto

A política de rede bloqueia saída direta para `supabase.co` e para
`projeto-pas.vercel.app` — `curl` e `WebFetch` levam 403 do proxy. Use as
ferramentas MCP (Supabase, Vercel), que alcançam esses serviços pelo lado do
servidor.

## A frente que continua aberta

O **leitor óptico dos cartões** (`desktop/`): projetado, não implementado. Hoje
a correção é toda lançada à mão. As duas pontas no sistema web já funcionam — a
exportação do gabarito (`pas-marista/gabarito-v3`) e a importação do CSV. Falta
o miolo. Ver `desktop/README.md` e `docs/plano-implantacao.md`.
