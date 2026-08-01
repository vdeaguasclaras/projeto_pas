-- O item passa a ter dono também no banco.
--
-- O QUE ESTAVA ABERTO
--
-- A migração 0006 desmembrou a política `for all` em leitura/escrita/exclusão,
-- mas a de escrita ficou como estava: `equipe edita` libera UPDATE em
-- `public.itens` a qualquer pessoa da equipe. Com 27 contas cadastradas, isso
-- quer dizer que qualquer uma reescrevia o enunciado, as opções e o GABARITO de
-- qualquer item de qualquer outra — inclusive de item já aprovado, já dentro do
-- caderno — sem deixar rastro. A tela ajudava: o diálogo do item trazia
-- “Salvar” para quem quer que o abrisse.
--
-- O gatilho `item_status_do_fluxo` (0006) só olha a transição de status. Trocar
-- o gabarito de um item aprovado não é transição nenhuma, e passava.
--
-- A migração 0006 também deixou dito, em comentário, que a política de DELETE
-- fecharia para o e-mail do autor “quando o item passar a carregar o e-mail do
-- autor (etapa da alocação)”. Ele passou, na 0009. Esta migração cumpre isso:
-- hoje qualquer pessoa da equipe apaga o rascunho de qualquer outra.
--
-- A REGRA
--
--   · a coordenação geral, sempre — é ela quem corrige a vírgula do aprovado;
--   · quem escreveu, enquanto o item não está aprovado;
--   · a coordenação da área do item, enquanto ele está na mão dela (`area`).
--
-- Quem não se encaixa continua LENDO tudo e comentando: o fio da revisão é o
-- caminho de pedir ajuste, e ele mora dentro do próprio item.

/* ---------------- de que área é um componente ---------------- */
-- O mesmo mapa de `AREAS` em js/app.js. Ele vive nos dois lados porque a tela
-- decide o que mostrar e o banco decide o que aceitar — e a segunda decisão não
-- pode depender da primeira. IMMUTABLE: é uma tabela de correspondência fixa.
create or replace function public.area_do_componente(comp text)
returns text language sql immutable set search_path = public as $$
  select case
    when comp in ('Português', 'Literatura', 'Redação', 'Artes Visuais',
                  'Dança', 'Música', 'Teatro', 'Artes')            then 'Linguagens'
    when comp in ('História', 'Geografia', 'Filosofia', 'Sociologia') then 'Humanas'
    when comp = 'Matemática'                                        then 'Matemática'
    when comp in ('Biologia', 'Física', 'Química')                  then 'Ciências da Natureza'
    when comp = 'Inglês'                                            then 'Inglês'
  end;
$$;

/* ---------------- sou eu quem escreveu? ---------------- */
-- Pelo e-mail, não pelo nome: nome é rótulo editável, e a equipe tem Paulo
-- Leite e Paulo Eduardo (o motivo já registrado na migração 0009).
--
-- Item sem `autorEmail` — os de exemplo, anteriores à 0009 — não é de ninguém, e
-- fica só com a coordenação. Não há nenhum assim hoje.
create or replace function public.sou_autor_do_item(dados jsonb)
returns boolean language sql stable set search_path = public as $$
  select coalesce(lower(dados ->> 'autorEmail'), '') = lower(coalesce(auth.jwt() ->> 'email', ''))
     and nullif(dados ->> 'autorEmail', '') is not null;
$$;

-- SECURITY DEFINER pelo mesmo motivo de `eh_coordenacao()` na 0002: ler
-- `equipe` de dentro de uma política não pode depender da política de `equipe`.
create or replace function public.eh_coordenacao_da_area(comp text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.equipe e
     where e.email = lower(auth.jwt() ->> 'email')
       and e.papel = 'coordenacao_area'
       and e.area is not null
       and e.area = public.area_do_componente(comp)
  );
$$;

revoke all on function public.area_do_componente(text)    from public, anon;
revoke all on function public.sou_autor_do_item(jsonb)    from public, anon;
revoke all on function public.eh_coordenacao_da_area(text) from public, anon;
grant execute on function public.area_do_componente(text)    to authenticated;
grant execute on function public.sou_autor_do_item(jsonb)    to authenticated;
grant execute on function public.eh_coordenacao_da_area(text) to authenticated;

/* ---------------- UPDATE: só quem tem o item na mão ---------------- */
-- `using` pergunta “posso mexer nesta linha como ela está?” e olha o status
-- ANTIGO; `with check` pergunta “a linha resultante é legítima?”. Os dois
-- precisam ser diferentes: a coordenação de área tem o item enquanto ele está
-- em `area`, e a ação dela justamente o tira de lá. Que transição de status é
-- válida continua sendo assunto do gatilho `item_status_do_fluxo` (0006).
drop policy if exists "equipe edita" on public.itens;

create policy "autor ou coordenação edita item" on public.itens
  for update to authenticated
  using (
    public.eh_coordenacao()
    or (public.sou_autor_do_item(dados) and dados ->> 'status' is distinct from 'aprovado')
    or (public.eh_coordenacao_da_area(dados ->> 'componente') and dados ->> 'status' = 'area')
  )
  with check (
    public.eh_coordenacao()
    or public.sou_autor_do_item(dados)
    or public.eh_coordenacao_da_area(dados ->> 'componente')
  );

/* ---------------- INSERT: o item nasce em nome de quem o cria ---------------- */
-- Sem isto, uma conta cria item assinado por outra pessoa — e a alocação conta
-- a produção por `autorEmail`, então isso seria mexer na conta alheia. A
-- coordenação segue liberada: é ela quem restaura backup, e o backup traz os
-- itens com os autores originais.
drop policy if exists "equipe cria" on public.itens;

create policy "item nasce de quem o cria" on public.itens
  for insert to authenticated
  with check (public.eh_coordenacao() or public.sou_autor_do_item(dados));

/* ---------------- DELETE: o rascunho é de quem o escreveu ---------------- */
-- A pendência anotada na 0006, agora que `autorEmail` existe (0009).
drop policy if exists "coordenação e rascunhos" on public.itens;

create policy "coordenação, ou o próprio rascunho" on public.itens
  for delete to authenticated
  using (
    public.eh_coordenacao()
    or (dados ->> 'status' = 'rascunho' and public.sou_autor_do_item(dados))
  );

comment on policy "autor ou coordenação edita item" on public.itens is
  'Conteúdo do item: coordenação geral sempre; autor enquanto não aprovado; coordenação de área enquanto o item está na etapa dela.';
