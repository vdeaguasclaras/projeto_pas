-- A lista da equipe (nomes e e-mails) também só é visível a quem está nela.
drop policy if exists "equipe visivel a autenticados" on public.equipe;
create policy "equipe visivel a quem esta nela" on public.equipe
  for select to authenticated using (public.eh_equipe());
