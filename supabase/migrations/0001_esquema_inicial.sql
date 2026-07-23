-- Esquema fase 2 — Sistema PAS Marista (aplicado em 23/07/2026 no projeto
-- pas-marista / wtlmkyeukkvviqqrgiei). Mantido aqui como registro versionado.
-- Modelo: uma linha jsonb por entidade (espelha o estado do app web),
-- com RLS "somente usuários autenticados" em todas as tabelas.

create table if not exists public.simulado_config (
  id int primary key,
  dados jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.textos (
  id text primary key, dados jsonb not null, updated_at timestamptz not null default now()
);
create table if not exists public.itens (
  id text primary key, dados jsonb not null, updated_at timestamptz not null default now()
);
create table if not exists public.estudantes (
  id text primary key, dados jsonb not null, updated_at timestamptz not null default now()
);
create table if not exists public.respostas (
  est_id text primary key, dados jsonb not null, updated_at timestamptz not null default now()
);

create or replace function public.tocar_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

alter table public.simulado_config enable row level security;
alter table public.textos enable row level security;
alter table public.itens enable row level security;
alter table public.estudantes enable row level security;
alter table public.respostas enable row level security;

drop policy if exists "equipe autenticada" on public.simulado_config;
drop policy if exists "equipe autenticada" on public.textos;
drop policy if exists "equipe autenticada" on public.itens;
drop policy if exists "equipe autenticada" on public.estudantes;
drop policy if exists "equipe autenticada" on public.respostas;
create policy "equipe autenticada" on public.simulado_config for all to authenticated using (true) with check (true);
create policy "equipe autenticada" on public.textos for all to authenticated using (true) with check (true);
create policy "equipe autenticada" on public.itens for all to authenticated using (true) with check (true);
create policy "equipe autenticada" on public.estudantes for all to authenticated using (true) with check (true);
create policy "equipe autenticada" on public.respostas for all to authenticated using (true) with check (true);

drop trigger if exists t_upd on public.simulado_config;
drop trigger if exists t_upd on public.textos;
drop trigger if exists t_upd on public.itens;
drop trigger if exists t_upd on public.estudantes;
drop trigger if exists t_upd on public.respostas;
create trigger t_upd before update on public.simulado_config for each row execute function public.tocar_updated_at();
create trigger t_upd before update on public.textos for each row execute function public.tocar_updated_at();
create trigger t_upd before update on public.itens for each row execute function public.tocar_updated_at();
create trigger t_upd before update on public.estudantes for each row execute function public.tocar_updated_at();
create trigger t_upd before update on public.respostas for each row execute function public.tocar_updated_at();
