// Leitura da lista de estudantes colada pela coordenação.
//
// Fica separada da tela porque é a parte que erra: planilha da secretaria vem
// com cabeçalho, com a série escrita de seis jeitos diferentes, com matrícula
// repetida e com linha em branco no fim. Aqui isso é decidido uma vez só, e dá
// para conferir sem abrir o sistema.

// Aceita "9º ano", "9 ano", "9ANO", "9"; e "1ª série", "1a serie EM", "2º ano",
// "3". Devolve a série canônica ou null quando não reconhece — nunca chuta.
function serieCanonica(bruto) {
  const t = String(bruto || '').toLowerCase()
    // Tira os acentos combinantes (á → a) …
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // … e os indicadores ordinais, que não são acentos combinantes e por isso
    // sobrevivem ao NFD. Sem esta linha "9º ano" e "1ª série" — justamente a
    // grafia que a secretaria usa — não são reconhecidos.
    .replace(/[º ª]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (/(^|\D)9\s*(o|a)?\s*ano(\s|$)|^9$/.test(t)) return '9º ano';
  const m = t.match(/(^|\D)([123])\s*(o|a)?\s*(serie|ano)?(\s|$)/);
  if (m) return `${m[2]}ª série EM`;
  return null;
}

// Uma primeira linha que fale de "nome" e "matrícula" é cabeçalho de planilha.
const ehCabecalho = col =>
  /nome/i.test(col[0] || '') && /matr|inscri/i.test(col[1] || '');

// Devolve { bons, ruins }: nada é gravado aqui, só interpretado. `ruins` diz o
// número da linha e o motivo, para a conferência mostrar antes de importar.
function lerLinhasEstudantes(texto) {
  const cru = String(texto || '').split('\n').map(l => l.trim()).filter(Boolean);
  const bons = [], ruins = [];

  cru.forEach((linha, ix) => {
    const col = linha.split(/[;,\t]/).map(x => (x || '').trim());
    if (ix === 0 && ehCabecalho(col)) return;

    const [nome, matricula, turma, serie, versao] = col;
    if (!nome || !matricula) {
      ruins.push({ linha: ix + 1, texto: linha, porque: 'faltou nome ou matrícula' });
      return;
    }
    const s = serieCanonica(serie);
    if (!s) {
      ruins.push({ linha: ix + 1, texto: linha, porque: `série “${serie || '(vazia)'}” não reconhecida` });
      return;
    }
    bons.push({
      nome, matricula, turma: turma || '—', serie: s,
      versao: /adapt/i.test(versao || '') ? 'adaptada' : 'regular'
    });
  });

  // Matrícula repetida dentro do próprio arquivo: vale a última, com aviso —
  // é quase sempre a linha corrigida que a secretaria colou por cima.
  const porMatricula = new Map();
  for (const b of bons) {
    if (porMatricula.has(b.matricula))
      ruins.push({ linha: '—', texto: b.matricula, porque: 'matrícula repetida no arquivo — vale a última' });
    porMatricula.set(b.matricula, b);
  }

  return { bons: [...porMatricula.values()], ruins };
}

export { serieCanonica, lerLinhasEstudantes };
