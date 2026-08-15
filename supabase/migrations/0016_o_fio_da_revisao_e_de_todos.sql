-- Comentar no item de outra pessoa.
--
-- O QUE ESTAVA QUEBRADO
--
-- O sistema promete, em três lugares, que a conversa da revisão é de todos.
-- `podeEditarItem()` em js/app.js diz, em comentário: “Quem não se encaixa lê e
-- comenta — o fio da revisão continua aberto a todos”. O diálogo do item mostra
-- o campo “Escreva um comentário…” para quem quer que abra o item. E o aviso do
-- item travado manda fazer exatamente isso: “Se algo precisa mudar, escreva no
-- fio da revisão”.
--
-- O banco recusava. O comentário é gravado junto com o item inteiro
-- (`persistirRascunho`), e a política `autor ou coordenação edita item` (0012)
-- pergunta quem pode mexer no CONTEÚDO — enunciado, opções, gabarito. Um docente
-- comentando no item de um colega levava
-- “new row violates row-level security policy for table itens”. Até a migração
-- 0014 isso sumia em silêncio: a gravação saía solta e o erro chegava sem dono.
--
-- POR QUE NÃO É UM RAMO A MAIS NA POLÍTICA
--
-- A saída aparentemente óbvia — acrescentar “ou só mexeu no fio” ao `with check`
-- — não funciona sozinha, porque quem barra o resto hoje é o `using`, e o
-- `using` só enxerga a linha ANTIGA: não há como perguntar ali se a alteração
-- proposta se limita ao fio. Para chegar lá seria preciso afrouxar o `using` e
-- remontar as condições de status dentro do `with check`; e afrouxar o `using`
-- reabriria, de carona, dois buracos que a 0012 fechou — o autor voltando a
-- editar o próprio item já aprovado, e a coordenação de uma área reetiquetando
-- item de outra.
--
-- Uma função é mais estreita do que qualquer política: ela não pode escrever
-- fora do fio porque não tem como. O que ela recebe é o TEXTO do comentário, e
-- nada mais.
--
-- QUEM ASSINA
--
-- Autor e papel do comentário deixam de vir do navegador e passam a ser lidos
-- de `public.equipe` pelo e-mail do JWT — como manda a convenção do projeto
-- (papel vem do banco, nunca do que o cliente afirma). Antes, o cliente
-- montava o rótulo sozinho: nada impedia um comentário assinado “coordenação
-- geral” por quem não é. A data também é do servidor, no mesmo formato que
-- `agora()` desenha em js/app.js (“15/08, 12h50”).

create or replace function public.comentar_item(alvo text, texto text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  eu      public.equipe%rowtype;
  limpo   text := btrim(coalesce(texto, ''));
  rotulo  text;
  quando  text;
  novo    jsonb;
  fio     jsonb;
begin
  select * into eu from public.equipe where email = lower(auth.jwt() ->> 'email');
  if eu.email is null then
    raise exception 'Somente a equipe do PAS comenta nos itens.' using errcode = 'insufficient_privilege';
  end if;
  if limpo = '' then
    raise exception 'O comentário está em branco.' using errcode = 'check_violation';
  end if;
  -- Teto de tamanho: o fio mora dentro do jsonb do item, e o item inteiro
  -- trafega em cada leitura da prova. Comentário é recado, não anexo.
  if length(limpo) > 4000 then
    raise exception 'O comentário passa de 4000 caracteres.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.itens where id = alvo) then
    raise exception 'Item não encontrado.' using errcode = 'no_data_found';
  end if;

  rotulo := case eu.papel
    when 'coordenacao'      then 'coordenação geral'
    when 'coordenacao_area' then 'coord. de área (' || coalesce(eu.area, '') || ')'
    when 'redacao'          then 'redação'
    else 'docente (' || coalesce(eu.componente, '') || ')'
  end;
  quando := to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM')
         || ', ' || to_char(now() at time zone 'America/Sao_Paulo', 'HH24"h"MI');

  novo := jsonb_build_object(
    'autor',  coalesce(nullif(eu.nome, ''), eu.email),
    'papel',  rotulo,
    'quando', quando,
    'texto',  limpo);

  -- `comentarios` que não seja lista é tratado como lista vazia em vez de
  -- derrubar a gravação: item antigo pode não ter o campo, e um campo torto
  -- não é razão para o recado se perder.
  update public.itens i
     set dados = jsonb_set(i.dados, '{comentarios}',
                   case when jsonb_typeof(i.dados -> 'comentarios') = 'array'
                        then i.dados -> 'comentarios' else '[]'::jsonb end || jsonb_build_array(novo))
   where i.id = alvo
  returning i.dados -> 'comentarios' into fio;

  return jsonb_build_object('comentario', novo, 'comentarios', fio);
end $$;

-- O gatilho `item_status_do_fluxo` roda neste UPDATE como em qualquer outro, e
-- passa: o status não muda. É de propósito que a função não o contorne — ela
-- acrescenta ao fio e nada mais, e continua sujeita a tudo o que vale para a
-- tabela.

revoke all on function public.comentar_item(text, text) from public, anon;
grant execute on function public.comentar_item(text, text) to authenticated;

comment on function public.comentar_item(text, text) is
  'Acrescenta um comentário ao fio de revisão de um item. Aberta a toda a equipe — comentar não é editar. Autor, papel e data vêm do banco, não do cliente.';
