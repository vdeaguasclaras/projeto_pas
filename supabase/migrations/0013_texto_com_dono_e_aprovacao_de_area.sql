-- O texto-base ganha dono, e a aprovação dele deixa de ser só da coordenação
-- geral.
--
-- O QUE OS PROFESSORES PEDIRAM
--
-- Duas coisas, na mesma tela. A coordenação de área não tinha como aprovar os
-- textos que os docentes sugerem — só a geral —, e quem sugeria um texto não
-- podia corrigir o próprio título depois de enviar. Sugestão errada virava
-- recado por fora do sistema, e sete delas estavam paradas esperando.
--
-- O QUE ESTAVA ABERTO NO BANCO
--
-- O contrário do que a tela mostrava. A tela escondia “Editar” de todos menos
-- da coordenação geral; o banco, com a política `equipe edita` da migração
-- 0006, aceitava UPDATE em `public.textos` de qualquer conta autenticada da
-- equipe — inclusive para reescrever o corpo de um texto-base já aprovado, já
-- dentro do caderno, ou para marcar `status: "aprovado"` numa sugestão. Vinte e
-- sete contas, nenhum rastro. É a mesma brecha que a 0012 fechou para `itens`,
-- e ela continuava aberta aqui.
--
-- Abrir a tela para mais gente sem mexer no banco seria alargar o buraco. Esta
-- migração faz o caminho contrário: a tela passa a mostrar o que a regra
-- permite, e a regra passa a valer nos dois lados.
--
-- A REGRA
--
--   · as duas coordenações, sempre — o texto-base é da prova inteira, não de
--     uma área, e é por isso que quem coordena qualquer área decide sobre ele;
--   · quem sugeriu, enquanto a sugestão não foi aprovada — depois disso o
--     texto é da prova, e sai da mão de quem o indicou;
--   · apagar continua só com a coordenação geral, como na 0006.
--
-- Quem não se encaixa continua LENDO todos os textos: quem escreve item precisa
-- do texto-base na frente, aprovado ou não.

/* ---------------- as sugestões que já existem ganham dono ---------------- */
-- `autorEmail` é novo nos textos, e as sugestões pendentes não o têm — elas
-- guardam só o rótulo “Nome (Componente)” em `sugeridoPor`. Sem este passo, a
-- tela ofereceria “Editar” a quem sugeriu (ela reconhece pelo rótulo) e o banco
-- recusaria a gravação, que é a pior combinação possível: a promessa some só
-- depois do trabalho feito.
--
-- O casamento é pelo nome exato do começo do rótulo, contra a tabela `equipe`,
-- e só quando UMA pessoa corresponde — nome ambíguo (há dois Paulos) fica sem
-- dono, e o texto segue como está hoje, editável só pelas coordenações.
--
-- Só mexe em sugestão: texto já aprovado é da prova, não de quem o indicou.
update public.textos t
   set dados = t.dados || jsonb_build_object('autorEmail', e.email)
  from public.equipe e
 where t.dados ->> 'status' = 'sugestao'
   and t.dados ->> 'autorEmail' is null
   and (t.dados ->> 'sugeridoPor' = e.nome or t.dados ->> 'sugeridoPor' like e.nome || ' (%')
   and 1 = (select count(*) from public.equipe e2
             where t.dados ->> 'sugeridoPor' = e2.nome
                or t.dados ->> 'sugeridoPor' like e2.nome || ' (%');

/* ---------------- sou eu quem sugeriu? ---------------- */
-- Pelo e-mail, como em `sou_autor_do_item` (0012), e pelo mesmo motivo: nome é
-- rótulo editável, e a equipe tem dois Paulos.
--
-- Texto sem `autorEmail` não é de ninguém e fica só com as coordenações, que é
-- exatamente a regra que valia até agora.
create or replace function public.sou_autor_do_texto(dados jsonb)
returns boolean language sql stable set search_path = public as $$
  select coalesce(lower(dados ->> 'autorEmail'), '') = lower(coalesce(auth.jwt() ->> 'email', ''))
     and nullif(dados ->> 'autorEmail', '') is not null;
$$;

revoke all on function public.sou_autor_do_texto(jsonb) from public, anon;
grant execute on function public.sou_autor_do_texto(jsonb) to authenticated;

/* ---------------- quem é coordenação, geral ou de área ---------------- */
-- `eh_coordenacao()` (0002) responde só pela geral, e `eh_coordenacao_da_area()`
-- (0012) pede o componente do item — que texto-base não tem. Falta esta, que é
-- a pergunta do texto-base: “esta pessoa coordena alguma coisa?”.
--
-- SECURITY DEFINER pelo mesmo motivo de sempre: ler `equipe` de dentro de uma
-- política não pode depender da política de `equipe`.
create or replace function public.eh_coordenacao_qualquer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.equipe
     where email = lower(auth.jwt() ->> 'email')
       and papel in ('coordenacao', 'coordenacao_area')
  );
$$;

revoke all on function public.eh_coordenacao_qualquer() from public, anon;
grant execute on function public.eh_coordenacao_qualquer() to authenticated;

/* ---------------- UPDATE: só quem tem o texto na mão ---------------- */
-- `using` pergunta “posso mexer nesta linha como ela está?” e olha o estado
-- ANTIGO; `with check` pergunta “a linha resultante é legítima?”. Os dois
-- precisam ser diferentes porque a aprovação muda o status: quem sugeriu tem o
-- texto enquanto ele é sugestão, e a coordenação o tira de lá.
drop policy if exists "equipe edita" on public.textos;

create policy "coordenação ou quem sugeriu edita texto" on public.textos
  for update to authenticated
  using (
    public.eh_coordenacao_qualquer()
    or (public.sou_autor_do_texto(dados) and dados ->> 'status' = 'sugestao')
  )
  with check (
    public.eh_coordenacao_qualquer()
    or public.sou_autor_do_texto(dados)
  );

comment on policy "coordenação ou quem sugeriu edita texto" on public.textos is
  'Conteúdo do texto-base: as duas coordenações sempre; quem sugeriu, enquanto a sugestão não foi aprovada.';

/* ---------------- INSERT: a sugestão nasce em nome de quem a manda ---------------- */
-- Sem isto uma conta cria sugestão assinada por outra pessoa. A coordenação
-- segue liberada: é ela quem restaura backup, e o backup traz os textos com os
-- autores originais (mesma razão da 0012 para `itens`).
drop policy if exists "equipe cria" on public.textos;

create policy "texto nasce de quem o cria" on public.textos
  for insert to authenticated
  with check (
    public.eh_coordenacao_qualquer()
    or public.sou_autor_do_texto(dados)
  );

/* ---------------- o fluxo do texto vira regra do banco ---------------- */
-- Espelho de `checar_status_do_item` (0006). Aprovar texto é o que decide se
-- ele entra na prova e quantos itens cabem nele — não pode ser uma linha que
-- qualquer conta escreve pela API.
--
-- Só olha quando o status MUDA: a coordenação corrigindo uma vírgula de texto
-- já aprovado continua livre, e é o caso mais comum de edição.
create or replace function public.checar_status_do_texto()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  novo   text := new.dados ->> 'status';
  antigo text := case when tg_op = 'UPDATE' then old.dados ->> 'status' end;
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

drop trigger if exists texto_status_do_fluxo on public.textos;
create trigger texto_status_do_fluxo before insert or update on public.textos
  for each row execute function public.checar_status_do_texto();
