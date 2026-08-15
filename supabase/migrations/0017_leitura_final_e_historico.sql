-- A leitura final da prova, a quatro mãos — e o que mudou em cada item.
--
-- DOIS RELATOS, UMA CAUSA COMUM
--
-- 1) “A revisão in-line no caderno precisa ficar disponível para a coordenação
--    de área também. Caso ela faça algum ajuste, volta a ser pendência do
--    coordenador pedagógico para a última leitura.”
--
--    A revisão na página só alcançava a coordenação geral, na prática: o
--    caderno é feito de itens APROVADOS, e item aprovado só ela edita
--    (migração 0012). A coordenação de área abria o caderno, via o problema na
--    página, e não tinha o que fazer com ele.
--
-- 2) “O Paulo segue sem conseguir ver as alterações feitas nos itens da
--    professora Fernanda.”
--
--    Não é acesso: no log das últimas 24 horas, as 480 requisições da conta
--    dele responderam 200 — nenhum 4xx. É que não há o que ver. O item guarda
--    o ESTADO ATUAL e mais nada; quem revisa 336 itens não tem como saber o que
--    mudou desde a última vez que os leu, e nem quem mudou. O fio de comentários
--    só registra o que alguém resolveu escrever à mão.
--
-- As duas coisas são a mesma pergunta — “o que mexeram nisto, e quem?” —, e a
-- segunda é o que torna a primeira segura: passar a mão de revisão para mais
-- gente sem deixar rastro seria piorar o problema do Paulo.

/* ================= 1 · o histórico de cada item ================= */
-- Escrito por GATILHO, não pelo cliente. Três razões:
--
--   · não se falsifica — quem gravou não escolhe o que o histórico dirá;
--   · não escapa — vale para toda porta de gravação (diálogo do item, revisão
--     no caderno, adaptação, restauração de backup), inclusive as futuras;
--   · não depende de o cliente lembrar de fazer.
--
-- Só os campos de CONTEÚDO entram. `ordem` muda quando a coordenação reordena
-- um bloco inteiro, `comentarios` tem o fio, e `historico` é ele mesmo — os três
-- virariam ruído que esconde o que interessa.
create or replace function public.campos_do_item()
returns text[] language sql immutable as $$
  select array['enunciado', 'opcoes', 'gabarito', 'tipo', 'versao', 'componente',
               'habilidade', 'grupo', 'linhasRef', 'dLinhas', 'dPauta', 'textoId',
               'status', 'imagens', 'imagensOpcoes'];
$$;

-- Teto de tamanho, e ele importa: o histórico mora dentro do jsonb do item, e
-- TODOS os itens são lidos a cada abertura do sistema. Doze entradas e 240
-- caracteres por valor guardado dão o suficiente para responder “o que mudou
-- desde ontem” sem transformar a carga da tela num download.
create or replace function public.registrar_alteracao_do_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  anterior jsonb;
  eu       public.equipe%rowtype;
  campo    text;
  mudou    text[] := '{}';
  antes    jsonb  := '{}'::jsonb;
  entrada  jsonb;
  fio      jsonb;
  valor    jsonb;
begin
  -- O cliente grava por upsert, então editar chega como INSERT: a linha
  -- anterior está na tabela, não em `old` (mesma armadilha da migração 0014).
  anterior := case when tg_op = 'UPDATE' then old.dados
                   else (select i.dados from public.itens i where i.id = new.id) end;
  if anterior is null then
    return new;                            -- item nascendo: não há o que comparar
  end if;

  foreach campo in array public.campos_do_item() loop
    if (anterior -> campo) is distinct from (new.dados -> campo) then
      mudou := mudou || campo;
      valor := anterior -> campo;
      -- Texto longo é cortado; o resto vai inteiro, que já é curto.
      if jsonb_typeof(valor) = 'string' and length(valor #>> '{}') > 240 then
        valor := to_jsonb(left(valor #>> '{}', 240) || '…');
      end if;
      antes := antes || jsonb_build_object(campo, coalesce(valor, 'null'::jsonb));
    end if;
  end loop;

  -- O histórico nunca vem do cliente. Ele reapresenta o item inteiro a cada
  -- gravação, `historico` junto, e sem esta linha bastaria mandar a lista que
  -- se quisesse quando nenhum campo de conteúdo mudasse. Aqui ele é sempre o
  -- que estava guardado; só este gatilho o acrescenta.
  new.dados := jsonb_set(new.dados, '{historico}',
    case when jsonb_typeof(anterior -> 'historico') = 'array'
         then anterior -> 'historico' else '[]'::jsonb end);

  if cardinality(mudou) = 0 then
    return new;
  end if;

  select * into eu from public.equipe where email = lower(auth.jwt() ->> 'email');

  entrada := jsonb_build_object(
    'quem',   coalesce(nullif(eu.nome, ''), eu.email, 'sistema'),
    'papel',  case eu.papel
                when 'coordenacao'      then 'coordenação geral'
                when 'coordenacao_area' then 'coord. de área (' || coalesce(eu.area, '') || ')'
                when 'redacao'          then 'redação'
                when 'docente'          then 'docente (' || coalesce(eu.componente, '') || ')'
                else 'sistema'
              end,
    'quando', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM')
              || ', ' || to_char(now() at time zone 'America/Sao_Paulo', 'HH24"h"MI'),
    'campos', to_jsonb(mudou),
    'antes',  antes);

  fio := case when jsonb_typeof(anterior -> 'historico') = 'array'
              then anterior -> 'historico' else '[]'::jsonb end;
  fio := fio || jsonb_build_array(entrada);
  -- Guarda as doze últimas.
  if jsonb_array_length(fio) > 12 then
    fio := (select coalesce(jsonb_agg(e order by n), '[]'::jsonb)
              from jsonb_array_elements(fio) with ordinality t(e, n)
             where n > jsonb_array_length(fio) - 12);
  end if;

  new.dados := jsonb_set(new.dados, '{historico}', fio);
  return new;
end $$;

revoke all on function public.registrar_alteracao_do_item() from public, anon, authenticated;

-- Depois do gatilho de fluxo, que pode recusar a gravação: não faz sentido
-- montar histórico de uma transição que vai ser barrada. A ordem entre gatilhos
-- do mesmo evento é alfabética pelo nome, e “item_z_historico” vem depois de
-- “item_status_do_fluxo”.
drop trigger if exists item_z_historico on public.itens;
create trigger item_z_historico before insert or update on public.itens
  for each row execute function public.registrar_alteracao_do_item();

/* ================= 2 · o ajuste na leitura final ================= */
-- Quem coordena uma área passa a poder corrigir, na página do caderno, os itens
-- da SUA área — inclusive os aprovados, que é do que o caderno é feito.
--
-- Por que uma função e não um ramo a mais na política de UPDATE: a política
-- diria apenas “pode escrever”, e o pedido tem uma segunda metade que uma
-- política não sabe cumprir — o ajuste da coordenação de área tem de VOLTAR a
-- ser pendência da coordenação pedagógica. Aqui as duas coisas acontecem juntas,
-- e a marca não depende de o cliente lembrar de pô-la.
--
-- Por que o item NÃO volta para `status: geral`: ele sairia do caderno (só
-- aprovado entra na montagem) no meio da leitura final, e a prova inteira
-- renumeraria por causa de uma vírgula. A pendência é registrada em
-- `aguardaLeituraFinal`, o item continua na prova, e a coordenação geral vê a
-- lista do que precisa reler.
create or replace function public.ajustar_na_leitura_final(
  alvo text, campo text, indice int, valor text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  eu     public.equipe%rowtype;
  item   public.itens%rowtype;
  geral  boolean;
  opcoes jsonb;
  novo   jsonb;
begin
  select * into eu from public.equipe where email = lower(auth.jwt() ->> 'email');
  if eu.email is null then
    raise exception 'Somente a equipe do PAS revisa a prova.' using errcode = 'insufficient_privilege';
  end if;
  if campo not in ('enunciado', 'opcao') then
    raise exception 'Campo não ajustável na leitura final: %', campo using errcode = 'check_violation';
  end if;

  select * into item from public.itens where id = alvo;
  if item.id is null then
    raise exception 'Item não encontrado.' using errcode = 'no_data_found';
  end if;

  geral := eu.papel = 'coordenacao';
  if not geral and not public.eh_coordenacao_da_area(item.dados ->> 'componente') then
    raise exception 'A leitura final é da coordenação pedagógica e da coordenação da área do item.'
      using errcode = 'insufficient_privilege';
  end if;

  if campo = 'enunciado' then
    if btrim(coalesce(valor, '')) = '' then
      raise exception 'O enunciado não pode ficar em branco.' using errcode = 'check_violation';
    end if;
    novo := jsonb_set(item.dados, '{enunciado}', to_jsonb(valor));
  else
    if indice is null or indice < 0 or indice > 3 then
      raise exception 'Alternativa inválida.' using errcode = 'check_violation';
    end if;
    opcoes := case when jsonb_typeof(item.dados -> 'opcoes') = 'array'
                   then item.dados -> 'opcoes' else '["","","",""]'::jsonb end;
    while jsonb_array_length(opcoes) < 4 loop opcoes := opcoes || jsonb_build_array(''); end loop;
    novo := jsonb_set(item.dados, '{opcoes}', jsonb_set(opcoes, array[indice::text], to_jsonb(valor)));
  end if;

  -- A marca da pendência. Quando quem ajusta é a própria coordenação geral, ela
  -- É a última leitura: nada fica pendente, e um ajuste dela sobre um item já
  -- marcado limpa a marca.
  if geral then
    novo := novo - 'aguardaLeituraFinal';
  else
    novo := jsonb_set(novo, '{aguardaLeituraFinal}', jsonb_build_object(
      'por',    coalesce(nullif(eu.nome, ''), eu.email),
      'papel',  'coord. de área (' || coalesce(eu.area, '') || ')',
      'quando', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM')
                || ', ' || to_char(now() at time zone 'America/Sao_Paulo', 'HH24"h"MI'),
      'campo',  case when campo = 'enunciado' then 'enunciado'
                     else 'alternativa ' || substr('ABCD', indice + 1, 1) end));
  end if;

  update public.itens set dados = novo where id = alvo;
  -- Relido: o gatilho do histórico mexe na linha depois deste update.
  select * into item from public.itens where id = alvo;
  return item.dados;
end $$;

revoke all on function public.ajustar_na_leitura_final(text, text, int, text) from public, anon;
grant execute on function public.ajustar_na_leitura_final(text, text, int, text) to authenticated;

comment on function public.ajustar_na_leitura_final(text, text, int, text) is
  'Correção de enunciado ou alternativa na leitura final do caderno. Coordenação pedagógica e coordenação da área do item. Ajuste feito pela área marca o item como pendente da última leitura.';

/* ---------------- a última leitura, dada por lida ---------------- */
create or replace function public.confirmar_leitura_final(alvo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_coordenacao() then
    raise exception 'A última leitura é da coordenação pedagógica.' using errcode = 'insufficient_privilege';
  end if;
  update public.itens set dados = dados - 'aguardaLeituraFinal' where id = alvo;
end $$;

revoke all on function public.confirmar_leitura_final(text) from public, anon;
grant execute on function public.confirmar_leitura_final(text) to authenticated;
