-- Allowlist da equipe do PAS: só e-mails liberados pela coordenação criam conta,
-- e o papel de cada pessoa é definido aqui (não pelo próprio usuário no cadastro).
create table if not exists public.equipe (
  email       text primary key,
  nome        text not null default '',
  papel       text not null default 'docente'
              check (papel in ('coordenacao', 'docente', 'redacao')),
  componente  text,
  criado_em   timestamptz not null default now()
);

-- E-mail sempre normalizado em minúsculas.
create or replace function public.equipe_normaliza_email()
returns trigger language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  return new;
end $$;

drop trigger if exists equipe_normaliza on public.equipe;
create trigger equipe_normaliza before insert or update on public.equipe
  for each row execute function public.equipe_normaliza_email();

-- Quem é coordenação? SECURITY DEFINER para não recorrer na própria política.
create or replace function public.eh_coordenacao()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.equipe
    where email = lower(auth.jwt() ->> 'email') and papel = 'coordenacao'
  );
$$;

alter table public.equipe enable row level security;

drop policy if exists "equipe visivel a autenticados" on public.equipe;
create policy "equipe visivel a autenticados" on public.equipe
  for select to authenticated using (true);

drop policy if exists "coordenacao gerencia equipe" on public.equipe;
create policy "coordenacao gerencia equipe" on public.equipe
  for all to authenticated
  using (public.eh_coordenacao()) with check (public.eh_coordenacao());

-- Bloqueia cadastro de e-mail que a coordenação não liberou.
create or replace function public.checar_email_autorizado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.equipe where email = lower(trim(new.email))) then
    raise exception 'E-mail nao liberado pela coordenacao do PAS: %', new.email
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists equipe_autorizada on auth.users;
create trigger equipe_autorizada before insert on auth.users
  for each row execute function public.checar_email_autorizado();

-- Coordenação inicial.
insert into public.equipe (email, nome, papel)
values ('raul.cardoso@gmail.com', 'Raul', 'coordenacao')
on conflict (email) do update set papel = 'coordenacao';
