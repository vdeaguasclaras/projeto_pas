# Projeto PAS — Sistema PAS Marista

Sistema de simulados no formato PAS/UnB para o Colégio Marista Águas Claras:
textos-base com alocação de itens por slots, editor de itens com revisão
comentada em dois níveis, caderno de provas, cartões-resposta nominais e
correção com boletins.

## Estrutura do repositório

| Pasta | Conteúdo |
|---|---|
| `web/` | **Interface on-line** — SPA estática (HTML/CSS/JS, sem build). Com o modo nuvem ativo (`web/js/config-supabase.js`), usa login por conta e banco Supabase compartilhado; sem nuvem, roda 100% local no navegador com backup JSON. |
| `desktop/` | **App local Windows** — leitor óptico (OMR) dos cartões digitalizados. Nesta fase: stack, estrutura, contrato de dados e esqueleto de CLI. |
| `supabase/migrations/` | Esquema do banco on-line (registro versionado do que foi aplicado no projeto `pas-marista`). |
| `docs/plano-implantacao.md` | Plano de implantação por fases (0 a 5) e decisões registradas. |
| `docs/prototipos/` | Protótipo navegável v2 que orientou o design (abrir direto no navegador). |

## Rodando o MVP localmente

É um site estático — basta servir a pasta `web/`:

```bash
cd web && python -m http.server 8000
# http://localhost:8000
```

O MVP abre com dados de exemplo. No Painel (perfil Coordenação) há botões
para zerar tudo, recarregar o exemplo e exportar/importar backup JSON.

## Fluxo completo previsto

1. Coordenação configura o simulado e aprova textos-base; docentes alocam
   itens nos slots livres e os submetem à revisão.
2. Itens aprovados entram automaticamente no caderno (versões regular e
   adaptada) e nos cartões nominais, impressos pelo navegador.
3. Cartões preenchidos são digitalizados em lote e lidos pelo app local
   (`desktop/`), que devolve um CSV.
4. O CSV é importado na tela de Correção → relatórios por turma e boletins
   individuais em PDF.
