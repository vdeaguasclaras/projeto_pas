// Texto rico dos campos do item: ênfase tipográfica e notação matemática.
//
// Professor de Matemática, Física e Química não escreve item sem fração,
// expoente, raiz, índice, grau e vetor. Até aqui os campos eram texto puro e
// saía “x^2” e “1/2” no caderno impresso.
//
// ---------------------------------------------------------------------------
// A DECISÃO DE SEGURANÇA
// ---------------------------------------------------------------------------
// A regra de RLS do banco (`eh_equipe()`) libera escrita nas tabelas de itens a
// TODA a equipe — 22 contas —, não só à coordenação. Tudo o que qualquer conta
// grava roda no navegador de todas as outras. É por isso que existe
// `js/limpar.js`, com uma lista de permissão curta em que **atributo nenhum
// passa em tag nenhuma**.
//
// O KaTeX gera `<span>` com `style`, `<svg>`, `<path>` e `<math>`. Alargar a
// lista de permissão para aceitar isso transformaria o higienizador em peneira:
// `style` e `svg` são exatamente por onde se injeta.
//
// Então a matemática NÃO é guardada como HTML. Guarda-se o **código-fonte
// delimitado** dentro do próprio texto — `$…$` em linha, `$$…$$` em destaque —,
// que é texto comum e passa pela lista curta sem ela mudar uma linha. O HTML do
// KaTeX é produzido **na hora de exibir**, aqui, e nunca chega ao banco.
//
// A ordem das duas etapas é o que sustenta isso:
//
//   1. `limparArvore()` poda o que a pessoa escreveu — só B/STRONG/I/EM/U/
//      SUB/SUP/BR sobrevivem, sem atributo nenhum;
//   2. só DEPOIS `matematizar()` varre os nós de texto já podados e troca os
//      trechos entre delimitadores pelo HTML do KaTeX.
//
// O HTML do KaTeX entra na árvore depois da poda de propósito: ele não vem de
// quem escreveu, vem daqui, gerado a partir de um código-fonte que a lista
// curta aceitou. Submetê-lo à poda apagaria a fórmula; alargar a poda para
// aceitá-lo abriria a porta para todo o resto.
//
// E o KaTeX é chamado com as opções de segurança dele ligadas — ver
// `OPCOES_KATEX` abaixo.

import { limpar, limparArvore } from './limpar.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- o renderizador ---------------- */

// Opções de renderização do KaTeX. As três primeiras são de segurança ou de
// contenção de dano, e existem porque este conteúdo pode ter sido escrito por
// qualquer uma das 22 contas da equipe:
//
// `trust: false` — é o padrão do KaTeX, e está aqui escrito à mão para não ser
//   perdido num descuido futuro. É o que barra `\href`, `\url`,
//   `\includegraphics`, `\htmlStyle`, `\htmlClass`, `\htmlId` e `\htmlData`:
//   com ele desligado, `$\href{javascript:alert(1)}{x}$` não produz âncora
//   nenhuma — o KaTeX devolve o comando em vermelho, como comando não
//   suportado. É a única razão pela qual dá para confiar na saída do KaTeX o
//   suficiente para inseri-la sem passar pela lista de permissão.
//
// `maxSize: 6` — limita, em em, qualquer tamanho pedido por quem escreve
//   (`\rule{900em}{900em}`, `\kern`, `\hspace`, `\raisebox`). Sem isso, uma
//   linha de fórmula esticaria a coluna do caderno e arruinaria a paginação de
//   todo mundo — não é execução de código, é vandalismo de diagramação, e o
//   caderno impresso é justamente o que não dá para desfazer depois de sair
//   da impressora. 6em a 10pt são 2 cm: mais do que qualquer item de escola
//   precisa, e longe de estourar uma coluna de 266×730pt. O tamanho de
//   delimitador e de matriz é calculado pelo KaTeX, não pedido pelo autor, e
//   por isso não é afetado.
//
// `maxExpand: 1000` — o padrão; deixa explícito que a expansão de macro é
//   limitada, para `\def` recursivo não travar a aba de quem só abriu a lista
//   de itens.
//
// `strict: 'ignore'` — `strict` no KaTeX é fidelidade ao LaTeX, não segurança:
//   ele reclama de coisas como acento dentro de `$…$` ou unidade de texto em
//   modo matemático. Em 'error' um item se perderia por causa de um “á”; em
//   'warn' cada acento vira ruído no console de quem não escreveu o item.
//   Nenhuma dessas construções é insegura — quem barra o perigoso é `trust`.
//
// `throwOnError: false` — erro de digitação vira fórmula em vermelho, com o
//   código à mostra, em vez de derrubar a montagem da tela inteira. Quem
//   escreveu vê o vermelho na prévia e corrige.
const OPCOES_KATEX = {
  trust: false,
  maxSize: 6,
  maxExpand: 1000,
  strict: 'ignore',
  throwOnError: false,
  errorColor: '#c0143c'
};

let katex = null;
let carregamento = null;

// Carga sob demanda da cópia versionada — mesmo desenho do supabase-js em
// js/nuvem.js, e pela mesma razão: nada de CDN. `iniciarApp()` espera por esta
// promessa antes da primeira tela, para que a renderização seja síncrona em
// todo o resto do sistema (o caderno mede a altura de cada peça de HTML já
// pronta, e não teria como esperar).
function carregarKatex() {
  if (katex) return Promise.resolve(katex);
  carregamento = carregamento || import('./vendor/katex/katex.mjs')
    .then(m => (katex = m.default || m));
  return carregamento;
}

// Uma fórmula. Sem o KaTeX carregado, devolve o código como estava escrito:
// melhor a fonte à vista do que o campo em branco.
function htmlDaFormula(codigo, bloco) {
  if (!katex) return `<span class="mat-fonte">${esc(bloco ? `$$${codigo}$$` : `$${codigo}$`)}</span>`;
  try {
    return katex.renderToString(codigo, { ...OPCOES_KATEX, displayMode: bloco });
  } catch (e) {
    // `throwOnError: false` já cobre erro de sintaxe; isto é rede para o
    // imprevisto (estouro de expansão de macro, por exemplo).
    return `<span class="mat-erro" title="${esc(e?.message || 'fórmula inválida')}">${esc(codigo)}</span>`;
  }
}

/* ---------------- os delimitadores ---------------- */
// `$…$` em linha e `$$…$$` em destaque, como em LaTeX — é o que quem dá aula de
// exatas já conhece e o que qualquer exportação futura entende.
//
// O problema óbvio em português: “R$ 50,00” aparece em item de Matemática toda
// hora. Daí as três regras de vizinhança (as mesmas do Pandoc), que resolvem o
// caso real sem obrigar ninguém a escapar dinheiro:
//
//   • o `$` que ABRE não pode ser seguido de espaço  → “R$ 50,00 e R$ 30,00”
//     não abre fórmula nenhuma;
//   • o `$` que FECHA não pode ser precedido de espaço;
//   • o `$` que FECHA não pode ser seguido de algarismo → “R$50,00 e R$30,00”
//     também não fecha, porque o candidato a fechamento é o `$` de “R$30”.
//
// Sobra `\$` para o caso teimoso, e a prévia do editor mostra na hora o que o
// sistema entendeu — quem escreveu percebe antes de salvar.
const espaco = c => c === undefined || /\s/.test(c);
const algarismo = c => c !== undefined && c >= '0' && c <= '9';

// Onde fecha uma fórmula em linha aberta em `desde`. −1 se não fecha.
function acharFechamento(txt, desde) {
  for (let j = desde; j < txt.length; j++) {
    const c = txt[j];
    if (c === '\n') return -1;                  // fórmula em linha não pula linha
    if (c === '\\') { j++; continue; }          // \$ e \\ não contam
    if (c !== '$') continue;
    if (j === desde) return -1;                 // “$$” vazio não é fórmula
    if (espaco(txt[j - 1])) continue;
    if (algarismo(txt[j + 1])) continue;
    return j;
  }
  return -1;
}

// Quebra o texto em pedaços de texto comum e pedaços de fórmula.
function fatiar(txt) {
  const partes = [];
  let solto = '';
  const despejar = () => { if (solto) { partes.push({ tipo: 'texto', valor: solto }); solto = ''; } };

  let i = 0;
  while (i < txt.length) {
    const c = txt[i];
    if (c === '\\' && txt[i + 1] === '$') { solto += '$'; i += 2; continue; }
    if (c !== '$') { solto += c; i++; continue; }

    // destaque: $$ … $$
    if (txt[i + 1] === '$') {
      const fim = txt.indexOf('$$', i + 2);
      const codigo = fim < 0 ? '' : txt.slice(i + 2, fim);
      if (fim > 0 && codigo.trim() && !codigo.includes('$')) {
        despejar();
        partes.push({ tipo: 'bloco', valor: codigo.trim() });
        i = fim + 2;
        continue;
      }
      solto += c; i++; continue;
    }

    // em linha: $ … $   (espaco() já trata o fim do texto como espaço)
    if (espaco(txt[i + 1])) { solto += c; i++; continue; }
    const fim = acharFechamento(txt, i + 1);
    if (fim < 0) { solto += c; i++; continue; }
    despejar();
    partes.push({ tipo: 'linha', valor: txt.slice(i + 1, fim) });
    i = fim + 1;
  }
  despejar();
  return partes;
}

const temFormula = txt => String(txt ?? '').includes('$') &&
  fatiar(String(txt)).some(p => p.tipo !== 'texto');

// Troca as fórmulas pelo HTML do KaTeX, dentro da árvore JÁ PODADA. Trabalha
// sobre nós de texto: fórmula partida entre duas tags (“$x<b>^2</b>$”) não é
// reconhecida, e é assim de propósito — fórmula tem a formatação dela.
function matematizar(raiz) {
  const doc = raiz.ownerDocument;
  const alvos = [];
  const anda = doc.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  while (anda.nextNode())
    if (anda.currentNode.nodeValue.includes('$')) alvos.push(anda.currentNode);

  for (const no of alvos) {
    const partes = fatiar(no.nodeValue);
    if (!partes.some(p => p.tipo !== 'texto')) continue;
    const pedaco = doc.createDocumentFragment();
    for (const p of partes) {
      if (p.tipo === 'texto') { pedaco.appendChild(doc.createTextNode(p.valor)); continue; }
      const bloco = p.tipo === 'bloco';
      const caixa = doc.createElement(bloco ? 'div' : 'span');
      caixa.className = bloco ? 'mat mat-bloco' : 'mat';
      // innerHTML numa árvore de DOMParser é inerte: não executa script nem
      // dispara carregamento de recurso. E o que entra aqui é saída do KaTeX
      // com `trust: false`, não texto de quem escreveu o item.
      caixa.innerHTML = htmlDaFormula(p.valor, bloco);
      pedaco.appendChild(caixa);
    }
    no.replaceWith(pedaco);
  }
}

// O que vai para a tela: poda primeiro, matemática depois.
function rico(bruto) {
  const raiz = limparArvore(bruto);
  if (!raiz) return '';
  matematizar(raiz);
  return raiz.innerHTML;
}

// Versão em texto puro, para onde HTML não cabe: `title=`, validação de campo
// vazio, exportação. Mantém o código da fórmula à vista, que é o que a pessoa
// digitou e reconhece.
function simples(bruto) {
  const raiz = limparArvore(bruto);
  // O espaço inquebrável que o contenteditable insere sozinho conta
  // como espaço comum: senão um campo “vazio” que só tem um &nbsp;
  // passaria pela validação de “escreva o enunciado”.
  return (raiz?.textContent || '').replace(/\u00a0/g, ' ');
}

const vazio = bruto => !simples(bruto).trim();

/* ---------------- o editor ---------------- */
// `contenteditable` com barra de ferramentas, mais uma prévia logo abaixo.
//
// A fórmula fica como CÓDIGO na área de edição e RENDERIZADA na prévia. Editar
// dentro da fórmula já desenhada exigiria administrar cursor dentro do HTML do
// KaTeX — complicação grande para um sistema sem framework, e sem ganho: a
// prévia mostra exatamente o que vai sair impresso, que é o que se quer saber.

// Ênfase: são as tags que `js/limpar.js` já aceitava, então nada de novo entra
// no banco por aqui. `execCommand` está formalmente obsoleto, mas é o que todo
// navegador implementa para isto e não há substituto sem framework.
const ENFASES = [
  { cmd: 'bold',        rot: 'N',  estilo: 'font-weight:800',    nome: 'Negrito (Ctrl+B)' },
  { cmd: 'italic',      rot: 'I',  estilo: 'font-style:italic',  nome: 'Itálico (Ctrl+I)' },
  { cmd: 'underline',   rot: 'S',  estilo: 'text-decoration:underline', nome: 'Sublinhado (Ctrl+U)' },
  { cmd: 'superscript', rot: 'x²', estilo: '', nome: 'Sobrescrito — para m², 3ª, 1º' },
  { cmd: 'subscript',   rot: 'x₂', estilo: '', nome: 'Subscrito — para H₂O, CO₂' }
];

// Atalhos de notação. `partes` é [antes, alvo, depois]: o alvo já sai
// selecionado, para a pessoa digitar por cima em vez de caçar o cursor.
const SIMBOLOS = [
  { rot: 'ƒ',   nome: 'Fórmula em linha — $ … $',
    partes: ['$', 'x', '$'] },
  { rot: 'a/b', nome: 'Fração — \\frac{a}{b}',
    partes: ['$\\frac{', 'a', '}{b}$'] },
  { rot: 'xⁿ',  nome: 'Expoente — x^{2}',
    partes: ['$x^{', '2', '}$'] },
  { rot: 'xₙ',  nome: 'Índice — x_{1}',
    partes: ['$x_{', '1', '}$'] },
  { rot: '√',   nome: 'Raiz — \\sqrt{x}; raiz de índice n: \\sqrt[n]{x}',
    partes: ['$\\sqrt{', 'x', '}$'] },
  { rot: '°',   nome: 'Grau — 30^\\circ',
    partes: ['$', '30', '^\\circ$'] },
  { rot: '→',   nome: 'Vetor — \\vec{v}',
    partes: ['$\\vec{', 'v', '}$'] },
  { rot: '±',   nome: 'Mais ou menos — \\pm; e também \\times, \\div, \\le, \\ge, \\neq, \\approx, \\pi, \\Delta',
    partes: ['$', 'a', ' \\pm b$'] },
  { rot: '[ƒ]', nome: 'Fórmula em destaque, centralizada na própria linha — $$ … $$',
    partes: ['$$', 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', '$$'] }
];


// A área editável e a prévia. `campo` e `i` voltam no aviso de mudança para
// quem chamou saber o que atualizar.
function editorRico({ campo, i = '', valor = '', linhas = 3, rotulo = '' }) {
  const enfases = ENFASES.map(e =>
    `<button type="button" class="rico-btn" data-rico-cmd="${e.cmd}"
      title="${esc(e.nome)}" aria-label="${esc(e.nome)}" style="${e.estilo}">${e.rot}</button>`).join('');
  const simbolos = SIMBOLOS.map((s, n) =>
    `<button type="button" class="rico-btn mat" data-rico-simbolo="${n}"
      title="${esc(s.nome)}" aria-label="${esc(s.nome)}">${s.rot}</button>`).join('');
  const html = limpar(valor);
  return `
  <div class="rico">
    <div class="rico-barra" role="toolbar" aria-label="Ênfase e notação matemática">
      <span class="rico-grupo">${enfases}</span>
      <span class="rico-grupo">${simbolos}</span>
    </div>
    <div class="rico-area caixa${vazio(valor) ? ' vazia' : ''}" contenteditable="true"
      role="textbox" aria-multiline="true" spellcheck="true"
      ${rotulo ? `aria-label="${esc(rotulo)}"` : ''}
      data-rico-campo="${esc(campo)}" data-rico-i="${esc(String(i))}"
      data-vazio="${esc(rotulo || 'Escreva aqui')}"
      style="min-height:${Math.max(1, linhas) * 1.6 + 1.2}em">${html}</div>
    <div class="rico-previa" ${temFormula(valor) ? '' : 'hidden'}>
      <span class="rico-rot">prévia</span>
      <div class="rico-saida">${rico(valor)}</div>
    </div>
  </div>`;
}

// Chrome, sem isto, embrulha a ênfase em <span style> em vez de <b>/<i> — e
// `limpar()` desembrulharia o span, perdendo a formatação em silêncio.
let cssDesligado = false;
function desligarStyleWithCSS() {
  if (cssDesligado) return;
  cssDesligado = true;
  try { document.execCommand('styleWithCSS', false, false); } catch { /* navegador sem suporte */ }
}

// O que se guarda: o HTML da área, achatado e podado. Trabalha sobre uma CÓPIA
// para não mexer no que está sob o cursor de quem digita.
function valorDoEditor(area) {
  const copia = area.cloneNode(true);
  achatarBlocos(copia);
  quebrasEmBr(copia);
  podarFimVazio(copia);
  return limpar(copia.innerHTML).trim();
}

// Texto colado de fora traz "\n". Dentro do editor ele aparece como quebra
// (a área usa `white-space: pre-wrap`), mas na prévia, no caderno e em qualquer
// outro lugar o HTML colapsaria essa quebra num espaço — a mesma frase leria
// diferente em cada tela. Virando <br>, que a lista de permissão aceita, a
// quebra vale igual nos três.
function quebrasEmBr(raiz) {
  const doc = raiz.ownerDocument;
  const alvos = [];
  const anda = doc.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  while (anda.nextNode())
    if (anda.currentNode.nodeValue.includes('\n')) alvos.push(anda.currentNode);
  for (const no of alvos) {
    const pedaco = doc.createDocumentFragment();
    no.nodeValue.split('\n').forEach((parte, n) => {
      if (n) pedaco.appendChild(doc.createElement('br'));
      if (parte) pedaco.appendChild(doc.createTextNode(parte));
    });
    no.replaceWith(pedaco);
  }
}

// Ao teclar Enter o navegador cria <div> (Chrome) ou <p>; `limpar()`
// desembrulha esses elementos, e a quebra de linha desapareceria sem aviso.
// Virando <br> — que está na lista de permissão — ela sobrevive.
function achatarBlocos(raiz) {
  for (const b of raiz.querySelectorAll('div,p,li,blockquote,h1,h2,h3,h4,h5,h6')) {
    if (b.previousSibling) b.parentNode.insertBefore(raiz.ownerDocument.createElement('br'), b);
  }
}

// O <br> que o navegador põe no fim só para o cursor ter onde descer não é
// conteúdo — guardá-lo daria um enunciado terminando em linha em branco. Vai
// até o último descendente, e não só até o último filho: o <br> costuma nascer
// dentro do <b> ou do <sup> em que se estava escrevendo.
function podarFimVazio(raiz) {
  const descartavel = n => n.nodeName === 'BR' ||
    (n.nodeType === 3 && !n.nodeValue.replace(/[\s ]/g, '')) ||
    (n.nodeType === 1 && !n.childNodes.length);
  for (let volta = 0; volta < 12; volta++) {
    let ultimo = raiz;
    while (ultimo.lastChild) ultimo = ultimo.lastChild;
    if (ultimo === raiz || !descartavel(ultimo)) return;
    ultimo.remove();
  }
}

function caixaDe(el) { return el?.closest('.rico') || null; }

// A última seleção conhecida de cada área. Quem chega ao botão pelo teclado
// (Tab) perde a seleção quando o foco sai da área — guardando o intervalo dá
// para devolvê-lo antes de aplicar o comando, e a barra funciona sem mouse.
const ultimaSelecao = new WeakMap();
function anotarSelecao() {
  const sel = getSelection();
  if (!sel?.rangeCount) return;
  const inicio = sel.getRangeAt(0).startContainer;
  const el = inicio.nodeType === 1 ? inicio : inicio.parentNode;
  const area = el?.closest?.('[data-rico-campo]');
  if (area) ultimaSelecao.set(area, sel.getRangeAt(0).cloneRange());
}
function devolverSelecao(area) {
  const r = ultimaSelecao.get(area);
  if (!r) return;
  try {
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  } catch { /* intervalo apontava para nó que já saiu do DOM */ }
}

// A prévia sai de `rico()`, ou seja: a parte escrita pela pessoa já passou pela
// poda e a parte da fórmula é saída do KaTeX com `trust: false`. Não há tag que
// carregue recurso nem atributo de evento no que se atribui aqui — é a mesma
// garantia dos outros `innerHTML` do sistema, que sempre recebem `esc()`,
// `limpar()` ou `rico()`.
function atualizarPrevia(caixa, valor) {
  const previa = caixa?.querySelector('.rico-previa');
  if (!previa) return;
  const mostra = temFormula(valor);
  previa.hidden = !mostra;
  if (mostra) previa.querySelector('.rico-saida').innerHTML = rico(valor);
}

// Um único ouvinte por evento, no document: o diálogo do item é remontado
// inteiro a cada ação (`reabrirDlgItem`), e ouvinte preso ao elemento morreria
// junto. Nada aqui remonta a tela — remontar mataria o cursor de quem digita.
function ligarEditoresRicos(aoMudar) {
  const avisar = area => {
    const valor = valorDoEditor(area);
    area.classList.toggle('vazia', !simples(valor).trim());
    atualizarPrevia(caixaDe(area), valor);
    aoMudar(area.dataset.ricoCampo, area.dataset.ricoI, valor);
  };

  document.addEventListener('input', e => {
    const area = e.target.closest?.('[data-rico-campo]');
    if (area) avisar(area);
  });

  document.addEventListener('selectionchange', anotarSelecao);

  // Colar vem como texto puro. Colado de Word ou de página, o HTML traria
  // <span style>, <font> e tabela, que a lista de permissão descarta em
  // silêncio: melhor a pessoa ver texto simples e formatar do que ver a
  // formatação sumir ao salvar.
  document.addEventListener('paste', e => {
    const area = e.target.closest?.('[data-rico-campo]');
    if (!area) return;
    e.preventDefault();
    const txt = e.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, txt.replace(/\r\n?/g, '\n'));
    avisar(area);
  });

  // Clicar num botão da barra não pode roubar a seleção da área de edição —
  // sem isto, “selecionar e clicar em N” não negrita nada.
  document.addEventListener('mousedown', e => {
    if (e.target.closest?.('.rico-barra button')) e.preventDefault();
  });

  document.addEventListener('click', e => {
    const b = e.target.closest?.('.rico-barra button');
    if (!b) return;
    e.preventDefault();
    const area = caixaDe(b)?.querySelector('.rico-area');
    if (!area) return;
    desligarStyleWithCSS();
    area.focus();
    devolverSelecao(area);
    if (b.dataset.ricoCmd) document.execCommand(b.dataset.ricoCmd);
    else inserirSimbolo(SIMBOLOS[Number(b.dataset.ricoSimbolo)]);
    avisar(area);
  });

  document.addEventListener('keydown', e => {
    const area = e.target.closest?.('[data-rico-campo]');
    if (!area) return;
    if ((e.ctrlKey || e.metaKey) && 'biu'.includes(e.key.toLowerCase())) {
      desligarStyleWithCSS();   // o atalho do navegador também produziria <span style>
      return;
    }
    // Enter quebra linha; Ctrl+Enter é atalho de nada aqui, some.
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      quebrarLinha();
      avisar(area);
    }
  });
}

// Quebra de linha explícita: `insertLineBreak` não existe em todo navegador, e
// o Enter nativo cria <div>. Um <br> posto à mão é o que a lista de permissão
// aceita e o que o caderno entende.
function quebrarLinha() {
  const sel = getSelection();
  if (!sel?.rangeCount) return;
  const r = sel.getRangeAt(0);
  r.deleteContents();
  const br = document.createElement('br');
  r.insertNode(br);
  // No fim do texto o cursor não desce sem um segundo <br> à frente dele — é o
  // mesmo truque que o navegador usa. `podarFimVazio()` tira esse sobressalente
  // do que se guarda, para o enunciado não terminar em linha em branco.
  if (!br.nextSibling) br.after(document.createElement('br'));
  r.setStartAfter(br);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

// Insere o atalho de notação com o alvo já selecionado.
function inserirSimbolo(s) {
  if (!s) return;
  const [antes, alvo, depois] = s.partes;
  document.execCommand('insertText', false, antes + alvo + depois);
  const sel = getSelection();
  if (!sel?.rangeCount) return;
  const r = sel.getRangeAt(0);
  const no = r.startContainer;
  if (no.nodeType !== 3) return;
  const fim = r.startOffset - depois.length;
  const ini = fim - alvo.length;
  if (ini < 0 || fim > no.nodeValue.length) return;
  const novo = document.createRange();
  novo.setStart(no, ini);
  novo.setEnd(no, fim);
  sel.removeAllRanges();
  sel.addRange(novo);
}

export {
  carregarKatex,       // chamado uma vez na inicialização, antes da 1ª tela
  rico,                // texto guardado → HTML seguro, com as fórmulas desenhadas
  simples,             // texto guardado → texto puro (title=, validação)
  vazio,               // “este campo está em branco?”, olhando por baixo da marcação
  editorRico,          // o HTML de um campo rico
  ligarEditoresRicos,  // liga barra, prévia e aviso de mudança (uma vez)
  OPCOES_KATEX         // exportado para ficar auditável de fora
};
