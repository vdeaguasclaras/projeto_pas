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

## O papel do estudante não diz "adaptada", e o cartão se mede

- **No impresso, a versão é código: `A1` (regular) e `A2` (adaptada)**
  (`codigoDaVersao`). "Adaptada" é palavra de bastidor — impressa, conta ao
  estudante e ao colega ao lado que aquele caderno é o da prova de inclusão. Os
  DOIS levam código, inclusive a regular: se só um trouxesse marca, a marca
  voltaria a apontar para quem a tem. São três lugares — cabeçalho de toda folha
  do caderno, observação da capa e campo VERSÃO do cartão. **No sistema, no
  banco, no elenco, na correção e no gabarito do leitor óptico nada muda**:
  trocar o dado quebraria o contrato do leitor e o histórico gravado.
- **O alvéolo tem um tamanho só na folha inteira** — item, tipo B e matrícula.
  Quem preenche à mão não deve encontrar dois tamanhos de círculo, e o leitor
  óptico procura um alvo de medida única. O formato de duas colunas do tipo B
  chegou encolhendo o alvéolo para 7pt, e não precisava: o que faltava era
  ALTURA, e duas colunas já resolvem isso — a largura sempre coube.
- **A capacidade da folha do cartão é MEDIDA, não escrita à mão**
  (`medirCartao`). Era: 42 linhas por coluna e 5 blocos do tipo B. A coluna
  comporta 4, e com o quinto o bloco descia por cima da ÂNCORA do canto
  inferior — o quadrado preto que alinha o leitor óptico. Cartão com âncora
  encoberta é cartão que a máquina não lê, e o defeito só aparece ao digitalizar
  o lote, com a prova já aplicada. Pegou a 2ª e a 3ª série, que têm 5 itens
  tipo B. Duas armadilhas ao mexer nessa régua: o molde tem de ser **idêntico**
  ao impresso (sem o bloco de orientações, ou com o cabeçalho vazio, o corpo
  mede mais do que tem — por isso `orientacoesDoCartao()` e
  `orientacoesDiscursivas()` são funções, e a régua recebe o `provaId`); e o
  bloco tem de ser medido **solto**, porque dentro da coluna, que é um flex de
  altura limitada, ele encolhe e mede menos do que ocupa de verdade.

## A prova adaptada tem tamanho próprio, e ele se escolhe

Todo item nasce `versao: 'ambas'`, então, sem ninguém escolher, a adaptada sai
do tamanho da regular — as quatro provas chegaram à produção com três ou quatro
itens a menos, que não é prova adaptada, é a mesma prova. Quem escolhe é
`ACOES['cad-adaptada']` (⚖ Montar a prova adaptada, no Caderno), e o que ela
mexe é só o campo `versao`: `ambas` para quem fica, `regular` para quem sai. **A
prova regular não muda** — o item desmarcado continua nela, com o mesmo número.

- **Item com adaptação própria fica fora da escolha**, nos dois sentidos: o
  original (quem entra é a cópia) e a cópia (`derivadoDe`, que só existe para a
  adaptada — desmarcá-la a deixaria sem prova nenhuma).
- **A gravação é em lote e esperada** (`PERS.itensAgora`): um `upsert` só com a
  lista inteira, e se o banco recusar, recusa tudo e o estado local volta —
  meia prova adaptada gravada seria pior que nenhuma. Conferido com o papel de
  verdade: coordenação aceita, docente recusa.
- `versao` já está em `campos_do_item()` (migração 0017), então cada entrada e
  saída da adaptada fica registrada no histórico do item sem nada a fazer.

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

## O leitor óptico: o cartão impresso virou contrato com uma máquina

O leitor (`desktop/`) lê os cartões digitalizados e devolve o CSV que a tela de
Correção importa. Ele funciona, e funciona porque o cartão impresso passou a
cumprir quatro invariantes. **Mexer no desenho do cartão sem respeitá-las quebra
a leitura do lote inteiro, e o defeito só aparece no dia de digitalizar, com a
prova já aplicada.**

- **A geometria é MEDIDA e exportada, nunca escrita do lado do leitor.**
  `mapaDoCartao()` monta o cartão fora da tela e lê o retângulo de cada âncora,
  de cada alvéolo e de cada célula do código; isso viaja no gabarito
  (`pas-marista/gabarito-v4`). É o mesmo princípio de `medirCartao`, pelo mesmo
  motivo: número de alvéolo escrito à mão acerta hoje e erra calado na primeira
  mudança de medida. Quem sabe o que cada alvéolo é são os `data-alv` do HTML —
  alvéolo novo sem `data-alv` é alvéolo que o leitor não enxerga; alvéolo de
  enfeite COM `data-alv` (o quadro “exemplo de preenchimento”) é alvo falso.
  **Mudou o cartão? Exporte o gabarito de novo** — o arquivo velho descreve a
  folha velha.
- **Nada no cabeçalho pode quebrar linha.** As quatro âncoras têm de estar
  sempre na mesma altura, em toda folha de todo cartão, porque é isso que
  permite alinhar a folha ANTES de saber que folha é. Um nome comprido que
  passasse para a segunda linha empurraria as âncoras de cima e esticaria a
  homografia. Por isso `.cr-cab-est b` e companhia são `nowrap` com reticências,
  e por isso `mapaDoCartao()` se RECUSA a exportar se as âncoras saírem do
  lugar. Se a exportação começar a reclamar disso, o defeito é no cartão, não na
  conferência.
- **A faixa de identificação do rodapé tem a mesma conta dos dois lados.**
  `bitsDaFolha()` (js/app.js) escreve e `desktop/src/leitor/codigo.py` lê. Se uma
  mudar sem a outra, o leitor passa a atribuir folha ao estudante errado — e sem
  reclamar, porque o CRC continuaria fechando dos dois lados da mudança. A faixa
  carrega ALGARISMOS, e é por isso que a importação do CSV casa por dígitos
  quando o texto exato não bate.
- **A matrícula da escola tem NOVE algarismos e começa em `225`**
  (`FORMATO_DA_MATRICULA`, js/app.js), e isso desce ao leitor pelo gabarito, como
  a geometria — não é validação de enfeite. É a única conferência que existe
  sobre a matrícula do CARTÃO EXTRA, a única do sistema que não viaja protegida
  por CRC: ali o estudante preenche nove alvéolos, o que sai é leitura óptica
  pura, e um algarismo a mais atribuiria a prova a outra pessoa em silêncio.
  Matrícula sem algarismo, com mais de 12, fora do padrão ou que colida com
  outra depois de tirada a pontuação não é identificável — a tela de Cartões
  avisa antes de imprimir, que é quando sai barato consertar a planilha.
- **Caneta não é toner, e a régua é de cada folha.** O cartão-gabarito parecia
  o lugar óbvio de onde tirar o limiar de “alvéolo preenchido” — uma folha onde
  se sabe o que devia estar marcado. Mas as marcas dele saem da impressora e
  passam de 80% sempre, enquanto a caneta enche de 30% a 100% conforme a pressão
  da mão: no primeiro lote real, duas folhas preenchidas por pessoas diferentes
  ficaram em faixas completamente distintas, e a régua vinda do impresso mandou
  24 marcações legítimas de uma delas para a conferência. Hoje a folha inteira é
  medida ANTES de qualquer decisão, e a régua vai no vão entre os dois grupos
  daquela folha (`limiares_da_folha`). Do cartão-gabarito sai o nível do PAPEL,
  que se transfere, e a conferência entre a chave e o impresso.
- **O cartão-gabarito é a chave da prova em papel.** Sai automaticamente à frente
  do lote, um por versão, com os alvéolos do gabarito preenchidos. É dele que o
  leitor tira o limiar de tinta desta impressora, e é ele que denuncia — antes de
  o lote ser lançado — que a chave exportada não corresponde ao papel. Em troca,
  ele circula junto com os cartões em branco até a aplicação: é papel sigiloso, e
  a tela diz isso.

- **A página digitalizada não é o cartão, e pode estar deitada.** As duas coisas
  vieram juntas na primeira digitalização de verdade, e derrubaram o lote
  inteiro: mesa A3 com o A4 solto no meio (a escala estimada pela largura da
  página saiu 1,4× errada) e o cartão a 90° (o retângulo das âncoras com a
  proporção invertida). Hoje a escala sai da MANCHA IMPRESSA, e a posição sai
  das próprias âncoras — elas dizem se a folha está em pé ou deitada, e o CRC
  diz se está de cabeça para baixo. Ao mexer na detecção, não volte a supor que
  a folha digitalizada tem o tamanho da folha impressa.

E o teste (`desktop/testes/`) **imprime cartões de verdade** pelo sistema web num
Chromium, depois os digitaliza como a escola digitaliza: mesa A3, cartão
deitado, torto, borrado, em JPEG e com uma folha virada. Não escreva teste de
leitor contra cartão desenhado à mão nem contra digitalização limpa e reta: ele
passa e o leitor falha na secretaria.

- **O escore é calculado dos dois lados, e por isso virou TABELA.** O aplicativo
  local passou a gerar os boletins da secretaria, então a mesma prova é corrigida
  no sistema e nele. Quanto vale cada resposta está em `PESOS_DO_ESCORE`
  (js/dados.js) e viaja dentro do pacote da prova; do lado do leitor **não há
  número de pontuação escrito**. Regra escrita em dois lugares diverge em
  silêncio — e nota de prova ninguém confere contra uma segunda implementação:
  descobre-se pelo estudante que reclama. `desktop/testes/testar-correcao.py`
  faz os dois corrigirem as mesmas marcações e compara nota a nota; ao mexer na
  pontuação (a fase 5 vai mexer), mexa na tabela e rode esse teste.

- **São DUAS notas, e a segunda não é o escore com outro nome.** O escore do PAS
  desconta erro e pode ser negativo — certo para preparar para a prova, errado
  como nota de boletim. Ao lado dele vai a **Nota Marista**: a fração da prova
  acertada, sem desconto e sem peso por tipo, na escala da escola
  (`NOTA_MARISTA`, js/dados.js, que viaja no pacote como `escore.marista`). O
  discursivo entra **proporcional à nota** lançada, e o que ainda não foi
  corrigido sai da conta inteiro — do numerador **e** do denominador. Contá-lo
  como erro transformaria atraso de quem corrige em nota baixa do estudante; e
  mostrar 0% quando não há item avaliável afirmaria uma nota que ninguém apurou,
  por isso `percentual` devolve `None`, não zero.
- **“Em branco” já engoliu duas coisas que não são branco.** Dupla marcação é
  item ANULADO — a resposta `NULO` (`desktop/src/leitor/correcao.py`), que viaja
  no CSV da conferência como qualquer outra resposta: o estudante marcou duas alternativas, no PAS isso vale como erro — com o peso de
  erro do TIPO, que no tipo B é zero — e o boletim imprime `N`. Item que continua
  na fila de conferência não é nada ainda: sai de toda conta (escore, denominador
  da Nota Marista, média do grupo), imprime `?` e põe um aviso no alto do
  boletim. Enquanto os dois viravam ausência de marcação, o boletim dava nota,
  posição na turma e grau de desenvolvimento a partir de uma afirmação sobre o
  papel que ninguém tinha feito. Ao mexer na correção, lembre que são **quatro**
  estados por item, não três — e que `NULO` tem de sair antes da normalização do
  tipo B, que o transformaria num branco por não ter algarismo nenhum.
- **O TXT do sistema acadêmico é contrato com um programa que já existe.**
  Vírgula, CRLF, **latin-1** (não UTF-8), conceito com ponto e sem o `.0` do
  inteiro, uma linha por estudante E por componente. Nada disso se descobriu
  lendo documentação: veio do arquivo que a escola importou em 2025, e é contra
  um trecho dele — anonimizado, porque matrícula de estudante não fica
  versionada — que `testar-academico.py` compara byte a byte. **Esta é a única
  nota deste projeto que entra na vida acadêmica do estudante**, e por isso a
  exportação se RECUSA a acontecer enquanto houver marcação na fila de
  conferência: nota provisória lançada lá ninguém descobre que era provisória.
- **Regra de QSS que empata, quem vem por último vence.** `QPushButton[papel="rosa"]`
  e `QPushButton:disabled` têm a mesma especificidade, e o rosa vinha depois: o
  botão desligado continuava rosa vivo, convidando ao clique exatamente nas telas
  em que clicar é o que não pode. Ao criar variante de botão, crie também a
  `:disabled` dela.
- **A janela é casca; o trabalho mora num lugar só.** O aplicativo local tem
  agora duas frentes — a janela (PySide6, `desktop/src/leitor/ui/`) e a linha de
  comando —, e as duas chamam `lote.ler_lote` e `apuracao.apurar`. Quando a
  janela apareceu, o miolo do lote estava dentro do `cli.py` e a tentação foi
  copiá-lo; copiar regra entre cascas é o mesmo erro do escore escrito duas
  vezes, só que mais fácil de cometer. Se for preciso “só chamar aquela função
  privada da outra casca”, o lugar dela está errado.
- **Coluna de tabela do Qt: a conta da largura é sua.** `ResizeToContents` em
  todas as colunas somava mais que a janela e jogava a última — a posição na
  turma — para trás de uma barra de rolagem; `Stretch` no nome faz o contrário e
  o espreme a nada quando as outras estouram. Quem decide é
  `_ajustar_nome()`: sobra = viewport − as outras, com piso e teto, refeita a
  cada `resizeEvent` e a cada carga. E título de coluna é largura: a coluna se
  ajusta ao maior entre o cabeçalho e o conteúdo, e aqui o cabeçalho quase sempre
  ganha — “Escore PAS” custava 25px para dizer o que a dica ao pousar o ponteiro
  diz de graça.
- **O `.exe` é montado por uma máquina do GitHub, e não fica versionado.**
  `.github/workflows/leitor-windows.yml` roda o PyInstaller num Windows limpo e
  devolve um `.zip`; etiqueta `leitor-vX` vira Release, que é o que a secretaria
  baixa. São 350 MB de cópia do Python, do OpenCV e do Qt — commitá-los seria
  guardar no repositório o que uma linha regenera. O passo de conferência não é
  enfeite: ele procura `cv2` e `PySide6` dentro do `_internal` porque o pacote
  vazio de 25 MB já aconteceu, e falhava só ao abrir.
- **As cores da janela vêm do CSS do sistema, por ferramenta.**
  `desktop/ferramentas/extrair-tema.py` lê o `:root` do `css/estilo.css` e gera
  `ui/tema.py`. Não acerte cor à mão do lado do Qt: dois azuis quase iguais, e
  ninguém sabendo qual é o certo, é pior do que um só. Ao mexer nas cores do
  sistema, rode a ferramenta e commite o gerado.

## A frente que continua aberta

Do leitor óptico falta a **importação dos percentuais do discursivo**: o leitor os
lê e grava em `percentuais.csv`, e o sistema on-line ainda não os consome. O resto
está de pé — o `.exe` foi gerado e rodado numa máquina Windows da escola, e a
exportação das notas para o sistema acadêmico saiu com o arquivo de referência de
2025 na mão. Ver `desktop/README.md` e `docs/plano-implantacao.md`.
