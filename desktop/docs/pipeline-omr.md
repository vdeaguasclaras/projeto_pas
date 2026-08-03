# Pipeline de leitura óptica (OMR) — etapas planejadas

Entrada: pasta com digitalizações (PDF multipágina ou JPEG/PNG, 300 dpi,
tons de cinza ou colorido). Saída: `respostas.csv` + `respostas_conferir.csv`.

## Etapas

1. **Ingestão** — expandir PDFs em páginas (pypdfium2); normalizar para
   escala de cinza, ~300 dpi.
2. **Localização das âncoras** — binarização adaptativa + detecção de
   contornos; procurar os 4 quadrados pretos nos cantos da área útil.
   Falhou? → página vai para a fila de conferência com motivo `sem_ancoras`.
3. **Homografia** — mapear os 4 cantos para o sistema de coordenadas de
   referência do cartão (corrige rotação, escala e perspectiva do scanner).
4. **Grade de bolhas** — a partir do gabarito JSON (nº de itens e tipo de
   cada um), calcular a posição esperada de cada bolha no espaço de
   referência. A geometria exata (margens, espaçamentos) será fixada quando
   o layout do cartão web for congelado — manter em um único módulo
   `layout.py` versionado junto com o formato `pas-marista/gabarito-v1`.
5. **Decisão por bolha** — proporção de pixels escuros dentro do círculo
   (limiar calibrável, padrão ~35%):
   - exatamente 1 bolha marcada → resposta;
   - 0 bolhas → item em branco (não gera linha no CSV);
   - 2+ bolhas ou proporção ambígua (25–45%) → `respostas_conferir.csv`
     com motivo `dupla_marcacao` / `leitura_duvidosa`.
6. **Identificação do estudante** — v1: operador digita/confirma a matrícula
   exibida junto à miniatura da folha; v2: leitura automática da faixa de
   blocos do rodapé.
7. **Exportação** — CSV no formato do contrato (`docs/contrato-dados.md`).

## Critérios de aceite da v1

- Lote de 30 folhas digitalizadas lido em < 1 min em máquina comum.
- Zero resposta inventada: tudo que não for inequívoco vai para conferência.
- Taxa de conferência manual < 5% em digitalização de boa qualidade.
- Rodar offline, sem depender de internet.
