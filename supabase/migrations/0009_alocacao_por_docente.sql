-- Alocação por docente: a coordenação distribui a prova entre quem escreve.
--
-- Duas coisas entram aqui, e a segunda é pré-requisito da primeira:
--
-- 1. `alocacoes` — quantos itens cada docente deve entregar em cada prova.
--
-- 2. `itens.dados->>'autorEmail'` — até agora o item guardava o autor só pelo
--    nome de exibição (`autor: S.perfil.nome`). Isso serve para mostrar na
--    tela, mas não para fechar conta: o nome é editável, dois docentes podem
--    ter o mesmo primeiro nome (a lista tem Paulo Leite e Paulo Eduardo) e a
--    interface já mostrava só o primeiro nome em alguns lugares. Meta e
--    produção precisam se cruzar por uma chave estável, e a chave estável da
--    pessoa neste sistema é o e-mail — a chave primária de `equipe`.

/* ---------------- 1. autor estável nos itens ---------------- */

-- Preenche `autorEmail` onde o nome gravado bate, sem ambiguidade, com alguém
-- da equipe. O que não bater fica sem e-mail em vez de ser adivinhado: hoje
-- são os autores dos dados de exemplo (Ana Beatriz, Carlos Eduardo, Fernanda,
-- João Pedro, Marina, Túlio), que não são pessoas do colégio.
update public.itens i
   set dados = i.dados || jsonb_build_object('autorEmail', e.email)
  from public.equipe e
 where e.nome = i.dados ->> 'autor'
   and i.dados ->> 'autorEmail' is null
   -- só nomes que identificam uma pessoa só
   and (select count(*) from public.equipe x where x.nome = e.nome) = 1;

-- Coluna gerada para dar ao PostgREST e aos índices uma chave de verdade,
-- no mesmo padrão de `prova_id` na migração 0007.
alter table public.itens
  add column if not exists autor_email text
  generated always as (dados ->> 'autorEmail') stored;

create index if not exists itens_autor_email_idx on public.itens (autor_email);
create index if not exists itens_prova_autor_idx on public.itens (prova_id, autor_email);

/* ---------------- 2. alocações ---------------- */
-- Chave (prova, docente): a mesma pessoa tem metas diferentes em séries
-- diferentes, e é assim que o docente vê "o que tenho para entregar" somando
-- as quatro provas.
create table if not exists public.alocacoes (
  prova_id    text not null references public.provas (id) on delete cascade,
  email       text not null references public.equipe (email) on delete cascade,
  dados       jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (prova_id, email)
);

alter table public.alocacoes enable row level security;

-- A equipe toda lê: o docente precisa ver a sua meta, e ver a dos colegas
-- ajuda a entender por que a sua é o que é. Só a coordenação escreve.
create policy "equipe lê alocações" on public.alocacoes
  for select to authenticated using (public.eh_equipe());
create policy "coordenação cria alocação" on public.alocacoes
  for insert to authenticated with check (public.eh_coordenacao());
create policy "coordenação edita alocação" on public.alocacoes
  for update to authenticated using (public.eh_coordenacao()) with check (public.eh_coordenacao());
create policy "coordenação apaga alocação" on public.alocacoes
  for delete to authenticated using (public.eh_coordenacao());

comment on table public.alocacoes is
  'Meta de itens por (prova, docente). `dados` traz meta total, opcionalmente a divisão por tipo de item, e a observação da coordenação.';
