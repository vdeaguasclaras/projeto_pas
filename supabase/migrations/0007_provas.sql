-- Etapa 1: o sistema deixa de ter uma prova só.
--
-- Até aqui não existia a entidade "prova": havia uma linha em `simulado_config`
-- (id = 1) e listas soltas de textos, itens, estudantes e respostas. Trocar de
-- série era impossível porque não havia de onde trocar.
--
-- A prova passa a ser a unidade: cada uma tem série, etapa, data, duração,
-- quantidade de questões e a escolha de ter ou não redação. Textos e itens
-- pertencem a uma prova; o estudante pertence a uma SÉRIE e entra no elenco de
-- cada prova daquela série.
--
-- Por que elenco materializado, e não derivado da série: o PAS é seriado e o
-- estudante muda de série na virada do ano. Se o elenco fosse `where serie =`,
-- a turma que fez a 1ª etapa de 2026 sumiria do histórico assim que todo mundo
-- passasse de ano, e os boletins antigos perderiam o denominador.
--
-- Nada é apagado: as colunas novas entram com valor preenchido a partir do que
-- já existe, e os dados de hoje viram a prova da 1ª série EM.

/* ---------------- provas ---------------- */
-- Mesmo formato {id, dados jsonb} das outras tabelas, para o driver do cliente
-- (js/nuvem.js) tratar prova como trata texto e item, sem código novo.
create table if not exists public.provas (
  id          text primary key,
  dados       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.provas enable row level security;

create policy "equipe lê" on public.provas
  for select to authenticated using (public.eh_equipe());
create policy "coordenação cria" on public.provas
  for insert to authenticated with check (public.eh_coordenacao());
create policy "coordenação edita" on public.provas
  for update to authenticated using (public.eh_coordenacao()) with check (public.eh_coordenacao());
create policy "coordenação apaga" on public.provas
  for delete to authenticated using (public.eh_coordenacao());

-- As quatro provas. A quantidade de questões do 9º ano foi informada pela
-- coordenação; as do ensino médio ficam em aberto até ela definir — a interface
-- mostra "a definir" em vez de inventar um denominador.
insert into public.provas (id, dados) values
  ('pr-9ano', jsonb_build_object(
     'id','pr-9ano','ordem',0,'serie','9º ano','nome','Simulado PAS 2026',
     'etapa','1ª Etapa','dataAplicacao','','duracao','4h30',
     'totalQuestoes',90,'temRedacao',true,'imprimirRedacao',true)),
  ('pr-1em', jsonb_build_object(
     'id','pr-1em','ordem',1,'serie','1ª série EM','nome','Simulado PAS 2026',
     'etapa','1ª Etapa','dataAplicacao','','duracao','4h30',
     'totalQuestoes',null,'temRedacao',true,'imprimirRedacao',true)),
  ('pr-2em', jsonb_build_object(
     'id','pr-2em','ordem',2,'serie','2ª série EM','nome','Simulado PAS 2026',
     'etapa','1ª Etapa','dataAplicacao','','duracao','4h30',
     'totalQuestoes',null,'temRedacao',true,'imprimirRedacao',true)),
  ('pr-3em', jsonb_build_object(
     'id','pr-3em','ordem',3,'serie','3ª série EM','nome','Simulado PAS 2026',
     'etapa','1ª Etapa','dataAplicacao','','duracao','4h30',
     'totalQuestoes',null,'temRedacao',true,'imprimirRedacao',true))
on conflict (id) do nothing;

-- O que já estava em produção é a prova da 1ª série: herda nome, etapa, data,
-- duração e a escolha de imprimir redação da linha única de `simulado_config`.
update public.provas p
   set dados = p.dados
             || jsonb_build_object(
                  'nome',            coalesce(c.dados ->> 'nome', p.dados ->> 'nome'),
                  'etapa',           coalesce(c.dados ->> 'etapa', p.dados ->> 'etapa'),
                  'dataAplicacao',   coalesce(c.dados ->> 'dataAplicacao', ''),
                  'duracao',         coalesce(c.dados ->> 'duracao', p.dados ->> 'duracao'),
                  'imprimirRedacao', coalesce(c.dados -> 'imprimirRedacao', 'true'::jsonb))
             || case when c.dados ? 'instrucoes'
                     then jsonb_build_object('instrucoes', c.dados -> 'instrucoes') else '{}'::jsonb end
             || case when c.dados ? 'capaImagem'
                     then jsonb_build_object('capaImagem', c.dados -> 'capaImagem') else '{}'::jsonb end
  from public.simulado_config c
 where p.id = 'pr-1em' and c.id = 1;

/* ---------------- escopo de prova em textos e itens ---------------- */
-- Coluna gerada: o cliente continua gravando o documento inteiro em `dados`, e
-- o banco extrai a chave para poder indexar e filtrar do lado de cá.
alter table public.textos     add column if not exists prova_id text
  generated always as (dados ->> 'provaId') stored;
alter table public.itens      add column if not exists prova_id text
  generated always as (dados ->> 'provaId') stored;
alter table public.estudantes add column if not exists serie text
  generated always as (dados ->> 'serie') stored;

-- Backfill: tudo o que existe hoje é da prova da 1ª série.
update public.textos     set dados = jsonb_set(dados, '{provaId}', '"pr-1em"')
 where dados ->> 'provaId' is null;
update public.itens      set dados = jsonb_set(dados, '{provaId}', '"pr-1em"')
 where dados ->> 'provaId' is null;
update public.estudantes set dados = jsonb_set(dados, '{serie}', '"1ª série EM"')
 where dados ->> 'serie' is null;

create index if not exists textos_prova_idx     on public.textos (prova_id);
create index if not exists itens_prova_idx      on public.itens (prova_id);
create index if not exists estudantes_serie_idx on public.estudantes (serie);

/* ---------------- elenco de cada prova ---------------- */
create table if not exists public.prova_estudantes (
  prova_id  text not null references public.provas (id) on delete cascade,
  est_id    text not null references public.estudantes (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (prova_id, est_id)
);

alter table public.prova_estudantes enable row level security;

create policy "equipe lê" on public.prova_estudantes
  for select to authenticated using (public.eh_equipe());
create policy "coordenação cria" on public.prova_estudantes
  for insert to authenticated with check (public.eh_coordenacao());
create policy "coordenação apaga" on public.prova_estudantes
  for delete to authenticated using (public.eh_coordenacao());

insert into public.prova_estudantes (prova_id, est_id)
select 'pr-1em', id from public.estudantes
on conflict do nothing;

/* ---------------- respostas por prova ---------------- */
-- A chave era só `est_id`: o mesmo estudante respondendo a 2ª etapa
-- sobrescreveria em silêncio o resultado da 1ª. Passa a ser (prova, estudante).
alter table public.respostas add column if not exists prova_id text;
update public.respostas set prova_id = 'pr-1em' where prova_id is null;
alter table public.respostas alter column prova_id set not null;

alter table public.respostas drop constraint if exists respostas_pkey;
alter table public.respostas add primary key (prova_id, est_id);

alter table public.respostas drop constraint if exists respostas_prova_fk;
alter table public.respostas add constraint respostas_prova_fk
  foreign key (prova_id) references public.provas (id) on delete cascade;

-- `simulado_config` fica onde está, com o conteúdo que tinha. Ela deixa de ser
-- lida pelo sistema — a identidade da prova mora em `provas` —, mas apagá-la
-- destruiria a única cópia do estado anterior à migração.
