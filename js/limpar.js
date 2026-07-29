// Higienização do HTML que a própria equipe escreve.
//
// Alguns campos precisam aceitar marcação — as instruções da capa nascem com
// <b> destacando “tipo A”, “CERTO”, “CENTENAS” —, então não dá para escapar
// tudo com esc(). Mas a regra de RLS do banco (`eh_equipe()`) libera escrita
// nessas tabelas a toda a equipe, não só à coordenação: sem filtro, qualquer
// conta grava HTML que roda no navegador de todas as outras.
//
// A lista abaixo é deliberadamente curta — só ênfase tipográfica, nada que
// carregue recurso externo, execute código ou posicione elemento. Atributo
// nenhum passa, em tag nenhuma.

const PERMITIDAS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'SUB', 'SUP', 'BR']);

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
    if (PERMITIDAS.has(filho.tagName)) {
      for (const attr of [...filho.attributes]) filho.removeAttribute(attr.name);
    } else {
      filho.replaceWith(...filho.childNodes);
    }
  }
}

// DOMParser não executa script nem dispara carregamento de recurso — o
// documento nasce inerte, e é por isso que a poda pode acontecer sobre ele.
function limpar(html) {
  const doc = new DOMParser().parseFromString(
    `<div id="raiz">${String(html ?? '')}</div>`, 'text/html');
  const raiz = doc.getElementById('raiz');
  if (!raiz) return '';
  podar(raiz);
  return raiz.innerHTML;
}

export { limpar, PERMITIDAS };
