-- Imagens em texto-base e em item: infográfico, mapa, obra de arte, figura de
-- geometria, estrutura química. Hoje o sistema não guarda imagem nenhuma — o
-- "Infográfico — matriz energética" dos dados de exemplo é a *descrição* de um
-- infográfico, escrita à mão, porque não havia onde pôr a imagem.
--
-- ONDE AS IMAGENS FICAM, E POR QUÊ
--
-- Em bucket do Storage, não embutidas no `dados` jsonb. Uma imagem de 300 kB
-- viraria ~400 kB de base64 numa linha que é lida a cada carregamento de tela;
-- com vinte textos ilustrados, a abertura do sistema passaria de dezenas de
-- megabytes. O `dados` guarda só a referência, as dimensões e a legenda.
--
-- POR QUE O BUCKET É PRIVADO
--
-- Conteúdo de prova é sigiloso até a aplicação. Todas as tabelas deste projeto
-- exigem `eh_equipe()`; um bucket público seria o único lugar por onde o
-- infográfico de uma prova ainda não aplicada sairia, bastando a URL. O cliente
-- pede URL assinada de validade curta na hora de exibir.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imagens', 'imagens', false,
  5242880,   -- 5 MB: acima disso a imagem não é de prova impressa, é original de
             -- câmera que ninguém reduziu, e ela pesaria na montagem do caderno
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
   set public = excluded.public,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- Leitura: a equipe toda, porque quem escreve item precisa ver o texto-base
-- ilustrado, e quem revisa também.
create policy "equipe lê imagens" on storage.objects
  for select to authenticated
  using (bucket_id = 'imagens' and public.eh_equipe());

-- Envio: a equipe toda também — o docente ilustra o próprio item. O limite de
-- tamanho e de tipo é do bucket, e vale para todos.
create policy "equipe envia imagens" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'imagens' and public.eh_equipe());

-- Substituir a própria imagem (o mesmo caminho) fica com quem a enviou; a
-- coordenação pode mexer em qualquer uma, como em todo o resto do sistema.
create policy "autor ou coordenação atualiza imagem" on storage.objects
  for update to authenticated
  using (bucket_id = 'imagens' and (owner = auth.uid() or public.eh_coordenacao()))
  with check (bucket_id = 'imagens' and (owner = auth.uid() or public.eh_coordenacao()));

-- Apagar: mesma regra da exclusão no resto do sistema (migração 0006) — a
-- coordenação, ou quem enviou, para poder desfazer o próprio envio errado.
create policy "autor ou coordenação apaga imagem" on storage.objects
  for delete to authenticated
  using (bucket_id = 'imagens' and (owner = auth.uid() or public.eh_coordenacao()));
