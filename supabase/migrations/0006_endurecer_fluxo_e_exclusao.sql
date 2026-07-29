-- Etapa 0 do plano de ajustes: o que a interface já prometia passa a valer
-- também no banco.
--
-- Dois buracos que a revisão encontrou:
--
-- 1) O fluxo de revisão (rascunho → área → geral → aprovado) existia apenas na
--    interface. A política de RLS das migrações 0001/0003 é `for all` amarrada a
--    `eh_equipe()`, então qualquer docente autenticado podia gravar
--    `status: "aprovado"` direto pela API. A partir da alocação de itens por
--    docente esse número vira a métrica da coordenação — precisa ser regra.
--
-- 2) A mesma política `for all` libera DELETE a toda a equipe. Como
--    `substituirTudo()` (zerar / importar backup / recarregar exemplo) apaga
--    todas as linhas antes de regravar, uma aba esquecida aberta apagava o
--    trabalho de todo mundo. Com mais de uma prova no sistema isso passa a ser
--    perda total.

/* ---------------- papel de quem está chamando ---------------- */
-- SECURITY DEFINER para não recorrer na política da própria tabela `equipe`,
-- pelo mesmo motivo de `eh_coordenacao()` na migração 0002.
create or replace function public.papel_atual()
returns text language sql stable security definer set search_path = public as $$
  select papel from public.equipe where email = lower(auth.jwt() ->> 'email');
$$;

revoke all on function public.papel_atual() from public, anon;
grant execute on function public.papel_atual() to authenticated;

/* ---------------- 1) o fluxo de revisão vira regra do banco ---------------- */
-- Só olha a transição quando o status muda: salvar o texto de um item já
-- aprovado (a coordenação corrigindo uma vírgula) continua livre.
create or replace function public.checar_status_do_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  novo   text := new.dados ->> 'status';
  antigo text := case when tg_op = 'UPDATE' then old.dados ->> 'status' end;
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

drop trigger if exists item_status_do_fluxo on public.itens;
create trigger item_status_do_fluxo before insert or update on public.itens
  for each row execute function public.checar_status_do_item();

/* ---------------- 2) quem pode apagar ---------------- */
-- A política `for all` cobria DELETE junto com o resto. Ela é desmembrada em
-- leitura/escrita (toda a equipe, como antes) e exclusão (restrita).
do $$
declare t text;
begin
  foreach t in array array['simulado_config', 'textos', 'itens', 'estudantes', 'respostas'] loop
    execute format('drop policy if exists %I on public.%I', 'somente a equipe do PAS', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.eh_equipe())',
      'equipe lê', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.eh_equipe())',
      'equipe cria', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.eh_equipe()) with check (public.eh_equipe())',
      'equipe edita', t);
  end loop;
end $$;

-- Apagar texto-base, estudante, resposta ou a configuração: só a coordenação.
do $$
declare t text;
begin
  foreach t in array array['simulado_config', 'textos', 'estudantes', 'respostas'] loop
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.eh_coordenacao())',
      'só a coordenação apaga', t);
  end loop;
end $$;

-- Itens: a coordenação apaga qualquer um; a equipe apaga rascunho, para que o
-- docente possa descartar o que começou e desistiu. Enquanto o item guardar o
-- autor como nome digitado não dá para amarrar ao dono — quando o item passar a
-- carregar o e-mail do autor (etapa da alocação), esta política fecha para
-- `dados->>'autorEmail' = lower(auth.jwt() ->> 'email')`.
create policy "coordenação e rascunhos" on public.itens
  for delete to authenticated
  using (public.eh_coordenacao() or dados ->> 'status' = 'rascunho');
