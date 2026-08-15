// Higienização do HTML que a própria equipe escreve.
//
// Alguns campos precisam aceitar marcação — as instruções da capa nascem com
// <b> destacando “tipo A”, “CERTO”, “CENTENAS” —, então não dá para escapar
// tudo com esc(). Mas a regra de RLS do banco (`eh_equipe()`) libera escrita
// nessas tabelas a toda a equipe, não só à coordenação: sem filtro, qualquer
// conta grava HTML que roda no navegador de todas as outras.
//
// A lista abaixo é deliberadamente curta — só ênfase tipográfica, nada que
// carregue recurso externo, execute código ou posicione elemento.
//
// ATRIBUTO: um só, e com vocabulário fechado.
//
// Até aqui a regra era “atributo nenhum passa, em tag nenhuma”, e ela vale
// inteira para as tags de ênfase. O tamanho de fonte pedido pelos professores
// (número de expoente saindo pequeno demais no papel) precisava de alguma
// marca, e as duas saídas óbvias eram ruins: `style` é a porta por onde se
// injeta, e `<font size>` é tag obsoleta que ninguém mais estiliza direito.
//
// Então passa `class` — e só em <span>, e só com um destes quatro nomes, que
// são os nomes de classes do próprio CSS do sistema. Não é “aceitar class”: é
// aceitar quatro palavras conhecidas. Qualquer outra coisa dentro do atributo
// (uma a mais, uma diferente, um nome de classe do menu) desmancha o <span> e
// deixa só o texto, como acontece com qualquer tag fora da lista.
const PERMITIDAS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'SUB', 'SUP', 'BR', 'SPAN']);

// O vocabulário fechado de `class`. Ver `.tam-*` em css/estilo.css — os mesmos
// nomes valem na tela, na prévia e no caderno impresso.
const CLASSES = new Set(['tam-pp', 'tam-p', 'tam-g', 'tam-gg']);

// <span> não é ênfase: sozinho ele não quer dizer nada, e o Chrome cria um a
// cada colagem e a cada comando de formatação. Ele só sobrevive carregando uma
// das classes de tamanho — e nada além dela.
function classePermitida(el) {
  const nomes = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean);
  return nomes.length === 1 && CLASSES.has(nomes[0]) ? nomes[0] : null;
}

// Nestas o conteúdo é código, não texto: desembrulhar despejaria `alert(1)` no
// meio da instrução impressa. Saem inteiras, com filhos e tudo.
const DESCARTADAS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED']);

// Nas demais, o elemento fora da lista perde a tag mas mantém o texto: a
// instrução continua legível em vez de sumir, e quem escreveu percebe que a
// marcação não pegou.
function podar(no) {
  for (const filho of [...no.children]) {
    if (DESCARTADAS.has(filho.tagName)) { filho.remove(); continue; }
    podar(filho);
    if (!PERMITIDAS.has(filho.tagName)) { filho.replaceWith(...filho.childNodes); continue; }
    // O <span> só fica se trouxer uma das classes de tamanho; a classe é lida
    // ANTES de os atributos caírem e reposta depois, para que nem ela escape do
    // caminho comum (tudo sai, e só isto volta).
    const classe = filho.tagName === 'SPAN' ? classePermitida(filho) : null;
    for (const attr of [...filho.attributes]) filho.removeAttribute(attr.name);
    if (filho.tagName === 'SPAN') {
      if (!classe) { filho.replaceWith(...filho.childNodes); continue; }
      filho.setAttribute('class', classe);
    }
  }
}

// DOMParser não executa script nem dispara carregamento de recurso — o
// documento nasce inerte, e é por isso que a poda pode acontecer sobre ele.
//
// Devolve a árvore podada, não o HTML: é o que permite a notação matemática
// (js/rico.js) ser renderizada DEPOIS da poda, dentro do mesmo documento
// inerte. A lista de permissão continua valendo para tudo o que veio de quem
// escreveu; o HTML do KaTeX entra em seguida, e por isso não precisa — nem
// deve — passar por ela. Ver o comentário no topo de js/rico.js.
function limparArvore(html) {
  const doc = new DOMParser().parseFromString(
    `<div id="raiz">${String(html ?? '')}</div>`, 'text/html');
  const raiz = doc.getElementById('raiz');
  if (!raiz) return null;
  podar(raiz);
  return raiz;
}

function limpar(html) {
  return limparArvore(html)?.innerHTML ?? '';
}

export { limpar, limparArvore, PERMITIDAS, CLASSES };
