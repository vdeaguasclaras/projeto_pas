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
import { htmlTabelaPeriodica } from './tabela-periodica.js';
import {
  guardarImagem, descartarImagem, prepararImagens, todasAsImagens,
  htmlImagens, pecasDeImagens, htmlEditorImagens
} from './imagens.js';
import {
  carregarKatex, rico, simples, vazio as ricoVazio, editorRico, ligarEditoresRicos,
  valorDoEditor as valorDoEditorRico
} from './rico.js';
import { lerLinhasEstudantes } from './planilha.js';

let S = load();
let modoNuvem = false;

/* ---------------- utilidades ---------------- */
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, casas = 2) => (v === null || v === undefined || Number.isNaN(v)) ? '—' : Number(v).toFixed(casas).replace('.', ',');

// O aviso da tela — e por que ele muda de casa.
//
// O `<dialog>` aberto por `showModal()` vive na *top layer* do navegador: ele é
// pintado ACIMA de todo o resto da página, e nenhum `z-index` alcança isso.
// Enquanto o aviso morava solto no corpo, tudo o que o sistema dizia com um
// diálogo aberto era pintado ATRÁS dele — invisível justamente nas horas em que
// mais importa, que são as recusas do “Salvar”.
//
// Foi assim que “ele edita, mas não salva” chegou como relato, três vezes. O
// coordenador estava corrigindo um item em que as alternativas tinham sido
// coladas dentro do enunciado; ao esvaziar o enunciado para escrever o comando
// de verdade, a validação passou a recusar a gravação — e dizia “Escreva o
// enunciado do item” num retângulo que a tela nunca mostrou. Do lado de fora
// era um botão que não fazia nada.
//
// Com diálogo aberto, o aviso é anexado DENTRO dele e sobe junto para a top
// layer. É o mesmo elemento, para nunca haver dois avisos ao mesmo tempo.
function toast(msg) {
  const dlg = $('#dlg');
  const casa = dlg?.open ? dlg : document.body;
  const t = $('#toast');
  if (t.parentElement !== casa) casa.appendChild(t);
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast._tm);
  toast._tm = setTimeout(() => t.classList.remove('on'), 4200);
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

// Saudação pela hora do dia, com o primeiro nome. Resgatada do desenho que ficou
// nas propostas de redesenho: custa nada e faz a tela cumprimentar quem abriu,
// em vez de abrir com um número.
function saudacao() {
  const h = new Date().getHours();
  const parte = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const nome = String(S.perfil?.nome || '').trim().split(/\s+/)[0];
  return nome ? `${parte}, ${nome}` : parte;
}

// Quantos dias faltam para a aplicação. É a informação que a coordenação mais
// procura e que não existia em lugar nenhum do sistema — a data estava lá, mas
// a conta ficava na cabeça de quem lia.
//
// A data vem como 'AAAA-MM-DD'. Montada campo a campo, e não por `new Date(iso)`,
// que interpreta a string como UTC: à noite, no fuso de Brasília, isso daria um
// dia de diferença — e um dia de diferença é justamente o que esta conta não
// pode errar.
function diasAteAplicacao(prova) {
  const iso = prova?.dataAplicacao;
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(a, m - 1, d);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86400000);
}

// A contagem dita em português, com o tom mudando conforme aperta.
function htmlContagem(prova) {
  const n = diasAteAplicacao(prova);
  if (n === null) return '';
  const [cls, txt] =
      n === 0  ? ['falta', 'a aplicação é <b>hoje</b>']
    : n === 1  ? ['falta', 'a aplicação é <b>amanhã</b>']
    : n < 0    ? ['', n === -1 ? 'aplicada <b>ontem</b>' : `aplicada há <b>${-n}</b> dias`]
    : n <= 7   ? ['falta', `faltam <b>${n}</b> dias`]
    : n <= 21  ? ['pend',  `faltam <b>${n}</b> dias`]
    :            ['info',  `faltam <b>${n}</b> dias`];
  return `<span class="chip ${cls}" title="Aplicação em ${dataBR(prova.dataAplicacao)}">${txt}</span>`;
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
  // A mesma gravação, esperada em vez de solta. Devolve `null` quando o banco
  // aceitou e a mensagem do erro quando recusou — ver `salvarItem()`, que é
  // quem decide o que fazer com a resposta. Fora do modo nuvem não há o que
  // esperar, e ela responde `null` na hora.
  async itemAgora(i) {
    if (!modoNuvem) return null;
    try {
      await nuvem.gravarLinha('itens', { ...i, ordem: PERS.ordemNaProva(i) });
      return null;
    } catch (e) { return e?.message || String(e); }
  },
  async textoAgora(t) {
    if (!modoNuvem) return null;
    try { await nuvem.gravarLinha('textos', t); return null; }
    catch (e) { return e?.message || String(e); }
  },
  // A mesma gravação em lote, esperada. Um `upsert` só com a lista inteira: se
  // o banco recusar, recusa tudo, e quem chamou desfaz tudo — nada de meia
  // prova adaptada gravada. Ver `ACOES['adap-salvar']`.
  async itensAgora(lista) {
    if (!modoNuvem || !lista.length) return null;
    try {
      await nuvem.gravarLinhas('itens', lista.map(i => ({ ...i, ordem: PERS.ordemNaProva(i) })));
      return null;
    } catch (e) { return e?.message || String(e); }
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
  'Linguagens': ['Português', 'Literatura', 'Redação', 'Artes Visuais', 'Dança', 'Música', 'Teatro', 'Artes'],
  'Humanas': ['História', 'Geografia', 'Filosofia', 'Sociologia'],
  'Matemática': ['Matemática'],
  'Ciências da Natureza': ['Biologia', 'Física', 'Química'],
  'Inglês': ['Inglês']
};
const areaDoComponente = c => Object.keys(AREAS).find(a => AREAS[a].includes(c)) || null;

const ehCoord = () => S.perfil.papel === 'coordenacao';
const ehCoordArea = () => S.perfil.papel === 'coordenacao_area';
const ehRedacao = () => S.perfil.papel === 'redacao';
// As duas coordenações juntas. O texto-base não pertence a uma área — ele é da
// prova, e todo componente escreve item sobre ele —, então quem coordena
// qualquer área decide sobre ele do mesmo jeito que a coordenação geral. Item é
// outra história: ali a área do componente é que manda (`revisaArea`).
const ehQualquerCoord = () => ehCoord() || ehCoordArea();
// Quem pode decidir a etapa “coord. de área” de um item: a coordenação geral
// ou quem coordena justamente a área do componente daquele item.
const revisaArea = item => ehCoord() ||
  (ehCoordArea() && !!S.perfil.area && areaDoComponente(item.componente) === S.perfil.area);

// Quem pode MEXER no conteúdo de um item — enunciado, opções, gabarito, tipo.
// Diferente de quem pode decidir a etapa do fluxo (`revisaArea`) e de quem pode
// abri-lo (toda a equipe).
//
// A regra que faltava: até aqui o diálogo trazia “Salvar” para qualquer pessoa
// que abrisse qualquer item, e a política de RLS `equipe edita` (migração 0006)
// libera UPDATE em `itens` a toda a equipe. Vinte e sete contas podiam
// reescrever, em silêncio, o item já aprovado de outra — inclusive o gabarito.
//
//   · a coordenação geral, sempre (é ela quem corrige a vírgula do aprovado);
//   · quem escreveu, enquanto o item não está aprovado;
//   · a coordenação da área do item, enquanto ele está na mão dela.
//
// Quem não se encaixa lê e comenta — o fio da revisão continua aberto a todos.
function podeEditarItem(item) {
  if (!item) return false;
  if (!item.id) return true;                 // rascunho novo, ainda de ninguém
  if (ehCoord()) return true;
  if (souEu(item)) return item.status !== 'aprovado';
  return item.status === 'area' && revisaArea(item);
}

// Quem mexe no conteúdo de um TEXTO-BASE. `null` é texto novo — todo mundo pode
// escrever a própria sugestão.
//
// Os professores pediram poder corrigir o texto que já cadastraram, e a
// coordenação de área pediu poder aprovar e ajustar os textos da prova; até
// aqui as duas coisas eram só da coordenação geral, e um acento errado no
// texto-base virava recado por WhatsApp. A linha de corte é a aprovação: a
// sugestão é de quem a escreveu, o texto aprovado é da prova.
function podeEditarTexto(texto) {
  if (!texto) return true;
  if (ehQualquerCoord()) return true;
  return texto.status === 'sugestao' && souAutorDoTexto(texto);
}
// Pelo e-mail, e só por ele — é o que a política do banco também pergunta
// (`sou_autor_do_texto`, migração 0013). Reconhecer pelo nome aqui faria a tela
// oferecer “Editar” a quem o banco depois recusaria, e a promessa sumiria na
// hora de salvar. As sugestões que já existiam ganharam o e-mail de quem as
// mandou na própria migração.
const souAutorDoTexto = t => !!t?.autorEmail && t.autorEmail.toLowerCase() === idDocente(S.perfil);
const nomePerfil = () => {
  if (S.perfil.papel === 'docente')
    return `Docente · ${S.perfil.nome}${S.perfil.componente ? ' (' + S.perfil.componente + ')' : ''}`;
  // Quem coordena uma área também dá aula: o cadastro dela tem `area` E
  // `componente`, e os dois são trabalho. Mostrar só a área fazia o sistema
  // apresentá-la pela metade — “o perfil está incompleto” foi exatamente como
  // isso chegou.
  if (S.perfil.papel === 'coordenacao_area') {
    const partes = [S.perfil.area, S.perfil.componente].filter(Boolean);
    return `Coord. de área · ${S.perfil.nome}${partes.length ? ' (' + partes.join(' · ') + ')' : ''}`;
  }
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

// `extras` são itens que ainda não foram aprovados mas devem entrar na
// montagem. É o que sustenta as duas prévias que os docentes pediram: a do
// próprio item, dentro do editor, e a do caderno com a revisão à vista, para a
// coordenação ver a prova antes de aprovar. Um item de `extras` que já esteja
// gravado entra na posição dele com o conteúdo em edição — assim a prévia
// mostra o que está na tela, não o que está no banco.
//
// Sem `extras` a função é o que sempre foi: só o aprovado vira prova. É essa
// chamada que a correção, o cartão e a impressão usam.
function prova(provaId, versao, extras = []) {
  const emEdicao = new Map(extras.filter(i => i?.id).map(i => [i.id, i]));
  const novos = extras.filter(i => i && !i.id);   // rascunho que ainda não foi gravado
  const daVersao = i => i.versao === versao || i.versao === 'ambas';
  const lista = [];
  for (const t of textosAprovados(provaId)) {
    const doTexto = S.itens
      .filter(i => i.textoId === t.id && daVersao(i) && (i.status === 'aprovado' || emEdicao.has(i.id)))
      .map(i => emEdicao.get(i.id) || i)
      .concat(novos.filter(i => i.textoId === t.id && daVersao(i)));
    doTexto
      .map((item, ordem) => ({ item, ordem }))
      .sort((a, b) => (ORDEM_TIPO[a.item.tipo] ?? 9) - (ORDEM_TIPO[b.item.tipo] ?? 9) || a.ordem - b.ordem)
      .forEach(({ item }) => lista.push({ item, texto: t }));
  }
  return lista.map((e, i) => ({ ...e, numero: i + 1 }));
}

// Os itens que ainda não são prova mas já estão escritos — o que a coordenação
// vê quando liga “incluir itens em revisão” no caderno. Rascunho fica de fora:
// ele é privado de quem escreve até ser enviado.
const itensEmRevisao = provaId =>
  itensDaProva(provaId).filter(i => ['area', 'geral', 'devolvido'].includes(i.status));

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
// `rot` é o nome da tela, que também vira o título do cabeçalho. A ordem é a do
// trabalho: distribuir a prova entre os docentes vem antes de escrever item, e
// a redação vem antes do caderno porque é ele que a imprime.
//
// A pastilha do menu NÃO é um número fixo: é a posição dentro do que aquela
// pessoa vê. Quando era fixo, o docente lia “1, 3, 4, 5, 6, 7” e ficava
// procurando a tela 2, que é da coordenação. Numerar o que se vê é o que faz o
// número significar alguma coisa.
//
// As rotas são por nome (`#/textos`), então mexer na ordem não quebra endereço
// salvo. `curto` é o rótulo do simulacro do tutorial, onde a coluna é estreita.
const TELAS = {
  painel:        { rot: 'Painel',               curto: 'Painel' },
  alocacao:      { rot: 'Alocação por docente', curto: 'Alocação', soCoordenacao: true },
  textos:        { rot: 'Textos e alocação',    curto: 'Textos',   foraDaRedacao: true },
  itens:         { rot: 'Itens e revisão',      curto: 'Itens',    foraDaRedacao: true },
  redacao:       { rot: 'Redação',              curto: 'Redação',  soQuemCuidaDaRedacao: true },
  caderno:       { rot: 'Caderno',              curto: 'Caderno' },
  cartoes:       { rot: 'Cartões-resposta',     curto: 'Cartões' },
  correcao:      { rot: 'Correção e boletins',  curto: 'Correção' },
  administracao: { rot: 'Administração',        curto: 'Admin.',   soCoordenacaoNaNuvem: true }
};
// Os ícones do menu, desenhados aqui em vez de vir de uma biblioteca.
//
// O handoff pedia `lucide-react`, e as duas propostas de redesenho o usavam —
// mas este sistema não tem etapa de build nem depende de CDN, e nove ícones não
// justificam nem uma coisa nem outra. São os traços do lucide (24×24, sem
// preenchimento, cantos arredondados), escritos à mão; o peso e a cor vêm do
// CSS, para o ícone acompanhar o texto ao lado em vez de gritar mais alto.
const ICONES = {
  painel:        '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  alocacao:      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  textos:        '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M8 9h2"/>',
  itens:         '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  redacao:       '<path d="M20.2 12.2a6 6 0 0 0-8.4-8.4L5 10.5V19h8.5z"/><path d="M16 8 2 22"/><path d="M17.5 15H9"/>',
  caderno:       '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  cartoes:       '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  correcao:      '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16v-4"/><path d="M12 16V8"/><path d="M17 16v-6"/>',
  administracao: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>'
};
const icone = k => `<span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONES[k] || ICONES.painel}</svg></span>`;

// Administração cuida de contas e da lista de estudantes — só aparece para a
// coordenação e só com o sistema ligado ao banco. Alocação é da coordenação em
// qualquer modo: quem recebe meta não a define.
//
// A professora de redação não escreve item, então Textos e Itens não são dela —
// ofereciam “+ Novo item” a quem nunca vai criar um. Em troca, a tela Redação é
// dela e da coordenação: é onde a proposta de cada prova é escrita.
function telasVisiveis() {
  return Object.entries(TELAS).filter(([, v]) =>
    (!v.soCoordenacaoNaNuvem || (modoNuvem && ehCoord())) &&
    (!v.soCoordenacao || ehCoord()) &&
    (!v.foraDaRedacao || !ehRedacao()) &&
    (!v.soQuemCuidaDaRedacao || ehCoord() || ehRedacao()));
}
function telaAtual() {
  const h = location.hash.replace('#/', '');
  // A tela de administração já se chamou "equipe": quem tiver o endereço antigo
  // salvo continua chegando.
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
    .map(([k, v], i) => `<a href="#/${k}" ${k === atual ? 'aria-current="page"' : ''}>
      ${icone(k)}<span class="rot">${esc(v.rot)}</span><span class="n">${i + 1}</span></a>`).join('');
  ({
    painel: telaPainel, alocacao: telaAlocacao, textos: telaTextos, itens: telaItens,
    redacao: telaRedacao, caderno: telaCaderno, cartoes: telaCartoes,
    correcao: telaCorrecao, administracao: telaAdministracao
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
  // O aviso pode estar hospedado dentro do diálogo (ver `toast`): ele volta
  // para o corpo antes da remontagem, senão o `innerHTML` o destruiria.
  const t = $('#toast');
  if (t?.parentElement === d) document.body.appendChild(t);
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
    // Escritos e aprovados são contas diferentes: “falta escrever” se mede pelo
    // que existe, “está em dia” se mede pelo que passou na revisão.
    porTipo: Object.fromEntries(Object.keys(TIPOS).map(t =>
      [t, meus.filter(i => i.tipo === t).length])),
    aprovadosPorTipo: Object.fromEntries(Object.keys(TIPOS).map(t =>
      [t, meus.filter(i => i.tipo === t && i.status === 'aprovado').length]))
  };
}
const minhaProducao = provaId => producaoDe(provaId);

/* ---------------- alocação: a meta de cada docente ---------------- */
const alocacaoDe = (provaId, chave) => S.alocacoes?.[provaId]?.[chave] || null;
const minhaAlocacao = provaId => alocacaoDe(provaId, idDocente(S.perfil));

// A meta pode ser dividida por tipo de item: “6 itens, sendo 3 do tipo A, 2 do
// tipo B e 1 do tipo C”. É essa divisão que diz ao docente o que escrever — um
// total solto deixa a escolha do tipo em aberto, e às vezes é isso que a
// coordenação quer.
//
// O total NÃO é um número independente quando há divisão: ele é a soma dos
// tipos. Total editável ao lado de tipos editáveis produziria "6" com partes que
// somam 7 — um número que mente. Enquanto nenhum tipo é informado, o total é
// direto (tipos a critério de quem escreve).
const TIPOS_META = Object.keys(TIPOS);

const tiposDaAlocacao = a => {
  const p = a?.porTipo || {};
  return Object.fromEntries(TIPOS_META.map(t => {
    const n = Number(p[t]);
    return [t, Number.isFinite(n) && n > 0 ? n : 0];
  }));
};
const somaDosTipos = a => Object.values(tiposDaAlocacao(a)).reduce((s, n) => s + n, 0);
const temDivisaoPorTipo = a => somaDosTipos(a) > 0;

// A meta que vale: a soma dos tipos quando há divisão, o total solto quando não.
function metaDaAlocacao(a) {
  if (!a) return 0;
  const soma = somaDosTipos(a);
  if (soma > 0) return soma;
  const n = Number(a.meta);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// A divisão dita em português, do jeito que a coordenação a diz em voz alta:
// “6 itens, sendo 3 do tipo A, 2 do tipo B e 1 do tipo C”. Tipo com zero não
// entra na frase — dizer “0 do tipo D” é ruído.
function fraseDosTipos(a) {
  if (!temDivisaoPorTipo(a)) return '';
  const tipos = tiposDaAlocacao(a);
  const partes = TIPOS_META.filter(t => tipos[t]).map(t => `${tipos[t]} do tipo ${t}`);
  if (partes.length === 1) return partes[0];
  return partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1];
}

// Quanto ainda falta em cada tipo, contra a contagem que se passar: a de itens
// escritos responde “o que ainda tenho de escrever”, a de aprovados responde
// “o que ainda não fechou”.
function tiposEmFalta(a, contagem) {
  if (!temDivisaoPorTipo(a)) return [];
  const tipos = tiposDaAlocacao(a);
  return TIPOS_META
    .map(t => ({ tipo: t, faltam: tipos[t] - (contagem?.[t] || 0) }))
    .filter(x => x.faltam > 0);
}

// A divisão com o progresso de cada tipo, em fichas: “A 1/3 · B 0/2”. Uma barra
// só, do total, esconderia exatamente o que esta tela existe para mostrar —
// seis itens escritos com a mistura errada não são a meta cumprida.
function htmlTiposDaMeta(a, prod) {
  if (!temDivisaoPorTipo(a)) return '';
  const tipos = tiposDaAlocacao(a);
  return `<div class="tipos-meta">${TIPOS_META.filter(t => tipos[t]).map(t => {
    const feito = prod?.aprovadosPorTipo?.[t] || 0;
    const cls = feito >= tipos[t] ? 'ok' : feito ? 'pend' : 'falta';
    return `<span class="chip ${cls}" title="${esc(TIPOS[t].rotulo)} — ${feito} de ${tipos[t]} ${
      feito === 1 ? 'aprovado' : 'aprovados'}">${t} ${feito}/${tipos[t]}</span>`;
  }).join('')}</div>`;
}

// A mistura de tipos da prova inteira, e quanto ficou sem tipo definido. É o
// que responde à coordenação “esta prova está pedindo quantos de cada tipo?”.
function mixDaProva(provaId) {
  const m = S.alocacoes?.[provaId] || {};
  const porTipo = Object.fromEntries(TIPOS_META.map(t => [t, 0]));
  let livre = 0;
  for (const a of Object.values(m)) {
    if (temDivisaoPorTipo(a)) {
      const t = tiposDaAlocacao(a);
      for (const k of TIPOS_META) porTipo[k] += t[k];
    } else livre += metaDaAlocacao(a);
  }
  const definido = Object.values(porTipo).reduce((s, n) => s + n, 0);
  return { porTipo, livre, definido };
}

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
  return Object.values(m).reduce((s, a) => s + metaDaAlocacao(a), 0);
}

// A encomenda em uma faixa, para as telas em que o item é escrito.
//
// A meta só existia no Painel, e quem escreve item não fica no Painel: ele abre
// “Textos e alocação”, ocupa um espaço livre e escreve. Era possível trabalhar
// a semana inteira sem nunca ver quantos itens a coordenação pediu, nem de que
// tipo — foi exatamente o que a escola relatou. Aqui a encomenda acompanha o
// trabalho, na prova que está na tela.
//
// Some para a coordenação geral (que não recebe meta) e para quem não tem meta
// nesta prova — uma faixa dizendo “sem meta” em toda tela seria ruído.
function faixaDaEncomenda(provaId) {
  if (ehCoord() || ehRedacao()) return '';
  const a = alocacaoDe(provaId, idDocente(S.perfil));
  const meta = metaDaAlocacao(a);
  if (!meta) return '';
  const prod = producaoDe(provaId);
  const faltam = tiposEmFalta(a, prod.porTipo);
  const p = provaPorId(provaId);
  const pronto = prod.aprovados >= meta;
  return `
  <div class="encomenda-faixa${pronto ? ' ok' : ''}">
    <div class="encomenda-frase">
      <b>Sua encomenda em ${esc(p?.serie || 'nesta prova')}:</b>
      ${meta} ${meta === 1 ? 'item' : 'itens'}${temDivisaoPorTipo(a) ? `, sendo ${fraseDosTipos(a)}` : ''}.
      ${faltam.length
        ? `Ainda ${faltam.length === 1 ? 'falta' : 'faltam'} escrever ${
            faltam.map(x => `<b>${x.faltam} do tipo ${x.tipo}</b>`).join(', ')}.`
        : prod.criados >= meta
          ? (pronto ? 'Tudo aprovado. ' : 'Tudo escrito, aguardando a revisão. ')
          : `Ainda ${meta - prod.criados === 1 ? 'falta' : 'faltam'} <b>${meta - prod.criados}</b>.`}
      ${a?.observacao ? `<span class="encomenda-recado">Recado da coordenação: ${esc(a.observacao)}</span>` : ''}
    </div>
    <div class="encomenda-medida">
      ${progressoDaMeta(prod.aprovados, meta)}${htmlTiposDaMeta(a, prod)}
    </div>
  </div>`;
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
    const meta = metaDaAlocacao(a);
    // Falta por tipo, medida no que está escrito: é a conta de "o que ainda
    // tenho de fazer". Ela vem antes do total na situação, porque um total
    // fechado com a mistura errada não é meta cumprida.
    const faltaTipo = tiposEmFalta(a, m.porTipo);
    // A situação responde "estou em dia?" — e isso só tem resposta contra a
    // meta. Sem meta, o mais honesto é relatar o estágio do que existe.
    const situacao = m.devolvidos ? '<span class="chip falta">Devolvido — ajustar</span>'
      : faltaTipo.length ? `<span class="chip falta">Faltam ${
          faltaTipo.map(x => `${x.faltam} do tipo ${x.tipo}`).join(', ')}</span>`
      : meta && m.aprovados >= meta ? '<span class="chip ok">Meta cumprida</span>'
      : meta && m.criados >= meta ? '<span class="chip pend">Entregue, em revisão</span>'
      : meta ? `<span class="chip falta">Faltam ${meta - m.criados}</span>`
      : m.emRevisao ? '<span class="chip pend">Em revisão</span>'
      : m.rascunhos ? '<span class="chip info">Rascunho pendente</span>'
      : m.criados ? '<span class="chip ok">Tudo aprovado</span>'
      : '<span class="chip">Nada entregue</span>';
    return `<tr class="clic" data-acao="ir-para-prova" data-id="${esc(p.id)}">
      <td><b>${esc(p.serie)}</b><br><span style="font-size:11px;color:var(--ink-2)">${esc(p.etapa)}</span></td>
      <td>${progressoDaMeta(m.aprovados, meta)}${htmlTiposDaMeta(a, m)}</td>
      <td>${m.criados}</td><td>${m.aprovados}</td><td>${m.emRevisao}</td>
      <td>${situacao}</td>
    </tr>`;
  }).join('');

  const tot = provas.reduce((s, p) => {
    const m = minhaProducao(p.id);
    return {
      criados: s.criados + m.criados,
      aprovados: s.aprovados + m.aprovados,
      meta: s.meta + metaDaAlocacao(minhaAlocacao(p.id))
    };
  }, { criados: 0, aprovados: 0, meta: 0 });

  // Observações que a coordenação anexou à meta — ditas aqui, onde interessam.
  const recados = provas
    .map(p => ({ p, obs: minhaAlocacao(p.id)?.observacao }))
    .filter(x => x.obs);

  // A encomenda em palavras, prova por prova. A tabela mostra o progresso; esta
  // frase é o pedido — “6 itens, sendo 3 do tipo A, 2 do tipo B e 1 do tipo C” —
  // e é ela que o docente precisa ler para saber o que escrever.
  const divisoes = provas
    .map(p => ({ p, a: minhaAlocacao(p.id) }))
    .filter(({ a }) => temDivisaoPorTipo(a));

  return `<div class="cartao" style="margin-bottom:16px">
    <h3>O que você tem para entregar</h3>
    <div style="overflow-x:auto"><table>
      <thead><tr><th>Prova</th><th>Aprovados / meta</th><th>Criados</th><th>Aprovados</th><th>Em revisão</th><th>Situação</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>
    ${divisoes.length ? `<div class="cartao encomenda" style="margin:14px 0 0">
      <h3>A sua encomenda, por tipo de item</h3>
      ${divisoes.map(({ p, a }) => {
        const n = metaDaAlocacao(a);
        return `<p><b>${esc(p.serie)}:</b> ${n} ${n === 1 ? 'item' : 'itens'}, sendo ${fraseDosTipos(a)}.</p>`;
      }).join('')}
      <p class="legenda-tipos">${TIPOS_META.map(t => esc(TIPOS[t].rotulo)).join(' · ')}</p>
    </div>` : ''}
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

// Visão de quem responde pela redação. O painel do docente não serve aqui: ele
// mede itens contra metas, e quem tem o papel `redacao` não escreve item — a
// tabela dizia “sem meta definida · Nada entregue” nas quatro provas, todo dia,
// para alguém que estava com o trabalho em dia.
function painelDaRedacao() {
  const linhas = provasOrdenadas().map(p => {
    const tem = provaTemRedacao(p.id);
    const escrita = tem && propostaEscrita(p.id);
    const elenco = estudantesDaProva(p.id);
    const lancadas = tem ? elenco.filter(e => redLancada(redacaoDe(p.id, e.id))).length : 0;
    const sit = !tem ? '<span class="chip">sem redação</span>'
      : !escrita ? '<span class="chip falta">Falta escrever a proposta</span>'
      : !elenco.length ? '<span class="chip info">Proposta pronta</span>'
      : lancadas >= elenco.length ? '<span class="chip ok">Tudo lançado</span>'
      : lancadas ? `<span class="chip pend">Faltam ${elenco.length - lancadas} lançamentos</span>`
      : '<span class="chip info">Proposta pronta, à espera da aplicação</span>';
    return `<tr class="clic" data-acao="ir-para-redacao" data-id="${esc(p.id)}">
      <td><b>${esc(p.serie)}</b><br><span style="font-size:11px;color:var(--ink-2)">${esc(p.etapa)}</span></td>
      <td>${!tem ? '—' : escrita ? '<span class="chip ok">escrita</span>' : '<span class="chip falta">em branco</span>'}</td>
      <td>${tem && escrita ? esc(proposta(p.id).tema).slice(0, 48) || '—' : '—'}</td>
      <td>${tem ? `${lancadas}/${elenco.length}` : '—'}</td>
      <td>${sit}</td>
    </tr>`;
  }).join('');
  const b = balancoDaRedacao();
  return `<div class="cartao" style="margin-bottom:16px">
    <h3>A redação das quatro provas</h3>
    <div style="overflow-x:auto"><table>
      <thead><tr><th>Prova</th><th>Proposta</th><th>Tema</th><th>Notas lançadas</th><th>Situação</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>
    <p style="font-size:12.5px;color:var(--ink-2);margin:10px 0 0">
      ${b.faltando.length
        ? `Falta escrever a proposta de <b>${esc(b.faltando.map(p => p.serie).join(', '))}</b> — a prova tem redação,
           e sem a proposta o caderno sai com a folha em branco.`
        : `As ${b.comRedacao.length} propostas estão escritas.`}
      Clique numa linha para abrir a redação daquela prova.</p>
  </div>`;
}

// A área de quem coordena uma. Ela não existia: o painel da coordenação de área
// era o do docente, “o que VOCÊ tem para entregar”, e nada dizia como estava a
// área pela qual ela responde. Para saber quantos itens de Literatura já
// existiam, ou quem ainda não escreveu nada em Português, era preciso ir à tela
// de itens e montar o filtro na mão — e é justamente a pessoa que precisa dessa
// conta todo dia. As duas coisas são dela, e agora aparecem uma embaixo da
// outra: a área, e depois a própria entrega.
//
// A conta é da prova que está na tela. A fila de revisão, logo acima, é que
// atravessa as quatro provas — ali o assunto é o que está parado esperando uma
// decisão, e item esquecido de outra série não pode sumir por causa do seletor.
function painelDaArea(provaId) {
  const area = S.perfil.area;
  if (!area) return `<div class="cartao aviso" style="margin-bottom:16px">
    <h3>Área não definida no seu cadastro</h3>
    <p style="font-size:13px;margin:0">O seu papel é de coordenação de área, mas o cadastro não diz qual área.
      Sem ela o sistema não tem como saber quais itens são seus para revisar — peça à coordenação geral
      para completar isso em <b>Administração</b>.</p></div>`;

  const daArea = itensDaProva(provaId).filter(i => areaDoComponente(i.componente) === area);
  const comps = (AREAS[area] || []).filter(c => daArea.some(i => i.componente === c));
  const linhas = comps.map(c => {
    const doComp = daArea.filter(i => i.componente === c);
    const quem = [...new Set(doComp.map(i => i.autor).filter(Boolean))];
    const naFila = doComp.filter(i => i.status === 'area').length;
    const devolvidos = doComp.filter(i => i.status === 'devolvido').length;
    const aprovados = doComp.filter(i => i.status === 'aprovado').length;
    return `<tr>
      <td>${discChip(c)}</td>
      <td>${quem.length ? esc(quem.join(', ')) : '<span style="color:var(--ink-2)">ninguém ainda</span>'}</td>
      <td>${doComp.length}</td>
      <td>${aprovados}</td>
      <td>${naFila ? `<b class="fila-n">${naFila}</b>` : '—'}</td>
      <td>${devolvidos || '—'}</td>
    </tr>`;
  }).join('');

  const naFila = daArea.filter(i => i.status === 'area').length;
  // “Artes” genérica está no mapa das áreas porque ainda há gente cadastrada
  // nela, mas não é componente que se peça item — cobrá-lo aqui seria cobrar
  // uma disciplina que a escola deixou de oferecer.
  const semItem = (AREAS[area] || [])
    .filter(c => !ehComponenteLegado(c) && !daArea.some(i => i.componente === c));
  return `<div class="cartao painel-area" style="margin-bottom:16px">
    <h3><span class="pingo" style="background:var(--roxo)"></span>A sua área — ${esc(area)}</h3>
    ${linhas ? `<div style="overflow-x:auto"><table>
      <thead><tr><th>Componente</th><th>Quem escreve</th><th>Itens</th><th>Aprovados</th>
        <th>Na sua fila</th><th>Devolvidos</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>`
      : '<p style="font-size:13px;margin:0">Nenhum item desta área foi escrito para esta prova ainda.</p>'}
    <p style="font-size:12.5px;color:var(--ink-2);margin:10px 0 0">
      ${naFila
        ? `<b>${naFila}</b> ${naFila === 1 ? 'item desta prova espera' : 'itens desta prova esperam'} a sua decisão —
           você aprova (e ele segue para a coordenação geral), devolve com ajustes ou corrige o texto direto no item.`
        : 'Nada desta prova está parado na sua etapa.'}
      ${semItem.length ? ` Sem item nenhum nesta prova: ${esc(semItem.join(', '))}.` : ''}</p>
    <div class="fila-acoes">
      <button class="btn fantasma" data-acao="ir-minha-area">Ver os itens da área →</button>
      <a class="btn fantasma" href="#/textos" style="text-decoration:none">Textos-base da prova →</a>
    </div>
  </div>`;
}
// Leva à tela de itens já filtrada pela área, na prova que está na tela — o
// mesmo cuidado de `ir-fila-itens`: o painel promete uma lista, e quem chega
// lá tem de encontrá-la montada.
ACOES['ir-minha-area'] = () => {
  filtroStatus = 'todos';
  soMeus = false;
  soMinhaArea = true;
  todasAsProvas = false;
  location.hash = '#/itens';
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

/* ---------------- a fila de quem revisa ---------------- */
// O que está parado esperando UMA PESSOA decidir. Existe porque a revisão
// emperrava sem ninguém saber onde: dezenas de itens ficavam na etapa da
// coordenação de área, que não tinha como saber que estavam ali — o botão de
// aprovar só aparece dentro do item, e ninguém abre um a um item que não sabe
// que existe. A conta é de todas as provas, não só da que está na tela: item de
// 2ª série esquecido não aparece para quem está olhando o 9º ano.
function filaDeRevisao() {
  if (!ehQualquerCoord()) return null;
  // A etapa de cada uma: a coordenação de área decide o que está em `area` e é
  // da área dela; a geral decide o que já passou por ali. A geral também PODE
  // agir na etapa de área — é ela que destrava —, mas isso é a fila de outra
  // pessoa, e some da conta dela para não virar ruído de 61 itens.
  const itens = ehCoord()
    ? S.itens.filter(i => i.status === 'geral')
    : S.itens.filter(i => i.status === 'area' && revisaArea(i));
  const textos = S.textos.filter(t => t.status === 'sugestao');
  const aqui = idProvaAtual();
  return {
    itens, textos,
    itensAqui: itens.filter(i => i.provaId === aqui).length,
    textosAqui: textos.filter(t => t.provaId === aqui).length,
    // Quanto está parado na etapa da área — a coordenação geral precisa ver
    // isto para saber que a revisão emperrou antes de chegar nela.
    naArea: ehCoord() ? S.itens.filter(i => i.status === 'area').length : 0,
    // Itens que a coordenação de área ajustou na leitura final do caderno e
    // que esperam a releitura da coordenação pedagógica. Não é a mesma coisa
    // que a fila de aprovação: o item já está aprovado e já está na prova — o
    // que falta é alguém confirmar que o ajuste pode ir para o papel assim.
    releitura: ehCoord() ? S.itens.filter(i => i.aguardaLeituraFinal) : [],
    total: itens.length + textos.length
  };
}

// Quem coordena cada área, para a coordenação geral saber a quem cobrar o que
// está parado — e para o sistema dizer quando uma área não tem coordenação
// cadastrada, que é como um item ficar esperando alguém que não existe. Fora do
// modo nuvem a lista da equipe não é carregada, e a resposta é “não sei”.
function coordenacaoDaArea(area) {
  return equipeCache.find(m => m.papel === 'coordenacao_area' && m.area === area) || null;
}

// A lista da equipe é carregada pelas telas que dependem dela (alocação,
// administração). O painel só a usa para dizer quem responde por uma fila
// parada, e isso não vale segurar a tela: pede em segundo plano e redesenha
// quando chegar. Até lá, mostra a contagem sem afirmar de quem é a vez.
function pedirEquipeAoFundo() {
  if (!modoNuvem || equipeCarregada || pedirEquipeAoFundo.pedida) return;
  pedirEquipeAoFundo.pedida = true;
  nuvem.carregarEquipe()
    .then(l => { equipeCache = l; equipeCarregada = true; render(); })
    .catch(e => console.warn('equipe não carregada para o painel:', e.message || e));
}

// Os ajustes feitos na leitura final do caderno pela coordenação de área, à
// espera da releitura da coordenação pedagógica. Vem dentro da fila porque é
// fila: é trabalho parado esperando uma decisão dela.
function htmlReleituraPendente(f) {
  const n = f.releitura?.length || 0;
  if (!n) return '';
  const linhas = f.releitura.slice(0, 8).map(i => {
    const a = i.aguardaLeituraFinal || {};
    const pr = provaPorId(i.provaId);
    return `<tr class="clic" data-acao="abrir-item" data-id="${esc(i.id)}">
      <td>${discChip(i.componente)}</td>
      <td>${esc(pr?.serie || '—')}</td>
      <td>${esc(a.campo || 'conteúdo')}</td>
      <td>${esc(a.por || '—')}<br><span style="font-size:11px;color:var(--ink-2)">${esc(a.quando || '')}</span></td>
    </tr>`;
  }).join('');
  return `<div class="fila-releitura">
    <p><b>${n}</b> ${n === 1 ? 'item foi ajustado' : 'itens foram ajustados'} na leitura final do caderno pela
      coordenação de área e ${n === 1 ? 'espera' : 'esperam'} a sua releitura.
      ${n === 1 ? 'Ele continua' : 'Eles continuam'} na prova e ${n === 1 ? 'sai' : 'saem'} na impressão com o
      ajuste — a releitura é a confirmação de que pode ser assim.</p>
    <table><thead><tr><th>Componente</th><th>Prova</th><th>O que mudou</th><th>Quem ajustou</th></tr></thead>
      <tbody>${linhas}</tbody></table>
    ${n > 8 ? `<p style="font-size:12px;color:var(--ink-2);margin:8px 0 0">…e mais ${n - 8}.</p>` : ''}
  </div>`;
}

function htmlFilaDeRevisao() {
  const f = filaDeRevisao();
  if (!f) return '';
  const gargalo = htmlGargaloDaArea(f);
  const releitura = htmlReleituraPendente(f);
  if (!f.total)
    return `<div class="cartao fila-revisao${releitura ? '' : ' vazia'}" style="margin-bottom:16px">
      <h3>Sua fila de revisão</h3>
      <p>Nada esperando a sua decisão de aprovação — ${ehCoord()
        ? 'nenhum item chegou à etapa da coordenação geral e não há sugestão de texto pendente'
        : 'todos os itens da sua área e as sugestões de texto já foram decididos'}.</p>
      ${releitura}
      ${gargalo}
    </div>`;
  const noutrasProvas = f.total - f.itensAqui - f.textosAqui;
  const partes = [];
  if (f.itens.length) partes.push(`<b>${f.itens.length}</b> ${f.itens.length === 1 ? 'item' : 'itens'}`);
  if (f.textos.length) partes.push(`<b>${f.textos.length}</b> ${f.textos.length === 1 ? 'sugestão de texto' : 'sugestões de texto'}`);
  // Por componente, para a coordenação de área saber por onde começar. A lista
  // completa é a própria tela de itens.
  const porComp = {};
  for (const i of f.itens) porComp[i.componente] = (porComp[i.componente] || 0) + 1;
  const chips = Object.entries(porComp).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([c, n]) => `${discChip(c)} <b>${n}</b>`).join(' &nbsp; ');
  return `<div class="cartao fila-revisao" style="margin-bottom:16px">
    <h3><span class="pingo" style="background:var(--amarelo)"></span>Sua fila de revisão</h3>
    <p>${partes.join(' e ')} ${f.total === 1 ? 'espera' : 'esperam'} a sua decisão${
      noutrasProvas > 0 ? `, ${noutrasProvas === f.total ? 'em outras provas' : `sendo <b>${noutrasProvas}</b> em outras provas`}` : ''}.
      ${ehCoord()
        ? 'Item aprovado por você entra no caderno e no cartão-resposta.'
        : 'O item que você aprova segue para a coordenação geral; o texto que você aprova já entra na prova.'}</p>
    ${chips ? `<p class="fila-comps">${chips}</p>` : ''}
    <div class="fila-acoes">
      ${f.itens.length ? `<button class="btn" data-acao="ir-fila-itens">Ver ${f.itens.length === 1 ? 'o item' : `os ${f.itens.length} itens`} →</button>` : ''}
      ${f.textos.length ? `<a class="btn fantasma" href="#/textos" style="text-decoration:none">Ver as sugestões de texto →</a>` : ''}
    </div>
    ${releitura}
    ${gargalo}
  </div>`;
}

// O que está parado ANTES de chegar à coordenação geral, por área — e quem
// responde por cada uma. É a pergunta que a fila não respondia: “a revisão não
// anda, mas não anda onde?”. Uma área sem coordenação cadastrada, ou com quem
// nunca entrou no sistema, é item esperando por ninguém.
function htmlGargaloDaArea(f) {
  if (!ehCoord() || !f.naArea) return '';
  pedirEquipeAoFundo();
  // Sem banco não há lista de equipe, e “sem coordenação cadastrada” seria uma
  // afirmação sobre o que o modo local não tem como saber. A coluna some.
  const comQuem = modoNuvem && equipeCarregada;
  const porArea = {};
  for (const i of S.itens.filter(x => x.status === 'area')) {
    const a = areaDoComponente(i.componente) || 'sem área definida';
    porArea[a] = (porArea[a] || 0) + 1;
  }
  const linhas = Object.entries(porArea).sort((a, b) => b[1] - a[1]).map(([area, n]) => {
    const quem = coordenacaoDaArea(area);
    // “Ainda não fez o primeiro acesso” é o achado que explica fila parada sem
    // ninguém errar: a conta existe, o item chegou nela, e a pessoa nunca
    // entrou para ver. Dizer isso aqui poupa a investigação.
    const situacao = !quem ? '<span class="chip pend">sem coordenação cadastrada</span>'
      : quem.trocar_senha ? `<span class="chip pend">${esc(quem.nome || quem.email)} — ainda não fez o primeiro acesso</span>`
      : `<span class="chip info">${esc(quem.nome || quem.email)}</span>`;
    return `<tr><td>${esc(area)}</td><td><b>${n}</b></td>${comQuem ? `<td>${situacao}</td>` : ''}</tr>`;
  }).join('');
  return `<div class="fila-gargalo">
    <p><b>${f.naArea}</b> ${f.naArea === 1 ? 'item está' : 'itens estão'} na etapa das coordenações de área, antes de chegar a você.</p>
    <table><thead><tr><th>Área</th><th>Itens</th>${comQuem ? '<th>Quem decide</th>' : ''}</tr></thead><tbody>${linhas}</tbody></table>
  </div>`;
}
// Leva à tela de itens já filtrada pela fila: sem isso a pessoa chegava lá e
// tinha de montar o filtro na mão para reencontrar o que o painel prometeu.
ACOES['ir-fila-itens'] = () => {
  filtroStatus = ehCoord() ? 'geral' : 'area';
  soMeus = false;
  soMinhaArea = ehCoordArea();
  todasAsProvas = true;
  location.hash = '#/itens';
  render();
};

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
  //
  // Para quem responde pela redação, a conferência dos ITENS não é recado: ela
  // não escreve item, não define tamanho de prova e não alcança a tela dos
  // textos-base. Sobra a linha que é dela — a proposta.
  const conf = [];
  if (ehRedacao()) {
    if (provaTemRedacao(p.id) && !propostaEscrita(p.id))
      conf.push('esta prova tem redação, mas a <b>proposta</b> (tema, comando e textos motivadores) ainda não foi escrita — escreva na tela <a href="#/redacao">Redação</a>');
  } else {
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
      (cuidaDaRedacao() ? ' — escreva em <a href="#/redacao">Redação</a>, no botão “✍ Escrever a proposta”' : ''));
  }

  // Os quadros de produção de item — versões, contagens, entregas por
  // componente — são a leitura de quem escreve ou revisa item. Para o papel
  // `redacao` eles diziam “0 de 110 itens aprovados” e mandavam “começar pela
  // tela Textos e alocação”, que é justamente a tela que ela não tem.
  const mostraItens = !ehRedacao();

  $('#app').innerHTML = `
  <div class="quadro"><div class="miolo">
    <div class="cab-tela">
      <div>
        <span class="cab-sobrancelha">${esc(p.nome)} · ${esc(p.etapa)}</span>
        <h2>${esc(saudacao())} 👋</h2>
        <span class="sub">${esc(p.serie)} · Aplicação: ${dataBR(p.dataAplicacao)} · ${elenco.length} ${elenco.length === 1 ? 'estudante' : 'estudantes'}${p.temRedacao === false ? ' · sem redação' : ' · com redação'}</span>
        ${htmlContagem(p) ? `<div class="cab-contagem">${htmlContagem(p)}</div>` : ''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${doPapel ? '<button class="btn fantasma" data-acao="cfg">⚙ Configurar prova</button>' : ''}
        ${doPapel ? '<button class="btn fantasma" data-acao="prova-nova">+ Nova prova</button>' : ''}
        <a class="btn rosa" href="#/caderno" style="text-decoration:none">Gerar cadernos</a>
      </div>
    </div>

    ${htmlFilaDeRevisao()}

    ${ehCoordArea() ? painelDaArea(p.id) : ''}

    ${doPapel ? '' : ehRedacao() ? painelDaRedacao() : painelDoDocente()}

    ${!mostraItens ? '' : `
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
    </div>`}

    ${conf.length ? `<div class="cartao aviso" style="margin-bottom:16px">
      <h3>Conferência da prova</h3>
      <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7">${conf.map(c => `<li>${c}</li>`).join('')}</ul>
    </div>` : ''}

    ${doPapel ? painelDasProvas() : ''}

    ${!mostraItens ? '' : `<div class="cartao" style="margin-bottom:16px">
      <h3>Entregas por componente curricular — ${esc(p.serie)}</h3>
      ${linhas ? `<table><thead><tr><th>Componente</th><th>Docente(s)</th><th>Itens criados</th><th>Aprovados</th><th>Situação</th></tr></thead>
        <tbody>${linhas}</tbody></table>` : '<div class="vazio">Nenhum item criado nesta prova ainda — comece pela tela “Textos e alocação”.</div>'}
    </div>`}

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
        <b>Redação</b>, e sai nas últimas páginas do caderno.</p>
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
      const somaArea = lista.reduce((s, d) => s + metaDaAlocacao(alocacaoDe(p.id, d.chave)), 0);
      const linhas = lista.map(d => {
        const a = alocacaoDe(p.id, d.chave);
        const prod = producaoDe(p.id, d.chave);
        const meta = metaDaAlocacao(a);
        const tipos = tiposDaAlocacao(a);
        const dividido = temDivisaoPorTipo(a);
        // Um campo por tipo de item. Enquanto nenhum tem valor, o total é
        // digitado direto (tipos a critério de quem escreve); a partir do
        // primeiro, o total é a soma e vira somente-leitura — total editável ao
        // lado de partes editáveis produziria um número que mente.
        const camposTipo = TIPOS_META.map(t => `
          <input class="caixa aloc-tipo" type="number" min="0" max="90"
            value="${tipos[t] || ''}" placeholder="—"
            title="${esc(TIPOS[t].rotulo)}"
            data-mud="aloc-tipo" data-chave="${esc(d.chave)}" data-tipo="${t}"
            aria-label="Itens do tipo ${t} para ${esc(d.nome)}">`).join('');
        return `<tr>
          <td><b>${esc(d.nome)}</b>${d.email ? `<br><span style="font-size:11px;color:var(--ink-2);font-family:var(--mono)">${esc(d.email)}</span>` : ''}</td>
          <td>${d.componente ? discChip(d.componente) : '<span style="color:var(--ink-2)">—</span>'}</td>
          <td class="aloc-tipos">${camposTipo}</td>
          <td data-total="${esc(d.chave)}">${dividido
            ? `<span class="aloc-total-soma" title="soma dos tipos">${meta}</span>`
            : `<input class="caixa" type="number" min="0" max="90" style="width:78px"
                 value="${meta || ''}" placeholder="—"
                 data-mud="aloc-meta" data-chave="${esc(d.chave)}"
                 aria-label="Total de itens para ${esc(d.nome)}">`}</td>
          <td style="min-width:132px" data-barra="${esc(d.chave)}">${progressoDaMeta(prod.aprovados, meta)}${htmlTiposDaMeta(a, prod)}</td>
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
          <th colspan="7" data-soma-area="${esc(area)}">${rotuloSomaArea(somaArea)}</th></tr>
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
          <th>Docente</th><th>Componente</th>
          <th class="aloc-tipos-cab">${TIPOS_META.map(t => `<span title="${esc(TIPOS[t].rotulo)}">${t}</span>`).join('')}</th>
          <th>Total</th><th>Aprovados / meta</th>
          <th>Criados</th><th>Em revisão</th><th>Devolv.</th><th>Recado</th>
        </tr></thead>
        ${grupos}
      </table>
    </div>` : `<div class="vazio">Nenhum docente para alocar.${modoNuvem ? ' Cadastre a equipe em Administração.' : ''}</div>`}
  </div></div>
  <p class="nota-tela"><strong>A meta é por prova.</strong> A mesma pessoa pode ter metas diferentes no 9º ano e na 3ª série — troque de prova no menu à esquerda para alocar cada uma. Campo em branco significa <em>sem meta</em>, que é diferente de meta zero: quem está sem meta não aparece cobrado no painel dele.
    <strong>As colunas A, B, C e D dividem a meta por tipo de item</strong> — preencha 3, 2 e 1 e o docente lê “6 itens, sendo 3 do tipo A, 2 do tipo B e 1 do tipo C” no painel dele. Enquanto nenhum tipo é preenchido, digite só o <strong>Total</strong> e a mistura fica a critério de quem escreve; a partir do primeiro tipo, o Total passa a ser a <em>soma</em> dos tipos e não se digita mais — um total ao lado de partes que somam outra coisa seria um número que mente. O <strong>recado</strong> aparece no painel do docente, junto da meta. Cada campo é gravado ao sair dele, como no resto do sistema.</p>`;
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
  const semMeta = pessoas.filter(d => !metaDaAlocacao(alocacaoDe(p.id, d.chave))).length;

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
        <div class="barra"><i style="width:${b.totalQuestoes ? Math.min(100, soma / b.totalQuestoes * 100) : 0}%"></i></div>
        ${htmlMixResumo(p.id)}</div>
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

// A mistura de tipos da prova no cartão “Alocado”: quanto está pedido de cada
// tipo e quanto ficou a critério de quem escreve. Sem nenhuma divisão, não
// desenha nada — o cartão não precisa de uma linha para dizer que não há linha.
function htmlMixResumo(provaId) {
  const { porTipo, livre, definido } = mixDaProva(provaId);
  if (!definido) return '';
  const fichas = TIPOS_META.filter(t => porTipo[t])
    .map(t => `<span title="${esc(TIPOS[t].rotulo)}">${t} ${porTipo[t]}</span>`).join('');
  return `<div class="mix-tipos">${fichas}${livre
    ? `<span class="livre" title="metas sem divisão por tipo — o tipo fica a critério de quem escreve">${livre} sem tipo</span>`
    : ''}</div>`;
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

  const a = alocacaoDe(provaId, chave);
  const meta = metaDaAlocacao(a);

  const prod = producaoDe(provaId, chave);
  const cel = document.querySelector(`[data-barra="${CSS.escape(chave)}"]`);
  if (cel) cel.innerHTML = progressoDaMeta(prod.aprovados, meta) + htmlTiposDaMeta(a, prod);

  // A célula do total troca de forma quando a divisão por tipo entra ou sai:
  // com divisão ela mostra a soma, sem divisão ela é campo. Trocar só o número
  // deixaria um campo editável exibindo uma soma que ele não controla.
  const ct = document.querySelector(`[data-total="${CSS.escape(chave)}"]`);
  if (ct) {
    const dividido = temDivisaoPorTipo(a);
    const eraCampo = !!ct.querySelector('input');
    if (dividido === eraCampo) {
      ct.innerHTML = dividido
        ? `<span class="aloc-total-soma" title="soma dos tipos">${meta}</span>`
        : `<input class="caixa" type="number" min="0" max="90" style="width:78px"
             value="${meta || ''}" placeholder="—"
             data-mud="aloc-meta" data-chave="${esc(chave)}" aria-label="Total de itens">`;
    } else if (dividido) {
      const alvo = ct.querySelector('.aloc-total-soma');
      if (alvo) alvo.textContent = meta;
    }
  }

  // Subtotais por área, recalculados dos dados — não incrementados a partir do
  // que está na tela.
  const porArea = {};
  for (const d of docentesAlocaveis()) {
    const area = areaDoComponente(d.componente) || 'Sem área definida';
    porArea[area] = (porArea[area] || 0) + metaDaAlocacao(alocacaoDe(provaId, d.chave));
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
  if (!metaDaAlocacao(a) && !a.observacao) delete S.alocacoes[provaId][d.chave];
  alocacaoMudou(provaId, d.chave);
};
MUDS['aloc-tipo'] = (d, el) => {
  const provaId = idProvaAtual();
  const n = parseInt(el.value, 10);
  const a = alocacaoParaEditar(provaId, d.chave);
  a.porTipo = tiposDaAlocacao(a);
  a.porTipo[d.tipo] = Number.isFinite(n) && n > 0 ? n : 0;
  // Sem nenhum tipo, a divisão deixa de existir e o total volta a ser digitado
  // direto: o campo some do registro em vez de ficar um objeto de zeros. O total
  // vai embora com ela — ele era a soma, não um número que alguém digitou, e
  // deixá-lo para trás faria a tela exibir um total que a coordenação acabou de
  // apagar.
  if (!temDivisaoPorTipo(a)) { delete a.porTipo; a.meta = 0; }
  else a.meta = somaDosTipos(a);   // o total gravado acompanha a soma
  if (!metaDaAlocacao(a) && !a.observacao) delete S.alocacoes[provaId][d.chave];
  alocacaoMudou(provaId, d.chave);
};

MUDS['aloc-obs'] = (d, el) => {
  const provaId = idProvaAtual();
  const a = alocacaoParaEditar(provaId, d.chave);
  a.observacao = el.value.trim();
  if (!metaDaAlocacao(a) && !a.observacao) delete S.alocacoes[provaId][d.chave];
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
      Isto <b>substitui as metas já definidas</b> nesta prova e <b>desfaz a divisão por tipo</b> — o total passa a ser
      um número solto, e a mistura de tipos volta a ser definida docente por docente. Os recados são preservados.</p></div>
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
    // A divisão por tipo antiga tem de sair: ela venceria o total que estamos
    // gravando aqui, e a tela mostraria um número que a divisão contradiz.
    delete a.porTipo;
    a.meta = base + (ix < resto ? 1 : 0);
    if (!metaDaAlocacao(a) && !a.observacao) delete S.alocacoes[p.id][d.chave];
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
        escolhida, docente por docente, junto com a divisão por tipo de quem tiver uma. Útil quando a distribuição entre
        as séries é a mesma. Os recados não são copiados.</p>
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
    if (metaDaAlocacao(a)) S.alocacoes[p.id][chave] = { ...a, observacao: '' };
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
        ${ehQualquerCoord() ? `
          <span style="display:inline-flex;gap:4px">
            <button class="mv" data-acao="texto-mover" data-id="${t.id}" data-dir="-1" title="Mover texto para cima" ${ti === 0 ? 'disabled' : ''}>▲</button>
            <button class="mv" data-acao="texto-mover" data-id="${t.id}" data-dir="1" title="Mover texto para baixo" ${ti === aprovados.length - 1 ? 'disabled' : ''}>▼</button>
          </span>
          <button class="btn mini fantasma" data-acao="editar-texto" data-id="${t.id}">Editar</button>`
        : `<button class="btn mini fantasma" data-acao="editar-texto" data-id="${t.id}"
             title="Ler o texto e ver como ele sai no caderno">Ver</button>`}
      </div>
      <div class="texto-corpo"><div class="slots">${chips}${slotsLivres}</div></div>
    </div>`;
  }).join('');

  // As sugestões esperam decisão das duas coordenações — a geral e a de área.
  // Enquanto a aprovação era só da geral, texto sugerido em outubro ainda
  // estava esperando em agosto, e quem sugeriu não podia nem corrigir o próprio
  // título. Quem escreveu continua com a sugestão na mão até ela ser aprovada.
  const sugestoes = textosDaProva(pAtiva.id).filter(t => t.status === 'sugestao').map(t => {
    const meuTexto = souAutorDoTexto(t);
    return `
    <div class="texto-bloco sugestao">
      <div class="texto-cab" style="background:color-mix(in srgb,var(--amarelo) 20%,transparent)">
        <div class="tnum" style="background:var(--amarelo);color:#5c4300">S</div>
        <div style="flex:1;min-width:200px">
          <h4>${esc(t.titulo)}</h4>
          <p>enviada por ${esc(t.sugeridoPor || '—')} · fonte: ${esc(t.fonte)}</p>
        </div>
        <span class="chip pend">Aguardando aprovação da coordenação</span>
        ${ehQualquerCoord()
          ? `<button class="btn mini verde" data-acao="aprovar-texto" data-id="${t.id}">Aprovar</button>
             <button class="btn mini fantasma" data-acao="editar-texto" data-id="${t.id}">Ver/editar</button>`
          : `<button class="btn mini fantasma" data-acao="editar-texto" data-id="${t.id}">${
               meuTexto ? 'Editar' : 'Ver'}</button>`}
      </div>
    </div>`;
  }).join('');

  $('#app').innerHTML = `
  <div class="quadro"><div class="miolo">
    <div class="cab-tela">
      <div><h2>Textos-base — ${esc(pAtiva.serie)}</h2>
        <span class="sub">${esc(pAtiva.etapa)} · Clique em um espaço livre para alocar um item seu · clique em um item para abri-lo</span></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="chip info">Sua produção nesta prova: ${minhaProducao(pAtiva.id).criados} ${minhaProducao(pAtiva.id).criados === 1 ? 'item' : 'itens'}</span>
        ${ehQualquerCoord()
          ? '<button class="btn" data-acao="novo-texto">+ Novo texto</button>'
          : '<button class="btn verde" data-acao="sugerir-texto">+ Sugerir novo texto</button>'}
      </div>
    </div>
    ${faixaDaEncomenda(pAtiva.id)}
    ${blocos || '<div class="vazio">Nenhum texto-base aprovado ainda.' + (ehQualquerCoord() ? ' Crie o primeiro com “+ Novo texto”.' : ' Sugira um texto para a coordenação aprovar.') + '</div>'}
    ${sugestoes}
  </div></div>
  <p class="nota-tela"><strong>Modelo de alocação:</strong> cada texto tem uma quantidade de itens, sem amarração prévia a disciplinas — qualquer docente ocupa um espaço livre com item do tipo que escolher. A coordenação — geral ou de área — registra regras por texto (informativas nesta fase), edita os textos da prova e aprova as sugestões dos docentes. Quem sugeriu um texto continua podendo corrigi-lo enquanto ele não é aprovado.</p>`;
}

// O formulário desenha `rascTexto`, a cópia de trabalho — nunca o registro
// gravado. É a mesma escolha do editor de item (`rasc`), e ela existe por um
// motivo concreto: anexar uma figura remonta o diálogo, e enquanto o desenho
// vinha do registro a remontagem devolvia o texto ao último estado salvo. Quem
// estava sugerindo um texto novo via título, fonte e corpo sumirem de uma vez;
// “Salvar” então respondia “título e fonte são obrigatórios” e não gravava nada,
// deixando a imagem enviada órfã no bucket. O relato que chegou foi “a imagem
// não carrega e o Salvar não faz nada” — eram as duas pontas do mesmo defeito.
let rascTexto = null;   // cópia de trabalho do texto-base aberto

function novoRascTexto(t) {
  return {
    id: t?.id || null,
    provaId: t?.provaId || idProvaAtual(),
    numero: t?.numero ?? null,
    status: t?.status || null,
    sugeridoPor: t?.sugeridoPor ?? null,
    autorEmail: t?.autorEmail ?? null,
    titulo: t?.titulo || '',
    fonte: t?.fonte || '',
    corpo: (t?.linhas || []).join('<br>'),
    imagens: todasAsImagens(t?.imagens).map(i => ({ ...i })),
    slots: t?.slots ?? 6,
    regra: t?.regra || '',
    comando: t?.comando || '',
    formato: t?.formato || 'prosa'
  };
}

// Lê da tela para a cópia de trabalho. Chamada antes de toda remontagem: o
// `change` de um <input> só dispara quando o campo perde o foco, e quem clica
// direto no seletor de figura com o cursor ainda no título perderia a linha.
function recolherCamposDoTexto() {
  if (!rascTexto) return;
  const pega = (sel, campo) => { const el = $(sel); if (el) rascTexto[campo] = el.value; };
  pega('#tx-titulo', 'titulo');
  pega('#tx-fonte', 'fonte');
  pega('#tx-regra', 'regra');
  pega('#tx-comando', 'comando');
  const slots = $('#tx-slots');
  if (slots) rascTexto.slots = Math.max(1, parseInt(slots.value, 10) || 6);
  const area = $('[data-rico-campo="txCorpo"]');
  if (area) rascTexto.corpo = valorDoEditorRico(area);
}

function dlgTexto(t, { preservar = false } = {}) {
  if (!preservar) rascTexto = novoRascTexto(t);
  const r = rascTexto;
  const novo = !r.id;
  // Quem manda no texto-base: as duas coordenações. O docente cuida da própria
  // sugestão enquanto ela não foi aprovada — depois disso o texto é da prova,
  // e não mais de quem o indicou.
  const daCoord = ehQualquerCoord();
  const somenteLeitura = !podeEditarTexto(t && !novo ? t : null);
  abrirDlg(`
    <div class="dlg-cab"><h2>${novo ? (daCoord ? 'Novo texto-base' : 'Sugerir texto-base')
      : (somenteLeitura ? 'Texto-base' : 'Editar texto-base')}</h2>
      <button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      ${somenteLeitura ? `<div class="cartao aviso" style="margin:0 0 14px">
        <p style="font-size:13px;margin:0">Este texto-base já foi aprovado e vale para a prova inteira: só a
          coordenação o altera. Se algo precisa mudar, fale com a coordenação da sua área.</p></div>` : ''}
      <div class="form-linha">
        <div class="campo" style="min-width:260px"><label>Título</label>
          <input class="caixa" id="tx-titulo" value="${esc(r.titulo)}" placeholder="ex.: “O Cerrado e as veredas” — Guimarães Rosa (adapt.)"${somenteLeitura ? ' disabled' : ''}></div>
        <div class="campo"><label>Fonte</label><input class="caixa" id="tx-fonte" value="${esc(r.fonte)}" placeholder="autor / obra / veículo, ano"${somenteLeitura ? ' disabled' : ''}></div>
      </div>
      <div class="campo" style="margin-bottom:12px">
        <div class="campo-cab">
          <label>Corpo do texto <span class="rot-opcional">— opcional, se houver figura</span></label>
          ${somenteLeitura ? '' : `<div class="seg seg-formato" role="group" aria-label="Formato do texto no caderno">
            ${FORMATOS.map(f => `<button class="${r.formato === f.k ? 'sel' : ''}"
              data-acao="tx-formato" data-v="${f.k}" title="${esc(f.dica)}">${esc(f.rot)}</button>`).join('')}
          </div>`}
        </div>
        ${editorRico({ campo: 'txCorpo', valor: r.corpo, linhas: 9, soLeitura: somenteLeitura,
                       rotulo: 'Corpo do texto-base', paragrafos: r.formato === 'prosa',
                       previa: somenteLeitura ? null : htmlPreviaDoCorpo(r.corpo, r.formato) })}
        ${somenteLeitura ? '' : htmlAjudaDoCorpo(r.formato)}</div>
      <div class="campo" style="margin-bottom:12px"><label>Figuras do texto</label>
        ${htmlEditorImagens(r.imagens, { campo: 'texto', modoNuvem, soLeitura: somenteLeitura })}
        ${somenteLeitura ? '' : `<p style="font-size:12px;color:var(--ink-2);margin:6px 0 0">Infográfico, mapa, obra de arte, charge, gráfico.
          Sai no caderno depois do texto, antes do comando do bloco. <b>A figura pode ser o texto-base inteiro</b>:
          deixe o corpo em branco e o caderno traz só a imagem, com a legenda e a fonte.</p>`}</div>
      ${daCoord && !somenteLeitura ? `<div class="form-linha">
        <div class="campo"><label>Quantidade de itens (slots)</label>
          <input class="caixa" type="number" min="1" max="40" id="tx-slots" value="${r.slots}"></div>
        <div class="campo" style="min-width:260px"><label>Regra do coordenador (opcional)</label>
          <input class="caixa" id="tx-regra" value="${esc(r.regra)}" placeholder="ex.: sem itens tipo D neste texto"></div>
      </div>
      <div class="campo" style="margin-bottom:12px"><label>Abertura do comando no caderno</label>
        <input class="caixa" id="tx-comando" value="${esc(r.comando)}"
          placeholder="Considerando o texto precedente e os múltiplos aspectos a ele relacionados">
        <p style="font-size:12px;color:var(--ink-2);margin:6px 0 0">O resto da frase o sistema monta sozinho pelos tipos dos itens alocados —
          “<em>, julgue os itens de 11 a 19 e assinale a opção correta no item 20, que é do tipo C.</em>”</p></div>` : ''}
      ${!daCoord && novo ? '<p style="font-size:12.5px;color:var(--ink-2)">Sua sugestão ficará visível a todos após aprovação da coordenação, que define a quantidade de itens do texto.</p>' : ''}
    </div>
    <div class="dlg-pe">
      ${!novo && ehCoord() ? `<button class="btn vermelho" style="margin-right:auto" data-acao="excluir-texto" data-id="${r.id}">Excluir</button>` : ''}
      <button class="btn fantasma" data-acao="previa-texto" title="Ver como este texto sai no caderno impresso">👁 Como sai na prova</button>
      <button class="btn fantasma" data-acao="fechar-dlg">${somenteLeitura ? 'Fechar' : 'Cancelar'}</button>
      ${somenteLeitura ? '' : `<button class="btn" data-acao="salvar-texto">${novo && !daCoord ? 'Enviar sugestão' : 'Salvar'}</button>`}
    </div>`);
}
// Prosa, verso ou linhas numeradas — a escolha que decide se o poema sai como
// poema.
//
// Ela existia, mas estava enterrada: um <select> no fim do diálogo, DENTRO do
// bloco que só a coordenação vê, depois de slots, regra e abertura do comando.
// O resultado está no banco — dos 69 textos-base cadastrados, os 69 estão em
// `prosa`. Ninguém nunca escolheu outra coisa, e é por isso que os poemas
// chegavam ao caderno com os versos emendados num parágrafo corrido: em prosa o
// caderno junta as linhas de propósito, que é o certo para uma reportagem e o
// errado para “No meio do caminho tinha uma pedra”.
//
// Agora ela é um seletor ao lado do próprio rótulo do corpo, visível a quem
// quer que possa editar o texto — inclusive ao docente que sugere o poema, que
// antes não tinha como dizer que era um poema.
const FORMATOS = [
  { k: 'prosa',    rot: 'Prosa',   dica: 'o texto reflui e é justificado — reportagem, crônica, ensaio' },
  { k: 'verso',    rot: 'Verso',   dica: 'mantém as quebras de linha — poema, canção, letra' },
  { k: 'numerado', rot: 'Linhas numeradas', dica: 'cada linha ganha número no caderno, para o item citar a passagem' }
];

// Trocar o formato muda o que a ajuda do corpo diz e como o Enter se comporta —
// em prosa ele abre parágrafo, em verso quebra a linha. Recolhe antes de
// remontar, senão a troca apagaria o que ainda não perdeu o foco.
ACOES['tx-formato'] = d => {
  if (!rascTexto) return;
  recolherCamposDoTexto();
  rascTexto.corpo = converterCorpo(rascTexto.corpo, rascTexto.formato, d.v);
  rascTexto.formato = d.v;
  dlgTexto(null, { preservar: true });
};

// O corpo, ao mudar de formato. Sem isto, quem digitava o poema e só depois
// escolhia “verso” terminava com uma linha em branco entre cada dois versos: em
// prosa o Enter abre parágrafo, e parágrafo é linha em branco. A linha em
// branco que era marca de parágrafo não é estrofe.
//
// A distinção entre as duas está no próprio texto: se NENHUM par de linhas
// escritas está encostado, cada Enter foi uma quebra de linha e as brancas são
// só a consequência disso — todas caem. Se há linhas encostadas, o texto tem
// blocos de verdade, e aí as brancas são separação: sobrevivem, no máximo uma
// entre dois blocos.
function converterCorpo(corpo, de, para) {
  if (de === para || para === 'prosa') return corpo;
  const linhas = String(corpo || '').split(/<br\s*\/?>/i);
  const encostadas = linhas.some((l, i) => i > 0 && !ricoVazio(l) && !ricoVazio(linhas[i - 1]));
  if (!encostadas) return linhas.filter(l => !ricoVazio(l)).join('<br>');
  const saida = [];
  for (const l of linhas)
    if (!ricoVazio(l) || !ricoVazio(saida[saida.length - 1] ?? 'x')) saida.push(l);
  return saida.join('<br>');
}

// “Isto parece um poema?” — três linhas ou mais, quase todas curtas. Uma linha
// de prosa colada de um PDF ou de um site vem com o parágrafo inteiro; verso
// vem picado. Serve só para OFERECER a troca de formato, nunca para fazê-la:
// quem decide é quem escreve.
function pareceVerso(corpo) {
  const linhas = String(corpo || '').split(/<br\s*\/?>/i)
    .map(l => simples(l).trim()).filter(Boolean);
  if (linhas.length < 3) return false;
  const curtas = linhas.filter(l => l.length <= 62).length;
  return curtas >= Math.ceil(linhas.length * 0.8);
}
ACOES['novo-texto'] = () => dlgTexto(null);
ACOES['sugerir-texto'] = () => dlgTexto(null);
ACOES['editar-texto'] = d => {
  const t = S.textos.find(x => x.id === d.id);
  dlgTexto(t);
  // Mesmo motivo de `abrirItemComFiguras`: a tira de miniaturas precisa de
  // endereço assinado, e ele só existia depois de o caderno ser montado.
  if (modoNuvem && todasAsImagens(t?.imagens).length)
    prepararImagens([t.imagens]).then(() => {
      if ($('#dlg').open && rascTexto?.id === t.id) dlgTexto(null, { preservar: true });
    });
};
// O editor rico entrega uma string; cada <br> é uma linha do texto-base. Guardar
// linha a linha (e não um bloco só) é o que permite ao editor de item numerar e
// destacar a faixa que o item cita.
//
// As linhas em branco do meio ficam: elas separam parágrafo na prosa. Só as das
// pontas caem.
// `formato` decide o que fazer com linhas em branco seguidas. Em prosa elas
// dizem uma coisa só — “começa parágrafo” —, e duas ou três seguidas dizem o
// mesmo que uma; o navegador produz um número variável delas conforme o jeito
// de teclar, e guardar essa variação faria o mesmo texto ter conteúdo diferente
// a cada edição. Em verso e em linhas numeradas cada linha em branco é espaço
// de verdade entre estrofes, e aí elas ficam como foram escritas.
function linhasDoCorpoRico(html, formato = 'prosa') {
  let linhas = String(html || '')
    .split(/<br\s*\/?>/i)
    .map(l => l.replace(/^(\s|&nbsp;|<div>|<\/div>)+|(\s|&nbsp;|<div>|<\/div>)+$/gi, '').trim());
  if (formato === 'prosa')
    linhas = linhas.filter((l, i) => !ricoVazio(l) || !ricoVazio(linhas[i - 1] ?? 'x'));
  while (linhas.length && ricoVazio(linhas[0])) linhas.shift();
  while (linhas.length && ricoVazio(linhas[linhas.length - 1])) linhas.pop();
  return linhas;
}

// Quantos parágrafos há no corpo, pela mesma regra do caderno: linha em branco
// separa parágrafo, e em verso cada linha é uma linha.
function paragrafosDoCorpo(corpo) {
  const linhas = linhasDoCorpoRico(corpo);
  const grupos = [];
  let atual = [];
  for (const l of linhas) {
    if (!ricoVazio(l)) atual.push(l);
    else if (atual.length) { grupos.push(atual); atual = []; }
  }
  if (atual.length) grupos.push(atual);
  return grupos;
}

// A prévia do corpo, dentro do próprio editor. Mostra o texto como ele sai no
// caderno E numera os parágrafos: era isso que faltava para quem escreve saber
// se o sistema entendeu a separação do jeito que ela foi digitada. Antes, a
// linha em branco era a única marca — invisível no meio de um bloco de nove
// linhas —, e texto de três parágrafos chegava ao caderno como um só.
function htmlPreviaDoCorpo(corpo, formato = 'prosa') {
  const linhas = linhasDoCorpoRico(corpo, formato);
  if (!linhas.length)
    return '<p class="previa-vazia">O corpo ainda está em branco — o texto-base pode ser só a figura.</p>';
  // Em verso e em linhas numeradas cada quebra é conteúdo, e a prévia a mostra
  // — o “↵” ao fim de cada linha é a quebra que o caderno vai imprimir. Era o
  // que faltava para a diferença entre prosa e verso ficar visível ANTES de o
  // texto ir para o papel: na área de edição as duas se parecem.
  if (formato !== 'prosa') {
    const n = linhas.filter(l => !ricoVazio(l)).length;
    return `<div class="previa-corpo previa-verso">${htmlCorpoTexto({ linhas, formato })}
      <p class="previa-conta">${n} ${n === 1 ? 'linha' : 'linhas'}, e o caderno respeita ${
        n === 1 ? 'a quebra' : 'as quebras'} exatamente como ${n === 1 ? 'ela está' : 'elas estão'} aqui.${
        formato === 'numerado' ? ' Cada uma recebe o seu número.' : ''}</p></div>`;
  }
  const grupos = paragrafosDoCorpo(corpo);
  const marcados = grupos.map((g, i) =>
    `<p><span class="previa-par">¶${i + 1}</span>${rico(g.join(' '))}</p>`).join('');
  // A oferta de trocar para verso mora aqui porque a prévia é a única parte do
  // formulário que se refaz a cada tecla: colar um poema faz o convite aparecer
  // na hora, ao lado do parágrafão que a prosa produziu.
  const convite = pareceVerso(corpo) ? `
    <p class="previa-convite"><span>Estas linhas parecem <b>versos</b> — e em <b>prosa</b> o caderno junta
      todas num parágrafo corrido, como você vê acima.</span>
      <button class="btn mini" data-acao="tx-formato" data-v="verso">Manter as quebras de linha</button></p>` : '';
  return `<div class="previa-corpo pas-texto">${marcados}
    <p class="previa-conta">${grupos.length === 1
      ? 'Um parágrafo só. Para abrir outro, tecle <b>Enter</b> — <b>Shift+Enter</b> quebra a linha sem abrir parágrafo.'
      : `${grupos.length} parágrafos.`}</p>${convite}</div>`;
}

// A ajuda embaixo do corpo muda com o formato: em prosa o Enter abre parágrafo,
// em verso e em linhas numeradas cada linha é uma linha, e dizer “linha em
// branco separa parágrafo” ali só confundiria.
function htmlAjudaDoCorpo(formato) {
  const comum = 'Aceita ênfase, tamanho de letra e notação matemática, como o enunciado do item — a fórmula pelo botão <b>ƒ(x)</b>.';
  if (formato === 'verso')
    return `<p class="rico-ajuda"><b>Verso:</b> cada linha sai como uma linha do poema ou da canção, sem refluir.
      <b>Enter</b> quebra a linha; uma linha em branco separa estrofe. ${comum}</p>`;
  if (formato === 'numerado')
    return `<p class="rico-ajuda"><b>Linhas numeradas:</b> cada linha recebe um número no caderno, e é por ele
      que o item cita a passagem. <b>Enter</b> começa a linha seguinte. ${comum}</p>`;
  return `<p class="rico-ajuda"><b>Prosa:</b> o caderno junta as linhas num parágrafo corrido e justificado —
    é o certo para reportagem e crônica, e o errado para poema (para esse, escolha <b>Verso</b> acima).
    <b>Enter</b> abre um parágrafo novo; <b>Shift+Enter</b> quebra a linha dentro do mesmo parágrafo.
    ${comum}</p>`;
}

ACOES['salvar-texto'] = async () => {
  recolherCamposDoTexto();
  const r = rascTexto;
  const anterior = r.id ? S.textos.find(t => t.id === r.id) : null;
  if (anterior && !podeEditarTexto(anterior)) {
    toast('Este texto-base já foi aprovado — só a coordenação o altera.'); return;
  }
  const daCoord = ehQualquerCoord();
  // Quantos itens cabem, a regra e a abertura do comando continuam sendo
  // decisão da coordenação. O FORMATO, não: quem escreve é quem sabe se aquilo
  // é prosa ou verso, e era justamente por essa escolha estar trancada com a
  // coordenação que o poema sugerido pelo docente chegava ao caderno em prosa.
  const dados = {
    titulo: r.titulo.trim(),
    fonte: r.fonte.trim(),
    // linhas em branco no meio são separadores de parágrafo — só as das pontas caem
    linhas: linhasDoCorpoRico(r.corpo, r.formato || 'prosa'),
    imagens: todasAsImagens(r.imagens),
    slots: daCoord ? Math.max(1, r.slots || 6) : (anterior?.slots ?? 6),
    regra: daCoord ? String(r.regra || '').trim() : (anterior?.regra || ''),
    comando: daCoord ? String(r.comando || '').trim() : (anterior?.comando || ''),
    formato: r.formato || 'prosa'
  };
  // O corpo escrito deixa de ser obrigatório quando há figura: no PAS o
  // texto-base é, muitas vezes, uma obra de arte, uma charge, um infográfico ou
  // um mapa — e nada mais. Exigir corpo escrito era o que impedia isso, e a
  // saída que sobrava era descrever a imagem por escrito, como estava feito nos
  // dados de exemplo. Título e fonte continuam obrigatórios: a fonte é crédito
  // de obra, e sem ela o caderno não pode ser impresso.
  const temCorpo = dados.linhas.some(l => !ricoVazio(l));
  const temFigura = dados.imagens.length > 0;
  if (!dados.titulo || !dados.fonte) {
    toast('Título e fonte do texto-base são obrigatórios.'); return;
  }
  if (!temCorpo && !temFigura) {
    toast('Escreva o corpo do texto ou acrescente ao menos uma figura.'); return;
  }
  // A numeração dos textos é por prova: o Texto 1 do 9º ano e o Texto 1 da
  // 1ª série convivem sem se atropelar.
  const provaId = anterior?.provaId || r.provaId || idProvaAtual();
  // O e-mail de quem escreveu, para o texto ter dono como o item tem (migração
  // 0013). É por ele que a sugestão continua editável por quem a mandou.
  const eu = S.perfil.email || null;
  let alvo;
  if (anterior) {
    Object.assign(anterior, dados); alvo = anterior;
  } else if (daCoord) {
    alvo = { id: uid(), provaId, numero: Math.max(0, ...textosAprovados(provaId).map(t => t.numero)) + 1, status: 'aprovado', sugeridoPor: null, autorEmail: eu, ...dados };
    S.textos.push(alvo);
  } else {
    alvo = { id: uid(), provaId, numero: null, status: 'sugestao', sugeridoPor: `${S.perfil.nome} (${S.perfil.componente || 'docente'})`, autorEmail: eu, ...dados };
    S.textos.push(alvo);
  }
  // Esperada, pelo mesmo motivo de `salvarItem()`: se o banco recusar, o texto
  // volta ao que era e o diálogo continua aberto com o que estava escrito.
  const antesDaGravacao = anterior ? JSON.parse(JSON.stringify(anterior)) : null;
  const erro = await PERS.textoAgora(alvo);
  if (erro) {
    if (antesDaGravacao) Object.assign(anterior, antesDaGravacao);
    else S.textos = S.textos.filter(t => t.id !== alvo.id);
    save(S);
    toast('⚠ O banco recusou a gravação: ' + erro);
    dlgTexto(null, { preservar: true });
    return;
  }
  $('#dlg').close(); commit();
  toast(anterior ? 'Texto atualizado.' : (daCoord ? 'Texto criado.' : 'Sugestão enviada à coordenação.'));
};
ACOES['aprovar-texto'] = async d => {
  const t = S.textos.find(x => x.id === d.id);
  if (!t || !ehQualquerCoord()) return;
  const antes = JSON.parse(JSON.stringify(t));
  t.status = 'aprovado';
  t.numero = Math.max(0, ...textosAprovados(t.provaId).filter(x => x.id !== t.id).map(x => x.numero)) + 1;
  // Quem aprovou fica registrado: com duas coordenações decidindo sobre o mesmo
  // texto, “quem deixou isto entrar” passa a ser pergunta com resposta.
  t.aprovadoPor = `${S.perfil.nome} (${ehCoord() ? 'coordenação geral' : 'coord. de área — ' + (S.perfil.area || '')})`;
  const erro = await PERS.textoAgora(t);
  if (erro) {
    Object.assign(t, antes);
    save(S); render();
    toast('⚠ O banco recusou a aprovação: ' + erro);
    return;
  }
  if ($('#dlg')?.open) $('#dlg').close();
  commit(); toast(`Texto aprovado como Texto ${t.numero}.`);
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
      <td style="text-transform:capitalize">${esc(i.versao)}${
        i.derivadoDe ? '<br><span class="marca-derivado" title="Versão adaptada de um item da prova regular">↳ adaptação</span>'
        : itemAdaptadoDe(i.id) ? '<br><span class="marca-derivado" title="Este item tem uma versão adaptada própria">tem adaptação</span>' : ''}</td>
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
    ${todasAsProvas ? '' : faixaDaEncomenda(pAtiva?.id)}
    ${linhas ? `<table><thead><tr>${todasAsProvas ? '<th>Prova</th>' : ''}<th>Texto</th><th>Enunciado</th><th>Tipo</th><th>Componente</th><th>Autor</th><th>Versão</th><th>Status</th></tr></thead>
      <tbody>${linhas}</tbody></table>`
      : '<div class="vazio">Nenhum item neste filtro. Crie um item pelos espaços livres em “Textos e alocação” ou pelo botão acima.</div>'}
  </div></div>
  <p class="nota-tela"><strong>Fluxo:</strong> o docente redige e envia; a coordenação comenta, devolve ou aprova em dois níveis. Só itens <strong>aprovados</strong> entram no caderno, no cartão e na correção.<br>
    <strong>Prova adaptada:</strong> o sistema não a gera sozinho. O campo “Versão” diz onde cada item entra, e <em>ambas</em> significa o <strong>mesmo item</strong>, com a mesma redação, nas duas provas. Quando a prova de inclusão precisar de um ajuste, abra o item e use <strong>“Criar versão adaptada”</strong>: nasce uma cópia editável só da adaptada, e o original passa a valer só na regular.</p>`;
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
    imagensOpcoes: [[], [], [], []],
    enunciado: '', status: 'rascunho', comentarios: []
  };
}

/* ----- a versão adaptada de um item ----- */
// COMO A PROVA ADAPTADA FUNCIONA, e por que ela precisava disto.
//
// O sistema não gera a prova de inclusão sozinho: cada item declara em que
// versão entra, no campo “Versão”. `ambas` põe o MESMO item — a mesma redação,
// palavra por palavra — nas duas provas. Foi assim que praticamente todos os
// itens foram cadastrados, e é por isso que “ajustar um item só na adaptada”
// não tinha como funcionar: não existia um item adaptado para ajustar.
//
// Adaptar cria um item novo, cópia do original, que vale só na adaptada e é
// editável à vontade — enunciado mais curto, alternativa sem duplo sentido,
// figura com mais contraste. O original passa a valer só na regular, senão ele
// e a cópia sairiam os dois na prova de inclusão. Os dois ficam ligados pelo
// campo `derivadoDe`, e cada um segue o fluxo de revisão por conta própria.
const itemAdaptadoDe = id => S.itens.find(i => i.derivadoDe === id) || null;
const itemOriginalDe = item => item?.derivadoDe ? (S.itens.find(i => i.id === item.derivadoDe) || null) : null;
// Quem adapta: quem escreveu o item e as duas coordenações. É a mesma gente que
// pode escrever item para aquele texto — a cópia nasce como rascunho e volta
// para o fluxo, então adaptar não passa por cima de aprovação nenhuma.
const podeAdaptar = item => !!item?.id && item.versao !== 'adaptada' &&
  !itemAdaptadoDe(item.id) && (souEu(item) || ehQualquerCoord());

ACOES['it-adaptar'] = async () => {
  const gravado = rasc?.id ? S.itens.find(i => i.id === rasc.id) : null;
  if (!gravado || !podeAdaptar(gravado)) return;
  // Se quem está adaptando também pode editar, o que está na tela é gravado
  // antes — senão a cópia sairia do banco e as alterações abertas se perderiam.
  // Gravado e ESPERADO: criar a cópia de um item que o banco acabou de recusar
  // deixaria as duas versões em desacordo, e a adaptada é a que vai à prova de
  // inclusão.
  if (podeEditarItem(gravado) && !await salvarItem({ mensagem: null, fechar: false })) return;
  const base = S.itens.find(i => i.id === gravado.id);
  const copia = JSON.parse(JSON.stringify(base));
  copia.id = uid();
  copia.versao = 'adaptada';
  copia.derivadoDe = base.id;
  copia.status = 'rascunho';
  copia.comentarios = [];
  copia.adaptadoPor = S.perfil.nome;
  // As figuras são referências ao mesmo arquivo no bucket, e é o que se quer:
  // a cópia começa com a figura do original e quem adapta troca se precisar.
  S.itens.push(copia);
  // O original deixa a prova adaptada para a cópia.
  if (base.versao === 'ambas') { base.versao = 'regular'; PERS.item(base); }
  PERS.item(copia);
  rasc = JSON.parse(JSON.stringify(copia));
  erroDoItem = null;
  commit();
  dlgItem();
  toast('Versão adaptada criada. Ajuste o que precisar e envie para a revisão.');
};
ACOES['it-ver-par'] = d => {
  const outro = S.itens.find(i => i.id === d.id);
  if (!outro) return;
  rasc = JSON.parse(JSON.stringify(outro));
  if (!rasc.opcoes || rasc.opcoes.length < 4) rasc.opcoes = ['', '', '', ''];
  abrirItemComFiguras();
};

// A faixa que explica, dentro do item, em que versão ele está e onde está o par.
function htmlVinculoDaVersao(item) {
  const original = itemOriginalDe(item);
  if (original)
    return `<div class="cartao vinculo-versao" style="margin:0 0 14px">
      <p><b>Versão adaptada</b> (prova de inclusão) de um item da prova regular${
        item.adaptadoPor ? `, feita por ${esc(item.adaptadoPor)}` : ''}. Ela é independente:
        o que você mudar aqui não muda o item regular.
        <button class="btn mini fantasma" data-acao="it-ver-par" data-id="${esc(original.id)}">Abrir o item regular</button></p></div>`;
  const adaptado = item.id ? itemAdaptadoDe(item.id) : null;
  if (adaptado)
    return `<div class="cartao vinculo-versao" style="margin:0 0 14px">
      <p>Este item tem uma <b>versão adaptada</b> própria${
        adaptado.status !== 'aprovado' ? ` (${esc(STATUS_ITEM[adaptado.status].rot.toLowerCase())})` : ''},
        e por isso vale só para a prova regular.
        <button class="btn mini fantasma" data-acao="it-ver-par" data-id="${esc(adaptado.id)}">Abrir a versão adaptada</button></p></div>`;
  if (item.versao === 'ambas' && item.id)
    return `<div class="cartao vinculo-versao neutro" style="margin:0 0 14px">
      <p>Este item sai <b>igual</b> nas duas provas, a regular e a adaptada. Se a prova de inclusão pedir
        um ajuste — enunciado mais curto, outra figura —, crie uma versão adaptada: ela nasce como cópia
        deste item e passa a ser editável por conta própria.
        ${podeAdaptar(item) ? '<button class="btn mini" data-acao="it-adaptar">Criar versão adaptada</button>' : ''}</p></div>`;
  return '';
}

// As figuras do texto-base e do item aparecem dentro do editor, então elas
// precisam de endereço assinado aqui também — não só na montagem do caderno.
// Abre o diálogo na hora e remonta quando os endereços chegarem: esperar a rede
// para só então abrir faria o clique parecer perdido.
function abrirItemComFiguras() {
  erroDoItem = null;          // item novo na tela, recusa velha não acompanha
  dlgItem();
  if (!modoNuvem) return;
  const listas = [S.textos.find(t => t.id === rasc.textoId)?.imagens,
                  rasc.imagens, ...(rasc.imagensOpcoes || [])];
  if (!listas.some(l => todasAsImagens(l).length)) return;
  prepararImagens(listas).then(() => { if ($('#dlg').open && rasc) dlgItem(); });
}

ACOES['novo-item'] = d => {
  if (!textosAprovados().length) {
    toast(`A prova de ${provaAtual()?.serie || 'esta série'} ainda não tem texto-base aprovado.`); return;
  }
  rasc = novoRascunho(d.texto);
  abrirItemComFiguras();
};
ACOES['abrir-item'] = d => {
  const i = S.itens.find(x => x.id === d.id);
  rasc = JSON.parse(JSON.stringify(i));
  if (!rasc.opcoes || rasc.opcoes.length < 4) rasc.opcoes = ['', '', '', ''];
  abrirItemComFiguras();
};

function faixaLinhas(ref) {
  const m = String(ref || '').match(/(\d+)\s*[-–a]\s*(\d+)/);
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  const um = String(ref || '').match(/(\d+)/);
  return um ? [parseInt(um[1], 10), parseInt(um[1], 10)] : null;
}

/* ---------------- o que mudou neste item ----------------
   O relato: “o Paulo segue sem conseguir ver as alterações feitas nos itens da
   professora Fernanda”. Não era acesso — a conta dele não levou um 4xx sequer
   em 480 requisições. É que não havia o que ver: o item guardava o estado
   ATUAL e mais nada. Quem revisa 336 itens abria um pela segunda vez sem
   nenhuma forma de saber o que tinha mudado desde a primeira, nem quem mudou.
   O fio de comentários só registra o que alguém resolveu escrever à mão.

   O histórico é escrito por gatilho no banco (migração 0017), não pelo cliente:
   assim ele não se falsifica, e vale para toda porta de gravação — o diálogo do
   item, a revisão na página do caderno, a adaptação — inclusive as que vierem
   depois. Guarda as doze últimas alterações e o valor ANTERIOR de cada campo
   mexido, que é o que responde “como estava antes?”. */
const ROTULO_CAMPO = {
  enunciado: 'enunciado', opcoes: 'alternativas', gabarito: 'gabarito', tipo: 'tipo de item',
  versao: 'versão da prova', componente: 'componente', habilidade: 'habilidade',
  grupo: 'grupo de habilidades', linhasRef: 'linhas de referência',
  dLinhas: 'linhas de resposta', dPauta: 'espaço de resposta', textoId: 'texto-base',
  status: 'etapa da revisão', imagens: 'figuras', imagensOpcoes: 'figuras das alternativas'
};

// Como um valor guardado se lê na tela. Texto rico sai desenhado; o resto sai
// pelo que é — status pelo rótulo do fluxo, lista pela contagem.
function valorDoHistorico(campo, v) {
  if (v === null || v === undefined) return '<i>(vazio)</i>';
  if (campo === 'status') return esc(STATUS_ITEM[v]?.rot || String(v));
  if (campo === 'textoId') {
    const t = S.textos.find(x => x.id === v);
    return t ? `Texto ${t.numero} — ${esc(String(t.titulo).slice(0, 40))}` : esc(String(v));
  }
  if (Array.isArray(v)) {
    if (campo === 'opcoes') return v.map((o, i) => `<b>${'ABCD'[i]}</b> ${rico(o)}`).join('<br>');
    return `${v.length} ${v.length === 1 ? 'figura' : 'figuras'}`;
  }
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'string') return rico(v) || '<i>(vazio)</i>';
  return esc(String(v));
}

function htmlHistoricoDoItem(item) {
  const h = Array.isArray(item?.historico) ? item.historico : [];
  const espera = item?.aguardaLeituraFinal;
  const aviso = espera ? `
    <div class="cartao aviso rev-pendente" style="margin:0 0 10px">
      <p style="font-size:13px;margin:0"><b>Aguardando a última leitura.</b>
        ${esc(espera.por || 'A coordenação de área')} ajustou ${esc(espera.campo || 'o item')} na leitura final
        do caderno${espera.quando ? ` (${esc(espera.quando)})` : ''}, e o item está esperando a conferência da
        coordenação pedagógica.
        ${ehCoord() && item.id ? `<button class="btn mini verde" data-acao="it-leitura-ok" data-id="${esc(item.id)}"
          style="margin-left:6px">Dar a leitura por concluída</button>` : ''}</p>
    </div>` : '';
  if (!h.length) return aviso;

  const linhas = h.slice().reverse().map((e, n) => {
    const campos = (e.campos || []).map(c => ROTULO_CAMPO[c] || c);
    const antes = Object.entries(e.antes || {}).map(([c, v]) =>
      `<div class="hist-antes"><span>${esc(ROTULO_CAMPO[c] || c)}, antes:</span>
        <div>${valorDoHistorico(c, v)}</div></div>`).join('');
    return `<li${n === 0 ? ' class="ultima"' : ''}>
      <div class="hist-cab"><b>${esc(e.quem || '—')}</b>
        <span class="hist-papel">${esc(e.papel || '')}</span>
        <span class="hist-quando">${esc(e.quando || '')}</span></div>
      <div class="hist-campos">mexeu em ${esc(campos.join(', ') || '—')}</div>
      ${antes ? `<details class="hist-det"><summary>como estava</summary>${antes}</details>` : ''}
    </li>`;
  }).join('');

  return `${aviso}
    <h3 style="font-size:12.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-2);margin:16px 0 10px">
      O que mudou neste item</h3>
    <ol class="historico">${linhas}</ol>
    <p class="hist-nota">Registrado pelo próprio banco a cada gravação, com as doze alterações mais recentes.
      Só mudança de conteúdo entra — reordenar o item na prova, não.</p>`;
}

ACOES['it-leitura-ok'] = async d => {
  const item = S.itens.find(i => i.id === d.id);
  if (!item || !ehCoord()) return;
  if (modoNuvem) {
    try { await nuvem.confirmarLeituraFinal(item.id); }
    catch (e) { toast('⚠ ' + (e?.message || e)); return; }
  }
  delete item.aguardaLeituraFinal;
  if (rasc && rasc.id === item.id) delete rasc.aguardaLeituraFinal;
  save(S);
  if ($('#dlg').open && rasc?.id === item.id) dlgItem(); else render();
  toast('Leitura confirmada — o item sai da sua lista de releitura.');
};

function dlgItem() {
  const t = S.textos.find(x => x.id === rasc.textoId);
  const st = STATUS_ITEM[rasc.status];
  // Item de outra pessoa abre para leitura: os campos vêm sem edição e o
  // rodapé, sem “Salvar”. O fio da revisão continua aberto — comentar é como
  // se pede um ajuste a quem escreveu.
  const editavel = podeEditarItem(rasc);
  const trava = editavel ? '' : ' disabled';
  const fx = faixaLinhas(rasc.linhasRef);
  const linhasTx = (t?.linhas || []).map((l, i) => {
    const n = i + 1;
    const marca = fx && n >= fx[0] && n <= fx[1] ? ' mark' : '';
    return `<div class="linha-tx${marca}"><span class="n">${n}</span><span>${rico(l)}</span></div>`;
  }).join('');
  // O texto-base pode ser a própria figura — obra de arte, charge, mapa. Quem
  // escreve o item precisa dela na frente, do mesmo jeito que precisa das linhas.
  const figsTexto = todasAsImagens(t?.imagens);
  const figurasTx = figsTexto.length
    ? `<div class="painel-texto-figs">${htmlEditorImagens(figsTexto, { campo: 'texto', modoNuvem, soLeitura: true })}</div>`
    : '';
  // Só os textos da prova do item: mover um item para o texto de outra série
  // quebraria a numeração das duas.
  const opsTexto = textosAprovados(rasc.provaId).map(x =>
    `<option value="${x.id}" ${x.id === rasc.textoId ? 'selected' : ''}>Texto ${x.numero} — ${esc(x.titulo.slice(0, 48))}</option>`).join('');
  const opsComp = opcoesComponente(rasc.componente);

  const segTipo = Object.keys(TIPOS).map(tp =>
    `<button class="${rasc.tipo === tp ? 'sel' : ''}" data-acao="it-tipo" data-v="${tp}" title="${TIPOS[tp].rotulo}"${trava}>${tp}</button>`).join('');
  const segGrupo = GRUPOS.map(g =>
    `<button class="${rasc.grupo === g ? 'sel' : ''}" data-acao="it-grupo" data-v="${g}"${trava}>${g}</button>`).join('');
  // Um item que tem versão adaptada própria não volta a “ambas”: as duas
  // sairiam juntas na prova de inclusão. O mesmo vale para a cópia — ela é da
  // adaptada, e é isso que a distingue do original.
  const par = rasc.id ? itemAdaptadoDe(rasc.id) : null;
  const versaoPresa = v => (par && v === 'ambas') || (rasc.derivadoDe && v !== 'adaptada');
  const segVersao = ['regular', 'adaptada', 'ambas'].map(v =>
    `<button class="${rasc.versao === v ? 'sel' : ''}" data-acao="it-versao" data-v="${v}" style="text-transform:capitalize"${
      trava || versaoPresa(v) ? ' disabled' : ''}${versaoPresa(v)
        ? ` title="${par ? 'Este item já tem uma versão adaptada própria' : 'Esta é a versão adaptada de outro item'}"` : ''}>${v}</button>`).join('');

  let respostaHtml = '';
  if (rasc.tipo === 'B') {
    respostaHtml = `<div class="form-linha"><div${marcaDoCampo('gabarito')}><label>Gabarito</label>
      <input class="caixa" style="width:110px;font-family:var(--mono)" maxlength="3" inputmode="numeric"
        data-mud="it-campo" data-campo="gabarito" value="${esc(rasc.gabarito)}" placeholder="000–999"${trava}>
      ${avisoDoCampo('gabarito')}</div></div>`;
  } else if (rasc.tipo === 'D') {
    respostaHtml = `
      <div class="campo" style="margin-bottom:12px"><label>Resposta esperada (guia de correção)</label>
        ${editorRico({ campo: 'gabarito', valor: rasc.gabarito || '', linhas: 3, soLeitura: !editavel,
                       rotulo: 'O que se espera na resposta construída do estudante' })}</div>
      <div class="form-linha">
        <div${marcaDoCampo('dLinhas')} style="flex:0;min-width:160px"><label>Linhas de resposta</label>
          <input class="caixa" type="number" min="1" max="40" data-mud="it-dlinhas" value="${rasc.dLinhas ?? 10}"${trava}>
          ${avisoDoCampo('dLinhas')}</div>
        <div class="campo" style="flex:0"><label>Espaço de resposta</label>
          <div class="seg">
            <button class="${rasc.dPauta !== false ? 'sel' : ''}" data-acao="it-dpauta" data-v="1"${trava}>Com linhas</button>
            <button class="${rasc.dPauta === false ? 'sel' : ''}" data-acao="it-dpauta" data-v="0"${trava}>Sem linhas</button>
          </div></div>
      </div>
      <p style="font-size:12px;color:var(--ink-2);margin:0 0 12px">Mesmo sem linhas impressas, a quantidade define o espaço reservado à resposta no caderno. Itens discursivos não entram no cartão-resposta — a nota (0 a 10) é lançada na tela de Correção pelo docente responsável.</p>`;
  } else {
    respostaHtml = `<div class="form-linha"><div class="campo"><label>Gabarito</label><div>` +
      TIPOS[rasc.tipo].respostas.map(r =>
        `<button class="gab-op ${String(rasc.gabarito).toUpperCase() === r ? 'certo' : ''}" data-acao="it-gab" data-v="${r}"${trava}>${r}</button>`).join('') +
      `</div></div></div>`;
  }
  // Cada alternativa carrega as suas figuras: em Matemática e em Artes a opção
  // É a imagem — quatro gráficos, quatro obras, quatro estruturas. Uma figura
  // única no item não dá conta disso, porque ela sai antes das opções.
  const opcoesHtml = rasc.tipo === 'C' ? `
    <div class="campo" style="margin-bottom:12px"><label>Opções (A a D)</label>
      ${['A', 'B', 'C', 'D'].map((L, i) => `
        <div class="it-opcao">
          <b>${L}</b>
          <div class="it-opcao-corpo">
            ${editorRico({ campo: 'opcao', i, valor: rasc.opcoes[i] || '', linhas: 1,
                           rotulo: 'Opção ' + L, soLeitura: !editavel })}
            ${htmlEditorImagens(rasc.imagensOpcoes?.[i], {
              campo: 'opcao' + i, modoNuvem, soLeitura: !editavel, compacto: true,
              rotuloAdd: '+ Figura da opção ' + L })}
          </div>
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
    <button class="btn fantasma" data-acao="previa-item"
      title="Ver o bloco diagramado como sai no caderno impresso">👁 Como sai na prova</button>
    <button class="btn fantasma" data-acao="fechar-dlg">Fechar</button>
    ${editavel ? '<button class="btn" data-acao="it-salvar" title="Guarda as alterações e mantém o item onde está">Salvar</button>' : ''}
    ${acoes.map(a => `<button class="btn ${a.cls}" data-acao="${a.acao}">
      ${esc(a.rot)}<small class="pe-dica">${esc(a.dica)}</small></button>`).join('')}`;

  // Por que este item está travado — dito na hora, para não parecer defeito.
  const avisoLeitura = editavel ? '' : `
    <div class="cartao aviso" style="margin:0 0 14px">
      <p style="font-size:13px;margin:0">${meuItem
        ? 'Este item já foi <b>aprovado</b>: o conteúdo dele está fechado, e só a coordenação geral ainda o altera. Peça o ajuste no fio da revisão, aqui embaixo.'
        : `Este item é de <b>${esc(rasc.autor || 'outra pessoa')}</b>, e por isso abre para leitura.
           Se algo precisa mudar, escreva no fio da revisão — quem escreveu recebe o recado no item.`}</p>
    </div>`;

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
            ${figurasTx}
            <div style="margin-top:10px;font-size:11.5px;color:var(--ink-2)">${linhasTx
              ? '💡 As linhas destacadas em amarelo são a referência deste item.'
              : '💡 Este texto-base é a figura acima — escreva o item a partir dela.'}</div>
          </div>
        </div>
        <div>
          ${avisoLeitura}
          <div class="form-linha">
            <div class="campo" style="min-width:220px"><label>Texto-base</label>
              <select class="caixa" data-mud="it-texto"${trava}>${opsTexto}</select></div>
            <div class="campo"><label>Linhas de referência</label>
              <input class="caixa" data-mud="it-campo" data-campo="linhasRef" value="${esc(rasc.linhasRef)}" placeholder="ex.: 5-7"${trava}></div>
          </div>
          <div class="form-linha">
            <div class="campo" style="flex:0"><label>Tipo</label><div class="seg">${segTipo}</div></div>
            <div class="campo"><label>Componente</label><select class="caixa" data-mud="it-campo" data-campo="componente"${trava}>${opsComp}</select></div>
          </div>
          <div class="form-linha">
            <div class="campo" style="flex:1 1 100%"><label>Versão da prova em que este item entra</label>
              <div class="seg">${segVersao}</div></div>
          </div>
          ${htmlVinculoDaVersao(rasc)}
          <div class="form-linha">
            <div class="campo"><label>Habilidade</label>
              <input class="caixa" data-mud="it-campo" data-campo="habilidade" value="${esc(rasc.habilidade)}" placeholder="ex.: H6 — Inferências"${trava}></div>
          </div>
          <div class="form-linha">
            <div class="campo" style="flex:1 1 100%"><label>Grupo de habilidades</label>
              <div class="seg">${segGrupo}</div></div>
          </div>
          <div${marcaDoCampo('enunciado')} style="margin-bottom:12px"><label>Enunciado</label>
            ${editorRico({ campo: 'enunciado', valor: rasc.enunciado, linhas: 4,
                           rotulo: 'Enunciado do item', soLeitura: !editavel })}
            ${avisoDoCampo('enunciado')}
            ${editavel ? `<p class="rico-ajuda">Fórmula entre <code>$…$</code> na linha e <code>$$…$$</code> em
              destaque, na notação do LaTeX — <code>$\\frac{1}{2}$</code>, <code>$x^2$</code>,
              <code>$\\sqrt{3}$</code>, <code>$30^\\circ$</code>. A prévia mostra como sai impresso.
              Valor em real não vira fórmula: “R$ 50,00” continua sendo R$ 50,00.</p>` : ''}</div>
          <div class="campo" style="margin-bottom:12px"><label>Figuras do enunciado</label>
            ${htmlEditorImagens(rasc.imagens, { campo: 'item', modoNuvem, soLeitura: !editavel })}
            <p style="font-size:12px;color:var(--ink-2);margin:6px 0 0">Figura de geometria, estrutura química,
              gráfico. Sai no caderno depois do enunciado${rasc.tipo === 'C' ? ' e antes das opções — a figura que pertence a uma <b>alternativa</b> vai no campo dela, logo abaixo' : ''}.</p></div>
          ${opcoesHtml}${respostaHtml}

          ${htmlHistoricoDoItem(rasc)}

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

// Recolhe da tela para `rasc` antes de remontar, pelo mesmo motivo de
// `recolherCamposDoTexto`: os campos avisam no `change`, que só acontece quando
// o campo perde o foco. Quem digita a habilidade e clica direto em “+ Figura”
// depende de o navegador disparar esse blur na ordem certa — e não é preciso
// depender: aqui a leitura é explícita.
function recolherCamposDoItem() {
  if (!rasc) return;
  for (const el of $$('[data-mud="it-campo"]')) rasc[el.dataset.campo] = el.value;
  const dl = $('[data-mud="it-dlinhas"]');
  if (dl) rasc.dLinhas = Math.max(1, Math.min(40, parseInt(dl.value, 10) || 10));
  for (const area of $$('[data-rico-campo]')) {
    const campo = area.dataset.ricoCampo, valor = valorDoEditorRico(area);
    if (campo === 'opcao') rasc.opcoes[Number(area.dataset.ricoI)] = valor;
    else if (campo === 'enunciado' || campo === 'gabarito') rasc[campo] = valor;
  }
}
// Toda mudança que remonta o diálogo passa por aqui, e nesta ordem: primeiro o
// que está na tela vai para `rasc`, só então a mudança é aplicada. O inverso
// perderia a alteração — o gabarito recém-ajustado pelo tipo novo seria
// sobrescrito pelo campo do tipo antigo, que ainda está na tela.
function mexerNoItem(mudar) {
  recolherCamposDoItem();
  mudar();
  dlgItem();
}
function reabrirDlgItem() { dlgItem(); }
MUDS['it-texto'] = (d, el) => mexerNoItem(() => { rasc.textoId = el.value; });
MUDS['it-campo'] = (d, el) => {
  rasc[el.dataset.campo] = el.value;
  // A faixa de linhas destacada no painel do texto depende deste campo, então
  // ele — e só ele — remonta o diálogo.
  if (el.dataset.campo === 'linhasRef') mexerNoItem(() => {});
};
MUDS['it-dlinhas'] = (d, el) => { rasc.dLinhas = Math.max(1, Math.min(40, parseInt(el.value, 10) || 10)); };

// Enunciado, opções e resposta esperada são editores ricos (js/rico.js), não
// <textarea>: recebem ênfase e notação matemática. O aviso de mudança NÃO
// chama `commit()` nem remonta o diálogo — remontar destruiria o cursor a cada
// tecla, o mesmo motivo já documentado em `alocacaoMudou()`.
// Onde as figuras em edição vivem, por campo — o texto-base as tem em
// `rascTexto`, o item em `rasc`, e cada alternativa do tipo C tem a sua própria
// lista (`opcao0`…`opcao3`), guardada em `rasc.imagensOpcoes[i]`.
function listaDeImagens(campo) {
  if (campo === 'item') return (rasc.imagens = rasc.imagens || []);
  const op = /^opcao(\d)$/.exec(campo || '');
  if (op) {
    rasc.imagensOpcoes = rasc.imagensOpcoes || [[], [], [], []];
    const i = Number(op[1]);
    return (rasc.imagensOpcoes[i] = rasc.imagensOpcoes[i] || []);
  }
  return (rascTexto.imagens = rascTexto.imagens || []);
}

ligarEditoresRicos((campo, i, valor) => {
  if (campo === 'txCorpo') { if (rascTexto) rascTexto.corpo = valor; return; }
  if (!rasc) return;
  if (campo === 'opcao') rasc.opcoes[Number(i)] = valor;
  else if (campo === 'enunciado' || campo === 'gabarito') rasc[campo] = valor;
},
// A prévia do corpo do texto-base é a divisão em parágrafos, que é regra do
// caderno; os demais campos seguem com a prévia padrão (a da fórmula).
(campo, valor) => campo === 'txCorpo'
  ? htmlPreviaDoCorpo(valor, rascTexto?.formato || 'prosa')
  : null);
/* ---------------- figuras: envio, ajuste e remoção ---------------- */
// Reabre o formulário em que a figura está, para a tira de miniaturas
// acompanhar. Antes de remontar, o que está na tela vai para a cópia de
// trabalho: é ela que o desenho seguinte lê.
function reabrirFormularioDe(campo) {
  if (campo === 'item' || /^opcao\d$/.test(campo || '')) { mexerNoItem(() => {}); return; }
  recolherCamposDoTexto();
  dlgTexto(null, { preservar: true });
}

MUDS['img-arquivo'] = async (d, el) => {
  const arquivo = el.files?.[0];
  if (!arquivo) return;
  el.value = '';                       // permite escolher o mesmo arquivo de novo
  const lista = listaDeImagens(d.campo);
  toast('Enviando a figura…');
  try {
    const img = await guardarImagem(arquivo, {
      modoNuvem, provaId: idProvaAtual(),
      dono: d.campo === 'texto' ? 'textos' : 'itens', uid
    });
    // Assina a recém-enviada antes de remontar. Sem isto a miniatura aparecia
    // como “sem prévia” até alguém abrir o caderno — quem acabou de enviar a
    // figura lia isso como envio que falhou, e mandava de novo.
    await prepararImagens([[img]]);
    lista.push(img);
    reabrirFormularioDe(d.campo);
    toast(`Figura de ${img.largura}×${img.altura} acrescentada.`);
  } catch (e) {
    // O motivo importa: formato, tamanho ou falha de rede pedem providências
    // diferentes de quem está escrevendo.
    toast('⚠ ' + (e.message || e));
  }
};

MUDS['img-legenda'] = (d, el) => { const i = listaDeImagens(d.campo)[+d.i]; if (i) i.legenda = el.value; };
MUDS['img-fonte']   = (d, el) => { const i = listaDeImagens(d.campo)[+d.i]; if (i) i.fonte = el.value; };
MUDS['img-escala']  = (d, el) => {
  const i = listaDeImagens(d.campo)[+d.i];
  if (!i) return;
  i.escala = parseInt(el.value, 10) || 100;
  reabrirFormularioDe(d.campo);        // a miniatura mostra o tamanho escolhido
};

ACOES['img-remover'] = async d => {
  const lista = listaDeImagens(d.campo);
  const [fora] = lista.splice(+d.i, 1);
  reabrirFormularioDe(d.campo);
  // Só apaga do bucket depois de a figura sair do registro: arquivo órfão é
  // lixo, registro apontando para arquivo apagado é figura quebrada no caderno.
  await descartarImagem(fora);
  toast('Figura removida.');
};

ACOES['it-tipo'] = d => mexerNoItem(() => {
  rasc.tipo = d.v;
  if (d.v === 'B') rasc.gabarito = /^\d{1,3}$/.test(String(rasc.gabarito)) ? rasc.gabarito : '';
  else if (d.v === 'D') {
    rasc.dLinhas = rasc.dLinhas ?? 10;
    rasc.dPauta = rasc.dPauta ?? true;
    if (/^[A-E]$/.test(String(rasc.gabarito).toUpperCase())) rasc.gabarito = '';
  } else {
    rasc.gabarito = TIPOS[d.v].respostas.includes(String(rasc.gabarito).toUpperCase()) ? rasc.gabarito : TIPOS[d.v].respostas[0];
  }
});
ACOES['it-dpauta'] = d => mexerNoItem(() => { rasc.dPauta = d.v === '1'; });
ACOES['it-grupo'] = d => mexerNoItem(() => { rasc.grupo = d.v; });
ACOES['it-versao'] = d => mexerNoItem(() => { rasc.versao = d.v; });
ACOES['it-gab'] = d => mexerNoItem(() => { rasc.gabarito = d.v; });

// A recusa do “Salvar” tem de ficar VISÍVEL, e no lugar certo.
//
// Um toast não bastava por duas razões, e as duas apareceram no mesmo relato.
// A primeira é que ele nem chegava à tela (ver `toast`). A segunda é que, mesmo
// chegando, ele dura poucos segundos no canto de baixo, enquanto o diálogo do
// item tem duas colunas e rola por três telas — quem está mexendo nas
// alternativas não olha para o enunciado, que é onde está o problema.
//
// Então a recusa faz três coisas: diz o motivo (agora visível), MARCA o campo
// que a causou, e leva a pessoa até ele. A marca fica até o problema ser
// resolvido — ela não é um aviso de passagem, é o estado do formulário.
let erroDoItem = null;   // { campo, msg }

function recusarItem(campo, msg) {
  erroDoItem = { campo, msg };
  // Nesta ordem: remontar o diálogo devolve o aviso ao corpo da página (ver
  // `abrirDlg`), então ele é dito DEPOIS, já com o diálogo novo de pé.
  dlgItem();
  toast(msg);
  const alvo = $(`[data-erro-campo="${campo}"]`);
  if (alvo) {
    alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
    (alvo.querySelector('.rico-area, input, select') || alvo).focus?.({ preventScroll: true });
  }
  return false;
}

// O aviso desenhado ao pé do campo, quando é ele o recusado.
const avisoDoCampo = campo => erroDoItem?.campo === campo
  ? `<p class="campo-erro">⚠ ${esc(erroDoItem.msg)}</p>` : '';
const marcaDoCampo = campo =>
  ` data-erro-campo="${campo}"${erroDoItem?.campo === campo ? ' class="campo com-erro"' : ' class="campo"'}`;

function persistirRascunho() {
  // Primeiro o que está na TELA vai para a cópia de trabalho.
  //
  // Faltava esta linha, e ela é a mesma lição que `recolherCamposDoTexto()`
  // aprendeu no formulário do texto-base: o `change` de um <input> só dispara
  // quando o campo perde o foco, e não dá para contar com essa ordem. Habilidade,
  // linhas de referência, componente, gabarito do tipo B e a quantidade de
  // linhas do discursivo vivem em <input> comum — quem digitava num deles e
  // clicava direto em “Salvar” podia ver o diálogo fechar dizendo “Item salvo”
  // com o valor antigo gravado. Todas as outras ações do editor já passavam por
  // `mexerNoItem()`, que recolhe antes; só a gravação não passava.
  recolherCamposDoItem();
  // Última barreira antes de gravar. A tela já esconde “Salvar” de quem não
  // edita este item, mas a checagem mora aqui também porque as ações de fluxo
  // (`it-devolver`, `it-aprovar`) passam por aqui: quem só decide a etapa de um
  // item alheio não deve levar junto uma alteração de conteúdo.
  //
  // A permissão é medida pelo item COMO ESTÁ GRAVADO. As ações de fluxo já
  // mexeram em `rasc.status` quando chegam aqui, e medir pelo estado novo
  // tiraria o direito de quem acabou de exercê-lo — a coordenação de área
  // revisa e aprova na mesma janela, e o item sai de “área” na mesma ação.
  const gravado = rasc.id ? S.itens.find(i => i.id === rasc.id) : null;
  if (gravado && !podeEditarItem(gravado))
    rasc = { ...gravado, status: rasc.status, comentarios: rasc.comentarios };
  // Enunciado agora é HTML: “vazio” pode ser <br> ou espaço inquebrável, e
  // `ricoVazio()` olha o texto por baixo da marcação.
  if (ricoVazio(rasc.enunciado))
    return recusarItem('enunciado', 'O enunciado não pode ficar em branco: é o comando do item, a pergunta que vem antes das alternativas.');
  if (rasc.tipo === 'B' && !/^\d{1,3}$/.test(String(rasc.gabarito).trim()))
    return recusarItem('gabarito', 'Gabarito do tipo B: um número de 0 a 999.');
  if (rasc.tipo === 'D' && !(rasc.dLinhas >= 1))
    return recusarItem('dLinhas', 'Informe a quantidade de linhas de resposta do item discursivo.');
  erroDoItem = null;
  // Quatro listas vazias em todo item seriam ruído gravado linha a linha: o
  // campo só existe quando alguma alternativa tem figura.
  if (rasc.imagensOpcoes && !rasc.imagensOpcoes.some(l => todasAsImagens(l).length))
    delete rasc.imagensOpcoes;
  if (!rasc.id) { rasc.id = uid(); S.itens.push(rasc); }
  else {
    const idx = S.itens.findIndex(i => i.id === rasc.id);
    S.itens[idx] = rasc;
  }
  return true;
}

// Guarda o item e SÓ ENTÃO fecha o diálogo, anuncia e segue.
//
// Antes, a gravação na nuvem saía por conta própria (`PERS.item()`, com
// `.catch` num toast): o diálogo fechava dizendo “Item salvo”, e a recusa do
// banco chegava segundos depois, sozinha na tela, sem dizer de que item falava.
// Tela e banco divergiam em silêncio — quem editava lia “salvo”, recarregava no
// dia seguinte e encontrava o item como estava. Foi assim que a coordenação de
// área passou semanas sem conseguir aprovar nada sem saber por quê (o motivo
// era a política de INSERT; ver a migração 0014).
//
// Agora a promessa é esperada. Se o banco recusar, o item volta ao que era no
// estado local — a tela não pode afirmar o que o banco negou —, o diálogo
// continua aberto com o trabalho todo na tela, e o motivo aparece escrito.
async function salvarItem({ mensagem, statusNovo = null, fechar = true } = {}) {
  const statusAnterior = rasc.status;
  if (statusNovo) rasc.status = statusNovo;
  const antes = rasc.id ? S.itens.find(i => i.id === rasc.id) : null;
  const copia = antes ? JSON.parse(JSON.stringify(antes)) : null;
  const eraNovo = !rasc.id;
  if (!persistirRascunho()) { rasc.status = statusAnterior; return false; }

  const erro = await PERS.itemAgora(rasc);
  if (erro) {
    if (copia) S.itens[S.itens.findIndex(i => i.id === copia.id)] = copia;
    else { S.itens = S.itens.filter(i => i.id !== rasc.id); if (eraNovo) rasc.id = null; }
    rasc.status = statusAnterior;
    save(S);
    toast('⚠ O banco recusou a gravação: ' + erro);
    dlgItem();                 // redesenha com o que estava sendo editado
    return false;
  }
  if (fechar) $('#dlg').close();
  commit();
  if (mensagem) toast(mensagem);
  return true;
}

ACOES['it-salvar'] = () => salvarItem({ mensagem: 'Item salvo.' });
ACOES['it-enviar'] = () => salvarItem({
  statusNovo: 'area', mensagem: 'Item enviado à coordenação de área.' });
ACOES['it-aprovar-area'] = () => salvarItem({
  statusNovo: 'geral', mensagem: 'Item aprovado na área — segue para a coordenação geral.' });
ACOES['it-aprovar'] = () => salvarItem({
  statusNovo: 'aprovado', mensagem: 'Item aprovado! Ele já entra no caderno e no cartão.' });
ACOES['it-devolver'] = () => salvarItem({
  statusNovo: 'devolvido', mensagem: 'Item devolvido ao docente com ajustes.' });
ACOES['it-reabrir'] = () => salvarItem({
  statusNovo: 'area', mensagem: 'Revisão reaberta.' });

const meuPapelNoFio = () => ehCoord() ? 'coordenação geral'
  : ehCoordArea() ? `coord. de área (${S.perfil.area || ''})`
  : ehRedacao() ? 'redação'
  : `docente (${S.perfil.componente || ''})`;

// Comentar tem caminho próprio, e não é a gravação do item.
//
// O sistema promete em três lugares que a conversa da revisão é de todos —
// `podeEditarItem()` diz isso em comentário, o campo “Escreva um comentário…”
// aparece para quem quer que abra o item, e o aviso do item travado manda
// justamente escrever no fio. O banco recusava: o comentário ia junto com o
// item inteiro, e a política de escrita de `itens` responde por quem pode mexer
// no CONTEÚDO. Um docente comentando no item de um colega levava 403, e até a
// migração 0014 isso sumia em silêncio.
//
// Agora o recado vai pela função `comentar_item` (migração 0016), que só sabe
// acrescentar ao fio e assina com o nome e o papel que estão em `equipe`. Fora
// do modo nuvem não há banco, e o comentário é montado aqui mesmo.
ACOES['it-comentar'] = async (d, botao) => {
  const inp = $('#it-novo-coment');
  const txt = inp.value.trim();
  if (!txt) return;

  if (!modoNuvem || !rasc.id) {
    rasc.comentarios = rasc.comentarios || [];
    rasc.comentarios.push({ autor: S.perfil.nome, papel: meuPapelNoFio(), quando: agora(), texto: txt });
    if (rasc.id) { const i = S.itens.find(x => x.id === rasc.id); if (i) i.comentarios = rasc.comentarios; save(S); }
    reabrirDlgItem();
    return;
  }

  if (botao) botao.disabled = true;
  try {
    const r = await nuvem.comentarItem(rasc.id, txt);
    // O fio volta do banco inteiro: se alguém comentou enquanto esta janela
    // estava aberta, o recado dessa pessoa aparece junto em vez de ser
    // atropelado pela cópia de trabalho.
    const fio = r?.comentarios || [...(rasc.comentarios || []), r?.comentario].filter(Boolean);
    rasc.comentarios = fio;
    const gravado = S.itens.find(i => i.id === rasc.id);
    if (gravado) gravado.comentarios = fio;
    save(S);
    reabrirDlgItem();
  } catch (e) {
    if (botao) botao.disabled = false;
    toast('⚠ O comentário não foi registrado: ' + (e?.message || e));
  }
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
// A tela mostra também os itens em revisão? Preferência de quem está olhando,
// não estado da prova — por isso vive aqui e não no banco.
let cadComRevisao = false;

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

/* ---------------- como a versão se chama no papel ----------------
   “Adaptada” é palavra de bastidor. Impressa na folha, ela conta ao estudante
   — e a quem estiver sentado ao lado — que aquele caderno é o da prova de
   inclusão, e nenhum dos dois tem o que fazer com essa informação. No papel a
   versão vira código, e o código é neutro: A1 e A2 não dizem qual é qual.

   Os DOIS levam código, inclusive a regular. Se só um trouxesse marca, a marca
   voltaria a apontar para quem a tem — que é exatamente o que se quer evitar.

   Vale só para o impresso. No sistema, no banco, no elenco, na correção e no
   gabarito que vai para o leitor óptico, a versão continua sendo `regular` e
   `adaptada`: quem coordena precisa da palavra, e trocar o dado quebraria o
   contrato do leitor de cartões e o histórico já gravado. */
const CODIGO_DA_VERSAO = { regular: 'A1', adaptada: 'A2' };
const codigoDaVersao = v => CODIGO_DA_VERSAO[v] || CODIGO_DA_VERSAO.regular;

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
        • Este caderno contém <b>${totalItens} ${totalItens === 1 ? 'item' : 'itens'}</b> · versão <b>${codigoDaVersao(versao)}</b>.<br>
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
// `data-rev-*` são as etiquetas da revisão na página (ver `telaCaderno`): elas
// dizem, para cada pedaço de texto impresso, de que item e de que campo ele
// veio. Sem elas não há como voltar do papel para o registro — e voltar é
// justamente o que a revisão final da prova precisa fazer. Não mudam nada do
// que se vê nem do que a régua mede; na impressão são ignoradas.
/* ---------------- o verbo do comando, na prova adaptada ----------------
   Na prova de inclusão o comando precisa saltar aos olhos: quem tem
   dificuldade de leitura perde o "julgue" no meio de três linhas de contexto e
   responde outra coisa. Então, SÓ na versão adaptada, o verbo que abre o
   comando sai em negrito — no enunciado de cada item e na frase do bloco.
   A prova regular não muda: ela segue a diagramação do caderno do PAS.

   A lista é fechada de propósito. Grifar "todo verbo" exigiria análise
   morfológica, erraria e encheria a página de negrito — que é o contrário de
   destacar. São os verbos de comando que a equipe de fato usa, e o casamento
   só vale onde comando começa: no início do trecho, depois de ponto, de
   ponto e vírgula, de dois-pontos, de vírgula ou de travessão. "A análise
   pede que se calcule a área" não é comando e não leva negrito; "…, calcule
   a área" leva. */
const VERBOS_COMANDO = [
  'julgue', 'assinale', 'marque', 'faça', 'responda', 'resolva', 'calcule',
  'determine', 'obtenha', 'encontre', 'estime', 'some', 'subtraia',
  'multiplique', 'divida', 'converta', 'demonstre', 'prove', 'verifique',
  'escreva', 'redija', 'reescreva', 'transcreva', 'complete', 'preencha',
  'explique', 'justifique', 'descreva', 'discuta', 'analise', 'avalie',
  'interprete', 'compare', 'relacione', 'associe', 'classifique', 'ordene',
  'organize', 'identifique', 'indique', 'aponte', 'cite', 'nomeie', 'defina',
  'apresente', 'elabore', 'construa', 'represente', 'esboce', 'trace',
  'desenhe', 'selecione', 'escolha', 'considere', 'observe', 'leia', 'use',
  'utilize', 'conclua', 'estabeleça'
];

// Grupo 1: onde o comando pode começar. Grupo 2: o verbo.
const RE_VERBO_COMANDO = () =>
  new RegExp(`(^\\s*|[.;:,—–]\\s+|\\(\\s*)(${VERBOS_COMANDO.join('|')})\\b`, 'gi');

// Trabalha sobre a árvore, não sobre a string: o HTML que chega aqui já passou
// por `rico()` e leva dentro o desenho do KaTeX, onde uma troca cega de texto
// desmancharia a fórmula. Nós de texto só, e nenhum que já esteja dentro de
// negrito ou de fórmula.
function negritarComandos(html) {
  const cx = document.createElement('div');
  cx.innerHTML = html;
  const passeio = document.createTreeWalker(cx, NodeFilter.SHOW_TEXT);
  const alvos = [];
  while (passeio.nextNode()) {
    const no = passeio.currentNode;
    if (no.parentElement?.closest('b, strong, .katex')) continue;
    if (RE_VERBO_COMANDO().test(no.data)) alvos.push(no);
  }
  for (const no of alvos) {
    const re = RE_VERBO_COMANDO();
    const pedaco = document.createDocumentFragment();
    let lido = 0, achado;
    while ((achado = re.exec(no.data))) {
      const inicio = achado.index + achado[1].length;
      pedaco.append(no.data.slice(lido, inicio));
      const negrito = document.createElement('b');
      negrito.textContent = achado[2];
      pedaco.append(negrito);
      lido = inicio + achado[2].length;
    }
    pedaco.append(no.data.slice(lido));
    no.replaceWith(pedaco);
  }
  return cx.innerHTML;
}

// `versao` chega até aqui porque o negrito é da FOLHA, não do item: um item
// marcado como “ambas” sai igual nas duas provas, e é o caderno adaptado que
// pede o destaque. Ler `item.versao` deixaria de fora justamente esses.
function htmlItem({ item, numero }, versao) {
  const enunciado = versao === 'adaptada'
    ? negritarComandos(rico(item.enunciado)) : rico(item.enunciado);
  const enun = `<span class="pas-enun" data-rev="enunciado">${enunciado}</span>`;
  const marca = item.id ? ` data-rev-item="${esc(item.id)}"` : '';
  // Item que entrou na montagem sem estar aprovado (prévia) sai marcado. A
  // classe só existe nessas montagens: o caderno impresso nunca a recebe,
  // porque `cad-imprimir` monta sem os extras.
  const revisao = (item.status && item.status !== 'aprovado' ? ' em-revisao' : '') +
    // Ajustado pela coordenação de área na leitura final e ainda não relido.
    // Este item ESTÁ aprovado e SAI na impressão — a marca é só da tela, e por
    // isso o realce dela mora sob `.pas-previa` no CSS, que a folha impressa
    // não tem. Marcar o papel seria imprimir uma anotação interna na prova.
    (item.aguardaLeituraFinal ? ' aguarda-leitura' : '');
  // A figura do item (geometria, estrutura química, gráfico) vem depois do
  // enunciado e antes das opções: é o enunciado que a apresenta.
  const figs = htmlImagens(item.imagens, LARGURA_COLUNA);
  if (item.tipo === 'C') {
    // A figura da alternativa sai DENTRO dela, logo abaixo do texto: quatro
    // gráficos soltos depois das quatro letras não diriam qual é de qual.
    //
    // A alternativa é <div>, e não <p>: <figure> não é conteúdo permitido
    // dentro de <p>, e o próprio analisador do navegador fecha o parágrafo
    // antes da figura — a imagem saía do lado de fora da opção, perdendo o
    // recuo e a ligação com a letra. Não é bug que apareça na tela: aparece no
    // papel. O estilo de `.pas-op` não depende da tag.
    const ops = (item.opcoes || []).map((o, i) => {
      const fig = htmlImagens(item.imagensOpcoes?.[i], LARGURA_COLUNA);
      return `<div class="pas-op" data-rev="opcao" data-rev-i="${i}"><b>${'ABCD'[i]}</b> ${rico(o)}${fig}</div>`;
    }).join('');
    return `<div class="pas-item${revisao}"${marca}><span class="n">${numero}</span> ${enun}${figs}${ops}</div>`;
  }
  if (item.tipo === 'D') {
    const n = Math.max(1, item.dLinhas || 10);
    const pauta = item.dPauta !== false;
    const linhas = Array.from({ length: n }, () => '<i></i>').join('');
    return `<div class="pas-item${revisao}"${marca}><span class="n">${numero}</span> ${enun}${figs}
      <div class="pas-pauta${pauta ? ' numerada' : ' sem-linhas'}">${pauta ? linhas : '<i style="height:' + (n * 17) + 'pt"></i>'}</div></div>`;
  }
  return `<div class="pas-item${revisao}"${marca}><span class="n">${numero}</span> ${enun}${figs}</div>`;
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
// `de`/`ate` são os índices, em `texto.linhas`, das linhas que cada parágrafo
// impresso consumiu. Em verso e em linhas numeradas cada parágrafo é uma linha
// só e os dois coincidem; em prosa um parágrafo junta várias. É esse par que
// permite à revisão na página devolver o texto corrigido para o lugar certo do
// registro — sem ele, editar o segundo parágrafo de um texto de nove linhas não
// teria como saber quais delas substituir.
function htmlCorpoTexto(texto) {
  const linhas = texto.linhas || [];
  const branca = l => ricoVazio(l);
  const dono = texto.id ? ` data-rev-texto="${esc(texto.id)}"` : '';
  const marca = (de, ate) => texto.id ? ` data-rev="linha" data-rev-de="${de}" data-rev-ate="${ate}"` : '';
  if (texto.formato === 'numerado')
    return `<div class="pas-linhas"${dono}>${linhas.map((l, i) =>
      `<p${marca(i, i)}>${rico(l)}</p>`).join('')}</div>`;
  if (texto.formato === 'verso')
    return `<div class="pas-texto"${dono}>${linhas.map((l, i) =>
      branca(l) ? '<p>&nbsp;</p>' : `<p class="pas-verso"${marca(i, i)}>${rico(l)}</p>`).join('')}</div>`;
  // prosa: linhas em branco separam parágrafos
  const paragrafos = [];
  let atual = [], de = 0;
  for (const [i, l] of linhas.entries()) {
    if (!branca(l)) { if (!atual.length) de = i; atual.push(l.trim()); }
    else if (atual.length) { paragrafos.push({ txt: atual.join(' '), de, ate: i - 1 }); atual = []; }
  }
  if (atual.length) paragrafos.push({ txt: atual.join(' '), de, ate: linhas.length - 1 });
  return `<div class="pas-texto"${dono}>${paragrafos.map(p =>
    `<p${marca(p.de, p.ate)}>${rico(p.txt)}</p>`).join('')}</div>`;
}

/* ---------------- prévia: “como sai na prova” ---------------- */
// Os professores pediram ver o texto e o item diagramados antes da aprovação
// definitiva. A tela Caderno já mostrava isso, mas só do que estava aprovado —
// justamente o que ainda não se pode conferir. A prévia usa as MESMAS peças da
// impressão (`pecasDoBloco`), numa coluna da largura real do caderno: o que
// aparece aqui é o que sai no papel, com a numeração que o item terá.
function htmlPreviaDoBloco(provaId, versao, textoId, extras = []) {
  const montada = prova(provaId, versao, extras).filter(e => e.texto.id === textoId);
  const texto = S.textos.find(t => t.id === textoId);
  if (!texto) return '<div class="vazio">Este item ainda não está ligado a um texto-base.</div>';
  const pecas = pecasDoBloco(texto, montada, versao).filter(p => !ehRespiro(p));
  return `<div class="pas"><div class="pas-previa-col">${pecas.join('')}</div></div>`;
}

// Quantos itens do bloco ainda não estão aprovados — a prévia diz isso em vez
// de deixar a numeração parecer definitiva.
function avisoDaPrevia(provaId, versao, textoId, extras) {
  const montada = prova(provaId, versao, extras).filter(e => e.texto.id === textoId);
  const pendentes = montada.filter(e => e.item.status !== 'aprovado').length;
  return `<p class="previa-nota">Diagramação real do caderno: coluna de 266pt, corpo 10pt, comando montado pelos tipos
    dos itens do bloco. ${pendentes
      ? `<b>${pendentes} ${pendentes === 1 ? 'item deste bloco ainda não foi aprovado' : 'itens deste bloco ainda não foram aprovados'}</b> —
         a numeração muda se algum deles for devolvido ou se outro entrar antes.`
      : 'Todos os itens deste bloco já estão aprovados.'}</p>`;
}

function dlgPrevia(titulo, corpo, aviso = '') {
  abrirDlg(`
    <div class="dlg-cab"><h2>${esc(titulo)}</h2>
      <button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo"><div class="previa-quadro">${corpo}</div>${aviso}</div>
    <div class="dlg-pe"><button class="btn fantasma" data-acao="previa-voltar">Voltar</button></div>`, true);
}

// A prévia é um diálogo, e o diálogo é um só: voltar reabre de onde se veio.
let voltarDaPrevia = null;
ACOES['previa-voltar'] = () => { const f = voltarDaPrevia; voltarDaPrevia = null; (f || (() => $('#dlg').close()))(); };

ACOES['previa-texto'] = () => {
  recolherCamposDoTexto();
  const r = rascTexto;
  voltarDaPrevia = () => dlgTexto(null, { preservar: true });
  // Texto ainda não gravado: monta a prévia com uma cópia de trabalho, para
  // quem está sugerindo ver a diagramação antes de enviar.
  const linhas = linhasDoCorpoRico(r.corpo, r.formato);
  const simulado = { ...r, linhas, imagens: todasAsImagens(r.imagens) };
  const itens = r.id ? prova(r.provaId, cadVersao).filter(e => e.texto.id === r.id) : [];
  const pecas = pecasDoBloco(simulado, itens, cadVersao).filter(p => !ehRespiro(p));
  dlgPrevia(`Como sai na prova — ${r.titulo || 'texto sem título'}`,
    `<div class="pas"><div class="pas-previa-col">${pecas.join('')}</div></div>`,
    `<p class="previa-nota">É a coluna do caderno, na largura e no corpo reais. ${itens.length
      ? `Os ${itens.length} ${itens.length === 1 ? 'item aprovado deste texto aparece' : 'itens aprovados deste texto aparecem'} abaixo dele, com o comando montado pelos tipos.`
      : 'Quando houver item aprovado neste texto, ele aparece aqui embaixo, com o comando do bloco.'}</p>`);
};

ACOES['previa-item'] = () => {
  if (!rasc?.textoId) { toast('Escolha o texto-base do item antes de ver a prévia.'); return; }
  // A prévia mostra o que está na TELA, não o que está gravado — é para isso
  // que ela serve, e por isso os campos vêm antes. Voltar redesenha o item a
  // partir da mesma cópia de trabalho, com tudo no lugar.
  recolherCamposDoItem();
  voltarDaPrevia = () => dlgItem();
  const versao = rasc.versao === 'adaptada' ? 'adaptada' : 'regular';
  dlgPrevia(`Como sai na prova — ${provaPorId(rasc.provaId)?.serie || ''} · versão ${versao}`,
    htmlPreviaDoBloco(rasc.provaId, versao, rasc.textoId, [rasc]),
    avisoDaPrevia(rasc.provaId, versao, rasc.textoId, [rasc]));
};

function pecasDoBloco(texto, itens, versao) {
  // Texto-base que é só figura (obra de arte, charge, infográfico) não tem
  // corpo escrito: sem esta guarda entraria uma peça vazia na paginação, que a
  // régua mede e transforma em respiro no meio da coluna.
  const pecas = (texto.linhas || []).some(l => !ricoVazio(l)) ? [htmlCorpoTexto(texto)] : [];
  // Uma peça por figura: ela pode mudar de coluna sozinha em vez de arrastar o
  // texto inteiro, e a régua mede a altura de cada uma isolada.
  pecas.push(...pecasDeImagens(texto.imagens, LARGURA_COLUNA));
  pecas.push(`<p class="pas-fonte">${esc(texto.fonte)}</p>`);
  const comando = comandoDoBloco(itens, texto);
  pecas.push(`<p class="pas-comando">${versao === 'adaptada' ? negritarComandos(comando) : comando}</p>`);
  itens.forEach(e => pecas.push(htmlItem(e, versao)));
  pecas.push('<div class="pas-respiro" style="height:13.3pt"></div>');   // respiro entre blocos
  return pecas;
}

// Quantas peças vêm ANTES do primeiro item — corpo, figuras, crédito da fonte e
// comando. É o texto-base propriamente dito, e é o que não pode partir-se entre
// duas folhas (ver `distribuirBlocos`).
const pecasDoTextoBase = (pecas, itens) => pecas.length - itens.length - 1;

// Exatas, para o espaço de rascunho: são os componentes em que o estudante
// precisa de papel para chegar à resposta.
const COMPONENTES_EXATAS = new Set(['Matemática', 'Física', 'Química', 'Biologia']);
const ehExatas = item => COMPONENTES_EXATAS.has(item?.componente);

const ALTURA_COLUNA = 730;     // pt — de y 72,3 a 802,3, como no PAS
const LARGURA_COLUNA = 266.05; // pt — a mesma de `--col` no CSS
const LARGURA_UMA_COL = 541.1; // pt — coluna única (proposta de redação)
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

// O respiro entre blocos existe para separar um texto-base do próximo dentro da
// mesma coluna. Empurrado para uma coluna nova, ele não separa nada — e, quando
// a coluna nova é a primeira de uma folha, imprime uma página inteira em
// branco. Aconteceu assim que um item passou a ocupar mais que uma coluna, o
// que ficou comum com alternativas ilustradas.
const ehRespiro = html => html.includes('class="pas-respiro"');

/* ---------------- o espaço de rascunho ----------------
   Item de exatas se responde com conta feita, e conta feita precisa de papel.
   Sem espaço no caderno, o estudante calcula na margem, no verso da capa ou na
   carteira — e quem corrige não tem como conferir de onde saiu a resposta.

   O espaço nasce de dois lugares, e é o mesmo desenho nos dois: a folha que
   sobra quando um bloco é empurrado inteiro para a página seguinte (ver
   `distribuirBlocos`) e a cota fixa de um rascunho a cada dois blocos seguidos
   com item de exatas. Fio horizontal em cima, a palavra “Rascunho” e o branco. */
const ALTURA_MIN_RASCUNHO = 96;   // pt — menos que isto não cabe conta nenhuma
const MARGEM_RASCUNHO = 6;        // pt — o ar entre o fim do item e o fio

const pecaRascunho = altura =>
  `<div class="pas-rascunho" style="height:${altura.toFixed(1)}pt"><span>Rascunho</span></div>`;

/* Distribui as peças em colunas de altura fixa, duas por página — agora
   BLOCO a bloco, e não peça a peça.

   O que mudou e por quê: a régua media cada peça e ia enchendo coluna, de modo
   que um texto-base podia começar no pé da folha 3 e terminar na folha 4. Para
   quem responde, isso é virar a página no meio do texto e voltar a cada item —
   e um texto-base partido é uma questão partida. Então o bloco inteiro (texto,
   figuras, fonte, comando e itens) cabe numa folha ou vai inteiro para a
   seguinte; entre as DUAS COLUNAS da mesma folha ele continua fluindo, que é a
   leitura normal do caderno e não custa virada de página.

   O branco que sobra não é desperdício: vira rascunho.

   Bloco maior que uma folha inteira não tem para onde ir — aí ele flui como
   antes, e o que se preserva é ao menos o texto-base junto. */
function distribuirBlocos(blocos, comExatas = false) {
  const paginas = [];
  let colunas = [[], []], ci = 0, altura = 0;

  const sobraNaColuna = () => ALTURA_COLUNA - altura;
  const sobraNaPagina = () => sobraNaColuna() + (ci === 0 ? ALTURA_COLUNA : 0);
  const paginaVazia = () => ci === 0 && altura === 0;
  const fecharPagina = () => { paginas.push(colunas); colunas = [[], []]; ci = 0; altura = 0; };
  const proximaColuna = () => { if (ci === 1) fecharPagina(); else { ci = 1; altura = 0; } };

  // Enche de rascunho o que sobrou da coluna corrente e a dá por cheia.
  // Devolve se coube: espaço de três linhas não é espaço de conta.
  const rascunhoNaColuna = () => {
    const sobra = sobraNaColuna() - MARGEM_RASCUNHO;
    if (sobra < ALTURA_MIN_RASCUNHO) return false;
    colunas[ci].push(pecaRascunho(sobra));
    altura = ALTURA_COLUNA;
    return true;
  };
  // O bloco não cabe no que resta da folha: o que sobra dela — a coluna
  // corrente e, se for o caso, a segunda inteira — vira rascunho, e o bloco
  // começa na folha seguinte.
  const virarFolha = () => {
    rascunhoNaColuna();
    if (ci === 0) { ci = 1; altura = 0; rascunhoNaColuna(); }
    fecharPagina();
  };

  let seguidosDeExatas = 0, rascunhoDevido = false;

  for (const bloco of blocos) {
    // Dentro de um bloco de exatas, todo pé de coluna que sobra vira rascunho:
    // o branco já estava ali — o que se acrescenta é o fio e a palavra, e o
    // espaço fica ao lado dos itens que pedem conta. Bloco sem exatas não
    // ganha nada: rascunho em prova de Linguagens é ruído.
    const aoVirarColuna = () => { if (bloco.exatas && rascunhoNaColuna()) rascunhoDevido = false; };
    const soma = (de, ate) => bloco.alturas.slice(de, ate).reduce((t, a) => t + a, 0);
    const altBloco = soma(0, bloco.alturas.length);
    // O que se tenta manter inteiro numa folha: o bloco, quando ele cabe numa;
    // quando não cabe (texto longo com muitos itens), ao menos o texto-base.
    const altAtomica = altBloco <= 2 * ALTURA_COLUNA ? altBloco : soma(0, bloco.textoBase);
    if (!paginaVazia() && altAtomica <= 2 * ALTURA_COLUNA && altAtomica > sobraNaPagina()) {
      virarFolha();
      rascunhoDevido = false;   // acabou de sair um, e um por folha basta
    }

    bloco.pecas.forEach((html, i) => {
      const alt = bloco.alturas[i];
      if (altura > 0 && altura + alt > ALTURA_COLUNA) {
        // A quebra de coluna já é a separação que o respiro daria.
        if (ehRespiro(html)) return;
        aoVirarColuna();
        proximaColuna();
      }
      colunas[ci].push(html);
      altura += alt;
    });

    // A cota: dois blocos seguidos com item de exatas pedem um rascunho. Se o
    // pé da coluna não comporta, a dívida fica de pé e se paga no próximo fim
    // de bloco — em vez de abrir um rascunho de duas linhas ou de perdê-lo.
    if (bloco.exatas) {
      if (++seguidosDeExatas >= 2) { rascunhoDevido = true; seguidosDeExatas = 0; }
    } else seguidosDeExatas = 0;
    if (rascunhoDevido && rascunhoNaColuna()) rascunhoDevido = false;
  }

  // O fim do caderno: numa prova com exatas, o que sobrou da última folha —
  // o pé da coluna e, se for o caso, a segunda coluna inteira — é papel em
  // branco que o estudante vai usar de todo jeito. Melhor com o fio e o nome.
  if (comExatas && !paginaVazia()) {
    rascunhoNaColuna();
    if (ci === 0) { ci = 1; altura = 0; rascunhoNaColuna(); }
  }
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

// A folha de consulta. Vem por último no caderno, em toda prova — regular e
// adaptada, de todas as séries: é material de consulta, e a prova de exatas se
// responde com ela ao lado. Sai deitada porque em pé as massas atômicas ficam
// pequenas demais (ver o bloco “tabela periódica” em css/estilo.css); a moldura
// da página fica em pé, como em todas as outras.
const PARTE_TABELA = '-- MATERIAL DE CONSULTA --';

function htmlFolhaTabela(ident, numero, total) {
  return `
  <div class="pas-pagina">
    <div class="pas-ident">${ident}</div>
    <div class="pas-fio-topo"></div>
    <div class="pas-parte">${esc(PARTE_TABELA)}</div>
    <div class="tp-giro">${htmlTabelaPeriodica()}</div>
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
function htmlCaderno(provaId, versao, comCapa = true, extras = []) {
  const pv = prova(provaId, versao, extras);
  const comRedacao = propostaEscrita(provaId);
  if (!pv.length && !comRedacao) return '';
  const porTexto = new Map();
  for (const e of pv) {
    if (!porTexto.has(e.texto.id)) porTexto.set(e.texto.id, { texto: e.texto, itens: [] });
    porTexto.get(e.texto.id).itens.push(e);
  }
  // Um bloco por texto-base, medido isolado: é a unidade que a paginação tenta
  // não partir entre folhas, e é nele que se pergunta se há item de exatas.
  const blocos = [...porTexto.values()].map(({ texto, itens }) => {
    const pecas = pecasDoBloco(texto, itens, versao);
    return {
      pecas, alturas: medirPecas(pecas),
      textoBase: pecasDoTextoBase(pecas, itens),
      exatas: itens.some(e => ehExatas(e.item))
    };
  });
  const paginas = blocos.length ? distribuirBlocos(blocos, blocos.some(b => b.exatas)) : [];
  // A proposta vai em coluna única, como no caderno do PAS: medida e paginada
  // na largura cheia, não na coluna do miolo.
  const pecasRed = comRedacao ? pecasDaProposta(provaId) : [];
  const paginasRed = pecasRed.length
    ? distribuirEmUmaColuna(pecasRed, medirPecas(pecasRed, true)) : [];
  const p = provaPorId(provaId);
  const ident = `${esc(p?.nome || '')} — ${esc(p?.serie || '')} · ${esc(p?.etapa || '')} · versão ${codigoDaVersao(versao)}`;
  const capa = comCapa ? `<div class="pas-pagina">${htmlCapa(provaId, versao, pv.length)}</div>` : '';
  const total = paginas.length + paginasRed.length + 1 + (comCapa ? 1 : 0);
  let n = comCapa ? 1 : 0;
  const folhas = [
    ...paginas.map(c => htmlPagina(c, ident, ++n, total)),
    ...paginasRed.map(c => htmlPagina(c, ident, ++n, total, PARTE_REDACAO, true)),
    htmlFolhaTabela(ident, ++n, total)
  ].join('');
  return `<div class="pas">${capa}${folhas}</div>`;
}

// As figuras precisam de endereço (URL assinada) e dos bytes em mão ANTES de o
// caderno ser montado: paginar com imagem pela metade dá quebra errada, e
// imprimir com imagem faltando dá quadro vazio no papel. Feito uma vez por
// prova; depois o cache do módulo responde.
const provasComImagemPronta = new Set();
async function prepararFigurasDaProva(provaId) {
  if (provasComImagemPronta.has(provaId)) return;
  provasComImagemPronta.add(provaId);
  const listas = [
    ...textosDaProva(provaId).map(t => t.imagens),
    ...itensDaProva(provaId).map(i => i.imagens),
    // As figuras das alternativas do tipo C são listas à parte, uma por opção:
    // fora daqui elas ficariam sem endereço assinado e sairiam em branco.
    ...itensDaProva(provaId).flatMap(i => i.imagensOpcoes || [])
  ];
  if (!listas.some(l => todasAsImagens(l).length)) return;
  await prepararImagens(listas);
  // Remonta agora que os endereços existem — a primeira montagem saiu com os
  // quadros de espera, e a medida deles já era a definitiva.
  if (telaAtual() === 'caderno') render();
}

/* ---------------- revisão na página ----------------
   O pedido: “é comum aparecerem correções na hora da leitura final da prova.
   Queria poder editar a prova no caderno, in-line, e que isso já valesse para a
   impressão”.

   O caderno já mostrava a prova como ela sai do papel — e era só isso: para
   corrigir uma vírgula vista ali era preciso guardar o número do item, ir à
   tela de itens, achá-lo, abrir o diálogo, corrigir, e voltar ao caderno para
   conferir. Numa prova de 110 itens isso é o suficiente para a vírgula ficar
   como está.

   Como funciona: um interruptor põe o caderno em modo de revisão. Nada muda no
   que se vê — a página continua sendo a página, é isso que se quis preservar —,
   mas cada enunciado, cada alternativa e cada parágrafo de texto-base passa a
   responder ao clique, abrindo ali mesmo um editor com o TEXTO DE ORIGEM (não o
   HTML impresso: o que se edita é o que está guardado, com ênfase, tamanho e
   fórmula, pelo mesmo editor do resto do sistema).

   Ao salvar, quem muda é o ITEM — como pedido —, não uma cópia do caderno. Por
   isso não há “versão para impressão” a gerar: o caderno é montado do registro,
   e a impressão sai corrigida no mesmo instante. A alteração fica registrada no
   fio da revisão do item, para quem o escreveu saber o que mudou na leitura
   final e por quem.

   Quem pode: as mesmas regras de sempre (`podeEditarItem`, `podeEditarTexto`).
   Item aprovado é da coordenação geral, e é ela que faz a leitura final. */
let cadRevisando = false;
let revEmEdicao = null;   // { tipo, id, campo, i, de, ate, valor, rotulo, retangulo }

const REV_ROTULOS = { enunciado: 'Enunciado', opcao: 'Alternativa', linha: 'Texto-base' };

// Quem faz a leitura final da prova montada.
//
// É mais gente do que quem edita o item pela tela de itens, e de propósito. O
// caderno é feito de itens APROVADOS, e item aprovado só a coordenação geral
// altera (migração 0012) — então, na prática, a revisão na página nascia só
// para ela. A coordenação de área abria o caderno, via o problema na página e
// não tinha o que fazer com ele, que é o contrário de ler a prova junto.
//
// Agora quem coordena a área do item também corrige. O que muda é o que
// ACONTECE depois: o ajuste dela deixa o item pendente da última leitura da
// coordenação pedagógica (`aguardaLeituraFinal`, posto pelo banco na migração
// 0017). O item não sai da prova nem volta de status — sair renumeraria a prova
// inteira por causa de uma vírgula, no meio da leitura final.
const coordenaAArea = item => ehCoordArea() && !!S.perfil.area &&
  areaDoComponente(item?.componente) === S.perfil.area;
const podeRevisarNoCaderno = item => !!item && (ehCoord() || coordenaAArea(item) || podeEditarItem(item));

// De um pedaço impresso para o registro que o produziu.
function alvoDaRevisao(el) {
  const campo = el.dataset.rev;
  const dono = el.closest('[data-rev-item],[data-rev-texto]');
  if (!dono) return null;
  if (dono.dataset.revItem) {
    const item = S.itens.find(i => i.id === dono.dataset.revItem);
    if (!item) return null;
    const i = campo === 'opcao' ? Number(el.dataset.revI) : null;
    // A coordenação de área que não fez a última leitura é avisada do que o
    // ajuste dela provoca — antes de fazê-lo, não depois.
    const marca = !ehCoord() && coordenaAArea(item) && item.status === 'aprovado';
    return {
      tipo: 'item', id: item.id, campo, i,
      valor: campo === 'opcao' ? (item.opcoes?.[i] || '') : (item.enunciado || ''),
      rotulo: campo === 'opcao' ? `Alternativa ${'ABCD'[i]}` : REV_ROTULOS[campo],
      podeEditar: podeRevisarNoCaderno(item),
      pendura: marca,
      dica: marca
        ? 'o ajuste entra no item e volta como pendência para a última leitura da coordenação pedagógica'
        : 'a correção entra no item e já vale para a impressão',
      porque: souEu(item)
        ? 'Este item já foi aprovado: quem o altera agora é a coordenação pedagógica ou a coordenação da sua área.'
        : `Este item é de ${item.autor || 'outra pessoa'}, do componente ${item.componente || '—'}, e está ${STATUS_ITEM[item.status].rot.toLowerCase()} — quem pode corrigi-lo na leitura final é a coordenação pedagógica ou a coordenação da área dele.`
    };
  }
  const texto = S.textos.find(t => t.id === dono.dataset.revTexto);
  if (!texto) return null;
  const de = Number(el.dataset.revDe), ate = Number(el.dataset.revAte);
  return {
    tipo: 'texto', id: texto.id, campo, de, ate,
    valor: (texto.linhas || []).slice(de, ate + 1).join('<br>'),
    rotulo: `Texto ${texto.numero} — ${ate > de ? 'parágrafo' : 'linha'}`,
    podeEditar: podeEditarTexto(texto),
    // O texto-base é guardado linha a linha, e é por essas linhas que o item
    // cita a passagem (“linhas 5-7”, destacadas em amarelo no editor do item).
    // Por isso o editor mostra as linhas como elas estão guardadas, e não o
    // parágrafo já emendado: juntá-las aqui deixaria toda referência de linha
    // daquele texto apontando para o lugar errado.
    dica: ate > de
      ? `as ${ate - de + 1} linhas guardadas aparecem separadas — o caderno as junta neste parágrafo, e as referências de linha dos itens continuam valendo`
      : 'a correção entra no texto-base e já vale para a impressão',
    porque: 'Texto-base aprovado é da prova inteira: só a coordenação o altera.'
  };
}

function abrirRevisaoInline(el) {
  const alvo = alvoDaRevisao(el);
  if (!alvo) return;
  if (!alvo.podeEditar) { toast(alvo.porque); return; }
  const r = el.getBoundingClientRect();
  revEmEdicao = { ...alvo, retangulo: { x: r.left, y: r.bottom, largura: r.width, topo: r.top } };
  desenharRevisaoInline();
}

function fecharRevisaoInline() {
  revEmEdicao = null;
  $('#rev-caixa')?.remove();
}

function desenharRevisaoInline() {
  $('#rev-caixa')?.remove();
  if (!revEmEdicao) return;
  const a = revEmEdicao;
  const caixa = document.createElement('div');
  caixa.id = 'rev-caixa';
  caixa.className = 'rev-caixa';
  caixa.innerHTML = `
    <div class="rev-cab">
      <strong>${esc(a.rotulo)}</strong>
      <span class="rev-dica">${esc(a.dica || 'a correção entra no item e já vale para a impressão')}</span>
      <button class="fechar-x" data-acao="rev-fechar" aria-label="Fechar sem salvar">✕</button>
    </div>
    <div class="rev-corpo">
      ${editorRico({ campo: 'revLinha', valor: a.valor, linhas: a.campo === 'opcao' ? 2 : 4,
                     rotulo: a.rotulo })}
    </div>
    <div class="rev-pe">
      <button class="btn fantasma mini" data-acao="rev-fechar">Cancelar</button>
      <button class="btn mini" data-acao="rev-salvar">Salvar a correção</button>
    </div>`;
  document.body.appendChild(caixa);

  // Colada ao pedaço que foi clicado, e presa à janela: a página do caderno
  // rola dentro de um quadro, e uma caixa que saísse pela borda seria uma caixa
  // que ninguém alcança.
  const larg = caixa.offsetWidth, alt = caixa.offsetHeight;
  const x = Math.max(10, Math.min(a.retangulo.x - 6, innerWidth - larg - 10));
  const abaixo = a.retangulo.y + 8;
  const y = abaixo + alt < innerHeight - 10 ? abaixo : Math.max(10, a.retangulo.topo - alt - 8);
  caixa.style.left = x + 'px';
  caixa.style.top = y + 'px';
  caixa.querySelector('.rico-area')?.focus();
}

ACOES['rev-fechar'] = () => fecharRevisaoInline();

ACOES['rev-salvar'] = async () => {
  if (!revEmEdicao) return;
  const a = revEmEdicao;
  const area = $('#rev-caixa [data-rico-campo="revLinha"]');
  const valor = area ? valorDoEditorRico(area) : a.valor;

  if (a.tipo === 'item') {
    const item = S.itens.find(i => i.id === a.id);
    if (!item || !podeRevisarNoCaderno(item)) { toast('Este item não está mais aberto para edição.'); return; }
    if (a.campo === 'enunciado' && ricoVazio(valor)) { toast('O enunciado não pode ficar em branco.'); return; }
    // Fechar sem ter mudado nada não vira gravação nem pendência: numa leitura
    // final de 110 itens, abrir para conferir é o gesto mais comum.
    if (valor === a.valor) { fecharRevisaoInline(); return; }

    // A gravação passa pela função do banco (migração 0017): é ela que alcança
    // o item aprovado quando quem corrige coordena a área, e é ela que marca a
    // pendência da última leitura. Sem nuvem não há função — e não há também
    // ninguém a quem devolver a pendência.
    if (modoNuvem) {
      try {
        const dados = await nuvem.ajustarNaLeituraFinal(a.id, a.campo, a.i, valor);
        Object.assign(item, dados);
      } catch (e) { toast('⚠ O banco recusou a correção: ' + (e?.message || e)); return; }
    } else {
      if (a.campo === 'opcao') { item.opcoes = item.opcoes || ['', '', '', '']; item.opcoes[a.i] = valor; }
      else item.enunciado = valor;
    }
    fecharRevisaoInline();
    commit();
    toast(item.aguardaLeituraFinal
      ? 'Corrigido. O item volta como pendência da última leitura da coordenação pedagógica.'
      : `Item ${a.campo === 'opcao' ? 'com a alternativa corrigida' : 'corrigido'} — a impressão já sai assim.`);
    return;
  }

  const texto = S.textos.find(t => t.id === a.id);
  if (!texto || !podeEditarTexto(texto)) { toast('Este texto-base não está mais aberto para edição.'); return; }
  if (valor === a.valor) { fecharRevisaoInline(); return; }
  const novas = linhasDoCorpoRico(valor, texto.formato || 'prosa');
  if (!novas.length) { toast('O trecho não pode ficar em branco — para remover uma passagem, edite o texto-base.'); return; }
  const antes = JSON.parse(JSON.stringify(texto));
  texto.linhas.splice(a.de, a.ate - a.de + 1, ...novas);
  const erro = await PERS.textoAgora(texto);
  if (erro) {
    Object.assign(texto, antes);
    save(S);
    toast('⚠ O banco recusou a correção: ' + erro);
    return;
  }
  fecharRevisaoInline();
  commit();
  toast('Texto-base corrigido — a impressão já sai assim.');
};

// Um clique em qualquer pedaço etiquetado, quando o caderno está em revisão.
// Ouvinte próprio, e não `data-acao`, porque as etiquetas vivem no HTML que
// também vai para a impressão: `data-acao` ali seria promessa de botão numa
// folha de papel.
document.addEventListener('click', e => {
  if (!cadRevisando) return;
  if (e.target.closest('#rev-caixa')) return;
  const el = e.target.closest('.pas-revisando [data-rev]');
  if (!el) return;
  e.preventDefault();
  abrirRevisaoInline(el);
});
// Clicar fora fecha, como o diálogo faz. Salvar é sempre explícito: fechar sem
// salvar não pode perder nada por engano, e por isso a caixa avisa.
document.addEventListener('mousedown', e => {
  if (!revEmEdicao || e.target.closest('#rev-caixa') || e.target.closest('[data-rev]')) return;
  fecharRevisaoInline();
});

function telaCaderno() {
  const pAtiva = provaAtual();
  if (!pAtiva) {
    $('#app').innerHTML = '<div class="quadro"><div class="miolo"><div class="vazio">Nenhuma prova cadastrada — crie a primeira no Painel.</div></div></div>';
    return;
  }
  prepararFigurasDaProva(pAtiva.id);
  // “Ver o que está em revisão” monta o caderno com os itens que ainda não
  // foram aprovados, marcados em amarelo. É a prévia que a coordenação pediu
  // para decidir a aprovação vendo a prova montada, e não item a item — mas o
  // que se IMPRIME continua sendo só o aprovado (ver `cad-imprimir`).
  const emRevisao = cadComRevisao ? itensEmRevisao(pAtiva.id) : [];
  const pv = prova(pAtiva.id, cadVersao, emRevisao);
  const naPrevia = pv.filter(e => e.item.status !== 'aprovado').length;
  // A proposta de redação é conteúdo do caderno: ela sozinha já justifica gerar
  // o documento, e a sua falta é avisada em vez de ficar em silêncio.
  const comRedacao = propostaEscrita(pAtiva.id);
  const temConteudo = pv.length > 0 || comRedacao;
  // Ajustes da coordenação de área à espera da releitura — só quem faz a última
  // leitura precisa vê-los anunciados.
  const aguardando = ehCoord()
    ? pv.filter(e => e.item.aguardaLeituraFinal).map(e => e.item) : [];
  $('#app').innerHTML = `
  <div class="quadro">
    <div class="miolo" style="padding-bottom:0">
      <div class="cab-tela">
        <div><h2>Caderno de provas — ${esc(pAtiva.serie)}</h2>
          <span class="sub">${esc(pAtiva.etapa)} · ${pv.length - naPrevia} itens aprovados nesta versão${
            naPrevia ? ` · ${naPrevia} em revisão à mostra` : ''} · numeração contínua · diagramação no padrão PAS${
            provaTemRedacao(pAtiva.id) ? (comRedacao ? ' · com a proposta de redação' : ' · proposta de redação ainda em branco') : ' · sem redação'}</span></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div class="seg">
            <button class="${cadVersao === 'regular' ? 'sel' : ''}" data-acao="cad-versao" data-v="regular">Regular</button>
            <button class="${cadVersao === 'adaptada' ? 'sel' : ''}" data-acao="cad-versao" data-v="adaptada">Adaptada</button>
          </div>
          <label class="cad-revisao" title="Mostra também os itens que ainda estão na revisão, para conferir a prova antes de aprovar">
            <input type="checkbox" data-mud="cad-revisao" ${cadComRevisao ? 'checked' : ''}> ver o que está em revisão</label>
          <button class="btn ${cadRevisando ? 'roxo' : 'fantasma'}" data-acao="cad-revisar"
            title="Corrigir enunciados, alternativas e textos-base clicando neles na própria página">
            ${cadRevisando ? '✓ Revisando na página' : '✎ Revisar na página'}</button>
          ${ehCoord() ? '<button class="btn fantasma" data-acao="cad-adaptada">⚖ Montar a prova adaptada</button>' : ''}
          ${ehCoord() ? '<button class="btn fantasma" data-acao="cad-capa">⚙ Capa e instruções</button>' : ''}
          ${cuidaDaRedacao() && provaTemRedacao(pAtiva.id) ? '<button class="btn fantasma" data-acao="cad-redacao">✍ Proposta de redação</button>' : ''}
          <button class="btn rosa" data-acao="cad-imprimir" ${temConteudo ? '' : 'disabled'}>🖨 Imprimir / salvar em PDF</button>
        </div>
      </div>
      ${naPrevia ? `<div class="cartao aviso" style="margin:12px 0 0"><p style="font-size:13px;margin:0">
        Os itens em <b style="background:var(--amarelo);padding:0 4px;border-radius:4px">amarelo</b> ainda não foram aprovados
        e estão aqui só para conferência — a numeração muda se algum for devolvido. <b>A impressão sai só com o aprovado.</b></p></div>` : ''}
      ${cadRevisando ? `<div class="cartao aviso rev-aviso" style="margin:12px 0 0"><p style="font-size:13px;margin:0">
        <b>Revisão na página:</b> clique num enunciado, numa alternativa ou num parágrafo de texto-base para corrigi-lo
        aqui mesmo. A correção entra no <b>item</b> (ou no texto-base), fica registrada no histórico dele e
        <b>vale imediatamente para a impressão</b> — não há versão à parte a gerar.${ehCoordArea()
          ? ' Você corrige os itens da <b>sua área</b>; o que você ajustar volta como pendência para a última leitura da coordenação pedagógica.'
          : ''}</p></div>` : ''}
      ${aguardando.length ? `<div class="cartao aviso rev-pendente" style="margin:12px 0 0"><p style="font-size:13px;margin:0">
        <b>${aguardando.length} ${aguardando.length === 1 ? 'item ajustado' : 'itens ajustados'}
        pela coordenação de área</b> na leitura final ${aguardando.length === 1 ? 'espera' : 'esperam'} a sua releitura,
        ${aguardando.length === 1 ? 'marcado' : 'marcados'} em roxo na página.
        ${aguardando.length === 1 ? 'Ele já está' : 'Eles já estão'} na prova e ${aguardando.length === 1 ? 'sai' : 'saem'}
        assim na impressão — abra ${aguardando.length === 1 ? 'o item' : 'os itens'} e confirme a leitura.</p></div>` : ''}
    </div>
    ${temConteudo ? `<div class="pas-previa${cadRevisando ? ' pas-revisando' : ''}">${htmlCaderno(pAtiva.id, cadVersao, true, emRevisao)}</div>`
      : '<div class="miolo"><div class="vazio">Nenhum item aprovado para esta versão ainda. Aprove itens na tela “Itens e revisão”.</div></div>'}
  </div>
  <p class="nota-tela"><strong>Diagramação calibrada</strong> contra os cadernos do PAS/CEBRASPE de 2025: A4 com duas colunas de 266pt e fio central, corpo de 10pt, número do item recuado para fora da coluna e crédito da fonte em 6pt. O <strong>comando de cada bloco é montado automaticamente</strong> a partir dos tipos de item — “julgue os itens de 11 a 19 e assinale a opção correta no item 20, que é do tipo C” —, e o texto de abertura é editável em cada texto-base. A <strong>proposta de redação</strong> fecha o caderno, nas últimas páginas, quando a prova tem redação e a proposta está escrita. A quebra de páginas acontece na impressão: use “Imprimir” e escolha “Salvar como PDF”.</p>`;
}
ACOES['cad-versao'] = d => { cadVersao = d.v; render(); };
ACOES['cad-revisar'] = () => { cadRevisando = !cadRevisando; fecharRevisaoInline(); render(); };
MUDS['cad-revisao'] = (d, el) => { cadComRevisao = el.checked; render(); };
// A impressão ignora `cadComRevisao` de propósito: item em revisão na tela é
// conferência, item em revisão no papel seria prova aplicada com item que a
// coordenação ainda não aprovou.
ACOES['cad-imprimir'] = () => {
  $('#print-area').innerHTML = htmlCaderno(idProvaAtual(), cadVersao);
  window.print();
};

/* ================= montar a prova adaptada =================
   A prova de inclusão é MENOR que a regular, e até aqui o tamanho dela era um
   acidente: todo item nascia valendo para as duas (`versao: 'ambas'`), e a
   adaptada só ficava menor pelos poucos itens que alguém marcou como regular.
   Nas quatro provas isso dava três ou quatro itens a menos — não é prova
   adaptada, é a mesma prova.

   Escolher item a item no cadastro de cada um seria abrir 120 diálogos. Aqui a
   escolha é de uma vez, sobre a lista inteira, na ordem da prova e agrupada
   pelo texto-base — que é como a coordenação pensa a prova: tira-se um bloco,
   não um item solto no meio de um texto que continua.

   O QUE ESTA TELA MEXE, E O QUE NÃO MEXE

   Ela decide, para cada item DA REGULAR, se ele também sai na adaptada —
   `ambas` quando sim, `regular` quando não. A prova regular não muda: o item
   desmarcado continua nela, com o mesmo número.

   Dois casos ficam de fora da escolha, e aparecem travados:
   · o item que tem adaptação própria — quem entra na adaptada é a cópia, e é
     ela que carrega o ajuste feito para a prova de inclusão;
   · a própria cópia (`derivadoDe`), que só existe para a adaptada.

   Desmarcar uma cópia dessas a deixaria sem prova nenhuma, então ela não é
   desmarcável: para tirá-la, exclui-se o item. */

// Cópia de trabalho do diálogo: os ids que ficam na adaptada. Fora dela nada
// muda — a gravação é no “Salvar”, de uma vez.
let selAdaptada = null;

// Os itens adaptados que não vêm da regular: as adaptações próprias. Entram na
// conta da adaptada, mas não na escolha.
const adaptadosProprios = provaId => S.itens.filter(i =>
  i.provaId === provaId && i.status === 'aprovado' && i.versao === 'adaptada');

function contasDaAdaptada(provaId) {
  const naRegular = prova(provaId, 'regular');
  const escolhidos = naRegular.filter(e => selAdaptada.has(e.item.id)).map(e => e.item);
  const itens = [...escolhidos, ...adaptadosProprios(provaId)];
  const porTipo = {};
  for (const i of itens) porTipo[i.tipo] = (porTipo[i.tipo] || 0) + 1;
  const porArea = {};
  for (const i of itens) {
    const a = areaDoComponente(i.componente) || 'sem área';
    porArea[a] = (porArea[a] || 0) + 1;
  }
  return { naRegular, itens, porTipo, porArea, total: itens.length };
}

function htmlResumoDaAdaptada(provaId) {
  const p = provaPorId(provaId);
  const { naRegular, porTipo, porArea, total } = contasDaAdaptada(provaId);
  const meta = totalDeQuestoes(p, 'adaptada');
  const falta = meta == null ? null : total - meta;
  const tipos = Object.keys(TIPOS).filter(t => porTipo[t])
    .map(t => `<span class="t t${t}">${t}</span> ${porTipo[t]}`).join(' · ');
  const areas = Object.entries(porArea).sort((a, b) => b[1] - a[1])
    .map(([a, n]) => `${esc(a)} <b>${n}</b>`).join(' · ');
  return `
    <div class="adap-resumo${falta === 0 ? ' certo' : ''}">
      <div class="adap-numero"><b>${total}</b><span>na adaptada</span></div>
      <div class="adap-detalhe">
        <p><b>${naRegular.length}</b> itens na regular · meta da adaptada:
          ${meta == null ? '<em>a definir em “⚙ Configurar prova”</em>' : `<b>${meta}</b>`}${
          falta === null ? '' : falta === 0 ? ' · <b class="ok">bate com a meta</b>'
            : falta > 0 ? ` · <b class="excede">${falta} acima</b>` : ` <b class="falta">${-falta} abaixo</b>`}</p>
        ${tipos ? `<p class="adap-linha">Por tipo: ${tipos}</p>` : ''}
        ${areas ? `<p class="adap-linha">Por área: ${areas}</p>` : ''}
      </div>
    </div>`;
}

function dlgAdaptada() {
  const p = provaAtual();
  if (!p) return;
  const { naRegular } = contasDaAdaptada(p.id);
  const proprias = adaptadosProprios(p.id);
  const emRevisao = S.itens.filter(i => i.provaId === p.id && i.status !== 'aprovado'
    && i.status !== 'rascunho').length;

  // Agrupado pelo texto-base, na ordem da prova: é assim que a prova é lida, e
  // tirar o bloco inteiro é o corte que mais preserva o sentido do texto.
  const blocos = [];
  for (const e of naRegular) {
    if (!blocos.length || blocos.at(-1).texto.id !== e.texto.id)
      blocos.push({ texto: e.texto, entradas: [] });
    blocos.at(-1).entradas.push(e);
  }

  const linhaItem = ({ item, numero }) => {
    const par = itemAdaptadoDe(item.id);
    const travado = !!par;
    const marcado = selAdaptada.has(item.id);
    return `
      <label class="adap-item${travado ? ' travado' : ''}${marcado && !travado ? ' dentro' : ''}" id="adap-i-${esc(item.id)}">
        <input type="checkbox" data-mud="adap-item" data-id="${esc(item.id)}"
          ${marcado && !travado ? 'checked' : ''} ${travado ? 'disabled' : ''}>
        <span class="adap-n">${numero}</span>
        <span class="t t${item.tipo}">${item.tipo}</span>
        ${discChip(item.componente)}
        <span class="adap-enun">${esc(simples(item.enunciado).slice(0, 90))}</span>
        ${travado ? '<span class="adap-marca">tem adaptação própria</span>' : ''}
      </label>`;
  };

  const htmlBlocos = blocos.map(b => {
    const ids = b.entradas.filter(e => !itemAdaptadoDe(e.item.id)).map(e => e.item.id);
    const dentro = ids.filter(id => selAdaptada.has(id)).length;
    return `
      <div class="adap-bloco">
        <div class="adap-bloco-cab">
          <b>Texto ${b.texto.numero} — ${esc((b.texto.titulo || '').slice(0, 56))}</b>
          <span class="adap-conta" id="adap-c-${esc(b.texto.id)}">${dentro} de ${ids.length}</span>
          <span class="adap-bloco-acoes">
            <button class="btn mini fantasma" data-acao="adap-bloco" data-id="${esc(b.texto.id)}" data-v="1">todos</button>
            <button class="btn mini fantasma" data-acao="adap-bloco" data-id="${esc(b.texto.id)}" data-v="0">nenhum</button>
          </span>
        </div>
        ${b.entradas.map(linhaItem).join('')}
      </div>`;
  }).join('');

  abrirDlg(`
    <div class="dlg-cab"><h2>Montar a prova adaptada — ${esc(p.serie)}</h2>
      <button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      <p style="font-size:12.5px;color:var(--ink-2);margin:0 0 12px">Marque os itens da prova regular que
        <b>também saem na adaptada</b>. O que você desmarcar continua na regular, com o mesmo número — só sai
        da prova de inclusão. A numeração da adaptada é refeita sozinha, em sequência.</p>
      <div id="adap-resumo">${htmlResumoDaAdaptada(p.id)}</div>
      <div class="adap-barra">
        <button class="btn mini fantasma" data-acao="adap-todos" data-v="1">Marcar todos</button>
        <button class="btn mini fantasma" data-acao="adap-todos" data-v="0">Desmarcar todos</button>
      </div>
      ${proprias.length ? `<p class="adap-nota"><b>${proprias.length}
        ${proprias.length === 1 ? 'item entra' : 'itens entram'} por adaptação própria</b> e já
        ${proprias.length === 1 ? 'está contado' : 'estão contados'} acima. ${proprias.length === 1 ? 'Ele existe' : 'Eles existem'}
        só para a adaptada; para tirá-${proprias.length === 1 ? 'lo' : 'los'}, exclua o item.</p>` : ''}
      ${emRevisao ? `<p class="adap-nota aviso"><b>${emRevisao}
        ${emRevisao === 1 ? 'item ainda está na revisão' : 'itens ainda estão na revisão'}</b> e não
        ${emRevisao === 1 ? 'aparece' : 'aparecem'} aqui. Ao ${emRevisao === 1 ? 'ser aprovado, ele entra' : 'serem aprovados, eles entram'}
        nas duas provas — volte aqui depois da última aprovação.</p>` : ''}
      <div class="adap-lista">${htmlBlocos}</div>
    </div>
    <div class="dlg-pe">
      <button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="adap-salvar" data-id="${esc(p.id)}">Salvar</button></div>`);
}

// Redesenha só o que a marcação muda — o resumo e as contas dos blocos. Uma
// remontagem do diálogo inteiro perderia a rolagem, e são 120 linhas: quem está
// no meio da lista voltaria ao topo a cada clique.
function repintarAdaptada() {
  const provaId = idProvaAtual();
  const resumo = $('#adap-resumo');
  if (resumo) resumo.innerHTML = htmlResumoDaAdaptada(provaId);
  for (const t of textosAprovados(provaId)) {
    const conta = document.getElementById(`adap-c-${t.id}`);
    if (!conta) continue;
    const ids = prova(provaId, 'regular')
      .filter(e => e.texto.id === t.id && !itemAdaptadoDe(e.item.id)).map(e => e.item.id);
    conta.textContent = `${ids.filter(id => selAdaptada.has(id)).length} de ${ids.length}`;
  }
}

const marcarNaTela = (id, dentro) => {
  const linha = document.getElementById(`adap-i-${id}`);
  if (!linha) return;
  linha.classList.toggle('dentro', dentro);
  const cx = linha.querySelector('input');
  if (cx) cx.checked = dentro;
};

MUDS['adap-item'] = (d, el) => {
  if (el.checked) selAdaptada.add(d.id); else selAdaptada.delete(d.id);
  marcarNaTela(d.id, el.checked);
  repintarAdaptada();
};

ACOES['adap-bloco'] = d => {
  const dentro = d.v === '1';
  for (const e of prova(idProvaAtual(), 'regular')) {
    if (e.texto.id !== d.id || itemAdaptadoDe(e.item.id)) continue;
    if (dentro) selAdaptada.add(e.item.id); else selAdaptada.delete(e.item.id);
    marcarNaTela(e.item.id, dentro);
  }
  repintarAdaptada();
};

ACOES['adap-todos'] = d => {
  const dentro = d.v === '1';
  for (const e of prova(idProvaAtual(), 'regular')) {
    if (itemAdaptadoDe(e.item.id)) continue;
    if (dentro) selAdaptada.add(e.item.id); else selAdaptada.delete(e.item.id);
    marcarNaTela(e.item.id, dentro);
  }
  repintarAdaptada();
};

ACOES['cad-adaptada'] = () => {
  const p = provaAtual();
  if (!p) return;
  selAdaptada = new Set(prova(p.id, 'regular')
    .filter(e => e.item.versao === 'ambas').map(e => e.item.id));
  dlgAdaptada();
};

// Grava de uma vez, e espera a resposta. Conteúdo de item que a pessoa acabou
// de decidir não se grava solto: se o banco recusar, o estado local volta ao
// que era e o diálogo continua aberto, com a escolha na tela.
ACOES['adap-salvar'] = async d => {
  const alterados = [];
  const antes = new Map();
  for (const e of prova(d.id, 'regular')) {
    if (itemAdaptadoDe(e.item.id)) continue;
    const querida = selAdaptada.has(e.item.id) ? 'ambas' : 'regular';
    if (e.item.versao === querida) continue;
    antes.set(e.item.id, e.item.versao);
    e.item.versao = querida;
    alterados.push(e.item);
  }
  if (!alterados.length) { $('#dlg').close(); toast('Nada mudou na prova adaptada.'); return; }

  const erro = await PERS.itensAgora(alterados);
  if (erro) {
    for (const i of alterados) i.versao = antes.get(i.id);
    save(S);
    toast('⚠ O banco recusou a gravação: ' + erro);
    return;
  }
  $('#dlg').close();
  commit();
  const total = prova(d.id, 'adaptada').length;
  toast(`Prova adaptada com ${total} ${total === 1 ? 'item' : 'itens'} · ${alterados.length} ${
    alterados.length === 1 ? 'item alterado' : 'itens alterados'}.`);
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
      !cuidaDaRedacao() ? ' Ela é escrita na tela Redação, pela coordenação ou por quem responde pela redação.'
        // Mandar “vá para a tela Redação” quando já se está nela é dar volta no
        // quarteirão: ali o botão está logo acima, e é ele que se aponta.
        : telaAtual() === 'redacao' ? ' Use o botão <b>“✍ Escrever a proposta”</b>, aqui em cima.'
        : ' Escreva-a na tela <a href="#/redacao">Redação</a>, em “✍ Escrever a proposta”.'}</div>`;
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

/* ================= TELA · REDAÇÃO =================
   A proposta existia desde a etapa anterior, mas só como um botão dentro do
   Caderno e só para a coordenação geral. Duas consequências, as duas relatadas
   pela escola: quem tem o papel `redacao` — a pessoa que de fato escreve e
   corrige a redação — não conseguia escrever a proposta de prova nenhuma, e o
   módulo de redação não aparecia em lugar nenhum do menu.

   Aqui ele aparece: a proposta desta prova, o estado das quatro, e o caminho
   para o lançamento das notas. Quem escreve é a coordenação geral ou o papel
   `redacao`; o resto da equipe não vê esta tela — vê a proposta no Caderno,
   como antes. */
const cuidaDaRedacao = () => ehCoord() || ehRedacao();

// Quantas propostas faltam, entre as provas que têm redação. É o número que a
// coordenação e a professora de redação perguntam primeiro.
function balancoDaRedacao() {
  const comRedacao = provasOrdenadas().filter(p => provaTemRedacao(p.id));
  return {
    comRedacao,
    escritas: comRedacao.filter(p => propostaEscrita(p.id)).length,
    faltando: comRedacao.filter(p => !propostaEscrita(p.id))
  };
}

function telaRedacao() {
  const pAtiva = provaAtual();
  if (!pAtiva) {
    $('#app').innerHTML = '<div class="quadro"><div class="miolo"><div class="vazio">Nenhuma prova cadastrada ainda.</div></div></div>';
    return;
  }
  const b = balancoDaRedacao();
  const temRed = provaTemRedacao(pAtiva.id);
  const escrita = propostaEscrita(pAtiva.id);
  const podeEscrever = cuidaDaRedacao();

  const linhas = provasOrdenadas().map(p => {
    const tem = provaTemRedacao(p.id);
    const ok = propostaEscrita(p.id);
    const mots = tem && ok ? motivadoresDe(proposta(p.id)).length : 0;
    const elenco = estudantesDaProva(p.id);
    const lancadas = elenco.filter(e => redLancada(redacaoDe(p.id, e.id))).length;
    return `<tr class="clic" data-acao="ir-para-redacao" data-id="${esc(p.id)}">
      <td><b>${esc(p.serie)}</b>${p.id === pAtiva.id ? ' <span class="chip info">na tela</span>' : ''}</td>
      <td>${esc(p.etapa)}</td>
      <td>${tem ? '✓' : '<span style="color:var(--ink-2)">sem redação</span>'}</td>
      <td>${!tem ? '—' : ok
        ? `<span class="chip ok">escrita</span>`
        : '<span class="chip falta">em branco</span>'}</td>
      <td>${tem && ok ? esc(proposta(p.id).tema).slice(0, 60) || '<span style="color:var(--ink-2)">sem tema</span>' : '—'}</td>
      <td>${tem && ok ? mots : '—'}</td>
      <td>${tem ? `${lancadas}/${elenco.length}` : '—'}</td>
    </tr>`;
  }).join('');

  $('#app').innerHTML = `
  <div class="quadro"><div class="miolo">
    <div class="cab-tela">
      <div><h2>Redação — ${esc(pAtiva.serie)}</h2>
        <span class="sub">${esc(pAtiva.etapa)} · a proposta que o estudante lê e a nota que ele recebe</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${podeEscrever && temRed
          ? `<button class="btn ${escrita ? 'fantasma' : 'rosa'}" data-acao="cad-redacao">✍ ${escrita ? 'Editar a proposta' : 'Escrever a proposta'}</button>`
          : ''}
        <a class="btn fantasma" href="#/caderno" style="text-decoration:none">Ver no caderno</a>
        ${provaTemRedacao(pAtiva.id) ? '<a class="btn fantasma" href="#/correcao" style="text-decoration:none">Lançar notas</a>' : ''}
      </div>
    </div>

    ${!temRed ? `<div class="vazio">A prova de ${esc(pAtiva.serie)} (${esc(pAtiva.etapa)}) está marcada como
      <b>sem redação</b>.${ehCoord() ? ' Isso se muda no Painel, em “⚙ Configurar prova”.' : ''}
      Troque de prova no seletor do menu à esquerda para trabalhar em outra série.</div>`
    : `
    ${b.faltando.length ? `<div class="cartao aviso" style="margin-bottom:16px">
      <h3>${b.faltando.length === 1 ? 'Uma prova está' : `${b.faltando.length} provas estão`} sem proposta</h3>
      <p style="font-size:13px;margin:0">${esc(b.faltando.map(p => p.serie).join(', '))} —
        ${b.faltando.length === 1 ? 'a prova tem redação, mas o tema, o comando e os textos motivadores ainda não foram escritos'
          : 'as provas têm redação, mas o tema, o comando e os textos motivadores ainda não foram escritos'}.
        Sem a proposta, o caderno sai com a folha de redação em branco.</p>
    </div>` : ''}

    <div class="cartao" style="margin-bottom:16px">
      <h3>A proposta de ${esc(pAtiva.serie)}</h3>
      ${htmlPropostaTela(pAtiva.id)}
    </div>`}

    <div class="cartao" style="margin-bottom:16px">
      <h3>A redação nas quatro provas</h3>
      <div style="overflow-x:auto"><table>
        <thead><tr><th>Série</th><th>Etapa</th><th>Tem redação</th><th>Proposta</th><th>Tema</th><th>Motivadores</th><th>Notas lançadas</th></tr></thead>
        <tbody>${linhas}</tbody></table></div>
      <p style="font-size:12.5px;color:var(--ink-2);margin:10px 0 0">Clique numa linha para trabalhar naquela prova.
        ${b.comRedacao.length ? `${b.escritas} de ${b.comRedacao.length} propostas escritas.` : ''}</p>
    </div>
  </div></div>
  <p class="nota-tela"><strong>A proposta é de cada prova:</strong> o 9º ano não escreve sobre o tema da 3ª série.
    Ela sai nas últimas páginas do caderno, em <strong>coluna única</strong>, como no caderno do PAS, e a folha de
    redação do cartão-resposta traz o tema no alto. As notas — <strong>NC</strong> (conteúdo), <strong>NE</strong>
    (erros) e <strong>TL</strong> (total de linhas) — são lançadas em <a href="#/correcao">Correção</a>, e a nota
    final sai da planilha oficial: NR = NC − 2·NE/TL.</p>`;
}
ACOES['ir-para-redacao'] = d => {
  S.provaAtiva = d.id;
  salvarProvaAtiva(d.id);
  save(S);
  render();
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
const PERCENTUAIS_D = [0, 25, 50, 75, 100];
const COLUNAS_CARTAO = 4;
const LINHAS_REDACAO = 30;

/* ---------------- a régua do cartão ----------------
   Quantas linhas cabem numa coluna, e quantos blocos do tipo B cabem na coluna
   ao lado, não são números que se possam chutar. Foram: `42` linhas e `5`
   blocos. A coluna do tipo B comporta QUATRO, e com cinco o último bloco descia
   por cima da ÂNCORA do canto inferior — o quadrado preto que é a referência de
   alinhamento do leitor óptico. Cartão com âncora encoberta é cartão que a
   máquina não alinha, e o defeito só aparece na hora de digitalizar o lote, com
   a prova já aplicada. Apareceu nas provas regulares da 2ª e da 3ª série, que
   são as que têm mais itens.

   Agora a folha se mede, como o caderno já faz com as peças (`medirPecas`):
   monta-se uma folha de mentira fora da tela, medem-se a coluna, a linha e o
   bloco do tipo B nos dois formatos, e a capacidade sai da medida. Mexer no
   desenho pelo CSS passa a reajustar a paginação sozinho, em vez de exigir que
   alguém lembre de reajustar um número aqui. */
const reguasDoCartao = new Map();

// A chave é a prova E o tipo de cartão: o cartão extra leva a grade da
// matrícula no alto da folha, e por isso sobra menos altura para as colunas.
// Medir um e usar no outro devolveria capacidade a mais — o erro que esta
// régua existe para não repetir.
function medirCartao(provaId, extra = false) {
  const chave = `${provaId}/${extra ? 'extra' : 'nominal'}`;
  if (reguasDoCartao.has(chave)) return reguasDoCartao.get(chave);
  // O molde leva o cabeçalho DESTA prova, e campos preenchidos. Com a prova
  // nula os campos saíam vazios, o bloco vazio não ocupa linha nenhuma, e a
  // folha de mentira ficava com o corpo mais alto que a real — capacidade a
  // mais, de novo. O nome do estudante não importa; que exista, importa.
  const est = { nome: 'ESTUDANTE', matricula: '0000-0000', turma: '0ª A', versao: 'regular' };
  const molde = document.createElement('div');
  molde.style.cssText = 'position:absolute;left:-10000pt;top:0;visibility:hidden';

  // A folha de mentira precisa ser IDÊNTICA à impressa: mesmo cabeçalho, mesmas
  // orientações, mesmo rodapé. Ela serve para uma coisa só — dizer a altura que
  // sobra para a coluna, que é o que a capacidade depende.
  const linhaFalsa = n => `<div class="cr-linha"><span class="no">${n}</span>${bolhasDe('A', n)}</div>`;
  const folha = `
    <div class="cr-folha">
      ${cabecalhoCartao(provaId, est, 'régua')}
      ${orientacoesDoCartao(extra)}
      <div class="cr-corpo">
        <div class="cr-ac"><div class="cr-ac-col"><div class="cr-tit">RÉGUA</div>
          ${linhaFalsa(1)}${linhaFalsa(2)}</div></div>
        <div class="cr-bcol"><div class="cr-tit">RÉGUA</div></div>
      </div>
      ${rodapeCartao(est, 1, 1)}
    </div>`;

  // E as peças precisam ser medidas SOLTAS. Dentro da coluna, que é um flex de
  // altura limitada, o bloco do tipo B encolhe para caber — e medi-lo encolhido
  // devolve uma capacidade maior do que a real, que foi como o quinto bloco
  // acabou por cima da âncora. Fora do fluxo, com a largura da coluna e a
  // altura livre, ele mede o que mede de verdade.
  const solta = (classe, largura, blocos) => `
    <div class="cr-bcol${classe}" style="position:absolute;top:0;left:0;height:auto;width:${largura}">
      <div class="cr-tit">RÉGUA</div>${[...Array(blocos).keys()].map(n => blocoTipoB(n + 1)).join('')}</div>`;
  // A folha do tipo D tem orientações mais curtas — e portanto outra altura
  // útil. Duas pautas de tamanhos diferentes dão, por subtração, a altura fixa
  // do bloco (cabeçalho e quadro do corretor) e a altura de uma linha de pauta.
  const folhaD = `
    <div class="cr-folha">
      ${cabecalhoCartao(provaId, est, 'régua')}
      ${orientacoesDiscursivas()}
      <div class="cr-d-util" style="flex:1;overflow:hidden">
        ${blocoDiscursivo(1, 'régua', 10)}${blocoDiscursivo(2, 'régua', 20)}
      </div>
      ${rodapeCartao(est, 1, 1)}
    </div>`;
  molde.innerHTML = `<div class="cr-previa" style="padding:0;background:none;overflow:visible;position:relative">
    ${folha}${folhaD}${solta('', '118pt', 3)}${solta(' duplo', '126pt', 4)}</div>`;
  document.body.appendChild(molde);

  const ret = el => el.getBoundingClientRect();
  // Quantas peças de passo `passo` cabem na caixa, descontado o que vem antes da
  // primeira (o padding da caixa e o título) e o padding de baixo.
  const cabem = (alturaUtil, inicio, passo, altura) =>
    Math.max(1, Math.floor((alturaUtil - inicio - altura) / passo) + 1);

  const alturaDaCaixa = cx => {
    const r = ret(cx), e = getComputedStyle(cx);
    return r.height - (parseFloat(e.paddingBottom) || 0) - (parseFloat(e.borderBottomWidth) || 0);
  };
  // `inicio` e `passo` da série solta, transpostos para a caixa de verdade.
  const medidas = (cx, primeiro, seguinte) => ({
    inicio: ret(primeiro).top - ret(cx).top,
    passo: ret(seguinte).top - ret(primeiro).top,
    altura: ret(primeiro).height
  });

  const [caixaB, soltaSimples, soltaDupla] = [...molde.querySelectorAll('.cr-bcol')];
  const linhas = [...molde.querySelectorAll('.cr-ac-col .cr-linha')];
  const colA = molde.querySelector('.cr-ac-col');
  const bsS = [...soltaSimples.querySelectorAll('.cr-bloco-b')];
  const bsD = [...soltaDupla.querySelectorAll('.cr-bloco-b')];

  const mA = medidas(colA, linhas[0], linhas[1]);
  const mS = medidas(soltaSimples, bsS[0], bsS[1]);
  // No formato duplo os blocos vão dois a dois: o passo de LINHA é do 1º ao 3º.
  const mD = medidas(soltaDupla, bsD[0], bsD[2]);

  // Folha do tipo D: `d10` e `d20` são o mesmo bloco com 10 e com 20 linhas de
  // pauta; a diferença entre eles é 10 linhas, e o que sobra é a parte fixa.
  const [d10, d20] = [...molde.querySelectorAll('.cr-d')];
  const linhaDaPauta = (ret(d20).height - ret(d10).height) / 10;
  const regua = {
    alturaUtilD: ret(molde.querySelector('.cr-d-util')).height,
    linhaDaPauta,
    baseD: ret(d10).height - 10 * linhaDaPauta,
    linhasPorColuna: cabem(alturaDaCaixa(colA), mA.inicio, mA.passo, mA.altura),
    blocosBPorColuna: cabem(alturaDaCaixa(caixaB), mS.inicio, mS.passo, mS.altura),
    blocosBPorFolha: 2 * cabem(alturaDaCaixa(caixaB), mD.inicio, mD.passo, mD.altura)
  };
  molde.remove();
  reguasDoCartao.set(chave, regua);
  return regua;
}

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
      <div data-campo="matricula"><span>MATRÍCULA</span><b>${esc(est.matricula)}</b></div>
      <div><span>TURMA</span><b>${esc(est.turma)}</b></div>
      <div><span>PROVA</span><b>${esc((c.serie || '').toUpperCase())}</b></div>
      <div><span>VERSÃO</span><b>${codigoDaVersao(est.versao)}</b></div>
    </div>
    <div class="cr-sala"><small>SALA</small><i></i></div>
  </div>
  <div class="cr-faixa">${faixa}</div>
  <div class="cr-ancoras"><i></i><i></i></div>`;
}

/* ---------------- a faixa de identificação ----------------
   O rodapé imprimia `▮▯▮▮▯▮▮▯` — oito blocos iguais em toda folha de toda
   prova, decoração com cara de código de barras. O contrato de dados do leitor
   (desktop/docs/contrato-dados.md) já a chamava de “faixa de blocos” e previa
   lê-la; não havia o que ler. Sem ela, a folha NOMINAL não se identifica
   sozinha, e cada lote custaria ao operador digitar uma matrícula por folha.

   Agora os blocos carregam: versão, tipo de cartão, número da folha, total de
   folhas e os dígitos da matrícula — com CRC-8 no fim. O CRC é o que separa
   “não consegui ler” de “li errado”: folha torta, dobrada ou digitalizada pela
   metade falha no CRC e vai para a conferência, em vez de lançar as marcações
   de um estudante na linha de outro.

   A matrícula entra só com seus DÍGITOS (`2026-0142` → `20260142`): o código é
   numérico, e a pontuação é enfeite de exibição. Quem casa isso de volta com o
   elenco é a importação, que compara por dígitos quando o texto não bate. */
const CODIGO_SINC = [1, 0, 1, 0];
const CODIGO_DIGITOS = 12;          // teto de dígitos da matrícula no código
const CARTAO_NOMINAL = 0, CARTAO_EXTRA = 1, CARTAO_GABARITO = 2;

const digitosDaMatricula = m => String(m || '').replace(/\D/g, '').slice(0, CODIGO_DIGITOS);

const tipoDoCartao = est =>
  est.gabarito ? CARTAO_GABARITO : est.extra ? CARTAO_EXTRA : CARTAO_NOMINAL;

// CRC-8/ATM (polinômio 0x07, sem reflexão) sobre os bits do corpo, completados
// com zeros até fechar bytes. A mesma conta existe em desktop/src/leitor/codigo.py
// — se uma das duas mudar, a outra tem de mudar junto.
function crc8DosBits(bits) {
  let crc = 0;
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] || 0);
    crc ^= byte;
    for (let v = 0; v < 8; v++) crc = (crc & 0x80) ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

// Os bits da folha, na ordem em que os blocos são impressos.
function bitsDaFolha(est, folha, total) {
  const dig = digitosDaMatricula(est.matricula);
  const campos = [
    [est.versao === 'adaptada' ? 1 : 0, 1],
    [tipoDoCartao(est), 2],
    [Math.min(15, folha), 4],
    [Math.min(15, total), 4],
    [dig.length, 4]
  ];
  for (let i = 0; i < CODIGO_DIGITOS; i++) campos.push([i < dig.length ? +dig[i] : 0, 4]);
  const corpo = [];
  for (const [valor, largura] of campos)
    for (let b = largura - 1; b >= 0; b--) corpo.push((valor >> b) & 1);
  const crc = crc8DosBits(corpo);
  return [...CODIGO_SINC, ...corpo, ...Array.from({ length: 8 }, (_, i) => (crc >> (7 - i)) & 1)];
}

const CELULAS_DO_CODIGO = CODIGO_SINC.length + 15 + 4 * CODIGO_DIGITOS + 8;

function faixaDeIdentificacao(est, folha, total) {
  return `<span class="cr-codigo">${bitsDaFolha(est, folha, total)
    .map((b, i) => `<i class="${b ? 'c' : ''}" data-cel="${i}"></i>`).join('')}</span>`;
}

function rodapeCartao(est, folha, total) {
  return `
  <div class="cr-ancoras"><i></i><i></i></div>
  <div class="cr-rodape">
    ${faixaDeIdentificacao(est, folha, total)}
    <span>folha ${folha} de ${total}</span>
  </div>`;
}

/* Todo alvéolo diz o que é em `data-alv`, e é por aí que a exportação do
   gabarito descobre a geometria (`mapaDoCartao`) e que o cartão-gabarito sabe
   qual preencher. Quatro formas, uma linha cada:
     i:<item>:<resposta>            tipos A e C
     b:<item>:<C|D|U>:<algarismo>   tipo B, na coluna da direita
     m:<posição>:<algarismo>        matrícula do cartão extra
     d:<item>:<percentual>          percentual de acerto, folha discursiva
   Os alvéolos do quadro “exemplo de preenchimento” NÃO levam atributo: são
   desenho, e medi-los poria dois alvos falsos no molde do leitor. */
function bolhasDe(tipo, numero) {
  return TIPOS[tipo].respostas.map(r =>
    `<span class="bolha" data-alv="i:${numero}:${r}"></span><span>${r}</span>`).join('');
}

// A grade de um item do tipo B: centena, dezena e unidade, dez algarismos cada.
// Uma função só porque a régua (`medirCartao`) precisa medir EXATAMENTE o mesmo
// desenho que vai impresso — bloco de mentira com outra altura daria capacidade
// errada, que é o defeito que a régua existe para não repetir.
// O bloco de orientações do alto da folha objetiva. Vale uma função porque a
// régua (`medirCartao`) tem de montar uma folha idêntica à impressa: ele ocupa
// uns 60pt do corpo, e medir sem ele daria uma coluna 60pt mais alta do que a
// real — capacidade a mais, e conteúdo por cima da âncora.
// A matrícula em alvéolos, para o cartão que sai sem identificação impressa.
// Nove posições porque a matrícula da escola tem nove dígitos; dez linhas
// porque cada posição vai de 0 a 9. O desenho é o mesmo do bloco do tipo B —
// dígito à esquerda, alvéolos embaixo —, e o alvéolo tem o tamanho de todos os
// outros da folha: quem preenche não deve encontrar dois tamanhos de círculo, e
// o leitor óptico procura um alvo só.
const DIGITOS_DA_MATRICULA = 9;

function gradeDaMatricula() {
  const cabecalho = `<span></span>${Array.from({ length: DIGITOS_DA_MATRICULA },
    () => '<span class="cr-mat-caixa"></span>').join('')}`;
  const linhas = Array.from({ length: 10 }, (_, d) => `
      <span class="dig">${d}</span>${Array.from({ length: DIGITOS_DA_MATRICULA },
        (_, pos) => `<span class="cel"><span class="bolha" data-alv="m:${pos}:${d}"></span></span>`).join('')}`).join('');
  return `
          <div class="cr-mat">
            <h6>MATRÍCULA <small>escreva o número e preencha os alvéolos</small></h6>
            <div class="cr-mat-grade">${cabecalho}${linhas}</div>
          </div>`;
}

// `extra` é o cartão sem identificação impressa: no lugar do nome já escrito,
// ele traz a grade da matrícula para quem o usar preencher. O resto da folha é
// o mesmo — mesmas colunas, mesmos alvéolos, mesma ordem dos itens.
function orientacoesDoCartao(extra = false) {
  return `
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
          ${extra ? gradeDaMatricula() : ''}
        </div>`;
}

function blocoTipoB(numero) {
  return `
      <div class="cr-bloco-b">
        <h6>ITEM ${numero}</h6>
        <div class="cr-bgrade">
          <span></span><span class="cab">C</span><span class="cab">D</span><span class="cab">U</span>
          ${Array.from({ length: 10 }, (_, d) => `
            <span class="dig">${d}</span>
            ${['C', 'D', 'U'].map(c =>
              `<span class="cel"><span class="bolha" data-alv="b:${numero}:${c}:${d}"></span></span>`).join('')}`).join('')}
        </div>
      </div>`;
}

// Folhas objetivas — todos os itens em ordem numérica; só A e C recebem
// bolhas aqui. Quando não cabem numa folha, seguem em folhas de continuação.
function corposObjetivos(pv, provaId, extra) {
  const bs = pv.filter(e => e.item.tipo === 'B');
  const { linhasPorColuna, blocosBPorColuna, blocosBPorFolha } = medirCartao(provaId, extra);
  const porFolha = COLUNAS_CARTAO * linhasPorColuna;
  const quantas = Math.max(Math.ceil(pv.length / porFolha),
                           Math.ceil(bs.length / blocosBPorFolha), 1);
  const corpos = [];
  for (let f = 0; f < quantas; f++) {
    const daFolha = pv.slice(f * porFolha, (f + 1) * porFolha);
    const bsDaFolha = bs.slice(f * blocosBPorFolha, (f + 1) * blocosBPorFolha);
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
          return `<div class="cr-linha"><span class="no">${numero}</span>${bolhasDe(item.tipo, numero)}</div>`;
        }).join('')}
      </div>`).join('');

    const bHtml = bsDaFolha.length ? bsDaFolha.map(({ numero }) => blocoTipoB(numero)).join('')
      : `<div style="font-size:6.5pt;color:#777;text-align:center;padding:8pt 4pt">${
          bs.length ? 'Os itens do tipo B estão nas outras folhas.' : 'Esta prova não tem itens do tipo B.'}</div>`;

    const soB = daFolha.length === 0;
    corpos.push({
      faixa: soB ? 'Caderno de respostas — itens do tipo B (continuação)'
        : `Caderno de respostas — itens dos tipos A, B e C${quantas > 1 ? ` (${f + 1}ª parte)` : ''}`,
      html: `
        ${orientacoesDoCartao(extra)}
        <div class="cr-corpo">
          ${soB ? '' : `<div class="cr-ac">${acHtml}</div>`}
          <div class="cr-bcol${bsDaFolha.length > blocosBPorColuna ? ' duplo' : ''}" ${soB ? 'style="flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:6pt;align-content:start"' : ''}>
            ${soB ? '' : '<div class="cr-tit">ITENS DO TIPO B</div>'}${bHtml}</div>
        </div>`
    });
  }
  return corpos;
}

// Folhas dos discursivos (tipo D): uma pauta por item e as bolhas de
// percentual de acerto. Quebra em mais folhas quando a altura não dá.
// As orientações da folha do tipo D — texto mais curto que o da folha
// objetiva, e por isso altura própria. Função pelo mesmo motivo da outra: a
// régua monta a folha inteira para saber quanto sobra para as pautas.
function orientacoesDiscursivas() {
  return `
      <div class="cr-orient">
        <div class="txt">
          Responda com caneta esferográfica de tinta <b>preta</b>, dentro do espaço reservado a cada item.
          Em caso de erro, risque a palavra com um traço simples e escreva o substitutivo — não use parênteses.
          O quadro de <b>percentual de acerto</b> é de uso exclusivo de quem corrige.
        </div>
      </div>`;
}

function blocoDiscursivo(numero, componente, linhas) {
  return `
          <div class="cr-d">
            <div class="cr-d-cab">
              <b>ITEM ${numero}</b>
              <span>${esc(componente)} · resposta construída</span>
            </div>
            <div class="cr-pauta">${Array.from({ length: linhas }, () => '<i></i>').join('')}</div>
            <div class="cr-nota">
              <b>PERCENTUAL DE ACERTO (uso do corretor)</b>
              ${PERCENTUAIS_D.map(p =>
                `<span class="op"><span class="bolha" data-alv="d:${numero}:${p}"></span>${p}%</span>`).join('')}
            </div>
          </div>`;
}

function corposDiscursivos(pv, provaId, extra) {
  const ds = pv.filter(e => e.item.tipo === 'D');
  if (!ds.length) return [];
  const { alturaUtilD, baseD, linhaDaPauta } = medirCartao(provaId, extra);
  const altura = e => baseD + (e.item.dLinhas || 10) * linhaDaPauta;
  const grupos = [];
  let grupo = [], soma = 0;
  for (const e of ds) {
    const a = altura(e);
    if (grupo.length && soma + a > alturaUtilD) { grupos.push(grupo); grupo = []; soma = 0; }
    grupo.push(e); soma += a;
  }
  if (grupo.length) grupos.push(grupo);

  return grupos.map((g, i) => ({
    faixa: `Caderno de respostas — itens do tipo D (resposta construída)${grupos.length > 1 ? ` (${i + 1}ª parte)` : ''}`,
    html: `
      ${orientacoesDiscursivas()}
      <div style="flex:1;overflow:hidden">
        ${g.map(({ item, numero }) =>
          blocoDiscursivo(numero, item.componente, item.dLinhas || 10)).join('')}
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
  const corpos = [...corposObjetivos(pv, provaId, est.extra), ...corposDiscursivos(pv, provaId, est.extra)];
  // A folha de redação só sai se a prova tiver redação e a coordenação optar
  // por imprimi-la.
  if (p?.temRedacao !== false && p?.imprimirRedacao !== false) corpos.push(corpoRedacao(provaId));
  return corpos;
}

const totalFolhas = (provaId, est) => corposDoCartao(provaId, est).length;

function folhasDoCartao(provaId, est) {
  const corpos = corposDoCartao(provaId, est);
  const html = corpos.map((c, i) => `
    <div class="cr-folha">
      ${cabecalhoCartao(provaId, est, est.gabarito ? `GABARITO — NÃO DISTRIBUIR — ${c.faixa}` : c.faixa)}
      ${c.html}
      ${rodapeCartao(est, i + 1, corpos.length)}
    </div>`).join('');
  return est.gabarito ? marcarGabarito(html, provaId, est.versao) : html;
}

/* A faixa de identificação carrega ALGARISMOS, e nem toda matrícula cabe nela.
   Isso não pode aparecer só no dia de digitalizar o lote: quem imprime tem de
   saber, antes de gastar o papel, quais folhas o leitor não vai conseguir
   identificar sozinho. Três casos, e nenhum é hipotético — a matrícula vem da
   planilha da secretaria, que é texto livre. */
function avisosDaFaixa(elenco) {
  const semDigito = [], compridas = [], porDigitos = new Map();
  for (const e of elenco) {
    const d = digitosDaMatricula(e.matricula);
    if (!d) { semDigito.push(e); continue; }
    if (String(e.matricula).replace(/\D/g, '').length > CODIGO_DIGITOS) compridas.push(e);
    porDigitos.set(d, [...(porDigitos.get(d) || []), e]);
  }
  const ambiguas = [...porDigitos.values()].filter(g => g.length > 1);
  const avisos = [];
  const nomes = g => g.map(e => `${esc(e.nome)} (${esc(e.matricula)})`).join(', ');
  if (semDigito.length) avisos.push(`<b>Sem algarismo nenhum</b> — a faixa fica vazia e a folha
    terá de ser identificada à mão na conferência: ${nomes(semDigito)}.`);
  if (compridas.length) avisos.push(`<b>Mais de ${CODIGO_DIGITOS} algarismos</b> — a faixa leva só os
    ${CODIGO_DIGITOS} primeiros: ${nomes(compridas)}.`);
  for (const g of ambiguas) avisos.push(`<b>Mesmos algarismos</b> — o leitor não distingue estas
    matrículas uma da outra, e vai mandar as duas para conferência: ${nomes(g)}.`);
  return avisos;
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
        ${ehCoord() ? `<button class="btn fantasma" data-acao="cart-extras" ${nRegItens + nAdaItens ? '' : 'disabled'}>🖨 Cartões extras</button>` : ''}
        <button class="btn rosa" data-acao="cart-imprimir" ${filtrados.length && (nRegItens + nAdaItens) ? '' : 'disabled'}>🖨 Imprimir cartões (${filtrados.length})</button>
      </div>
    </div>
    ${(() => { const av = avisosDaFaixa(elenco); return av.length ? `<div class="cartao aviso" style="margin-bottom:16px">
      <h3>Matrículas que a leitura óptica não identifica sozinha</h3>
      ${av.map(a => `<p style="font-size:12.5px;margin:0 0 6px">${a}</p>`).join('')}
      <p style="font-size:12px;color:var(--ink-2);margin:8px 0 0">A prova sai normalmente — o que muda é que
        estas folhas caem na fila de conferência do leitor, para lançamento à mão.</p></div>` : ''; })()}
    ${linhas ? `<table><thead><tr><th>Nome</th><th>Matrícula</th><th>Turma</th><th>Versão</th><th>Folhas</th><th></th></tr></thead>
      <tbody>${linhas}</tbody></table>`
      : `<div class="vazio">Nenhum estudante no elenco da prova de ${esc(pAtiva.serie)}.${ehCoord() ? ' Importe a lista em Administração — a série do CSV é o que liga cada estudante à sua prova.' : ''}</div>`}
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <button class="btn fantasma" data-acao="cart-template">⬇ Exportar gabarito p/ leitor local (JSON)</button>
    </div>
  </div>
  ${previa && (nRegItens + nAdaItens) ? `<div class="cr-previa"><div style="width:100%;text-align:center;font-size:12px;color:#6b5f52;margin-bottom:10px">Prévia — folhas do 1º estudante do filtro</div>${previa}</div>` : ''}
  </div>
  <p class="nota-tela"><strong>A impressão abre com o cartão-gabarito</strong> — uma folha por versão, com os
    alvéolos do gabarito já preenchidos, gerada pelo sistema. Ela não é de estudante nenhum: é a referência com que
    o leitor óptico calibra a tinta desta impressora, confere que o molde corresponde ao papel e confere que a chave
    exportada é a mesma que foi impressa. Guarde-a como se guarda a prova — ela é o gabarito em papel. No rodapé de
    toda folha vai a <strong>faixa de identificação</strong>, os blocos que dizem à máquina a matrícula, a versão e
    o número da folha.</p>
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
  // Uma folha de referência por versão presente no lote, à frente de tudo: é a
  // primeira coisa que o leitor óptico encontra e a partir da qual ele calibra
  // a tinta e confere o molde. Versão que não tem estudante no filtro não gera
  // referência — seria papel gasto com a chave de uma prova que ninguém fará.
  const versoes = [...new Set(filtrados.map(e => e.versao === 'adaptada' ? 'adaptada' : 'regular'))]
    .sort().filter(v => prova(pAtiva.id, v).length);
  const referencia = versoes.map(v => folhasDoCartao(pAtiva.id, cartaoGabarito(v))).join('');
  $('#print-area').innerHTML = referencia + filtrados.map(e => folhasDoCartao(pAtiva.id, e)).join('');
  window.print();
};
/* ---------------- cartões extras, sem identificação ----------------
   Cartão de reserva: sai com a mesma organização do nominal — mesmas colunas,
   mesma ordem de itens, mesmos alvéolos —, mas sem nome impresso. No lugar da
   identificação já escrita vai a grade da matrícula em alvéolos, para quem o
   usar preencher, e o rodapé diz que é extra em vez de repetir uma matrícula
   que não existe.

   Serve para o dia da aplicação (cartão rasgado, estudante que chegou fora da
   lista) e para teste de impressão, que é uso sem risco: imprimir não grava
   nada, e este cartão não pertence a estudante nenhum. */
const cartaoExtra = versao => ({ id: null, nome: '', matricula: '', turma: '', versao, extra: true });

/* ---------------- o cartão-gabarito, à frente do lote ----------------
   Sai automaticamente na frente da impressão, um por versão presente: um cartão
   igual aos outros, com os alvéolos do gabarito já preenchidos. Ele não é
   enfeite nem conferência de olho — é a folha de referência do leitor óptico, e
   faz três coisas que nenhuma outra folha do lote faz:

   1. calibra a tinta DESTA impressora e DESTE scanner. O limiar de “alvéolo
      preenchido” deixa de ser um número escolhido no escuro e passa a sair de
      uma folha onde se sabe, alvéolo por alvéolo, o que devia estar marcado;
   2. confere a geometria. Se o molde exportado não corresponder ao cartão que
      foi impresso, isso aparece já na primeira folha — e não depois de o lote
      inteiro ter sido lançado torto;
   3. confere o próprio gabarito. Se o JSON exportado discordar do que está
      impresso, alguém mexeu nos itens depois de imprimir os cartões, e corrigir
      o lote com a chave errada é o pior desfecho possível desta tela.

   Ele leva a matrícula vazia e o tipo `gabarito` na faixa de identificação, e
   por isso nunca é confundido com folha de estudante — nem na leitura, nem na
   importação, que só aceita matrícula do elenco.

   Uma ressalva que é de quem imprime, não do código: esta folha É a chave da
   prova em papel, e viaja junto com o lote até a aplicação. Guarde-a como se
   guarda a prova. */
const cartaoGabarito = versao => ({
  id: null, nome: 'GABARITO', matricula: '', turma: '—', versao, gabarito: true
});

// Preenche, no HTML já montado, os alvéolos que o gabarito manda marcar. Feito
// sobre a árvore e não por troca de string: quem sabe o que cada alvéolo é são
// os `data-alv`, e lê-los é mais barato e mais seguro do que recortar texto.
function marcarGabarito(html, provaId, versao) {
  const cx = document.createElement('div');
  cx.innerHTML = html;
  const respostaDe = new Map(prova(provaId, versao).map(({ item, numero }) => [numero, item.gabarito]));
  cx.querySelectorAll('.bolha[data-alv]').forEach(alv => {
    const [forma, ...partes] = alv.dataset.alv.split(':');
    const g = respostaDe.get(+partes[0]);
    if (g === undefined || g === null || g === '') return;
    if (forma === 'i' && String(g).trim().toUpperCase() === partes[1]) alv.classList.add('m');
    if (forma === 'b') {
      const n = String(g).replace(/\D/g, '').padStart(3, '0').slice(-3);
      const coluna = { C: 0, D: 1, U: 2 }[partes[1]];
      if (n[coluna] === partes[2]) alv.classList.add('m');
    }
  });
  return cx.innerHTML;
}

/* ---------------- o molde do leitor: geometria MEDIDA ----------------
   Onde fica cada alvéolo na folha não é número que se possa escrever à mão do
   lado de lá. A posição sai do flex do CSS — muda com o número de itens, com a
   quantidade de colunas, com a altura do bloco de orientações — e um leitor com
   a geometria decorada erraria em silêncio na primeira vez que alguém mexesse
   numa medida do cartão. É o mesmo motivo pelo qual a capacidade da folha se
   mede (`medirCartao`) em vez de se escrever.

   Então quem mede é o navegador, no ato da exportação: monta o cartão de
   verdade fora da tela, lê o retângulo de cada âncora, de cada alvéolo e de
   cada célula do código, e manda tudo em pontos junto com o gabarito. O leitor
   não sabe nada sobre o desenho do cartão — ele recebe o desenho.

   Duas famílias de molde por versão: `nominal` (que serve também ao
   cartão-gabarito, de geometria idêntica) e `extra`, que traz a grade da
   matrícula no alto e por isso empurra o corpo para baixo. */
function mapaDoCartao(provaId) {
  const versoes = ['regular', 'adaptada'].filter(v => prova(provaId, v).length);
  if (!versoes.length) return null;
  const combinacoes = [];
  for (const versao of versoes) {
    combinacoes.push({ versao, familia: 'nominal',
      est: { nome: 'ESTUDANTE DE RÉGUA', matricula: '000000000', turma: '0ª A', versao } });
    combinacoes.push({ versao, familia: 'extra', est: cartaoExtra(versao) });
  }

  const molde = document.createElement('div');
  molde.style.cssText = 'position:absolute;left:-10000pt;top:0;visibility:hidden';
  molde.innerHTML = `<div class="cr-previa" style="padding:0;background:none;overflow:visible">${
    combinacoes.map(c => `<div data-familia>${folhasDoCartao(provaId, c.est)}</div>`).join('')}</div>`;
  document.body.appendChild(molde);

  const familias = [...molde.querySelectorAll('[data-familia]')];
  let ancoras = null, codigo = null, campos = null;

  const medirFolha = folhaEl => {
    const rf = folhaEl.getBoundingClientRect();
    // px → pt pela própria largura da folha, que é 595pt por definição do CSS.
    // Assim a medida não depende do zoom nem da densidade da tela.
    const k = 595 / rf.width;
    const pt = v => Math.round(v * k * 100) / 100;
    const caixa = el => {
      const r = el.getBoundingClientRect();
      return { x: pt(r.left - rf.left), y: pt(r.top - rf.top), largura: pt(r.width), altura: pt(r.height) };
    };
    const centro = el => {
      const c = caixa(el);
      return { x: Math.round((c.x + c.largura / 2) * 100) / 100,
               y: Math.round((c.y + c.altura / 2) * 100) / 100 };
    };

    const dessaFolha = [...folhaEl.querySelectorAll('.cr-ancoras i')].map(centro);
    // As quatro âncoras têm de estar SEMPRE no mesmo lugar, em toda folha de
    // todo cartão — é o que permite ao leitor calcular a homografia antes de
    // saber que folha é aquela, e só então ler o código que lhe diz. Se um dia
    // deixarem de estar, o erro tem de aparecer aqui, na exportação, e não na
    // digitalização do lote.
    if (!ancoras) ancoras = dessaFolha;
    else if (dessaFolha.some((a, i) => Math.abs(a.x - ancoras[i].x) > 0.5 || Math.abs(a.y - ancoras[i].y) > 0.5))
      throw new Error('As âncoras mudaram de lugar entre as folhas do cartão — o leitor conta com elas fixas.');

    const celulas = [...folhaEl.querySelectorAll('.cr-codigo i')];
    if (!codigo && celulas.length)
      codigo = { celulas: celulas.map(centro), largura: caixa(celulas[0]).largura,
                 altura: caixa(celulas[0]).altura, sinc: CODIGO_SINC.join(''), digitos: CODIGO_DIGITOS };
    const campoMat = folhaEl.querySelector('[data-campo="matricula"]');
    if (!campos && campoMat) campos = { matricula: caixa(campoMat) };

    const alveolos = [...folhaEl.querySelectorAll('.bolha[data-alv]')].map(alv => {
      const [forma, ...partes] = alv.dataset.alv.split(':');
      const c = centro(alv), r = Math.round(caixa(alv).largura / 2 * 100) / 100;
      if (forma === 'i') return { ...c, r, item: +partes[0], valor: partes[1] };
      if (forma === 'b') return { ...c, r, item: +partes[0], coluna: partes[1], digito: +partes[2] };
      if (forma === 'm') return { ...c, r, campo: 'matricula', posicao: +partes[0], digito: +partes[1] };
      return { ...c, r, item: +partes[0], percentual: +partes[1] };
    });
    const faixa = folhaEl.querySelector('.cr-faixa')?.textContent || '';
    return {
      tipo: /tipo d/i.test(faixa) ? 'discursiva' : /redação/i.test(faixa) ? 'redacao' : 'objetiva',
      alveolos
    };
  };

  try {
    const cartoes = {};
    combinacoes.forEach((c, i) => {
      const folhas = [...familias[i].querySelectorAll('.cr-folha')].map(medirFolha);
      (cartoes[c.versao] = cartoes[c.versao] || {})[c.familia] = { folhas };
    });
    return {
      unidade: 'pt',
      folhaPt: { largura: 595, altura: 842 },
      ancoras, codigo, campos, cartoes,
      observacao: 'Medido pelo navegador na exportação. O cartão-gabarito usa o molde `nominal`.'
    };
  } finally {
    molde.remove();
  }
}

ACOES['cart-extras'] = () => {
  const p = provaAtual();
  if (!p) return;
  const temAda = prova(p.id, 'adaptada').length > 0;
  abrirDlg(`
    <div class="dlg-cab"><h2>Cartões extras — ${esc(p.serie)}</h2>
      <button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
    <div class="dlg-corpo">
      <p style="font-size:12.5px;color:var(--ink-2);margin:0 0 12px">Cartões <b>sem identificação impressa</b>,
        com a mesma organização dos nominais. Quem usar escreve o nome nas linhas do alto e preenche a
        <b>matrícula nos alvéolos</b> — são ${DIGITOS_DA_MATRICULA} dígitos. Servem de reserva na aplicação
        e para teste de impressão.</p>
      <div class="form-linha">
        <div class="campo"><label>Quantos cartões</label>
          <input class="caixa" type="number" min="1" max="60" id="ex-qtd" value="5"></div>
        <div class="campo"><label>Versão</label>
          <select class="caixa" id="ex-versao">
            <option value="regular">A1 — regular</option>
            ${temAda ? '<option value="adaptada">A2 — adaptada</option>' : ''}
          </select></div>
      </div>
    </div>
    <div class="dlg-pe"><button class="btn fantasma" data-acao="fechar-dlg">Cancelar</button>
      <button class="btn" data-acao="cart-extras-imprimir" data-id="${esc(p.id)}">Imprimir</button></div>`);
};

ACOES['cart-extras-imprimir'] = d => {
  const qtd = Math.min(60, Math.max(1, parseInt($('#ex-qtd').value, 10) || 1));
  const versao = $('#ex-versao').value === 'adaptada' ? 'adaptada' : 'regular';
  const folhas = Array.from({ length: qtd }, () => folhasDoCartao(d.id, cartaoExtra(versao))).join('');
  $('#dlg').close();
  $('#print-area').innerHTML = folhas;
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
  // v4: além de dizer de que prova é, o arquivo passa a levar a GEOMETRIA medida
  // do cartão — onde está cada âncora, cada alvéolo e cada célula da faixa de
  // identificação. Sem ela o leitor teria de guardar o desenho do cartão do lado
  // dele, e erraria calado na primeira mudança de medida daqui.
  let layout = null;
  try { layout = mapaDoCartao(pAtiva.id); }
  catch (e) { toast(`Não deu para medir o cartão: ${e.message}`); return; }
  const tpl = {
    formato: 'pas-marista/gabarito-v4',
    prova: { id: pAtiva.id, serie: pAtiva.serie, etapa: pAtiva.etapa, nome: pAtiva.nome },
    simulado: pAtiva.nome, etapa: pAtiva.etapa,
    geradoEm: new Date().toISOString(),
    identificacao: {
      chave: 'matricula',
      ancoras: 'quatro quadrados pretos, dois no topo e dois no rodapé de cada folha',
      // O cartão extra sai sem nome impresso e traz a matrícula em alvéolos —
      // é por ela que o leitor descobre de quem é a folha. Some deles o
      // cabeçalho nominal, então a área de respostas começa mais abaixo: para o
      // leitor são dois moldes, e é isto que avisa.
      cartaoExtra: {
        descricao: 'cartão de reserva, sem identificação impressa',
        matriculaEmAlveolos: { posicoes: DIGITOS_DA_MATRICULA, digitos: 10, ordem: 'da esquerda para a direita' },
        rodape: 'preenchida nos alvéolos pelo estudante'
      },
      // A faixa de blocos do rodapé, que em v3 ainda era decoração. A ordem dos
      // campos é a ordem em que os blocos são impressos, da esquerda para a
      // direita; o CRC-8 fecha o código.
      faixa: {
        celulas: CELULAS_DO_CODIGO,
        sinc: CODIGO_SINC.join(''),
        campos: [
          { nome: 'versao', bits: 1, valores: { 0: 'regular', 1: 'adaptada' } },
          { nome: 'tipo', bits: 2, valores: { [CARTAO_NOMINAL]: 'nominal', [CARTAO_EXTRA]: 'extra', [CARTAO_GABARITO]: 'gabarito' } },
          { nome: 'folha', bits: 4 },
          { nome: 'total', bits: 4 },
          { nome: 'nDigitos', bits: 4 },
          { nome: 'matricula', bits: 4 * CODIGO_DIGITOS, formato: `${CODIGO_DIGITOS} algarismos BCD` },
          { nome: 'crc8', bits: 8, formato: 'CRC-8/ATM (0x07) sobre os campos acima, completados com zeros até fechar bytes' }
        ]
      }
    },
    // O cartão-gabarito: uma folha por versão, à frente do lote impresso, com os
    // alvéolos do gabarito preenchidos. É por ela que o leitor calibra o limiar
    // de tinta e confere que o molde e a chave correspondem ao papel.
    referencia: {
      descricao: 'cartão-gabarito impresso à frente do lote, com os alvéolos do gabarito preenchidos',
      tipoNaFaixa: CARTAO_GABARITO,
      molde: 'nominal'
    },
    layout,
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
        A proposta desta prova ainda não foi escrita — escreva-a na tela <a href="#/redacao">Redação</a>,
        para que ela saia no caderno e apareça a quem corrige.</p>`}
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
  // A matrícula chega do leitor em ALGARISMOS: a faixa de identificação do
  // rodapé é numérica, e `2026-0142` volta de lá como `20260142`. O texto exato
  // continua valendo primeiro — quem digita o CSV à mão copia da tela —, e os
  // dígitos são a segunda tentativa. Dois estudantes cujas matrículas só se
  // distinguem pela pontuação ficam de fora das duas: `null` marca o empate, e
  // recusar a linha é melhor do que lançar a prova de um na conta do outro.
  const porTexto = new Map(elenco.map(e => [e.matricula, e]));
  const porDigitos = new Map();
  for (const e of elenco) {
    const d = digitosDaMatricula(e.matricula);
    if (d) porDigitos.set(d, porDigitos.has(d) ? null : e);
  }
  const mapaProva = {};
  const afetados = new Set();
  let ok = 0, ign = 0, fora = 0;
  for (const l of linhas) {
    const [mat, no, resp] = l.split(/[;,\t]/).map(x => (x || '').trim());
    // Só o elenco desta prova: uma folha da 3ª série lida por engano no
    // lançamento do 9º ano é recusada em vez de gravar nota no lugar errado.
    const est = porTexto.get(mat) || porDigitos.get(digitosDaMatricula(mat)) || null;
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

// Senha provisória: sorteada por conta, nunca escrita no código.
//
// Já houve uma constante aqui — a mesma senha para todo mundo, e num arquivo
// que o navegador baixa de qualquer lugar do mundo sem entrar. Quem lesse
// `js/app.js` entrava como qualquer pessoa da equipe que ainda não tivesse
// trocado a sua, e são justamente as contas recém-criadas que ainda não
// trocaram. Senha de acesso não pode ser um valor literal do repositório.
//
// Três palavras e quatro dígitos: ~27 bits sorteados por `crypto`, e ainda
// ditável por telefone, que é como a coordenação a entrega.
function senhaProvisoria() {
  const palavras = [
    'cerrado', 'vereda', 'buriti', 'marista', 'sertao', 'aguas', 'pauta', 'ipe',
    'lobo', 'chapada', 'pequi', 'aroeira', 'jatoba', 'sucupira', 'tucano', 'seriema',
    'cagaita', 'gabiroba', 'canela', 'angico', 'jacaranda', 'copaiba', 'murici', 'baru'
  ];
  const n = new Uint32Array(4);
  crypto.getRandomValues(n);
  const p = i => palavras[n[i] % palavras.length];
  return p(0).charAt(0).toUpperCase() + p(0).slice(1) +
    '-' + p(1) + '-' + p(2) + '-' + (1000 + (n[3] % 9000));
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
          <input class="caixa" id="eq-senha" value="${senhaProvisoria()}" style="font-family:var(--mono)"></div>
        <p style="font-size:12.5px;color:var(--ink-2);margin:0">Sorteada agora, só para esta pessoa. A conta é criada já
          liberada — nenhum e-mail de confirmação é enviado. Entregue esta senha a ela;
          <b>o sistema exige que ela crie a própria senha no primeiro acesso</b>.</p>`
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
    await recarregarEquipe();
    // Em diálogo, não em toast: o toast some em dois segundos e leva junto a
    // única cópia da senha — a coordenação teria de gerar outra para conseguir
    // ditá-la.
    abrirDlg(`
      <div class="dlg-cab"><h2>Senha redefinida</h2><button class="fechar-x" data-acao="fechar-dlg">✕</button></div>
      <div class="dlg-corpo">
        <p style="margin-top:0">Entregue a nova senha a <b>${esc(d.email)}</b>:</p>
        <div class="cartao" style="font-family:var(--mono);font-size:15px">${esc(senha)}</div>
        <p style="font-size:12.5px;color:var(--ink-2)">A senha aparece só agora, e a anterior deixou de funcionar.
          No próximo acesso o sistema exige que a pessoa crie a própria senha.</p>
      </div>
      <div class="dlg-pe"><button class="btn" data-acao="fechar-dlg">Fechar</button></div>`);
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
  if (botao) botao.disabled = true;
  try {
    await nuvem.trocarSenha(a);
    await nuvem.marcarSenhaTrocada();
    S.perfil.trocarSenha = false;
    toast('Senha criada. Bem-vindo!');
    render();
  } catch (e) {
    if (botao) botao.disabled = false;
    // A senha provisória é sorteada por conta e o cliente não a conhece aqui —
    // quem recusa a repetição é o próprio Supabase, e a recusa dele vem em
    // inglês. Traduzida, porque é o aviso que a pessoa mais vai ver.
    const msg = String(e.message || e);
    toast(/should be different|same.*password/i.test(msg)
      ? 'Escolha uma senha diferente da provisória.'
      : 'Não foi possível salvar a senha: ' + msg);
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
    { cena: 'redacao', tela: 'redacao', titulo: 'Redação',
      texto: 'A proposta de cada prova — tema, comando e textos motivadores — mora aqui, e a tela mostra quais das quatro séries ainda estão sem proposta. Quem tem o papel “professora de redação” também escreve por esta tela.' },
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
      texto: 'Seu acesso é focado na redação: você escreve a proposta de cada prova e lança as notas de cada estudante.' },
    { cena: 'redacao', tela: 'redacao', titulo: 'Redação',
      texto: 'Esta é a sua tela. Nela você escreve a proposta de cada prova — tema, comando e os textos motivadores que o estudante vai ler — e vê, de uma vez, quais das quatro provas ainda estão sem proposta. A proposta sai nas últimas páginas do caderno, em coluna única, como no caderno do PAS.' },
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

