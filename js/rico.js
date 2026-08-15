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

import { limpar, limparArvore, CLASSES as CLASSES_TAMANHO } from './limpar.js';

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
//
// Cada pedaço de fórmula carrega `ini` e `fim` — os índices, no texto original,
// do `$` que abre e do caractere seguinte ao que fecha. É por eles que o editor
// de fórmula sabe que o cursor está DENTRO de uma fórmula já escrita e a abre
// para edição em vez de encaixar outra ao lado. Sem isso, corrigir um expoente
// exigia apagar a fórmula inteira na mão.
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
        partes.push({ tipo: 'bloco', valor: codigo.trim(), ini: i, fim: fim + 2 });
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
    partes.push({ tipo: 'linha', valor: txt.slice(i + 1, fim), ini: i, fim: fim + 1 });
    i = fim + 1;
  }
  despejar();
  return partes;
}

// A fórmula sob o cursor, se houver. `pos` é a posição do cursor dentro de
// `txt`. Vale também quando o cursor está encostado no `$` que fecha, que é
// onde ele fica logo depois de a pessoa terminar de digitar a fórmula.
function formulaEm(txt, pos) {
  return fatiar(String(txt ?? '')).find(p =>
    p.tipo !== 'texto' && pos >= p.ini && pos <= p.fim) || null;
}

// O KaTeX aceita este código? Devolve null quando sim e a mensagem do erro
// quando não. É o que o editor de fórmula mostra em vermelho enquanto se
// digita — “algumas saem com erros” era, quase sempre, chave que não fechou ou
// comando escrito com um caractere a menos, e nada dizia isso na hora.
function erroDaFormula(codigo) {
  if (!katex) return null;                       // sem KaTeX não há o que aferir
  if (!String(codigo).trim()) return 'A fórmula está em branco.';
  try {
    katex.renderToString(String(codigo), { ...OPCOES_KATEX, throwOnError: true });
    return null;
  } catch (e) {
    return String(e?.message || e)
      .replace(/^KaTeX parse error:\s*/, '')
      .replace(/\bat position (\d+)/, 'na posição $1');
  }
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

/* ---------------- a paleta do editor de fórmula ---------------- */
// Os atalhos da barra (SIMBOLOS, acima) resolvem a fração e o expoente, que são
// o dia a dia. O que faltava era o resto: somatório, integral, limite, matriz,
// sistema, conjunto numérico, equação química com seta de equilíbrio — e um
// lugar onde a fórmula pudesse ser MONTADA e CONFERIDA antes de entrar no
// enunciado. Era daí que vinham as fórmulas com erro: escrever LaTeX às cegas
// no meio da frase e só descobrir o problema na prévia do caderno.
//
// Cada entrada é [rótulo, código]. O código entra no campo do editor, na
// posição do cursor; quem monta vê o resultado desenhado embaixo, na hora.
const PALETA_MAT = [
  { nome: 'Básico', itens: [
    ['a/b', '\\frac{a}{b}'], ['x²', 'x^{2}'], ['xₙ', 'x_{1}'], ['√', '\\sqrt{x}'],
    ['ⁿ√', '\\sqrt[3]{x}'], ['±', '\\pm'], ['∓', '\\mp'], ['×', '\\times'],
    ['÷', '\\div'], ['·', '\\cdot'], ['%', '\\%'], ['…', '\\dots']
  ] },
  { nome: 'Relações', itens: [
    ['≠', '\\neq'], ['≈', '\\approx'], ['≡', '\\equiv'], ['≤', '\\le'], ['≥', '\\ge'],
    ['≪', '\\ll'], ['≫', '\\gg'], ['∝', '\\propto'], ['∼', '\\sim'], ['≅', '\\cong']
  ] },
  { nome: 'Potências e raízes', itens: [
    ['10ⁿ', '10^{3}'], ['e^x', 'e^{x}'], ['aⁿ/ᵐ', 'a^{n/m}'], ['√(a+b)', '\\sqrt{a+b}'],
    ['log', '\\log_{10} x'], ['ln', '\\ln x'], ['|x|', '\\left| x \\right|'],
    ['(  )', '\\left( x \\right)'], ['[  ]', '\\left[ x \\right]']
  ] },
  { nome: 'Cálculo', itens: [
    ['∑', '\\sum_{i=1}^{n}'], ['∏', '\\prod_{i=1}^{n}'], ['∫', '\\int_{a}^{b} f(x)\\,dx'],
    ['lim', '\\lim_{x \\to 0}'], ['dy/dx', '\\frac{dy}{dx}'], ['∂', '\\partial'],
    ['∞', '\\infty'], ["ƒ'", "f'(x)"], ['Δ', '\\Delta']
  ] },
  { nome: 'Conjuntos e lógica', itens: [
    ['∈', '\\in'], ['∉', '\\notin'], ['⊂', '\\subset'], ['⊆', '\\subseteq'],
    ['∪', '\\cup'], ['∩', '\\cap'], ['∅', '\\emptyset'], ['ℕ', '\\mathbb{N}'],
    ['ℤ', '\\mathbb{Z}'], ['ℚ', '\\mathbb{Q}'], ['ℝ', '\\mathbb{R}'],
    ['∀', '\\forall'], ['∃', '\\exists'], ['¬', '\\neg']
  ] },
  { nome: 'Geometria', itens: [
    ['°', '^\\circ'], ['∠', '\\angle'], ['△', '\\triangle ABC'], ['∥', '\\parallel'],
    ['⊥', '\\perp'], ['π', '\\pi'], ['→v', '\\vec{v}'], ['AB', '\\overline{AB}'],
    ['sen', '\\operatorname{sen}\\theta'], ['cos', '\\cos\\theta'], ['tg', '\\operatorname{tg}\\theta']
  ] },
  { nome: 'Grego', itens: [
    ['α', '\\alpha'], ['β', '\\beta'], ['γ', '\\gamma'], ['δ', '\\delta'], ['ε', '\\varepsilon'],
    ['θ', '\\theta'], ['λ', '\\lambda'], ['μ', '\\mu'], ['ρ', '\\rho'], ['σ', '\\sigma'],
    ['φ', '\\varphi'], ['ω', '\\omega'], ['Δ', '\\Delta'], ['Σ', '\\Sigma'], ['Ω', '\\Omega']
  ] },
  { nome: 'Química', itens: [
    ['H₂O', '\\mathrm{H_2O}'], ['CO₂', '\\mathrm{CO_2}'], ['Na⁺', '\\mathrm{Na^{+}}'],
    ['SO₄²⁻', '\\mathrm{SO_4^{2-}}'], ['⇌', '\\rightleftharpoons'], ['→', '\\to'],
    ['↑', '\\uparrow'], ['↓', '\\downarrow'], ['mol/L', '\\mathrm{mol/L}'],
    ['ΔH', '\\Delta H'], ['x·10ⁿ', '2{,}5 \\times 10^{-3}']
  ] },
  { nome: 'Estruturas', itens: [
    ['matriz', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'],
    ['determinante', '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}'],
    ['sistema', '\\begin{cases} x + y = 3 \\\\ x - y = 1 \\end{cases}'],
    ['fração dupla', '\\frac{\\frac{a}{b}}{c}'],
    ['texto dentro', '\\text{, em metros}'],
    ['unidade', '\\,\\mathrm{m/s^2}'],
    ['espaço', '\\quad'],
    ['sobrescrito e índice', 'x_{1}^{2}']
  ] }
];

// Modelos prontos — a fórmula inteira, não o símbolo. É o atalho de quem sabe
// qual conta quer e não quer montá-la peça por peça.
const MODELOS_MAT = [
  ['Bhaskara',        'x = \\frac{-b \\pm \\sqrt{b^{2}-4ac}}{2a}'],
  ['Equação da reta', 'y = ax + b'],
  ['Regra de três',   '\\frac{a}{b} = \\frac{c}{d}'],
  ['Porcentagem',     'p = \\frac{parte}{todo} \\times 100\\%'],
  ['Juros compostos', 'M = C\\left(1 + i\\right)^{t}'],
  ['Velocidade média', 'v_{m} = \\frac{\\Delta s}{\\Delta t}'],
  ['2ª lei de Newton', '\\vec{F} = m\\,\\vec{a}'],
  ['Energia cinética', 'E_{c} = \\frac{m v^{2}}{2}'],
  ['Concentração',    'C = \\frac{n}{V}'],
  ['Equilíbrio químico', '\\mathrm{N_2} + 3\\,\\mathrm{H_2} \\rightleftharpoons 2\\,\\mathrm{NH_3}'],
  ['Probabilidade',   'P(A) = \\frac{casos\\ favor\\acute{a}veis}{casos\\ poss\\acute{i}veis}'],
  ['Área do círculo', 'A = \\pi r^{2}']
];


// A área editável e a prévia. `campo` e `i` voltam no aviso de mudança para
// quem chamou saber o que atualizar.
//
// `soLeitura` devolve o mesmo campo sem barra e sem `contenteditable`, já com as
// fórmulas desenhadas: é o que quem abre o item de outra pessoa vê. Um editor
// desabilitado depois de montado continuaria disparando `input` em navegador
// que ignora o atributo — aqui a área simplesmente não é editável.
// `paragrafos` liga o modo prosa do corpo do texto-base: Enter abre PARÁGRAFO
// (linha em branco, que é como o texto-base guarda a separação) e Shift+Enter
// quebra a linha dentro do mesmo parágrafo. Sem isso a única forma de separar
// parágrafo era teclar Enter duas vezes sabendo que a linha vazia tem esse
// significado — ninguém adivinha, e os textos chegavam ao caderno num bloco só.
//
// `previa` recebe o HTML já montado da prévia. Quando vem preenchida, a prévia
// fica sempre à vista (não só quando há fórmula): é ela que mostra, em prosa,
// onde cada parágrafo começa e termina.
function editorRico({ campo, i = '', valor = '', linhas = 3, rotulo = '', soLeitura = false,
                      paragrafos = false, previa = null }) {
  if (soLeitura)
    return `
  <div class="rico rico-lendo">
    <div class="rico-area caixa${vazio(valor) ? ' vazia' : ''}"
      role="textbox" aria-readonly="true" tabindex="0"
      ${rotulo ? `aria-label="${esc(rotulo)}"` : ''}
      data-vazio="${esc(rotulo || 'Em branco')}"
      style="min-height:${Math.max(1, linhas) * 1.6 + 1.2}em">${rico(valor)}</div>
  </div>`;
  const enfases = ENFASES.map(e =>
    `<button type="button" class="rico-btn" data-rico-cmd="${e.cmd}"
      title="${esc(e.nome)}" aria-label="${esc(e.nome)}" style="${e.estilo}">${e.rot}</button>`).join('');
  const tamanhos = TAMANHOS.map((t, n) =>
    `<button type="button" class="rico-btn rico-tam" data-rico-tamanho="${n}"
      title="${esc(t.nome)}" aria-label="Tamanho: ${esc(t.nome)}" style="${t.estilo}">${t.rot}</button>`).join('');
  const simbolos = SIMBOLOS.map((s, n) =>
    `<button type="button" class="rico-btn mat" data-rico-simbolo="${n}"
      title="${esc(s.nome)}" aria-label="${esc(s.nome)}">${s.rot}</button>`).join('');
  const paragrafo = paragrafos
    ? `<span class="rico-grupo"><button type="button" class="rico-btn" data-rico-paragrafo="1"
        title="Novo parágrafo (Enter)" aria-label="Novo parágrafo">¶</button></span>`
    : '';
  const html = limpar(valor);
  const mostraPrevia = previa !== null || temFormula(valor);
  return `
  <div class="rico">
    <div class="rico-barra" role="toolbar" aria-label="Ênfase, tamanho e notação matemática">
      <span class="rico-grupo">${enfases}</span>
      <span class="rico-grupo rico-grupo-tam" title="Tamanho da letra">${tamanhos}</span>
      <button type="button" class="rico-btn rico-formula" data-rico-formula="1"
        title="Montar uma fórmula com paleta e conferência (Ctrl+M)"
        aria-label="Editor de fórmula matemática"><b>ƒ(x)</b> Fórmula</button>
      <span class="rico-grupo">${simbolos}</span>${paragrafo}
    </div>
    <div class="rico-mat" hidden></div>
    <div class="rico-area caixa${vazio(valor) ? ' vazia' : ''}" contenteditable="true"
      role="textbox" aria-multiline="true" spellcheck="true"
      ${rotulo ? `aria-label="${esc(rotulo)}"` : ''}
      data-rico-campo="${esc(campo)}" data-rico-i="${esc(String(i))}"
      ${paragrafos ? 'data-rico-paragrafos="1"' : ''}
      data-vazio="${esc(rotulo || 'Escreva aqui')}"
      style="min-height:${Math.max(1, linhas) * 1.6 + 1.2}em">${html}</div>
    <div class="rico-previa${previa !== null ? ' rico-previa-fixa' : ''}" ${mostraPrevia ? '' : 'hidden'}>
      <span class="rico-rot">${previa !== null ? 'como sai no caderno' : 'prévia'}</span>
      <div class="rico-saida">${previa ?? rico(valor)}</div>
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
  tamanhosEmSpan(copia);
  podarFimVazio(copia);
  return limpar(copia.innerHTML).trim();
}

/* ---------------- tamanho de fonte ---------------- */
// O pedido: “alguns números aparecem bem pequenos”. Sai em expoente de
// Matemática, em índice de Química e em número de linha citado no enunciado —
// e no papel, a 10pt, um algarismo a 0,75em fica no limite do legível.
//
// O comando do navegador para isto é `fontSize`, e ele produz <font size="n">,
// tag obsoleta que `js/limpar.js` não aceita — nem deveria. Então o <font> é
// traduzido aqui, na hora de guardar, para <span class="tam-…">, que é o
// vocabulário fechado que o higienizador conhece. O que vai ao banco é sempre
// o span; o <font> não sobrevive a uma gravação.
//
// `3` e `4` são o tamanho normal: eles não viram classe nenhuma, e servem
// justamente para DESFAZER — daí a regra do meio, que tira o tamanho de quem
// envolve o trecho recém-marcado. Sem ela, marcar “maior” e depois “normal”
// deixava o texto grande, porque o span de fora continuava lá.
const TAM_DE_FONT = { 1: 'tam-pp', 2: 'tam-p', 3: '', 4: '', 5: 'tam-g', 6: 'tam-gg', 7: 'tam-gg' };

// Os tamanhos oferecidos na barra, do menor para o maior. `font` é o número que
// vai ao `execCommand`; `classe` é o que sobra no HTML guardado.
const TAMANHOS = [
  { font: 2, classe: 'tam-p',  rot: 'A', estilo: 'font-size:10px', nome: 'Menor' },
  { font: 3, classe: '',       rot: 'A', estilo: 'font-size:13px', nome: 'Tamanho normal — desfaz o tamanho aplicado' },
  { font: 5, classe: 'tam-g',  rot: 'A', estilo: 'font-size:16px', nome: 'Maior' },
  { font: 6, classe: 'tam-gg', rot: 'A', estilo: 'font-size:19px', nome: 'Bem maior — para número que precisa ser lido de longe' }
];

const ehTamanho = el => el?.tagName === 'SPAN' &&
  CLASSES_TAMANHO.has((el.getAttribute('class') || '').trim());

function tamanhosEmSpan(raiz) {
  const doc = raiz.ownerDocument;
  for (const f of [...raiz.querySelectorAll('font')]) {
    const s = doc.createElement('span');
    s.setAttribute('data-tam', TAM_DE_FONT[Number(f.getAttribute('size'))] ?? '');
    s.append(...f.childNodes);
    f.replaceWith(s);
  }
  // O tamanho recém-aplicado manda sobre o trecho inteiro: quem o envolve e
  // quem está dentro dele perdem o seu. Sem a segunda metade, marcar “maior” e
  // depois “normal” não desfazia nada — o comando do navegador embrulha o span
  // antigo em vez de desmanchá-lo, e o tamanho de dentro continuava valendo.
  for (const s of [...raiz.querySelectorAll('span[data-tam]')]) {
    for (let p = s.parentElement; p && p !== raiz; p = p.parentElement)
      if (ehTamanho(p)) p.removeAttribute('class');
    for (const d of s.querySelectorAll('span')) if (ehTamanho(d)) d.removeAttribute('class');
  }
  for (const s of [...raiz.querySelectorAll('span[data-tam]')]) {
    const classe = s.getAttribute('data-tam');
    s.removeAttribute('data-tam');
    if (classe) s.setAttribute('class', classe);
    else s.replaceWith(...s.childNodes);
  }
  // <span> sem classe não quer dizer nada — e o Chrome cria um a cada colagem.
  for (const s of [...raiz.querySelectorAll('span:not([class])')]) s.replaceWith(...s.childNodes);
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
// `html` já pronto (vindo de quem chamou `ligarEditoresRicos`) tem precedência:
// é assim que o corpo do texto-base mostra a divisão em parágrafos, que é regra
// do caderno e mora em js/app.js, sem este módulo precisar conhecê-la.
function atualizarPrevia(caixa, valor, html = null) {
  const previa = caixa?.querySelector('.rico-previa');
  if (!previa) return;
  const mostra = html !== null || temFormula(valor);
  previa.hidden = !mostra;
  if (mostra) previa.querySelector('.rico-saida').innerHTML = html ?? rico(valor);
}

/* ---------------- o editor de fórmula ---------------- */
// Um painel que abre DENTRO do editor, logo abaixo da barra — não um diálogo.
// A razão é concreta: o editor rico vive dentro do diálogo do item, e este
// sistema tem um `<dialog>` só. Abrir outro por cima exigiria empilhá-los, e
// remontar o diálogo destruiria a área de edição e o cursor junto — que é
// justamente o lugar onde a fórmula precisa entrar.
//
// O painel guarda, ao abrir, o nó de texto e a faixa de caracteres que ele vai
// substituir. Daí em diante ele não depende mais da seleção viva, e o foco pode
// ir para o campo do código sem perder o lugar de destino.
let painel = null;   // { area, codigo, bloco, cat, alvo: {no, ini, fim} | null }

function caixaDoPainel() {
  return painel ? caixaDe(painel.area)?.querySelector('.rico-mat') : null;
}

function fecharPainelFormula() {
  const caixa = caixaDoPainel();
  if (caixa) { caixa.hidden = true; caixa.innerHTML = ''; }
  painel = null;
}

function abrirPainelFormula(area) {
  const r = ultimaSelecao.get(area);
  let alvo = null, codigo = '', bloco = false;
  // Cursor dentro de uma fórmula já escrita: abre AQUELA fórmula para edição.
  if (r && r.startContainer.nodeType === 3) {
    const f = formulaEm(r.startContainer.nodeValue, r.startOffset);
    if (f) {
      alvo = { no: r.startContainer, ini: f.ini, fim: f.fim };
      codigo = f.valor;
      bloco = f.tipo === 'bloco';
    }
  }
  // Texto selecionado sem fórmula: entra como ponto de partida do código.
  if (!alvo && r && !r.collapsed) codigo = String(r).trim();
  painel = { area, codigo, bloco, cat: 0, alvo };
  desenharPainelFormula();
  caixaDoPainel()?.querySelector('.rico-mat-fonte')?.focus();
}

function desenharPainelFormula() {
  const caixa = caixaDoPainel();
  if (!caixa || !painel) return;
  const erro = erroDaFormula(painel.codigo);
  const abas = PALETA_MAT.map((g, i) =>
    `<button type="button" class="rico-mat-aba${i === painel.cat ? ' sel' : ''}"
      data-rico-mat-cat="${i}">${esc(g.nome)}</button>`).join('');
  const grade = (PALETA_MAT[painel.cat]?.itens || []).map(([rot, cod], i) =>
    `<button type="button" class="rico-mat-simb" data-rico-mat-add="${i}"
      title="${esc(cod)}">${esc(rot)}</button>`).join('');
  const modelos = MODELOS_MAT.map(([rot], i) =>
    `<button type="button" class="rico-mat-modelo" data-rico-mat-modelo="${i}">${esc(rot)}</button>`).join('');
  caixa.hidden = false;
  caixa.innerHTML = `
    <div class="rico-mat-cab">
      <strong>Fórmula matemática</strong>
      <span class="seg rico-mat-onde">
        <button type="button" class="${painel.bloco ? '' : 'sel'}" data-rico-mat-bloco="0">na linha</button>
        <button type="button" class="${painel.bloco ? 'sel' : ''}" data-rico-mat-bloco="1">em destaque</button>
      </span>
      <button type="button" class="rico-mat-x" data-rico-mat-fechar="1" aria-label="Fechar">✕</button>
    </div>
    <div class="rico-mat-saida ${erro ? 'com-erro' : ''}">
      ${erro ? '' : htmlDaFormula(painel.codigo, painel.bloco)}
      ${erro ? `<p class="rico-mat-erro">⚠ ${esc(erro)}</p>` : ''}
    </div>
    <input class="caixa rico-mat-fonte" spellcheck="false" value="${esc(painel.codigo)}"
      placeholder="ex.: \\frac{1}{2}  ·  x^{2}  ·  \\sqrt{3}" aria-label="Código da fórmula, em LaTeX">
    <div class="rico-mat-abas">${abas}</div>
    <div class="rico-mat-grade">${grade}</div>
    <details class="rico-mat-modelos"><summary>Fórmulas prontas</summary>
      <div class="rico-mat-grade">${modelos}</div></details>
    <div class="rico-mat-pe">
      <span class="rico-mat-dica">A fórmula é guardada como código entre <code>$…$</code>; o desenho é feito na hora de mostrar.</span>
      <button type="button" class="btn fantasma mini" data-rico-mat-fechar="1">Cancelar</button>
      <button type="button" class="btn mini" data-rico-mat-ok="1" ${erro ? 'disabled' : ''}>
        ${painel.alvo ? 'Substituir' : 'Inserir'}</button>
    </div>`;
}

// Só o desenho e o botão de confirmar — o resto do painel fica onde está, com
// o cursor de quem digita dentro do campo.
function atualizarSaidaDaFormula() {
  const caixa = caixaDoPainel();
  if (!caixa || !painel) return;
  const erro = erroDaFormula(painel.codigo);
  const saida = caixa.querySelector('.rico-mat-saida');
  if (saida) {
    saida.classList.toggle('com-erro', !!erro);
    saida.innerHTML = erro
      ? `<p class="rico-mat-erro">⚠ ${esc(erro)}</p>`
      : htmlDaFormula(painel.codigo, painel.bloco);
  }
  const ok = caixa.querySelector('[data-rico-mat-ok]');
  if (ok) ok.disabled = !!erro;
}

// Encaixa um trecho de código no campo, onde está o cursor.
function encaixarNoCodigo(caixa, trecho) {
  const campo = caixa.querySelector('.rico-mat-fonte');
  if (!campo) return;
  const i = campo.selectionStart ?? campo.value.length;
  const f = campo.selectionEnd ?? i;
  campo.setRangeText(trecho, i, f, 'end');
  painel.codigo = campo.value;
  campo.focus();
  atualizarSaidaDaFormula();
}

// Escreve a fórmula na área de edição, no lugar guardado ao abrir o painel.
function aplicarFormula(avisar) {
  if (!painel) return;
  const { area, alvo } = painel;
  const fonte = painel.bloco ? `$$${painel.codigo}$$` : `$${painel.codigo}$`;
  area.focus();
  const sel = getSelection();
  sel.removeAllRanges();
  if (alvo && alvo.no.isConnected) {
    const r = document.createRange();
    // A faixa pode ter encolhido se a pessoa digitou na área com o painel
    // aberto; os limites são presos ao tamanho atual do nó para o intervalo
    // nunca apontar para fora dele.
    const fim = Math.min(alvo.fim, alvo.no.nodeValue.length);
    r.setStart(alvo.no, Math.min(alvo.ini, fim));
    r.setEnd(alvo.no, fim);
    sel.addRange(r);
  } else {
    devolverSelecao(area);
    if (!sel.rangeCount) {                       // sem cursor conhecido: no fim
      const r = document.createRange();
      r.selectNodeContents(area);
      r.collapse(false);
      sel.addRange(r);
    }
  }
  document.execCommand('insertText', false, fonte);
  const alvoArea = area;
  fecharPainelFormula();
  avisar(alvoArea);
}

// Um único ouvinte por evento, no document: o diálogo do item é remontado
// inteiro a cada ação (`reabrirDlgItem`), e ouvinte preso ao elemento morreria
// junto. Nada aqui remonta a tela — remontar mataria o cursor de quem digita.
function ligarEditoresRicos(aoMudar, previaDe = null) {
  const avisar = area => {
    const valor = valorDoEditor(area);
    area.classList.toggle('vazia', !simples(valor).trim());
    atualizarPrevia(caixaDe(area), valor, previaDe?.(area.dataset.ricoCampo, valor) ?? null);
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
  // sem isto, “selecionar e clicar em N” não negrita nada. Vale também para os
  // botões do painel de fórmula; o campo de código dele, não: ali o foco tem de
  // ir mesmo, e o destino da fórmula já está guardado em `painel.alvo`.
  document.addEventListener('mousedown', e => {
    if (e.target.closest?.('.rico-barra button, .rico-mat button')) e.preventDefault();
  });

  document.addEventListener('click', e => {
    const b = e.target.closest?.('.rico-barra button');
    if (!b) return;
    e.preventDefault();
    const area = caixaDe(b)?.querySelector('.rico-area');
    if (!area) return;
    // O painel de fórmula é o único botão da barra que não escreve na hora: ele
    // abre (ou fecha) a bancada onde a fórmula é montada.
    if (b.dataset.ricoFormula) {
      if (painel && painel.area === area) fecharPainelFormula();
      else { fecharPainelFormula(); abrirPainelFormula(area); }
      return;
    }
    desligarStyleWithCSS();
    area.focus();
    devolverSelecao(area);
    if (b.dataset.ricoCmd) document.execCommand(b.dataset.ricoCmd);
    else if (b.dataset.ricoTamanho) document.execCommand('fontSize', false, TAMANHOS[Number(b.dataset.ricoTamanho)].font);
    else if (b.dataset.ricoParagrafo) quebrarLinha(2);
    else inserirSimbolo(SIMBOLOS[Number(b.dataset.ricoSimbolo)]);
    avisar(area);
  });

  // O painel de fórmula: abas, símbolos, modelos, destino e confirmação.
  document.addEventListener('click', e => {
    const b = e.target.closest?.('.rico-mat button');
    if (!b || !painel) return;
    e.preventDefault();
    const caixa = caixaDoPainel();
    const d = b.dataset;
    if (d.ricoMatFechar) return void fecharPainelFormula();
    if (d.ricoMatOk) return void aplicarFormula(avisar);
    if (d.ricoMatCat) { painel.cat = Number(d.ricoMatCat); return void desenharPainelFormula(); }
    if (d.ricoMatBloco) { painel.bloco = d.ricoMatBloco === '1'; return void desenharPainelFormula(); }
    if (d.ricoMatAdd) return void encaixarNoCodigo(caixa, PALETA_MAT[painel.cat].itens[Number(d.ricoMatAdd)][1]);
    if (d.ricoMatModelo) {
      // Modelo é a fórmula inteira: ele substitui o que está escrito em vez de
      // se somar a ele — meio modelo colado no meio de outra conta não é nada.
      painel.codigo = MODELOS_MAT[Number(d.ricoMatModelo)][1];
      desenharPainelFormula();
    }
  });

  // O código digitado no painel: a prévia acompanha tecla a tecla, e é ela que
  // mostra o erro antes de a fórmula entrar no item. Só a prévia e o botão são
  // redesenhados — refazer o painel inteiro a cada tecla tiraria o cursor do
  // campo, que é o mesmo motivo pelo qual nada aqui remonta o diálogo.
  document.addEventListener('input', e => {
    if (!painel || !e.target.classList?.contains('rico-mat-fonte')) return;
    painel.codigo = e.target.value;
    atualizarSaidaDaFormula();
  });
  document.addEventListener('keydown', e => {
    if (!painel || !e.target.classList?.contains('rico-mat-fonte')) return;
    if (e.key === 'Escape') { e.preventDefault(); fecharPainelFormula(); }
    if (e.key === 'Enter' && !erroDaFormula(painel.codigo)) { e.preventDefault(); aplicarFormula(avisar); }
  });

  document.addEventListener('keydown', e => {
    const area = e.target.closest?.('[data-rico-campo]');
    if (!area) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      anotarSelecao();
      fecharPainelFormula();
      abrirPainelFormula(area);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && 'biu'.includes(e.key.toLowerCase())) {
      desligarStyleWithCSS();   // o atalho do navegador também produziria <span style>
      return;
    }
    // No corpo em prosa, Enter abre parágrafo e Shift+Enter quebra a linha
    // dentro dele — a inversão do padrão de editor de texto é proposital: no
    // texto-base do PAS o parágrafo é a unidade, e a quebra solta é a exceção.
    // Nos demais campos, Enter continua sendo quebra de linha simples.
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      const emProsa = !!area.dataset.ricoParagrafos;
      if (!emProsa && e.shiftKey) return;    // deixa o navegador cuidar
      e.preventDefault();
      quebrarLinha(emProsa && !e.shiftKey ? 2 : 1);
      avisar(area);
    }
  });
}

// Quebra de linha explícita: `insertLineBreak` não existe em todo navegador, e
// o Enter nativo cria <div>, que `limpar()` desembrulharia — a quebra sumiria.
//
// A quebra entra como "\n" e não como <br> montado à mão. A área é
// `white-space: pre-wrap`, então o "\n" já aparece como quebra na tela, e
// `quebrasEmBr()` o converte em <br> na hora de guardar — o mesmo caminho por
// onde passa o texto colado de fora, que é código já rodado. <br> à mão exigia
// um sobressalente à frente do cursor para ele ter onde descer, e o Chrome
// COMIA esse sobressalente ao receber o primeiro caractere digitado: com duas
// quebras seguidas sobrava uma só, e o parágrafo novo virava continuação do
// anterior — exatamente o que os professores relataram não conseguir fazer.
//
// `quantas = 2` deixa uma linha em branco atrás do cursor, que é como o
// texto-base separa parágrafo (ver `htmlCorpoTexto` em js/app.js).
function quebrarLinha(quantas = 1) {
  document.execCommand('insertText', false, '\n'.repeat(Math.max(1, quantas)));
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
  valorDoEditor,       // o que uma área editável vale agora, já podado
  fecharPainelFormula, // fechado quando quem hospeda o editor é remontado
  erroDaFormula,       // “o KaTeX aceita este código?” — null quando sim
  OPCOES_KATEX         // exportado para ficar auditável de fora
};
