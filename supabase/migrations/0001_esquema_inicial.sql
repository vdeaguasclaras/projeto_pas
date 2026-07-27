-- Esquema inicial do Sistema PAS Marista.
-- O estado do simulado é espelhado em tabelas jsonb — uma linha por texto,
-- item, estudante e conjunto de respostas. A granularidade por linha evita
-- que duas pessoas editando coisas diferentes se sobrescrevam.
--
-- Aplicado no projeto `pas-marista` em 23/07/2026; registrado aqui para que o
-- banco possa ser recriado do zero.

create table if not exists public.simulado_config (
  id          integer primary key,
  dados       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists public.textos (
  id          text primary key,
  dados       jsonb not null,
  updated_at  timestamptz not null default now()
);

create table if not exists public.itens (
  id          text primary key,
  dados       jsonb not null,
  updated_at  timestamptz not null default now()
);

create table if not exists public.estudantes (
  id          text primary key,
  dados       jsonb not null,
  updated_at  timestamptz not null default now()
);

create table if not exists public.respostas (
  est_id      text primary key,
  dados       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.simulado_config enable row level security;
alter table public.textos          enable row level security;
alter table public.itens           enable row level security;
alter table public.estudantes      enable row level security;
alter table public.respostas       enable row level security;

-- Política inicial: qualquer conta autenticada. A migração 0003 troca isto
-- por "somente quem está na equipe".
do $$
declare t text;
begin
  foreach t in array array['simulado_config', 'textos', 'itens', 'estudantes', 'respostas'] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'equipe autenticada', t);
  end loop;
end $$;
