-- O `upsert` do cliente deixa de ser lido como criação.
--
-- O RELATO
--
-- “O perfil da Analu está incompleto: ela é coordenadora de área, mas não está
-- com as atribuições de coordenação.” O cadastro dela estava certo o tempo
-- todo — `papel: coordenacao_area`, `area: Linguagens`. O que não funcionava
-- era o trabalho: aprovar, devolver e corrigir os itens da própria área. A tela
-- oferecia os três botões, o diálogo fechava dizendo “Item salvo”, e o banco
-- recusava a gravação em silêncio.
--
-- Nas 24 horas anteriores a esta migração, o log do PostgREST tem 151 respostas
-- 403 em POST /rest/v1/itens — 48 da conta da Analu e 103 da conta da
-- Alessandra, que coordena Ciências da Natureza. Nenhuma da coordenação geral.
-- No log do Postgres, as 151 são a mesma linha: “new row violates row-level
-- security policy for table itens”.
--
-- POR QUE ACONTECIA
--
-- `nuvem.gravarLinha()` grava tudo por `upsert`, que no PostgREST é
-- `insert ... on conflict (id) do update`. O PostgreSQL avalia o `with check`
-- da política de INSERT sobre a linha proposta ANTES de descobrir que ela já
-- existe — e dispara os gatilhos `before insert` no mesmo ponto. Ou seja: toda
-- edição de item chega ao banco vestida de criação, e é julgada como tal.
--
-- Duas regras que estavam certas para criar item passaram, por isso, a valer
-- para editá-lo:
--
--   1. A política `item nasce de quem o cria` (migração 0012) pergunta
--      `eh_coordenacao() or sou_autor_do_item(dados)`. Ela não menciona a
--      coordenação de área — e não deve mesmo, porque coordenar uma área não
--      autoriza criar item em nome de outra pessoa. Só que ela também estava
--      respondendo “não” para a edição de um item que já existe, que é
--      justamente o que a política de UPDATE (`autor ou coordenação edita
--      item`) autoriza. Duas políticas em desacordo sobre a mesma ação.
--
--   2. O gatilho `checar_status_do_item` (migração 0006) compara o status novo
--      com `old.dados`, que num INSERT é nulo. Com `antigo` nulo, salvar um
--      item sem mexer no status vira “transição para o status atual”: quem não
--      é da coordenação geral não conseguia salvar item já aprovado (nem o
--      comentário do fio, que passa pela mesma gravação), e o docente não
--      conseguia salvar o próprio item devolvido — a etapa `devolvido` é das
--      coordenações, e ele estava “transitando” para ela ao gravar.
--
-- A CORREÇÃO
--
-- As duas pontas param de confundir reapresentação com criação:
--
--   · a política de INSERT aceita a linha que JÁ EXISTE quando quem a
--     reapresenta poderia editá-la — daí em diante quem decide é a política de
--     UPDATE, que continua sendo a regra de verdade;
--   · o gatilho, num INSERT, vai buscar o status anterior na própria tabela em
--     vez de assumir que não há nenhum.
--
-- Nada afrouxa para item novo de verdade: sem linha com aquele id, a política
-- de INSERT segue exigindo coordenação geral ou autoria própria.

/* ---------------- a linha já existe? ---------------- */
-- SECURITY DEFINER pelo motivo de sempre, e aqui com um segundo: uma política
-- de `itens` não pode consultar `public.itens` diretamente — a política se
-- aplicaria à consulta, e a recursão é infinita. Dentro da função, que roda
-- como dona da tabela, o RLS não incide.
--
-- A função só responde “existe”, nunca devolve conteúdo: ela não é um caminho
-- para ler item nenhum.
create or replace function public.item_existe(alvo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.itens where id = alvo);
$$;

create or replace function public.texto_existe(alvo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.textos where id = alvo);
$$;

revoke all on function public.item_existe(text)  from public, anon;
revoke all on function public.texto_existe(text) from public, anon;
grant execute on function public.item_existe(text)  to authenticated;
grant execute on function public.texto_existe(text) to authenticated;

/* ---------------- INSERT de item: criar é uma coisa, reapresentar é outra ---------------- */
-- Criar item continua sendo da coordenação geral ou de quem assina o item.
-- Reapresentar um item que já existe — o que o `upsert` faz em toda edição —
-- passa pelo mesmo crivo da política de UPDATE, que é quem sabe responder.
drop policy if exists "item nasce de quem o cria" on public.itens;

create policy "item nasce de quem o cria" on public.itens
  for insert to authenticated
  with check (
    public.eh_coordenacao()
    or public.sou_autor_do_item(dados)
    -- o `upsert` do cliente: a linha já existe, isto é uma edição
    or (public.item_existe(id)
        and public.eh_coordenacao_da_area(dados ->> 'componente'))
  );

comment on policy "item nasce de quem o cria" on public.itens is
  'Item novo: coordenação geral ou quem o assina. Item que já existe reapresentado pelo upsert do cliente: também a coordenação da área dele — quem decide de fato é a política de UPDATE.';

/* ---------------- INSERT de texto: mesma distinção ---------------- */
-- Aqui a política de INSERT (migração 0013) já cobria as duas coordenações,
-- então não havia 403 — mas ela recusava a mesma coisa para quem sugeriu o
-- texto e o reabre para corrigir depois de o status ter mudado. A simetria com
-- `itens` fecha isso e deixa as duas tabelas com a mesma explicação.
drop policy if exists "texto nasce de quem o cria" on public.textos;

create policy "texto nasce de quem o cria" on public.textos
  for insert to authenticated
  with check (
    public.eh_coordenacao_qualquer()
    or public.sou_autor_do_texto(dados)
    or public.texto_existe(id)
  );

comment on policy "texto nasce de quem o cria" on public.textos is
  'Texto novo: as duas coordenações ou quem o sugere. Texto que já existe reapresentado pelo upsert do cliente: quem decide é a política de UPDATE.';

/* ---------------- o gatilho do fluxo do item ---------------- */
-- Só muda de onde vem `antigo`: num INSERT que é reapresentação, ele está na
-- tabela. Item novo de verdade continua com `antigo` nulo, e continua sendo
-- barrado se nascer já aprovado.
create or replace function public.checar_status_do_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  novo   text := new.dados ->> 'status';
  antigo text := case
                   when tg_op = 'UPDATE' then old.dados ->> 'status'
                   -- upsert: o PostgREST manda INSERT mesmo para editar
                   else (select i.dados ->> 'status' from public.itens i where i.id = new.id)
                 end;
  papel  text := public.papel_atual();
begin
  if novo is not distinct from antigo then
    return new;
  end if;

  if novo = 'aprovado' and papel <> 'coordenacao' then
    raise exception 'Somente a coordenação geral aprova itens.'
      using errcode = 'check_violation';
  end if;

  if novo in ('geral', 'devolvido') and papel not in ('coordenacao', 'coordenacao_area') then
    raise exception 'Somente a coordenação de área ou a geral decide esta etapa da revisão.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

revoke all on function public.checar_status_do_item() from public, anon, authenticated;

/* ---------------- o gatilho do fluxo do texto ---------------- */
-- O mesmo remendo: sem ele, quem sugeriu um texto não conseguia corrigi-lo
-- depois de a coordenação o aprovar — cada gravação parecia uma aprovação nova.
create or replace function public.checar_status_do_texto()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  novo   text := new.dados ->> 'status';
  antigo text := case
                   when tg_op = 'UPDATE' then old.dados ->> 'status'
                   else (select t.dados ->> 'status' from public.textos t where t.id = new.id)
                 end;
begin
  if novo is not distinct from antigo then
    return new;
  end if;

  if novo = 'aprovado' and not public.eh_coordenacao_qualquer() then
    raise exception 'Somente a coordenação — geral ou de área — aprova texto-base.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

revoke all on function public.checar_status_do_texto() from public, anon, authenticated;
