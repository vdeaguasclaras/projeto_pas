# Pipeline de leitura óptica (OMR)

Entrada: pasta com digitalizações (PDF multipágina ou JPEG/PNG, 300 dpi, tons de
cinza ou colorido). Saída: `respostas.csv`, `respostas_conferir.csv`,
`percentuais.csv` e `folhas.csv`, mais as miniaturas de `conferencia/`.

Uma regra vale sobre todas as outras, e é dela que saem quase todas as decisões
abaixo: **nada duvidoso vira resposta**. O leitor prefere devolver uma folha para
conferência a devolver um valor que não tem certeza — porque folha conferida à
mão custa um minuto e prova lançada errada custa a nota de alguém, descoberta
semanas depois.

## Etapas

1. **Ingestão** (`imagem.py`) — PDFs viram páginas (pypdfium2, 300 dpi); imagens
   entram direto. Tudo em escala de cinza, com o nome do arquivo e o número da
   página presos à imagem: toda recusa mais adiante sabe dizer QUAL folha
   recusou, e o operador acha o papel na pilha.

2. **Localização das âncoras** (`ancoras.py`) — binarização de Otsu e componentes
   conexos; sobram as manchas do tamanho da âncora (9pt), quadradas e sólidas.

   De que tamanho procurar sai da **mancha impressa** — o retângulo que contém
   toda a tinta da folha —, e não da largura da página. **A página não é o
   cartão**: a primeira digitalização de verdade veio de uma mesa A3, com o A4
   solto no meio de uma página quase duas vezes maior, e a conta antiga saiu
   1,4× errada. A largura da página fica como segunda tentativa, para o caso de
   uma sombra de borda engordar a mancha.

   Dois filtros importam:
   - **a proporção mancha/caixa** (~1 no quadrado, ~0,79 no círculo) é o que
     separa a âncora do **alvéolo preenchido**, que tem quase o mesmo tamanho.
     Sem esse filtro, o cartão-gabarito — que sai com dezenas de alvéolos cheios
     — viraria um campo minado de âncoras falsas;
   - **a forma do quadrilátero**: quatro manchas quadradas quaisquer também
     formam um quadrilátero; o que faz destas quatro AS âncoras é a proporção
     entre a largura e a altura ser a mesma do cartão impresso.

   Falhou? → a página vai para `folhas.csv` com `sem_ancoras` e uma miniatura.

3. **Homografia** (`ancoras.py`) — os quatro cantos achados são levados às
   coordenadas de referência do cartão. Corrige rotação fina, escala e a
   perspectiva de um papel mal encostado no vidro, tudo de uma vez.

   As âncoras estão **sempre na mesma posição**, em toda folha de todo cartão —
   a exportação do gabarito confere e se recusa a exportar se deixarem de estar.
   É isso que permite alinhar a folha **antes** de saber que folha é.

   **Antes disso, a folha pode estar deitada.** O scanner da escola alimenta o
   papel de lado, e a primeira digitalização real chegou com o cartão a 90°:
   âncoras perfeitas, e o retângulo delas com a proporção invertida (1,299 em
   vez de 0,772). Quem responde “em pé ou deitada” são as próprias âncoras, pela
   proporção — isso reduz quatro posições possíveis a duas. Quem responde “de
   cabeça para baixo ou não” é o CRC da faixa, na etapa seguinte.

4. **Identificação** (`codigo.py`) — só agora, com a folha alinhada, o leitor
   lê a faixa de blocos do rodapé: versão, tipo de cartão, número da folha, total
   e os algarismos da matrícula, fechados por CRC-8.
   - CRC recusado → tenta a outra posição da mesma família (a folha estava de
     cabeça para baixo, que é o defeito mais comum do alimentador). Recusou nas
     duas → `faixa_ilegivel`. Ler ao contrário devolveria lixo com cara de
     matrícula, e é o CRC que recusa — sem ele, nada disso seria seguro.
   - No **cartão extra** a faixa vem sem matrícula, e quem a informa é a grade
     de alvéolos do alto da folha, lida na etapa 6. Ali não há CRC nenhum por
     baixo, e a conferência possível é o formato: matrícula que não tenha nove
     algarismos ou não comece em `225` (o código da unidade) é leitura suspeita
     e vai para a fila. O formato vem no gabarito, não escrito aqui.

5. **Grade de alvéolos** (`molde.py`) — a posição esperada de cada alvéolo vem
   do gabarito `v4`, medida pelo navegador no ato da exportação. **Não há
   geometria escrita neste repositório**, e é de propósito: a posição nasce do
   flex do CSS do sistema web, e um leitor com essas medidas decoradas erraria
   calado na primeira mudança do cartão.

6. **Decisão por alvéolo** (`leitura.py`) — proporção de pixels escuros no
   **miolo** do círculo. Só o miolo: o anel impresso é rosa, que em tons de cinza
   é escuro, e medi-lo junto acusaria alvéolo cheio em folha limpa. O limiar de
   “há tinta aqui” é medido contra o papel desta folha, não contra um valor
   absoluto — scanner escuro e papel amarelado mudam a escala inteira.

   **A folha inteira é medida antes de qualquer decisão**, e é dela que sai a
   régua que a decide. Numa folha preenchida os alvéolos formam dois grupos bem
   separados — os vazios juntos lá embaixo, os marcados espalhados mais acima —
   e entre eles há um vão sem ninguém. A régua vai nesse vão.

   Isso não é refinamento: é o que separa ler a folha de reprovar a folha. Na
   primeira digitalização de verdade, duas folhas do mesmo lote preenchidas por
   pessoas diferentes deram marcas em faixas completamente distintas — numa
   passando de 80%, na outra a maioria entre 45% e 60%. Uma régua só para as
   duas mandou 24 marcações legítimas de uma única folha para a conferência.
   Sem vão claro (folha em branco, ou quase) vale a régua herdada.

   Por grupo de alvéolos (as opções de um item, os 10 algarismos de uma coluna):
   - exatamente 1 marcado, e nenhum a meio caminho → resposta;
   - 0 marcados → item em branco, e não sai linha nenhuma;
   - 2+ marcados → `dupla_marcacao`;
   - marcado + borrão ao lado, ou só borrão → `leitura_duvidosa`, com o palpite
     junto para quem confere;
   - tipo B com 1 ou 2 colunas resolvidas → `tipo_b_incompleto`. Número pela
     metade não é resposta: `9__` tanto pode ser 900 quanto 960.

7. **O que o cartão-gabarito dá** (`leitura.py`) — o lote sai da impressora com
   um cartão de referência na frente, um por versão, com os alvéolos do gabarito
   preenchidos. O leitor varre o topo da pilha atrás dele antes de começar.

   Ele dá **menos do que parecia**, e saber o quê importa. A ideia original era
   tirar dele o limiar do lote inteiro — uma folha onde se sabe, alvéolo por
   alvéolo, o que devia estar marcado. Só que as marcas dele são de **toner**, e
   passam de 80% sempre; o estudante escreve a **caneta**, e a marca vai de 30%
   a 100% conforme a pressão da mão. Régua tirada da folha impressa fica alta
   demais para gente. Então dele saem só:

   - **o nível do PAPEL** — quanto escurece um alvéolo vazio nesta impressora e
     neste scanner. Isso se transfere, e vira a régua de reserva para a folha
     que não tiver o que dizer sobre si;
   - **a conferência entre o papel e a chave**. Divergiu? Alguém mexeu nos itens
     depois de imprimir os cartões — o leitor avisa e sai com código 1, porque
     corrigir o lote com a chave errada é o pior desfecho possível.

   Sem cartão de referência o lote é lido assim mesmo, com a régua padrão e um
   aviso dizendo o que se perdeu. Isso é **aviso**, não divergência: o lote
   segue, e o código de saída continua 0.

8. **Exportação** (`saida.py`) — os CSVs do contrato
   (`docs/contrato-dados.md`), mais `folhas.csv` com uma linha por página.

   E a **fila de conferência com imagem**: para cada marcação duvidosa, um PNG
   do pedaço da folha onde ela está — endireitado pela mesma homografia, e com
   folga bastante para trazer junto o número do item, a letra da opção ou o
   cabeçalho do bloco do tipo B. “O item 47 ficou duvidoso” não resolve nada
   sozinho: para decidir, alguém teria de achar o papel na pilha, achar a linha
   e olhar. Com o recorte, a decisão é de dois segundos.

   Tudo isso é reunido em `conferencia.html`, uma página que abre com dois
   cliques, sem internet e sem programa instalado: cada linha traz o recorte, o
   que o leitor achou que era, e um campo para corrigir; um botão monta o CSV do
   que foi decidido, pronto para colar em “Importar respostas”. A interface
   gráfica do leitor, quando vier, faz isto dentro do próprio aplicativo.

## Critérios de aceite da v1 — e onde estamos

| Critério | Situação |
|---|---|
| Lote de 30 folhas lido em < 1 min em máquina comum | **atendido** — ~0,9 s/folha em mesa A3 deitada, ~0,2 s/folha em A4 em pé |
| Zero resposta inventada | **atendido** — cobrado pelo teste ponta a ponta |
| Conferência manual < 5% em digitalização de boa qualidade | **atendido** — 0% fora dos casos difíceis plantados de propósito; e 0% no lote real da escola, 330 marcações a caneta em quatro folhas |
| Rodar offline, sem depender de internet | **atendido** — nenhuma chamada de rede |

Medido sobre um lote de 98 folhas de uma prova de 42 itens, digitalizado como a
escola digitaliza: **mesa A3, cartão deitado**, com inclinação de até 0,9°,
deslocamento, borrão, chuvisco, JPEG de qualidade 82 e uma folha ainda por cima
de cabeça para baixo. Foram 85 s no total.

## Conferido no papel, com a impressora e o scanner da escola

Em 18/08/2026 a coordenação imprimiu quatro cartões da prova da 2ª série (110
itens na regular, 55 na adaptada), preencheu dois à mão e digitalizou os quatro
juntos. **As 165 marcações foram conferidas uma a uma contra o papel: bateu
tudo.** Zero na fila de conferência, zero divergência entre o cartão-gabarito
impresso e a chave exportada, e as duas matrículas lidas da faixa do rodapé
(`225240380` e `225260117`) conferidas pelo CRC.

Foi essa passagem — e não o teste automático — que descobriu as três coisas que
este documento explica: a mesa A3, o cartão deitado e a diferença entre toner e
caneta. **Nenhuma delas aparecia em digitalização simulada por quem escreveu o
leitor**, porque cada uma vinha de uma suposição que só o papel desmente.

> **Uma expectativa que convém não criar.** Zero na fila veio de duas folhas
> preenchidas com cuidado por uma pessoa só. Na aplicação de verdade haverá
> rasura, marca fraca e dupla marcação — a fila de conferência vai existir, e é
> para isso que ela existe. O que se mede é se ela fica pequena, não se ela
> some.

**Digitalizar em pé, e em A4, é quatro vezes mais rápido** — a página tem metade
dos pixels e o leitor não precisa procurar a posição. O leitor resolve os dois
casos sozinho e avisa, ao fim do lote, quantas folhas vieram deitadas.

## O que ainda não está aqui

- **Interface gráfica.** Hoje é linha de comando; a GUI (arrastar a pasta, barra
  de progresso) é o próximo passo, e o pipeline já está separado dela.
- **Importação dos percentuais do discursivo** pelo sistema web. O leitor os lê e
  grava em `percentuais.csv`; o lançamento do discursivo continua por nota, na
  tela de Correção.
- **Matrícula fora do padrão da escola.** A faixa carrega algarismos, e a
  matrícula do Marista Águas Claras tem nove começando em `225`. Matrícula sem
  algarismo nenhum, com mais de 12, fora desse padrão, ou que coincida com a de
  outro estudante depois de tirada a pontuação, cai na conferência — e a tela de
  Cartões-resposta avisa disso **antes** de imprimir. Fora do padrão é quase
  sempre erro de digitação na planilha da secretaria, e ali sai barato
  consertar; no dia de digitalizar o lote, não.
