// Driver de nuvem (Supabase) — fase 2 do plano de implantação.
// Espelha o estado do app em tabelas jsonb (uma linha por texto/item/
// estudante/resposta), com login por conta e RLS "somente autenticados".
// O app continua operando sobre o estado em memória (S) e chama estas
// funções em cada mutação — granularidade por linha evita que duas pessoas
// editando coisas diferentes se sobrescrevam.

let sb = null;
let sessao = null;

function conectado() { return !!sb; }
function usuario() { return sessao?.user || null; }

// Carrega a biblioteca supabase-js a partir da cópia versionada no próprio
// repositório (js/vendor/) — o sistema não depende de nenhuma CDN externa.
async function carregarLib() {
  if (window.supabase?.createClient) return window.supabase;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = new URL('vendor/supabase.js', import.meta.url).href;
    s.onload = res;
    s.onerror = () => rej(new Error('não foi possível carregar js/vendor/supabase.js'));
    document.head.appendChild(s);
  });
  if (!window.supabase?.createClient) throw new Error('js/vendor/supabase.js não expôs createClient');
  return window.supabase;
}

async function iniciar(url, chave) {
  const m = await carregarLib();
  sb = m.createClient(url, chave);
  const { data } = await sb.auth.getSession();
  sessao = data.session || null;
  sb.auth.onAuthStateChange((_ev, s) => { sessao = s; });
  return sessao;
}

async function entrar(email, senha) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  sessao = data.session;
  return sessao;
}

async function sair() {
  await sb.auth.signOut();
  sessao = null;
}

// Troca da própria senha (qualquer pessoa da equipe, já autenticada).
async function trocarSenha(nova) {
  const { error } = await sb.auth.updateUser({ password: nova });
  if (error) throw error;
}

function checar(r) { if (r.error) throw r.error; return r; }

/* ---------------- equipe (allowlist + papéis) ---------------- */
// A tabela public.equipe define quem entra e com qual papel. Todo mundo
// autenticado lê; só a coordenação escreve (regra de RLS no banco).
async function carregarEquipe() {
  const { data } = checar(await sb.from('equipe').select('email,nome,papel,area,componente,trocar_senha,tutorial_visto').order('nome'));
  return data || [];
}

// Nome/papel/componente de quem já tem conta: escrita direta (RLS libera só
// a coordenação). Criar conta e trocar senha exigem a Edge Function.
async function gravarMembro(m) {
  checar(await sb.from('equipe').upsert(m));
}

// Primeiro acesso: a pessoa não pode editar a própria linha da equipe (mudaria
// o próprio papel), então estes dois campos são marcados por funções do banco
// restritas à conta que chama.
async function marcarSenhaTrocada() { checar(await sb.rpc('marcar_senha_trocada')); }
async function marcarTutorialVisto() { checar(await sb.rpc('marcar_tutorial_visto')); }

// Criação/edição de contas passa pela Edge Function `equipe`, única a
// conhecer a chave de serviço. O navegador só envia o próprio JWT.
async function chamarEquipe(corpo) {
  const { data, error } = await sb.functions.invoke('equipe', { body: corpo });
  if (error) {
    // O corpo da resposta traz a mensagem útil; o erro genérico, não.
    let detalhe = '';
    try { detalhe = (await error.context?.json())?.erro || ''; } catch { /* sem corpo */ }
    throw new Error(detalhe || error.message);
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}

const criarConta    = (dados)        => chamarEquipe({ acao: 'criar', ...dados });
const redefinirSenha = (email, senha) => chamarEquipe({ acao: 'senha', email, senha });
const removerMembro  = (email)        => chamarEquipe({ acao: 'remover', email });

async function carregarTudo() {
  const [cfg, tx, it, es, rp] = await Promise.all([
    sb.from('simulado_config').select('dados').eq('id', 1).maybeSingle(),
    sb.from('textos').select('dados'),
    sb.from('itens').select('dados'),
    sb.from('estudantes').select('dados'),
    sb.from('respostas').select('est_id,dados')
  ].map(p => p.then(checar)));
  return {
    config: cfg.data?.dados || null,
    textos: (tx.data || []).map(r => r.dados),
    itens: (it.data || []).map(r => r.dados).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)),
    estudantes: (es.data || []).map(r => r.dados),
    respostas: Object.fromEntries((rp.data || []).map(r => [r.est_id, r.dados]))
  };
}

async function gravarConfig(dados) {
  checar(await sb.from('simulado_config').upsert({ id: 1, dados }));
}
async function gravarLinha(tabela, dados) {
  checar(await sb.from(tabela).upsert({ id: dados.id, dados }));
}
async function gravarLinhas(tabela, lista) {
  if (!lista.length) return;
  checar(await sb.from(tabela).upsert(lista.map(d => ({ id: d.id, dados: d }))));
}
async function removerLinha(tabela, id) {
  checar(await sb.from(tabela).delete().eq('id', id));
}
async function gravarResposta(estId, dados) {
  checar(await sb.from('respostas').upsert({ est_id: estId, dados }));
}
async function gravarRespostas(mapa, ids) {
  const linhas = ids.filter(id => mapa[id]).map(id => ({ est_id: id, dados: mapa[id] }));
  if (linhas.length) checar(await sb.from('respostas').upsert(linhas));
}
async function removerResposta(estId) {
  checar(await sb.from('respostas').delete().eq('est_id', estId));
}

// Substituição total (coordenação: zerar, importar backup, carregar exemplo).
async function substituirTudo(S) {
  for (const t of ['textos', 'itens', 'estudantes'])
    checar(await sb.from(t).delete().neq('id', ''));
  checar(await sb.from('respostas').delete().neq('est_id', ''));
  await gravarConfig(S.config);
  await gravarLinhas('textos', S.textos);
  await gravarLinhas('itens', S.itens.map((i, ix) => ({ ...i, ordem: ix })));
  await gravarLinhas('estudantes', S.estudantes);
  await gravarRespostas(S.respostas, Object.keys(S.respostas));
}

export const nuvem = {
  conectado, usuario, iniciar, entrar, sair, trocarSenha,
  carregarTudo, gravarConfig, gravarLinha, gravarLinhas, removerLinha,
  gravarResposta, gravarRespostas, removerResposta, substituirTudo,
  carregarEquipe, gravarMembro, criarConta, redefinirSenha, removerMembro,
  marcarSenhaTrocada, marcarTutorialVisto
};
