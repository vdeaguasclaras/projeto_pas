// Driver de nuvem (Supabase) — fase 2 do plano de implantação.
// Espelha o estado do app em tabelas jsonb (uma linha por texto/item/
// estudante/resposta), com login por conta e RLS "somente autenticados".
// O app continua operando sobre o estado em memória (S) e chama estas
// funções em cada mutação — granularidade por linha evita que duas pessoas
// editando coisas diferentes se sobrescrevam.

let sb = null;
let sessao = null;

export function conectado() { return !!sb; }
export function usuario() { return sessao?.user || null; }

// Carrega a biblioteca supabase-js: primeiro a cópia local (js/vendor/,
// bundle UMD versionado no repositório), com fallback no CDN esm.sh.
async function carregarLib() {
  if (typeof window !== 'undefined' && window.supabase?.createClient) return window.supabase;
  try {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/supabase.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    if (window.supabase?.createClient) return window.supabase;
    throw new Error('vendor sem createClient');
  } catch {
    return await import('https://esm.sh/@supabase/supabase-js@2');
  }
}

export async function iniciar(url, chave) {
  const m = await carregarLib();
  sb = m.createClient(url, chave);
  const { data } = await sb.auth.getSession();
  sessao = data.session || null;
  sb.auth.onAuthStateChange((_ev, s) => { sessao = s; });
  return sessao;
}

export async function entrar(email, senha) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  sessao = data.session;
  return sessao;
}

export async function cadastrar(email, senha, meta) {
  const { data, error } = await sb.auth.signUp({ email, password: senha, options: { data: meta } });
  if (error) throw error;
  if (data.session) sessao = data.session;
  return data;
}

export async function sair() {
  await sb.auth.signOut();
  sessao = null;
}

function checar(r) { if (r.error) throw r.error; return r; }

export async function carregarTudo() {
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

export async function gravarConfig(dados) {
  checar(await sb.from('simulado_config').upsert({ id: 1, dados }));
}
export async function gravarLinha(tabela, dados) {
  checar(await sb.from(tabela).upsert({ id: dados.id, dados }));
}
export async function gravarLinhas(tabela, lista) {
  if (!lista.length) return;
  checar(await sb.from(tabela).upsert(lista.map(d => ({ id: d.id, dados: d }))));
}
export async function removerLinha(tabela, id) {
  checar(await sb.from(tabela).delete().eq('id', id));
}
export async function gravarResposta(estId, dados) {
  checar(await sb.from('respostas').upsert({ est_id: estId, dados }));
}
export async function gravarRespostas(mapa, ids) {
  const linhas = ids.filter(id => mapa[id]).map(id => ({ est_id: id, dados: mapa[id] }));
  if (linhas.length) checar(await sb.from('respostas').upsert(linhas));
}
export async function removerResposta(estId) {
  checar(await sb.from('respostas').delete().eq('est_id', estId));
}

// Substituição total (coordenação: zerar, importar backup, carregar exemplo).
export async function substituirTudo(S) {
  for (const t of ['textos', 'itens', 'estudantes'])
    checar(await sb.from(t).delete().neq('id', ''));
  checar(await sb.from('respostas').delete().neq('est_id', ''));
  await gravarConfig(S.config);
  await gravarLinhas('textos', S.textos);
  await gravarLinhas('itens', S.itens.map((i, ix) => ({ ...i, ordem: ix })));
  await gravarLinhas('estudantes', S.estudantes);
  await gravarRespostas(S.respostas, Object.keys(S.respostas));
}
