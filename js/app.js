// Sistema PAS Marista — SPA sem build (fases 1 e 2 do plano de implantação).
// Estado em memória (S) com cache em localStorage; quando o modo nuvem está
// configurado (js/config-supabase.js), o Supabase é a fonte de verdade e cada
// mutação é sincronizada por linha através do facade PERS.
import { NUVEM } from './config-supabase.js';
import {
  COMPONENTES, GRUPOS, TIPOS, STATUS_ITEM,
  uid, blank, seed, load, save, substituir
} from './dados.js';
import { nuvem } from './nuvem.js';

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
  config() { if (modoNuvem) nuvem.gravarConfig(S.config).catch(PERS.falha); },
  texto(t) { if (modoNuvem) nuvem.gravarLinha('textos', t).catch(PERS.falha); },
  textosTodos() { if (modoNuvem) nuvem.gravarLinhas('textos', S.textos).catch(PERS.falha); },
  removerTexto(id) { if (modoNuvem) nuvem.removerLinha('textos', id).catch(PERS.falha); },
  item(i) {
    if (modoNuvem) nuvem.gravarLinha('itens',
      { ...i, ordem: S.itens.findIndex(x => x.id === i.id) }).catch(PERS.falha);
  },
  itens(ids) {
    if (!modoNuvem) return;
    const lista = ids.map(id => ({ ...S.itens.find(x => x.id === id), ordem: S.itens.findIndex(x => x.id === id) }));
    nuvem.gravarLinhas('itens', lista).catch(PERS.falha);
  },
  removerItem(id) { if (modoNuvem) nuvem.removerLinha('itens', id).catch(PERS.falha); },
  estudante(e) { if (modoNuvem) nuvem.gravarLinha('estudantes', e).catch(PERS.falha); },
  estudantesTodos() { if (modoNuvem) nuvem.gravarLinhas('estudantes', S.estudantes).catch(PERS.falha); },
  removerEstudante(id) { if (modoNuvem) nuvem.removerLinha('estudantes', id).catch(PERS.falha); },
  resposta(estId) { if (modoNuvem && S.respostas[estId]) nuvem.gravarResposta(estId, S.respostas[estId]).catch(PERS.falha); },
  respostas(ids) { if (modoNuvem) nuvem.gravarRespostas(S.respostas, ids).catch(PERS.falha); },
  removerResposta(id) { if (modoNuvem) nuvem.removerResposta(id).catch(PERS.falha); },
  tudo() { if (modoNuvem) nuvem.substituirTudo(S).catch(PERS.falha); }
};

const ehCoord = () => S.perfil.papel === 'coordenacao';
const ehRedacao = () => S.perfil.papel === 'redacao';
const nomePerfil = () => {
  if (S.perfil.papel === 'docente')
    return `Docente · ${S.perfil.nome}${S.perfil.componente ? ' (' + S.perfil.componente + ')' : ''}`;
  if (S.perfil.papel === 'redacao') return `Redação · ${S.perfil.nome}`;
  return `Coordenação · ${S.perfil.nome}`;
};

const discChip = comp => `<span class="disc ${COMPONENTES[comp] || 'd-soc'}">${esc(comp)}</span>`;
const textoDe = item => S.textos.find(t => t.id === item.textoId);
const textosAprovados = () => S.textos.filter(t => t.status === 'aprovado').sort((a, b) => a.numero - b.numero);

/* ---------------- montagem da prova ---------------- */
// Numeração contínua: itens aprovados da versão, na ordem dos textos aprovados.
// Dentro de cada texto os itens saem agrupados por tipo (A, B, C, D), como no
// PAS — é isso que faz o comando ficar contínuo (“julgue os itens de 11 a 19 e
// assinale a opção correta no item 20”). A ordem definida pela coordenação é
// preservada dentro de cada tipo.
const ORDEM_TIPO = { A: 0, B: 1, C: 2, D: 3 };

function prova(versao) {
  const lista = [];
  for (const t of textosAprovados()) {
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
function corrigir(est) {
  const pv = prova(est.versao);
  const resp = S.respostas[est.id] || { marcacoes: {}, redacao: null };
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
  const red = resp.redacao;
  const nr = (red && red.tl > 0) ? Math.max(0, red.nc - 2 * red.ne / red.tl) : null;
  const temResp = Object.keys(resp.marcacoes || {}).length > 0 ||
    Object.keys(resp.discursivas || {}).length > 0;
  return { ac, er, br, eb, porGrupo, nr, detalhes, temResp, total: pv.length, dLanc, dTotal };
}

function ranking(versao) {
  return S.estudantes.filter(e => e.versao === versao)
    .map(e => ({ e, r: corrigir(e) }))
    .filter(x => x.r.temResp)
    .sort((a, b) => b.r.eb - a.r.eb);
}

/* ---------------- casca / navegação ---------------- */
const TELAS = {
  painel:   { rot: '1 · Painel' },
  textos:   { rot: '2 · Textos e alocação' },
  itens:    { rot: '3 · Itens e revisão' },
  caderno:  { rot: '4 · Caderno' },
  cartoes:  { rot: '5 · Cartões-resposta' },
  correcao: { rot: '6 · Correção e boletins' },
  equipe:   { rot: '7 · Equipe', soCoordenacaoNaNuvem: true }
};
// A tela de Equipe administra contas de verdade — só aparece para a
// coordenação e só quando o sistema está ligado ao banco on-line.
function telasVisiveis() {
  return Object.entries(TELAS)
    .filter(([, v]) => !v.soCoordenacaoNaNuvem || (modoNuvem && ehCoord()));
}
function telaAtual() {
  const h = location.hash.replace('#/', '');
  return telasVisiveis().some(([k]) => k === h) ? h : 'painel';
}

function render() {
  const c = S.config;
  $('#h-titulo').textContent = 'Sistema PAS Marista';
  $('#h-sub').textContent = `${c.nome} — ${c.etapa} · ${c.serie}` +
    (c.dataAplicacao ? ` · Aplicação: ${dataBR(c.dataAplicacao)}` : '');

  if (modoNuvem && !nuvem.usuario()) {
    $('#quem').innerHTML = botaoTema();
    $('#nav').innerHTML = '';
    telaLogin();
    return;
  }

  const ini = (S.perfil.nome || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  const identidade = modoNuvem
    ? `<span style="font-weight:700;font-size:13px">${esc(nomePerfil())}</span>
       <button class="tema-btn" data-acao="nuvem-atualizar" title="Recarregar os dados do banco on-line">🔄</button>
       <button class="tema-btn" data-acao="minha-conta" title="Minha conta (trocar senha)">🔑</button>
       <button class="sair-btn" data-acao="nuvem-sair" title="Sair da conta">Sair</button>`
    : `<select id="sel-perfil" aria-label="Perfil ativo">
        <option value="coordenacao" ${ehCoord() ? 'selected' : ''}>${ehCoord() ? esc(nomePerfil()) : 'Coordenação · entrar'}</option>
        <option value="docente" ${S.perfil.papel === 'docente' ? 'selected' : ''}>${S.perfil.papel === 'docente' ? esc(nomePerfil()) : 'Docente · entrar'}</option>
        <option value="redacao" ${ehRedacao() ? 'selected' : ''}>${ehRedacao() ? esc(nomePerfil()) : 'Prof. de redação · entrar'}</option>
      </select>`;
  $('#quem').innerHTML = `${botaoTema()}${identidade}<div class="avatar">${esc(ini)}</div>`;
  const sel = $('#sel-perfil');
  if (sel) sel.addEventListener('change', ev => dlgPerfil(ev.target.value));

  const atual = telaAtual();
  $('#nav').innerHTML = telasVisiveis()
    .map(([k, v]) => `<a href="#/${k}" ${k === atual ? 'aria-current="page"' : ''}>${v.rot}</a>`).join('');
  ({
    painel: telaPainel, textos: telaTextos, itens: telaItens, caderno: telaCaderno,
    cartoes: telaCartoes, correcao: telaCorrecao, equipe: telaEquipe
  }[atual])();
}
window.addEventListener('hashchange', render);

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
const MUDS = {};
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
function telaPainel() {
  const aprovados = S.itens.filter(i => i.status === 'aprovado').length;
  const emArea = S.itens.filter(i => i.status === 'area').length;
  const emGeral = S.itens.filter(i => i.status === 'geral').length;
  const totalSlots = textosAprovados().reduce((s, t) => s + (t.slots || 0), 0);
  const sugestoes = S.textos.filter(t => t.status === 'sugestao').length;
  const nReg = prova('regular').length, nAda = prova('adaptada').length;
  const estReg = S.estudantes.filter(e => e.versao === 'regular').length;
  const estAda = S.estudantes.filter(e => e.versao === 'adaptada').length;

  const comps = {};
  for (const it of S.itens) {
    const c = comps[it.componente] || (comps[it.componente] = { criados: 0, aprovados: 0, rev: 0, autores: new Set() });
    c.criados++; if (it.status === 'aprovado') c.aprovados++;
    if (it.status === 'area' || it.status === 'geral') c.rev++;
    c.autores.add(it.autor);
  }
  const linhas = Object.entries(comps).map(([comp, c]) => {
    const sit = c.aprovados === c.criados ? '<span class="chip ok">Completo</span>'
      : c.rev > 0 ? '<span class="chip pend">Em revisão</span>'
      : '<span class="chip info">Em elaboração</span>';
    return `<tr><td>${discChip(comp)}</td><td>${esc([...c.autores].join(', '))}</td>
      <td>${c.criados}</td><td>${c.aprovados}</td><td>${sit}</td></tr>`;
  }).join('');

  $('#app').innerHTML = `
  <div class="quadro"><div class="miolo">
    <div class="cab-tela">
      <div>
        <h2>${esc(S.config.nome)} — ${esc(S.config.etapa)}</h2>
        <span class="sub">Aplicação: ${dataBR(S.config.dataAplicacao)} · ${esc(S.config.serie)} · ${S.estudantes.length} estudantes</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${ehCoord() ? '<button class="btn fantasma" data-acao="cfg">⚙ Configurar simulado</button>' : ''}
        <a class="btn rosa" href="#/caderno" style="text-decoration:none">Gerar cadernos</a>
      </div>
    </div>

    <div class="versoes">
      <div class="versao sel"><div class="ic" style="background:var(--azul)">📘</div>
        <div><b>Prova Regular</b><span>${nReg} itens aprovados + redação · ${estReg} estudantes</span></div></div>
      <div class="versao"><div class="ic" style="background:var(--verde)">📗</div>
        <div><b>Prova Adaptada (inclusão)</b><span>${nAda} itens aprovados + redação · ${estAda} estudantes</span></div></div>
    </div>

    <div class="grade g3" style="margin-bottom:16px">
      <div class="cartao vivo"><h3><span class="pingo" style="background:var(--azul)"></span>Itens aprovados</h3>
        <div class="num">${aprovados}<small> / ${totalSlots || '—'} planejados</small></div>
        <div class="barra"><i style="width:${totalSlots ? Math.min(100, aprovados / totalSlots * 100) : 0}%"></i></div></div>
      <div class="cartao vivo"><h3><span class="pingo" style="background:var(--rosa)"></span>Em revisão</h3>
        <div class="num">${emArea + emGeral}</div>
        <span style="font-size:12px;color:var(--ink-2)">${emArea} na coord. de área · ${emGeral} na coordenação geral</span></div>
      <div class="cartao vivo"><h3><span class="pingo" style="background:var(--amarelo)"></span>Textos-base</h3>
        <div class="num">${textosAprovados().length}<small> ativos</small></div>
        <span style="font-size:12px;color:var(--ink-2)">${sugestoes ? '+' + sugestoes + ' sugestão(ões) aguardando aprovação' : 'nenhuma sugestão pendente'}</span></div>
    </div>

    <div class="cartao" style="margin-bottom:16px">
      <h3>Entregas por componente curricular</h3>
      ${linhas ? `<table><thead><tr><th>Componente</th><th>Docente(s)</th><th>Itens criados</th><th>Aprovados</th><th>Situação</th></tr></thead>
        <tbody>${linhas}</tbody></table>` : '<div class="vazio">Nenhum item criado ainda — comece pela tela “Textos e alocação”.</div>'}
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

ACOES['cfg'] = () => {
  const c = S.config;
  abrirDlg(`
    <div class="dlg-cab"><h2>Configurar simulado</h2><button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      <div class="form-linha">
        <div class="campo" style="min-width:230px"><label>Nome</label><input class="caixa" id="cfg-nome" value="${esc(c.nome)}"></div>
        <div class="campo"><label>Etapa</label><input class="caixa" id="cfg-etapa" value="${esc(c.etapa)}"></div>
      </div>
      <div class="form-linha">
        <div class="campo"><label>Série</label><input class="caixa" id="cfg-serie" value="${esc(c.serie)}"></div>
        <div class="campo"><label>Data de aplicação</label><input class="caixa" type="date" id="cfg-data" value="${esc(c.dataAplicacao)}"></div>
        <div class="campo"><label>Duração</label><input class="caixa" id="cfg-dur" value="${esc(c.duracao)}"></div>
      </div>
    </div>
    <div class="dlg-pe"><button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="cfg-salvar">Salvar</button></div>`);
};
ACOES['cfg-salvar'] = () => {
  Object.assign(S.config, {
    nome: $('#cfg-nome').value.trim(), etapa: $('#cfg-etapa').value.trim(),
    serie: $('#cfg-serie').value.trim(), dataAplicacao: $('#cfg-data').value,
    duracao: $('#cfg-dur').value.trim()
  });
  $('#dlg').close(); commit(); PERS.config(); toast('Configurações salvas.');
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
        if (novo?.versao !== 1) throw new Error('formato');
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
        <p style="font-size:12.5px;color:var(--ink-2)">Este perfil vê, na tela de Correção, apenas o lançamento das informações de redação (NC, NE e TL) por estudante.</p>
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
    const ops = Object.keys(COMPONENTES).map(c =>
      `<option ${S.perfil.componente === c ? 'selected' : ''}>${c}</option>`).join('');
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

/* ================= TELA 2 · TEXTOS ================= */
function telaTextos() {
  const aprovados = textosAprovados();
  const blocos = aprovados.map((t, ti) => {
    const itens = S.itens.filter(i => i.textoId === t.id);
    const livres = Math.max(0, (t.slots || 0) - itens.length);
    const chips = itens.map((i, ii) => `
      <span class="slot" data-acao="abrir-item" data-id="${i.id}" role="button" tabindex="0"
        title="${esc(STATUS_ITEM[i.status].rot)}" style="cursor:pointer;${i.autor === S.perfil.nome ? 'background:color-mix(in srgb,var(--verde) 12%,transparent)' : ''}">
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

  const sugestoes = S.textos.filter(t => t.status === 'sugestao').map(t => `
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
      <div><h2>Textos-base</h2>
        <span class="sub">Clique em um espaço livre para alocar um item seu · clique em um item para abri-lo</span></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="chip info">Sua produção: ${S.itens.filter(i => i.autor === S.perfil.nome).length} itens</span>
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
  abrirDlg(`
    <div class="dlg-cab"><h2>${novo ? (ehCoord() ? 'Novo texto-base' : 'Sugerir texto-base') : 'Editar texto-base'}</h2>
      <button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      <div class="form-linha">
        <div class="campo" style="min-width:260px"><label>Título</label>
          <input class="caixa" id="tx-titulo" value="${esc(t?.titulo || '')}" placeholder="ex.: “O Cerrado e as veredas” — Guimarães Rosa (adapt.)"></div>
        <div class="campo"><label>Fonte</label><input class="caixa" id="tx-fonte" value="${esc(t?.fonte || '')}" placeholder="autor / obra / veículo, ano"></div>
      </div>
      <div class="campo" style="margin-bottom:12px"><label>Corpo do texto (uma linha por linha numerada)</label>
        <textarea class="caixa" id="tx-corpo" rows="8">${esc((t?.linhas || []).join('\n'))}</textarea></div>
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
ACOES['salvar-texto'] = d => {
  const anterior = d.id ? S.textos.find(t => t.id === d.id) : null;
  const dados = {
    titulo: $('#tx-titulo').value.trim(),
    fonte: $('#tx-fonte').value.trim(),
    // linhas em branco no meio são separadores de parágrafo — só as das pontas caem
    linhas: $('#tx-corpo').value.split('\n').map(l => l.trim())
      .join('\n').replace(/^\n+|\n+$/g, '').split('\n'),
    slots: ehCoord() ? Math.max(1, parseInt($('#tx-slots').value, 10) || 6) : (anterior?.slots ?? 6),
    regra: ehCoord() && $('#tx-regra') ? $('#tx-regra').value.trim() : (anterior?.regra || ''),
    comando: ehCoord() && $('#tx-comando') ? $('#tx-comando').value.trim() : (anterior?.comando || ''),
    formato: ehCoord() && $('#tx-formato') ? $('#tx-formato').value : (anterior?.formato || 'prosa')
  };
  if (!dados.titulo || !dados.fonte || !dados.linhas.length) {
    toast('Título, fonte e corpo do texto são obrigatórios.'); return;
  }
  let alvo;
  if (anterior) {
    Object.assign(anterior, dados); alvo = anterior;
  } else if (ehCoord()) {
    alvo = { id: uid(), numero: Math.max(0, ...textosAprovados().map(t => t.numero)) + 1, status: 'aprovado', sugeridoPor: null, ...dados };
    S.textos.push(alvo);
  } else {
    alvo = { id: uid(), numero: null, status: 'sugestao', sugeridoPor: `${S.perfil.nome} (${S.perfil.componente || 'docente'})`, ...dados };
    S.textos.push(alvo);
  }
  $('#dlg').close(); commit(); PERS.texto(alvo);
  toast(anterior ? 'Texto atualizado.' : (ehCoord() ? 'Texto criado.' : 'Sugestão enviada à coordenação.'));
};
ACOES['aprovar-texto'] = d => {
  const t = S.textos.find(x => x.id === d.id);
  t.status = 'aprovado';
  t.numero = Math.max(0, ...textosAprovados().filter(x => x.id !== t.id).map(x => x.numero)) + 1;
  commit(); PERS.texto(t); toast(`Texto aprovado como Texto ${t.numero}.`);
};
ACOES['excluir-texto'] = d => {
  const usados = S.itens.filter(i => i.textoId === d.id).length;
  if (usados) { toast(`Este texto tem ${usados} item(ns) alocado(s) — remova-os antes.`); return; }
  S.textos = S.textos.filter(t => t.id !== d.id);
  $('#dlg').close(); commit(); PERS.removerTexto(d.id); toast('Texto excluído.');
};
ACOES['texto-mover'] = d => {
  const lista = textosAprovados();
  const i = lista.findIndex(t => t.id === d.id);
  const j = i + parseInt(d.dir, 10);
  if (i < 0 || j < 0 || j >= lista.length) return;
  [lista[i].numero, lista[j].numero] = [lista[j].numero, lista[i].numero];
  textosAprovados().forEach((t, k) => t.numero = k + 1);
  commit(); PERS.textosTodos();
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

/* ================= TELA 3 · ITENS ================= */
let filtroStatus = 'todos', soMeus = false;
function telaItens() {
  if (S.perfil.papel === 'docente' && telaItens._primeiraVez === undefined) { soMeus = true; telaItens._primeiraVez = false; }
  const lista = S.itens.filter(i =>
    (filtroStatus === 'todos' || i.status === filtroStatus) &&
    (!soMeus || i.autor === S.perfil.nome));
  const linhas = lista.map(i => {
    const t = textoDe(i);
    const st = STATUS_ITEM[i.status];
    return `<tr class="clic" data-acao="abrir-item" data-id="${i.id}">
      <td>Texto ${t?.numero ?? '—'}</td>
      <td><span class="t t${i.tipo}" style="display:inline-grid;width:22px;height:22px;place-items:center;border-radius:6px;color:#fff;font-size:11px;font-weight:800">${i.tipo}</span></td>
      <td>${discChip(i.componente)}</td>
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
      <div><h2>Itens e fluxo de revisão</h2>
        <span class="sub">docente → coordenação de área → coordenação geral → aprovado</span></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select class="caixa" style="width:auto" data-mud="filtro-status">${ops}</select>
        <label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700">
          <input type="checkbox" data-mud="so-meus" ${soMeus ? 'checked' : ''}> só meus itens</label>
        <button class="btn" data-acao="novo-item">+ Novo item</button>
      </div>
    </div>
    ${linhas ? `<table><thead><tr><th>Texto</th><th>Tipo</th><th>Componente</th><th>Autor</th><th>Versão</th><th>Status</th></tr></thead>
      <tbody>${linhas}</tbody></table>`
      : '<div class="vazio">Nenhum item neste filtro. Crie um item pelos espaços livres em “Textos e alocação” ou pelo botão acima.</div>'}
  </div></div>
  <p class="nota-tela"><strong>Fluxo:</strong> o docente redige e envia; a coordenação comenta, devolve ou aprova em dois níveis. Só itens <strong>aprovados</strong> entram no caderno, no cartão e na correção. O campo “Versão” define se o item vale para a prova regular, a adaptada ou ambas.</p>`;
}
MUDS['filtro-status'] = (d, el) => { filtroStatus = el.value; render(); };
MUDS['so-meus'] = (d, el) => { soMeus = el.checked; render(); };

/* ----- editor de item (diálogo) ----- */
let rasc = null; // cópia de trabalho do item aberto

function novoRascunho(textoId) {
  return {
    id: null, textoId: textoId || textosAprovados()[0]?.id || null,
    tipo: 'A', componente: S.perfil.componente || 'Português',
    autor: S.perfil.nome, habilidade: '', grupo: 'Interpretar', versao: 'ambas',
    linhasRef: '', gabarito: 'C', opcoes: ['', '', '', ''],
    enunciado: '', status: 'rascunho', comentarios: []
  };
}

ACOES['novo-item'] = d => {
  if (!textosAprovados().length) { toast('Crie ao menos um texto-base antes.'); return; }
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
    return `<div class="linha-tx${marca}"><span class="n">${n}</span><span>${esc(l)}</span></div>`;
  }).join('');
  const opsTexto = textosAprovados().map(x =>
    `<option value="${x.id}" ${x.id === rasc.textoId ? 'selected' : ''}>Texto ${x.numero} — ${esc(x.titulo.slice(0, 48))}</option>`).join('');
  const opsComp = Object.keys(COMPONENTES).map(c => `<option ${rasc.componente === c ? 'selected' : ''}>${c}</option>`).join('');

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
        <textarea class="caixa" rows="3" data-mud="it-campo" data-campo="gabarito"
          placeholder="O que se espera na resposta construída do estudante">${esc(rasc.gabarito || '')}</textarea></div>
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
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
          <b style="width:16px">${L}</b>
          <input class="caixa" data-mud="it-opcao" data-i="${i}" value="${esc(rasc.opcoes[i] || '')}">
        </div>`).join('')}
    </div>` : '';

  const fio = (rasc.comentarios || []).map((c, i) => `
    <div class="coment ${i % 2 ? 'resp' : ''}">
      <div class="avatar">${esc(c.autor.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase())}</div>
      <div class="balao"><b>${esc(c.autor)} · ${esc(c.papel)}</b><span class="quando">${esc(c.quando)}</span>
        <p>${esc(c.texto)}</p></div>
    </div>`).join('');

  const botoes = [];
  botoes.push('<button class="btn" data-acao="it-salvar">Salvar</button>');
  if (S.perfil.papel === 'docente' && ['rascunho', 'devolvido'].includes(rasc.status) )
    botoes.push('<button class="btn rosa" data-acao="it-enviar">Enviar para revisão</button>');
  if (ehCoord()) {
    if (rasc.status === 'rascunho' || rasc.status === 'devolvido')
      botoes.push('<button class="btn rosa" data-acao="it-enviar">Enviar para revisão</button>');
    if (rasc.status === 'area')
      botoes.push('<button class="btn verde" data-acao="it-aprovar-area">Aprovar → coordenação geral</button>',
                  '<button class="btn vermelho" data-acao="it-devolver">Devolver com ajustes</button>');
    if (rasc.status === 'geral')
      botoes.push('<button class="btn verde" data-acao="it-aprovar">Aprovar item</button>',
                  '<button class="btn vermelho" data-acao="it-devolver">Devolver com ajustes</button>');
    if (rasc.status === 'aprovado')
      botoes.push('<button class="btn fantasma" data-acao="it-reabrir">Reabrir revisão</button>');
  }

  abrirDlg(`
    <div class="dlg-cab">
      <h2>${rasc.id ? 'Item' : 'Novo item'} · ${t ? 'Texto ' + t.numero : ''} <span class="chip ${st.cls}">${st.rot}</span></h2>
      ${rasc.id && (ehCoord() || (rasc.autor === S.perfil.nome && rasc.status === 'rascunho')) ?
        '<button class="btn mini vermelho" data-acao="it-excluir">Excluir</button>' : ''}
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
            <div class="campo" style="flex:0"><label>Versão</label><div class="seg">${segVersao}</div></div>
          </div>
          <div class="form-linha">
            <div class="campo"><label>Habilidade</label>
              <input class="caixa" data-mud="it-campo" data-campo="habilidade" value="${esc(rasc.habilidade)}" placeholder="ex.: H6 — Inferências"></div>
            <div class="campo" style="flex:0"><label>Grupo</label><div class="seg">${segGrupo}</div></div>
          </div>
          <div class="campo" style="margin-bottom:12px"><label>Enunciado</label>
            <textarea class="caixa" rows="4" data-mud="it-campo" data-campo="enunciado">${esc(rasc.enunciado)}</textarea></div>
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
    <div class="dlg-pe">${botoes.join('')}</div>`, true);
}

function reabrirDlgItem() { dlgItem(); }
MUDS['it-texto'] = (d, el) => { rasc.textoId = el.value; reabrirDlgItem(); };
MUDS['it-campo'] = (d, el) => {
  rasc[el.dataset.campo] = el.value;
  if (el.dataset.campo === 'linhasRef') reabrirDlgItem();
};
MUDS['it-opcao'] = (d, el) => { rasc.opcoes[parseInt(el.dataset.i, 10)] = el.value; };
MUDS['it-dlinhas'] = (d, el) => { rasc.dLinhas = Math.max(1, Math.min(40, parseInt(el.value, 10) || 10)); };
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
  if (!rasc.enunciado.trim()) { toast('Escreva o enunciado do item.'); return false; }
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
    papel: ehCoord() ? 'coordenação' : `docente (${S.perfil.componente || ''})`,
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

/* ================= TELA 4 · CADERNO ================= */
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

function instrucoes() {
  const c = S.config.instrucoes;
  if (Array.isArray(c) && c.length) return c;
  if (typeof c === 'string' && c.trim())
    return c.split('\n').map(l => l.trim()).filter(Boolean);
  return INSTRUCOES_PADRAO;
}

function htmlCapa(versao, totalItens) {
  const c = S.config;
  const arte = c.capaImagem
    ? `<img src="${esc(c.capaImagem)}" alt="">`
    : '';
  return `
  <div class="pas-capa">
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
      <ol>${instrucoes().map(i => `<li>${i}</li>`).join('')}</ol>
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
  const abertura = (texto.comando || '').trim() ||
    'Considerando o texto precedente e os múltiplos aspectos a ele relacionados';
  return `${abertura}, ${acoes}.`;
}

function htmlItem({ item, numero }) {
  const enun = esc(item.enunciado);
  if (item.tipo === 'C') {
    const ops = (item.opcoes || []).map((o, i) =>
      `<p class="pas-op"><b>${'ABCD'[i]}</b> ${esc(o)}</p>`).join('');
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
function htmlCorpoTexto(texto) {
  const linhas = texto.linhas || [];
  if (texto.formato === 'numerado')
    return `<div class="pas-linhas">${linhas.map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
  if (texto.formato === 'verso')
    return `<div class="pas-texto">${linhas.map(l =>
      l.trim() ? `<p class="pas-verso">${esc(l)}</p>` : '<p>&nbsp;</p>').join('')}</div>`;
  // prosa: linhas em branco separam parágrafos
  const paragrafos = [];
  let atual = [];
  for (const l of linhas) {
    if (l.trim()) atual.push(l.trim());
    else if (atual.length) { paragrafos.push(atual.join(' ')); atual = []; }
  }
  if (atual.length) paragrafos.push(atual.join(' '));
  return `<div class="pas-texto">${paragrafos.map(p => `<p>${esc(p)}</p>`).join('')}</div>`;
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
function medirPecas(pecas) {
  const regua = document.createElement('div');
  regua.className = 'pas pas-regua';
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

function htmlPagina(colunas, ident, numero, total) {
  return `
  <div class="pas-pagina">
    <div class="pas-ident">${ident}</div>
    <div class="pas-fio-topo"></div>
    <div class="pas-parte">-- PARTE 2 --</div>
    <div class="pas-fio-vert"></div>
    <div class="pas-corpo">
      <div class="pas-col">${colunas[0].join('')}</div>
      <div class="pas-col">${colunas[1].join('')}</div>
    </div>
    <div class="pas-fio-base"></div>
    <div class="pas-fol">${numero} / ${total}</div>
  </div>`;
}

// Monta o caderno inteiro já paginado. Precisa do DOM para medir as peças.
function htmlCaderno(versao, comCapa = true) {
  const pv = prova(versao);
  if (!pv.length) return '';
  const porTexto = new Map();
  for (const e of pv) {
    if (!porTexto.has(e.texto.id)) porTexto.set(e.texto.id, { texto: e.texto, itens: [] });
    porTexto.get(e.texto.id).itens.push(e);
  }
  const pecas = [...porTexto.values()].flatMap(({ texto, itens }) => pecasDoBloco(texto, itens));
  const paginas = distribuir(pecas, medirPecas(pecas));
  const ident = `${esc(S.config.nome)} — ${esc(S.config.etapa)}${versao === 'adaptada' ? ' — versão adaptada' : ''}`;
  const capa = comCapa ? `<div class="pas-pagina">${htmlCapa(versao, pv.length)}</div>` : '';
  const total = paginas.length + (comCapa ? 1 : 0);
  return `<div class="pas">${capa}${paginas
    .map((c, i) => htmlPagina(c, ident, i + 1 + (comCapa ? 1 : 0), total)).join('')}</div>`;
}

function telaCaderno() {
  const pv = prova(cadVersao);
  $('#app').innerHTML = `
  <div class="quadro">
    <div class="miolo" style="padding-bottom:0">
      <div class="cab-tela">
        <div><h2>Caderno de provas</h2>
          <span class="sub">${pv.length} itens aprovados nesta versão · numeração contínua · diagramação no padrão PAS</span></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div class="seg">
            <button class="${cadVersao === 'regular' ? 'sel' : ''}" data-acao="cad-versao" data-v="regular">Regular</button>
            <button class="${cadVersao === 'adaptada' ? 'sel' : ''}" data-acao="cad-versao" data-v="adaptada">Adaptada</button>
          </div>
          ${ehCoord() ? '<button class="btn fantasma" data-acao="cad-capa">⚙ Capa e instruções</button>' : ''}
          <button class="btn rosa" data-acao="cad-imprimir" ${pv.length ? '' : 'disabled'}>🖨 Imprimir / salvar em PDF</button>
        </div>
      </div>
    </div>
    ${pv.length ? `<div class="pas-previa">${htmlCaderno(cadVersao)}</div>`
      : '<div class="miolo"><div class="vazio">Nenhum item aprovado para esta versão ainda. Aprove itens na tela “Itens e revisão”.</div></div>'}
  </div>
  <p class="nota-tela"><strong>Diagramação calibrada</strong> contra os cadernos do PAS/CEBRASPE de 2025: A4 com duas colunas de 266pt e fio central, corpo de 10pt, número do item recuado para fora da coluna e crédito da fonte em 6pt. O <strong>comando de cada bloco é montado automaticamente</strong> a partir dos tipos de item — “julgue os itens de 11 a 19 e assinale a opção correta no item 20, que é do tipo C” —, e o texto de abertura é editável em cada texto-base. A quebra de páginas acontece na impressão: use “Imprimir” e escolha “Salvar como PDF”.</p>`;
}
ACOES['cad-versao'] = d => { cadVersao = d.v; render(); };
ACOES['cad-imprimir'] = () => {
  $('#print-area').innerHTML = htmlCaderno(cadVersao);
  window.print();
};

ACOES['cad-capa'] = () => {
  abrirDlg(`
    <div class="dlg-cab"><h2>Capa e instruções do caderno</h2>
      <button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      <div class="campo" style="margin-bottom:12px"><label>Imagem da capa (endereço)</label>
        <input class="caixa" id="cp-img" value="${esc(S.config.capaImagem || '')}"
          placeholder="https://… — imagem inspirada nos textos ou no tema da redação"></div>
      <div class="campo"><label>Instruções (uma por linha, numeradas automaticamente)</label>
        <textarea class="caixa" id="cp-instr" rows="10">${esc(instrucoes().join('\n'))}</textarea></div>
      <p style="font-size:12.5px;color:var(--ink-2);margin:10px 0 0">Aceita <code>&lt;b&gt;</code> para destacar termos, como no caderno original.</p>
    </div>
    <div class="dlg-pe">
      <button class="btn fantasma" style="margin-right:auto" data-acao="cad-capa-padrao">Restaurar padrão</button>
      <button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="cad-capa-salvar">Salvar</button></div>`);
};
ACOES['cad-capa-padrao'] = () => { $('#cp-instr').value = INSTRUCOES_PADRAO.join('\n'); };
ACOES['cad-capa-salvar'] = () => {
  S.config.capaImagem = $('#cp-img').value.trim();
  S.config.instrucoes = $('#cp-instr').value.split('\n').map(l => l.trim()).filter(Boolean);
  $('#dlg').close(); commit(); PERS.config(); toast('Capa atualizada.');
};

/* ================= TELA 5 · CARTÕES ================= */
function htmlCartao(est) {
  const pv = prova(est.versao);
  // Discursivos (tipo D) são respondidos no próprio caderno — fora do cartão.
  const ac = pv.filter(e => e.item.tipo === 'A' || e.item.tipo === 'C');
  const bs = pv.filter(e => e.item.tipo === 'B');
  const cols = [];
  for (let i = 0; i < ac.length; i += 5) cols.push(ac.slice(i, i + 5));
  const colsHtml = cols.map(col => `
    <div class="cr-col">
      <h5>ITENS ${col[0].numero}–${col[col.length - 1].numero}</h5>
      ${col.map(({ item, numero }) => {
        const resp = TIPOS[item.tipo].respostas;
        return `<div class="cr-linha"><span class="no">${numero}</span>${resp.map(r => `<span class="bolha"></span>${r}`).join(' ')}</div>`;
      }).join('')}
    </div>`).join('');
  const bsHtml = bs.map(({ numero }) => `
    <div class="cr-b"><h5>ITEM ${numero} — TIPO B (resposta de 000 a 999)</h5>
      ${['Centena', 'Dezena', 'Unidade'].map(casa => `
        <div class="dig"><span>${casa}</span>${Array.from({ length: 10 }, (_, i) => `<span class="bolha"></span>${i}`).join(' ')}</div>`).join('')}
    </div>`).join('');
  const c = S.config;
  return `
  <div class="folha" style="width:520px">
    <div class="cab">
      <div class="inst">COLÉGIO MARISTA ÁGUAS CLARAS<br><span style="color:#e5007e">${esc(c.nome).toUpperCase()} · ${esc(c.etapa).toUpperCase()}</span></div>
      <div style="font-size:8px;color:#333;line-height:1.5">Estudante: <b>${esc(est.nome).toUpperCase()}</b><br>
        Matrícula: <b style="font-family:var(--mono)">${esc(est.matricula)}</b> · ${esc(est.turma)} · ${est.versao === 'adaptada' ? 'Adaptada' : 'Regular'}</div>
      <div class="sala"><small>SALA</small><span style="display:inline-block;min-width:34px">&nbsp;</span></div>
    </div>
    <div class="faixa">Caderno de Respostas — uso exclusivo do estudante</div>
    <div class="corpo">
      <div class="ancoras"><i></i><i></i></div>
      <div style="font-size:7.5px;color:#555;border:1px solid #efc3da;border-radius:4px;padding:6px;margin-bottom:8px">
        As marcações devem ser feitas com caneta esferográfica de tinta <b>preta</b>, preenchendo totalmente o círculo.
        Itens tipo A: marque C ou E. Tipo C: apenas uma opção. Tipo B: marque os três algarismos.
        Itens discursivos (tipo D) são respondidos no próprio caderno de provas.
      </div>
      ${ac.length ? '<b style="font-size:8.5px;color:#e5007e">RESPOSTAS AOS ITENS DOS TIPOS A e C</b>' : ''}
      <div class="cr-grid">${colsHtml}</div>
      ${bsHtml}
      <div style="margin-top:10px;font-size:7.5px;color:#999;display:flex;justify-content:space-between;font-family:var(--mono)">
        <span>▮▯▮▮▯▮▮▯ ${esc(est.matricula)}</span><span>${esc(est.turma)}</span>
      </div>
      <div class="ancoras"><i></i><i></i></div>
    </div>
  </div>`;
}

let cartTurma = 'todas';
function telaCartoes() {
  const turmas = [...new Set(S.estudantes.map(e => e.turma))].sort();
  const filtrados = S.estudantes.filter(e => cartTurma === 'todas' || e.turma === cartTurma)
    .sort((a, b) => a.turma.localeCompare(b.turma) || a.nome.localeCompare(b.nome));
  const linhas = filtrados.map(e => `
    <tr><td>${esc(e.nome)}</td><td style="font-family:var(--mono)">${esc(e.matricula)}</td>
      <td>${esc(e.turma)}</td><td style="text-transform:capitalize">${esc(e.versao)}</td>
      <td style="white-space:nowrap">
        <button class="btn mini fantasma" data-acao="est-editar" data-id="${e.id}">Editar</button>
        <button class="btn mini vermelho" data-acao="est-remover" data-id="${e.id}">Remover</button>
      </td></tr>`).join('');
  const opsTurma = ['todas', ...turmas].map(t =>
    `<option value="${t}" ${cartTurma === t ? 'selected' : ''}>${t === 'todas' ? 'Todas as turmas' : t}</option>`).join('');
  const previa = filtrados.slice(0, 1).map(htmlCartao).join('');
  const nRegItens = prova('regular').length, nAdaItens = prova('adaptada').length;

  $('#app').innerHTML = `
  <div class="quadro"><div class="miolo">
    <div class="cab-tela">
      <div><h2>Estudantes e cartões-resposta</h2>
        <span class="sub">${S.estudantes.length} estudantes · cartão nominal gerado por versão de prova</span></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select class="caixa" style="width:auto" data-mud="cart-turma">${opsTurma}</select>
        <button class="btn fantasma" data-acao="est-importar">⬆ Importar lista (CSV)</button>
        <button class="btn" data-acao="est-novo">+ Estudante</button>
        <button class="btn rosa" data-acao="cart-imprimir" ${filtrados.length && (nRegItens + nAdaItens) ? '' : 'disabled'}>🖨 Imprimir cartões (${filtrados.length})</button>
      </div>
    </div>
    ${linhas ? `<table><thead><tr><th>Nome</th><th>Matrícula</th><th>Turma</th><th>Versão</th><th></th></tr></thead>
      <tbody>${linhas}</tbody></table>`
      : '<div class="vazio">Nenhum estudante cadastrado. Importe a lista (CSV: nome;matrícula;turma;versão) ou cadastre um a um.</div>'}
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <button class="btn fantasma" data-acao="cart-template">⬇ Exportar gabarito p/ leitor local (JSON)</button>
    </div>
  </div>
  ${previa && (nRegItens + nAdaItens) ? `<div class="papelaria"><div style="width:100%;text-align:center;font-size:12px;color:#6b5f52;margin-bottom:-10px">Prévia — 1º cartão do filtro atual</div>${previa}</div>` : ''}
  </div>
  <p class="nota-tela"><strong>Integração com o app local (Windows):</strong> as âncoras pretas e o código de matrícula permitem identificar e ler cada folha digitalizada em lote no scanner. O botão “Exportar gabarito p/ leitor local” gera o arquivo JSON que o aplicativo de leitura óptica usa para saber quantos itens e de que tipo procurar — o resultado volta como CSV importado na tela de Correção.</p>`;
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
        <div class="campo"><label>Turma</label><input class="caixa" id="es-turma" value="${esc(e?.turma || '')}" placeholder="ex.: 2ª B"></div>
        <div class="campo"><label>Versão da prova</label>
          <select class="caixa" id="es-versao">
            <option value="regular" ${e?.versao !== 'adaptada' ? 'selected' : ''}>Regular</option>
            <option value="adaptada" ${e?.versao === 'adaptada' ? 'selected' : ''}>Adaptada</option>
          </select></div>
      </div>
    </div>
    <div class="dlg-pe"><button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="est-salvar" data-id="${e?.id || ''}">Salvar</button></div>`);
}
ACOES['est-novo'] = () => dlgEstudante(null);
ACOES['est-editar'] = d => dlgEstudante(S.estudantes.find(e => e.id === d.id));
ACOES['est-salvar'] = d => {
  const dados = {
    nome: $('#es-nome').value.trim(), matricula: $('#es-mat').value.trim(),
    turma: $('#es-turma').value.trim(), versao: $('#es-versao').value
  };
  if (!dados.nome || !dados.matricula) { toast('Nome e matrícula são obrigatórios.'); return; }
  let alvo;
  if (d.id) { alvo = S.estudantes.find(e => e.id === d.id); Object.assign(alvo, dados); }
  else { alvo = { id: uid(), ...dados }; S.estudantes.push(alvo); }
  $('#dlg').close(); commit(); PERS.estudante(alvo); toast('Estudante salvo.');
};
ACOES['est-remover'] = d => {
  S.estudantes = S.estudantes.filter(e => e.id !== d.id);
  delete S.respostas[d.id];
  commit(); PERS.removerEstudante(d.id); PERS.removerResposta(d.id); toast('Estudante removido.');
};
ACOES['est-importar'] = () => {
  abrirDlg(`
    <div class="dlg-cab"><h2>Importar lista de estudantes</h2><button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      <p style="font-size:13px;color:var(--ink-2);margin-top:0">Cole abaixo uma linha por estudante, no formato:<br>
        <code style="font-family:var(--mono)">nome;matrícula;turma;versão</code> — versão = <em>regular</em> ou <em>adaptada</em> (opcional, padrão regular).</p>
      <textarea class="caixa" id="imp-est" rows="8" placeholder="Antonia Silva;2026-0142;2ª B;regular&#10;Elisa Fontes;2026-0231;2ª D;adaptada"></textarea>
    </div>
    <div class="dlg-pe"><button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="est-importar-ok">Importar</button></div>`);
};
ACOES['est-importar-ok'] = () => {
  const linhas = $('#imp-est').value.split('\n').map(l => l.trim()).filter(Boolean);
  let n = 0;
  for (const l of linhas) {
    const [nome, matricula, turma, versao] = l.split(/[;,\t]/).map(x => (x || '').trim());
    if (!nome || !matricula) continue;
    const ja = S.estudantes.find(e => e.matricula === matricula);
    const dados = { nome, matricula, turma: turma || '—', versao: /adapt/i.test(versao || '') ? 'adaptada' : 'regular' };
    if (ja) Object.assign(ja, dados); else S.estudantes.push({ id: uid(), ...dados });
    n++;
  }
  $('#dlg').close(); commit(); PERS.estudantesTodos();
  toast(`${n} estudante(s) importado(s)/atualizado(s).`);
};
ACOES['cart-imprimir'] = () => {
  const filtrados = S.estudantes.filter(e => cartTurma === 'todas' || e.turma === cartTurma)
    .sort((a, b) => a.turma.localeCompare(b.turma) || a.nome.localeCompare(b.nome));
  $('#print-area').innerHTML = filtrados.map(htmlCartao).join('');
  window.print();
};
ACOES['cart-template'] = () => {
  const tpl = {
    formato: 'pas-marista/gabarito-v1',
    simulado: S.config.nome, etapa: S.config.etapa,
    geradoEm: new Date().toISOString(),
    versoes: Object.fromEntries(['regular', 'adaptada'].map(v => [v,
      // Discursivos (D) ficam fora: não têm bolhas no cartão.
      prova(v).filter(({ item }) => item.tipo !== 'D')
        .map(({ item, numero }) => ({ numero, tipo: item.tipo, gabarito: item.gabarito }))
    ]))
  };
  baixar('pas-gabarito-leitor.json', JSON.stringify(tpl, null, 2));
  toast('Gabarito exportado para o leitor local.');
};

/* ================= TELA 6 · CORREÇÃO ================= */
let corrEstId = null, corrTurmaBol = 'todas';

function estudantesOrdenados() {
  return S.estudantes.slice().sort((a, b) => a.turma.localeCompare(b.turma) || a.nome.localeCompare(b.nome));
}

// Tabela de lançamento da redação (NC, NE, TL → NR calculado).
function tabelaRedacao() {
  const lista = estudantesOrdenados();
  if (!lista.length) return '<div class="vazio">Nenhum estudante cadastrado ainda.</div>';
  const linhas = lista.map(e => {
    const red = S.respostas[e.id]?.redacao || { nc: '', ne: '', tl: '' };
    const r = corrigir(e);
    return `<tr><td>${esc(e.nome)}</td><td>${esc(e.turma)}</td>
      <td><input class="caixa" style="width:84px" type="number" step="0.1" min="0" max="10" value="${red.nc}" data-mud="red" data-campo="nc" data-est="${e.id}"></td>
      <td><input class="caixa" style="width:74px" type="number" min="0" value="${red.ne}" data-mud="red" data-campo="ne" data-est="${e.id}"></td>
      <td><input class="caixa" style="width:74px" type="number" min="0" value="${red.tl}" data-mud="red" data-campo="tl" data-est="${e.id}"></td>
      <td><b>${num(r.nr, 1)}</b></td></tr>`;
  }).join('');
  return `<div style="overflow-x:auto"><table>
    <thead><tr><th>Estudante</th><th>Turma</th><th>NC (0–10)</th><th>Erros (NE)</th><th>Linhas (TL)</th><th>NR</th></tr></thead>
    <tbody>${linhas}</tbody></table></div>`;
}

// Tabela de notas dos itens discursivos (tipo D). Coordenação vê todos;
// docente vê apenas os itens aprovados de sua autoria.
function tabelaDiscursivos() {
  const meus = S.itens.filter(i => i.status === 'aprovado' && i.tipo === 'D' &&
    (ehCoord() || i.autor === S.perfil.nome));
  if (!meus.length) return null;
  const numeros = {};
  for (const v of ['regular', 'adaptada'])
    for (const { item, numero } of prova(v))
      if (item.tipo === 'D') (numeros[item.id] = numeros[item.id] || {})[v] = numero;
  const cab = meus.map(i => {
    const n = numeros[i.id] || {};
    const rot = ['regular', 'adaptada'].filter(v => n[v])
      .map(v => (v === 'regular' ? 'R-' : 'A-') + n[v]).join(' / ');
    return `<th title="${esc(i.enunciado.slice(0, 100))}">Item ${rot || '—'}<br>
      <span style="font-weight:400;text-transform:none">${esc(i.componente)} · ${esc(i.autor.split(' ')[0])}</span></th>`;
  }).join('');
  const linhas = estudantesOrdenados().map(e => {
    const cels = meus.map(i => {
      const aplicavel = i.versao === 'ambas' || i.versao === e.versao;
      if (!aplicavel) return '<td style="color:var(--ink-2)">—</td>';
      const v = S.respostas[e.id]?.discursivas?.[i.id];
      return `<td><input class="caixa" style="width:78px" type="number" step="0.5" min="0" max="10" placeholder="—"
        value="${v ?? ''}" data-mud="dnota" data-est="${e.id}" data-item="${i.id}"></td>`;
    }).join('');
    return `<tr><td>${esc(e.nome)}</td><td>${esc(e.turma)}</td>${cels}</tr>`;
  }).join('');
  return `<div style="overflow-x:auto"><table>
    <thead><tr><th>Estudante</th><th>Turma</th>${cab}</tr></thead><tbody>${linhas}</tbody></table></div>`;
}

// Visão restrita: professora de redação lança NC/NE/TL de todos.
function telaCorrecaoRedacao() {
  $('#app').innerHTML = `
  <div class="quadro"><div class="miolo">
    <div class="cab-tela"><div><h2>Redação — lançamento</h2>
      <span class="sub">NR = NC − 2·NE/TL, pela planilha oficial · salvo automaticamente a cada campo</span></div></div>
    <div class="cartao">${tabelaRedacao()}</div>
  </div></div>
  <p class="nota-tela"><strong>Perfil de redação:</strong> esta visualização mostra apenas o lançamento das informações de redação. NC = nota de conteúdo (0 a 10) · NE = número de erros · TL = total de linhas escritas.</p>`;
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

function telaCorrecao() {
  if (ehRedacao()) { telaCorrecaoRedacao(); return; }
  if (S.perfil.papel === 'docente') { telaCorrecaoDiscursivos(); return; }
  const comResp = S.estudantes.filter(e => corrigir(e).temResp);
  const est = S.estudantes.find(e => e.id === corrEstId) || null;
  const turmas = [...new Set(S.estudantes.map(e => e.turma))].sort();

  const opsEst = ['<option value="">— selecione um estudante —</option>',
    ...S.estudantes.slice().sort((a, b) => a.turma.localeCompare(b.turma) || a.nome.localeCompare(b.nome))
      .map(e => `<option value="${e.id}" ${e.id === corrEstId ? 'selected' : ''}>${esc(e.turma)} · ${esc(e.nome)} (${esc(e.matricula)})</option>`)].join('');

  let lancamento = '';
  if (est) {
    const pv = prova(est.versao);
    const resp = S.respostas[est.id] || { marcacoes: {}, redacao: null };
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
    const r = corrigir(est);
    const red = resp.redacao || { nc: '', ne: '', tl: '' };
    lancamento = `
      <div class="cartao" style="margin-bottom:16px">
        <h3>Lançamento de marcações — ${esc(est.nome)} (${est.versao})</h3>
        ${pv.length ? `<div class="lanc-grid">${grade}</div>` : '<div class="vazio">A prova desta versão ainda não tem itens aprovados.</div>'}
        <div class="form-linha" style="margin-top:14px;align-items:flex-end">
          <div class="campo" style="flex:0;min-width:130px"><label>Redação · NC (0–10)</label>
            <input class="caixa" type="number" step="0.1" min="0" max="10" value="${red.nc}" data-mud="red" data-campo="nc" data-est="${est.id}"></div>
          <div class="campo" style="flex:0;min-width:130px"><label>Nº de erros (NE)</label>
            <input class="caixa" type="number" min="0" value="${red.ne}" data-mud="red" data-campo="ne" data-est="${est.id}"></div>
          <div class="campo" style="flex:0;min-width:130px"><label>Total de linhas (TL)</label>
            <input class="caixa" type="number" min="0" value="${red.tl}" data-mud="red" data-campo="tl" data-est="${est.id}"></div>
          <div class="campo" style="flex:1">
            <span class="chip info">NR = NC − 2·NE/TL = <b>&nbsp;${num(r.nr)}</b></span>
            <span class="chip ${r.eb >= 0 ? 'ok' : 'falta'}" style="margin-left:6px">Escore bruto: ${num(r.eb, 2)}</span>
            <span class="chip pend" style="margin-left:6px">${r.ac} certas · ${r.er} erradas · ${r.br} em branco</span>
          </div>
        </div>
      </div>`;
  }

  const relatorio = turmas.map(t => {
    const alunos = S.estudantes.filter(e => e.turma === t).map(e => ({ e, r: corrigir(e) })).filter(x => x.r.temResp);
    if (!alunos.length) return '';
    const med = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
    const mEB = med(alunos.map(x => x.r.eb));
    const nrs = alunos.filter(x => x.r.nr !== null).map(x => x.r.nr);
    const mNR = nrs.length ? med(nrs) : null;
    const prop = g => {
      const vals = alunos.map(x => x.r.porGrupo[g]).filter(x => x.tot > 0);
      return vals.length ? med(vals.map(x => x.ac / x.tot)) : null;
    };
    return `<tr><td>${esc(t)}</td><td>${alunos.length}</td><td>${num(mEB)}</td><td>${num(mNR, 1)}</td>
      <td>${num(prop('Interpretar'))}</td><td>${num(prop('Executar'))}</td></tr>`;
  }).join('');

  const opsTurmaBol = ['todas', ...turmas].map(t =>
    `<option value="${t}" ${corrTurmaBol === t ? 'selected' : ''}>${t === 'todas' ? 'Todas as turmas' : t}</option>`).join('');

  $('#app').innerHTML = `
  <div class="quadro"><div class="miolo">
    <div class="cab-tela">
      <div><h2>Correção e boletins</h2>
        <span class="sub">lançamento manual, importação do leitor local e relatórios</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn fantasma" data-acao="resp-importar">⬆ Importar respostas (CSV do leitor)</button>
        <button class="btn fantasma" data-acao="notas-exportar">⬇ Planilha de notas (CSV)</button>
      </div>
    </div>

    <div class="grade g3" style="margin-bottom:16px">
      <div class="cartao vivo"><h3><span class="pingo" style="background:var(--azul)"></span>Cartões lançados</h3>
        <div class="num">${comResp.length}<small> / ${S.estudantes.length}</small></div>
        <div class="barra"><i style="width:${S.estudantes.length ? comResp.length / S.estudantes.length * 100 : 0}%"></i></div></div>
      <div class="cartao vivo"><h3><span class="pingo" style="background:var(--rosa)"></span>Itens na prova regular</h3>
        <div class="num">${prova('regular').length}</div></div>
      <div class="cartao vivo"><h3><span class="pingo" style="background:var(--verde)"></span>Itens na prova adaptada</h3>
        <div class="num">${prova('adaptada').length}</div></div>
    </div>

    <div class="campo" style="margin-bottom:14px;max-width:480px"><label>Estudante</label>
      <select class="caixa" data-mud="corr-est">${opsEst}</select></div>
    ${lancamento}

    <div class="grade g2">
      <div class="cartao">
        <h3>Desempenho por turma</h3>
        ${relatorio ? `<table><thead><tr><th>Turma</th><th>Lançados</th><th>Média EB</th><th>Redação</th><th>Interpretar</th><th>Executar</th></tr></thead>
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

    <div class="cartao" style="margin-top:16px">
      <h3>Redação — lançamento por estudante (a professora de redação vê só esta tabela)</h3>
      ${tabelaRedacao()}
    </div>
    ${(() => { const t = tabelaDiscursivos(); return t ? `<div class="cartao" style="margin-top:16px">
      <h3>Itens discursivos (tipo D) — notas de 0 a 10 (cada docente vê só os seus)</h3>
      ${t}
    </div>` : ''; })()}
  </div></div>
  <p class="nota-tela"><strong>Pontuação do MVP:</strong> tipo A: certo +1, errado −1 · tipo B: certo +1 · tipos C e D: certo +1, errado −1 · em branco 0. Redação pela planilha oficial: NR = NC − 2·NE/TL. Os pesos finais do PAS (parâmetro x) entram na fase de calibração.</p>`;
}
MUDS['corr-est'] = (d, el) => { corrEstId = el.value || null; render(); };
MUDS['corr-turma-bol'] = (d, el) => { corrTurmaBol = el.value; };
MUDS['marc'] = (d, el) => {
  const r = S.respostas[d.est] || (S.respostas[d.est] = { marcacoes: {}, redacao: null });
  const v = el.value.trim();
  if (v === '') delete r.marcacoes[d.item]; else r.marcacoes[d.item] = v.toUpperCase();
  commit(); PERS.resposta(d.est);
};
MUDS['red'] = (d, el) => {
  const r = S.respostas[d.est] || (S.respostas[d.est] = { marcacoes: {}, redacao: null });
  r.redacao = r.redacao || { nc: 0, ne: 0, tl: 0 };
  r.redacao[d.campo] = parseFloat(el.value) || 0;
  commit(); PERS.resposta(d.est);
};
MUDS['dnota'] = (d, el) => {
  const r = S.respostas[d.est] || (S.respostas[d.est] = { marcacoes: {}, redacao: null });
  r.discursivas = r.discursivas || {};
  const v = el.value.trim();
  if (v === '') delete r.discursivas[d.item];
  else r.discursivas[d.item] = Math.max(0, Math.min(10, parseFloat(v) || 0));
  commit(); PERS.resposta(d.est);
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
  const linhas = $('#imp-resp').value.split('\n').map(l => l.trim()).filter(Boolean);
  const mapaProva = {};
  const afetados = new Set();
  let ok = 0, ign = 0;
  for (const l of linhas) {
    const [mat, no, resp] = l.split(/[;,\t]/).map(x => (x || '').trim());
    const est = S.estudantes.find(e => e.matricula === mat);
    const numero = parseInt(no, 10);
    if (!est || !numero || resp === undefined) { ign++; continue; }
    const pv = mapaProva[est.versao] || (mapaProva[est.versao] = prova(est.versao));
    const entrada = pv.find(e => e.numero === numero);
    if (!entrada) { ign++; continue; }
    const r = S.respostas[est.id] || (S.respostas[est.id] = { marcacoes: {}, redacao: null });
    if (resp === '') delete r.marcacoes[entrada.item.id];
    else r.marcacoes[entrada.item.id] = resp.toUpperCase();
    afetados.add(est.id);
    ok++;
  }
  $('#dlg').close(); commit(); PERS.respostas([...afetados]);
  toast(`${ok} marcação(ões) importada(s)${ign ? ' · ' + ign + ' linha(s) ignorada(s)' : ''}.`);
};

ACOES['notas-exportar'] = () => {
  const linhas = ['matricula;nome;turma;versao;certas;erradas;brancos;escore_bruto;redacao_nr'];
  for (const e of S.estudantes) {
    const r = corrigir(e);
    if (!r.temResp) continue;
    linhas.push([e.matricula, e.nome, e.turma, e.versao, r.ac, r.er, r.br,
      r.eb.toFixed(2).replace('.', ','), r.nr === null ? '' : r.nr.toFixed(1).replace('.', ',')].join(';'));
  }
  baixar('pas-notas.csv', '﻿' + linhas.join('\n'), 'text/csv;charset=utf-8');
  toast('Planilha de notas exportada.');
};

function htmlBoletim(est, r, pos, total, mediasTurma) {
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
      <p>${esc(S.config.nome)} · ${esc(S.config.etapa)} · ${esc(est.nome).toUpperCase()} · Matrícula ${esc(est.matricula)} · ${esc(est.turma)}</p></div>
    <div class="bol-sec">
      <h5>Proporção de acertos por grupo de habilidades</h5>
      ${barras}
      <div style="font-size:7px;color:#777;margin-top:5px">Barra azul: estudante · traço rosa: média da turma</div>
    </div>
    <div class="bol-notas">
      <div class="bol-nota"><b>${num(r.eb)}</b><span>Escore bruto</span></div>
      <div class="bol-nota"><b>${num(r.nr, 1)}</b><span>Redação (NR)</span></div>
      <div class="bol-nota"><b>${pos}º</b><span>de ${total}</span></div>
    </div>
    <div class="bol-sec" style="border-top:1px solid #eee;border-bottom:none">
      <h5>Gabarito × suas marcações (trecho)</h5>
      <div style="font-family:var(--mono);font-size:8.5px;line-height:2;color:#333;white-space:pre">Item  ${linhaN}\nGab.  ${linhaG}\nVocê  ${linhaM}</div>
    </div>
  </div>`;
}

ACOES['bol-imprimir'] = () => {
  const alunos = S.estudantes
    .filter(e => corrTurmaBol === 'todas' || e.turma === corrTurmaBol)
    .map(e => ({ e, r: corrigir(e) }))
    .filter(x => x.r.temResp)
    .sort((a, b) => a.e.turma.localeCompare(b.e.turma) || a.e.nome.localeCompare(b.e.nome));
  if (!alunos.length) { toast('Nenhum estudante com respostas nesse filtro.'); return; }
  const folhas = alunos.map(({ e, r }) => {
    const rk = ranking(e.versao);
    const pos = rk.findIndex(x => x.e.id === e.id) + 1;
    const daTurma = S.estudantes.filter(x => x.turma === e.turma).map(x => corrigir(x)).filter(x => x.temResp);
    const medias = {};
    for (const g of GRUPOS) {
      const vals = daTurma.map(x => x.porGrupo[g]).filter(x => x.tot > 0).map(x => x.ac / x.tot);
      medias[g] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    }
    return htmlBoletim(e, r, pos || 1, rk.length || 1, medias);
  }).join('');
  $('#print-area').innerHTML = folhas;
  window.print();
};

/* ================= TELA 7 · EQUIPE (contas de acesso) ================= */
// Quem entra no sistema e com qual papel vem da tabela `equipe` no banco —
// não do que a pessoa declara ao entrar. A coordenação cria as contas aqui
// (a Edge Function `equipe` é a única que conhece a chave de serviço).
const PAPEIS = {
  coordenacao: 'Coordenação',
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

function telaEquipe() {
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
      <td>${esc(PAPEIS[m.papel] || m.papel)}</td>
      <td>${m.componente ? discChip(m.componente) : '—'}</td>
      <td style="white-space:nowrap">
        <button class="btn mini fantasma" data-acao="equipe-editar" data-email="${esc(m.email)}">Editar</button>
        <button class="btn mini fantasma" data-acao="equipe-senha" data-email="${esc(m.email)}">Nova senha</button>
        ${m.email === meuEmail ? '' :
          `<button class="btn mini vermelho" data-acao="equipe-remover" data-email="${esc(m.email)}">Remover</button>`}
      </td>
    </tr>`).join('');

  $('#app').innerHTML = `
  <div class="quadro"><div class="miolo">
    <div class="cab-tela">
      <div><h2>Equipe e contas de acesso</h2>
        <span class="sub">${equipeCache.length} pessoa(s) com acesso ao simulado · o papel definido aqui manda no que cada um vê</span></div>
      <button class="btn" data-acao="equipe-nova">+ Adicionar pessoa</button>
    </div>
    ${linhas ? `<div style="overflow-x:auto"><table>
      <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Componente</th><th></th></tr></thead>
      <tbody>${linhas}</tbody></table></div>`
      : '<div class="vazio">Nenhuma pessoa cadastrada além de você.</div>'}
  </div></div>
  <p class="nota-tela"><strong>Como funciona o acesso:</strong> só quem está nesta lista consegue entrar no sistema — o banco recusa qualquer cadastro de e-mail fora dela. Ao adicionar alguém, o sistema gera uma <strong>senha provisória</strong> que você entrega à pessoa; ela troca a senha pelo botão 🔑 no topo, depois de entrar.</p>`;
}

function dlgMembro(m) {
  const novo = !m;
  const opsPapel = Object.entries(PAPEIS).map(([k, v]) =>
    `<option value="${k}" ${m?.papel === k ? 'selected' : ''}>${v}</option>`).join('');
  const opsComp = Object.keys(COMPONENTES).map(c =>
    `<option ${m?.componente === c ? 'selected' : ''}>${c}</option>`).join('');
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
        <div class="campo" id="eq-comp-wrap" style="${(m?.papel || 'coordenacao') === 'docente' ? '' : 'display:none'}">
          <label>Componente</label><select class="caixa" id="eq-comp">${opsComp}</select></div>
      </div>
      ${novo ? `
        <div class="campo" style="margin-bottom:10px"><label>Senha provisória</label>
          <input class="caixa" id="eq-senha" value="${senhaProvisoria()}" style="font-family:var(--mono)"></div>
        <p style="font-size:12.5px;color:var(--ink-2);margin:0">A conta é criada já liberada — nenhum e-mail de confirmação é enviado.
          Entregue esta senha à pessoa; ela poderá trocá-la depois de entrar.</p>`
        : '<p style="font-size:12.5px;color:var(--ink-2);margin:0">Para trocar a senha desta pessoa, use “Nova senha” na lista.</p>'}
    </div>
    <div class="dlg-pe"><button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="${novo ? 'equipe-criar' : 'equipe-atualizar'}" data-email="${esc(m?.email || '')}">
        ${novo ? 'Criar conta' : 'Salvar'}</button></div>`);
}
MUDS['eq-papel'] = () => {
  $('#eq-comp-wrap').style.display = $('#eq-papel').value === 'docente' ? '' : 'none';
};

ACOES['equipe-nova'] = () => dlgMembro(null);
ACOES['equipe-editar'] = d => dlgMembro(equipeCache.find(m => m.email === d.email));

function dadosDoFormulario() {
  const papel = $('#eq-papel').value;
  return {
    nome: $('#eq-nome').value.trim(),
    papel,
    componente: papel === 'docente' ? $('#eq-comp').value : null
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
    <div class="dlg-pe"><button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
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
  equipeCache = []; equipeCarregada = false;
  toast('Você saiu da conta.');
  render();
};

// Traz do banco o estado completo do simulado para a memória.
function aplicarDados(dados) {
  S.config = dados.config;
  S.textos = dados.textos;
  S.itens = dados.itens;
  S.estudantes = dados.estudantes;
  S.respostas = dados.respostas;
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
      componente: eu?.componente || null
    };
  } catch {
    // Sem a lista da equipe, entra com o perfil mais restrito.
    S.perfil = { papel: 'docente', nome: u.email, componente: null };
  }
  try {
    const dados = await nuvem.carregarTudo();
    if (!dados.config) {
      // Banco vazio (primeiro acesso): sobe o estado local como ponto de partida.
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
    if (dados.config) { aplicarDados(dados); save(S); render(); }
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

