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
- **Antes de gravar, recolha a tela.** Vale para `persistirRascunho()` como já
  valia para `recolherCamposDoTexto()`: `<input>` avisa no `change`, que só
  acontece ao perder o foco, e não dá para contar com essa ordem. Habilidade,
  linhas de referência, componente e gabarito do tipo B vivem em `<input>`
  comum — sem o recolhimento, quem digitava e clicava direto em “Salvar” podia
  gravar o valor antigo.
- **`coordenacao_area` é dois papéis na mesma pessoa**: ela dá aula E coordena.
  `nomePerfil()` mostra área e componente, o Painel traz `painelDaArea()` (a
  área) acima de `painelDoDocente()` (a entrega dela), e qualquer coisa que
  pergunte só `ehCoord()` está deixando essa pessoa de fora — verifique se o
  certo não é `ehQualquerCoord()` ou `revisaArea()`.
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
- **O cliente grava tudo por `upsert`, e o Postgres julga o upsert como
  INSERT.** `nuvem.gravarLinha()` manda `insert ... on conflict do update`, e o
  banco avalia o `with check` da política de INSERT — e dispara os gatilhos
  `before insert` — sobre a linha proposta, **antes** de descobrir que ela já
  existe. Ou seja: toda edição chega vestida de criação. Foi assim que a
  coordenação de área ficou semanas sem conseguir aprovar item nenhum (151
  respostas 403 em 24h) enquanto a tela dizia “Item salvo”, e assim que o
  gatilho de fluxo passou a ler cada gravação como transição de status,
  travando o docente que ia corrigir o próprio item devolvido. As migrações
  0014 e 0015 consertam as duas pontas. **Ao escrever política de INSERT ou
  gatilho `before insert` nestas tabelas, lembre que “inserir” aqui quase sempre
  quer dizer “editar”** — use `item_existe()` / `texto_existe()` para separar os
  dois casos.
- Ao mexer em RLS, confira o efeito com o papel de verdade:
  `begin; set local role authenticated; set local request.jwt.claims = '{"email":"…"}'; …; rollback;`
  E confira os dois lados — o que passou a funcionar **e** o que continua barrado.
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
- **`js/limpar.js` aceita um atributo, e ele tem vocabulário fechado.** É
  `class`, só em `<span>`, e só com um dos nomes de `CLASSES` (os tamanhos de
  letra). Um nome a mais, um nome desconhecido ou um nome de classe do próprio
  menu desmancha o `<span>` e deixa o texto. Não alargue isso para `style`, nem
  para `class` livre: a lista curta é o que sustenta a decisão do `js/rico.js`
  de guardar fórmula como código-fonte em vez de HTML.

- **Comentar não é editar.** O fio da revisão é aberto a toda a equipe, e por
  isso o comentário NÃO passa pela gravação do item: ele vai pela função
  `comentar_item` (migração 0016), que só sabe acrescentar ao fio e assina com o
  nome e o papel lidos de `equipe`. Não tente resolver isso alargando a política
  de UPDATE — quem barra o resto ali é o `using`, que só enxerga a linha antiga,
  e afrouxá-lo reabre dois buracos que a 0012 fechou.
- **Quando a permissão vem junto com uma consequência, é função, não política.**
  A coordenação de área corrige item aprovado na leitura final do caderno, e
  esse ajuste tem de deixar o item pendente da releitura da coordenação
  pedagógica. Política sabe dizer “pode escrever”; não sabe cumprir a segunda
  metade. `ajustar_na_leitura_final` (migração 0017) faz as duas juntas, e a
  marca não depende de o cliente lembrar de pô-la.
- **O histórico do item (`dados.historico`) é escrito por gatilho, nunca pelo
  cliente** (migração 0017). O gatilho o repõe a partir da linha guardada em
  toda gravação, então mandá-lo do navegador não adianta. Ao acrescentar campo
  de conteúdo ao item, inclua-o em `campos_do_item()` — senão a alteração dele
  passa sem deixar rastro.

## O aviso precisa CHEGAR à tela

**O `<dialog>` aberto por `showModal()` vive na *top layer* do navegador: ele é
pintado acima de tudo, e nenhum `z-index` alcança isso.** Enquanto o `#toast`
morava solto no `<body>`, todo aviso dado com um diálogo aberto era pintado
ATRÁS dele — invisível justamente nas horas em que mais importa, que são as
recusas do “Salvar”. Do lado de fora, era um botão que não fazia nada.

Custou três relatos do mesmo defeito (“ele edita, mas não salva”) para achar,
porque o sintoma aponta para a gravação e a causa estava na mensagem. Hoje
`toast()` anexa o aviso DENTRO do diálogo quando há um aberto (e `abrirDlg()` o
devolve ao corpo antes de remontar, senão o `innerHTML` o destrói). Ao criar
qualquer sobreposição nova, confira se o que ela diz é visível de fato —
`elementFromPoint` não serve para aferir isso, porque o toast tem
`pointer-events: none`; compare os retângulos.

E validação de formulário não se diz só de passagem: `recusarItem()` marca o
campo que causou a recusa, mostra o motivo ao pé dele e rola até lá. Um toast de
quatro segundos não alcança quem está três telas abaixo, mexendo nas
alternativas, quando o problema está no enunciado.

## O caderno: o que o Chrome não imprime, e o que não pode partir

- **Fio desenhado com `background` não sai na impressora.** O Chrome só imprime
  fundo se quem imprime marcar “Gráficos de plano de fundo”, que vem
  **desmarcada** — e o fio central que separa as duas colunas, o do cabeçalho e
  o do rodapé são `div` com cor de fundo. Sumiam todos no papel enquanto a tela
  os mostrava. A capa já tinha aprendido isso (`print-color-adjust:exact`); os
  fios do miolo não. Ao acrescentar qualquer traço ao caderno, prefira `border`
  — que imprime sempre — ou repita o `print-color-adjust`, e confira gerando o
  PDF **sem** os gráficos de plano de fundo, que é como a escola imprime.
- **A paginação é por BLOCO, não por peça** (`distribuirBlocos`). Um texto-base
  partido entre duas folhas é uma questão partida: o estudante vira a página a
  cada item. O bloco inteiro cabe numa folha ou vai inteiro para a seguinte;
  entre as duas colunas da mesma folha ele continua fluindo. Bloco maior que
  uma folha inteira não tem para onde ir — aí flui como antes, e o que se
  preserva é ao menos o texto-base junto (`textoBase` conta as peças que vêm
  antes do primeiro item). Ao acrescentar peça ao bloco, lembre que
  `pecasDoTextoBase()` a conta por subtração: peça nova depois dos itens
  desalinha a conta.
- **O branco que sobra vira `Rascunho`** — o da folha virada e o da cota de
  exatas (dois textos-base seguidos com item de Matemática, Física, Química ou
  Biologia). Não é enfeite: sem espaço no caderno o estudante faz conta na
  margem, e quem corrige não tem de onde conferir a resposta.
- **O negrito do comando é da VERSÃO, não do item.** Na adaptada o verbo que
  abre o comando sai em negrito; item marcado como *ambas* é o mesmo item nas
  duas provas, então ler `item.versao` deixaria de fora justamente os que mais
  aparecem. Por isso `versao` desce até `htmlItem()`. A lista de verbos
  (`VERBOS_COMANDO`) é fechada de propósito: grifar “todo verbo” exigiria
  análise morfológica, erraria, e página cheia de negrito é o contrário de
  destaque. E o negrito entra pela árvore (`negritarComandos`), nunca por troca
  de string — o HTML que chega ali já leva o desenho do KaTeX dentro.

- **A tabela periódica é desenhada, não é imagem** (`js/tabela-periodica.js`).
  Imagem de 2048px na largura da folha deitada sai a ~180 dpi, e a massa
  atômica, que é a menor letra da folha, borra. Desenhada, imprime vetorial. A
  folha vai girada porque em pé sobram 30pt por elemento e deitada 40pt. As
  duas séries f estão na MESMA grade das outras (linhas 10 e 11), e a legenda
  ocupa o vão dos grupos 3–12 nos três primeiros períodos: amarrar altura de
  grade separada à mão dá certo hoje e desalinha na primeira mudança de medida.
  A tinta das séries pede `print-color-adjust`, como todo fundo neste projeto.
  **A altura da linha é fixa de propósito.** Com `1fr` a grade esticava para
  encher a folha e a célula saía 39pt de largura por 54 de altura — mais alta
  que larga, o contrário da referência. Célula estreita e alta dá símbolo
  pequeno (11pt onde cabiam 16) e número encostado na borda, que foi como
  chegou o relato: “os símbolos ficam pequenos e alguns números ultrapassam a
  margem do quadrado”. A largura não dá para aumentar — 18 colunas em 720pt são
  40pt cada, e a referência tem a mesma medida; quem desce até a proporção certa
  é a altura. E `line-height:1` no nome corta o acento: “silício” virava
  “silicio”, erro de grafia impresso 118 vezes.

## Gravação: a tela não pode afirmar o que o banco negou

`PERS.item()` e companhia gravam soltos, com `.catch` num toast. Isso é aceitável
para o que não tem dono na tela (ordem dos itens, elenco), e **é veneno para o
que a pessoa acabou de escrever**: o diálogo fechava dizendo “Item salvo”, o erro
chegava segundos depois sem dizer de qual item falava, e quem editou só descobria
no dia seguinte. Quem grava conteúdo de item ou de texto-base usa
`salvarItem()` / `PERS.itemAgora()` / `PERS.textoAgora()`: espera a resposta,
desfaz o estado local se o banco recusar, mantém o diálogo aberto com o trabalho
na tela e escreve o motivo.

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
