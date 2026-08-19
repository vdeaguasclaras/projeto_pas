/* Faz o SISTEMA ON-LINE corrigir um conjunto de marcações, e devolve as notas.
 *
 * Existe para uma coisa só: provar que a correção do aplicativo local e a do
 * sistema on-line dão o mesmo resultado. O escore passou a ser calculado nos
 * dois lados, e duas implementações da mesma regra divergem em silêncio — a
 * tabela de pesos viajar no pacote reduz o risco, mas não o elimina, porque a
 * FORMA da conta continua escrita duas vezes.
 *
 * Para a comparação ser honesta, os dois lados precisam ver exatamente as mesmas
 * marcações. Por isso este roteiro APAGA as marcações que os dados de exemplo já
 * traziam antes de importar o CSV do leitor — e preserva as notas do discursivo
 * e da redação, que não vêm do cartão e viajam no pacote.
 *
 * Uso:  node notas-do-sistema.mjs <respostas.csv> <saida.csv>
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exigir = createRequire(import.meta.url);
function carregarPlaywright() {
  const globais = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
  for (const onde of ['playwright', ...globais.map(d => path.join(d, 'playwright'))]) {
    try { return exigir(onde); } catch { /* tenta o próximo */ }
  }
  throw new Error('Playwright não encontrado — instale com `npm i playwright`.');
}
const { chromium } = carregarPlaywright();

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [ENTRADA, SAIDA] = process.argv.slice(2);
if (!ENTRADA || !SAIDA) { console.error('uso: node notas-do-sistema.mjs <respostas.csv> <saida.csv>'); process.exit(2); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.woff2': 'font/woff2' };
const servidor = createServer(async (req, res) => {
  const caminho = decodeURIComponent(req.url.split('?')[0]);
  const alvo = path.join(RAIZ, caminho === '/' ? 'index.html' : caminho);
  if (!alvo.startsWith(RAIZ)) { res.writeHead(403).end(); return; }
  try {
    const corpo = await readFile(alvo);
    res.writeHead(200, { 'content-type': MIME[path.extname(alvo)] || 'application/octet-stream' });
    res.end(corpo);
  } catch { res.writeHead(404).end(); }
});
const porta = await new Promise(ok => servidor.listen(0, '127.0.0.1', () => ok(servidor.address().port)));

function chromiumDoAmbiente() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !fs.existsSync(base)) return undefined;
  const pasta = fs.readdirSync(base).filter(d => d.startsWith('chromium-')).sort().pop();
  const bin = pasta && path.join(base, pasta, 'chrome-linux', 'chrome');
  return bin && fs.existsSync(bin) ? bin : undefined;
}

const navegador = await chromium.launch({ executablePath: chromiumDoAmbiente() });
const pagina = await navegador.newPage();
const erros = [];
pagina.on('pageerror', e => erros.push(e.message));

await pagina.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'networkidle' });
await pagina.getByText('usar sem conexão').click();
await pagina.waitForSelector('#nav a');

// Zera só as MARCAÇÕES: as notas do discursivo e da redação continuam, porque é
// isso que o pacote leva para o aplicativo local, e os dois lados têm de partir
// exatamente do mesmo estado.
await pagina.evaluate(() => {
  const CHAVE = 'pas-marista-mvp-v1';
  const s = JSON.parse(localStorage.getItem(CHAVE));
  for (const porEstudante of Object.values(s.respostas || {}))
    for (const r of Object.values(porEstudante)) r.marcacoes = {};
  localStorage.setItem(CHAVE, JSON.stringify(s));
});
await pagina.reload({ waitUntil: 'networkidle' });
const entrada = pagina.getByText('usar sem conexão');
if (await entrada.count()) await entrada.click();
await pagina.waitForSelector('#nav a');

await pagina.evaluate(() => { location.hash = '#/correcao'; });
await pagina.waitForTimeout(500);

const csv = fs.readFileSync(ENTRADA, 'utf-8').split('\n').slice(1).join('\n');
await pagina.click('[data-acao="resp-importar"]');
await pagina.waitForSelector('#imp-resp');
await pagina.fill('#imp-resp', csv);
await pagina.click('[data-acao="resp-importar-ok"]');
await pagina.waitForTimeout(500);

const baixando = pagina.waitForEvent('download');
await pagina.click('[data-acao="notas-exportar"]');
await (await baixando).saveAs(SAIDA);

await navegador.close();
servidor.close();
if (erros.length) { console.error('ERROS NA PÁGINA:', erros); process.exit(1); }
console.log(`notas do sistema on-line em ${SAIDA}`);
