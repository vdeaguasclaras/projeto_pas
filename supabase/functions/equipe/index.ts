// Edge Function `equipe` — a coordenação do PAS cria e administra as contas da
// equipe sem depender de envio de e-mail (o Supabase gratuito tem limite baixo
// de mensagens, e a escola precisa liberar acesso na hora).
//
// Só quem está em public.equipe com papel = 'coordenacao' pode chamar. A chave
// de serviço nunca sai daqui: o navegador chama esta função com o próprio JWT.
//
// POST { acao: 'criar'|'senha'|'remover', email, nome?, papel?, componente?, senha? }
import { createClient } from 'jsr:@supabase/supabase-js@2';

const URL_SB = Deno.env.get('SUPABASE_URL')!;
const CHAVE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PAPEIS = ['coordenacao', 'docente', 'redacao'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder({ erro: 'Use POST.' }, 405);

  const autorizacao = req.headers.get('Authorization') || '';
  if (!autorizacao.startsWith('Bearer ')) return responder({ erro: 'Sem credencial.' }, 401);

  const admin = createClient(URL_SB, CHAVE_SERVICO, { auth: { persistSession: false } });

  // Quem está chamando?
  const { data: quem, error: erroQuem } = await admin.auth.getUser(autorizacao.replace('Bearer ', ''));
  if (erroQuem || !quem?.user?.email) return responder({ erro: 'Credencial inválida.' }, 401);
  const emailChamador = quem.user.email.toLowerCase();

  const { data: membroChamador } = await admin
    .from('equipe').select('papel').eq('email', emailChamador).maybeSingle();
  if (membroChamador?.papel !== 'coordenacao')
    return responder({ erro: 'Apenas a coordenação pode administrar contas.' }, 403);

  let corpo: Record<string, string>;
  try { corpo = await req.json(); } catch { return responder({ erro: 'JSON inválido.' }, 400); }

  const acao = String(corpo.acao || '');
  const email = String(corpo.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return responder({ erro: 'Informe um e-mail válido.' }, 400);

  // Localiza a conta existente (a API de admin não busca por e-mail diretamente).
  const acharConta = async () => {
    for (let pagina = 1; pagina <= 20; pagina++) {
      const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
      if (error) throw error;
      const achou = data.users.find((u) => (u.email || '').toLowerCase() === email);
      if (achou) return achou;
      if (data.users.length < 200) return null;
    }
    return null;
  };

  try {
    if (acao === 'criar') {
      const papel = PAPEIS.includes(String(corpo.papel)) ? String(corpo.papel) : 'docente';
      const nome = String(corpo.nome || '').trim() || email.split('@')[0];
      const componente = papel === 'docente' ? (String(corpo.componente || '').trim() || null) : null;
      const senha = String(corpo.senha || '');
      if (senha.length < 8) return responder({ erro: 'A senha provisória precisa de ao menos 8 caracteres.' }, 400);

      // A allowlist precisa existir antes: o gatilho em auth.users a exige.
      const { error: erroEquipe } = await admin.from('equipe')
        .upsert({ email, nome, papel, componente });
      if (erroEquipe) throw erroEquipe;

      const jaExiste = await acharConta();
      if (jaExiste) {
        await admin.auth.admin.updateUserById(jaExiste.id, { password: senha, email_confirm: true });
        return responder({ ok: true, criada: false, mensagem: 'Conta já existia — senha redefinida.' });
      }
      const { error } = await admin.auth.admin.createUser({
        email, password: senha, email_confirm: true, user_metadata: { nome, papel, componente }
      });
      if (error) throw error;
      return responder({ ok: true, criada: true });
    }

    if (acao === 'senha') {
      const senha = String(corpo.senha || '');
      if (senha.length < 8) return responder({ erro: 'A senha provisória precisa de ao menos 8 caracteres.' }, 400);
      const conta = await acharConta();
      if (!conta) return responder({ erro: 'Esta pessoa ainda não tem conta criada.' }, 404);
      const { error } = await admin.auth.admin.updateUserById(conta.id, { password: senha, email_confirm: true });
      if (error) throw error;
      return responder({ ok: true });
    }

    if (acao === 'remover') {
      if (email === emailChamador) return responder({ erro: 'Você não pode remover a própria conta.' }, 400);
      const conta = await acharConta();
      if (conta) {
        const { error } = await admin.auth.admin.deleteUser(conta.id);
        if (error) throw error;
      }
      const { error: erroEquipe } = await admin.from('equipe').delete().eq('email', email);
      if (erroEquipe) throw erroEquipe;
      return responder({ ok: true, tinhaConta: !!conta });
    }

    return responder({ erro: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return responder({ erro: (e as Error).message || String(e) }, 500);
  }
});
