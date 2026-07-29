// Sistema PAS Marista — SPA sem build (fases 1 e 2 do plano de implantação).
// Estado em memória (S) com cache em localStorage; quando o modo nuvem está
// configurado (js/config-supabase.js), o Supabase é a fonte de verdade e cada
// mutação é sincronizada por linha através do facade PERS.
import { NUVEM } from './config-supabase.js';
import {
  COMPONENTES, TODOS_COMPONENTES, ehComponenteLegado, SUCESSORAS_DE_ARTES,
  GRUPOS, TIPOS, STATUS_ITEM, SERIES, VERSAO_ESTADO,
  uid, blank, seed, load, save, substituir, provaNova, migrarDeV1, migrarV2paraV3
} from './dados.js';
import { nuvem } from './nuvem.js';
import { limpar } from './limpar.js';
import {
  carregarKatex, rico, simples, vazio as ricoVazio, editorRico, ligarEditoresRicos
} from './rico.js';
import { lerLinhasEstudantes } from './planilha.js';

let S = load();
let modoNuvem = false;

/* ---------------- utilidades ---------------- */
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, casas = 2) => (v === null || v === undefined || Number.isNaN(v)) ? '—' : Number(v).toFixed(casas).replace('.', ',');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast._tm);
  toast._tm = setTimeout(() => t.classList.remove('on'), 2600);
}

function agora() {
  const d = new Date();
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ', ' +
         d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
}

function dataBR(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function baixar(nome, conteudo, tipo = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}

function commit() { save(S); render(); }

/* ---------------- tema claro/escuro ---------------- */
function temaAtual() {
  return document.documentElement.dataset.theme ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
(function aplicarTemaSalvo() {
  try {
    const t = localStorage.getItem('pas-tema');
    if (t) document.documentElement.dataset.theme = t;
  } catch { /* sem preferência salva */ }
})();
function botaoTema() {
  return `<button class="tema-btn" data-acao="tema" title="Alternar tema claro/escuro">${temaAtual() === 'dark' ? '☀️' : '🌙'}</button>`;
}

/* ---------------- sincronização com a nuvem ---------------- */
// Cada mutação local chama o método correspondente; em modo local tudo é no-op.
const PERS = {
  falha: e => toast('⚠ Falha ao sincronizar com a nuvem: ' + (e?.message || e)),
  prova(p) { if (modoNuvem) nuvem.gravarLinha('provas', p).catch(PERS.falha); },
  provasTodas() { if (modoNuvem) nuvem.gravarLinhas('provas', S.provas).catch(PERS.falha); },
  elenco(provaId) {
    if (modoNuvem) nuvem.gravarElenco(provaId, S.elencos[provaId] || []).catch(PERS.falha);
  },
  alocacao(provaId, chave) {
    if (modoNuvem) nuvem.gravarAlocacao(provaId, chave, S.alocacoes[provaId]?.[chave]).catch(PERS.falha);
  },
  alocacoes(provaId) {
    if (modoNuvem) nuvem.gravarAlocacoes(provaId, S.alocacoes[provaId] || {}).catch(PERS.falha);
  },
  texto(t) { if (modoNuvem) nuvem.gravarLinha('textos', t).catch(PERS.falha); },
  textosTodos() { if (modoNuvem) nuvem.gravarLinhas('textos', S.textos).catch(PERS.falha); },
  removerTexto(id) { if (modoNuvem) nuvem.removerLinha('textos', id).catch(PERS.falha); },
  // A ordem gravada é a posição dentro da própria prova: um índice global
  // faria a numeração de uma prova depender de quantos itens as outras têm.
  ordemNaProva(i) { return S.itens.filter(x => x.provaId === i.provaId).findIndex(x => x.id === i.id); },
  item(i) {
    if (modoNuvem) nuvem.gravarLinha('itens',
      { ...i, ordem: PERS.ordemNaProva(i) }).catch(PERS.falha);
  },
  itens(ids) {
    if (!modoNuvem) return;
    const lista = ids.map(id => S.itens.find(x => x.id === id)).filter(Boolean)
      .map(i => ({ ...i, ordem: PERS.ordemNaProva(i) }));
    nuvem.gravarLinhas('itens', lista).catch(PERS.falha);
  },
  removerItem(id) { if (modoNuvem) nuvem.removerLinha('itens', id).catch(PERS.falha); },
  estudante(e) { if (modoNuvem) nuvem.gravarLinha('estudantes', e).catch(PERS.falha); },
  estudantesTodos() { if (modoNuvem) nuvem.gravarLinhas('estudantes', S.estudantes).catch(PERS.falha); },
  removerEstudante(id) { if (modoNuvem) nuvem.removerLinha('estudantes', id).catch(PERS.falha); },
  resposta(provaId, estId) {
    const r = S.respostas[provaId]?.[estId];
    if (modoNuvem && r) nuvem.gravarResposta(provaId, estId, r).catch(PERS.falha);
  },
  respostas(provaId, ids) {
    if (modoNuvem) nuvem.gravarRespostas(provaId, S.respostas[provaId] || {}, ids).catch(PERS.falha);
  },
  removerResposta(provaId, id) { if (modoNuvem) nuvem.removerResposta(provaId, id).catch(PERS.falha); },
  tudo() { if (modoNuvem) nuvem.substituirTudo(S).catch(PERS.falha); }
};

// Áreas do conhecimento — é por elas que a coordenação de área revisa.
const AREAS = {
  'Linguagens': ['Português', 'Literatura', 'Artes Visuais', 'Dança', 'Música', 'Teatro', 'Artes'],
  'Humanas': ['História', 'Geografia', 'Filosofia', 'Sociologia'],
  'Matemática': ['Matemática'],
  'Ciências da Natureza': ['Biologia', 'Física', 'Química'],
  'Inglês': ['Inglês']
};
const areaDoComponente = c => Object.keys(AREAS).find(a => AREAS[a].includes(c)) || null;

const ehCoord = () => S.perfil.papel === 'coordenacao';
const ehCoordArea = () => S.perfil.papel === 'coordenacao_area';
const ehRedacao = () => S.perfil.papel === 'redacao';
// Quem pode decidir a etapa “coord. de área” de um item: a coordenação geral
// ou quem coordena justamente a área do componente daquele item.
const revisaArea = item => ehCoord() ||
  (ehCoordArea() && !!S.perfil.area && areaDoComponente(item.componente) === S.perfil.area);
const nomePerfil = () => {
  if (S.perfil.papel === 'docente')
    return `Docente · ${S.perfil.nome}${S.perfil.componente ? ' (' + S.perfil.componente + ')' : ''}`;
  if (S.perfil.papel === 'coordenacao_area')
    return `Coord. de área · ${S.perfil.nome}${S.perfil.area ? ' (' + S.perfil.area + ')' : ''}`;
  if (S.perfil.papel === 'redacao') return `Redação · ${S.perfil.nome}`;
  return `Coordenação · ${S.perfil.nome}`;
};

// Aceita também o componente legado, para que quem ainda está em “Artes” não
// apareça sem cor nem nome pelo sistema.
const discChip = comp => `<span class="disc ${TODOS_COMPONENTES[comp] || 'd-soc'}">${esc(comp)}</span>`;

// Opções de componente. Só as atuais são oferecidas; se o registro que está
// sendo editado usa uma legada, ela entra na lista marcada — trocar é decisão
// de quem edita, não efeito colateral de abrir o formulário.
function opcoesComponente(atual) {
  const nomes = Object.keys(COMPONENTES);
  if (atual && !nomes.includes(atual)) nomes.push(atual);
  return nomes.sort((a, b) => a.localeCompare(b, 'pt-BR')).map(c =>
    `<option value="${esc(c)}" ${atual === c ? 'selected' : ''}>${esc(c)}${
      ehComponenteLegado(c) ? ' (a reclassificar)' : ''}</option>`).join('');
}

/* ---------------- prova ativa ---------------- */
// Qual prova está na tela é preferência de quem está usando, não estado
// compartilhado: guardar isso no banco faria a escolha de um coordenador mudar
// a tela do outro, e “zerar tudo” apagaria a escolha de todo mundo.
const CHAVE_PROVA = 'pas-prova-ativa';

function lerProvaSalva() {
  try { return localStorage.getItem(CHAVE_PROVA); } catch { return null; }
}
function salvarProvaAtiva(id) {
  try { localStorage.setItem(CHAVE_PROVA, id); } catch { /* segue sem lembrar */ }
}

// Quantidade de questões de uma versão da prova. Aceita os dois formatos: o
// atual, `{regular, adaptada}`, e o antigo, um número só — que era o tamanho da
// regular, a única definida na época. Devolve null quando não há número, e null
// é diferente de zero: "a definir" não é "nenhuma questão".
function totalDeQuestoes(prova, versao = 'regular') {
  const t = prova?.totalQuestoes;
  if (t == null) return null;
  if (typeof t === 'number') return versao === 'regular' ? t : null;
  const n = t[versao];
  return Number.isFinite(n) && n > 0 ? n : null;
}
// Normaliza para o formato atual, para gravar e para editar no formulário.
const questoesDaProva = p => ({
  regular: totalDeQuestoes(p, 'regular'),
  adaptada: totalDeQuestoes(p, 'adaptada')
});

const provasOrdenadas = () => (S.provas || []).slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

// Sempre devolve uma prova de verdade: se a salva sumiu (foi apagada, ou o
// banco mudou), cai na primeira em vez de deixar a tela sem chão.
function provaAtual() {
  const lista = provasOrdenadas();
  if (!lista.length) return null;
  return lista.find(p => p.id === S.provaAtiva) || lista[0];
}
const idProvaAtual = () => provaAtual()?.id || null;
const provaPorId = id => (S.provas || []).find(p => p.id === id) || null;
const rotuloProva = p => p ? `${p.serie} · ${p.etapa}` : '—';

/* ---------------- escopo ---------------- */
const textosDaProva = provaId => S.textos.filter(t => t.provaId === provaId);
const itensDaProva  = provaId => S.itens.filter(i => i.provaId === provaId);
const textoDe = item => S.textos.find(t => t.id === item.textoId);
const textosAprovados = (provaId = idProvaAtual()) =>
  textosDaProva(provaId).filter(t => t.status === 'aprovado').sort((a, b) => a.numero - b.numero);

// Elenco da prova. O vínculo é materializado (S.elencos); a série serve de
// palpite quando a prova ainda não teve o elenco montado.
function estudantesDaProva(provaId) {
  const elenco = S.elencos?.[provaId];
  if (elenco?.length) {
    const porId = new Map(S.estudantes.map(e => [e.id, e]));
    return elenco.map(id => porId.get(id)).filter(Boolean);
  }
  const p = provaPorId(provaId);
  return p ? S.estudantes.filter(e => e.serie === p.serie) : [];
}

// Recalcula o elenco a partir da série — usado ao importar a lista e ao criar
// uma prova. Não mexe em prova cuja data de aplicação já passou.
function sincronizarElenco(provaId) {
  const p = provaPorId(provaId);
  if (!p) return 0;
  const ids = S.estudantes.filter(e => e.serie === p.serie).map(e => e.id);
  S.elencos = S.elencos || {};
  S.elencos[provaId] = ids;
  return ids.length;
}

/* ---------------- montagem da prova ---------------- */
// Numeração contínua: itens aprovados da versão, na ordem dos textos aprovados.
// Dentro de cada texto os itens saem agrupados por tipo (A, B, C, D), como no
// PAS — é isso que faz o comando ficar contínuo (“julgue os itens de 11 a 19 e
// assinale a opção correta no item 20”). A ordem definida pela coordenação é
// preservada dentro de cada tipo.
const ORDEM_TIPO = { A: 0, B: 1, C: 2, D: 3 };

function prova(provaId, versao) {
  const lista = [];
  for (const t of textosAprovados(provaId)) {
    const doTexto = S.itens.filter(i => i.textoId === t.id && i.status === 'aprovado' &&
      (i.versao === versao || i.versao === 'ambas'));
    doTexto
      .map((item, ordem) => ({ item, ordem }))
      .sort((a, b) => (ORDEM_TIPO[a.item.tipo] ?? 9) - (ORDEM_TIPO[b.item.tipo] ?? 9) || a.ordem - b.ordem)
      .forEach(({ item }) => lista.push({ item, texto: t }));
  }
  return lista.map((e, i) => ({ ...e, numero: i + 1 }));
}

/* ---------------- correção ---------------- */
// Pontuação (simplificação documentada — calibrável na fase de fidelidade):
// A: certo +1 / errado −1 · B: certo +1 / errado 0 · C e D: certo +1 / errado −1.
function corrigir(est, provaId = idProvaAtual()) {
  const pv = prova(provaId, est.versao);
  const resp = S.respostas[provaId]?.[est.id] || { marcacoes: {}, redacao: null };
  let ac = 0, er = 0, br = 0, eb = 0, dLanc = 0, dTotal = 0;
  const porGrupo = {};
  GRUPOS.forEach(g => porGrupo[g] = { ac: 0, tot: 0 });
  const detalhes = [];
  for (const { item, numero } of pv) {
    const g = porGrupo[item.grupo] || (porGrupo[item.grupo] = { ac: 0, tot: 0 });
    if (item.tipo === 'D') {
      // Discursivo: nota lançada de 0 a 10 vale nota/10 no escore bruto.
      dTotal++;
      const bruta = resp.discursivas?.[item.id];
      if (bruta !== undefined && bruta !== null && bruta !== '') {
        const nota = Math.max(0, Math.min(10, parseFloat(bruta) || 0));
        eb += nota / 10;
        g.tot++; g.ac += nota / 10;
        dLanc++;
      }
      continue;
    }
    const m = String(resp.marcacoes?.[item.id] ?? '').trim().toUpperCase();
    const gab = item.tipo === 'B' ? String(item.gabarito).padStart(3, '0') : String(item.gabarito).toUpperCase();
    const marcada = m !== '';
    const certa = marcada && (item.tipo === 'B' ? m.padStart(3, '0') === gab : m === gab);
    if (!marcada) br++;
    else if (certa) { ac++; eb += 1; }
    else { er++; if (item.tipo !== 'B') eb -= 1; }
    g.tot++; if (certa) g.ac++;
    detalhes.push({ numero, gab, m: marcada ? m : null, certa });
  }
  // A nota da redação sai da planilha oficial (NR = NC − 2·NE/TL). A conta vive
  // num lugar só, `contaDoNR()`, que é a mesma que a tela de lançamento mostra
  // parcela por parcela — duas implementações da mesma fórmula divergiriam.
  const nr = contaDoNR(resp.redacao)?.nr ?? null;
  const temResp = Object.keys(resp.marcacoes || {}).length > 0 ||
    Object.keys(resp.discursivas || {}).length > 0;
  return { ac, er, br, eb, porGrupo, nr, detalhes, temResp, total: pv.length, dLanc, dTotal };
}

function ranking(provaId, versao) {
  return estudantesDaProva(provaId).filter(e => e.versao === versao)
    .map(e => ({ e, r: corrigir(e, provaId) }))
    .filter(x => x.r.temResp)
    .sort((a, b) => b.r.eb - a.r.eb);
}

/* ---------------- casca / navegação ---------------- */
// `n` é a ordem no menu lateral, mostrada na pastilha; `rot` é o nome da tela,
// que também vira o título do cabeçalho.
// `n` é a ordem no menu lateral, mostrada na pastilha; `rot` é o nome da tela,
// que também vira o título do cabeçalho. A ordem é a do trabalho: distribuir a
// prova entre os docentes vem antes de escrever item.
//
// Só o número mudou quando a Alocação entrou — as rotas são por nome
// (`#/textos`), então nenhum endereço salvo quebrou.
// `curto` é o rótulo do simulacro do tutorial, onde a coluna é estreita.
const TELAS = {
  painel:        { n: 1, rot: 'Painel',               curto: 'Painel' },
  alocacao:      { n: 2, rot: 'Alocação por docente', curto: 'Alocação', soCoordenacao: true },
  textos:        { n: 3, rot: 'Textos e alocação',    curto: 'Textos' },
  itens:         { n: 4, rot: 'Itens e revisão',      curto: 'Itens' },
  caderno:       { n: 5, rot: 'Caderno',              curto: 'Caderno' },
  cartoes:       { n: 6, rot: 'Cartões-resposta',     curto: 'Cartões' },
  correcao:      { n: 7, rot: 'Correção e boletins',  curto: 'Correção' },
  administracao: { n: 8, rot: 'Administração',        curto: 'Admin.', soCoordenacaoNaNuvem: true }
};
// Administração cuida de contas e da lista de estudantes — só aparece para a
// coordenação e só com o sistema ligado ao banco. Alocação é da coordenação em
// qualquer modo: quem recebe meta não a define.
function telasVisiveis() {
  return Object.entries(TELAS).filter(([, v]) =>
    (!v.soCoordenacaoNaNuvem || (modoNuvem && ehCoord())) &&
    (!v.soCoordenacao || ehCoord()));
}
function telaAtual() {
  const h = location.hash.replace('#/', '');
  // A tela 7 já se chamou "equipe": quem tiver o endereço antigo salvo continua chegando.
  const alvo = h === 'equipe' ? 'administracao' : h;
  return telasVisiveis().some(([k]) => k === alvo) ? alvo : 'painel';
}

// Seletor de prova, no alto do menu lateral. O docente também troca de prova:
// ele escreve item para mais de uma série.
function seletorDeProva() {
  const lista = provasOrdenadas();
  if (!lista.length) return '';
  const atual = idProvaAtual();
  const ops = lista.map(p => {
    const n = itensDaProva(p.id).length;
    return `<option value="${esc(p.id)}" ${p.id === atual ? 'selected' : ''}>${esc(p.serie)} — ${esc(p.etapa)}${n ? ` (${n} ${n === 1 ? 'item' : 'itens'})` : ''}</option>`;
  }).join('');
  return `<label class="sel-prova" title="Prova em que você está trabalhando">
    <span>Prova</span><select data-mud="prova-ativa" aria-label="Prova ativa">${ops}</select></label>`;
}

/* ---------------- menu lateral, como gaveta na tela estreita ---------------- */
const fecharMenu = () => {
  $('.casca')?.classList.remove('menu-aberto');
  $('#lado-veu')?.setAttribute('hidden', '');
  $('.menu-btn')?.setAttribute('aria-expanded', 'false');
};
// Esvazia a casca quando ninguém está autenticado: menu e seletor de prova não
// fazem sentido antes de entrar.
function cascaVazia(comSair = false) {
  $('#lado-prova').innerHTML = '';
  $('#nav').innerHTML = '';
  $('#quem').innerHTML = `<div class="lado-acoes">${botaoTema()}${
    comSair ? '<button class="sair-btn" data-acao="nuvem-sair">Sair</button>' : ''}</div>`;
}

function render() {
  const p = provaAtual();

  if (modoNuvem && !nuvem.usuario()) {
    $('#h-titulo').textContent = 'Sistema PAS Marista';
    $('#h-sub').textContent = 'Entre com a conta que a coordenação criou para você.';
    cascaVazia();
    telaLogin();
    return;
  }

  // Senha provisória: nada mais aparece até a pessoa criar a sua.
  if (modoNuvem && S.perfil.trocarSenha) {
    $('#h-titulo').textContent = 'Primeiro acesso';
    $('#h-sub').textContent = 'Crie a sua senha para continuar.';
    cascaVazia(true);
    telaTrocarSenha();
    return;
  }

  const atual = telaAtual();
  $('#h-titulo').textContent = TELAS[atual].rot;
  $('#h-sub').textContent = p
    ? `${p.nome} — ${p.etapa} · ${p.serie}` +
      (p.dataAplicacao ? ` · Aplicação: ${dataBR(p.dataAplicacao)}` : '')
    : 'Nenhuma prova cadastrada ainda.';

  $('#lado-prova').innerHTML = seletorDeProva();

  const ini = (S.perfil.nome || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  const identidade = modoNuvem
    ? `<div class="lado-quem"><div class="avatar">${esc(ini)}</div>
         <span class="nome">${esc(nomePerfil())}</span></div>
       <div class="lado-acoes">
         ${botaoTema()}
         <button class="tema-btn" data-acao="nuvem-atualizar" title="Recarregar os dados do banco on-line">🔄</button>
         <button class="tema-btn" data-acao="minha-conta" title="Minha conta (trocar senha)">🔑</button>
         <button class="sair-btn" data-acao="nuvem-sair" title="Sair da conta">Sair</button>
       </div>`
    // Sem nuvem o próprio seletor é a identidade — repetir o nome ao lado do
    // avatar diria a mesma coisa duas vezes.
    : `<div class="lado-quem"><div class="avatar">${esc(ini)}</div>
         <select id="sel-perfil" aria-label="Perfil ativo">
          <option value="coordenacao" ${ehCoord() ? 'selected' : ''}>${ehCoord() ? esc(nomePerfil()) : 'Coordenação · entrar'}</option>
          <option value="docente" ${S.perfil.papel === 'docente' ? 'selected' : ''}>${S.perfil.papel === 'docente' ? esc(nomePerfil()) : 'Docente · entrar'}</option>
          <option value="redacao" ${ehRedacao() ? 'selected' : ''}>${ehRedacao() ? esc(nomePerfil()) : 'Prof. de redação · entrar'}</option>
         </select></div>
       <div class="lado-acoes">${botaoTema()}</div>`;
  $('#quem').innerHTML = identidade;
  const sel = $('#sel-perfil');
  if (sel) sel.addEventListener('change', ev => dlgPerfil(ev.target.value));

  $('#nav').innerHTML = telasVisiveis()
    .map(([k, v]) => `<a href="#/${k}" ${k === atual ? 'aria-current="page"' : ''}>
      <span class="n">${v.n}</span>${esc(v.rot)}</a>`).join('');
  ({
    painel: telaPainel, alocacao: telaAlocacao, textos: telaTextos, itens: telaItens,
    caderno: telaCaderno, cartoes: telaCartoes, correcao: telaCorrecao,
    administracao: telaAdministracao
  }[atual])();

  // Estreia: o tutorial do papel abre sozinho, uma única vez.
  if (modoNuvem && S.perfil.tutorialVisto === false && !tutorialAberto && !$('#dlg').open)
    abrirTutorial(0);
}
// Navegar fecha a gaveta: na tela estreita ela cobre o conteúdo que se acabou
// de pedir.
window.addEventListener('hashchange', () => { fecharMenu(); render(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('.casca')?.classList.contains('menu-aberto')) {
    fecharMenu();
    $('.menu-btn')?.focus();
  }
});

/* ---------------- ações delegadas ---------------- */
const ACOES = {};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-acao]');
  if (!b) return;
  const fn = ACOES[b.dataset.acao];
  if (fn) { e.preventDefault(); fn(b.dataset, b); }
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-mud]');
  if (!el) return;
  const fn = MUDS[el.dataset.mud];
  if (fn) fn(el.dataset, el);
});
ACOES['menu-abrir'] = () => {
  $('.casca')?.classList.add('menu-aberto');
  $('#lado-veu')?.removeAttribute('hidden');
  $('.menu-btn')?.setAttribute('aria-expanded', 'true');
  $('.lado-nav a')?.focus();
};
ACOES['menu-fechar'] = () => { fecharMenu(); $('.menu-btn')?.focus(); };

const MUDS = {};
MUDS['prova-ativa'] = (d, el) => {
  S.provaAtiva = el.value;
  salvarProvaAtiva(el.value);
  save(S);
  render();
};
ACOES['fechar-dlg'] = () => $('#dlg').close();
ACOES['tema'] = () => {
  const novo = temaAtual() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = novo;
  try { localStorage.setItem('pas-tema', novo); } catch { /* segue sem salvar */ }
  render();
};

function abrirDlg(html, grande = false) {
  const d = $('#dlg');
  d.classList.toggle('grande', grande);
  d.innerHTML = html;
  if (!d.open) d.showModal();
}

/* ================= TELA 1 · PAINEL ================= */
// Números de uma prova, num lugar só — o painel, a tela de textos e o resumo
// do docente leem daqui, para não haver duas contas da mesma coisa.
function balancoDaProva(provaId) {
  const itens = itensDaProva(provaId);
  const aprovados = itens.filter(i => i.status === 'aprovado').length;
  const p = provaPorId(provaId);
  return {
    prova: p,
    itens,
    criados: itens.length,
    aprovados,
    emArea: itens.filter(i => i.status === 'area').length,
    emGeral: itens.filter(i => i.status === 'geral').length,
    // Grandezas distintas, cada uma com a sua fonte: o tamanho que cada versão
    // da prova deve ter, o espaço que os textos-base comportam, e o que existe.
    //
    // `totalQuestoes` continua aqui como o tamanho da versão REGULAR, porque é
    // ela a prova completa — a adaptada é derivada dela, e é contra a regular
    // que se mede o quanto falta escrever.
    totalQuestoes: totalDeQuestoes(p, 'regular'),
    totalAdaptada: totalDeQuestoes(p, 'adaptada'),
    slots: textosAprovados(provaId).reduce((s, t) => s + (t.slots || 0), 0),
    textos: textosAprovados(provaId).length,
    sugestoes: textosDaProva(provaId).filter(t => t.status === 'sugestao').length,
    // Itens aprovados em cada caderno. Item de versão "ambas" conta nos dois,
    // e é por isso que a soma dos dois não é `aprovados`.
    nReg: prova(provaId, 'regular').length,
    nAda: prova(provaId, 'adaptada').length
  };
}

/* ---------------- quem escreveu o quê ---------------- */
// Identidade de quem escreve. Na nuvem é o e-mail — chave primária de `equipe`,
// estável e única. Sem nuvem é o nome, que é tudo que existe ali. Nome sozinho
// não serve para fechar conta: é editável e a lista tem Paulo Leite e Paulo
// Eduardo, que a interface mostrava como "Paulo" nos dois casos.
const idDocente = p => (p?.email || p?.nome || '').toLowerCase();
const idAutorDoItem = i => (i.autorEmail || i.autor || '').toLowerCase();
const souEu = i => idAutorDoItem(i) === idDocente(S.perfil);

// O que uma pessoa produziu numa prova. Sem argumento, quem está logado.
function producaoDe(provaId, chave = idDocente(S.perfil)) {
  const meus = itensDaProva(provaId).filter(i => idAutorDoItem(i) === chave);
  return {
    itens: meus,
    criados: meus.length,
    aprovados: meus.filter(i => i.status === 'aprovado').length,
    emRevisao: meus.filter(i => ['area', 'geral'].includes(i.status)).length,
    devolvidos: meus.filter(i => i.status === 'devolvido').length,
    rascunhos: meus.filter(i => i.status === 'rascunho').length,
    // Por tipo, para conferir contra a divisão da meta quando ela existir.
    porTipo: Object.fromEntries(Object.keys(TIPOS).map(t =>
      [t, meus.filter(i => i.tipo === t).length]))
  };
}
const minhaProducao = provaId => producaoDe(provaId);

/* ---------------- alocação: a meta de cada docente ---------------- */
const alocacaoDe = (provaId, chave) => S.alocacoes?.[provaId]?.[chave] || null;
const minhaAlocacao = provaId => alocacaoDe(provaId, idDocente(S.perfil));

// Quem pode receber meta. Na nuvem, a equipe cadastrada, menos a coordenação
// geral (que não escreve item) e a professora de redação. Sem nuvem, quem já
// aparece como autor — é o que dá para saber.
function docentesAlocaveis() {
  if (modoNuvem) {
    return equipeCache
      .filter(m => ['docente', 'coordenacao_area'].includes(m.papel))
      .map(m => ({ chave: idDocente(m), nome: m.nome || m.email, email: m.email, componente: m.componente }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  const vistos = new Map();
  for (const i of S.itens) {
    const chave = idAutorDoItem(i);
    if (chave && !vistos.has(chave))
      vistos.set(chave, { chave, nome: i.autor, email: i.autorEmail || null, componente: i.componente });
  }
  const eu = idDocente(S.perfil);
  if (eu && !vistos.has(eu))
    vistos.set(eu, { chave: eu, nome: S.perfil.nome, email: S.perfil.email || null, componente: S.perfil.componente });
  return [...vistos.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Soma das metas de uma prova, para comparar com o tamanho dela.
function somaDasMetas(provaId) {
  const m = S.alocacoes?.[provaId] || {};
  return Object.values(m).reduce((s, a) => s + (a.meta || 0), 0);
}

// Barrinha de progresso contra a meta. Sem meta não desenha barra: "sem meta"
// e "meta zero" dizem coisas diferentes, e uma barra vazia afirmaria a segunda.
function progressoDaMeta(feito, meta) {
  if (!meta) return '<span style="font-size:11.5px;color:var(--ink-2)">sem meta definida</span>';
  const pct = Math.min(100, Math.round(feito / meta * 100));
  const cls = feito >= meta ? 'ok' : feito > 0 ? 'pend' : 'falta';
  return `<div class="meta-barra ${cls}" title="${feito} de ${meta}">
    <i style="width:${pct}%"></i><b>${feito}/${meta}</b></div>`;
}

// Visão do docente: o que ele deve entregar em CADA prova, não só na ativa.
function painelDoDocente() {
  const provas = provasOrdenadas();
  const linhas = provas.map(p => {
    const m = minhaProducao(p.id);
    const a = minhaAlocacao(p.id);
    const meta = a?.meta || 0;
    // A situação responde "estou em dia?" — e isso só tem resposta contra a
    // meta. Sem meta, o mais honesto é relatar o estágio do que existe.
    const situacao = m.devolvidos ? '<span class="chip falta">Devolvido — ajustar</span>'
      : meta && m.aprovados >= meta ? '<span class="chip ok">Meta cumprida</span>'
      : meta && m.criados >= meta ? '<span class="chip pend">Entregue, em revisão</span>'
      : meta ? `<span class="chip falta">Faltam ${meta - m.criados}</span>`
      : m.emRevisao ? '<span class="chip pend">Em revisão</span>'
      : m.rascunhos ? '<span class="chip info">Rascunho pendente</span>'
      : m.criados ? '<span class="chip ok">Tudo aprovado</span>'
      : '<span class="chip">Nada entregue</span>';
    return `<tr class="clic" data-acao="ir-para-prova" data-id="${esc(p.id)}">
      <td><b>${esc(p.serie)}</b><br><span style="font-size:11px;color:var(--ink-2)">${esc(p.etapa)}</span></td>
      <td>${progressoDaMeta(m.aprovados, meta)}</td>
      <td>${m.criados}</td><td>${m.aprovados}</td><td>${m.emRevisao}</td>
      <td>${situacao}</td>
    </tr>`;
  }).join('');

  const tot = provas.reduce((s, p) => {
    const m = minhaProducao(p.id);
    return {
      criados: s.criados + m.criados,
      aprovados: s.aprovados + m.aprovados,
      meta: s.meta + (minhaAlocacao(p.id)?.meta || 0)
    };
  }, { criados: 0, aprovados: 0, meta: 0 });

  // Observações que a coordenação anexou à meta — ditas aqui, onde interessam.
  const recados = provas
    .map(p => ({ p, obs: minhaAlocacao(p.id)?.observacao }))
    .filter(x => x.obs);

  return `<div class="cartao" style="margin-bottom:16px">
    <h3>O que você tem para entregar</h3>
    <div style="overflow-x:auto"><table>
      <thead><tr><th>Prova</th><th>Aprovados / meta</th><th>Criados</th><th>Aprovados</th><th>Em revisão</th><th>Situação</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>
    <p style="font-size:12.5px;color:var(--ink-2);margin:10px 0 0">
      ${tot.meta
        ? `Ao todo a coordenação alocou <b>${tot.meta}</b> ${tot.meta === 1 ? 'item' : 'itens'} para você nas
           ${provas.length} provas; você criou ${tot.criados} e ${tot.aprovados} ${tot.aprovados === 1 ? 'está aprovado' : 'estão aprovados'}.`
        : `Você tem <b>${tot.criados}</b> ${tot.criados === 1 ? 'item' : 'itens'} nas ${provas.length} provas,
           ${tot.aprovados} já ${tot.aprovados === 1 ? 'aprovado' : 'aprovados'}. A coordenação ainda não definiu metas.`}
      Clique numa linha para trabalhar naquela prova.</p>
    ${recados.length ? `<div class="cartao aviso" style="margin:12px 0 0">
      <h3>Recado da coordenação</h3>
      ${recados.map(({ p, obs }) =>
        `<p style="font-size:13px;margin:0 0 6px"><b>${esc(p.serie)}:</b> ${esc(obs)}</p>`).join('')}
    </div>` : ''}
  </div>`;
}
ACOES['ir-para-prova'] = d => {
  S.provaAtiva = d.id;
  salvarProvaAtiva(d.id);
  save(S);
  location.hash = '#/textos';
  render();
};

// Visão da coordenação: as quatro provas lado a lado. É o que responde
// “como está cada série?” sem obrigar a trocar de prova quatro vezes.
function painelDasProvas() {
  const linhas = provasOrdenadas().map(p => {
    const b = balancoDaProva(p.id);
    const falta = b.totalQuestoes ? Math.max(0, b.totalQuestoes - b.aprovados) : null;
    const sit = !b.totalQuestoes ? '<span class="chip info">tamanho a definir</span>'
      : falta === 0 ? '<span class="chip ok">Completa</span>'
      : `<span class="chip pend">faltam ${falta}</span>`;
    const soma = somaDasMetas(p.id);
    return `<tr class="clic" data-acao="ir-para-prova" data-id="${esc(p.id)}">
      <td><b>${esc(p.serie)}</b>${p.id === idProvaAtual() ? ' <span class="chip info">na tela</span>' : ''}</td>
      <td>${esc(p.etapa)}</td>
      <td>${dataBR(p.dataAplicacao)}</td>
      <td>${b.textos}</td>
      <td>${soma || '<span style="color:var(--ink-2)">—</span>'}</td>
      <td>${b.criados}</td>
      <td>${b.aprovados}${b.totalQuestoes ? ` / ${b.totalQuestoes}` : ''}</td>
      <td>${p.temRedacao === false ? '—' : propostaEscrita(p.id) ? '✓'
        : '✓ <span class="red-alerta" title="A proposta de redação desta prova ainda não foi escrita">sem proposta</span>'}</td>
      <td>${sit}</td>
    </tr>`;
  }).join('');
  const semAlocacao = provasOrdenadas().filter(p => !somaDasMetas(p.id)).length;
  return `<div class="cartao" style="margin-bottom:16px">
    <h3>As provas do simulado</h3>
    <div style="overflow-x:auto"><table>
      <thead><tr><th>Série</th><th>Etapa</th><th>Aplicação</th><th>Textos</th><th>Alocado</th><th>Itens</th><th>Aprovados</th><th>Redação</th><th>Situação</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>
    <p style="font-size:12.5px;color:var(--ink-2);margin:10px 0 0">Clique numa linha para trabalhar naquela prova.${
      semAlocacao ? ` <b>${semAlocacao}</b> ${semAlocacao === 1 ? 'prova ainda não teve' : 'provas ainda não tiveram'} a produção
      distribuída entre os docentes — use a tela <a href="#/alocacao">Alocação por docente</a>.` : ''}</p>
  </div>`;
}

function telaPainel() {
  const p = provaAtual();
  if (!p) {
    $('#app').innerHTML = `<div class="quadro"><div class="miolo"><div class="vazio">
      Nenhuma prova cadastrada.${ehCoord() ? ' Crie a primeira em “+ Nova prova”.' : ' Peça à coordenação para criar.'}</div>
      ${ehCoord() ? '<div style="margin-top:12px"><button class="btn" data-acao="prova-nova">+ Nova prova</button></div>' : ''}
    </div></div>`;
    return;
  }
  const b = balancoDaProva(p.id);
  const doPapel = ehCoord();
  const elenco = estudantesDaProva(p.id);
  const estReg = elenco.filter(e => e.versao === 'regular').length;
  const estAda = elenco.filter(e => e.versao === 'adaptada').length;

  const comps = {};
  for (const it of b.itens) {
    const c = comps[it.componente] || (comps[it.componente] = { criados: 0, aprovados: 0, rev: 0, autores: new Set() });
    c.criados++; if (it.status === 'aprovado') c.aprovados++;
    if (it.status === 'area' || it.status === 'geral') c.rev++;
    c.autores.add(it.autor);
  }
  const linhas = Object.entries(comps).sort((a, b2) => a[0].localeCompare(b2[0])).map(([comp, c]) => {
    const sit = c.aprovados === c.criados ? '<span class="chip ok">Completo</span>'
      : c.rev > 0 ? '<span class="chip pend">Em revisão</span>'
      : '<span class="chip info">Em elaboração</span>';
    return `<tr><td>${discChip(comp)}</td><td>${esc([...c.autores].join(', '))}</td>
      <td>${c.criados}</td><td>${c.aprovados}</td><td>${sit}</td></tr>`;
  }).join('');

  // Conferência entre as três grandezas. Mostrada, nunca corrigida em
  // silêncio: se os textos comportam mais ou menos do que a prova pede, quem
  // decide é a coordenação.
  const conf = [];
  if (b.totalQuestoes && b.slots && b.slots !== b.totalQuestoes)
    conf.push(`os textos-base comportam <b>${b.slots}</b> ${b.slots === 1 ? 'item' : 'itens'}, e a prova regular pede <b>${b.totalQuestoes}</b>`);
  if (!b.totalQuestoes)
    conf.push('a quantidade de questões da prova regular ainda não foi definida' +
      (doPapel ? ' — defina em “⚙ Configurar prova”' : ''));
  // A adaptada tem tamanho próprio; sem ele, a barra dela não tem denominador.
  if (!b.totalAdaptada && b.nAda)
    conf.push(`a prova adaptada já tem <b>${b.nAda}</b> ${b.nAda === 1 ? 'item aprovado' : 'itens aprovados'}, mas o tamanho dela ainda não foi definido` +
      (doPapel ? ' — é um campo separado em “⚙ Configurar prova”' : ''));
  if (b.totalAdaptada && b.totalQuestoes && b.totalAdaptada > b.totalQuestoes)
    conf.push(`a prova adaptada está maior que a regular (<b>${b.totalAdaptada}</b> contra <b>${b.totalQuestoes}</b>) — confira se não houve troca dos números`);
  if (b.criados > b.slots && b.slots)
    conf.push(`há <b>${b.criados - b.slots}</b> ${b.criados - b.slots === 1 ? 'item' : 'itens'} além dos espaços dos textos-base`);
  // A redação é parte da prova: prova com redação e sem proposta escrita é
  // caderno incompleto, e isso precisa ser dito antes da impressão.
  if (provaTemRedacao(p.id) && !propostaEscrita(p.id))
    conf.push('esta prova tem redação, mas a <b>proposta</b> (tema, comando e textos motivadores) ainda não foi escrita' +
      (doPapel ? ' — escreva em <a href="#/caderno">Caderno</a>, no botão “✍ Proposta de redação”' : ''));

  $('#app').innerHTML = `
  <div class="quadro"><div class="miolo">
    <div class="cab-tela">
      <div>
        <h2>${esc(p.serie)} — ${esc(p.nome)}</h2>
        <span class="sub">${esc(p.etapa)} · Aplicação: ${dataBR(p.dataAplicacao)} · ${elenco.length} ${elenco.length === 1 ? 'estudante' : 'estudantes'}${p.temRedacao === false ? ' · sem redação' : ' · com redação'}</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${doPapel ? '<button class="btn fantasma" data-acao="cfg">⚙ Configurar prova</button>' : ''}
        ${doPapel ? '<button class="btn fantasma" data-acao="prova-nova">+ Nova prova</button>' : ''}
        <a class="btn rosa" href="#/caderno" style="text-decoration:none">Gerar cadernos</a>
      </div>
    </div>

    ${doPapel ? '' : painelDoDocente()}

    <div class="versoes">
      <div class="versao sel"><div class="ic" style="background:var(--azul)">📘</div>
        <div><b>Prova Regular</b><span>${b.nReg}${b.totalQuestoes ? ` de ${b.totalQuestoes}` : ''} ${b.nReg === 1 ? 'item aprovado' : 'itens aprovados'}${
          b.totalQuestoes ? '' : ' · tamanho a definir'}${p.temRedacao === false ? '' : ' + redação'} · ${estReg} estudantes</span></div></div>
      <div class="versao"><div class="ic" style="background:var(--verde)">📗</div>
        <div><b>Prova Adaptada (inclusão)</b><span>${b.nAda}${b.totalAdaptada ? ` de ${b.totalAdaptada}` : ''} ${b.nAda === 1 ? 'item aprovado' : 'itens aprovados'}${
          b.totalAdaptada ? '' : ' · tamanho a definir'}${p.temRedacao === false ? '' : ' + redação'} · ${estAda} estudantes</span></div></div>
    </div>

    <div class="grade g3" style="margin-bottom:16px">
      <div class="cartao vivo"><h3><span class="pingo" style="background:var(--azul)"></span>Itens aprovados</h3>
        <div class="num">${b.aprovados}<small>${b.totalQuestoes ? ` / ${b.totalQuestoes} da prova` : ' de um total ainda a definir'}</small></div>
        <div class="barra"><i style="width:${b.totalQuestoes ? Math.min(100, b.aprovados / b.totalQuestoes * 100) : 0}%"></i></div>
        <span style="font-size:12px;color:var(--ink-2)">${b.criados} criados ao todo</span></div>
      <div class="cartao vivo"><h3><span class="pingo" style="background:var(--rosa)"></span>Em revisão</h3>
        <div class="num">${b.emArea + b.emGeral}</div>
        <span style="font-size:12px;color:var(--ink-2)">${b.emArea} na coord. de área · ${b.emGeral} na coordenação geral</span></div>
      <div class="cartao vivo"><h3><span class="pingo" style="background:var(--amarelo)"></span>Textos-base</h3>
        <div class="num">${b.textos}<small> ativos · ${b.slots} espaços</small></div>
        <span style="font-size:12px;color:var(--ink-2)">${b.sugestoes ? '+' + b.sugestoes + ' sugestão(ões) aguardando aprovação' : 'nenhuma sugestão pendente'}</span></div>
    </div>

    ${conf.length ? `<div class="cartao aviso" style="margin-bottom:16px">
      <h3>Conferência da prova</h3>
      <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7">${conf.map(c => `<li>${c}</li>`).join('')}</ul>
    </div>` : ''}

    ${doPapel ? painelDasProvas() : ''}

    <div class="cartao" style="margin-bottom:16px">
      <h3>Entregas por componente curricular — ${esc(p.serie)}</h3>
      ${linhas ? `<table><thead><tr><th>Componente</th><th>Docente(s)</th><th>Itens criados</th><th>Aprovados</th><th>Situação</th></tr></thead>
        <tbody>${linhas}</tbody></table>` : '<div class="vazio">Nenhum item criado nesta prova ainda — comece pela tela “Textos e alocação”.</div>'}
    </div>

    ${ehCoord() ? `<div class="cartao"><h3>Dados e backup${modoNuvem ? '' : ' (persistência local deste navegador)'}</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" data-acao="exportar-json">⬇ Exportar backup (JSON)</button>
        <button class="btn fantasma" data-acao="importar-json">⬆ Importar backup</button>
        <button class="btn fantasma" data-acao="carregar-exemplo">Recarregar dados de exemplo</button>
        <button class="btn vermelho" data-acao="zerar">Zerar tudo</button>
      </div>
      <p style="font-size:12.5px;color:var(--ink-2);margin:10px 0 0">${modoNuvem
        ? 'O simulado fica no banco on-line da escola e é o mesmo para toda a equipe. Importar backup, recarregar o exemplo ou zerar <strong>substitui os dados de todo mundo</strong> — exporte um backup antes.'
        : 'Nesta fase os dados ficam apenas neste navegador. Exporte o backup ao fim de cada sessão de trabalho.'}</p>
    </div>` : ''}
  </div></div>`;
}

function dlgProva(p, nova = false) {
  const opsSerie = SERIES.map(s =>
    `<option ${p.serie === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
  abrirDlg(`
    <div class="dlg-cab"><h2>${nova ? 'Nova prova' : 'Configurar a prova'}</h2>
      <button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      <div class="form-linha">
        <div class="campo" style="min-width:230px"><label>Nome do simulado</label>
          <input class="caixa" id="cfg-nome" value="${esc(p.nome || '')}"></div>
        <div class="campo"><label>Série</label>
          <select class="caixa" id="cfg-serie">${opsSerie}</select></div>
        <div class="campo"><label>Etapa</label>
          <input class="caixa" id="cfg-etapa" value="${esc(p.etapa || '')}"></div>
      </div>
      <div class="form-linha">
        <div class="campo"><label>Data de aplicação</label>
          <input class="caixa" type="date" id="cfg-data" value="${esc(p.dataAplicacao || '')}"></div>
        <div class="campo"><label>Duração</label>
          <input class="caixa" id="cfg-dur" value="${esc(p.duracao || '')}"></div>
      </div>
      <div class="form-linha">
        <div class="campo"><label>Questões — prova regular</label>
          <input class="caixa" type="number" min="1" max="300" id="cfg-qtd"
            value="${totalDeQuestoes(p, 'regular') ?? ''}" placeholder="a definir"></div>
        <div class="campo"><label>Questões — prova adaptada</label>
          <input class="caixa" type="number" min="1" max="300" id="cfg-qtd-ada"
            value="${totalDeQuestoes(p, 'adaptada') ?? ''}" placeholder="a definir"></div>
      </div>
      <p style="font-size:12px;color:var(--ink-2);margin:-4px 0 12px">São <b>dois</b> números porque a prova adaptada
        (de inclusão) tem tamanho próprio. O painel compara cada versão com os itens já aprovados nela, e a regular
        também com os espaços dos textos-base. Campo em branco significa <em>a definir</em> — a barra fica sem
        denominador em vez de mostrar zero.</p>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;margin-bottom:8px">
        <input type="checkbox" id="cfg-tem-red" ${p.temRedacao !== false ? 'checked' : ''}> esta prova tem redação</label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700">
        <input type="checkbox" id="cfg-red" ${p.imprimirRedacao !== false ? 'checked' : ''}> imprimir a folha de redação no cartão-resposta
        <span style="font-weight:400;color:var(--ink-2)">— uma folha a mais por estudante, com a pauta de ${LINHAS_REDACAO} linhas</span></label>
      <p style="font-size:12px;color:var(--ink-2);margin:10px 0 0">Sem redação, a prova não tem proposta, nem folha de
        redação, nem lançamento de NC/NE/TL. A <b>proposta</b> — tema, comando e textos motivadores — é escrita na tela
        <b>Caderno</b>, em “✍ Proposta de redação”, e sai nas últimas páginas do caderno.</p>
    </div>
    <div class="dlg-pe">
      ${!nova && provasOrdenadas().length > 1 ? `<button class="btn vermelho" style="margin-right:auto" data-acao="prova-excluir" data-id="${esc(p.id)}">Excluir prova</button>` : ''}
      <button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="cfg-salvar" data-id="${esc(p.id)}" data-nova="${nova ? '1' : ''}">Salvar</button></div>`);
}

ACOES['cfg'] = () => { const p = provaAtual(); if (p) dlgProva(p); };
ACOES['prova-nova'] = () => {
  const usadas = new Set(provasOrdenadas().map(p => p.serie));
  const livre = SERIES.find(s => !usadas.has(s)) || SERIES[0];
  dlgProva(provaNova(livre, provasOrdenadas().length), true);
};

ACOES['cfg-salvar'] = d => {
  const numero = sel => {
    const n = parseInt($(sel).value, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const dados = {
    nome: $('#cfg-nome').value.trim(),
    serie: $('#cfg-serie').value,
    etapa: $('#cfg-etapa').value.trim(),
    dataAplicacao: $('#cfg-data').value,
    duracao: $('#cfg-dur').value.trim(),
    totalQuestoes: { regular: numero('#cfg-qtd'), adaptada: numero('#cfg-qtd-ada') },
    temRedacao: $('#cfg-tem-red').checked,
    imprimirRedacao: $('#cfg-red').checked
  };
  if (!dados.nome || !dados.etapa) { toast('Nome e etapa são obrigatórios.'); return; }

  let alvo;
  if (d.nova) {
    if (provasOrdenadas().some(p => p.serie === dados.serie && p.etapa === dados.etapa)) {
      toast(`Já existe uma prova de ${dados.serie} na ${dados.etapa}.`); return;
    }
    alvo = { ...provaNova(dados.serie, provasOrdenadas().length), ...dados, id: uid() };
    S.provas.push(alvo);
    S.provaAtiva = alvo.id;
    salvarProvaAtiva(alvo.id);
    sincronizarElenco(alvo.id);
  } else {
    alvo = provaPorId(d.id);
    if (!alvo) return;
    const mudouSerie = alvo.serie !== dados.serie;
    Object.assign(alvo, dados);
    // Trocar a série de uma prova troca quem a faz.
    if (mudouSerie) sincronizarElenco(alvo.id);
  }
  $('#dlg').close(); commit(); PERS.prova(alvo); PERS.elenco(alvo.id);
  toast(d.nova ? `Prova de ${alvo.serie} criada.` : 'Prova atualizada.');
};

ACOES['prova-excluir'] = d => {
  const p = provaPorId(d.id);
  if (!p) return;
  const b = balancoDaProva(p.id);
  abrirDlg(`
    <div class="dlg-cab"><h2>Excluir a prova de ${esc(p.serie)}?</h2>
      <button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo"><p style="margin-top:0">Isto apaga <b>${b.textos + b.sugestoes} texto(s)-base</b>,
      <b>${b.criados} ${b.criados === 1 ? 'item' : 'itens'}</b> e as respostas lançadas desta prova.
      Os estudantes continuam cadastrados. Não há como desfazer — exporte um backup antes.</p></div>
    <div class="dlg-pe"><button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn vermelho" data-acao="prova-excluir-ok" data-id="${esc(p.id)}">Excluir prova</button></div>`);
};
ACOES['prova-excluir-ok'] = d => {
  const alvos = textosDaProva(d.id).map(t => t.id);
  const itensAlvo = itensDaProva(d.id).map(i => i.id);
  S.textos = S.textos.filter(t => t.provaId !== d.id);
  S.itens = S.itens.filter(i => i.provaId !== d.id);
  S.provas = S.provas.filter(p => p.id !== d.id);
  delete S.elencos[d.id];
  delete S.respostas[d.id];
  if (S.provaAtiva === d.id) {
    S.provaAtiva = provasOrdenadas()[0]?.id || null;
    salvarProvaAtiva(S.provaAtiva || '');
  }
  $('#dlg').close(); commit();
  if (modoNuvem) {
    // As respostas e o elenco caem por chave estrangeira quando a prova sai.
    Promise.all([
      ...alvos.map(id => nuvem.removerLinha('textos', id)),
      ...itensAlvo.map(id => nuvem.removerLinha('itens', id)),
      nuvem.removerLinha('provas', d.id)
    ]).catch(PERS.falha);
  }
  toast('Prova excluída.');
};

ACOES['exportar-json'] = () => {
  baixar('pas-marista-backup.json', JSON.stringify(S, null, 2));
  toast('Backup exportado.');
};
ACOES['importar-json'] = () => {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    f.text().then(txt => {
      try {
        const novo = JSON.parse(txt);
        // Backups de formatos anteriores ainda entram, convertidos: v1 (prova
        // única) vira a prova da série que estava configurada nele; v2 só ganha
        // as alocações vazias.
        if (novo?.versao === 1 || novo?.versao === 2) {
          S = substituir(migrarV2paraV3(novo.versao === 1 ? migrarDeV1(novo) : novo));
          render(); PERS.tudo();
          toast(`Backup no formato v${novo.versao} importado e convertido.`);
          return;
        }
        if (novo?.versao !== VERSAO_ESTADO) throw new Error('formato');
        S = substituir(novo); render(); PERS.tudo(); toast('Backup importado.');
      } catch { toast('Arquivo inválido — esperava um backup deste sistema.'); }
    });
  };
  inp.click();
};
ACOES['carregar-exemplo'] = () => { S = substituir(seed()); render(); PERS.tudo(); toast('Dados de exemplo carregados.'); };
ACOES['zerar'] = () => {
  abrirDlg(`
    <div class="dlg-cab"><h2>Zerar todos os dados?</h2><button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo"><p>Isto apaga textos, itens, estudantes e respostas${modoNuvem
      ? ' <strong>do banco on-line — para toda a equipe</strong>' : ' deste navegador'}. Exporte um backup antes, se necessário.</p></div>
    <div class="dlg-pe"><button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn vermelho" data-acao="zerar-confirmado">Apagar tudo</button></div>`);
};
ACOES['zerar-confirmado'] = () => { S = substituir(blank()); $('#dlg').close(); render(); PERS.tudo(); toast('Dados zerados.'); };

/* ---------------- perfil ---------------- */
function dlgPerfil(papel) {
  if (papel === 'redacao') {
    abrirDlg(`
      <div class="dlg-cab"><h2>Entrar como professora de redação</h2><button class="fechar-x" data-acao="perfil-cancelar">✕</button></div>
      <div class="dlg-corpo">
        <div class="campo"><label>Seu nome</label>
          <input class="caixa" id="pf-nome" value="${esc(ehRedacao() ? S.perfil.nome : '')}" placeholder="ex.: Helena"></div>
        <p style="font-size:12.5px;color:var(--ink-2)">Este perfil vê, na tela de Correção, a proposta de redação da prova e o lançamento das informações de redação (NC, NE e TL) por estudante — nada mais.</p>
      </div>
      <div class="dlg-pe"><button class="btn fantasma" data-acao="perfil-cancelar">Cancelar</button>
        <button class="btn" data-acao="perfil-redacao">Entrar</button></div>`);
    return;
  }
  if (papel === 'coordenacao') {
    abrirDlg(`
      <div class="dlg-cab"><h2>Entrar como coordenação</h2><button class="fechar-x" data-acao="perfil-cancelar">✕</button></div>
      <div class="dlg-corpo"><div class="campo"><label>Seu nome</label>
        <input class="caixa" id="pf-nome" value="${esc(ehCoord() ? S.perfil.nome : 'Raul')}"></div></div>
      <div class="dlg-pe"><button class="btn fantasma" data-acao="perfil-cancelar">Cancelar</button>
        <button class="btn" data-acao="perfil-coord">Entrar</button></div>`);
  } else {
    const ops = opcoesComponente(S.perfil.componente);
    abrirDlg(`
      <div class="dlg-cab"><h2>Entrar como docente</h2><button class="fechar-x" data-acao="perfil-cancelar">✕</button></div>
      <div class="dlg-corpo">
        <div class="form-linha">
          <div class="campo"><label>Seu nome</label><input class="caixa" id="pf-nome" value="${esc(!ehCoord() ? S.perfil.nome : '')}" placeholder="ex.: Fernanda"></div>
          <div class="campo"><label>Componente</label><select class="caixa" id="pf-comp">${ops}</select></div>
        </div>
        <p style="font-size:12.5px;color:var(--ink-2)">No MVP a troca de perfil é livre (sem senha). O login real por conta chega na fase 2 do plano.</p>
      </div>
      <div class="dlg-pe"><button class="btn fantasma" data-acao="perfil-cancelar">Cancelar</button>
        <button class="btn" data-acao="perfil-docente">Entrar</button></div>`);
  }
}
ACOES['perfil-cancelar'] = () => { $('#dlg').close(); render(); };
ACOES['perfil-coord'] = () => {
  S.perfil = { papel: 'coordenacao', nome: $('#pf-nome').value.trim() || 'Coordenação', componente: null };
  $('#dlg').close(); commit(); toast('Perfil: ' + nomePerfil());
};
ACOES['perfil-docente'] = () => {
  S.perfil = { papel: 'docente', nome: $('#pf-nome').value.trim() || 'Docente', componente: $('#pf-comp').value };
  $('#dlg').close(); commit(); toast('Perfil: ' + nomePerfil());
};
ACOES['perfil-redacao'] = () => {
  S.perfil = { papel: 'redacao', nome: $('#pf-nome').value.trim() || 'Redação', componente: null };
  $('#dlg').close(); commit(); toast('Perfil: ' + nomePerfil());
};

/* ================= TELA 2 · ALOCAÇÃO POR DOCENTE ================= */
// Onde a coordenação distribui a prova entre quem escreve, e onde acompanha se
// cada um está em dia. A meta é por (prova, docente): a mesma pessoa tem metas
// diferentes em séries diferentes.
function telaAlocacao() {
  const p = provaAtual();
  if (!p) {
    $('#app').innerHTML = '<div class="quadro"><div class="miolo"><div class="vazio">Nenhuma prova cadastrada — crie a primeira no Painel.</div></div></div>';
    return;
  }
  if (modoNuvem && !equipeCarregada) {
    $('#app').innerHTML = '<div class="quadro"><div class="miolo"><div class="vazio">Carregando equipe…</div></div></div>';
    nuvem.carregarEquipe()
      .then(l => { equipeCache = l; equipeCarregada = true; render(); })
      .catch(e => { equipeCarregada = true; toast('Não foi possível carregar a equipe: ' + (e.message || e)); render(); });
    return;
  }

  const pessoas = docentesAlocaveis();

  // Agrupado por área do conhecimento: é assim que a coordenação distribui.
  const porArea = {};
  for (const d of pessoas) {
    const area = areaDoComponente(d.componente) || 'Sem área definida';
    (porArea[area] = porArea[area] || []).push(d);
  }

  const grupos = Object.entries(porArea).sort((a, b2) => a[0].localeCompare(b2[0], 'pt-BR'))
    .map(([area, lista]) => {
      const somaArea = lista.reduce((s, d) => s + (alocacaoDe(p.id, d.chave)?.meta || 0), 0);
      const linhas = lista.map(d => {
        const a = alocacaoDe(p.id, d.chave);
        const prod = producaoDe(p.id, d.chave);
        const meta = a?.meta || 0;
        return `<tr>
          <td><b>${esc(d.nome)}</b>${d.email ? `<br><span style="font-size:11px;color:var(--ink-2);font-family:var(--mono)">${esc(d.email)}</span>` : ''}</td>
          <td>${d.componente ? discChip(d.componente) : '<span style="color:var(--ink-2)">—</span>'}</td>
          <td><input class="caixa" type="number" min="0" max="90" style="width:88px"
              value="${meta || ''}" placeholder="—"
              data-mud="aloc-meta" data-chave="${esc(d.chave)}" aria-label="Meta de ${esc(d.nome)}"></td>
          <td style="min-width:132px" data-barra="${esc(d.chave)}">${progressoDaMeta(prod.aprovados, meta)}</td>
          <td>${prod.criados}</td>
          <td>${prod.emRevisao || '—'}</td>
          <td>${prod.devolvidos ? `<span class="chip falta">${prod.devolvidos}</span>` : '—'}</td>
          <td><input class="caixa" style="min-width:150px" value="${esc(a?.observacao || '')}"
              placeholder="recado (opcional)"
              data-mud="aloc-obs" data-chave="${esc(d.chave)}" aria-label="Recado para ${esc(d.nome)}"></td>
        </tr>`;
      }).join('');
      return `<tbody>
        <tr class="aloc-area"><th colspan="2">${esc(area)}</th>
          <th colspan="6" data-soma-area="${esc(area)}">${rotuloSomaArea(somaArea)}</th></tr>
        ${linhas}</tbody>`;
    }).join('');

  $('#app').innerHTML = `
  <div class="quadro"><div class="miolo">
    <div class="cab-tela">
      <div><h2>Alocação — ${esc(p.serie)}</h2>
        <span class="sub">${esc(p.etapa)} · quantos itens cada docente deve entregar nesta prova</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn fantasma" data-acao="aloc-dividir">Dividir igualmente</button>
        <button class="btn fantasma" data-acao="aloc-copiar">Copiar de outra prova</button>
        <button class="btn vermelho fantasma" data-acao="aloc-limpar">Limpar metas</button>
      </div>
    </div>

    <div id="aloc-resumo">${htmlResumoAlocacao(p)}</div>

    ${pessoas.length ? `<div class="cartao" style="overflow-x:auto;padding-bottom:6px">
      <table class="aloc-tab">
        <thead><tr>
          <th>Docente</th><th>Componente</th><th>Meta</th><th>Aprovados / meta</th>
          <th>Criados</th><th>Em revisão</th><th>Devolv.</th><th>Recado</th>
        </tr></thead>
        ${grupos}
      </table>
    </div>` : `<div class="vazio">Nenhum docente para alocar.${modoNuvem ? ' Cadastre a equipe em Administração.' : ''}</div>`}
  </div></div>
  <p class="nota-tela"><strong>A meta é por prova.</strong> A mesma pessoa pode ter metas diferentes no 9º ano e na 3ª série — troque de prova no menu à esquerda para alocar cada uma. Campo em branco significa <em>sem meta</em>, que é diferente de meta zero: quem está sem meta não aparece cobrado no painel dele. O <strong>recado</strong> aparece no painel do docente, junto da meta. Cada campo é gravado ao sair dele, como no resto do sistema.</p>`;
}

// Resumo da alocação: os três cartões e a conferência. Fica numa função à
// parte porque é a única coisa que muda quando uma meta é digitada — e a tela
// atualiza só este pedaço, sem remontar a tabela.
//
// Remontar tudo custaria o foco: a coordenação digita meta, tecla Tab, e o
// campo de destino deixaria de existir no meio do caminho. Com 22 docentes por
// prova, isso torna a tela inutilizável para o uso que ela tem.
function htmlResumoAlocacao(p) {
  const soma = somaDasMetas(p.id);
  const b = balancoDaProva(p.id);
  const pessoas = docentesAlocaveis();
  const semMeta = pessoas.filter(d => !alocacaoDe(p.id, d.chave)?.meta).length;

  const conf = [];
  if (!b.totalQuestoes)
    conf.push('a quantidade de questões desta prova ainda não foi definida — defina no Painel, em “⚙ Configurar prova”, para a soma das metas ter com o que ser comparada');
  else if (soma !== b.totalQuestoes)
    conf.push(`as metas somam <b>${soma}</b> e a prova pede <b>${b.totalQuestoes}</b> — ${
      soma < b.totalQuestoes ? `faltam <b>${b.totalQuestoes - soma}</b> por alocar` : `há <b>${soma - b.totalQuestoes}</b> além do tamanho da prova`}`);
  if (b.slots && soma > b.slots)
    conf.push(`os textos-base comportam <b>${b.slots}</b> ${b.slots === 1 ? 'item' : 'itens'}, menos do que as metas somam`);
  if (semMeta && pessoas.length)
    conf.push(`${semMeta} ${semMeta === 1 ? 'docente está' : 'docentes estão'} sem meta nesta prova`);

  return `
    <div class="grade g3" style="margin-bottom:16px">
      <div class="cartao vivo"><h3><span class="pingo" style="background:var(--azul)"></span>Alocado</h3>
        <div class="num">${soma}<small>${b.totalQuestoes ? ` / ${b.totalQuestoes} da prova` : ' de um total ainda a definir'}</small></div>
        <div class="barra"><i style="width:${b.totalQuestoes ? Math.min(100, soma / b.totalQuestoes * 100) : 0}%"></i></div></div>
      <div class="cartao vivo"><h3><span class="pingo" style="background:var(--verde)"></span>Já aprovado</h3>
        <div class="num">${b.aprovados}<small>${soma ? ` / ${soma} alocados` : ''}</small></div>
        <div class="barra"><i style="width:${soma ? Math.min(100, b.aprovados / soma * 100) : 0}%"></i></div></div>
      <div class="cartao vivo"><h3><span class="pingo" style="background:var(--rosa)"></span>Docentes com meta</h3>
        <div class="num">${pessoas.length - semMeta}<small> / ${pessoas.length}</small></div></div>
    </div>
    ${conf.length ? `<div class="cartao aviso" style="margin-bottom:16px">
      <h3>Conferência da alocação</h3>
      <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7">${conf.map(c => `<li>${c}</li>`).join('')}</ul>
    </div>` : ''}`;
}

const rotuloSomaArea = n => `${n} ${n === 1 ? 'item alocado' : 'itens alocados'}`;

// Guarda e sincroniza sem remontar a tela, e atualiza à mão tudo o que depende
// da meta: a barra daquela linha, o subtotal da área e o resumo do topo. Um
// número que não acompanha é pior que número nenhum — a coordenação passa a
// desconfiar da tela inteira.
function alocacaoMudou(provaId, chave) {
  save(S);
  PERS.alocacao(provaId, chave);
  const p = provaPorId(provaId);
  if (!p) return;

  $('#aloc-resumo').innerHTML = htmlResumoAlocacao(p);

  const cel = document.querySelector(`[data-barra="${CSS.escape(chave)}"]`);
  if (cel) cel.innerHTML = progressoDaMeta(producaoDe(provaId, chave).aprovados,
                                           alocacaoDe(provaId, chave)?.meta || 0);

  // Subtotais por área, recalculados dos dados — não incrementados a partir do
  // que está na tela.
  const porArea = {};
  for (const d of docentesAlocaveis()) {
    const area = areaDoComponente(d.componente) || 'Sem área definida';
    porArea[area] = (porArea[area] || 0) + (alocacaoDe(provaId, d.chave)?.meta || 0);
  }
  for (const th of document.querySelectorAll('[data-soma-area]'))
    th.textContent = rotuloSomaArea(porArea[th.dataset.somaArea] || 0);
}

// Meta vazia apaga a alocação em vez de gravar zero.
function alocacaoParaEditar(provaId, chave) {
  S.alocacoes[provaId] = S.alocacoes[provaId] || {};
  const pessoa = docentesAlocaveis().find(d => d.chave === chave);
  return S.alocacoes[provaId][chave] || (S.alocacoes[provaId][chave] = {
    meta: 0, observacao: '',
    nome: pessoa?.nome || chave, componente: pessoa?.componente || null
  });
}
MUDS['aloc-meta'] = (d, el) => {
  const provaId = idProvaAtual();
  const n = parseInt(el.value, 10);
  const a = alocacaoParaEditar(provaId, d.chave);
  a.meta = Number.isFinite(n) && n > 0 ? n : 0;
  if (!a.meta && !a.observacao) delete S.alocacoes[provaId][d.chave];
  alocacaoMudou(provaId, d.chave);
};
MUDS['aloc-obs'] = (d, el) => {
  const provaId = idProvaAtual();
  const a = alocacaoParaEditar(provaId, d.chave);
  a.observacao = el.value.trim();
  if (!a.meta && !a.observacao) delete S.alocacoes[provaId][d.chave];
  alocacaoMudou(provaId, d.chave);
};

ACOES['aloc-dividir'] = () => {
  const p = provaAtual();
  const pessoas = docentesAlocaveis();
  if (!p || !pessoas.length) return;
  // A referência é a prova REGULAR: é o caderno completo, e a adaptada deriva
  // dele. Dividir pela adaptada deixaria a regular sem quem escrevesse.
  const alvo = totalDeQuestoes(p, 'regular');
  if (!alvo) {
    toast('Defina a quantidade de questões da prova regular primeiro, no Painel.');
    return;
  }
  // Divisão inteira com o resto nas primeiras: a soma fecha exatamente com o
  // tamanho da prova, sem sobra nem falta.
  const base = Math.floor(alvo / pessoas.length);
  const resto = alvo % pessoas.length;
  abrirDlg(`
    <div class="dlg-cab"><h2>Dividir ${alvo} itens igualmente?</h2>
      <button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo"><p style="margin-top:0">Cada um dos <b>${pessoas.length}</b> docentes fica com
      <b>${base}</b> ${base === 1 ? 'item' : 'itens'}${resto ? `, e os ${resto} primeiros da lista recebem um a mais` : ''}.
      Isto <b>substitui as metas já definidas</b> nesta prova; os recados são preservados.</p></div>
    <div class="dlg-pe"><button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="aloc-dividir-ok">Dividir</button></div>`);
};
ACOES['aloc-dividir-ok'] = () => {
  const p = provaAtual();
  const pessoas = docentesAlocaveis();
  const alvo = totalDeQuestoes(p, 'regular');
  if (!alvo) return;
  const base = Math.floor(alvo / pessoas.length);
  const resto = alvo % pessoas.length;
  pessoas.forEach((d, ix) => {
    const a = alocacaoParaEditar(p.id, d.chave);
    a.meta = base + (ix < resto ? 1 : 0);
    if (!a.meta && !a.observacao) delete S.alocacoes[p.id][d.chave];
  });
  $('#dlg').close(); commit(); PERS.alocacoes(p.id);
  toast(`${alvo} itens divididos entre ${pessoas.length} docentes.`);
};

ACOES['aloc-copiar'] = () => {
  const p = provaAtual();
  const outras = provasOrdenadas().filter(x => x.id !== p.id && somaDasMetas(x.id) > 0);
  if (!outras.length) { toast('Nenhuma outra prova tem metas para copiar.'); return; }
  abrirDlg(`
    <div class="dlg-cab"><h2>Copiar metas para ${esc(p.serie)}</h2>
      <button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      <div class="campo"><label>Copiar as metas de</label>
        <select class="caixa" id="aloc-de">${outras.map(x =>
          `<option value="${esc(x.id)}">${esc(x.serie)} — ${esc(x.etapa)} (${somaDasMetas(x.id)} itens)</option>`).join('')}</select></div>
      <p style="font-size:12.5px;color:var(--ink-2);margin:10px 0 0">Substitui as metas desta prova pelas da prova
        escolhida, docente por docente. Útil quando a distribuição entre as séries é a mesma. Os recados não são copiados.</p>
    </div>
    <div class="dlg-pe"><button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="aloc-copiar-ok">Copiar</button></div>`);
};
ACOES['aloc-copiar-ok'] = () => {
  const p = provaAtual();
  const de = $('#aloc-de').value;
  const origem = S.alocacoes?.[de] || {};
  S.alocacoes[p.id] = {};
  for (const [chave, a] of Object.entries(origem))
    if (a.meta) S.alocacoes[p.id][chave] = { ...a, observacao: '' };
  $('#dlg').close(); commit(); PERS.alocacoes(p.id);
  toast(`Metas copiadas de ${provaPorId(de)?.serie}.`);
};

ACOES['aloc-limpar'] = () => {
  const p = provaAtual();
  abrirDlg(`
    <div class="dlg-cab"><h2>Limpar as metas de ${esc(p.serie)}?</h2>
      <button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo"><p style="margin-top:0">Todos os docentes ficam <b>sem meta</b> nesta prova, e os recados
      são apagados. Os itens já escritos não são tocados.</p></div>
    <div class="dlg-pe"><button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn vermelho" data-acao="aloc-limpar-ok">Limpar metas</button></div>`);
};
ACOES['aloc-limpar-ok'] = () => {
  const p = provaAtual();
  S.alocacoes[p.id] = {};
  $('#dlg').close(); commit(); PERS.alocacoes(p.id);
  toast('Metas limpas.');
};

/* ================= TELA 3 · TEXTOS ================= */
function telaTextos() {
  const pAtiva = provaAtual();
  if (!pAtiva) {
    $('#app').innerHTML = '<div class="quadro"><div class="miolo"><div class="vazio">Nenhuma prova cadastrada — crie a primeira no Painel.</div></div></div>';
    return;
  }
  const aprovados = textosAprovados(pAtiva.id);
  const blocos = aprovados.map((t, ti) => {
    const itens = S.itens.filter(i => i.textoId === t.id);
    const livres = Math.max(0, (t.slots || 0) - itens.length);
    const chips = itens.map((i, ii) => `
      <span class="slot" data-acao="abrir-item" data-id="${i.id}" role="button" tabindex="0"
        title="${esc(STATUS_ITEM[i.status].rot)}" style="cursor:pointer;${souEu(i) ? 'background:color-mix(in srgb,var(--verde) 12%,transparent)' : ''}">
        <span class="t t${i.tipo}">${i.tipo}</span>${discChip(i.componente)} ${esc(i.autor.split(' ')[0])}${i.status !== 'aprovado' ? ' ·⏳' : ''}
        ${ehCoord() ? `
          <button class="mv" data-acao="item-mover" data-id="${i.id}" data-dir="-1" title="Mover item para a esquerda" ${ii === 0 ? 'disabled' : ''}>◀</button>
          <button class="mv" data-acao="item-mover" data-id="${i.id}" data-dir="1" title="Mover item para a direita" ${ii === itens.length - 1 ? 'disabled' : ''}>▶</button>` : ''}
      </span>`).join('');
    const slotsLivres = Array.from({ length: livres }, () =>
      `<button class="slot livre" data-acao="novo-item" data-texto="${t.id}">＋ espaço livre — alocar item</button>`).join('');
    return `
    <div class="texto-bloco">
      <div class="texto-cab">
        <div class="tnum">${t.numero}</div>
        <div style="flex:1;min-width:200px">
          <h4>${esc(t.titulo)}</h4>
          <p>${t.slots} itens no total · ${itens.length} alocados · ${livres} livres</p>
        </div>
        ${t.regra ? `<span class="regra">🔒 ${esc(t.regra)}</span>` : '<span class="regra">sem restrições</span>'}
        ${ehCoord() ? `
          <span style="display:inline-flex;gap:4px">
            <button class="mv" data-acao="texto-mover" data-id="${t.id}" data-dir="-1" title="Mover texto para cima" ${ti === 0 ? 'disabled' : ''}>▲</button>
            <button class="mv" data-acao="texto-mover" data-id="${t.id}" data-dir="1" title="Mover texto para baixo" ${ti === aprovados.length - 1 ? 'disabled' : ''}>▼</button>
          </span>
          <button class="btn mini fantasma" data-acao="editar-texto" data-id="${t.id}">Editar</button>` : ''}
      </div>
      <div class="texto-corpo"><div class="slots">${chips}${slotsLivres}</div></div>
    </div>`;
  }).join('');

  const sugestoes = textosDaProva(pAtiva.id).filter(t => t.status === 'sugestao').map(t => `
    <div class="texto-bloco sugestao">
      <div class="texto-cab" style="background:color-mix(in srgb,var(--amarelo) 20%,transparent)">
        <div class="tnum" style="background:var(--amarelo);color:#5c4300">S</div>
        <div style="flex:1;min-width:200px">
          <h4>${esc(t.titulo)}</h4>
          <p>enviada por ${esc(t.sugeridoPor || '—')} · fonte: ${esc(t.fonte)}</p>
        </div>
        <span class="chip pend">Aguardando aprovação da coordenação</span>
        ${ehCoord() ? `<button class="btn mini verde" data-acao="aprovar-texto" data-id="${t.id}">Aprovar</button>
          <button class="btn mini fantasma" data-acao="editar-texto" data-id="${t.id}">Ver/editar</button>` : ''}
      </div>
    </div>`).join('');

  $('#app').innerHTML = `
  <div class="quadro"><div class="miolo">
    <div class="cab-tela">
      <div><h2>Textos-base — ${esc(pAtiva.serie)}</h2>
        <span class="sub">${esc(pAtiva.etapa)} · Clique em um espaço livre para alocar um item seu · clique em um item para abri-lo</span></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="chip info">Sua produção nesta prova: ${minhaProducao(pAtiva.id).criados} ${minhaProducao(pAtiva.id).criados === 1 ? 'item' : 'itens'}</span>
        ${ehCoord()
          ? '<button class="btn" data-acao="novo-texto">+ Novo texto</button>'
          : '<button class="btn verde" data-acao="sugerir-texto">+ Sugerir novo texto</button>'}
      </div>
    </div>
    ${blocos || '<div class="vazio">Nenhum texto-base aprovado ainda.' + (ehCoord() ? ' Crie o primeiro com “+ Novo texto”.' : ' Sugira um texto para a coordenação aprovar.') + '</div>'}
    ${sugestoes}
  </div></div>
  <p class="nota-tela"><strong>Modelo de alocação:</strong> cada texto tem uma quantidade de itens, sem amarração prévia a disciplinas — qualquer docente ocupa um espaço livre com item do tipo que escolher. A coordenação pode registrar regras por texto (informativas nesta fase) e aprova as sugestões de texto dos docentes.</p>`;
}

function dlgTexto(t) {
  const novo = !t;
  corpoTextoRico = (t?.linhas || []).join('<br>');
  abrirDlg(`
    <div class="dlg-cab"><h2>${novo ? (ehCoord() ? 'Novo texto-base' : 'Sugerir texto-base') : 'Editar texto-base'}</h2>
      <button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      <div class="form-linha">
        <div class="campo" style="min-width:260px"><label>Título</label>
          <input class="caixa" id="tx-titulo" value="${esc(t?.titulo || '')}" placeholder="ex.: “O Cerrado e as veredas” — Guimarães Rosa (adapt.)"></div>
        <div class="campo"><label>Fonte</label><input class="caixa" id="tx-fonte" value="${esc(t?.fonte || '')}" placeholder="autor / obra / veículo, ano"></div>
      </div>
      <div class="campo" style="margin-bottom:12px"><label>Corpo do texto</label>
        ${editorRico({ campo: 'txCorpo', valor: (t?.linhas || []).join('<br>'), linhas: 9,
                       rotulo: 'Corpo do texto-base' })}
        <p style="font-size:12px;color:var(--ink-2);margin:6px 0 0">Uma linha por linha do texto. Aceita ênfase e
          notação matemática, como o enunciado do item — a fórmula entre <code>$…$</code>. Em prosa, uma
          <b>linha em branco</b> separa parágrafos.</p></div>
      ${ehCoord() ? `<div class="form-linha">
        <div class="campo"><label>Quantidade de itens (slots)</label>
          <input class="caixa" type="number" min="1" max="40" id="tx-slots" value="${t?.slots ?? 6}"></div>
        <div class="campo" style="min-width:260px"><label>Regra do coordenador (opcional)</label>
          <input class="caixa" id="tx-regra" value="${esc(t?.regra || '')}" placeholder="ex.: sem itens tipo D neste texto"></div>
      </div>
      <div class="campo" style="margin-bottom:12px"><label>Abertura do comando no caderno</label>
        <input class="caixa" id="tx-comando" value="${esc(t?.comando || '')}"
          placeholder="Considerando o texto precedente e os múltiplos aspectos a ele relacionados">
        <p style="font-size:12px;color:var(--ink-2);margin:6px 0 0">O resto da frase o sistema monta sozinho pelos tipos dos itens alocados —
          “<em>, julgue os itens de 11 a 19 e assinale a opção correta no item 20, que é do tipo C.</em>”</p></div>
      <div class="campo"><label>Formato no caderno</label>
        <select class="caixa" id="tx-formato">
          <option value="prosa" ${(t?.formato || 'prosa') === 'prosa' ? 'selected' : ''}>Prosa — o texto reflui e é justificado</option>
          <option value="verso" ${t?.formato === 'verso' ? 'selected' : ''}>Verso — mantém as quebras de linha (canções, poemas)</option>
          <option value="numerado" ${t?.formato === 'numerado' ? 'selected' : ''}>Linhas numeradas — só se algum item citar linhas</option>
        </select>
        <p style="font-size:12px;color:var(--ink-2);margin:6px 0 0">Em prosa, uma linha em branco separa parágrafos.
          O PAS não numera linhas dos textos-base.</p></div>` : ''}
      ${!ehCoord() && novo ? '<p style="font-size:12.5px;color:var(--ink-2)">Sua sugestão ficará visível a todos após aprovação da coordenação, que define a quantidade de itens do texto.</p>' : ''}
    </div>
    <div class="dlg-pe">
      ${!novo && ehCoord() ? `<button class="btn vermelho" style="margin-right:auto" data-acao="excluir-texto" data-id="${t.id}">Excluir</button>` : ''}
      <button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="salvar-texto" data-id="${t?.id || ''}">${novo && !ehCoord() ? 'Enviar sugestão' : 'Salvar'}</button>
    </div>`);
}
ACOES['novo-texto'] = () => dlgTexto(null);
ACOES['sugerir-texto'] = () => dlgTexto(null);
ACOES['editar-texto'] = d => dlgTexto(S.textos.find(t => t.id === d.id));
// O editor rico entrega uma string; cada <br> é uma linha do texto-base. Guardar
// linha a linha (e não um bloco só) é o que permite ao editor de item numerar e
// destacar a faixa que o item cita.
//
// As linhas em branco do meio ficam: elas separam parágrafo na prosa. Só as das
// pontas caem.
function linhasDoCorpoRico(html) {
  const linhas = String(html || '')
    .split(/<br\s*\/?>/i)
    .map(l => l.replace(/^(\s|&nbsp;|<div>|<\/div>)+|(\s|&nbsp;|<div>|<\/div>)+$/gi, '').trim());
  while (linhas.length && ricoVazio(linhas[0])) linhas.shift();
  while (linhas.length && ricoVazio(linhas[linhas.length - 1])) linhas.pop();
  return linhas;
}

ACOES['salvar-texto'] = d => {
  const anterior = d.id ? S.textos.find(t => t.id === d.id) : null;
  const dados = {
    titulo: $('#tx-titulo').value.trim(),
    fonte: $('#tx-fonte').value.trim(),
    // linhas em branco no meio são separadores de parágrafo — só as das pontas caem
    linhas: linhasDoCorpoRico(corpoTextoRico),
    slots: ehCoord() ? Math.max(1, parseInt($('#tx-slots').value, 10) || 6) : (anterior?.slots ?? 6),
    regra: ehCoord() && $('#tx-regra') ? $('#tx-regra').value.trim() : (anterior?.regra || ''),
    comando: ehCoord() && $('#tx-comando') ? $('#tx-comando').value.trim() : (anterior?.comando || ''),
    formato: ehCoord() && $('#tx-formato') ? $('#tx-formato').value : (anterior?.formato || 'prosa')
  };
  if (!dados.titulo || !dados.fonte || !dados.linhas.some(l => !ricoVazio(l))) {
    toast('Título, fonte e corpo do texto são obrigatórios.'); return;
  }
  // A numeração dos textos é por prova: o Texto 1 do 9º ano e o Texto 1 da
  // 1ª série convivem sem se atropelar.
  const provaId = anterior?.provaId || idProvaAtual();
  let alvo;
  if (anterior) {
    Object.assign(anterior, dados); alvo = anterior;
  } else if (ehCoord()) {
    alvo = { id: uid(), provaId, numero: Math.max(0, ...textosAprovados(provaId).map(t => t.numero)) + 1, status: 'aprovado', sugeridoPor: null, ...dados };
    S.textos.push(alvo);
  } else {
    alvo = { id: uid(), provaId, numero: null, status: 'sugestao', sugeridoPor: `${S.perfil.nome} (${S.perfil.componente || 'docente'})`, ...dados };
    S.textos.push(alvo);
  }
  $('#dlg').close(); commit(); PERS.texto(alvo);
  toast(anterior ? 'Texto atualizado.' : (ehCoord() ? 'Texto criado.' : 'Sugestão enviada à coordenação.'));
};
ACOES['aprovar-texto'] = d => {
  const t = S.textos.find(x => x.id === d.id);
  t.status = 'aprovado';
  t.numero = Math.max(0, ...textosAprovados(t.provaId).filter(x => x.id !== t.id).map(x => x.numero)) + 1;
  commit(); PERS.texto(t); toast(`Texto aprovado como Texto ${t.numero}.`);
};
ACOES['excluir-texto'] = d => {
  const usados = S.itens.filter(i => i.textoId === d.id).length;
  if (usados) { toast(`Este texto tem ${usados} item(ns) alocado(s) — remova-os antes.`); return; }
  S.textos = S.textos.filter(t => t.id !== d.id);
  $('#dlg').close(); commit(); PERS.removerTexto(d.id); toast('Texto excluído.');
};
ACOES['texto-mover'] = d => {
  const alvo = S.textos.find(t => t.id === d.id);
  if (!alvo) return;
  const lista = textosAprovados(alvo.provaId);
  const i = lista.findIndex(t => t.id === d.id);
  const j = i + parseInt(d.dir, 10);
  if (i < 0 || j < 0 || j >= lista.length) return;
  [lista[i].numero, lista[j].numero] = [lista[j].numero, lista[i].numero];
  // Renumera só os textos desta prova — os das outras não se mexem.
  textosAprovados(alvo.provaId).forEach((t, k) => t.numero = k + 1);
  commit();
  if (modoNuvem) nuvem.gravarLinhas('textos', textosDaProva(alvo.provaId)).catch(PERS.falha);
};
ACOES['item-mover'] = d => {
  const item = S.itens.find(x => x.id === d.id);
  if (!item) return;
  const doTexto = S.itens.filter(i => i.textoId === item.textoId);
  const pos = doTexto.findIndex(i => i.id === d.id);
  const alvo = pos + parseInt(d.dir, 10);
  if (alvo < 0 || alvo >= doTexto.length) return;
  const gi = S.itens.indexOf(doTexto[pos]), gj = S.itens.indexOf(doTexto[alvo]);
  [S.itens[gi], S.itens[gj]] = [S.itens[gj], S.itens[gi]];
  commit(); PERS.itens([S.itens[gi].id, S.itens[gj].id]);
};

/* ================= TELA 4 · ITENS ================= */
let filtroStatus = 'todos', soMeus = false, soMinhaArea = false, todasAsProvas = false;
function telaItens() {
  if (telaItens._primeiraVez === undefined) {
    telaItens._primeiraVez = false;
    if (S.perfil.papel === 'docente') soMeus = true;
    if (ehCoordArea()) soMinhaArea = true;
  }
  const pAtiva = provaAtual();
  // O docente escreve para mais de uma série; a revisão da coordenação é
  // sempre dentro de uma prova. Por isso o filtro de prova pode ser desligado.
  const lista = S.itens.filter(i =>
    (todasAsProvas || i.provaId === pAtiva?.id) &&
    (filtroStatus === 'todos' || i.status === filtroStatus) &&
    (!soMeus || souEu(i)) &&
    (!soMinhaArea || areaDoComponente(i.componente) === S.perfil.area));
  const linhas = lista.map(i => {
    const t = textoDe(i);
    const st = STATUS_ITEM[i.status];
    const pr = provaPorId(i.provaId);
    return `<tr class="clic" data-acao="abrir-item" data-id="${i.id}">
      ${todasAsProvas ? `<td><b>${esc(pr?.serie || '—')}</b></td>` : ''}
      <td>Texto ${t?.numero ?? '—'}</td>
      <td class="it-enun" title="${esc(simples(i.enunciado).slice(0, 300))}"><div>${rico(i.enunciado)}</div></td>
      <td><span class="t t${i.tipo}" style="display:inline-grid;width:22px;height:22px;place-items:center;border-radius:6px;color:#fff;font-size:11px;font-weight:800">${i.tipo}</span></td>
      <td>${discChip(i.componente)}<br><span style="font-size:11px;color:var(--ink-2)">${esc(areaDoComponente(i.componente) || '—')}</span></td>
      <td>${esc(i.autor)}</td>
      <td style="text-transform:capitalize">${esc(i.versao)}</td>
      <td><span class="chip ${st.cls}">${st.rot}</span></td>
    </tr>`;
  }).join('');
  const ops = ['todos', ...Object.keys(STATUS_ITEM)].map(s =>
    `<option value="${s}" ${filtroStatus === s ? 'selected' : ''}>${s === 'todos' ? 'Todos os status' : STATUS_ITEM[s].rot}</option>`).join('');

  $('#app').innerHTML = `
  <div class="quadro"><div class="miolo">
    <div class="cab-tela">
      <div><h2>Itens e fluxo de revisão${todasAsProvas ? '' : ` — ${esc(pAtiva?.serie || '')}`}</h2>
        <span class="sub">docente → coordenação de área → coordenação geral → aprovado</span></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select class="caixa" style="width:auto" data-mud="filtro-status">${ops}</select>
        <label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700">
          <input type="checkbox" data-mud="todas-provas" ${todasAsProvas ? 'checked' : ''}> todas as provas</label>
        <label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700">
          <input type="checkbox" data-mud="so-meus" ${soMeus ? 'checked' : ''}> só meus itens</label>
        ${ehCoordArea() ? `<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700">
          <input type="checkbox" data-mud="so-area" ${soMinhaArea ? 'checked' : ''}> só a minha área</label>` : ''}
        <button class="btn" data-acao="novo-item">+ Novo item</button>
      </div>
    </div>
    ${linhas ? `<table><thead><tr>${todasAsProvas ? '<th>Prova</th>' : ''}<th>Texto</th><th>Enunciado</th><th>Tipo</th><th>Componente</th><th>Autor</th><th>Versão</th><th>Status</th></tr></thead>
      <tbody>${linhas}</tbody></table>`
      : '<div class="vazio">Nenhum item neste filtro. Crie um item pelos espaços livres em “Textos e alocação” ou pelo botão acima.</div>'}
  </div></div>
  <p class="nota-tela"><strong>Fluxo:</strong> o docente redige e envia; a coordenação comenta, devolve ou aprova em dois níveis. Só itens <strong>aprovados</strong> entram no caderno, no cartão e na correção. O campo “Versão” define se o item vale para a prova regular, a adaptada ou ambas.</p>`;
}
MUDS['filtro-status'] = (d, el) => { filtroStatus = el.value; render(); };
MUDS['todas-provas'] = (d, el) => { todasAsProvas = el.checked; render(); };
MUDS['so-meus'] = (d, el) => { soMeus = el.checked; render(); };
MUDS['so-area'] = (d, el) => { soMinhaArea = el.checked; render(); };

/* ----- editor de item (diálogo) ----- */
let rasc = null; // cópia de trabalho do item aberto

function novoRascunho(textoId) {
  // O item nasce na prova em que o texto-base está; sem texto escolhido, na
  // prova que está na tela.
  const doTexto = textoId ? S.textos.find(t => t.id === textoId) : null;
  const provaId = doTexto?.provaId || idProvaAtual();
  return {
    id: null, provaId, textoId: textoId || textosAprovados(provaId)[0]?.id || null,
    tipo: 'A', componente: S.perfil.componente || 'Português',
    autor: S.perfil.nome, autorEmail: S.perfil.email || null,
    habilidade: '', grupo: 'Interpretar', versao: 'ambas',
    linhasRef: '', gabarito: 'C', opcoes: ['', '', '', ''],
    enunciado: '', status: 'rascunho', comentarios: []
  };
}

ACOES['novo-item'] = d => {
  if (!textosAprovados().length) {
    toast(`A prova de ${provaAtual()?.serie || 'esta série'} ainda não tem texto-base aprovado.`); return;
  }
  rasc = novoRascunho(d.texto);
  dlgItem();
};
ACOES['abrir-item'] = d => {
  const i = S.itens.find(x => x.id === d.id);
  rasc = JSON.parse(JSON.stringify(i));
  if (!rasc.opcoes || rasc.opcoes.length < 4) rasc.opcoes = ['', '', '', ''];
  dlgItem();
};

function faixaLinhas(ref) {
  const m = String(ref || '').match(/(\d+)\s*[-–a]\s*(\d+)/);
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  const um = String(ref || '').match(/(\d+)/);
  return um ? [parseInt(um[1], 10), parseInt(um[1], 10)] : null;
}

function dlgItem() {
  const t = S.textos.find(x => x.id === rasc.textoId);
  const st = STATUS_ITEM[rasc.status];
  const fx = faixaLinhas(rasc.linhasRef);
  const linhasTx = (t?.linhas || []).map((l, i) => {
    const n = i + 1;
    const marca = fx && n >= fx[0] && n <= fx[1] ? ' mark' : '';
    return `<div class="linha-tx${marca}"><span class="n">${n}</span><span>${rico(l)}</span></div>`;
  }).join('');
  // Só os textos da prova do item: mover um item para o texto de outra série
  // quebraria a numeração das duas.
  const opsTexto = textosAprovados(rasc.provaId).map(x =>
    `<option value="${x.id}" ${x.id === rasc.textoId ? 'selected' : ''}>Texto ${x.numero} — ${esc(x.titulo.slice(0, 48))}</option>`).join('');
  const opsComp = opcoesComponente(rasc.componente);

  const segTipo = Object.keys(TIPOS).map(tp =>
    `<button class="${rasc.tipo === tp ? 'sel' : ''}" data-acao="it-tipo" data-v="${tp}" title="${TIPOS[tp].rotulo}">${tp}</button>`).join('');
  const segGrupo = GRUPOS.map(g =>
    `<button class="${rasc.grupo === g ? 'sel' : ''}" data-acao="it-grupo" data-v="${g}">${g}</button>`).join('');
  const segVersao = ['regular', 'adaptada', 'ambas'].map(v =>
    `<button class="${rasc.versao === v ? 'sel' : ''}" data-acao="it-versao" data-v="${v}" style="text-transform:capitalize">${v}</button>`).join('');

  let respostaHtml = '';
  if (rasc.tipo === 'B') {
    respostaHtml = `<div class="form-linha"><div class="campo"><label>Gabarito</label>
      <input class="caixa" style="width:110px;font-family:var(--mono)" maxlength="3" inputmode="numeric"
        data-mud="it-campo" data-campo="gabarito" value="${esc(rasc.gabarito)}" placeholder="000–999"></div></div>`;
  } else if (rasc.tipo === 'D') {
    respostaHtml = `
      <div class="campo" style="margin-bottom:12px"><label>Resposta esperada (guia de correção)</label>
        ${editorRico({ campo: 'gabarito', valor: rasc.gabarito || '', linhas: 3,
                       rotulo: 'O que se espera na resposta construída do estudante' })}</div>
      <div class="form-linha">
        <div class="campo" style="flex:0;min-width:160px"><label>Linhas de resposta</label>
          <input class="caixa" type="number" min="1" max="40" data-mud="it-dlinhas" value="${rasc.dLinhas ?? 10}"></div>
        <div class="campo" style="flex:0"><label>Espaço de resposta</label>
          <div class="seg">
            <button class="${rasc.dPauta !== false ? 'sel' : ''}" data-acao="it-dpauta" data-v="1">Com linhas</button>
            <button class="${rasc.dPauta === false ? 'sel' : ''}" data-acao="it-dpauta" data-v="0">Sem linhas</button>
          </div></div>
      </div>
      <p style="font-size:12px;color:var(--ink-2);margin:0 0 12px">Mesmo sem linhas impressas, a quantidade define o espaço reservado à resposta no caderno. Itens discursivos não entram no cartão-resposta — a nota (0 a 10) é lançada na tela de Correção pelo docente responsável.</p>`;
  } else {
    respostaHtml = `<div class="form-linha"><div class="campo"><label>Gabarito</label><div>` +
      TIPOS[rasc.tipo].respostas.map(r =>
        `<button class="gab-op ${String(rasc.gabarito).toUpperCase() === r ? 'certo' : ''}" data-acao="it-gab" data-v="${r}">${r}</button>`).join('') +
      `</div></div></div>`;
  }
  const opcoesHtml = rasc.tipo === 'C' ? `
    <div class="campo" style="margin-bottom:12px"><label>Opções (A a D)</label>
      ${['A', 'B', 'C', 'D'].map((L, i) => `
        <div class="it-opcao">
          <b>${L}</b>
          ${editorRico({ campo: 'opcao', i, valor: rasc.opcoes[i] || '', linhas: 1,
                         rotulo: 'Opção ' + L })}
        </div>`).join('')}
    </div>` : '';

  const fio = (rasc.comentarios || []).map((c, i) => `
    <div class="coment ${i % 2 ? 'resp' : ''}">
      <div class="avatar">${esc(c.autor.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase())}</div>
      <div class="balao"><b>${esc(c.autor)} · ${esc(c.papel)}</b><span class="quando">${esc(c.quando)}</span>
        <p>${esc(c.texto)}</p></div>
    </div>`).join('');

  // Quem faz o quê no fluxo: quem escreveu envia; a coordenação da área do
  // item decide a 1ª etapa; a coordenação geral decide a última.
  //
  // A barra diz para ONDE cada ação leva o item, não só o que ela faz: a
  // dúvida recorrente é se “Salvar” já manda para a revisão. Salvar guarda e
  // deixa o item onde está; quem move é sempre um botão colorido.
  const meuItem = souEu(rasc);
  const acoes = [];
  if ((meuItem || ehCoord()) && ['rascunho', 'devolvido'].includes(rasc.status))
    acoes.push({ cls: 'rosa', acao: 'it-enviar', rot: 'Enviar para revisão',
                 dica: 'vai para a coordenação de ' + (areaDoComponente(rasc.componente) || 'área') });
  if (rasc.status === 'area' && revisaArea(rasc))
    acoes.push({ cls: 'verde', acao: 'it-aprovar-area', rot: 'Aprovar', dica: 'segue para a coordenação geral' },
               { cls: 'vermelho', acao: 'it-devolver', rot: 'Devolver', dica: 'volta para ' + (rasc.autor || 'quem escreveu') });
  if (rasc.status === 'geral' && ehCoord())
    acoes.push({ cls: 'verde', acao: 'it-aprovar', rot: 'Aprovar item', dica: 'entra no caderno da prova' },
               { cls: 'vermelho', acao: 'it-devolver', rot: 'Devolver', dica: 'volta para ' + (rasc.autor || 'quem escreveu') });
  if (rasc.status === 'aprovado' && ehCoord())
    acoes.push({ cls: 'fantasma', acao: 'it-reabrir', rot: 'Reabrir revisão', dica: 'sai do caderno até ser aprovado de novo' });

  const podeExcluir = rasc.id && (ehCoord() || (meuItem && rasc.status === 'rascunho'));
  const botoes = `
    ${podeExcluir ? `<button class="btn vermelho fantasma pe-excluir" data-acao="it-excluir"
        title="Apagar este item definitivamente">Excluir</button>` : ''}
    <button class="btn fantasma" data-acao="fechar-dlg">Fechar</button>
    <button class="btn" data-acao="it-salvar" title="Guarda as alterações e mantém o item onde está">Salvar</button>
    ${acoes.map(a => `<button class="btn ${a.cls}" data-acao="${a.acao}">
      ${esc(a.rot)}<small class="pe-dica">${esc(a.dica)}</small></button>`).join('')}`;

  abrirDlg(`
    <div class="dlg-cab">
      <h2>${rasc.id ? 'Item' : 'Novo item'} · ${esc(provaPorId(rasc.provaId)?.serie || '')}${t ? ' · Texto ' + t.numero : ''} <span class="chip ${st.cls}">${st.rot}</span></h2>
      <button class="fechar-x" data-acao="fechar-dlg">✕</button>
    </div>
    <div class="dlg-corpo">
      <div class="grade g2">
        <div>
          <div class="painel-texto">
            <h4>${t ? 'Texto ' + t.numero + ' — ' + esc(t.titulo) : 'Selecione um texto'}</h4>
            <div class="fonte">${esc(t?.fonte || '')}${rasc.linhasRef ? ' · linhas ' + esc(rasc.linhasRef) : ''}</div>
            ${linhasTx}
            <div style="margin-top:10px;font-size:11.5px;color:var(--ink-2)">💡 As linhas destacadas em amarelo são a referência deste item.</div>
          </div>
        </div>
        <div>
          <div class="form-linha">
            <div class="campo" style="min-width:220px"><label>Texto-base</label>
              <select class="caixa" data-mud="it-texto">${opsTexto}</select></div>
            <div class="campo"><label>Linhas de referência</label>
              <input class="caixa" data-mud="it-campo" data-campo="linhasRef" value="${esc(rasc.linhasRef)}" placeholder="ex.: 5-7"></div>
          </div>
          <div class="form-linha">
            <div class="campo" style="flex:0"><label>Tipo</label><div class="seg">${segTipo}</div></div>
            <div class="campo"><label>Componente</label><select class="caixa" data-mud="it-campo" data-campo="componente">${opsComp}</select></div>
          </div>
          <div class="form-linha">
            <div class="campo" style="flex:1 1 100%"><label>Versão da prova em que este item entra</label>
              <div class="seg">${segVersao}</div></div>
          </div>
          <div class="form-linha">
            <div class="campo"><label>Habilidade</label>
              <input class="caixa" data-mud="it-campo" data-campo="habilidade" value="${esc(rasc.habilidade)}" placeholder="ex.: H6 — Inferências"></div>
          </div>
          <div class="form-linha">
            <div class="campo" style="flex:1 1 100%"><label>Grupo de habilidades</label>
              <div class="seg">${segGrupo}</div></div>
          </div>
          <div class="campo" style="margin-bottom:12px"><label>Enunciado</label>
            ${editorRico({ campo: 'enunciado', valor: rasc.enunciado, linhas: 4,
                           rotulo: 'Enunciado do item' })}
            <p class="rico-ajuda">Fórmula entre <code>$…$</code> na linha e <code>$$…$$</code> em
              destaque, na notação do LaTeX — <code>$\\frac{1}{2}$</code>, <code>$x^2$</code>,
              <code>$\\sqrt{3}$</code>, <code>$30^\\circ$</code>. A prévia mostra como sai impresso.
              Valor em real não vira fórmula: “R$ 50,00” continua sendo R$ 50,00.</p></div>
          ${opcoesHtml}${respostaHtml}

          <h3 style="font-size:12.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-2);margin:16px 0 10px">Conversa da revisão</h3>
          <div class="fio">${fio || '<span style="font-size:13px;color:var(--ink-2)">Nenhum comentário ainda.</span>'}</div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <input class="caixa" id="it-novo-coment" placeholder="Escreva um comentário…" style="flex:1">
            <button class="btn fantasma" data-acao="it-comentar">Comentar</button>
          </div>
        </div>
      </div>
    </div>
    <div class="dlg-pe fixo">${botoes}</div>`, true);
}

function reabrirDlgItem() { dlgItem(); }
MUDS['it-texto'] = (d, el) => { rasc.textoId = el.value; reabrirDlgItem(); };
MUDS['it-campo'] = (d, el) => {
  rasc[el.dataset.campo] = el.value;
  if (el.dataset.campo === 'linhasRef') reabrirDlgItem();
};
MUDS['it-dlinhas'] = (d, el) => { rasc.dLinhas = Math.max(1, Math.min(40, parseInt(el.value, 10) || 10)); };

// Enunciado, opções e resposta esperada são editores ricos (js/rico.js), não
// <textarea>: recebem ênfase e notação matemática. O aviso de mudança NÃO
// chama `commit()` nem remonta o diálogo — remontar destruiria o cursor a cada
// tecla, o mesmo motivo já documentado em `alocacaoMudou()`.
// O corpo do texto-base também é rico, e o diálogo dele não tem `rasc`: o valor
// em edição fica aqui, e `salvar-texto` o lê. `dlgTexto` o semeia ao abrir.
let corpoTextoRico = '';

ligarEditoresRicos((campo, i, valor) => {
  if (campo === 'txCorpo') { corpoTextoRico = valor; return; }
  if (!rasc) return;
  if (campo === 'opcao') rasc.opcoes[Number(i)] = valor;
  else if (campo === 'enunciado' || campo === 'gabarito') rasc[campo] = valor;
});
ACOES['it-tipo'] = d => {
  rasc.tipo = d.v;
  if (d.v === 'B') rasc.gabarito = /^\d{1,3}$/.test(String(rasc.gabarito)) ? rasc.gabarito : '';
  else if (d.v === 'D') {
    rasc.dLinhas = rasc.dLinhas ?? 10;
    rasc.dPauta = rasc.dPauta ?? true;
    if (/^[A-E]$/.test(String(rasc.gabarito).toUpperCase())) rasc.gabarito = '';
  } else {
    rasc.gabarito = TIPOS[d.v].respostas.includes(String(rasc.gabarito).toUpperCase()) ? rasc.gabarito : TIPOS[d.v].respostas[0];
  }
  reabrirDlgItem();
};
ACOES['it-dpauta'] = d => { rasc.dPauta = d.v === '1'; reabrirDlgItem(); };
ACOES['it-grupo'] = d => { rasc.grupo = d.v; reabrirDlgItem(); };
ACOES['it-versao'] = d => { rasc.versao = d.v; reabrirDlgItem(); };
ACOES['it-gab'] = d => { rasc.gabarito = d.v; reabrirDlgItem(); };

function persistirRascunho() {
  // Enunciado agora é HTML: “vazio” pode ser <br> ou espaço inquebrável, e
  // `ricoVazio()` olha o texto por baixo da marcação.
  if (ricoVazio(rasc.enunciado)) { toast('Escreva o enunciado do item.'); return false; }
  if (rasc.tipo === 'B' && !/^\d{1,3}$/.test(String(rasc.gabarito).trim())) { toast('Gabarito do tipo B: número de 0 a 999.'); return false; }
  if (rasc.tipo === 'D' && !(rasc.dLinhas >= 1)) { toast('Informe a quantidade de linhas de resposta do item discursivo.'); return false; }
  if (!rasc.id) { rasc.id = uid(); S.itens.push(rasc); }
  else {
    const idx = S.itens.findIndex(i => i.id === rasc.id);
    S.itens[idx] = rasc;
  }
  PERS.item(rasc);
  return true;
}
ACOES['it-salvar'] = () => {
  if (!persistirRascunho()) return;
  $('#dlg').close(); commit(); toast('Item salvo.');
};
ACOES['it-enviar'] = () => {
  rasc.status = 'area';
  if (!persistirRascunho()) return;
  $('#dlg').close(); commit(); toast('Item enviado à coordenação de área.');
};
ACOES['it-aprovar-area'] = () => {
  rasc.status = 'geral';
  if (!persistirRascunho()) return;
  $('#dlg').close(); commit(); toast('Item aprovado na área — segue para a coordenação geral.');
};
ACOES['it-aprovar'] = () => {
  rasc.status = 'aprovado';
  if (!persistirRascunho()) return;
  $('#dlg').close(); commit(); toast('Item aprovado! Ele já entra no caderno e no cartão.');
};
ACOES['it-devolver'] = () => {
  rasc.status = 'devolvido';
  if (!persistirRascunho()) return;
  $('#dlg').close(); commit(); toast('Item devolvido ao docente com ajustes.');
};
ACOES['it-reabrir'] = () => {
  rasc.status = 'area';
  if (!persistirRascunho()) return;
  $('#dlg').close(); commit(); toast('Revisão reaberta.');
};
ACOES['it-comentar'] = () => {
  const inp = $('#it-novo-coment');
  const txt = inp.value.trim();
  if (!txt) return;
  rasc.comentarios = rasc.comentarios || [];
  rasc.comentarios.push({
    autor: S.perfil.nome,
    papel: ehCoord() ? 'coordenação geral'
      : ehCoordArea() ? `coord. de área (${S.perfil.area || ''})`
      : ehRedacao() ? 'redação'
      : `docente (${S.perfil.componente || ''})`,
    quando: agora(), texto: txt
  });
  if (rasc.id) { persistirRascunho(); save(S); }
  reabrirDlgItem();
};
ACOES['it-excluir'] = () => {
  if (!rasc.id) { $('#dlg').close(); return; }
  S.itens = S.itens.filter(i => i.id !== rasc.id);
  $('#dlg').close(); commit(); PERS.removerItem(rasc.id); toast('Item excluído.');
};

/* ================= TELA 5 · CADERNO ================= */
// Diagramação calibrada contra os cadernos reais do PAS/CEBRASPE (edital 2025):
// A4, duas colunas de 266pt com fio central, corpo 10pt/13,3pt, número do item
// em 9pt recuado 18pt para fora da coluna e crédito da fonte em 6pt à direita.
// As medidas vivem em css/estilo.css, bloco “caderno de provas”.
let cadVersao = 'regular';

const INSTRUCOES_PADRAO = [
  'Ao receber este caderno de provas, confira se os seus dados pessoais, transcritos acima, estão corretos e coincidem com o que está registrado no seu caderno de respostas.',
  'Verifique se este caderno contém a quantidade de itens indicada na capa. Caso o caderno esteja incompleto ou tenha qualquer defeito, solicite ao(à) aplicador(a) de provas que tome as providências necessárias.',
  'Nos itens do <b>tipo A</b>, marque, para cada item, o campo designado com o código <b>C</b>, caso julgue o item <b>CERTO</b>, ou o campo designado com o código <b>E</b>, caso julgue o item <b>ERRADO</b>.',
  'Nos itens do <b>tipo B</b>, marque, de acordo com o comando, o algarismo das <b>CENTENAS</b>, o das <b>DEZENAS</b> e o das <b>UNIDADES</b>. Todos esses campos devem ser obrigatoriamente marcados, mesmo que sejam iguais a zero.',
  'Nos itens do <b>tipo C</b>, marque a única opção correta de acordo com o respectivo comando.',
  'No item do <b>tipo D</b>, que é de resposta construída, faça o que se pede usando o espaço reservado no próprio caderno. Em caso de erro, risque com um traço simples a palavra, a frase ou o símbolo e escreva o respectivo substitutivo — parênteses não podem ser usados para essa finalidade.',
  'Nos itens do <b>tipo A</b> e do <b>tipo C</b>, siga a recomendação de não marcar ao acaso: para cada item cuja resposta divirja do gabarito oficial, será atribuída pontuação negativa.',
  'Não deixe de registrar suas respostas no <b>caderno de respostas</b>, único documento válido para a correção das suas provas.',
  'Não utilize material de consulta que não seja fornecido pela escola e não se comunique com outros(as) estudantes durante a prova.',
  'Fique atento(a) à duração da prova, já incluído o tempo destinado à transcrição das respostas para o caderno de respostas.'
];

// As instruções são de cada prova: o que vale para o 9º ano não é o que vale
// para a 3ª série, e a instrução do tipo D só faz sentido se houver tipo D.
function instrucoes(provaId = idProvaAtual()) {
  const c = provaPorId(provaId)?.instrucoes;
  if (Array.isArray(c) && c.length) return c;
  if (typeof c === 'string' && c.trim())
    return c.split('\n').map(l => l.trim()).filter(Boolean);
  return INSTRUCOES_PADRAO;
}

// Arranjos da capa. A folha é sempre A4 (595×842pt) — o que muda é como a arte
// e as instruções a dividem. É escolha de cada prova porque a arte muda a cada
// edição: a imagem que remete a um texto vertical não é a que remete a uma
// paisagem panorâmica, e forçar uma na moldura da outra a deforma.
// As medidas de cada arranjo vivem em css/estilo.css, bloco “arranjos de capa”.
const ARRANJOS_CAPA = {
  vertical: {
    rot: 'Vertical — arte na faixa esquerda',
    desc: 'Arte em 44% da largura, do topo ao pé da folha, e as instruções nos 56% restantes. É o desenho do caderno do PAS e o padrão do sistema.'
  },
  horizontal: {
    rot: 'Horizontal — arte na metade de cima',
    desc: 'Arte na metade superior da folha (421pt de 842pt) e instruções na metade inferior, em duas colunas da largura das do miolo. Para imagem panorâmica.'
  }
};
const ARRANJO_CAPA_PADRAO = 'vertical';

// A prova gravada antes deste campo existir não tem `capaArranjo` — e capa
// nenhuma deve mudar de forma por causa de uma atualização do sistema.
function arranjoCapa(provaId = idProvaAtual()) {
  const a = provaPorId(provaId)?.capaArranjo;
  return ARRANJOS_CAPA[a] ? a : ARRANJO_CAPA_PADRAO;
}

function htmlCapa(provaId, versao, totalItens) {
  const c = provaPorId(provaId);
  if (!c) return '';
  const arte = c.capaImagem
    ? `<img src="${esc(c.capaImagem)}" alt="">`
    : '';
  return `
  <div class="pas-capa capa-${arranjoCapa(provaId)}">
    <div class="pas-capa-arte">
      ${arte}
      <div class="pas-capa-marca">PAS<small>Simulado — Programa de Avaliação Seriada</small></div>
      <div class="pas-capa-faixa">
        <span>SUBPROGRAMA</span>
        <b>${esc(String(c.dataAplicacao || '').slice(0, 4) || '—')}</b>
        <span>${esc(c.etapa).toUpperCase()}</span>
      </div>
    </div>
    <div class="pas-capa-texto">
      <h2>LEIA COM ATENÇÃO AS INSTRUÇÕES ABAIXO.</h2>
      <ol>${instrucoes(provaId).map(i => `<li>${limpar(i)}</li>`).join('')}</ol>
      <div class="pas-capa-obs">
        <span class="rot">OBSERVAÇÕES</span>
        • Este caderno contém <b>${totalItens} ${totalItens === 1 ? 'item' : 'itens'}</b>${versao === 'adaptada' ? ' (versão adaptada)' : ''}.<br>
        • ${esc(c.nome)} · ${esc(c.etapa)} · ${esc(c.serie)}.<br>
        • Aplicação: ${dataBR(c.dataAplicacao)} · Duração: ${esc(c.duracao)}.<br>
        • Colégio Marista Águas Claras.
      </div>
    </div>
  </div>`;
}

// Frase de comando montada pela composição do bloco, como no PAS:
// “…, julgue os itens de 11 a 19 e assinale a opção correta no item 20,
//  que é do tipo C.”
// `artigo` = 'o'  → “o item 5” / “os itens de 11 a 19” (objeto direto)
// `artigo` = 'no' → “no item 5” / “nos itens de 49 a 51” (regido por “em”)
function listaDeNumeros(ns, artigo = 'o') {
  const um = artigo === 'no' ? 'no item' : 'o item';
  const varios = artigo === 'no' ? 'nos itens' : 'os itens';
  if (ns.length === 1) return `${um} ${ns[0]}`;
  if (ns.length === 2) return `${varios} ${ns[0]} e ${ns[1]}`;
  const seguidos = ns.every((n, i) => i === 0 || n === ns[i - 1] + 1);
  return seguidos ? `${varios} de ${ns[0]} a ${ns[ns.length - 1]}`
                  : `${varios} ${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]}`;
}

function comandoDoBloco(itens, texto) {
  const nsDe = tipo => itens.filter(e => e.item.tipo === tipo).map(e => e.numero);
  const partes = [];
  const a = nsDe('A'), b = nsDe('B'), cc = nsDe('C'), dd = nsDe('D');
  if (a.length) partes.push(`julgue ${listaDeNumeros(a)}`);
  for (const [ns, tipo] of [[b, 'B'], [dd, 'D']]) {
    if (!ns.length) continue;
    partes.push(`faça o que se pede ${listaDeNumeros(ns, 'no')}, que ${ns.length > 1 ? 'são' : 'é'} do tipo ${tipo}`);
  }
  if (cc.length)
    partes.push(`assinale a opção correta ${listaDeNumeros(cc, 'no')}, que ${cc.length > 1 ? 'são' : 'é'} do tipo C`);
  if (!partes.length) return '';
  const acoes = partes.length === 1 ? partes[0]
    : partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1];
  // A abertura é escrita pela coordenação no texto-base; o resto da frase o
  // sistema monta com números que ele mesmo gerou.
  const abertura = limpar((texto.comando || '').trim()) ||
    'Considerando o texto precedente e os múltiplos aspectos a ele relacionados';
  return `${abertura}, ${acoes}.`;
}

// O enunciado e as opções são texto rico: `rico()` poda a marcação pela lista
// de `js/limpar.js` e só então renderiza as fórmulas — o HTML do KaTeX nasce
// aqui, na hora de imprimir, e nunca esteve no banco. A altura de cada peça é
// medida depois (`medirPecas`), com a fórmula já desenhada, então a paginação
// continua certa mesmo quando uma fração estica a linha.
function htmlItem({ item, numero }) {
  const enun = rico(item.enunciado);
  if (item.tipo === 'C') {
    const ops = (item.opcoes || []).map((o, i) =>
      `<p class="pas-op"><b>${'ABCD'[i]}</b> ${rico(o)}</p>`).join('');
    return `<div class="pas-item"><span class="n">${numero}</span> ${enun}${ops}</div>`;
  }
  if (item.tipo === 'D') {
    const n = Math.max(1, item.dLinhas || 10);
    const pauta = item.dPauta !== false;
    const linhas = Array.from({ length: n }, () => '<i></i>').join('');
    return `<div class="pas-item"><span class="n">${numero}</span> ${enun}
      <div class="pas-pauta${pauta ? ' numerada' : ' sem-linhas'}">${pauta ? linhas : '<i style="height:' + (n * 17) + 'pt"></i>'}</div></div>`;
  }
  return `<div class="pas-item"><span class="n">${numero}</span> ${enun}</div>`;
}

// Peças que fluem pelas colunas. Cada peça é indivisível — itens e parágrafos
// não se partem entre colunas, como nos cadernos impressos.
// Prosa reflui e é justificada, como no caderno impresso; verso mantém as
// quebras do autor; “numerado” só quando algum item precisa citar linhas.
// O texto-base é rico como o item: `rico()` poda a marcação pela mesma lista de
// permissão e desenha as fórmulas. Texto de Matemática e de Química precisa
// disso tanto quanto o enunciado — o infográfico e a equação estão no texto.
//
// A linha em branco que separa parágrafo é aferida pelo texto por baixo da
// marcação (`ricoVazio`), não pela string crua: uma linha com só `<b></b>`
// continua sendo linha em branco.
function htmlCorpoTexto(texto) {
  const linhas = texto.linhas || [];
  const branca = l => ricoVazio(l);
  if (texto.formato === 'numerado')
    return `<div class="pas-linhas">${linhas.map(l => `<p>${rico(l)}</p>`).join('')}</div>`;
  if (texto.formato === 'verso')
    return `<div class="pas-texto">${linhas.map(l =>
      branca(l) ? '<p>&nbsp;</p>' : `<p class="pas-verso">${rico(l)}</p>`).join('')}</div>`;
  // prosa: linhas em branco separam parágrafos
  const paragrafos = [];
  let atual = [];
  for (const l of linhas) {
    if (!branca(l)) atual.push(l.trim());
    else if (atual.length) { paragrafos.push(atual.join(' ')); atual = []; }
  }
  if (atual.length) paragrafos.push(atual.join(' '));
  return `<div class="pas-texto">${paragrafos.map(p => `<p>${rico(p)}</p>`).join('')}</div>`;
}

function pecasDoBloco(texto, itens) {
  const pecas = [htmlCorpoTexto(texto)];
  pecas.push(`<p class="pas-fonte">${esc(texto.fonte)}</p>`);
  pecas.push(`<p class="pas-comando">${comandoDoBloco(itens, texto)}</p>`);
  itens.forEach(e => pecas.push(htmlItem(e)));
  pecas.push('<div style="height:13.3pt"></div>');   // respiro entre blocos
  return pecas;
}

const ALTURA_COLUNA = 730;     // pt — de y 72,3 a 802,3, como no PAS
const PX_POR_PT = 4 / 3;

// Mede cada peça numa régua com a largura exata da coluna.
// `larga` mede na largura da coluna única (541,1pt) em vez da coluna do miolo
// (266,05pt) — é o que a proposta de redação usa.
function medirPecas(pecas, larga = false) {
  const regua = document.createElement('div');
  regua.className = 'pas pas-regua' + (larga ? ' larga' : '');
  document.body.appendChild(regua);
  const alturas = pecas.map(html => {
    regua.innerHTML = html;
    return regua.getBoundingClientRect().height / PX_POR_PT;
  });
  regua.remove();
  return alturas;
}

// Distribui as peças em colunas de altura fixa, duas por página.
function distribuir(pecas, alturas) {
  const paginas = [];
  let colunas = [[], []], ci = 0, altura = 0;
  const proximaColuna = () => {
    ci++; altura = 0;
    if (ci > 1) { paginas.push(colunas); colunas = [[], []]; ci = 0; }
  };
  pecas.forEach((html, i) => {
    const alt = alturas[i];
    if (altura > 0 && altura + alt > ALTURA_COLUNA) proximaColuna();
    colunas[ci].push(html);
    altura += alt;
  });
  if (colunas[0].length || colunas[1].length) paginas.push(colunas);
  return paginas;
}

// Peças que anunciam o que vem depois. Título no pé de uma página com o texto
// na seguinte é título que não serve para nada — quem lê já virou a folha.
const ehTitulo = html => /class="pas-red-(mot|tema)"/.test(html);

// Paginação de coluna única: uma coluna por folha, na largura cheia. A altura
// útil é a mesma — o que muda é a largura, e ela já entrou na medição.
function distribuirEmUmaColuna(pecas, alturas) {
  const paginas = [];
  let atual = [], altura = 0;
  const virar = () => { paginas.push([atual, []]); atual = []; altura = 0; };

  pecas.forEach((html, i) => {
    // Um título só começa página onde couber também o primeiro pedaço do que
    // ele anuncia; senão, vira a folha antes dele.
    const junto = ehTitulo(html) && i + 1 < pecas.length ? alturas[i + 1] : 0;
    if (altura > 0 && altura + alturas[i] + junto > ALTURA_COLUNA) virar();
    atual.push(html);
    altura += alturas[i];
  });
  if (atual.length) virar();
  return paginas;
}

// `parte` é o rótulo centralizado do alto da página. Os itens saem em “PARTE 2”,
// como nos cadernos do PAS; a proposta de redação tem o seu próprio.
function htmlPagina(colunas, ident, numero, total, parte = '-- PARTE 2 --', umaColuna = false) {
  // Coluna única (proposta de redação): uma coluna na largura cheia e sem fio
  // central. O fio separa duas colunas; sem elas, seria um risco no meio do
  // texto.
  const corpo = umaColuna
    ? `<div class="pas-col pas-col-larga">${colunas[0].join('')}</div>`
    : `<div class="pas-col">${colunas[0].join('')}</div>
       <div class="pas-col">${colunas[1].join('')}</div>`;
  return `
  <div class="pas-pagina${umaColuna ? ' pas-uma-col' : ''}">
    <div class="pas-ident">${ident}</div>
    <div class="pas-fio-topo"></div>
    <div class="pas-parte">${esc(parte)}</div>
    <div class="pas-fio-vert"></div>
    <div class="pas-corpo">${corpo}</div>
    <div class="pas-fio-base"></div>
    <div class="pas-fol">${numero} / ${total}</div>
  </div>`;
}

// Monta o caderno inteiro já paginado. Precisa do DOM para medir as peças.
//
// A redação entra aqui como parte do caderno, e não como anexo: quando a prova
// tem redação e a proposta está escrita, ela é paginada à parte — as suas peças
// não dividem coluna com item nenhum — e vai depois dos itens, nas últimas
// páginas. Prova sem redação (ou com a proposta ainda em branco) não ganha
// página nenhuma a mais.
function htmlCaderno(provaId, versao, comCapa = true) {
  const pv = prova(provaId, versao);
  const comRedacao = propostaEscrita(provaId);
  if (!pv.length && !comRedacao) return '';
  const porTexto = new Map();
  for (const e of pv) {
    if (!porTexto.has(e.texto.id)) porTexto.set(e.texto.id, { texto: e.texto, itens: [] });
    porTexto.get(e.texto.id).itens.push(e);
  }
  const pecas = [...porTexto.values()].flatMap(({ texto, itens }) => pecasDoBloco(texto, itens));
  const paginas = pecas.length ? distribuir(pecas, medirPecas(pecas)) : [];
  // A proposta vai em coluna única, como no caderno do PAS: medida e paginada
  // na largura cheia, não na coluna do miolo.
  const pecasRed = comRedacao ? pecasDaProposta(provaId) : [];
  const paginasRed = pecasRed.length
    ? distribuirEmUmaColuna(pecasRed, medirPecas(pecasRed, true)) : [];
  const p = provaPorId(provaId);
  const ident = `${esc(p?.nome || '')} — ${esc(p?.serie || '')} · ${esc(p?.etapa || '')}${versao === 'adaptada' ? ' — versão adaptada' : ''}`;
  const capa = comCapa ? `<div class="pas-pagina">${htmlCapa(provaId, versao, pv.length)}</div>` : '';
  const total = paginas.length + paginasRed.length + (comCapa ? 1 : 0);
  let n = comCapa ? 1 : 0;
  const folhas = [
    ...paginas.map(c => htmlPagina(c, ident, ++n, total)),
    ...paginasRed.map(c => htmlPagina(c, ident, ++n, total, PARTE_REDACAO, true))
  ].join('');
  return `<div class="pas">${capa}${folhas}</div>`;
}

function telaCaderno() {
  const pAtiva = provaAtual();
  if (!pAtiva) {
    $('#app').innerHTML = '<div class="quadro"><div class="miolo"><div class="vazio">Nenhuma prova cadastrada — crie a primeira no Painel.</div></div></div>';
    return;
  }
  const pv = prova(pAtiva.id, cadVersao);
  // A proposta de redação é conteúdo do caderno: ela sozinha já justifica gerar
  // o documento, e a sua falta é avisada em vez de ficar em silêncio.
  const comRedacao = propostaEscrita(pAtiva.id);
  const temConteudo = pv.length > 0 || comRedacao;
  $('#app').innerHTML = `
  <div class="quadro">
    <div class="miolo" style="padding-bottom:0">
      <div class="cab-tela">
        <div><h2>Caderno de provas — ${esc(pAtiva.serie)}</h2>
          <span class="sub">${esc(pAtiva.etapa)} · ${pv.length} itens aprovados nesta versão · numeração contínua · diagramação no padrão PAS${
            provaTemRedacao(pAtiva.id) ? (comRedacao ? ' · com a proposta de redação' : ' · proposta de redação ainda em branco') : ' · sem redação'}</span></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div class="seg">
            <button class="${cadVersao === 'regular' ? 'sel' : ''}" data-acao="cad-versao" data-v="regular">Regular</button>
            <button class="${cadVersao === 'adaptada' ? 'sel' : ''}" data-acao="cad-versao" data-v="adaptada">Adaptada</button>
          </div>
          ${ehCoord() ? '<button class="btn fantasma" data-acao="cad-capa">⚙ Capa e instruções</button>' : ''}
          ${ehCoord() && provaTemRedacao(pAtiva.id) ? '<button class="btn fantasma" data-acao="cad-redacao">✍ Proposta de redação</button>' : ''}
          <button class="btn rosa" data-acao="cad-imprimir" ${temConteudo ? '' : 'disabled'}>🖨 Imprimir / salvar em PDF</button>
        </div>
      </div>
    </div>
    ${temConteudo ? `<div class="pas-previa">${htmlCaderno(pAtiva.id, cadVersao)}</div>`
      : '<div class="miolo"><div class="vazio">Nenhum item aprovado para esta versão ainda. Aprove itens na tela “Itens e revisão”.</div></div>'}
  </div>
  <p class="nota-tela"><strong>Diagramação calibrada</strong> contra os cadernos do PAS/CEBRASPE de 2025: A4 com duas colunas de 266pt e fio central, corpo de 10pt, número do item recuado para fora da coluna e crédito da fonte em 6pt. O <strong>comando de cada bloco é montado automaticamente</strong> a partir dos tipos de item — “julgue os itens de 11 a 19 e assinale a opção correta no item 20, que é do tipo C” —, e o texto de abertura é editável em cada texto-base. A <strong>proposta de redação</strong> fecha o caderno, nas últimas páginas, quando a prova tem redação e a proposta está escrita. A quebra de páginas acontece na impressão: use “Imprimir” e escolha “Salvar como PDF”.</p>`;
}
ACOES['cad-versao'] = d => { cadVersao = d.v; render(); };
ACOES['cad-imprimir'] = () => {
  $('#print-area').innerHTML = htmlCaderno(idProvaAtual(), cadVersao);
  window.print();
};

ACOES['cad-capa'] = () => {
  const p = provaAtual();
  if (!p) return;
  const atual = arranjoCapa(p.id);
  const opsArranjo = Object.entries(ARRANJOS_CAPA).map(([k, a]) => `
        <label class="capa-arranjo-op${k === atual ? ' sel' : ''}">
          <input type="radio" name="cp-arranjo" value="${k}" data-mud="cp-arranjo"
            ${k === atual ? 'checked' : ''}>
          <span class="capa-mini capa-mini-${k}" aria-hidden="true"><i></i><b></b></span>
          <span class="capa-arranjo-txt"><strong>${esc(a.rot)}</strong>${esc(a.desc)}</span>
        </label>`).join('');
  abrirDlg(`
    <div class="dlg-cab"><h2>Capa e instruções — ${esc(p.serie)}</h2>
      <button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      <p style="font-size:12.5px;color:var(--ink-2);margin:0 0 12px">A capa e as instruções são <b>desta prova</b>.
        Cada série tem as suas.</p>
      <div class="campo" style="margin-bottom:12px"><label>Arranjo da capa</label>
        <div class="capa-arranjos">${opsArranjo}</div></div>
      <div class="campo" style="margin-bottom:12px"><label>Imagem da capa (endereço)</label>
        <input class="caixa" id="cp-img" value="${esc(p.capaImagem || '')}"
          placeholder="https://… — imagem inspirada nos textos ou no tema da redação"></div>
      <div class="campo"><label>Instruções (uma por linha, numeradas automaticamente)</label>
        <textarea class="caixa" id="cp-instr" rows="10">${esc(instrucoes(p.id).join('\n'))}</textarea></div>
      <p style="font-size:12.5px;color:var(--ink-2);margin:10px 0 0">Aceita <code>&lt;b&gt;</code> para destacar termos, como no caderno original.</p>
    </div>
    <div class="dlg-pe">
      <button class="btn fantasma" style="margin-right:auto" data-acao="cad-capa-padrao">Restaurar padrão</button>
      <button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="cad-capa-salvar" data-id="${esc(p.id)}">Salvar</button></div>`);
};
ACOES['cad-capa-padrao'] = () => { $('#cp-instr').value = INSTRUCOES_PADRAO.join('\n'); };
// Só destaca o cartão escolhido: quem clica no arranjo precisa ver que clicou
// antes de salvar, e remontar o diálogo aqui apagaria as instruções em edição.
MUDS['cp-arranjo'] = (d, el) => {
  for (const op of $$('.capa-arranjo-op'))
    op.classList.toggle('sel', op.contains(el));
};
ACOES['cad-capa-salvar'] = d => {
  const p = provaPorId(d.id);
  if (!p) return;
  const arr = $('input[name="cp-arranjo"]:checked')?.value;
  p.capaArranjo = ARRANJOS_CAPA[arr] ? arr : ARRANJO_CAPA_PADRAO;
  p.capaImagem = $('#cp-img').value.trim();
  p.instrucoes = $('#cp-instr').value.split('\n').map(l => l.trim()).filter(Boolean);
  $('#dlg').close(); commit(); PERS.prova(p); toast('Capa atualizada.');
};

/* ---------------- proposta de redação ----------------
   Até aqui a redação era só uma nota: a prova dizia `temRedacao`, o cartão
   imprimia uma pauta de linhas e a correção lançava NC, NE e TL. Faltava a
   proposta — tema, comando, textos motivadores —, isto é, faltava a prova de
   redação em si, que é o que o estudante lê.

   Onde ela mora: no próprio registro da prova (`prova.redacao`), ao lado de
   `temRedacao`, das instruções e da imagem da capa. Prova é uma linha
   {id, dados jsonb} em `public.provas` (migração 0007), então isto não pede
   coluna nem tabela nova, e a proposta acompanha a prova de graça no backup
   JSON, na exclusão em cascata e na sincronização linha a linha do PERS. Ela é
   de cada prova, como a capa: o 9º ano não escreve sobre o tema da 3ª série.

   O texto vai à tela e ao papel por `limpar()` (js/limpar.js), como as
   instruções da capa: a coordenação usa <b> e <i> para citar títulos e marcar
   ênfases do original, e nada além de ênfase tipográfica passa. */
const PARTE_REDACAO = '-- PROVA DE REDAÇÃO --';

const provaTemRedacao = (provaId = idProvaAtual()) => provaPorId(provaId)?.temRedacao !== false;

// Devolve sempre a forma completa, mesmo para prova que nunca teve proposta:
// quem lê não precisa saber se o campo existe nem em que formato foi gravado.
function proposta(provaId = idProvaAtual()) {
  const r = provaPorId(provaId)?.redacao || {};
  return {
    tema: r.tema || '',
    comando: r.comando || '',
    tipoTexto: r.tipoTexto || '',
    motivadores: (Array.isArray(r.motivadores) ? r.motivadores : [])
      .map(m => ({ titulo: m?.titulo || '', texto: m?.texto || '', fonte: m?.fonte || '' }))
  };
}

// Motivador sem texto é linha em branco de formulário, não material de prova.
const motivadoresDe = p => p.motivadores.filter(m => m.texto.trim());

// Proposta “escrita” é a que tem ao menos tema, comando ou um motivador — só
// então há o que imprimir no caderno e o que mostrar a quem corrige. Prova sem
// redação nunca tem proposta, mesmo que sobre texto gravado de antes: quem
// manda é `temRedacao`.
function propostaEscrita(provaId = idProvaAtual()) {
  if (!provaTemRedacao(provaId)) return false;
  const p = proposta(provaId);
  return !!(p.tema.trim() || p.comando.trim() || motivadoresDe(p).length);
}

// Parágrafos do motivador, com a mesma convenção do texto-base em prosa: linha
// em branco separa parágrafos, quebra simples é só quebra de digitação.
function paragrafosDoMotivador(texto) {
  return String(texto || '').split(/\n\s*\n/)
    .map(b => b.split('\n').map(l => l.trim()).filter(Boolean).join(' '))
    .filter(Boolean);
}

// Peças da proposta para o paginador do caderno, na largura da coluna e na
// ordem em que o estudante lê: tema, motivadores (cada um com a sua fonte),
// comando e, por fim, as observações. Cada parágrafo é peça própria, para que
// um motivador longo reflua entre colunas em vez de ser cortado no pé da
// página — é o mesmo tratamento que os itens recebem.
function pecasDaProposta(provaId) {
  const p = proposta(provaId);
  // Sem título dentro da coluna: quem anuncia a parte é o rótulo do alto da
  // página (`PARTE_REDACAO`), como “-- PARTE 2 --” anuncia os itens. Repetir
  // seria dizer duas vezes a mesma coisa em dois corpos diferentes.
  const pecas = [];
  if (p.tema.trim())
    pecas.push(`<p class="pas-red-tema"><span>TEMA</span>${limpar(p.tema)}</p>`);
  motivadoresDe(p).forEach((m, i) => {
    pecas.push(`<p class="pas-red-mot">TEXTO MOTIVADOR ${i + 1}${
      m.titulo.trim() ? ' — ' + limpar(m.titulo) : ''}</p>`);
    for (const par of paragrafosDoMotivador(m.texto))
      pecas.push(`<div class="pas-texto"><p>${limpar(par)}</p></div>`);
    if (m.fonte.trim()) pecas.push(`<p class="pas-fonte">${limpar(m.fonte)}</p>`);
  });
  if (p.comando.trim())
    pecas.push(`<p class="pas-comando pas-red-comando">${limpar(p.comando)}</p>`);
  const obs = [];
  if (p.tipoTexto.trim()) obs.push(`Tipo de texto esperado: <b>${limpar(p.tipoTexto)}</b>.`);
  obs.push(`Escreva a versão definitiva na folha de redação, respeitando o limite de
    <b>${LINHAS_REDACAO} linhas</b>. Texto escrito a lápis não é considerado, e
    qualquer marca de identificação na folha anula a redação.`);
  pecas.push(`<p class="pas-red-obs">${obs.join(' ')}</p>`);
  return pecas;
}

// A proposta como quem corrige precisa vê-la, ao lado do lançamento: tema e
// comando abertos, cada motivador num <details> — a professora abre o que
// precisa reler sem que o texto empurre a tabela para fora da tela.
function htmlPropostaTela(provaId) {
  const p = proposta(provaId);
  const mots = motivadoresDe(p);
  if (!propostaEscrita(provaId))
    return `<div class="vazio">A proposta desta prova ainda não foi escrita.${
      ehCoord() ? ' Escreva-a na tela <a href="#/caderno">Caderno</a>, em “✍ Proposta de redação”.'
                : ' A coordenação a escreve na tela do Caderno.'}</div>`;
  return `
    <div class="red-proposta">
      ${p.tema.trim() ? `<p class="red-tema"><span>Tema</span>${limpar(p.tema)}</p>` : ''}
      ${p.comando.trim() ? `<p class="red-comando">${limpar(p.comando)}</p>` : ''}
      ${p.tipoTexto.trim() ? `<p class="red-tipo">Tipo de texto esperado: <b>${limpar(p.tipoTexto)}</b></p>` : ''}
      ${mots.map((m, i) => `
        <details class="red-mot" ${i === 0 ? 'open' : ''}>
          <summary>Texto motivador ${i + 1}${m.titulo.trim() ? ' — ' + limpar(m.titulo) : ''}</summary>
          ${paragrafosDoMotivador(m.texto).map(par => `<p>${limpar(par)}</p>`).join('')}
          ${m.fonte.trim() ? `<p class="fonte">${limpar(m.fonte)}</p>` : ''}
        </details>`).join('')}
    </div>`;
}

/* ---------------- edição da proposta (coordenação) ---------------- */
// Cópia de trabalho, como no editor de item: o que está no formulário só chega
// à prova quando alguém salva. Os campos são colhidos do DOM na hora de somar
// ou remover motivador, para que texto digitado e ainda não “mudado” não se
// perca ao remontar o diálogo.
let rascRed = null;

function dlgRedacao(provaId) {
  const p = provaPorId(provaId);
  if (!p || !rascRed) return;
  const mots = rascRed.motivadores.length ? rascRed.motivadores : [{ titulo: '', texto: '', fonte: '' }];
  rascRed.motivadores = mots;
  abrirDlg(`
    <div class="dlg-cab"><h2>Proposta de redação — ${esc(p.serie)}</h2>
      <button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      <p style="font-size:12.5px;color:var(--ink-2);margin:0 0 14px">A proposta é <b>desta prova</b> e sai nas
        últimas páginas do caderno, depois dos itens. Cada série tem a sua.</p>
      <div class="campo" style="margin-bottom:14px"><label>Tema</label>
        <input class="caixa" id="rd-tema" value="${esc(rascRed.tema)}"
          placeholder="ex.: A água do Cerrado como patrimônio de todos"></div>
      <div class="campo" style="margin-bottom:14px"><label>Comando — o que se pede ao estudante</label>
        <textarea class="caixa" id="rd-comando" rows="3"
          placeholder="A partir dos textos motivadores e de outras leituras que você tenha feito, redija…">${esc(rascRed.comando)}</textarea></div>
      <div class="campo" style="margin-bottom:16px"><label>Tipo de texto esperado (opcional)</label>
        <input class="caixa" id="rd-tipo" value="${esc(rascRed.tipoTexto)}"
          placeholder="ex.: texto argumentativo em prosa"></div>

      <h3 class="rd-sec">Textos motivadores</h3>
      ${mots.map((m, i) => `
        <div class="rd-mot" data-mot="${i}">
          <div class="rd-mot-cab">
            <b>Texto motivador ${i + 1}</b>
            <button class="btn mini vermelho fantasma" data-acao="rd-mot-remover" data-i="${i}"
              title="Remover este texto motivador">Remover</button>
          </div>
          <div class="form-linha" style="margin-bottom:8px">
            <div class="campo"><label>Título (opcional)</label>
              <input class="caixa rd-mot-titulo" value="${esc(m.titulo)}" placeholder="ex.: Trecho de reportagem"></div>
          </div>
          <div class="campo" style="margin-bottom:8px"><label>Texto</label>
            <textarea class="caixa rd-mot-texto" rows="5"
              placeholder="Cole o texto motivador. Uma linha em branco separa parágrafos.">${esc(m.texto)}</textarea></div>
          <div class="campo"><label>Fonte</label>
            <input class="caixa rd-mot-fonte" value="${esc(m.fonte)}" placeholder="autor / obra / veículo, ano"></div>
        </div>`).join('')}
      <button class="btn fantasma" data-acao="rd-mot-somar">+ Texto motivador</button>
      <p style="font-size:12px;color:var(--ink-2);margin:12px 0 0">No corpo dos textos, uma <b>linha em branco</b>
        separa parágrafos; quebras simples são só quebras de digitação, como nos textos-base em prosa.
        Aceita <code>&lt;b&gt;</code> e <code>&lt;i&gt;</code> para destacar termos.</p>
    </div>
    <div class="dlg-pe">
      ${provaPorId(provaId)?.redacao ? `<button class="btn vermelho fantasma" style="margin-right:auto"
        data-acao="rd-apagar" data-id="${esc(provaId)}">Apagar a proposta</button>` : ''}
      <button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="rd-salvar" data-id="${esc(provaId)}">Salvar</button></div>`);
}

// Lê o formulário para a cópia de trabalho. Vale para salvar e para remontar o
// diálogo: sem isto, somar um motivador apagaria o que ainda não teve `change`.
function colherProposta() {
  if (!rascRed) return null;
  const val = sel => ($(sel)?.value ?? '');
  rascRed.tema = val('#rd-tema').trim();
  rascRed.comando = val('#rd-comando').trim();
  rascRed.tipoTexto = val('#rd-tipo').trim();
  rascRed.motivadores = $$('[data-mot]').map(bloco => ({
    titulo: $('.rd-mot-titulo', bloco).value.trim(),
    texto: $('.rd-mot-texto', bloco).value.trim(),
    fonte: $('.rd-mot-fonte', bloco).value.trim()
  }));
  return rascRed;
}

ACOES['cad-redacao'] = () => {
  const p = provaAtual();
  if (!p) return;
  rascRed = { provaId: p.id, ...proposta(p.id) };
  dlgRedacao(p.id);
};
ACOES['rd-mot-somar'] = () => {
  const r = colherProposta();
  if (!r) return;
  r.motivadores.push({ titulo: '', texto: '', fonte: '' });
  dlgRedacao(r.provaId);
};
ACOES['rd-mot-remover'] = d => {
  const r = colherProposta();
  if (!r) return;
  r.motivadores.splice(parseInt(d.i, 10), 1);
  dlgRedacao(r.provaId);
};
ACOES['rd-salvar'] = d => {
  const r = colherProposta();
  const p = provaPorId(d.id);
  if (!r || !p) return;
  if (!r.tema || !r.comando) { toast('Tema e comando são o mínimo de uma proposta.'); return; }
  // Motivador com título ou fonte e sem texto é engano de digitação, não uma
  // decisão: avisa em vez de descartar em silêncio o que a pessoa escreveu.
  const meio = r.motivadores.findIndex(m => !m.texto && (m.titulo || m.fonte));
  if (meio >= 0) { toast(`O texto motivador ${meio + 1} está sem texto.`); return; }
  p.redacao = {
    tema: r.tema, comando: r.comando, tipoTexto: r.tipoTexto,
    motivadores: r.motivadores.filter(m => m.texto)
  };
  rascRed = null;
  $('#dlg').close(); commit(); PERS.prova(p); toast('Proposta de redação salva.');
};
ACOES['rd-apagar'] = d => {
  const p = provaPorId(d.id);
  if (!p) return;
  delete p.redacao;
  rascRed = null;
  $('#dlg').close(); commit(); PERS.prova(p);
  toast('Proposta apagada — o caderno volta a sair sem a página de redação.');
};

/* ================= TELA 6 · CARTÕES ================= */
// Conjunto de folhas por estudante, no desenho do caderno de respostas do PAS:
//   folha 1 — objetiva: todos os itens em ordem numérica ocupando 4/5 da folha
//             (só A e C recebem bolhas; B e D ficam rotulados) e uma coluna à
//             direita só para os tipo B, com centena, dezena e unidade;
//   folha 2 — discursiva: uma pauta por item tipo D e as bolhas de percentual
//             de acerto (0, 25, 50, 75, 100%), marcadas por quem corrige;
//   folha 3 — redação: pauta de 30 linhas de 17pt. Opcional, definido pela
//             coordenação em “Configurar simulado”.
const SENHA_PROVISORIA = 'Marista@2026';
const PERCENTUAIS_D = [0, 25, 50, 75, 100];
const COLUNAS_CARTAO = 4;
const LINHAS_REDACAO = 30;
// Capacidade de uma folha A4 neste desenho — o que não couber vai para uma
// folha de continuação, em vez de ser cortado em silêncio.
const LINHAS_POR_COLUNA = 42;
const BLOCOS_B_POR_COLUNA = 5;
const BLOCOS_B_POR_FOLHA = 10;   // a coluna se desdobra em duas antes de virar folha nova
const ALTURA_UTIL_D = 650;

function cabecalhoCartao(provaId, est, faixa) {
  const c = provaPorId(provaId) || {};
  return `
  <div class="cr-cab">
    <div class="cr-cab-prova">
      <b>${esc(c.nome || '')}</b>
      <span>${esc(c.etapa || '')} · ${esc(c.serie || '')}</span>
      <span>Colégio Marista Águas Claras</span>
      <span>Aplicação: ${dataBR(c.dataAplicacao)}</span>
    </div>
    <div class="cr-cab-est">
      <div><span>ESTUDANTE</span><b>${esc(est.nome).toUpperCase()}</b></div>
      <div><span>MATRÍCULA</span><b>${esc(est.matricula)}</b></div>
      <div><span>TURMA</span><b>${esc(est.turma)}</b></div>
      <div><span>PROVA</span><b>${esc((c.serie || '').toUpperCase())}</b></div>
      <div><span>VERSÃO</span><b>${est.versao === 'adaptada' ? 'ADAPTADA' : 'REGULAR'}</b></div>
    </div>
    <div class="cr-sala"><small>SALA</small><i></i></div>
  </div>
  <div class="cr-faixa">${faixa}</div>
  <div class="cr-ancoras"><i></i><i></i></div>`;
}

function rodapeCartao(est, folha, total) {
  return `
  <div class="cr-ancoras"><i></i><i></i></div>
  <div class="cr-rodape">
    <span>▮▯▮▮▯▮▮▯ ${esc(est.matricula)}</span>
    <span>folha ${folha} de ${total}</span>
  </div>`;
}

function bolhasDe(tipo) {
  return TIPOS[tipo].respostas.map(r =>
    `<span class="bolha"></span><span>${r}</span>`).join('');
}

// Folhas objetivas — todos os itens em ordem numérica; só A e C recebem
// bolhas aqui. Quando não cabem numa folha, seguem em folhas de continuação.
function corposObjetivos(pv) {
  const bs = pv.filter(e => e.item.tipo === 'B');
  const porFolha = COLUNAS_CARTAO * LINHAS_POR_COLUNA;
  const quantas = Math.max(Math.ceil(pv.length / porFolha),
                           Math.ceil(bs.length / BLOCOS_B_POR_FOLHA), 1);
  const corpos = [];
  for (let f = 0; f < quantas; f++) {
    const daFolha = pv.slice(f * porFolha, (f + 1) * porFolha);
    const bsDaFolha = bs.slice(f * BLOCOS_B_POR_FOLHA, (f + 1) * BLOCOS_B_POR_FOLHA);
    const porColuna = Math.ceil(daFolha.length / COLUNAS_CARTAO) || 1;
    const colunas = [];
    for (let i = 0; i < daFolha.length; i += porColuna) colunas.push(daFolha.slice(i, i + porColuna));

    const acHtml = colunas.map(col => `
      <div class="cr-ac-col">
        <div class="cr-tit">ITENS ${col[0].numero}–${col[col.length - 1].numero}</div>
        ${col.map(({ item, numero }) => {
          if (item.tipo === 'B')
            return `<div class="cr-linha outro"><span class="no">${numero}</span><span class="rot">TIPO B →</span></div>`;
          if (item.tipo === 'D')
            return `<div class="cr-linha outro"><span class="no">${numero}</span><span class="rot">TIPO D ↗</span></div>`;
          return `<div class="cr-linha"><span class="no">${numero}</span>${bolhasDe(item.tipo)}</div>`;
        }).join('')}
      </div>`).join('');

    const bHtml = bsDaFolha.length ? bsDaFolha.map(({ numero }) => `
      <div class="cr-bloco-b">
        <h6>ITEM ${numero}</h6>
        <div class="cr-bgrade">
          <span></span><span class="cab">C</span><span class="cab">D</span><span class="cab">U</span>
          ${Array.from({ length: 10 }, (_, d) => `
            <span class="dig">${d}</span>
            <span class="cel"><span class="bolha"></span></span>
            <span class="cel"><span class="bolha"></span></span>
            <span class="cel"><span class="bolha"></span></span>`).join('')}
        </div>
      </div>`).join('')
      : `<div style="font-size:6.5pt;color:#777;text-align:center;padding:8pt 4pt">${
          bs.length ? 'Os itens do tipo B estão nas outras folhas.' : 'Esta prova não tem itens do tipo B.'}</div>`;

    const soB = daFolha.length === 0;
    corpos.push({
      faixa: soB ? 'Caderno de respostas — itens do tipo B (continuação)'
        : `Caderno de respostas — itens dos tipos A, B e C${quantas > 1 ? ` (${f + 1}ª parte)` : ''}`,
      html: `
        <div class="cr-orient">
          <div class="txt">
            Marque com caneta esferográfica de tinta <b>preta</b>, preenchendo o círculo por inteiro.
            Itens do <b>tipo A</b>: marque <b>C</b> se julgar o item certo ou <b>E</b> se julgar errado.
            Itens do <b>tipo C</b>: marque uma única opção. Itens do <b>tipo B</b>: marque os três
            algarismos na coluna à direita, inclusive os zeros. Itens do <b>tipo D</b> são respondidos
            na folha indicada. Não rasure: marcação dupla é anulada.
          </div>
          <div class="cr-exemplo">
            <h6>EXEMPLO DE PREENCHIMENTO</h6>
            <div class="ex"><i>tipo A</i><span class="bolha m"></span><span>C</span><span class="bolha"></span><span>E</span></div>
            <div class="ex"><i>tipo C</i><span class="bolha"></span><span>A</span><span class="bolha m"></span><span>B</span><span class="bolha"></span><span>C</span><span class="bolha"></span><span>D</span></div>
            <div class="ex"><i>tipo B</i><span>resposta 025 → C=0, D=2, U=5</span></div>
          </div>
        </div>
        <div class="cr-corpo">
          ${soB ? '' : `<div class="cr-ac">${acHtml}</div>`}
          <div class="cr-bcol${bsDaFolha.length > BLOCOS_B_POR_COLUNA ? ' duplo' : ''}" ${soB ? 'style="flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:6pt;align-content:start"' : ''}>
            ${soB ? '' : '<div class="cr-tit">ITENS DO TIPO B</div>'}${bHtml}</div>
        </div>`
    });
  }
  return corpos;
}

// Folhas dos discursivos (tipo D): uma pauta por item e as bolhas de
// percentual de acerto. Quebra em mais folhas quando a altura não dá.
function corposDiscursivos(pv) {
  const ds = pv.filter(e => e.item.tipo === 'D');
  if (!ds.length) return [];
  const altura = e => 40 + (e.item.dLinhas || 10) * 17;
  const grupos = [];
  let grupo = [], soma = 0;
  for (const e of ds) {
    const a = altura(e);
    if (grupo.length && soma + a > ALTURA_UTIL_D) { grupos.push(grupo); grupo = []; soma = 0; }
    grupo.push(e); soma += a;
  }
  if (grupo.length) grupos.push(grupo);

  return grupos.map((g, i) => ({
    faixa: `Caderno de respostas — itens do tipo D (resposta construída)${grupos.length > 1 ? ` (${i + 1}ª parte)` : ''}`,
    html: `
      <div class="cr-orient">
        <div class="txt">
          Responda com caneta esferográfica de tinta <b>preta</b>, dentro do espaço reservado a cada item.
          Em caso de erro, risque a palavra com um traço simples e escreva o substitutivo — não use parênteses.
          O quadro de <b>percentual de acerto</b> é de uso exclusivo de quem corrige.
        </div>
      </div>
      <div style="flex:1;overflow:hidden">
        ${g.map(({ item, numero }) => `
          <div class="cr-d">
            <div class="cr-d-cab">
              <b>ITEM ${numero}</b>
              <span>${esc(item.componente)} · resposta construída</span>
            </div>
            <div class="cr-pauta">${Array.from({ length: item.dLinhas || 10 }, () => '<i></i>').join('')}</div>
            <div class="cr-nota">
              <b>PERCENTUAL DE ACERTO (uso do corretor)</b>
              ${PERCENTUAIS_D.map(p => `<span class="op"><span class="bolha"></span>${p}%</span>`).join('')}
            </div>
          </div>`).join('')}
      </div>`
  }));
}

// Folha da redação, com a pauta do rascunho oficial (30 linhas de 17pt). O tema
// da proposta vem impresso quando existe: é esta folha que a professora corrige,
// e ela precisa ver, sem o caderno na mão, sobre o que era para escrever.
function corpoRedacao(provaId = idProvaAtual()) {
  const tema = proposta(provaId).tema.trim();
  return {
    faixa: 'Caderno de respostas — redação em língua portuguesa',
    html: `
      <div class="cr-orient">
        <div class="txt">
          Escreva o texto definitivo com caneta esferográfica de tinta <b>preta</b>, respeitando o limite de
          ${LINHAS_REDACAO} linhas. Texto escrito a lápis não é considerado. <b>Não identifique</b> sua folha:
          qualquer marca de identificação anula a redação.
        </div>
      </div>
      ${tema ? `<div class="cr-red-tema"><span>TEMA</span>${limpar(tema)}</div>` : ''}
      <div class="cr-red-pauta">${Array.from({ length: LINHAS_REDACAO }, () => '<i></i>').join('')}</div>
      <div style="flex:1"></div>`
  };
}

// Todas as folhas de um estudante, já numeradas “folha N de M”.
function corposDoCartao(provaId, est) {
  const p = provaPorId(provaId);
  const pv = prova(provaId, est.versao);
  const corpos = [...corposObjetivos(pv), ...corposDiscursivos(pv)];
  // A folha de redação só sai se a prova tiver redação e a coordenação optar
  // por imprimi-la.
  if (p?.temRedacao !== false && p?.imprimirRedacao !== false) corpos.push(corpoRedacao(provaId));
  return corpos;
}

const totalFolhas = (provaId, est) => corposDoCartao(provaId, est).length;

function folhasDoCartao(provaId, est) {
  const corpos = corposDoCartao(provaId, est);
  return corpos.map((c, i) => `
    <div class="cr-folha">
      ${cabecalhoCartao(provaId, est, c.faixa)}
      ${c.html}
      ${rodapeCartao(est, i + 1, corpos.length)}
    </div>`).join('');
}

let cartTurma = 'todas';
function telaCartoes() {
  const pAtiva = provaAtual();
  if (!pAtiva) {
    $('#app').innerHTML = '<div class="quadro"><div class="miolo"><div class="vazio">Nenhuma prova cadastrada — crie a primeira no Painel.</div></div></div>';
    return;
  }
  // Os cartões são do elenco desta prova: quem faz o 9º ano não recebe o
  // cartão da 3ª série.
  const elenco = estudantesDaProva(pAtiva.id);
  const turmas = [...new Set(elenco.map(e => e.turma))].sort();
  const filtrados = elenco.filter(e => cartTurma === 'todas' || e.turma === cartTurma)
    .sort((a, b) => a.turma.localeCompare(b.turma) || a.nome.localeCompare(b.nome));
  const linhas = filtrados.map(e => `
    <tr><td>${esc(e.nome)}</td><td style="font-family:var(--mono)">${esc(e.matricula)}</td>
      <td>${esc(e.turma)}</td><td style="text-transform:capitalize">${esc(e.versao)}</td>
      <td>${totalFolhas(pAtiva.id, e)}</td>
      <td style="white-space:nowrap">
        <button class="btn mini fantasma" data-acao="est-editar" data-id="${e.id}">Editar</button>
        ${ehCoord() ? `<button class="btn mini vermelho" data-acao="est-remover" data-id="${e.id}">Remover</button>` : ''}
      </td></tr>`).join('');
  const opsTurma = ['todas', ...turmas].map(t =>
    `<option value="${t}" ${cartTurma === t ? 'selected' : ''}>${t === 'todas' ? 'Todas as turmas' : t}</option>`).join('');
  const previa = filtrados.slice(0, 1).map(e => folhasDoCartao(pAtiva.id, e)).join('');
  const nRegItens = prova(pAtiva.id, 'regular').length, nAdaItens = prova(pAtiva.id, 'adaptada').length;
  const folhasTotal = filtrados.reduce((s, e) => s + totalFolhas(pAtiva.id, e), 0);

  $('#app').innerHTML = `
  <div class="quadro"><div class="miolo">
    <div class="cab-tela">
      <div><h2>Cartões-resposta — ${esc(pAtiva.serie)}</h2>
        <span class="sub">${elenco.length} ${elenco.length === 1 ? 'estudante' : 'estudantes'} nesta prova · ${folhasTotal} folha(s) a imprimir e digitalizar no filtro atual</span></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select class="caixa" style="width:auto" data-mud="cart-turma">${opsTurma}</select>
        ${ehCoord() ? '<a class="btn fantasma" href="#/administracao" style="text-decoration:none">⬆ Importar lista de estudantes</a>' : ''}
        ${ehCoord() ? '<button class="btn" data-acao="est-novo">+ Estudante</button>' : ''}
        <button class="btn rosa" data-acao="cart-imprimir" ${filtrados.length && (nRegItens + nAdaItens) ? '' : 'disabled'}>🖨 Imprimir cartões (${filtrados.length})</button>
      </div>
    </div>
    ${linhas ? `<table><thead><tr><th>Nome</th><th>Matrícula</th><th>Turma</th><th>Versão</th><th>Folhas</th><th></th></tr></thead>
      <tbody>${linhas}</tbody></table>`
      : `<div class="vazio">Nenhum estudante no elenco da prova de ${esc(pAtiva.serie)}.${ehCoord() ? ' Importe a lista em Administração — a série do CSV é o que liga cada estudante à sua prova.' : ''}</div>`}
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <button class="btn fantasma" data-acao="cart-template">⬇ Exportar gabarito p/ leitor local (JSON)</button>
    </div>
  </div>
  ${previa && (nRegItens + nAdaItens) ? `<div class="cr-previa"><div style="width:100%;text-align:center;font-size:12px;color:#6b5f52;margin-bottom:10px">Prévia — folhas do 1º estudante do filtro</div>${previa}</div>` : ''}
  </div>
  <p class="nota-tela"><strong>Cada estudante tem mais de uma folha</strong> — objetiva, discursiva (quando houver item tipo D) e redação, se a coordenação optar por imprimi-la. Todas trazem cabeçalho com nome, matrícula e turma, âncoras de leitura óptica nos cantos e a identificação “folha N de M”, para que a digitalização em lote saiba a qual estudante e a qual parte da prova cada imagem pertence. Os itens dos tipos B e D aparecem rotulados na grade principal e têm campos próprios: o tipo B na coluna à direita, com centena, dezena e unidade; o tipo D na folha seguinte, com a pauta de resposta e as bolhas de percentual de acerto (0, 25, 50, 75 e 100%) preenchidas por quem corrige.</p>`;
}
MUDS['cart-turma'] = (d, el) => { cartTurma = el.value; render(); };

function dlgEstudante(e) {
  abrirDlg(`
    <div class="dlg-cab"><h2>${e ? 'Editar estudante' : 'Novo estudante'}</h2><button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      <div class="form-linha">
        <div class="campo" style="min-width:240px"><label>Nome</label><input class="caixa" id="es-nome" value="${esc(e?.nome || '')}"></div>
        <div class="campo"><label>Matrícula</label><input class="caixa" id="es-mat" value="${esc(e?.matricula || '')}"></div>
      </div>
      <div class="form-linha">
        <div class="campo"><label>Turma</label><input class="caixa" id="es-turma" value="${esc(e?.turma || '')}" placeholder="ex.: 1ª B"></div>
        <div class="campo"><label>Série</label>
          <select class="caixa" id="es-serie">${SERIES.map(s =>
            `<option ${e?.serie === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="campo"><label>Versão da prova</label>
          <select class="caixa" id="es-versao">
            <option value="regular" ${e?.versao !== 'adaptada' ? 'selected' : ''}>Regular</option>
            <option value="adaptada" ${e?.versao === 'adaptada' ? 'selected' : ''}>Adaptada</option>
          </select></div>
      </div>
      <p style="font-size:12.5px;color:var(--ink-2);margin:0">A série define de quais provas o estudante participa.</p>
    </div>
    <div class="dlg-pe"><button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="est-salvar" data-id="${e?.id || ''}">Salvar</button></div>`);
}
ACOES['est-novo'] = () => dlgEstudante({ serie: provaAtual()?.serie });
ACOES['est-editar'] = d => dlgEstudante(S.estudantes.find(e => e.id === d.id));
ACOES['est-salvar'] = d => {
  const dados = {
    nome: $('#es-nome').value.trim(), matricula: $('#es-mat').value.trim(),
    turma: $('#es-turma').value.trim(), serie: $('#es-serie').value,
    versao: $('#es-versao').value
  };
  if (!dados.nome || !dados.matricula) { toast('Nome e matrícula são obrigatórios.'); return; }
  let alvo;
  if (d.id) { alvo = S.estudantes.find(e => e.id === d.id); Object.assign(alvo, dados); }
  else { alvo = { id: uid(), ...dados }; S.estudantes.push(alvo); }
  // O elenco das provas da série acompanha o cadastro.
  const tocadas = provasOrdenadas().filter(p => p.serie === dados.serie).map(p => p.id);
  tocadas.forEach(sincronizarElenco);
  $('#dlg').close(); commit(); PERS.estudante(alvo);
  tocadas.forEach(PERS.elenco);
  toast('Estudante salvo.');
};
ACOES['est-remover'] = d => {
  const alvo = S.estudantes.find(e => e.id === d.id);
  S.estudantes = S.estudantes.filter(e => e.id !== d.id);
  const provasComEle = [];
  for (const [provaId, ids] of Object.entries(S.elencos || {})) {
    if (!ids.includes(d.id)) continue;
    S.elencos[provaId] = ids.filter(x => x !== d.id);
    provasComEle.push(provaId);
    delete S.respostas[provaId]?.[d.id];
  }
  commit();
  PERS.removerEstudante(d.id);
  provasComEle.forEach(pid => { PERS.elenco(pid); PERS.removerResposta(pid, d.id); });
  toast(`${alvo?.nome || 'Estudante'} removido.`);
};
ACOES['cart-imprimir'] = () => {
  const pAtiva = provaAtual();
  if (!pAtiva) return;
  const filtrados = estudantesDaProva(pAtiva.id).filter(e => cartTurma === 'todas' || e.turma === cartTurma)
    .sort((a, b) => a.turma.localeCompare(b.turma) || a.nome.localeCompare(b.nome));
  $('#print-area').innerHTML = filtrados.map(e => folhasDoCartao(pAtiva.id, e)).join('');
  window.print();
};
ACOES['cart-template'] = () => {
  const pAtiva = provaAtual();
  if (!pAtiva) return;
  // O leitor óptico precisa saber que cada estudante tem mais de uma folha e
  // o que procurar em cada uma.
  const daVersao = v => {
    const pv = prova(pAtiva.id, v);
    const folhas = [{
      folha: 1, tipo: 'objetiva',
      itens: pv.filter(({ item }) => item.tipo !== 'D')
        .map(({ item, numero }) => ({ numero, tipo: item.tipo, gabarito: item.gabarito }))
    }];
    const ds = pv.filter(({ item }) => item.tipo === 'D');
    if (ds.length) folhas.push({
      folha: folhas.length + 1, tipo: 'discursiva', percentuais: PERCENTUAIS_D,
      itens: ds.map(({ item, numero }) => ({ numero, tipo: 'D', linhas: item.dLinhas || 10 }))
    });
    if (pAtiva.temRedacao !== false && pAtiva.imprimirRedacao !== false)
      folhas.push({ folha: folhas.length + 1, tipo: 'redacao', linhas: LINHAS_REDACAO });
    return { totalItens: pv.length, folhas };
  };
  // v3: o gabarito passa a dizer de que prova ele é. Sem isso o leitor não
  // consegue distinguir a folha do 9º ano da folha da 3ª série.
  const tpl = {
    formato: 'pas-marista/gabarito-v3',
    prova: { id: pAtiva.id, serie: pAtiva.serie, etapa: pAtiva.etapa, nome: pAtiva.nome },
    simulado: pAtiva.nome, etapa: pAtiva.etapa,
    geradoEm: new Date().toISOString(),
    identificacao: { chave: 'matricula', ancoras: 'quatro quadrados pretos, dois no topo e dois no rodapé de cada folha' },
    versoes: Object.fromEntries(['regular', 'adaptada'].map(v => [v, daVersao(v)]))
  };
  baixar(`pas-gabarito-${pAtiva.id}.json`, JSON.stringify(tpl, null, 2));
  toast(`Gabarito da prova de ${pAtiva.serie} exportado.`);
};

/* ================= TELA 7 · CORREÇÃO ================= */
let corrEstId = null, corrTurmaBol = 'todas';

// Ordenados dentro do elenco da prova — a correção é sempre de uma prova.
function estudantesOrdenados(provaId = idProvaAtual()) {
  return estudantesDaProva(provaId).slice()
    .sort((a, b) => a.turma.localeCompare(b.turma) || a.nome.localeCompare(b.nome));
}

/* ---------------- redação: lançamento ----------------
   O que se lança continua sendo o da planilha oficial do PAS — NC (nota de
   conteúdo, 0 a 10), NE (número de erros) e TL (total de linhas), com
   NR = NC − 2·NE/TL. O que mudou é a tabela dizer de onde a nota vem: a mesma
   NC dá notas diferentes conforme o tamanho do texto, e sem ver o desconto
   quem lança não tem como desconfiar de um TL digitado errado.               */

// A redação de um estudante nesta prova, ou null.
const redacaoDe = (provaId, estId) => S.respostas[provaId]?.[estId]?.redacao || null;

// Lançada é a que tem total de linhas: sem TL a fórmula não fecha, e uma linha
// com NC e sem TL não é nota — é lançamento pela metade.
const redLancada = red => !!red && Number(red.tl) > 0;

// A conta que forma NR, com os números daquele estudante no lugar das letras.
function contaDoNR(red) {
  if (!redLancada(red)) return null;
  const nc = Number(red.nc) || 0, ne = Number(red.ne) || 0, tl = Number(red.tl) || 0;
  const desconto = 2 * ne / tl;
  return {
    desconto, nr: Math.max(0, nc - desconto),
    formula: `${num(nc, 1)} − 2·${ne}/${tl}`,
    // A fórmula pode passar do zero; a nota não. Quando isso acontece é o piso
    // que está valendo, e não a conta — dizê-lo evita a impressão de erro.
    noPiso: nc - desconto < 0
  };
}

// Quantas redações já foram lançadas nesta prova.
function htmlResumoRedacao(provaId) {
  const lista = estudantesOrdenados(provaId);
  const lancadas = lista.filter(e => redLancada(redacaoDe(provaId, e.id))).length;
  const pct = lista.length ? Math.round(lancadas / lista.length * 100) : 0;
  return `<div class="red-resumo">
    <div><b>${lancadas}</b> de ${lista.length} ${lista.length === 1 ? 'redação lançada' : 'redações lançadas'}</div>
    <div class="barra" style="flex:1;min-width:120px;margin:0"><i style="width:${pct}%"></i></div>
    <span class="red-formula">NR = NC − 2·NE/TL</span>
  </div>`;
}

// Tabela de lançamento da redação. `data-red-*` marca as células recalculadas
// sem remontar a tela — ver `redacaoMudou()`.
function tabelaRedacao(provaId = idProvaAtual()) {
  const lista = estudantesOrdenados(provaId);
  if (!lista.length) return '<div class="vazio">Nenhum estudante no elenco desta prova ainda.</div>';
  const linhas = lista.map(e => {
    const red = redacaoDe(provaId, e.id) || { nc: '', ne: '', tl: '' };
    return `<tr><td>${esc(e.nome)}</td><td>${esc(e.turma)}</td>
      <td><input class="caixa" style="width:84px" type="number" step="0.1" min="0" max="10" value="${red.nc}"
        data-mud="red" data-campo="nc" data-est="${e.id}" aria-label="NC de ${esc(e.nome)}"></td>
      <td><input class="caixa" style="width:74px" type="number" min="0" value="${red.ne}"
        data-mud="red" data-campo="ne" data-est="${e.id}" aria-label="Erros de ${esc(e.nome)}"></td>
      <td><input class="caixa" style="width:74px" type="number" min="0" max="${LINHAS_REDACAO}" value="${red.tl}"
        data-mud="red" data-campo="tl" data-est="${e.id}" aria-label="Linhas de ${esc(e.nome)}"></td>
      <td class="red-conta" data-red-conta="${e.id}">${celulaConta(red)}</td>
      <td data-red-nr="${e.id}">${celulaNR(red)}</td></tr>`;
  }).join('');
  return `<div style="overflow-x:auto"><table class="red-tab">
    <thead><tr><th>Estudante</th><th>Turma</th><th>NC (0–10)</th><th>Erros (NE)</th>
      <th>Linhas (TL)</th><th>Como a nota se forma</th><th>NR</th></tr></thead>
    <tbody>${linhas}</tbody></table></div>`;
}

// A conta em duas linhas curtas: a substituição na primeira, o desconto na
// segunda. Numa linha só, a coluna empurrava a NR para fora da tela — e a nota
// é justamente o que não pode precisar de rolagem.
function celulaConta(red) {
  const c = contaDoNR(red);
  if (!c) return '<span class="red-falta">falta TL</span>';
  return `<span class="conta">${esc(c.formula)}</span>
    <small>desconto ${num(c.desconto)}</small>${
    c.noPiso ? '<small class="red-piso">passa do zero: vale 0</small>' : ''}`;
}

function celulaNR(red) {
  const c = contaDoNR(red);
  const tl = Number(red?.tl) || 0;
  if (!c) return '<span style="color:var(--ink-2)">—</span>';
  return `<b>${num(c.nr)}</b>${tl > LINHAS_REDACAO
    ? `<br><span class="red-alerta">TL acima da pauta de ${LINHAS_REDACAO} linhas</span>` : ''}`;
}

// Guarda, sincroniza e atualiza à mão só o que depende do lançamento: a conta e
// a nota daquela linha, e o contador do topo. Remontar a tela a cada campo
// custaria o foco — a professora digita NC, tecla Tab e o campo de destino
// deixaria de existir no caminho, como já acontecia na tela de alocação.
function redacaoMudou(provaId, estId) {
  save(S);
  PERS.resposta(provaId, estId);
  const red = redacaoDe(provaId, estId);
  const conta = document.querySelector(`[data-red-conta="${CSS.escape(estId)}"]`);
  const nr = document.querySelector(`[data-red-nr="${CSS.escape(estId)}"]`);
  if (conta) conta.innerHTML = celulaConta(red);
  if (nr) nr.innerHTML = celulaNR(red);
  const resumo = $('#red-resumo');
  if (resumo) resumo.innerHTML = htmlResumoRedacao(provaId);
}

// Tabela de notas dos itens discursivos (tipo D). Coordenação vê todos;
// docente vê apenas os itens aprovados de sua autoria.
function tabelaDiscursivos(provaId = idProvaAtual()) {
  const meus = itensDaProva(provaId).filter(i => i.status === 'aprovado' && i.tipo === 'D' &&
    (ehCoord() || souEu(i)));
  if (!meus.length) return null;
  const numeros = {};
  for (const v of ['regular', 'adaptada'])
    for (const { item, numero } of prova(provaId, v))
      if (item.tipo === 'D') (numeros[item.id] = numeros[item.id] || {})[v] = numero;
  const cab = meus.map(i => {
    const n = numeros[i.id] || {};
    const rot = ['regular', 'adaptada'].filter(v => n[v])
      .map(v => (v === 'regular' ? 'R-' : 'A-') + n[v]).join(' / ');
    // Atributo não renderiza HTML: aqui vai o texto por baixo da marcação, com
    // o código da fórmula à vista — é o que quem escreveu digitou.
    return `<th title="${esc(simples(i.enunciado).slice(0, 140))}">Item ${rot || '—'}<br>
      <span style="font-weight:400;text-transform:none">${esc(i.componente)} · ${esc(i.autor.split(' ')[0])}</span></th>`;
  }).join('');
  const linhas = estudantesOrdenados(provaId).map(e => {
    const cels = meus.map(i => {
      const aplicavel = i.versao === 'ambas' || i.versao === e.versao;
      if (!aplicavel) return '<td style="color:var(--ink-2)">—</td>';
      const v = S.respostas[provaId]?.[e.id]?.discursivas?.[i.id];
      // Os mesmos cinco níveis do cartão-resposta (0, 25, 50, 75 e 100%),
      // guardados como nota de 0 a 10.
      const ops = ['<option value="">—</option>', ...PERCENTUAIS_D.map(p =>
        `<option value="${p / 10}" ${Number(v) === p / 10 ? 'selected' : ''}>${p}%</option>`)].join('');
      return `<td><select class="caixa" style="width:82px"
        data-mud="dnota" data-est="${e.id}" data-item="${i.id}">${ops}</select></td>`;
    }).join('');
    return `<tr><td>${esc(e.nome)}</td><td>${esc(e.turma)}</td>${cels}</tr>`;
  }).join('');
  return `<div style="overflow-x:auto"><table>
    <thead><tr><th>Estudante</th><th>Turma</th>${cab}</tr></thead><tbody>${linhas}</tbody></table></div>`;
}

// Visão restrita: professora de redação lança NC/NE/TL de todos, com a proposta
// desta prova ao lado — corrigir conteúdo sem o tema e o comando na frente é
// corrigir de memória.
function telaCorrecaoRedacao() {
  const pAtiva = provaAtual();
  if (!pAtiva) {
    $('#app').innerHTML = '<div class="quadro"><div class="miolo"><div class="vazio">Nenhuma prova cadastrada ainda.</div></div></div>';
    return;
  }
  // Prova sem redação não tem o que lançar: a tabela some inteira, em vez de
  // oferecer campos que não valem nada.
  if (!provaTemRedacao(pAtiva.id)) {
    $('#app').innerHTML = `
    <div class="quadro"><div class="miolo">
      <div class="cab-tela"><div><h2>Redação — lançamento</h2>
        <span class="sub">${esc(pAtiva.serie)} · ${esc(pAtiva.etapa)}</span></div></div>
      <div class="vazio">A prova de ${esc(pAtiva.serie)} (${esc(pAtiva.etapa)}) <b>não tem redação</b>.
        Se você corrige a redação de outra série, troque de prova no seletor do menu à esquerda.</div>
    </div></div>`;
    return;
  }
  $('#app').innerHTML = `
  <div class="quadro"><div class="miolo">
    <div class="cab-tela"><div><h2>Redação — lançamento · ${esc(pAtiva.serie)}</h2>
      <span class="sub">${esc(pAtiva.etapa)} · NR = NC − 2·NE/TL, pela planilha oficial · cada campo é salvo ao sair dele</span></div></div>
    <div id="red-resumo">${htmlResumoRedacao(pAtiva.id)}</div>
    <div class="red-corr">
      <div class="cartao">
        <h3>A proposta desta prova</h3>
        ${htmlPropostaTela(pAtiva.id)}
      </div>
      <div class="cartao">
        <h3>Lançamento por estudante</h3>
        ${tabelaRedacao(pAtiva.id)}
      </div>
    </div>
  </div></div>
  <p class="nota-tela"><strong>Perfil de redação:</strong> esta tela mostra a proposta desta prova e o lançamento da redação de cada estudante. <strong>NC</strong> = nota de conteúdo, de 0 a 10 · <strong>NE</strong> = número de erros · <strong>TL</strong> = total de linhas escritas. A nota sai da planilha oficial, <strong>NR = NC − 2·NE/TL</strong>: o desconto por erro depende do tamanho do texto, por isso a coluna “como a nota se forma” mostra a conta com os seus números. Sem TL não há NR — a linha fica marcada como não lançada. NR não fica abaixo de zero.</p>`;
}

// Visão restrita: docente lança notas dos próprios itens discursivos.
function telaCorrecaoDiscursivos() {
  const tabela = tabelaDiscursivos();
  $('#app').innerHTML = `
  <div class="quadro"><div class="miolo">
    <div class="cab-tela"><div><h2>Itens discursivos — lançamento de notas</h2>
      <span class="sub">notas de 0 a 10 por estudante, apenas dos seus itens aprovados · salvas automaticamente</span></div></div>
    ${tabela ? `<div class="cartao">${tabela}</div>`
      : '<div class="vazio">Você não tem itens discursivos (tipo D) aprovados neste simulado.</div>'}
  </div></div>
  <p class="nota-tela"><strong>Como conta no escore:</strong> no MVP cada item discursivo vale 1 ponto no escore bruto — a nota lançada (0 a 10) entra como nota/10. Os pesos oficiais entram na fase de calibração.</p>`;
}

// Os números do estudante selecionado. Ficam à parte porque o lançamento da
// redação os atualiza sem remontar a tela.
function chipsDoEstudante(est, provaId) {
  const r = corrigir(est, provaId);
  const red = redacaoDe(provaId, est.id);
  const c = contaDoNR(red);
  return `${provaTemRedacao(provaId)
      ? `<span class="chip info" title="Nota da redação pela planilha oficial">NR ${
          c ? '= ' + esc(c.formula) + ' =' : '='} <b>&nbsp;${num(r.nr)}</b></span>` : ''}
    <span class="chip ${r.eb >= 0 ? 'ok' : 'falta'}" style="margin-left:6px">Escore bruto: ${num(r.eb, 2)}</span>
    <span class="chip pend" style="margin-left:6px">${r.ac} certas · ${r.er} erradas · ${r.br} em branco</span>`;
}

function telaCorrecao() {
  if (ehRedacao()) { telaCorrecaoRedacao(); return; }
  if (!ehCoord()) { telaCorrecaoDiscursivos(); return; }
  const pAtiva = provaAtual();
  if (!pAtiva) {
    $('#app').innerHTML = '<div class="quadro"><div class="miolo"><div class="vazio">Nenhuma prova cadastrada — crie a primeira no Painel.</div></div></div>';
    return;
  }
  const provaId = pAtiva.id;
  const elenco = estudantesOrdenados(provaId);
  const comResp = elenco.filter(e => corrigir(e, provaId).temResp);
  const est = elenco.find(e => e.id === corrEstId) || null;
  const turmas = [...new Set(elenco.map(e => e.turma))].sort();

  const opsEst = ['<option value="">— selecione um estudante —</option>',
    ...elenco.map(e => `<option value="${e.id}" ${e.id === corrEstId ? 'selected' : ''}>${esc(e.turma)} · ${esc(e.nome)} (${esc(e.matricula)})</option>`)].join('');

  let lancamento = '';
  if (est) {
    const pv = prova(provaId, est.versao);
    const resp = S.respostas[provaId]?.[est.id] || { marcacoes: {}, redacao: null };
    const grade = pv.filter(x => x.item.tipo !== 'D').map(({ item, numero }) => {
      const m = String(resp.marcacoes?.[item.id] ?? '');
      const gab = item.tipo === 'B' ? String(item.gabarito).padStart(3, '0') : String(item.gabarito).toUpperCase();
      const certa = m !== '' && (item.tipo === 'B' ? m.padStart(3, '0') === gab : m.toUpperCase() === gab);
      const cls = m === '' ? '' : (certa ? 'certa' : 'errada');
      let campo;
      if (item.tipo === 'B') {
        campo = `<input maxlength="3" inputmode="numeric" placeholder="—" value="${esc(m)}" data-mud="marc" data-est="${est.id}" data-item="${item.id}" style="font-family:var(--mono)">`;
      } else {
        const ops = ['', ...TIPOS[item.tipo].respostas].map(r =>
          `<option value="${r}" ${m.toUpperCase() === r ? 'selected' : ''}>${r || '—'}</option>`).join('');
        campo = `<select data-mud="marc" data-est="${est.id}" data-item="${item.id}">${ops}</select>`;
      }
      return `<div class="lanc-item ${cls}" title="Gabarito: ${gab}"><span class="no">${numero}</span>${campo}</div>`;
    }).join('');
    const r = corrigir(est, provaId);
    const red = resp.redacao || { nc: '', ne: '', tl: '' };
    // Os campos de redação só existem se a prova tiver redação — do contrário
    // seriam três caixas que não entram em nota nenhuma.
    const camposRedacao = provaTemRedacao(provaId) ? `
          <div class="campo" style="flex:0;min-width:130px"><label>Redação · NC (0–10)</label>
            <input class="caixa" type="number" step="0.1" min="0" max="10" value="${red.nc}" data-mud="red" data-campo="nc" data-est="${est.id}"></div>
          <div class="campo" style="flex:0;min-width:130px"><label>Nº de erros (NE)</label>
            <input class="caixa" type="number" min="0" value="${red.ne}" data-mud="red" data-campo="ne" data-est="${est.id}"></div>
          <div class="campo" style="flex:0;min-width:130px"><label>Total de linhas (TL)</label>
            <input class="caixa" type="number" min="0" max="${LINHAS_REDACAO}" value="${red.tl}" data-mud="red" data-campo="tl" data-est="${est.id}"></div>` : '';
    lancamento = `
      <div class="cartao" style="margin-bottom:16px">
        <h3>Lançamento de marcações — ${esc(est.nome)} (${est.versao})</h3>
        ${pv.length ? `<div class="lanc-grid">${grade}</div>` : '<div class="vazio">A prova desta versão ainda não tem itens aprovados.</div>'}
        <div class="form-linha" style="margin-top:14px;align-items:flex-end">
          ${camposRedacao}
          <div class="campo" style="flex:1" id="corr-chips">${chipsDoEstudante(est, provaId)}</div>
        </div>
      </div>`;
  }

  // A coluna da redação só existe se a prova tiver redação: uma coluna inteira
  // de travessões afirmaria que ninguém lançou, e não que não há o que lançar.
  const comRed = provaTemRedacao(provaId);
  const relatorio = turmas.map(t => {
    const alunos = elenco.filter(e => e.turma === t).map(e => ({ e, r: corrigir(e, provaId) })).filter(x => x.r.temResp);
    if (!alunos.length) return '';
    const med = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
    const mEB = med(alunos.map(x => x.r.eb));
    const nrs = alunos.filter(x => x.r.nr !== null).map(x => x.r.nr);
    const mNR = nrs.length ? med(nrs) : null;
    const prop = g => {
      const vals = alunos.map(x => x.r.porGrupo[g]).filter(x => x.tot > 0);
      return vals.length ? med(vals.map(x => x.ac / x.tot)) : null;
    };
    return `<tr><td>${esc(t)}</td><td>${alunos.length}</td><td>${num(mEB)}</td>${
      comRed ? `<td>${num(mNR, 1)}</td>` : ''}
      <td>${num(prop('Interpretar'))}</td><td>${num(prop('Executar'))}</td></tr>`;
  }).join('');

  const opsTurmaBol = ['todas', ...turmas].map(t =>
    `<option value="${t}" ${corrTurmaBol === t ? 'selected' : ''}>${t === 'todas' ? 'Todas as turmas' : t}</option>`).join('');

  $('#app').innerHTML = `
  <div class="quadro"><div class="miolo">
    <div class="cab-tela">
      <div><h2>Correção e boletins — ${esc(pAtiva.serie)}</h2>
        <span class="sub">${esc(pAtiva.etapa)} · lançamento manual, importação do leitor local e relatórios</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn fantasma" data-acao="resp-importar">⬆ Importar respostas (CSV do leitor)</button>
        <button class="btn fantasma" data-acao="notas-exportar">⬇ Planilha de notas (CSV)</button>
      </div>
    </div>

    <div class="grade g3" style="margin-bottom:16px">
      <div class="cartao vivo"><h3><span class="pingo" style="background:var(--azul)"></span>Cartões lançados</h3>
        <div class="num">${comResp.length}<small> / ${elenco.length}</small></div>
        <div class="barra"><i style="width:${elenco.length ? comResp.length / elenco.length * 100 : 0}%"></i></div></div>
      <div class="cartao vivo"><h3><span class="pingo" style="background:var(--rosa)"></span>Itens na versão regular</h3>
        <div class="num">${prova(provaId, 'regular').length}</div></div>
      <div class="cartao vivo"><h3><span class="pingo" style="background:var(--verde)"></span>Itens na versão adaptada</h3>
        <div class="num">${prova(provaId, 'adaptada').length}</div></div>
    </div>

    <div class="campo" style="margin-bottom:14px;max-width:480px"><label>Estudante</label>
      <select class="caixa" data-mud="corr-est">${opsEst}</select></div>
    ${lancamento}

    <div class="grade g2">
      <div class="cartao">
        <h3>Desempenho por turma</h3>
        ${relatorio ? `<table><thead><tr><th>Turma</th><th>Lançados</th><th>Média EB</th>${
          comRed ? '<th>Redação</th>' : ''}<th>Interpretar</th><th>Executar</th></tr></thead>
          <tbody>${relatorio}</tbody></table>` : '<div class="vazio">Sem respostas lançadas ainda.</div>'}
      </div>
      <div class="cartao">
        <h3>Boletins em PDF (lote por turma)</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select class="caixa" style="width:auto" data-mud="corr-turma-bol">${opsTurmaBol}</select>
          <button class="btn rosa" data-acao="bol-imprimir" ${comResp.length ? '' : 'disabled'}>📄 Imprimir boletins</button>
        </div>
        <p style="font-size:12.5px;color:var(--ink-2);margin:10px 0 0">Gera um boletim por estudante com respostas lançadas (escolha “Salvar como PDF” na impressão). Cada boletim traz escore, redação, posição e proporção de acertos por grupo de habilidades comparada à média da turma.</p>
      </div>
    </div>

    ${provaTemRedacao(provaId) ? `<div class="cartao" style="margin-top:16px">
      <h3>Redação — lançamento por estudante (a professora de redação vê só esta tabela, com a proposta ao lado)</h3>
      <div id="red-resumo">${htmlResumoRedacao(provaId)}</div>
      ${propostaEscrita(provaId) ? '' : `<p style="font-size:12.5px;color:var(--ink-2);margin:0 0 10px">
        A proposta desta prova ainda não foi escrita — escreva-a em <a href="#/caderno">Caderno</a>,
        em “✍ Proposta de redação”, para que ela saia no caderno e apareça a quem corrige.</p>`}
      ${tabelaRedacao()}
    </div>` : ''}
    ${(() => { const t = tabelaDiscursivos(); return t ? `<div class="cartao" style="margin-top:16px">
      <h3>Itens discursivos (tipo D) — notas de 0 a 10 (cada docente vê só os seus)</h3>
      ${t}
    </div>` : ''; })()}
  </div></div>
  <p class="nota-tela"><strong>Pontuação do MVP:</strong> tipo A: certo +1, errado −1 · tipo B: certo +1 · tipos C e D: certo +1, errado −1 · em branco 0.${
    comRed ? ' Redação pela planilha oficial: NR = NC − 2·NE/TL.' : ''} Os pesos finais do PAS (parâmetro x) entram na fase de calibração.</p>`;
}
MUDS['corr-est'] = (d, el) => { corrEstId = el.value || null; render(); };
MUDS['corr-turma-bol'] = (d, el) => { corrTurmaBol = el.value; };

// Todo lançamento é dentro da prova que está na tela.
function respostaParaEditar(estId, provaId = idProvaAtual()) {
  const daProva = S.respostas[provaId] || (S.respostas[provaId] = {});
  return daProva[estId] || (daProva[estId] = { marcacoes: {}, redacao: null });
}
MUDS['marc'] = (d, el) => {
  const provaId = idProvaAtual();
  const r = respostaParaEditar(d.est, provaId);
  const v = el.value.trim();
  if (v === '') delete r.marcacoes[d.item]; else r.marcacoes[d.item] = v.toUpperCase();
  commit(); PERS.resposta(provaId, d.est);
};
MUDS['red'] = (d, el) => {
  const provaId = idProvaAtual();
  const r = respostaParaEditar(d.est, provaId);
  r.redacao = r.redacao || { nc: 0, ne: 0, tl: 0 };
  // NC é nota de 0 a 10; NE e TL são contagens — 2,5 erros não existem, e um
  // NC de 90 digitado sem ponto viraria nota impossível no boletim.
  const v = Math.max(0, parseFloat(el.value) || 0);
  r.redacao[d.campo] = d.campo === 'nc' ? Math.min(10, v) : Math.round(v);
  if (String(r.redacao[d.campo]) !== el.value.trim()) el.value = r.redacao[d.campo];
  // A tela da professora é só a tabela: nada mais depende do lançamento, e
  // atualizar as células no lugar preserva o foco de quem está digitando. A da
  // coordenação cruza o mesmo número em outros quadros, então continua
  // remontando — número que não acompanha é pior do que número nenhum.
  if (ehRedacao()) { redacaoMudou(provaId, d.est); return; }
  commit(); PERS.resposta(provaId, d.est);
};
MUDS['dnota'] = (d, el) => {
  const provaId = idProvaAtual();
  const r = respostaParaEditar(d.est, provaId);
  r.discursivas = r.discursivas || {};
  const v = el.value.trim();
  if (v === '') delete r.discursivas[d.item];
  else r.discursivas[d.item] = Math.max(0, Math.min(10, parseFloat(v) || 0));
  commit(); PERS.resposta(provaId, d.est);
};

ACOES['resp-importar'] = () => {
  abrirDlg(`
    <div class="dlg-cab"><h2>Importar respostas do leitor local</h2><button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      <p style="font-size:13px;color:var(--ink-2);margin-top:0">Cole o CSV gerado pelo aplicativo de leitura óptica (ou digitado), uma marcação por linha:<br>
        <code style="font-family:var(--mono)">matrícula;número do item;resposta</code><br>
        Exemplos: <code style="font-family:var(--mono)">2026-0142;1;C</code> · <code style="font-family:var(--mono)">2026-0142;28;960</code></p>
      <textarea class="caixa" id="imp-resp" rows="10" placeholder="2026-0142;1;C&#10;2026-0142;2;E&#10;2026-0142;28;960"></textarea>
    </div>
    <div class="dlg-pe"><button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="resp-importar-ok">Importar</button></div>`);
};
ACOES['resp-importar-ok'] = () => {
  const provaId = idProvaAtual();
  const elenco = estudantesDaProva(provaId);
  const linhas = $('#imp-resp').value.split('\n').map(l => l.trim()).filter(Boolean);
  const mapaProva = {};
  const afetados = new Set();
  let ok = 0, ign = 0, fora = 0;
  for (const l of linhas) {
    const [mat, no, resp] = l.split(/[;,\t]/).map(x => (x || '').trim());
    // Só o elenco desta prova: uma folha da 3ª série lida por engano no
    // lançamento do 9º ano é recusada em vez de gravar nota no lugar errado.
    const est = elenco.find(e => e.matricula === mat);
    const numero = parseInt(no, 10);
    if (!est) { if (mat) fora++; else ign++; continue; }
    if (!numero || resp === undefined) { ign++; continue; }
    const pv = mapaProva[est.versao] || (mapaProva[est.versao] = prova(provaId, est.versao));
    const entrada = pv.find(e => e.numero === numero);
    if (!entrada) { ign++; continue; }
    const r = respostaParaEditar(est.id, provaId);
    if (resp === '') delete r.marcacoes[entrada.item.id];
    else r.marcacoes[entrada.item.id] = resp.toUpperCase();
    afetados.add(est.id);
    ok++;
  }
  $('#dlg').close(); commit(); PERS.respostas(provaId, [...afetados]);
  toast(`${ok} marcação(ões) importada(s)` +
    (ign ? ` · ${ign} linha(s) ignorada(s)` : '') +
    (fora ? ` · ${fora} de estudante fora desta prova` : '') + '.');
};

ACOES['notas-exportar'] = () => {
  const p = provaAtual();
  const provaId = p?.id;
  const linhas = ['serie;etapa;matricula;nome;turma;versao;certas;erradas;brancos;escore_bruto;redacao_nr'];
  for (const e of estudantesDaProva(provaId)) {
    const r = corrigir(e, provaId);
    if (!r.temResp) continue;
    linhas.push([p.serie, p.etapa, e.matricula, e.nome, e.turma, e.versao, r.ac, r.er, r.br,
      r.eb.toFixed(2).replace('.', ','), r.nr === null ? '' : r.nr.toFixed(1).replace('.', ',')].join(';'));
  }
  baixar(`pas-notas-${provaId}.csv`, '﻿' + linhas.join('\n'), 'text/csv;charset=utf-8');
  toast(`Planilha de notas da prova de ${p.serie} exportada.`);
};

function htmlBoletim(provaId, est, r, pos, total, mediasTurma) {
  const p = provaPorId(provaId) || {};
  const barras = GRUPOS.map(g => {
    const gd = r.porGrupo[g];
    const prop = gd.tot ? gd.ac / gd.tot : 0;
    const med = mediasTurma[g] ?? 0;
    return `<div class="hbar"><span>${g}</span><div class="trilho">
      <i style="width:${Math.round(prop * 100)}%"></i><i class="media" style="width:${Math.round(med * 100)}%"></i></div>
      <b style="font-size:9px">${num(prop)}</b></div>`;
  }).join('');
  const trecho = r.detalhes.slice(0, 10);
  const linhaG = trecho.map(d => String(d.gab).padStart(2, ' ')).join(' ');
  const linhaM = trecho.map(d => d.m === null ? ' —' : `<b style="color:${d.certa ? '#12b76a' : '#e5484d'}">${String(d.m).padStart(2, ' ')}</b>`).join(' ');
  const linhaN = trecho.map(d => String(d.numero).padStart(2, ' ')).join(' ');
  return `
  <div class="folha" style="width:100%">
    <div class="bol-cab"><h4>Boletim de Desempenho Individual</h4>
      <p>${esc(p.nome || '')} · ${esc(p.serie || '')} · ${esc(p.etapa || '')} · ${esc(est.nome).toUpperCase()} · Matrícula ${esc(est.matricula)} · ${esc(est.turma)}</p></div>
    <div class="bol-sec">
      <h5>Proporção de acertos por grupo de habilidades</h5>
      ${barras}
      <div style="font-size:7px;color:#777;margin-top:5px">Barra azul: estudante · traço rosa: média da turma</div>
    </div>
    <div class="bol-notas${provaTemRedacao(provaId) ? '' : ' sem-red'}">
      <div class="bol-nota"><b>${num(r.eb)}</b><span>Escore bruto</span></div>
      ${provaTemRedacao(provaId) ? `<div class="bol-nota"><b>${num(r.nr, 1)}</b><span>Redação (NR)</span></div>` : ''}
      <div class="bol-nota"><b>${pos}º</b><span>de ${total}</span></div>
    </div>
    <div class="bol-sec" style="border-top:1px solid #eee;border-bottom:none">
      <h5>Gabarito × suas marcações (trecho)</h5>
      <div style="font-family:var(--mono);font-size:8.5px;line-height:2;color:#333;white-space:pre">Item  ${linhaN}\nGab.  ${linhaG}\nVocê  ${linhaM}</div>
    </div>
  </div>`;
}

ACOES['bol-imprimir'] = () => {
  const provaId = idProvaAtual();
  const elenco = estudantesDaProva(provaId);
  const alunos = elenco
    .filter(e => corrTurmaBol === 'todas' || e.turma === corrTurmaBol)
    .map(e => ({ e, r: corrigir(e, provaId) }))
    .filter(x => x.r.temResp)
    .sort((a, b) => a.e.turma.localeCompare(b.e.turma) || a.e.nome.localeCompare(b.e.nome));
  if (!alunos.length) { toast('Nenhum estudante com respostas nesse filtro.'); return; }
  const folhas = alunos.map(({ e, r }) => {
    const rk = ranking(provaId, e.versao);
    const pos = rk.findIndex(x => x.e.id === e.id) + 1;
    const daTurma = elenco.filter(x => x.turma === e.turma)
      .map(x => corrigir(x, provaId)).filter(x => x.temResp);
    const medias = {};
    for (const g of GRUPOS) {
      const vals = daTurma.map(x => x.porGrupo[g]).filter(x => x.tot > 0).map(x => x.ac / x.tot);
      medias[g] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    }
    return htmlBoletim(provaId, e, r, pos || 1, rk.length || 1, medias);
  }).join('');
  $('#print-area').innerHTML = folhas;
  window.print();
};

/* ================= TELA 8 · ADMINISTRAÇÃO (contas e estudantes) ================= */
// Quem entra no sistema e com qual papel vem da tabela `equipe` no banco —
// não do que a pessoa declara ao entrar. A coordenação cria as contas aqui
// (a Edge Function `equipe` é a única que conhece a chave de serviço).
const PAPEIS = {
  coordenacao: 'Coordenação pedagógica',
  coordenacao_area: 'Coordenação de área',
  docente: 'Docente',
  redacao: 'Professora de redação'
};

let equipeCache = [];
let equipeCarregada = false;

function senhaProvisoria() {
  const palavras = ['cerrado', 'vereda', 'buriti', 'marista', 'sertao', 'aguas', 'pauta', 'ipe', 'lobo', 'chapada'];
  const n = new Uint32Array(3);
  crypto.getRandomValues(n);
  const p = i => palavras[n[i] % palavras.length];
  return p(0).charAt(0).toUpperCase() + p(0).slice(1) + '-' + p(1) + '-' + (1000 + (n[2] % 9000));
}

function telaAdministracao() {
  if (!equipeCarregada) {
    $('#app').innerHTML = '<div class="quadro"><div class="miolo"><div class="vazio">Carregando equipe…</div></div></div>';
    nuvem.carregarEquipe()
      .then(l => { equipeCache = l; equipeCarregada = true; render(); })
      .catch(e => { equipeCarregada = true; toast('Não foi possível carregar a equipe: ' + (e.message || e)); render(); });
    return;
  }

  const meuEmail = (nuvem.usuario()?.email || '').toLowerCase();
  const linhas = equipeCache.map(m => `
    <tr>
      <td>${esc(m.nome || '—')}${m.email === meuEmail ? ' <span class="chip info">você</span>' : ''}</td>
      <td style="font-family:var(--mono);font-size:12.5px">${esc(m.email)}</td>
      <td>${esc(PAPEIS[m.papel] || m.papel)}${m.area ? `<br><span style="font-size:11px;color:var(--ink-2)">${esc(m.area)}</span>` : ''}</td>
      <td>${m.componente ? discChip(m.componente) : '—'}${
        ehComponenteLegado(m.componente) ? '<br><span class="chip pend">reclassificar</span>' : ''}</td>
      <td>${m.trocar_senha ? '<span class="chip pend">senha provisória</span>' : '<span class="chip ok">ativo</span>'}</td>
      <td style="white-space:nowrap">
        <button class="btn mini fantasma" data-acao="equipe-editar" data-email="${esc(m.email)}">Editar</button>
        <button class="btn mini fantasma" data-acao="equipe-senha" data-email="${esc(m.email)}">Nova senha</button>
        ${m.email === meuEmail ? '' :
          `<button class="btn mini vermelho" data-acao="equipe-remover" data-email="${esc(m.email)}">Remover</button>`}
      </td>
    </tr>`).join('');

  // Quantos estudantes cada série tem, e quantos entraram no elenco de cada
  // prova — é o que responde “a lista subiu certo?”.
  const porSerie = SERIES.map(s => {
    const n = S.estudantes.filter(e => e.serie === s).length;
    const provasDaSerie = provasOrdenadas().filter(p => p.serie === s);
    const elencos = provasDaSerie.map(p => `${esc(p.etapa)}: ${(S.elencos?.[p.id] || []).length}`).join(' · ');
    return `<tr><td><b>${esc(s)}</b></td><td>${n}</td>
      <td>${provasDaSerie.length ? elencos : '<span style="color:var(--ink-2)">nenhuma prova desta série</span>'}</td></tr>`;
  }).join('');
  const semSerie = S.estudantes.filter(e => !SERIES.includes(e.serie)).length;

  // Artes virou quatro componentes. Quem ficou na antiga continua trabalhando
  // normalmente — mas a coordenação precisa ver que falta reclassificar, senão
  // a entrega dessas pessoas segue somada num balde só.
  const aReclassificar = equipeCache.filter(m => ehComponenteLegado(m.componente));
  const avisoArtes = aReclassificar.length ? `
    <div class="cartao aviso" style="margin-bottom:16px">
      <h3>Artes agora é ${SUCESSORAS_DE_ARTES.length} componentes</h3>
      <p style="font-size:13px;margin:0 0 8px">Cada linguagem tem o seu docente e a sua entrega:
        ${SUCESSORAS_DE_ARTES.map(c => discChip(c)).join(' ')}</p>
      <p style="font-size:13px;margin:0">
        ${aReclassificar.length === 1 ? 'Uma pessoa continua' : `${aReclassificar.length} pessoas continuam`}
        no componente antigo — ${esc(aReclassificar.map(m => m.nome || m.email).join(', '))}.
        Nada quebrou: ${aReclassificar.length === 1 ? 'ela segue' : 'elas seguem'} usando o sistema normalmente.
        Use <b>Editar</b> para escolher a linguagem certa quando puder.</p>
    </div>` : '';

  $('#app').innerHTML = `
  <div class="quadro"><div class="miolo">
    <div class="cab-tela">
      <div><h2>Administração</h2>
        <span class="sub">contas de acesso e lista de estudantes</span></div>
    </div>

    ${avisoArtes}

    <div class="cartao" style="margin-bottom:16px">
      <div class="cab-tela" style="margin-bottom:10px">
        <div><h3 style="margin:0">Estudantes</h3>
          <span class="sub">${S.estudantes.length} cadastrado(s)${semSerie ? ` · ${semSerie} sem série reconhecida` : ''}</span></div>
        <button class="btn" data-acao="est-importar">⬆ Importar lista (CSV)</button>
      </div>
      <table><thead><tr><th>Série</th><th>Estudantes</th><th>No elenco de cada prova</th></tr></thead>
        <tbody>${porSerie}</tbody></table>
      <p style="font-size:12.5px;color:var(--ink-2);margin:10px 0 0">A <b>série</b> de cada estudante é o que liga
        ele à prova: quem está na 1ª série entra no elenco das provas da 1ª série, e é para esse elenco que saem
        os cartões-resposta e os boletins.</p>
    </div>

    <div class="cartao">
      <div class="cab-tela" style="margin-bottom:10px">
        <div><h3 style="margin:0">Equipe e contas de acesso</h3>
          <span class="sub">${equipeCache.length} pessoa(s) · o papel definido aqui manda no que cada um vê</span></div>
        <button class="btn" data-acao="equipe-nova">+ Adicionar pessoa</button>
      </div>
      ${linhas ? `<div style="overflow-x:auto"><table>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Componente</th><th>Acesso</th><th></th></tr></thead>
        <tbody>${linhas}</tbody></table></div>`
        : '<div class="vazio">Nenhuma pessoa cadastrada além de você.</div>'}
    </div>
  </div></div>
  <p class="nota-tela"><strong>Como funciona o acesso:</strong> só quem está nesta lista consegue entrar no sistema — o banco recusa qualquer cadastro de e-mail fora dela. Ao adicionar alguém, o sistema gera uma <strong>senha provisória</strong> que você entrega à pessoa; ela troca a senha pelo botão 🔑 no topo, depois de entrar.</p>`;
}

/* ----- importação da lista de estudantes ----- */
ACOES['est-importar'] = () => {
  abrirDlg(`
    <div class="dlg-cab"><h2>Importar lista de estudantes</h2><button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      <p style="font-size:13px;color:var(--ink-2);margin-top:0">Cole a lista abaixo — uma linha por estudante, colunas
        separadas por <b>;</b>, <b>,</b> ou tabulação (colar direto de uma planilha funciona):</p>
      <p style="font-family:var(--mono);font-size:12.5px;background:var(--fundo);border:1px solid var(--borda);
        border-radius:8px;padding:9px 12px;margin:0 0 12px">nome completo;matrícula;turma;série;versão</p>
      <p style="font-size:12.5px;color:var(--ink-2);margin:0 0 12px">
        <b>Série</b> aceita “9º ano”, “1ª série”, “2a serie EM”, “3”… ·
        <b>Versão</b> é <em>regular</em> ou <em>adaptada</em> (opcional, padrão regular) ·
        Uma primeira linha de cabeçalho é ignorada automaticamente ·
        Quem já existe é reconhecido pela matrícula e <b>atualizado</b>, não duplicado.</p>
      <textarea class="caixa" id="imp-est" rows="9" placeholder="Antonia Silva de Oliveira;2026-0142;1ª B;1ª série EM;regular&#10;Elisa Fontes Marques;2026-0231;9º D;9º ano;adaptada"></textarea>
      <div id="imp-previa"></div>
    </div>
    <div class="dlg-pe">
      <button class="btn fantasma" style="margin-right:auto" data-acao="est-importar-conferir">Conferir</button>
      <button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="est-importar-ok">Importar</button></div>`);
};

const lerCsvEstudantes = () => lerLinhasEstudantes($('#imp-est').value);

ACOES['est-importar-conferir'] = () => {
  const { bons, ruins } = lerCsvEstudantes();
  const porSerie = {};
  for (const b of bons) porSerie[b.serie] = (porSerie[b.serie] || 0) + 1;
  const novos = bons.filter(b => !S.estudantes.some(e => e.matricula === b.matricula)).length;
  $('#imp-previa').innerHTML = `
    <div class="cartao" style="margin-top:12px">
      <h3>Conferência</h3>
      ${bons.length ? `<p style="font-size:13px;margin:0 0 8px"><b>${bons.length}</b> linha(s) válida(s) —
        ${novos} nova(s), ${bons.length - novos} atualizando cadastro existente.</p>
        <table><thead><tr><th>Série</th><th>Estudantes</th></tr></thead><tbody>${
          Object.entries(porSerie).sort().map(([s, n]) => `<tr><td>${esc(s)}</td><td>${n}</td></tr>`).join('')
        }</tbody></table>` : '<p style="font-size:13px;margin:0">Nenhuma linha válida encontrada.</p>'}
      ${ruins.length ? `<p style="font-size:13px;margin:12px 0 6px;color:var(--vermelho)"><b>${ruins.length}</b> linha(s) com problema:</p>
        <ul style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.7">${
          ruins.slice(0, 12).map(r => `<li>linha ${r.linha}: ${esc(r.porque)} — <span style="font-family:var(--mono)">${esc(String(r.texto).slice(0, 60))}</span></li>`).join('')
        }${ruins.length > 12 ? `<li>…e mais ${ruins.length - 12}</li>` : ''}</ul>` : ''}
    </div>`;
};

ACOES['est-importar-ok'] = () => {
  const { bons, ruins } = lerCsvEstudantes();
  if (!bons.length) { toast('Nenhuma linha válida para importar.'); return; }
  for (const b of bons) {
    const ja = S.estudantes.find(e => e.matricula === b.matricula);
    if (ja) Object.assign(ja, b);
    else S.estudantes.push({ id: uid(), ...b });
  }
  // O elenco de cada prova das séries tocadas é refeito a partir do cadastro.
  const series = new Set(bons.map(b => b.serie));
  const tocadas = provasOrdenadas().filter(p => series.has(p.serie)).map(p => p.id);
  tocadas.forEach(sincronizarElenco);

  $('#dlg').close(); commit(); PERS.estudantesTodos();
  tocadas.forEach(PERS.elenco);
  toast(`${bons.length} estudante(s) importado(s)` +
    (ruins.length ? ` · ${ruins.length} linha(s) ignorada(s)` : '') + '.');
};

function dlgMembro(m) {
  const novo = !m;
  const opsPapel = Object.entries(PAPEIS).map(([k, v]) =>
    `<option value="${k}" ${m?.papel === k ? 'selected' : ''}>${v}</option>`).join('');
  const opsComp = `<option value="">— nenhum —</option>${opcoesComponente(m?.componente)}`;
  const opsArea = Object.keys(AREAS).map(a =>
    `<option ${m?.area === a ? 'selected' : ''}>${a}</option>`).join('');
  abrirDlg(`
    <div class="dlg-cab"><h2>${novo ? 'Adicionar pessoa à equipe' : 'Editar ' + esc(m.nome || m.email)}</h2>
      <button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      <div class="form-linha">
        <div class="campo" style="min-width:200px"><label>Nome</label>
          <input class="caixa" id="eq-nome" value="${esc(m?.nome || '')}" placeholder="ex.: Fernanda"></div>
        <div class="campo" style="min-width:230px"><label>E-mail</label>
          <input class="caixa" id="eq-email" type="email" value="${esc(m?.email || '')}"
            ${novo ? '' : 'disabled'} placeholder="nome@escola.com.br"></div>
      </div>
      <div class="form-linha">
        <div class="campo"><label>Papel</label>
          <select class="caixa" id="eq-papel" data-mud="eq-papel">${opsPapel}</select></div>
        <div class="campo" id="eq-area-wrap" style="${m?.papel === 'coordenacao_area' ? '' : 'display:none'}">
          <label>Área que coordena</label><select class="caixa" id="eq-area">${opsArea}</select></div>
        <div class="campo" id="eq-comp-wrap" style="${['docente', 'coordenacao_area'].includes(m?.papel || 'coordenacao') ? '' : 'display:none'}">
          <label>Componente que leciona</label><select class="caixa" id="eq-comp">${opsComp}</select></div>
      </div>
      <p style="font-size:12.5px;color:var(--ink-2);margin:0 0 10px">A coordenação de área também escreve itens: ela revisa a primeira etapa dos itens da sua área e produz os seus próprios.</p>
      ${novo ? `
        <div class="campo" style="margin-bottom:10px"><label>Senha provisória</label>
          <input class="caixa" id="eq-senha" value="${SENHA_PROVISORIA}" style="font-family:var(--mono)"></div>
        <p style="font-size:12.5px;color:var(--ink-2);margin:0">A conta é criada já liberada — nenhum e-mail de confirmação é enviado.
          Entregue esta senha à pessoa; <b>o sistema exige que ela crie a própria senha no primeiro acesso</b>.</p>`
        : '<p style="font-size:12.5px;color:var(--ink-2);margin:0">Para trocar a senha desta pessoa, use “Nova senha” na lista.</p>'}
    </div>
    <div class="dlg-pe"><button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="${novo ? 'equipe-criar' : 'equipe-atualizar'}" data-email="${esc(m?.email || '')}">
        ${novo ? 'Criar conta' : 'Salvar'}</button></div>`);
}
MUDS['eq-papel'] = () => {
  const papel = $('#eq-papel').value;
  $('#eq-area-wrap').style.display = papel === 'coordenacao_area' ? '' : 'none';
  $('#eq-comp-wrap').style.display = ['docente', 'coordenacao_area'].includes(papel) ? '' : 'none';
};

ACOES['equipe-nova'] = () => dlgMembro(null);
ACOES['equipe-editar'] = d => dlgMembro(equipeCache.find(m => m.email === d.email));

function dadosDoFormulario() {
  const papel = $('#eq-papel').value;
  return {
    nome: $('#eq-nome').value.trim(),
    papel,
    area: papel === 'coordenacao_area' ? $('#eq-area').value : null,
    componente: ['docente', 'coordenacao_area'].includes(papel) ? ($('#eq-comp').value || null) : null
  };
}

async function recarregarEquipe() {
  equipeCache = await nuvem.carregarEquipe();
  equipeCarregada = true;
  render();
}

ACOES['equipe-criar'] = async (d, botao) => {
  const email = $('#eq-email').value.trim().toLowerCase();
  const senha = $('#eq-senha').value;
  if (!email.includes('@')) { toast('Informe um e-mail válido.'); return; }
  if (senha.length < 8) { toast('A senha provisória precisa de ao menos 8 caracteres.'); return; }
  botao.disabled = true;
  try {
    await nuvem.criarConta({ email, senha, ...dadosDoFormulario() });
    await recarregarEquipe();
    abrirDlg(`
      <div class="dlg-cab"><h2>Conta criada</h2><button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
      <div class="dlg-corpo">
        <p style="margin-top:0">Entregue estes dados de acesso a <b>${esc($('#eq-nome')?.value || email)}</b>:</p>
        <div class="cartao" style="font-family:var(--mono);font-size:14px;line-height:1.9">
          <div>Endereço: <b>${esc(location.origin + location.pathname)}</b></div>
          <div>E-mail: <b>${esc(email)}</b></div>
          <div>Senha: <b>${esc(senha)}</b></div>
        </div>
        <p style="font-size:12.5px;color:var(--ink-2)">A senha aparece só agora. Se precisar, gere outra depois em “Nova senha”.</p>
      </div>
      <div class="dlg-pe"><button class="btn" data-acao="fechar-dlg">Fechar</button></div>`);
  } catch (e) {
    botao.disabled = false;
    toast('Não foi possível criar a conta: ' + (e.message || e));
  }
};

ACOES['equipe-atualizar'] = async (d, botao) => {
  botao.disabled = true;
  try {
    await nuvem.gravarMembro({ email: d.email, ...dadosDoFormulario() });
    $('#dlg').close();
    await recarregarEquipe();
    if (d.email === (nuvem.usuario()?.email || '').toLowerCase()) await aposLogin();
    toast('Dados atualizados.');
  } catch (e) {
    botao.disabled = false;
    toast('Não foi possível salvar: ' + (e.message || e));
  }
};

ACOES['equipe-senha'] = d => {
  const m = equipeCache.find(x => x.email === d.email);
  abrirDlg(`
    <div class="dlg-cab"><h2>Nova senha provisória</h2><button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      <p style="margin-top:0">Gerar uma nova senha para <b>${esc(m?.nome || d.email)}</b> (${esc(d.email)}).
        A senha atual deixa de funcionar.</p>
      <div class="campo"><label>Senha</label>
        <input class="caixa" id="eq-senha-nova" value="${senhaProvisoria()}" style="font-family:var(--mono)"></div>
    </div>
    <div class="dlg-pe"><button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="equipe-senha-ok" data-email="${esc(d.email)}">Definir senha</button></div>`);
};
ACOES['equipe-senha-ok'] = async (d, botao) => {
  const senha = $('#eq-senha-nova').value;
  if (senha.length < 8) { toast('A senha precisa de ao menos 8 caracteres.'); return; }
  botao.disabled = true;
  try {
    await nuvem.redefinirSenha(d.email, senha);
    $('#dlg').close();
    toast(`Senha de ${d.email} redefinida — entregue “${senha}” à pessoa.`);
  } catch (e) {
    botao.disabled = false;
    toast('Não foi possível redefinir: ' + (e.message || e));
  }
};

ACOES['equipe-remover'] = d => {
  abrirDlg(`
    <div class="dlg-cab"><h2>Remover acesso?</h2><button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo"><p><b>${esc(d.email)}</b> perde o acesso ao sistema e a conta é apagada.
      Os itens, comentários e lançamentos que a pessoa já registrou continuam no simulado.</p></div>
    <div class="dlg-pe"><button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn vermelho" data-acao="equipe-remover-ok" data-email="${esc(d.email)}">Remover</button></div>`);
};
ACOES['equipe-remover-ok'] = async (d, botao) => {
  botao.disabled = true;
  try {
    await nuvem.removerMembro(d.email);
    $('#dlg').close();
    await recarregarEquipe();
    toast('Acesso removido.');
  } catch (e) {
    botao.disabled = false;
    toast('Não foi possível remover: ' + (e.message || e));
  }
};

/* ---------------- minha conta ---------------- */
ACOES['minha-conta'] = () => {
  abrirDlg(`
    <div class="dlg-cab"><h2>Minha conta</h2><button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      <p style="margin-top:0">Você está como <b>${esc(nomePerfil())}</b> (${esc(nuvem.usuario()?.email || '')}).
        O nome e o papel são definidos pela coordenação.</p>
      <div class="form-linha">
        <div class="campo"><label>Nova senha</label>
          <input class="caixa" id="mc-senha" type="password" autocomplete="new-password"></div>
        <div class="campo"><label>Repita a nova senha</label>
          <input class="caixa" id="mc-senha2" type="password" autocomplete="new-password"></div>
      </div>
    </div>
    <div class="dlg-pe">
      <button class="btn fantasma" style="margin-right:auto" data-acao="rever-tutorial">Rever o tutorial</button>
      <button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="minha-senha-ok">Trocar senha</button></div>`);
};
ACOES['minha-senha-ok'] = async (d, botao) => {
  const a = $('#mc-senha').value, b = $('#mc-senha2').value;
  if (a.length < 8) { toast('A senha precisa de ao menos 8 caracteres.'); return; }
  if (a !== b) { toast('As duas senhas não conferem.'); return; }
  botao.disabled = true;
  try {
    await nuvem.trocarSenha(a);
    $('#dlg').close();
    toast('Senha trocada.');
  } catch (e) {
    botao.disabled = false;
    toast('Não foi possível trocar a senha: ' + (e.message || e));
  }
};

/* ================= PRIMEIRO ACESSO ================= */
// Duas etapas obrigatórias na estreia de cada pessoa: trocar a senha
// provisória e ver o tutorial do próprio papel. Os dois marcadores ficam na
// tabela `equipe` (funções `marcar_senha_trocada` e `marcar_tutorial_visto`),
// então valem em qualquer navegador.

function telaTrocarSenha() {
  $('#app').innerHTML = `
  <div class="quadro" style="max-width:520px;margin:36px auto"><div class="miolo">
    <h2 style="font-size:19px;margin-bottom:4px">Crie a sua senha</h2>
    <p style="color:var(--ink-2);font-size:13.5px;margin:0 0 16px">
      Você entrou com a senha provisória da escola. Antes de continuar, defina uma senha sua —
      ela vale para <b>${esc(nuvem.usuario()?.email || '')}</b>.</p>
    <div class="form-linha">
      <div class="campo"><label>Nova senha</label>
        <input class="caixa" id="ps-1" type="password" autocomplete="new-password"></div>
      <div class="campo"><label>Repita a nova senha</label>
        <input class="caixa" id="ps-2" type="password" autocomplete="new-password"></div>
    </div>
    <p style="font-size:12.5px;color:var(--ink-2);margin:2px 0 16px">
      Ao menos 8 caracteres. Não use a senha provisória de novo.</p>
    <button class="btn" data-acao="ps-salvar">Salvar e entrar</button>
  </div></div>
  <p class="nota-tela" style="text-align:center">Esqueceu de anotar? Peça à coordenação para gerar outra senha provisória.</p>`;
  $('#ps-1').focus();
  $('#ps-2').addEventListener('keydown', ev => { if (ev.key === 'Enter') ACOES['ps-salvar'](); });
}

ACOES['ps-salvar'] = async (d, botao) => {
  const a = $('#ps-1').value, b = $('#ps-2').value;
  if (a.length < 8) { toast('A senha precisa de ao menos 8 caracteres.'); return; }
  if (a !== b) { toast('As duas senhas não conferem.'); return; }
  if (a === SENHA_PROVISORIA) { toast('Escolha uma senha diferente da provisória.'); return; }
  if (botao) botao.disabled = true;
  try {
    await nuvem.trocarSenha(a);
    await nuvem.marcarSenhaTrocada();
    S.perfil.trocarSenha = false;
    toast('Senha criada. Bem-vindo!');
    render();
  } catch (e) {
    if (botao) botao.disabled = false;
    toast('Não foi possível salvar a senha: ' + (e.message || e));
  }
};

/* ---------------- tutorial de boas-vindas ---------------- */
// Um passo por tela, com uma miniatura animada do sistema. O roteiro muda
// conforme o papel: cada pessoa vê só o que ela mesma faz.

const TUTORIAL = {
  coordenacao: [
    { cena: 'ola', titulo: 'Você coordena o simulado inteiro',
      texto: 'Este é o sistema do simulado PAS. Ele acompanha a prova do primeiro texto-base até o boletim do estudante. Em um minuto você conhece as oito telas.' },
    { cena: 'painel', tela: 'painel', titulo: 'Painel',
      texto: 'A visão geral de cada prova: quantos itens já foram aprovados, o que está parado em revisão e o que cada componente entregou. O seletor no topo troca a prova — 9º ano, 1ª, 2ª e 3ª série —, e a tabela “As provas do simulado” mostra as quatro de uma vez.' },
    { cena: 'alocacao', tela: 'alocacao', titulo: 'Alocação por docente',
      texto: 'Antes de alguém escrever, você distribui a prova: quantos itens cada docente entrega em cada série. “Dividir igualmente” reparte o total sem sobra, e a conferência avisa quando a soma das metas não fecha com o tamanho da prova. O recado que você escrever aparece no painel daquele docente.' },
    { cena: 'textos', tela: 'textos', titulo: 'Textos e alocação',
      texto: 'Você cadastra os textos-base e diz quantos itens cada um comporta. Os docentes ocupam esses espaços livres. As sugestões de texto que eles enviarem aparecem aqui para você aprovar.' },
    { cena: 'revisao', tela: 'itens', titulo: 'Itens e revisão',
      texto: 'O item nasce como rascunho, passa pela coordenação de área e chega a você. Só o que você aprovar entra no caderno, no cartão e na correção. Tudo é conversado dentro do próprio item.' },
    { cena: 'caderno', tela: 'caderno', titulo: 'Caderno',
      texto: 'O caderno se monta sozinho com os itens aprovados, na diagramação do PAS: duas colunas, numeração contínua e o comando de cada bloco escrito automaticamente. Imprima ou salve em PDF.' },
    { cena: 'cartoes', tela: 'cartoes', titulo: 'Cartões-resposta',
      texto: 'Cada estudante recebe as folhas nominais: objetiva, discursiva e — se você quiser — redação. As âncoras nos cantos permitem ler tudo digitalizado em lote.' },
    { cena: 'correcao', tela: 'correcao', titulo: 'Correção e boletins',
      texto: 'Lance as marcações à mão ou importe o arquivo do leitor óptico. Daí saem os boletins individuais, os relatórios por turma e a planilha de notas.' },
    { cena: 'equipe', tela: 'administracao', titulo: 'Administração',
      texto: 'Aqui você cria os acessos e sobe a lista de estudantes por CSV. Cada pessoa recebe uma senha provisória e troca no primeiro login, como você acabou de fazer. A série de cada estudante é o que o liga à prova que ele vai fazer.' }
  ],
  coordenacao_area: [
    { cena: 'ola', titulo: 'Você escreve itens e revisa a sua área',
      texto: 'Neste sistema você tem dois papéis: produz itens como docente e é a primeira revisão dos itens da sua área. Veja onde cada coisa acontece.' },
    { cena: 'textos', tela: 'textos', titulo: 'Textos e alocação',
      texto: 'Cada texto-base tem um número de vagas. Clique em um espaço livre para escrever um item seu naquele texto. Se quiser propor um texto novo, use “Sugerir novo texto” — a coordenação aprova.' },
    { cena: 'itens', tela: 'itens', titulo: 'Escrever um item',
      texto: 'O texto-base fica ao lado enquanto você escreve. Escolha o tipo (A, B, C ou D), a habilidade e o gabarito. Ao terminar, envie para revisão.' },
    { cena: 'revisao', tela: 'itens', titulo: 'Revisar a sua área',
      texto: 'Os itens da sua área chegam a você antes da coordenação geral. Comente dentro do item, devolva com ajustes ou aprove — o que você aprovar segue para a etapa final. Use o filtro “só a minha área” para ver o que está na sua mão.' },
    { cena: 'correcao', tela: 'correcao', titulo: 'Correção',
      texto: 'Depois da aplicação, você lança aqui a nota dos seus itens discursivos, nos mesmos percentuais do cartão: 0, 25, 50, 75 ou 100%.' }
  ],
  docente: [
    { cena: 'ola', titulo: 'Bem-vindo ao Sistema PAS',
      texto: 'Aqui você escreve os itens do simulado e acompanha a revisão deles. O menu à esquerda leva às telas; no alto dele fica a prova em que você está trabalhando.' },
    { cena: 'painel', tela: 'painel', titulo: 'O que você tem para entregar',
      texto: 'O Painel abre com a sua lista: quanto você já escreveu em cada prova — 9º ano, 1ª, 2ª e 3ª série — e o que está em revisão. Clique numa linha para trabalhar naquela prova; o seletor no topo troca a prova a qualquer momento.' },
    { cena: 'textos', tela: 'textos', titulo: 'Textos e alocação',
      texto: 'Cada texto-base tem um número de vagas. Clique em um espaço livre para escrever um item seu naquele texto. Também dá para sugerir um texto novo à coordenação.' },
    { cena: 'itens', tela: 'itens', titulo: 'Meus itens',
      texto: 'O texto-base fica ao lado enquanto você escreve. Escolha o tipo, a habilidade e o gabarito, e envie para revisão. Se voltar com ajustes, a conversa fica registrada dentro do item.' },
    { cena: 'correcao', tela: 'correcao', titulo: 'Correção',
      texto: 'Se você tiver itens discursivos aprovados, é aqui que lança a nota de cada estudante — nos mesmos percentuais do cartão-resposta.' }
  ],
  redacao: [
    { cena: 'ola', titulo: 'Bem-vinda ao Sistema PAS',
      texto: 'Seu acesso é focado: você lança as informações da redação de cada estudante.' },
    { cena: 'redacao', tela: 'correcao', titulo: 'A proposta e o lançamento',
      texto: 'A tela de correção mostra, de um lado, a proposta daquela prova — tema, comando e os textos motivadores que o estudante leu — e, do outro, a tabela de lançamento: nota de conteúdo (NC), número de erros (NE) e total de linhas (TL) de cada estudante. Troque de prova no seletor do menu à esquerda: cada série tem a sua proposta.' },
    { cena: 'formula', tela: 'correcao', titulo: 'A nota sai sozinha',
      texto: 'O sistema calcula NR = NC − 2·NE/TL, pela planilha oficial, e leva o resultado para o boletim. A coluna “como a nota se forma” mostra a conta com os seus números, porque o desconto por erro depende do tamanho do texto. Cada campo é salvo ao sair dele.' }
  ]
};

const passosTutorial = () => TUTORIAL[S.perfil.papel] || TUTORIAL.docente;

// Miniatura animada: a casca do sistema com a aba do passo em destaque.
function cenaTutorial(passo) {
  // As abas vêm das telas que esta pessoa realmente vê: o simulacro não pode
  // mostrar um menu diferente do que ela vai encontrar.
  const abas = telasVisiveis()
    .map(([k, v]) => `<i class="${k === passo.tela ? 'on' : ''}">${esc(v.curto)}</i>`).join('');
  const cenas = {
    ola: `<div class="tut-ola"><span>PAS</span><b>Marista</b></div>`,
    painel: `<div class="tut-cartoes">
        <u style="--d:0s"><s style="width:78%"></s></u>
        <u style="--d:.12s"><s style="width:45%"></s></u>
        <u style="--d:.24s"><s style="width:62%"></s></u>
      </div><div class="tut-tabela">${'<b></b>'.repeat(4)}</div>`,
    textos: `<div class="tut-texto"></div>
      <div class="tut-slots">${['', '', 'livre', 'livre'].map((c, i) =>
        `<i class="${c}" style="--d:${i * .1}s"></i>`).join('')}</div>`,
    itens: `<div class="tut-editor"><div class="tut-fonte"></div><div class="tut-form">
        ${'<i style="--d:0s"></i><i style="--d:.1s"></i><i style="--d:.2s"></i>'}</div></div>`,
    revisao: `<div class="tut-fluxo">
        <i style="--d:0s">rascunho</i><b></b><i style="--d:.5s">área</i><b></b><i style="--d:1s">geral</i>
        <b></b><i class="ok" style="--d:1.5s">aprovado</i></div>`,
    caderno: `<div class="tut-caderno"><div>${'<s></s>'.repeat(9)}</div><div>${'<s></s>'.repeat(9)}</div></div>`,
    cartoes: `<div class="tut-cartao">${Array.from({ length: 5 }, (_, i) =>
        `<u style="--d:${i * .14}s"><o></o><o class="m"></o></u>`).join('')}</div>`,
    correcao: `<div class="tut-barras">${[72, 55, 64, 47].map((h, i) =>
        `<i style="--h:${h}%;--d:${i * .12}s"></i>`).join('')}</div>`,
    equipe: `<div class="tut-equipe">${Array.from({ length: 4 }, (_, i) =>
        `<u style="--d:${i * .13}s"><o></o><s></s></u>`).join('')}</div>`,
    redacao: `<div class="tut-pauta">${Array.from({ length: 7 }, (_, i) =>
        `<s style="--d:${i * .08}s"></s>`).join('')}</div>`,
    formula: `<div class="tut-formula">NR = NC − 2·NE/TL</div>`
  };
  // O simulacro imita a casca de verdade: menu à esquerda, conteúdo à direita.
  return `
  <div class="tut-mock">
    <div class="tut-lado">
      <div class="tut-marca"><span></span><em></em></div>
      <div class="tut-abas">${abas}</div>
    </div>
    <div class="tut-direita">
      <div class="tut-topo"><em></em></div>
      <div class="tut-palco">${cenas[passo.cena] || ''}</div>
    </div>
  </div>`;
}

let passoTutorial = 0;
let tutorialAberto = false;

function abrirTutorial(i = 0) {
  const passos = passosTutorial();
  passoTutorial = Math.max(0, Math.min(i, passos.length - 1));
  const p = passos[passoTutorial];
  const ultimo = passoTutorial === passos.length - 1;
  tutorialAberto = true;
  abrirDlg(`
    <div class="dlg-cab">
      <h2>Tutorial · ${esc(nomePerfil().split(' · ')[0])}</h2>
      <button class="fechar-x" data-acao="tut-fechar" title="Fechar">✕</button>
    </div>
    <div class="dlg-corpo tut-corpo">
      ${cenaTutorial(p)}
      <div class="tut-texto-passo" key="${passoTutorial}">
        <h3>${esc(p.titulo)}</h3>
        <p>${esc(p.texto)}</p>
      </div>
      <div class="tut-pontos">${passos.map((_, k) =>
        `<i class="${k === passoTutorial ? 'on' : ''}" data-acao="tut-ir" data-i="${k}"></i>`).join('')}</div>
    </div>
    <div class="dlg-pe">
      <span style="margin-right:auto;font-size:12.5px;color:var(--ink-2)">${passoTutorial + 1} de ${passos.length}</span>
      ${passoTutorial > 0 ? '<button class="btn fantasma" data-acao="tut-voltar">Voltar</button>' : ''}
      <button class="btn" data-acao="${ultimo ? 'tut-fechar' : 'tut-avancar'}">${ultimo ? 'Começar a usar' : 'Avançar'}</button>
    </div>`, true);
}
ACOES['tut-avancar'] = () => abrirTutorial(passoTutorial + 1);
ACOES['tut-voltar'] = () => abrirTutorial(passoTutorial - 1);
ACOES['tut-ir'] = d => abrirTutorial(parseInt(d.i, 10));
ACOES['tut-fechar'] = async () => {
  $('#dlg').close();
  tutorialAberto = false;
  if (modoNuvem && S.perfil.tutorialVisto === false) {
    S.perfil.tutorialVisto = true;
    try { await nuvem.marcarTutorialVisto(); } catch { /* segue sem marcar */ }
  }
};
ACOES['rever-tutorial'] = () => { $('#dlg').close(); abrirTutorial(0); };

/* ================= LOGIN (modo nuvem) ================= */
function telaLogin() {
  $('#app').innerHTML = `
  <div class="quadro" style="max-width:460px;margin:36px auto"><div class="miolo">
    <h2 style="font-size:19px;margin-bottom:4px">Entrar</h2>
    <p style="color:var(--ink-2);font-size:13.5px;margin:0 0 16px">
      Use o e-mail e a senha que a coordenação do PAS entregou a você.</p>
    <div class="campo" style="margin-bottom:12px"><label>E-mail</label>
      <input class="caixa" id="lg-email" type="email" autocomplete="username"></div>
    <div class="campo" style="margin-bottom:16px"><label>Senha</label>
      <input class="caixa" id="lg-senha" type="password" autocomplete="current-password"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn" data-acao="nuvem-entrar">Entrar</button>
      <button class="btn mini fantasma" style="margin-left:auto" data-acao="nuvem-local"
        title="Sem login: os dados ficam só neste navegador">usar sem conexão</button>
    </div>
  </div></div>
  <p class="nota-tela" style="text-align:center">Ainda não tem senha? Peça à coordenação para criar seu acesso —
    só e-mails liberados por ela entram no sistema. Os dados ficam no banco on-line da escola,
    o mesmo simulado para toda a equipe.</p>`;
  $('#lg-senha').addEventListener('keydown', ev => { if (ev.key === 'Enter') ACOES['nuvem-entrar'](); });
  $('#lg-email').focus();
}
ACOES['nuvem-local'] = () => { modoNuvem = false; toast('Modo local: os dados ficam apenas neste navegador.'); render(); };
ACOES['nuvem-entrar'] = async () => {
  const email = $('#lg-email').value.trim(), senha = $('#lg-senha').value;
  if (!email || !senha) { toast('Preencha e-mail e senha.'); return; }
  try {
    await nuvem.entrar(email, senha);
    await aposLogin();
  } catch (e) {
    const msg = String(e.message || e);
    toast(/confirm/i.test(msg) ? 'E-mail ainda não confirmado — peça à coordenação para recriar seu acesso.'
      : /invalid|credentials/i.test(msg) ? 'E-mail ou senha incorretos.'
      : 'Não foi possível entrar: ' + msg);
  }
};
ACOES['nuvem-sair'] = async () => {
  await nuvem.sair();
  equipeCache = []; equipeCarregada = false; tutorialAberto = false;
  toast('Você saiu da conta.');
  render();
};

// Traz do banco o estado completo do simulado para a memória.
function aplicarDados(dados) {
  S.provas = dados.provas;
  S.textos = dados.textos;
  S.itens = dados.itens;
  S.estudantes = dados.estudantes;
  S.elencos = dados.elencos;
  S.respostas = dados.respostas;
  S.alocacoes = dados.alocacoes || {};
  // A prova escolhida por esta pessoa continua valendo, desde que ainda exista.
  const salva = lerProvaSalva();
  if (salva && dados.provas.some(p => p.id === salva)) S.provaAtiva = salva;
  else if (!dados.provas.some(p => p.id === S.provaAtiva)) S.provaAtiva = dados.provas[0]?.id || null;
}

async function aposLogin() {
  const u = nuvem.usuario();
  try {
    equipeCache = await nuvem.carregarEquipe();
    equipeCarregada = true;
    const eu = equipeCache.find(m => m.email === (u.email || '').toLowerCase());
    S.perfil = {
      papel: eu?.papel || 'docente',
      nome: eu?.nome || u.email,
      // Identidade estável: é por ela que item e meta se ligam à pessoa.
      email: (eu?.email || u.email || '').toLowerCase(),
      componente: eu?.componente || null,
      area: eu?.area || null,
      trocarSenha: !!eu?.trocar_senha,
      tutorialVisto: eu ? !!eu.tutorial_visto : true
    };
  } catch {
    // Sem a lista da equipe, entra com o perfil mais restrito.
    S.perfil = { papel: 'docente', nome: u.email, email: (u.email || '').toLowerCase(),
                 componente: null, area: null, trocarSenha: false, tutorialVisto: true };
  }
  tutorialAberto = false;
  try {
    const dados = await nuvem.carregarTudo();
    if (!dados.provas.length) {
      // Banco sem prova nenhuma: sobe o estado local como ponto de partida.
      await nuvem.substituirTudo(S);
      toast('Banco on-line inicializado com os dados deste navegador.');
    } else {
      aplicarDados(dados);
    }
  } catch (e) { toast('Erro ao carregar da nuvem: ' + (e.message || e)); }
  save(S);
  render();
}

// Recarrega o simulado do banco — outra pessoa pode ter mexido enquanto isso.
async function atualizarDaNuvem(silencioso = false) {
  if (!modoNuvem || !nuvem.usuario() || $('#dlg').open) return;
  try {
    const dados = await nuvem.carregarTudo();
    if (dados.provas.length) { aplicarDados(dados); save(S); render(); }
    if (!silencioso) toast('Dados atualizados.');
  } catch (e) {
    if (!silencioso) toast('Não foi possível atualizar: ' + (e.message || e));
  }
}
ACOES['nuvem-atualizar'] = () => atualizarDaNuvem();

// Ao voltar para a aba, sincroniza sem interromper quem está editando.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') atualizarDaNuvem(true);
});

/* ---------------- inicialização ---------------- */
(async function iniciarApp() {
  // O KaTeX entra antes da primeira tela porque daí em diante a renderização é
  // síncrona em todo o sistema — o caderno mede a altura de cada peça de HTML
  // já pronta para paginar, e não teria como esperar por uma promessa no meio
  // disso. Se a carga falhar, `rico()` mostra o código da fórmula como está
  // escrito, e o sistema segue: item nenhum fica em branco por causa disso.
  try { await carregarKatex(); }
  catch { toast('Notação matemática indisponível — as fórmulas aparecem como código.'); }

  if (NUVEM.ativa && NUVEM.chave && !NUVEM.chave.startsWith('PREENCHER')) {
    try {
      await nuvem.iniciar(NUVEM.url, NUVEM.chave);
      modoNuvem = true;
    } catch {
      modoNuvem = false;
      toast('Nuvem indisponível neste ambiente — rodando em modo local.');
    }
  }
  if (modoNuvem && nuvem.usuario()) { await aposLogin(); return; }
  render();
})();

