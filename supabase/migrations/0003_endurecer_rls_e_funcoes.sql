-- 1) search_path fixo nas funções (apontamento do linter do Supabase).
create or replace function public.equipe_normaliza_email()
returns trigger language plpgsql set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  return new;
end $$;

-- 2) Acesso aos dados amarrado à allowlist: não basta ter conta, é preciso
--    continuar na equipe. Se a coordenação remove alguém, o acesso cai junto.
create or replace function public.eh_equipe()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.equipe where email = lower(auth.jwt() ->> 'email')
  );
$$;

do $$
declare t text;
begin
  foreach t in array array['simulado_config', 'textos', 'itens', 'estudantes', 'respostas'] loop
    execute format('drop policy if exists %I on public.%I', 'equipe autenticada', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.eh_equipe()) with check (public.eh_equipe())',
      'somente a equipe do PAS', t);
  end loop;
end $$;

-- 3) Funções internas fora do alcance da API pública.
revoke all on function public.checar_email_autorizado() from public, anon, authenticated;
revoke all on function public.equipe_normaliza_email() from public, anon, authenticated;
revoke all on function public.eh_coordenacao() from public, anon;
revoke all on function public.eh_equipe() from public, anon;
grant execute on function public.eh_coordenacao() to authenticated;
grant execute on function public.eh_equipe() to authenticated;
