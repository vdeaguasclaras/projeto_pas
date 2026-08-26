-- Item anulado: a pontuação vai para todos, e a decisão nasce no sistema.
--
-- Item com defeito de formulação, ou sem alternativa correta, é anulado depois
-- da aplicação: a pontuação dele passa a valer para TODOS os estudantes, como se
-- todos o tivessem acertado. Isso não existia em lugar nenhum — nem aqui, nem no
-- aplicativo local —, e a saída era editar o gabarito com os cartões já
-- impressos, que é exatamente o que o cartão-gabarito existe para denunciar.
--
-- A marca é do ITEM, não do número. Cada versão da prova numera os seus itens de
-- 1 a N (`prova()`, js/app.js): o item que é o 12 na regular pode ser o 10 na
-- adaptada, porque a adaptada tem menos itens. Anular por número anularia coisas
-- diferentes nas duas provas — e ninguém conferiria.
--
-- POR QUE UMA FUNÇÃO, E NÃO UMA POLÍTICA
--
-- A coordenação pedagógica já pode gravar item aprovado; uma política bastaria
-- para deixá-la escrever `anulado`. Duas coisas que política não faz:
--
--   · o cliente grava o item INTEIRO (`nuvem.gravarLinha`), com a cópia que ele
--     tem na tela. A tela de Correção fica aberta enquanto se lança prova, e
--     nesse tempo a leitura final pode ter corrigido uma vírgula do mesmo item:
--     reapresentar a cópia velha para anular desfaria a correção em silêncio.
--     Aqui só o campo `anulado` é tocado, sobre a linha que está no banco;
--   · anular carrega uma consequência — quem anulou e quando —, e ela não pode
--     depender de o cliente lembrar de escrevê-la. É a mesma razão da 0017.
--
-- Vale para a coordenação pedagógica e mais ninguém. Não é falta de confiança na
-- coordenação de área: anular muda a nota de todo estudante da série, nas duas
-- provas, e quem vê as notas é a tela de Correção, que é dela. Quando a área
-- encontra o defeito, o caminho é o de sempre — avisar a coordenação.

/* ================= 1 · `anulado` entra no histórico do item ================= */
-- Sem isto, a anulação seria a única mudança de conteúdo que passa sem deixar
-- rastro — e é a que mais mexe com nota.
create or replace function public.campos_do_item()
returns text[] language sql immutable as $$
  select array['enunciado', 'opcoes', 'gabarito', 'tipo', 'versao', 'componente',
               'habilidade', 'grupo', 'linhasRef', 'dLinhas', 'dPauta', 'textoId',
               'status', 'imagens', 'imagensOpcoes', 'anulado'];
$$;

/* ================= 2 · anular e desanular ================= */
create or replace function public.anular_item(alvo text, anular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  eu   public.equipe%rowtype;
  item public.itens%rowtype;
  novo jsonb;
begin
  select * into eu from public.equipe where email = lower(auth.jwt() ->> 'email');
  if eu.papel is distinct from 'coordenacao' then
    raise exception 'Anular item é da coordenação pedagógica.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into item from public.itens where id = alvo;
  if item.id is null then
    raise exception 'Item não encontrado.' using errcode = 'no_data_found';
  end if;
  -- Só o item aprovado está na prova, e só o que foi aplicado se anula. Anular
  -- rascunho seria marca guardada num item que ninguém respondeu — e que
  -- chegaria à prova já anulado se fosse aprovado depois.
  if (item.dados ->> 'status') is distinct from 'aprovado' then
    raise exception 'Só se anula item aprovado — este está %.',
      coalesce(item.dados ->> 'status', 'sem status') using errcode = 'check_violation';
  end if;

  if anular then
    novo := jsonb_set(item.dados, '{anulado}', 'true'::jsonb);
    novo := jsonb_set(novo, '{anuladoPor}',
                      to_jsonb(coalesce(nullif(eu.nome, ''), eu.email)));
    novo := jsonb_set(novo, '{anuladoEm}',
                      to_jsonb(to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')));
  else
    novo := (item.dados - 'anulado') - 'anuladoPor' - 'anuladoEm';
  end if;

  update public.itens set dados = novo where id = alvo;
  -- Relido: o gatilho do histórico mexe na linha depois deste update.
  select * into item from public.itens where id = alvo;
  return item.dados;
end $$;

revoke all on function public.anular_item(text, boolean) from public, anon;
grant execute on function public.anular_item(text, boolean) to authenticated;

comment on function public.anular_item(text, boolean) is
  'Anula (ou desanula) um item aprovado: a pontuação dele passa a valer para todos os estudantes. Coordenação pedagógica. Toca apenas `anulado`, `anuladoPor` e `anuladoEm`, sobre a linha gravada — o cliente não reapresenta o item inteiro.';
