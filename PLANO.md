# Plano de implementação — Sistema PAS Marista

Plano para transformar o redesign **"Ar & Luz" (v1a)** — entregue via Claude Design em
`design_handoff_sistema_pas` — em aplicação real, seguindo a arquitetura **híbrida** já
definida para o projeto:

- **Fase online (nuvem):** produção colaborativa da prova — painel de coordenação,
  textos-base, alocação de itens por slots, editor com fluxo de revisão, geração dos
  cadernos e cartões-resposta em PDF.
- **Fase offline (local):** leitura óptica dos cartões digitalizados, correção e geração
  de boletins — roda na máquina da coordenação, sem depender de internet no dia da
  aplicação/correção.

## Stack escolhida

| Camada | Tecnologia | Por quê |
|---|---|---|
| Frontend | **React 18 + Vite + TypeScript** | Sugerido no handoff; rápido, tipado, ecossistema maduro |
| Estilo | CSS puro com design tokens (custom properties) | O handoff é hifi com tokens fechados; sem framework CSS para garantir pixel-perfect |
| Ícones | `lucide-react` | Handoff pede substituir os glifos provisórios por lucide |
| Fonte | Sora (Google Fonts) + Arial para documentos PAS | Conforme handoff (fidelidade Cebraspe nos documentos) |
| Roteamento | `react-router-dom` | 6 telas navegáveis com deep-link; remount por rota re-dispara as animações |
| Dados (etapa atual) | Camada mock tipada (`src/data/`) | Mesma modelagem que a API usará; troca-se a implementação sem tocar nas telas |
| Backend online (etapa 2) | API + banco (candidato: Supabase — Postgres, auth e storage) | Colaboração multiusuário docente/coordenação |
| Geração de PDF (etapa 3) | Renderização HTML→PDF server-side (Playwright/Chromium) | Caderno, cartão-resposta e boletins fiéis ao padrão PAS |
| Leitura óptica offline (etapa 4) | App local (Tauri ou Node CLI + a mesma UI React) com OpenCV/detecção de âncoras | Funciona sem internet; sincroniza resultados quando online |

## Etapas

### Etapa 1 — UI completa com dados mock (esta entrega)
- [x] Design tokens globais (cores, tipografia, sombras, raios, animações) em CSS.
- [x] Layout base: sidebar 232px, blobs decorativos animados, área principal 1080px.
- [x] Tela **Painel**: KPIs com contadores animados, cards de versão (shimmer), tabela de entregas.
- [x] Tela **Textos**: cards expansíveis (texto com números de linha, infográfico), slots de alocação, sugestão pendente.
- [x] Tela **Itens**: painel do texto com linhas destacadas, formulário (segmented controls, gabarito C/E), conversa da revisão.
- [x] Tela **Provas**: mesa com capa e página interna do caderno, fiéis ao padrão Cebraspe.
- [x] Tela **Cartão-resposta**: folha nominal com blocos de bolhas, marcadores ópticos e bloco tipo B.
- [x] Tela **Correção**: KPIs de leitura, exportações, desempenho por turma e boletim individual fiel.
- [x] Animações globais: `fadeUp` em cascata, `barGrow`, `floatA/B`, `pulse`, `shimmer`, contadores rAF; respeito a `prefers-reduced-motion`.
- [x] Camada de dados mock tipada espelhando o domínio (etapa, componentes, textos, slots, itens, turmas, boletim).

### Etapa 2 — Fase online: backend colaborativo
- Modelar o domínio no banco (etapas, textos-base, slots, itens, revisões/comentários, usuários docente × coordenação, estudantes/matrículas).
- Autenticação com papéis (docente, coordenação de área, coordenação geral).
- Substituir `src/data/mock.ts` por client da API mantendo os mesmos tipos.
- Fluxo de revisão real: estados do item (rascunho → coord. de área → coord. geral → aprovado/devolvido) + conversa persistida.
- Regras de alocação por texto (ex.: "sem itens tipo D") validadas no servidor.

### Etapa 3 — Geração de documentos (fecha a fase online)
- Diagramador do caderno: paginação em 2 colunas, numeração contínua de itens, capa, faixas, versão regular × adaptada — calibrado contra os PDFs reais do PAS.
- Cartão-resposta nominal em lote (1 por estudante) com âncoras ópticas e código de matrícula.
- Exportação PDF server-side e download em lote (zip).

### Etapa 4 — Fase offline: leitura e correção
- App local (mesma UI React empacotada com Tauri) que importa os PDFs/imagens digitalizados.
- Pipeline de leitura óptica: detecção das 4 âncoras → correção de perspectiva → amostragem das bolhas → decodificação (tipos A/C/E e tipo B em 3 dígitos) → fila de conferência manual para dupla marcação/leitura duvidosa.
- Correção pelo gabarito exportado da fase online (arquivo assinado levado em pendrive/download prévio).
- Boletins individuais e relatórios por turma/série gerados localmente; sincronização dos resultados com a nuvem quando houver internet.

## Estrutura do repositório

```
projeto_pas/
├── PLANO.md                  ← este plano
├── prototipo-pas-marista.html  ← protótipo v2 (referência de conteúdo)
└── app/                      ← aplicação (etapa 1: UI online + telas da fase offline)
    ├── index.html
    ├── src/
    │   ├── styles/           ← tokens + estilos globais
    │   ├── components/       ← Sidebar, KPIs, contadores, botões…
    │   ├── screens/          ← Painel, Textos, Itens, Provas, Cartão, Correção
    │   └── data/             ← tipos de domínio + mock (vira client de API na etapa 2)
    └── public/assets/        ← logo Marista
```

## Como rodar

```bash
cd app
npm install
npm run dev
```
