-- A proposta de redação só se grava pela função `gravar_proposta_de_redacao`
-- (migração 0019).
--
-- POR QUE
--
-- A coordenação continua gravando a prova inteira (capa, “Configurar prova”):
-- o cliente manda `upsert` com o `dados` completo, que substitui a coluna. Com
-- duas pessoas escrevendo na mesma linha — a coordenação e quem responde pela
-- redação —, quem estivesse com a tela aberta desde antes da proposta a
-- apagaria ao salvar a capa: o `dados` que ela manda é o de quando a página
-- carregou. O gatilho devolve à linha a proposta que está gravada sempre que a
-- escrita não vem da função.
--
-- Ele não é barreira de segurança — quem pode o quê continua sendo a RLS e a
-- função. É proteção contra tela desatualizada. Só olha UPDATE: prova nova
-- (criar, duplicar, restaurar backup, que apaga e reinsere) não tem proposta
-- anterior a proteger, e a que vem com ela entra inteira.
--
-- A ORDEM DE PUBLICAÇÃO IMPORTA
--
-- Esta migração entra no banco DEPOIS de o site passar a gravar a proposta pela
-- função. O código anterior gravava a proposta pela linha inteira da prova; com
-- o gatilho de pé e aquele código no ar, a edição da coordenação seria
-- descartada aqui e a tela diria “Proposta de redação salva.” mesmo assim.

create or replace function public.proposta_so_pela_funcao()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('pas.gravando_proposta', true), '') <> 'sim' then
    new.dados := case when old.dados ? 'redacao'
                      then jsonb_set(new.dados, '{redacao}', old.dados -> 'redacao')
                      else new.dados - 'redacao' end;
  end if;
  return new;
end $$;

drop trigger if exists proposta_so_pela_funcao on public.provas;
create trigger proposta_so_pela_funcao
  before update on public.provas
  for each row execute function public.proposta_so_pela_funcao();
