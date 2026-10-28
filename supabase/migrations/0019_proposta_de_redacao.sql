-- A proposta de redação passa a ser gravada por quem responde pela redação.
--
-- O QUE ESTAVA QUEBRADO
--
-- A tela Redação existe para duas pessoas: a coordenação geral e quem tem o
-- papel `redacao`. As duas viam o botão “✍ Escrever a proposta”, e o diálogo
-- fechava dizendo “Proposta de redação salva.” para as duas. Mas a proposta
-- mora DENTRO da linha da prova (`provas.dados -> 'redacao'`, ver js/app.js), e
-- a política de UPDATE de `provas` (migração 0007) só deixa a coordenação geral
-- escrever. Para o papel `redacao` a gravação era recusada — e saía solta, com
-- o erro chegando depois como “falha ao sincronizar”, sem dizer de quê. No
-- próximo carregamento a proposta sumia. É exatamente a pessoa que escreve e
-- corrige a redação que não conseguia gravar a proposta.
--
-- POR QUE FUNÇÃO E NÃO POLÍTICA
--
-- A linha da prova carrega tudo num jsonb só: série, etapa, data, quantidade de
-- questões, `temRedacao`, capa e instruções. Uma política que deixasse o papel
-- `redacao` atualizar a linha deixaria mexer em tudo isso, e o `with check` não
-- tem como comparar com a linha antiga para conferir que só a proposta mudou.
-- A função recebe a PROPOSTA e escreve só a chave `redacao` — não tem como
-- escrever fora dela.
--
-- A outra metade — a proposta deixar de ser regravada pela linha inteira da
-- prova — está na migração 0020, e ela tem de entrar no banco DEPOIS do código
-- que passa a chamar esta função. Ver o cabeçalho dela.

create or replace function public.gravar_proposta_de_redacao(alvo text, proposta jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  papel text;
  dados jsonb;
begin
  select e.papel into papel from public.equipe e where e.email = lower(auth.jwt() ->> 'email');
  if papel is null or papel not in ('coordenacao', 'redacao') then
    raise exception 'Só a coordenação geral e quem responde pela redação escrevem a proposta.'
      using errcode = 'insufficient_privilege';
  end if;

  select p.dados into dados from public.provas p where p.id = alvo;
  if dados is null then
    raise exception 'Prova não encontrada.' using errcode = 'no_data_found';
  end if;

  -- `null` apaga a proposta; qualquer outra coisa tem de ser o objeto dela.
  if proposta is not null then
    if jsonb_typeof(proposta) <> 'object' then
      raise exception 'A proposta chegou num formato que não é o dela.' using errcode = 'invalid_parameter_value';
    end if;
    if dados ->> 'temRedacao' = 'false' then
      raise exception 'Esta prova está marcada como sem redação.' using errcode = 'check_violation';
    end if;
    -- Teto: a prova inteira trafega em cada carregamento do sistema, e a
    -- figura mora no bucket — no `dados` vai só a referência. Proposta maior que
    -- isto é figura embutida em base64, que não deve chegar aqui.
    if pg_column_size(proposta) > 200000 then
      raise exception 'A proposta passa de 200 kB. As figuras vão pelo envio de imagem, não coladas no texto.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- A marca diz ao gatilho `proposta_so_pela_funcao` (migração 0020) que esta
  -- escrita é a da proposta, e não uma regravação da prova inteira.
  perform set_config('pas.gravando_proposta', 'sim', true);
  update public.provas p
     set dados = case when proposta is null then p.dados - 'redacao'
                      else jsonb_set(p.dados, '{redacao}', proposta) end,
         updated_at = now()
   where p.id = alvo;
  perform set_config('pas.gravando_proposta', '', true);

  return proposta;
end $$;

revoke all on function public.gravar_proposta_de_redacao(text, jsonb) from public, anon;
grant execute on function public.gravar_proposta_de_redacao(text, jsonb) to authenticated;

comment on function public.gravar_proposta_de_redacao(text, jsonb) is
  'Grava (ou apaga, com null) a proposta de redação de uma prova. Coordenação geral e papel redacao. Escreve só a chave redacao de provas.dados.';
