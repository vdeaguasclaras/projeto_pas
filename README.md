# Sistema PAS Marista

Sistema de elaboração, revisão, aplicação e correção dos simulados no formato
PAS/UnB do Colégio Marista Águas Claras.

Oito telas: painel de coordenação, alocação da produção entre os docentes,
textos-base com alocação de itens por vagas, editor de itens com revisão
comentada em dois níveis, caderno de provas, cartões-resposta nominais, correção
com boletins, e administração da equipe e dos estudantes.

Atende quatro provas — **9º ano, 1ª, 2ª e 3ª série** —, cada uma com os seus
textos, itens, capa, instruções, **proposta de redação** e elenco. O seletor no
menu lateral diz em qual se está trabalhando. O estudante pertence a uma
**série**, e é ela que o liga à prova.

A navegação é por **menu lateral**, que vira gaveta em tela estreita.

A coordenação **aloca** quantos itens cada docente deve entregar em cada prova, e
pode dividir a meta **por tipo de item** — “6 itens, sendo 3 do tipo A, 2 do tipo
B e 1 do tipo C”. O docente lê a encomenda e acompanha o progresso de cada tipo
no painel. Item e meta se ligam pelo **e-mail** de quem escreve, não pelo nome —
nome é rótulo, e-mail é identidade.

Os campos de texto do item aceitam **ênfase** (negrito, itálico, sobrescrito,
subscrito) e **notação matemática** entre `$…$`: fração, expoente, raiz, índice,
grau, vetor. A fórmula é desenhada na prévia do editor, na lista de itens e no
caderno impresso.

- **Manual da equipe:** [`docs/manual-da-equipe.md`](docs/manual-da-equipe.md)
- **Plano de implantação e arquitetura:** [`docs/plano-implantacao.md`](docs/plano-implantacao.md)

## Como funciona

Site estático — HTML, CSS e JavaScript de módulos nativos, sem etapa de build.
Os dados ficam num banco Postgres no Supabase, com login por conta e acesso
restrito à equipe cadastrada. O mesmo simulado é compartilhado por todo mundo, e
cada alteração é gravada linha a linha.

```
index.html              casca da página
css/estilo.css          identidade visual
js/config-supabase.js   endereço e chave publicável do banco
js/dados.js             modelo de dados e dados de exemplo
js/nuvem.js             driver do Supabase
js/limpar.js            higienização do HTML escrito pela equipe
js/rico.js              texto rico dos campos do item: ênfase e notação matemática
js/planilha.js          leitura da lista de estudantes colada pela coordenação
js/imagens.js           figuras de texto-base e item (envio, medida, impressão)
js/app.js               telas, montagem da prova e correção
js/vendor/supabase.js   biblioteca supabase-js (cópia local, sem CDN)
js/vendor/katex/        KaTeX 0.18.1 e as fontes dele (cópia local, sem CDN)
supabase/migrations/    esquema e regras de acesso
supabase/functions/     Edge Function `equipe` (administra as contas)
docs/                   manual e plano de implantação
prototipo-pas-marista.html   protótipo v2 (referência visual, não é o sistema)
```

## Rodar localmente

Precisa ser servido por HTTP (módulos ES não funcionam abrindo o arquivo direto):

```bash
python3 -m http.server 8000
# abra http://127.0.0.1:8000
```

Para trabalhar sem banco, clique em **usar sem conexão** na tela de entrada: o
sistema roda inteiro no navegador, com dados de exemplo.

## Publicação

O site está na Vercel, conectada a este repositório: cada push na branch de
produção republica sozinho, sem etapa de build (`vercel.json` só acrescenta
cabeçalhos de segurança e cache). Qualquer hospedagem de arquivos estáticos
serve — não há servidor próprio.

## Segurança

- Só entra quem a coordenação cadastrou: um gatilho no banco recusa a criação de
  conta de e-mail fora da lista da equipe.
- Todas as tabelas exigem, via RLS, que o e-mail da sessão esteja na equipe.
- O papel (coordenação / docente / redação) vem do banco, não do que a conta diz
  sobre si mesma.
- O fluxo de revisão é regra do banco, não só da tela: um gatilho recusa
  `status: "aprovado"` de quem não é a coordenação geral.
- Apagar texto, estudante, resposta ou prova é restrito à coordenação; o docente
  só descarta o próprio rascunho.
- O HTML que a equipe escreve — instruções da capa, campos do item e proposta de
  redação — passa por uma lista de permissão curta (`js/limpar.js`) antes de ir
  para a tela e para o papel: só ênfase tipográfica, e atributo nenhum em tag
  nenhuma.
- As **figuras** ficam em bucket **privado** do Storage, não embutidas no banco:
  conteúdo de prova é sigiloso até a aplicação, então a leitura exige
  `eh_equipe()` e a exibição passa por URL assinada de validade curta.
- A **notação matemática** dos itens é guardada como código entre `$…$`, que é
  texto comum, e desenhada pelo KaTeX só na hora de exibir (`js/rico.js`). O
  HTML do KaTeX — `<span style>`, `<svg>`, `<math>` — nunca é gravado no banco,
  e por isso a lista de permissão pôde continuar curta.
- A chave em `js/config-supabase.js` é a chave **publicável** do Supabase, feita
  para ficar no navegador: sozinha ela não dá acesso a nada.
- A chave de serviço existe apenas dentro da Edge Function `equipe`, que só
  atende chamadas da coordenação.
