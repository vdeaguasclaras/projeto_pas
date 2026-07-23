// Configuração do modo nuvem (fase 2 do plano de implantação).
// A chave abaixo é a chave PUBLICÁVEL do Supabase (segura para código de
// navegador — o acesso real é controlado por login + RLS no banco).
// Com `ativa: false` o sistema roda 100% local (localStorage), como no MVP.
export const NUVEM = {
  ativa: true,
  url: 'https://wtlmkyeukkvviqqrgiei.supabase.co',
  chave: 'sb_publishable_wwVdzEvy0Q-lGoXxbf7rAA_l-5LpBJP'
};
