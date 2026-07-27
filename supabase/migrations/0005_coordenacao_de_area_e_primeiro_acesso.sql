-- 1) Novo papel: coordenação de área. Quem tem esse papel é docente e revisor
--    da própria área — é quem aprova na etapa "coord. de área" do fluxo.
alter table public.equipe drop constraint if exists equipe_papel_check;
alter table public.equipe add constraint equipe_papel_check
  check (papel in ('coordenacao', 'coordenacao_area', 'docente', 'redacao'));

alter table public.equipe add column if not exists area text;

-- 2) Primeiro acesso: senha provisória obrigatoriamente trocada, e o tutorial
--    de boas-vindas mostrado uma vez.
alter table public.equipe add column if not exists trocar_senha   boolean not null default true;
alter table public.equipe add column if not exists tutorial_visto boolean not null default false;

-- Quem já usa o sistema não é obrigado a trocar nada.
update public.equipe set trocar_senha = false, tutorial_visto = false
  where email = 'vde.aguasclaras@maristabrasil.org';

-- 3) A pessoa não pode editar a própria linha (isso mudaria o próprio papel),
--    mas precisa marcar que já trocou a senha e já viu o tutorial. Duas
--    funções SECURITY DEFINER, restritas a esses dois campos e à própria conta.
create or replace function public.marcar_senha_trocada()
returns void language sql security definer set search_path = public as $$
  update public.equipe set trocar_senha = false
   where email = lower(auth.jwt() ->> 'email');
$$;

create or replace function public.marcar_tutorial_visto()
returns void language sql security definer set search_path = public as $$
  update public.equipe set tutorial_visto = true
   where email = lower(auth.jwt() ->> 'email');
$$;

revoke all on function public.marcar_senha_trocada()  from public, anon;
revoke all on function public.marcar_tutorial_visto() from public, anon;
grant execute on function public.marcar_senha_trocada()  to authenticated;
grant execute on function public.marcar_tutorial_visto() to authenticated;
