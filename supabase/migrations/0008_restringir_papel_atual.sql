-- `papel_atual()` só é chamada de dentro de `checar_status_do_item()`, que é
-- SECURITY DEFINER e roda como o dono — então não precisa estar exposta em
-- /rest/v1/rpc. Fecha o aviso do linter sem mudar comportamento.
--
-- Esta migração foi aplicada no projeto em 29/07/2026 e ficou sem arquivo no
-- repositório — o número 0008 estava vago entre 0007 e 0009. Registrada aqui
-- para que o banco continue podendo ser recriado do zero a partir da pasta,
-- como manda a convenção do projeto.
revoke execute on function public.papel_atual() from authenticated;
