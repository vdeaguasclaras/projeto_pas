// Imagens em texto-base e em item: infográfico, mapa, obra de arte, figura de
// geometria, estrutura química.
//
// ONDE A IMAGEM FICA
//
// Não dentro do `dados` jsonb. Uma imagem de 300 kB viraria ~400 kB de base64
// numa linha lida a cada carregamento de tela; com vinte textos ilustrados a
// abertura do sistema passaria de dezenas de megabytes. O `dados` guarda a
// referência, as dimensões e a legenda — nunca os bytes.
//
// Duas origens, porque o sistema roda de dois modos:
//
//   { origem:'nuvem',    caminho, largura, altura, mime, legenda, fonte, escala }
//   { origem:'embutida', dados,   largura, altura, mime, legenda, fonte, escala }
//
// `nuvem` é o caminho no bucket privado `imagens`, e é o que a escola usa.
// `embutida` é data URI e só existe em “usar sem conexão”, para a demonstração
// funcionar — com teto de tamanho apertado, porque ali o depósito é o
// localStorage do navegador.
//
// POR QUE AS DIMENSÕES SÃO GRAVADAS
//
// A paginação do caderno mede a altura de cada bloco numa régua **síncrona**
// (`medirPecas` em js/app.js). Uma `<img>` cujos bytes ainda não chegaram mede
// zero, e a página quebraria no lugar errado — erro que só apareceria no papel.
// Com largura e altura gravadas, a figura ocupa o espaço certo desde o primeiro
// quadro, sem esperar carregamento e sem sobressalto de layout.

import { nuvem } from './nuvem.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- limites ---------------- */
// O mesmo teto do bucket (migração 0011). Conferido aqui também para a pessoa
// saber antes de esperar o envio inteiro.
const LIMITE_NUVEM = 5 * 1024 * 1024;
// Sem nuvem o depósito é o localStorage, com uns 5 MB para tudo — estado
// incluso. Teto bem menor, e dito na tela.
const LIMITE_EMBUTIDA = 400 * 1024;

const MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const EXTENSAO = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

// Quanto da largura da coluna a figura ocupa. Figura de geometria raramente
// precisa da coluna inteira, e esticá-la só rouba espaço do texto.
const ESCALAS = [
  { v: 100, rot: '100% — largura da coluna' },
  { v: 75,  rot: '75%' },
  { v: 50,  rot: '50% — meia coluna' },
  { v: 33,  rot: '33% — um terço' }
];
const ESCALA_PADRAO = 100;

const kb = n => `${Math.round(n / 1024)} kB`;

/* ---------------- ler o arquivo escolhido ---------------- */
// Descobre as dimensões antes de gravar qualquer coisa. Falha cedo e com motivo:
// arquivo que não é imagem, imagem corrompida ou grande demais não deve chegar
// ao banco para ser descoberto na hora de imprimir.
function lerArquivo(arquivo, limite) {
  return new Promise((cumprir, recusar) => {
    if (!MIMES.includes(arquivo.type))
      return recusar(new Error(`Formato não aceito (${arquivo.type || 'desconhecido'}). Use PNG, JPEG, WEBP ou SVG.`));
    if (arquivo.size > limite)
      return recusar(new Error(`A imagem tem ${kb(arquivo.size)} e o limite é ${kb(limite)}. Reduza antes de enviar.`));

    const leitor = new FileReader();
    leitor.onerror = () => recusar(new Error('Não foi possível ler o arquivo.'));
    leitor.onload = () => {
      const dataUri = String(leitor.result);
      const img = new Image();
      img.onerror = () => recusar(new Error('O arquivo não é uma imagem que o navegador saiba abrir.'));
      img.onload = () => {
        // SVG sem width/height intrínsecos reporta 0: cai numa medida de
        // trabalho, e a escala em porcentagem da coluna resolve o resto.
        const largura = img.naturalWidth || 600;
        const altura = img.naturalHeight || 400;
        cumprir({ dataUri, largura, altura, mime: arquivo.type, bytes: arquivo.size });
      };
      img.src = dataUri;
    };
    leitor.readAsDataURL(arquivo);
  });
}

/* ---------------- guardar ---------------- */
// `dono` é só para o caminho ficar legível no bucket (prova/texto ou prova/item).
async function guardarImagem(arquivo, { modoNuvem, provaId, dono, uid }) {
  const limite = modoNuvem ? LIMITE_NUVEM : LIMITE_EMBUTIDA;
  const lido = await lerArquivo(arquivo, limite);
  const comum = {
    largura: lido.largura, altura: lido.altura, mime: lido.mime,
    legenda: '', fonte: '', escala: ESCALA_PADRAO
  };
  if (!modoNuvem)
    return { origem: 'embutida', dados: lido.dataUri, ...comum };

  const caminho = `${provaId || 'sem-prova'}/${dono || 'geral'}/${uid()}.${EXTENSAO[lido.mime] || 'bin'}`;
  await nuvem.enviarImagem(caminho, arquivo);
  return { origem: 'nuvem', caminho, ...comum };
}

async function descartarImagem(img) {
  if (img?.origem === 'nuvem' && img.caminho) {
    try { await nuvem.apagarImagem(img.caminho); }
    catch (e) {
      // O registro já saiu do texto; o arquivo órfão no bucket é lixo, não
      // perda de dado. Não vale travar a edição por causa dele.
      console.warn('imagem não apagada do bucket:', img.caminho, e.message || e);
    }
  }
}

/* ---------------- exibir ---------------- */
// As URLs assinadas expiram; o cache é da sessão e vale para a tela e para a
// impressão. Chave = caminho no bucket.
const assinadas = new Map();

const ehImagem = i => !!i && (i.origem === 'embutida' ? !!i.dados : !!i.caminho);
const todasAsImagens = lista => (Array.isArray(lista) ? lista : []).filter(ehImagem);

// Resolve o endereço de todas as imagens de uma lista e espera os bytes
// chegarem. Chamado ANTES de montar o caderno: paginar com imagem pela metade
// dá quebra errada, e imprimir com imagem faltando dá folha em branco.
async function prepararImagens(listas) {
  const imgs = listas.flatMap(todasAsImagens);
  const faltando = [...new Set(imgs
    .filter(i => i.origem === 'nuvem' && !assinadas.has(i.caminho))
    .map(i => i.caminho))];

  if (faltando.length) {
    try {
      const mapa = await nuvem.assinarImagens(faltando);
      for (const [caminho, url] of Object.entries(mapa)) assinadas.set(caminho, url);
    } catch (e) {
      console.warn('não foi possível assinar imagens:', e.message || e);
    }
  }

  // Pré-carrega, para a impressão não sair com quadro vazio. Um erro numa
  // imagem não pode impedir o caderno de sair.
  await Promise.all(imgs.map(i => new Promise(pronto => {
    const src = enderecoDaImagem(i);
    if (!src) return pronto();
    const el = new Image();
    el.onload = el.onerror = () => pronto();
    el.src = src;
  })));
}

function enderecoDaImagem(img) {
  if (!ehImagem(img)) return '';
  if (img.origem === 'embutida') return img.dados;
  return assinadas.get(img.caminho) || '';
}

/* ---------------- desenhar ---------------- */
// `larguraColuna` em pt: 266,05 no miolo do caderno, 541,1 na coluna única da
// redação. A figura nunca passa da coluna, e a altura vem da proporção gravada
// — é o que faz a régua medir certo antes de a imagem chegar.
function htmlImagem(img, larguraColuna, { previa = false } = {}) {
  if (!ehImagem(img)) return '';
  const escala = Math.max(10, Math.min(100, Number(img.escala) || ESCALA_PADRAO));
  const larg = larguraColuna * escala / 100;
  const alt = img.largura > 0 ? larg * (img.altura / img.largura) : larg * 0.66;
  const src = enderecoDaImagem(img);
  const rotulo = img.legenda?.trim() || '';
  const fonte = img.fonte?.trim() || '';
  return `
  <figure class="pas-fig${previa ? ' previa' : ''}" style="width:${larg.toFixed(2)}pt">
    ${src
      ? `<img src="${esc(src)}" alt="${esc(rotulo || 'figura do texto')}"
           style="width:${larg.toFixed(2)}pt;height:${alt.toFixed(2)}pt">`
      : `<div class="pas-fig-ausente" style="width:${larg.toFixed(2)}pt;height:${alt.toFixed(2)}pt">
           imagem indisponível</div>`}
    ${rotulo ? `<figcaption>${esc(rotulo)}</figcaption>` : ''}
    ${fonte ? `<figcaption class="pas-fig-fonte">${esc(fonte)}</figcaption>` : ''}
  </figure>`;
}

const htmlImagens = (lista, larguraColuna, opcoes) =>
  pecasDeImagens(lista, larguraColuna, opcoes).join('');

// Uma peça por figura, para a paginação do caderno: assim a figura pode mudar
// de coluna sozinha, em vez de arrastar o texto inteiro, e a régua mede a
// altura de cada uma isolada.
const pecasDeImagens = (lista, larguraColuna, opcoes) =>
  todasAsImagens(lista).map(i => htmlImagem(i, larguraColuna, opcoes));

/* ---------------- editar ---------------- */
// A tira de miniaturas que aparece no formulário do texto-base e do item.
function htmlEditorImagens(lista, { campo, modoNuvem }) {
  const imgs = todasAsImagens(lista);
  const cartoes = imgs.map((img, i) => {
    const src = enderecoDaImagem(img);
    const ops = ESCALAS.map(e =>
      `<option value="${e.v}" ${Number(img.escala || ESCALA_PADRAO) === e.v ? 'selected' : ''}>${esc(e.rot)}</option>`).join('');
    return `
    <div class="img-cartao">
      <div class="img-mini">${src
        ? `<img src="${esc(src)}" alt="">`
        : '<span>sem prévia</span>'}</div>
      <div class="img-campos">
        <input class="caixa" placeholder="legenda (opcional)" value="${esc(img.legenda || '')}"
          data-mud="img-legenda" data-campo="${esc(campo)}" data-i="${i}" aria-label="Legenda da figura ${i + 1}">
        <input class="caixa" placeholder="fonte (opcional)" value="${esc(img.fonte || '')}"
          data-mud="img-fonte" data-campo="${esc(campo)}" data-i="${i}" aria-label="Fonte da figura ${i + 1}">
        <div class="img-linha">
          <select class="caixa" data-mud="img-escala" data-campo="${esc(campo)}" data-i="${i}"
            aria-label="Tamanho da figura ${i + 1}">${ops}</select>
          <span class="img-dim">${img.largura}×${img.altura}</span>
          <button type="button" class="btn mini vermelho fantasma"
            data-acao="img-remover" data-campo="${esc(campo)}" data-i="${i}">Remover</button>
        </div>
      </div>
    </div>`;
  }).join('');

  const teto = modoNuvem ? LIMITE_NUVEM : LIMITE_EMBUTIDA;
  return `
  <div class="img-bloco">
    ${cartoes || '<p class="img-vazio">Nenhuma figura.</p>'}
    <label class="btn fantasma img-add">
      + Figura
      <input type="file" accept="${MIMES.join(',')}" hidden
        data-mud="img-arquivo" data-campo="${esc(campo)}">
    </label>
    <p class="img-nota">PNG, JPEG, WEBP ou SVG, até ${kb(teto)}.${modoNuvem
      ? ' A figura fica no banco da escola e só quem está na equipe consegue abri-la.'
      : ' <b>Sem conexão</b> a figura fica neste navegador e conta no espaço dele — no banco da escola o limite é bem maior.'}</p>
  </div>`;
}

export {
  ESCALAS, ESCALA_PADRAO, LIMITE_NUVEM, LIMITE_EMBUTIDA, MIMES,
  guardarImagem, descartarImagem, prepararImagens, enderecoDaImagem,
  ehImagem, todasAsImagens, htmlImagem, htmlImagens, pecasDeImagens, htmlEditorImagens
};
