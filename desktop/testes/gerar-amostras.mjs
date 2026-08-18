/* Gera as amostras com que o leitor é testado: o gabarito JSON e os PDFs dos
 * cartões, saídos do sistema web de verdade.
 *
 * Não é simulação. O Chromium abre o site como quem trabalha nele, entra em
 * “usar sem conexão”, exporta o gabarito pelo botão da tela de Cartões e manda
 * imprimir os cartões — e o PDF que sai daqui é o mesmo que sai da impressora
 * da escola. Um leitor testado contra um cartão desenhado à mão do lado de cá
 * passaria no teste e falharia no papel.
 *
 * Uso:  node desktop/testes/gerar-amostras.mjs [pasta-de-saida]
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// O Playwright pode estar instalado ao lado ou global. Módulo ES não olha o
// NODE_PATH sozinho, então a busca é explícita — e a mensagem, se falhar, diz o
// que fazer em vez de despejar um rastro de pilha.
const exigir = createRequire(import.meta.url);
function carregarPlaywright() {
  const globais = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
  for (const onde of ['playwright', ...globais.map(d => path.join(d, 'playwright'))]) {
    try { return exigir(onde); } catch { /* tenta o próximo */ }
  }
  throw new Error('Playwright não encontrado — instale com `npm i playwright` ou aponte NODE_PATH para a instalação global.');
}
const { chromium } = carregarPlaywright();

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARGUMENTOS = process.argv.slice(2);
const GRANDE = ARGUMENTOS.includes('--grande');
const SAIDA = path.resolve(ARGUMENTOS.find(a => !a.startsWith('--')) ||
  path.join(RAIZ, GRANDE ? 'desktop/testes/amostras-grande' : 'desktop/testes/amostras'));

const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.svg': 'image/svg+xml'
};

function servir(raiz) {
  const servidor = createServer(async (req, res) => {
    const caminho = decodeURIComponent(req.url.split('?')[0]);
    const alvo = path.join(raiz, caminho === '/' ? 'index.html' : caminho);
    if (!alvo.startsWith(raiz)) { res.writeHead(403).end(); return; }
    try {
      const corpo = await readFile(alvo);
      res.writeHead(200, { 'content-type': TIPOS_MIME[path.extname(alvo)] || 'application/octet-stream' });
      res.end(corpo);
    } catch { res.writeHead(404).end('não encontrado'); }
  });
  return new Promise(ok => servidor.listen(0, '127.0.0.1', () => ok({ servidor, porta: servidor.address().port })));
}

const { servidor, porta } = await servir(RAIZ);
fs.mkdirSync(SAIDA, { recursive: true });

// O binário do ambiente, quando existe: PLAYWRIGHT_BROWSERS_PATH guarda versões
// numeradas (chromium-1194), e apontar direto evita baixar navegador de novo.
function chromiumDoAmbiente() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !fs.existsSync(base)) return undefined;
  const pasta = fs.readdirSync(base).filter(d => d.startsWith('chromium-')).sort().pop();
  const bin = pasta && path.join(base, pasta, 'chrome-linux', 'chrome');
  return bin && fs.existsSync(bin) ? bin : undefined;
}
const navegador = await chromium.launch({ executablePath: chromiumDoAmbiente() });
const pagina = await navegador.newPage({ viewport: { width: 1400, height: 1000 } });
pagina.on('pageerror', e => console.error('ERRO NA PÁGINA:', e.message));

await pagina.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'networkidle' });
// “usar sem conexão”: o sistema roda inteiro no navegador, com os dados de
// exemplo. Dispensa credencial e cobre toda a lógica de tela.
await pagina.getByText('usar sem conexão').click();
await pagina.waitForSelector('#nav a', { timeout: 15000 });

/* Com `--grande`, a prova de exemplo é inflada até o tamanho de uma prova de
   verdade — 42 itens e 32 estudantes. Não é capricho de teste: é só nesse
   tamanho que aparecem as folhas objetivas de continuação, a coluna dupla dos
   itens do tipo B e o lote de ~100 folhas em que o tempo de leitura importa. Um
   leitor aprovado em prova de 5 itens não foi testado no que a escola imprime.

   O estado entra pelo localStorage, que é o depósito do modo “usar sem
   conexão” — o mesmo caminho que o CLAUDE.md recomenda para testar caso de
   dado sem precisar de credencial. */
if (GRANDE) {
  await pagina.evaluate(() => {
    const CHAVE = 'pas-marista-mvp-v1';
    const s = JSON.parse(localStorage.getItem(CHAVE));
    const modelos = s.itens.filter(i => i.status === 'aprovado');
    const molde = t => modelos.find(i => i.tipo === t) || modelos[0];
    // 28 do tipo A, 8 do C, 5 do B e 1 do D — a mistura de uma prova do PAS.
    const receita = [...Array(28).fill('A'), ...Array(8).fill('C'), ...Array(5).fill('B'), 'D'];
    s.itens = receita.map((tipo, n) => ({
      ...JSON.parse(JSON.stringify(molde(tipo))),
      id: `itg${n + 1}`, tipo, status: 'aprovado',
      // Dois terços entram também na adaptada; o resto é só da regular.
      versao: n % 3 === 2 ? 'regular' : 'ambas',
      gabarito: tipo === 'A' ? 'CE'[n % 2] : tipo === 'C' ? 'ABCD'[n % 4]
        : tipo === 'B' ? String((n * 137) % 1000).padStart(3, '0') : molde('D').gabarito,
      dLinhas: tipo === 'D' ? 8 : undefined
    }));
    const serie = s.provas.find(p => p.id === s.provaAtiva).serie;
    s.estudantes = Array.from({ length: 32 }, (_, n) => ({
      id: `eg${n + 1}`, nome: `Estudante de Teste ${String(n + 1).padStart(2, '0')}`,
      matricula: `2026-${String(1001 + n)}`, turma: `1ª ${'ABCD'[n % 4]}`, serie,
      versao: n % 11 === 5 ? 'adaptada' : 'regular'
    }));
    s.elencos = {};
    localStorage.setItem(CHAVE, JSON.stringify(s));
  });
  await pagina.reload({ waitUntil: 'networkidle' });
  const entrada = pagina.getByText('usar sem conexão');
  if (await entrada.count()) await entrada.click();
  await pagina.waitForSelector('#nav a', { timeout: 15000 });
}

await pagina.evaluate(() => { location.hash = '#/cartoes'; });
await pagina.waitForSelector('.cr-folha', { timeout: 30000 });

// 1. O gabarito, pelo mesmo botão que a coordenação usa.
const baixando = pagina.waitForEvent('download');
await pagina.getByRole('button', { name: /Exportar gabarito/ }).click();
const baixado = await baixando;
const gabarito = path.join(SAIDA, 'gabarito.json');
await baixado.saveAs(gabarito);
const g = JSON.parse(await readFile(gabarito, 'utf-8'));
console.log(`gabarito ${g.formato} · ${g.prova.serie}`);
if (!g.layout) throw new Error('o gabarito saiu sem a geometria (layout) — o leitor não teria molde');

// 2. Os cartões impressos. `window.print()` não abre diálogo aqui; o conteúdo
//    fica em #print-area e o PDF sai com a MESMA folha de estilo de impressão.
await pagina.evaluate(() => { window.print = () => {}; });
await pagina.getByRole('button', { name: /Imprimir cartões/ }).click();
await pagina.waitForFunction(() => document.querySelector('#print-area .cr-folha'));
const nFolhas = await pagina.locator('#print-area .cr-folha').count();
const cartoes = path.join(SAIDA, 'cartoes.pdf');
await pagina.pdf({ path: cartoes, format: 'A4', printBackground: true, preferCSSPageSize: true });

// A verdade conhecida do lote: folha por folha, o que está impresso — a
// identificação do rodapé e os alvéolos preenchidos. É contra isto que o teste
// cobra o leitor, e não contra o que o leitor achou de si mesmo.
const verdade = await pagina.evaluate(() => [...document.querySelectorAll('#print-area .cr-folha')]
  .map(f => ({
    faixa: f.querySelector('.cr-faixa')?.textContent || '',
    matricula: f.querySelector('[data-campo="matricula"] b')?.textContent || '',
    codigo: [...f.querySelectorAll('.cr-codigo i')].map(c => (c.classList.contains('c') ? 1 : 0)).join(''),
    marcados: [...f.querySelectorAll('.bolha.m[data-alv]')].map(b => b.dataset.alv)
  })));
fs.writeFileSync(path.join(SAIDA, 'verdade.json'), JSON.stringify(verdade, null, 2));

// 3. E os extras, que são o outro molde (grade da matrícula no alto).
await pagina.getByRole('button', { name: /Cartões extras/ }).click();
await pagina.waitForSelector('#dlg[open]');
await pagina.fill('#ex-qtd', '2');
await pagina.click('[data-acao="cart-extras-imprimir"]');
await pagina.waitForFunction(() => document.querySelectorAll('#print-area .cr-folha').length > 0);
const nExtras = await pagina.locator('#print-area .cr-folha').count();
const extras = path.join(SAIDA, 'cartoes-extras.pdf');
await pagina.pdf({ path: extras, format: 'A4', printBackground: true, preferCSSPageSize: true });

/* E os extras PREENCHIDOS. Esta é a única folha em que a matrícula não vem da
   faixa do rodapé — a faixa do extra sai sem matrícula, porque no momento da
   impressão não se sabe de quem ele vai ser. Quem a informa é o estudante, na
   grade de alvéolos do alto, e é o OMR que a lê. Caminho diferente, teste
   próprio: se ele falhar, o cartão de reserva vira papel que ninguém lança. */
const verdadeExtras = await pagina.evaluate(() => {
  const folhas = [...document.querySelectorAll('#print-area .cr-folha')];
  const marca = (f, seletor) => { const el = f.querySelector(seletor); if (el) el.classList.add('m'); return !!el; };
  const verdade = [];
  let ordem = 0;
  for (const f of folhas) {
    const grade = f.querySelectorAll('.bolha[data-alv^="m:"]');
    if (!grade.length) continue;                       // folha sem grade: redação, discursiva
    const matricula = `2026${String(3001 + ordem)}`;   // 8 algarismos, como os do elenco
    ordem++;
    [...matricula].forEach((d, pos) => marca(f, `.bolha[data-alv="m:${pos}:${d}"]`));

    const respostas = [];
    for (const alv of f.querySelectorAll('.bolha[data-alv^="i:"]')) {
      const [, item, valor] = alv.dataset.alv.split(':');
      if (respostas.some(r => r.item === +item)) continue;
      alv.classList.add('m');                          // sempre a primeira opção do item
      respostas.push({ item: +item, resposta: valor });
    }
    verdade.push({ matricula, respostas });
  }
  return verdade;
});
fs.writeFileSync(path.join(SAIDA, 'verdade-extras.json'), JSON.stringify(verdadeExtras, null, 2));
const extrasPreenchidos = path.join(SAIDA, 'cartoes-extras-preenchidos.pdf');
await pagina.pdf({ path: extrasPreenchidos, format: 'A4', printBackground: true, preferCSSPageSize: true });
console.log(`extras preenchidos: ${verdadeExtras.length} cartão(ões) com matrícula em alvéolos`);

/* 5. E o lote PREENCHIDO — o que o teste do leitor precisa de verdade.
      Cartão em branco só prova que o leitor não inventa resposta; para saber se
      ele acerta as que existem, é preciso um lote com marcações conhecidas.
      As marcas entram na mesma classe `.bolha.m` que o cartão-gabarito usa, ou
      seja, com a MESMA tinta que sai da impressora — e três folhas recebem, de
      propósito, os casos difíceis: dupla marcação, item em branco e tipo B com
      uma coluna faltando. Se o leitor os transformar em resposta, o teste falha,
      que é exatamente o que se quer dele. */
await pagina.getByRole('button', { name: /Imprimir cartões/ }).click();
await pagina.waitForFunction(() => document.querySelector('#print-area .cr-folha'));
const marcado = await pagina.evaluate(() => {
  // Sorteio determinístico: a mesma matrícula e o mesmo item dão sempre a mesma
  // resposta, então o teste é reprodutível sem guardar semente em lugar nenhum.
  const semente = t => { let h = 2166136261; for (const c of t) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const sorteio = t => { let a = semente(t); return () => { a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };

  const verdade = [], esperados = [], anomalias = [];
  const folhas = [...document.querySelectorAll('#print-area .cr-folha')];
  let nominais = 0;
  for (const f of folhas) {
    const mat = (f.querySelector('[data-campo="matricula"] b')?.textContent || '').trim();
    if (!mat) continue;                       // cartão-gabarito: fica como está
    const ordem = nominais;
    if (f.querySelector('.cr-corpo')) nominais++;

    const porItem = new Map();
    for (const b of f.querySelectorAll('.bolha[data-alv]')) {
      const [forma, item, ...resto] = b.dataset.alv.split(':');
      if (forma !== 'i' && forma !== 'b') continue;
      const chave = `${forma}:${item}`;
      if (!porItem.has(chave)) porItem.set(chave, []);
      porItem.get(chave).push({ el: b, resto });
    }
    for (const [chave, alveolos] of porItem) {
      const [forma, item] = chave.split(':');
      const r = sorteio(`${mat}/${item}`);
      // Um caso difícil por folha nominal, nos três primeiros itens de folhas
      // diferentes — assim o teste cobre os três desfechos de recusa.
      const dificil = ordem % 5 === 1 && item === '1' ? 'dupla'
        : ordem % 5 === 2 && item === '1' ? 'branco'
        : ordem % 5 === 3 && forma === 'b' ? 'meio' : null;
      if (dificil === 'branco') { anomalias.push({ mat, item: +item, caso: 'branco' }); continue; }

      if (forma === 'i') {
        const opcoes = alveolos.map(a => a.resto[0]);
        const escolha = opcoes[Math.floor(r() * opcoes.length)];
        alveolos.find(a => a.resto[0] === escolha).el.classList.add('m');
        if (dificil === 'dupla') {
          alveolos.find(a => a.resto[0] !== escolha).el.classList.add('m');
          anomalias.push({ mat, item: +item, caso: 'dupla' });
        } else {
          verdade.push({ mat, item: +item, resposta: escolha });
        }
      } else {
        const numero = String(Math.floor(r() * 1000)).padStart(3, '0');
        const colunas = dificil === 'meio' ? ['C', 'D'] : ['C', 'D', 'U'];
        colunas.forEach((c, i) => {
          const alvo = alveolos.find(a => a.resto[0] === c && a.resto[1] === numero[i]);
          if (alvo) alvo.el.classList.add('m');
        });
        if (dificil === 'meio') anomalias.push({ mat, item: +item, caso: 'tipo_b_incompleto' });
        else verdade.push({ mat, item: +item, resposta: numero });
      }
      esperados.push(chave);
    }
  }
  return { verdade, anomalias };
});
fs.writeFileSync(path.join(SAIDA, 'verdade-preenchidos.json'), JSON.stringify(marcado, null, 2));
const preenchidos = path.join(SAIDA, 'cartoes-preenchidos.pdf');
await pagina.pdf({ path: preenchidos, format: 'A4', printBackground: true, preferCSSPageSize: true });
console.log(`preenchidos: ${marcado.verdade.length} marcação(ões) e ${marcado.anomalias.length} caso(s) difícil(eis) em ${preenchidos}`);

await navegador.close();
servidor.close();
console.log(`cartões: ${nFolhas} folha(s) em ${cartoes}`);
console.log(`extras:  ${nExtras} folha(s) em ${extras}`);
