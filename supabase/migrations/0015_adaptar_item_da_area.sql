-- A versão adaptada de um item alheio, feita por quem coordena a área dele.
--
-- Sequência da 0014, e o mesmo achado visto de outro ângulo.
--
-- “Criar versão adaptada” (js/app.js, `it-adaptar`) copia o item para a prova
-- de inclusão. A cópia é um registro NOVO — id novo, `derivadoDe` apontando
-- para o original — e mantém de propósito o `autorEmail` de quem escreveu o
-- item: a produção de cada docente é contada por esse campo, e reassiná-la em
-- nome de quem adaptou mudaria a meta de duas pessoas de uma vez. Quem fez a
-- adaptação fica registrado em `adaptadoPor`.
--
-- `podeAdaptar()` na tela libera a ação para quem escreveu o item E para as
-- duas coordenações. No banco, a política de INSERT pergunta
-- `eh_coordenacao() or sou_autor_do_item(dados)` — e a coordenação de área não
-- é nenhum dos dois. O botão aparecia e a gravação era recusada: a mesma
-- combinação que a 0012 já registrava como a pior de todas.
--
-- A 0014 não alcança este caso porque ali a saída é `item_existe(id)`, e aqui o
-- id é novo de verdade. A licença que falta é outra, e mais estreita: criar a
-- DERIVAÇÃO de um item que já existe e que é da área de quem a cria. Não é
-- “criar item em nome dos outros” — é copiar para a prova adaptada um item que
-- essa pessoa já revisa.

drop policy if exists "item nasce de quem o cria" on public.itens;

create policy "item nasce de quem o cria" on public.itens
  for insert to authenticated
  with check (
    public.eh_coordenacao()
    or public.sou_autor_do_item(dados)
    -- o `upsert` do cliente: a linha já existe, isto é uma edição (0014)
    or (public.item_existe(id)
        and public.eh_coordenacao_da_area(dados ->> 'componente'))
    -- versão adaptada de um item da própria área
    or (public.item_existe(dados ->> 'derivadoDe')
        and public.eh_coordenacao_da_area(dados ->> 'componente'))
  );

comment on policy "item nasce de quem o cria" on public.itens is
  'Item novo: coordenação geral ou quem o assina. A coordenação da área também pode reapresentar item existente (upsert de edição) e criar a versão adaptada de um item da sua área — quem decide o conteúdo é a política de UPDATE.';
