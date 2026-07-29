# Plano de implantação — Sistema PAS Marista

Estado em 27/07/2026.

## Onde estamos

| Fase | O que é | Situação |
|---|---|---|
| 1 · MVP navegável | Todas as telas funcionando com dados no navegador (localStorage) | **concluída** |
| 2 · Multiusuário | Banco on-line, login por conta, papéis e mesmo simulado para toda a equipe | **concluída** |
| 3 · Fidelidade dos documentos | Caderno e cartão calibrados página a página contra os PDFs reais do PAS | **concluída** |
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

## Papéis

| Papel | Alcance |
|---|---|
| `coordenacao` | Tudo, inclusive administrar contas e decidir a etapa final da revisão. |
| `coordenacao_area` | Docente + primeira etapa da revisão dos itens da sua área (`equipe.area`). |
| `docente` | Escreve itens e lança as notas dos próprios discursivos. |
| `redacao` | A proposta de redação da prova e o lançamento dela. |

Áreas em `AREAS` (js/app.js): Linguagens (Português, Literatura, Artes Visuais,
Dança, Música, Teatro), Humanas (História, Geografia, Filosofia, Sociologia),
Matemática, Ciências da Natureza (Biologia, Física, Química) e Inglês.
`revisaArea(item)` compara a área do componente do item com a área de quem está
logado.

## Alocação por docente

A meta de cada docente vive em `public.alocacoes`, com chave `(prova_id, email)`
— a mesma pessoa tem metas diferentes em séries diferentes. `dados` traz `meta`,
`observacao` (o recado que aparece no painel do docente) e o `nome`/`componente`
do momento em que a meta foi definida, só para exibição.

Meta e produção se cruzam pelo **e-mail**, não pelo nome. O item passou a gravar
`autorEmail` além do `autor` de exibição, e a migração 0009 acrescentou a coluna
gerada `itens.autor_email` com índice. `idAutorDoItem()` e `idDocente()` (js/app.js)
resolvem a chave preferindo o e-mail e caindo no nome — é o que permite o modo
sem nuvem, onde e-mail não existe, continuar funcionando.

Meta ausente e meta zero são estados distintos: o campo em branco **apaga** a
linha de alocação, e o painel do docente diz “sem meta definida” em vez de
mostrar uma barra vazia, que afirmaria uma cobrança que ninguém fez.

A tela de alocação **não** usa `commit()` nos campos de meta e recado. `commit()`
remonta a tela inteira, e com ~22 docentes por prova isso destruiria o campo de
destino a cada `Tab`, perdendo o foco. Em vez disso `alocacaoMudou()` grava,
sincroniza e atualiza à mão os três lugares que dependem da meta: a barra da
linha, o subtotal da área e o resumo do topo (`#aloc-resumo`).

Componentes em `COMPONENTES` (js/dados.js). A “Artes” genérica saiu da lista e
vive em `COMPONENTES_LEGADOS`: continua válida e colorida onde já está gravada,
mas não é oferecida para escolhas novas. `opcoesComponente(atual)` acrescenta o
valor legado à lista **só** quando é o do registro sendo editado, marcado como
“a reclassificar” — trocar é decisão de quem edita, não efeito colateral de
abrir o formulário. Para aposentar um componente no futuro, mova-o de
`COMPONENTES` para `COMPONENTES_LEGADOS`; nada mais precisa mudar.

## Primeiro acesso

Duas etapas obrigatórias, marcadas em `public.equipe`:

- `trocar_senha` — a conta nasce com a senha provisória da escola
  (`Marista@2026`) e o `render()` trava na tela de criação de senha até a pessoa
  definir a sua. Redefinir a senha pela tela de Equipe volta a exigir a troca.
- `tutorial_visto` — na estreia abre um tutorial curto e animado, com roteiro
  próprio para cada papel (`TUTORIAL` em js/app.js). Dá para revê-lo em
  “Minha conta”.

Como a pessoa não pode editar a própria linha da equipe — isso permitiria mudar
o próprio papel —, os dois campos são marcados por funções `SECURITY DEFINER`
(`marcar_senha_trocada` e `marcar_tutorial_visto`), restritas à conta que chama.

## Como o acesso funciona

1. A tabela `public.equipe` é a lista de quem pode entrar, com o **papel** de
   cada pessoa (coordenação, coordenação de área, docente, professora de
   redação) e, para a coordenação de área, a **área** que ela revisa.
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

### Cartão-resposta — concluído

Calcado no caderno de respostas do PAS. Deixou de ser uma folha e passou a ser
um **conjunto de folhas por estudante**, cada uma com cabeçalho completo,
âncoras de leitura óptica no topo e no rodapé e a identificação “folha N de M”:

| Folha | Conteúdo |
|---|---|
| Objetiva | Todos os itens em ordem numérica ocupando 4/5 da folha, em 4 colunas. Só os tipos **A** (C/E) e **C** (A–D) recebem bolhas; os tipos **B** e **D** aparecem rotulados, remetendo ao seu campo próprio. A coluna à direita traz os itens do **tipo B**, com centena, dezena e unidade. |
| Discursiva | Uma pauta de resposta por item do **tipo D**, com as bolhas de **percentual de acerto** — 0, 25, 50, 75 e 100% —, preenchidas por quem corrige. |
| Redação | Pauta de 30 linhas de 17pt, igual à do rascunho oficial, com o **tema** da proposta impresso acima dela. **Opcional**: a coordenação decide em “Configurar simulado” se imprime. |

Quando o conteúdo não cabe, a folha se desdobra em vez de cortar: a coluna dos
itens tipo B vira duas antes de gerar uma folha de continuação, e os discursivos
quebram por altura acumulada.

**Consequência para a leitura óptica**, apontada pela coordenação: cada
estudante passa a ter mais de uma folha digitalizada. O gabarito exportado para
o leitor local mudou para `pas-marista/gabarito-v2` e agora descreve as folhas —
qual é objetiva, qual é discursiva (com os percentuais aceitos) e qual é a
redação —, além da chave de identificação (matrícula) e das âncoras.

O lançamento das notas dos discursivos, na tela de correção, passou a oferecer
exatamente os mesmos cinco níveis do cartão, em vez de um número livre de 0 a
10, para que o que se marca no papel e o que se digita no sistema sejam a mesma
coisa.

### Redação — a proposta como parte da prova

Até aqui a redação era só uma nota: a prova dizia `temRedacao`, o cartão
imprimia uma pauta de 30 linhas e a correção lançava NC, NE e TL. Faltava a
**proposta** — o que o estudante lê. Ela agora existe e é impressa no caderno:

- Mora em **`prova.redacao`**, dentro do `dados` jsonb de `public.provas`, ao
  lado de `temRedacao`, das instruções e da imagem da capa: `{ tema, comando,
  tipoTexto, motivadores: [{ titulo, texto, fonte }] }`. Não houve esquema novo
  — a proposta acompanha a prova de graça no backup JSON, na exclusão em cascata
  e na sincronização linha a linha (`PERS.prova`). Como as demais coisas da
  prova, é escrita só pela coordenação (RLS de `provas`, migração 0007).
- A coordenação a escreve na tela do **Caderno**, em “✍ Proposta de redação”,
  ao lado de “Capa e instruções” — a proposta é peça do caderno, e é ali que se
  vê o resultado.
- No caderno ela é **paginada à parte** e vai por último: as suas peças não
  dividem coluna com item nenhum, e o rótulo do alto da página passa de
  “-- PARTE 2 --” para “-- PROVA DE REDAÇÃO --” (`htmlPagina` recebeu o rótulo
  como parâmetro). Cada parágrafo de motivador é uma peça, então proposta longa
  reflui por mais de uma página em vez de ser cortada.
- O texto passa por `limpar()`, como as instruções da capa: `<b>`/`<i>` para
  ênfase, nada que carregue recurso externo ou execute código.
- A folha de redação do **cartão-resposta** passou a trazer o **tema** acima da
  pauta: é a folha que a professora corrige, e ela não tem o caderno na mão.
- **Prova sem redação não tem nada de redação**: sem proposta, sem botão, sem
  página no caderno, sem folha no cartão, sem campos NC/NE/TL na correção, sem
  coluna “Redação” no relatório por turma e sem a casa da NR no boletim.

Na tela de quem corrige, a proposta ficou **ao lado do lançamento**, e a tabela
mostra a conta que forma a nota — `9,0 − 2·3/28`, desconto 0,21 — porque o
desconto por erro depende do tamanho do texto. A fórmula oficial não mudou:
`NR = NC − 2·NE/TL`, com piso zero, e agora vive num lugar só (`contaDoNR()`),
de onde `corrigir()` também a lê. O lançamento **não remonta a tela** (só a
linha e o contador, como em `alocacaoMudou`), para que o Tab entre os campos não
perca o foco com 30 estudantes na tabela.

Sem TL não há NR: a linha aparece como “falta TL” em vez de mostrar a NC como se
fosse nota. TL acima da pauta de 30 linhas é avisado, não corrigido.

**O que não foi criado:** nenhuma grade de critérios além de NC/NE/TL. A escola
não entregou rubrica, e inventar competências criaria um sistema de notas
paralelo ao oficial. Se a rubrica vier, o lugar dela é `resposta.redacao`, com
NC derivada dos critérios — a fórmula do PAS continua sendo a que fecha a nota.

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
