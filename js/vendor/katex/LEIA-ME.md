# KaTeX 0.18.1 — cópia versionada

Renderizador de notação matemática usado por `js/rico.js`. Como o resto de
`js/vendor/`, é **cópia local**: o sistema não carrega nada de CDN, nem em
desenvolvimento nem em produção.

Origem: `npm pack katex@0.18.1` (licença MIT, em `LICENCA-MIT.txt`).

## O que veio, o que ficou de fora

| Arquivo aqui | Vem de | Alterado? |
|---|---|---|
| `katex.mjs` | `dist/katex.mjs` | não — byte a byte |
| `katex.css` | `dist/katex.css` | sim, só nas linhas de `@font-face` |
| `fontes/*.woff2` | `dist/fonts/*.woff2` | não |

Ficaram fora `katex.min.js` (é UMD; aqui se usa `import`, e o módulo ES é o que
serve), a pasta `contrib/` (auto-render, copy-tex, mhchem — nada disso é usado)
e os `dist/fonts/*.woff` e `*.ttf`.

## Por que só woff2

O pacote traz cada uma das 20 fontes em três formatos, 1,2 MB somados. Só o
woff2 ficou: **300 kB** para as 20 fontes, e nenhum navegador que a escola usa
fica sem — woff2 é suportado desde Chrome 36, Firefox 39, Safari 10 e Edge 14.
Manter woff e ttf quadruplicaria o peso para atender navegador que ninguém tem.

A única alteração em `katex.css` é essa: cada `@font-face` perdeu as fontes
`.woff`/`.ttf` e aponta para `fontes/…woff2`. A pasta se chama `fontes` (e não
`fonts`) porque neste repositório o nome dos arquivos é em português; o caminho
dentro do CSS foi ajustado junto.

Vale registrar que a **alternativa** — usar o KaTeX sem fonte própria, caindo
nas fontes do sistema — foi descartada: sem as fontes do KaTeX a métrica de
frações, radicais e delimitadores esticáveis sai errada, e o caderno impresso é
justamente o documento em que essa medida importa. 300 kB, servidos com
`Cache-Control: immutable` pela regra de `/js/vendor/(.*)` no `vercel.json`, é
preço barato por fórmula que sai igual na tela e no papel.

## Atualizar de versão

1. `npm pack katex@<versão>` e descompactar.
2. Copiar `dist/katex.mjs` e `dist/fonts/*.woff2` (para `fontes/`).
3. Copiar `dist/katex.css` trocando cada bloco

   ```
   src: url(fonts/X.woff2) format("woff2"), url(fonts/X.woff) …, url(fonts/X.ttf) …;
   ```

   por `src: url(fontes/X.woff2) format("woff2");`, e manter o cabeçalho de
   comentário do arquivo.
4. Conferir que `js/rico.js` continua chamando só `renderToString` e que as
   opções de segurança (`trust: false`, `maxSize`) seguem existindo no schema da
   versão nova.
