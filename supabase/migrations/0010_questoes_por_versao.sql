-- Quantidade de questões passa a ser por versão da prova.
--
-- Até aqui `provas.dados->'totalQuestoes'` era um número só. A coordenação
-- informou que a **prova adaptada tem tamanho próprio**, diferente da regular —
-- então um número só não fecha conta: comparar a entrega da adaptada com a meta
-- da regular diria que falta o que não falta.
--
-- O campo vira `{"regular": N, "adaptada": M}`. O leitor no cliente
-- (`totalDeQuestoes`, js/app.js) aceita os dois formatos, e trata o número solto
-- antigo como o tamanho da regular — que era a única definida quando ele foi
-- gravado.
--
-- Os números da regular vieram da coordenação; os da adaptada ficam **nulos**
-- até ela definir, e a interface mostra "a definir" em vez de inventar
-- denominador.

update public.provas p
   set dados = p.dados || jsonb_build_object(
         'totalQuestoes',
         jsonb_build_object('regular', q.regular, 'adaptada', null::int))
  from (values
         ('pr-9ano',  90),
         ('pr-1em',  100),
         ('pr-2em',  110),
         ('pr-3em',  120)
       ) as q(id, regular)
 where p.id = q.id;

-- Prova criada fora dessa lista (outra etapa, por exemplo) que ainda tenha o
-- número solto: converte preservando o valor como o da regular.
update public.provas p
   set dados = p.dados || jsonb_build_object(
         'totalQuestoes',
         jsonb_build_object(
           'regular', (p.dados -> 'totalQuestoes')::text::int,
           'adaptada', null::int))
 where jsonb_typeof(p.dados -> 'totalQuestoes') = 'number';
