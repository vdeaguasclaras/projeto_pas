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
   coordenadas de referência do cartão. Corrige rotação, escala e a perspectiva
   de um papel mal encostado no vidro, tudo de uma vez.

   As âncoras estão **sempre na mesma posição**, em toda folha de todo cartão —
   a exportação do gabarito confere e se recusa a exportar se deixarem de estar.
   É isso que permite alinhar a folha **antes** de saber que folha é.

4. **Identificação** (`codigo.py`) — só agora, com a folha alinhada, o leitor
   lê a faixa de blocos do rodapé: versão, tipo de cartão, número da folha, total
   e os algarismos da matrícula, fechados por CRC-8.
   - CRC recusado → gira a página 180° e tenta de novo (folha virada é o defeito
     mais comum do alimentador). Recusou nas duas → `faixa_ilegivel`.
   - No **cartão extra** a faixa vem sem matrícula, e quem a informa é a grade
     de alvéolos do alto da folha, lida na etapa 6.

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

   Por grupo de alvéolos (as opções de um item, os 10 algarismos de uma coluna):
   - exatamente 1 marcado, e nenhum a meio caminho → resposta;
   - 0 marcados → item em branco, e não sai linha nenhuma;
   - 2+ marcados → `dupla_marcacao`;
   - marcado + borrão ao lado, ou só borrão → `leitura_duvidosa`, com o palpite
     junto para quem confere;
   - tipo B com 1 ou 2 colunas resolvidas → `tipo_b_incompleto`. Número pela
     metade não é resposta: `9__` tanto pode ser 900 quanto 960.

7. **Calibração e conferência pelo cartão-gabarito** (`leitura.py`) — o lote sai
   da impressora com um cartão de referência na frente, um por versão, com os
   alvéolos do gabarito preenchidos. O leitor varre o topo da pilha atrás dele
   antes de começar, e dele tira:
   - **o limiar desta impressora e deste scanner**, do vão entre os alvéolos que
     deviam estar marcados e os que não deviam. Por percentis, e não pelo mínimo
     e pelo máximo: basta um item divergente para o pior caso de um grupo
     encostar no do outro e o limiar do lote inteiro ir junto;
   - **a conferência entre o papel e a chave**. Divergiu? Alguém mexeu nos itens
     depois de imprimir os cartões — o leitor avisa e sai com código 1, porque
     corrigir o lote com a chave errada é o pior desfecho possível.

   Sem cartão de referência o lote é lido assim mesmo, com o limiar padrão e um
   aviso dizendo o que se perdeu.

8. **Exportação** (`saida.py`) — os CSVs do contrato
   (`docs/contrato-dados.md`), mais `folhas.csv` com uma linha por página e uma
   miniatura do cabeçalho de cada folha que precisa de olho humano.

## Critérios de aceite da v1 — e onde estamos

| Critério | Situação |
|---|---|
| Lote de 30 folhas lido em < 1 min em máquina comum | **atendido** — 98 folhas em ~21 s (~0,21 s/folha) |
| Zero resposta inventada | **atendido** — cobrado pelo teste ponta a ponta |
| Conferência manual < 5% em digitalização de boa qualidade | **atendido** — 0% fora dos casos difíceis plantados de propósito |
| Rodar offline, sem depender de internet | **atendido** — nenhuma chamada de rede |

Medido sobre um lote de 98 folhas de uma prova de 42 itens, digitalizado com
inclinação de até 0,9°, deslocamento, borrão, chuvisco, JPEG de qualidade 82 e
uma folha de cabeça para baixo. Ver `desktop/testes/`.

## O que ainda não está aqui

- **Interface gráfica.** Hoje é linha de comando; a GUI (arrastar a pasta, barra
  de progresso) é o próximo passo, e o pipeline já está separado dela.
- **Importação dos percentuais do discursivo** pelo sistema web. O leitor os lê e
  grava em `percentuais.csv`; o lançamento do discursivo continua por nota, na
  tela de Correção.
- **Matrícula não numérica.** A faixa carrega algarismos. Matrícula sem algarismo
  nenhum, com mais de 12, ou que coincida com a de outro estudante depois de
  tirada a pontuação, cai na conferência — e a tela de Cartões-resposta avisa
  disso **antes** de imprimir, para não se descobrir no dia de digitalizar.
