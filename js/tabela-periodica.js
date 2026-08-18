// A tabela periódica que vai impressa no caderno, como material de consulta.
//
// POR QUE DESENHADA, E NÃO UMA IMAGEM
//
// A tabela publicada pela Sociedade Brasileira de Química é a referência desta
// aqui — mesma diagramação, mesmos pesos atômicos padrão abreviados (IUPAC,
// 2024), mesmos nomes em português. O que muda é o meio: uma imagem de 2048px
// impressa na largura da folha deitada (≈812pt, quase 29 cm) sai a uns 180 dpi,
// e as massas atômicas, que são as menores letras da folha, ficam borradas
// justamente onde o estudante precisa ler o terceiro algarismo. Desenhada em
// HTML, ela imprime vetorial: nítida em qualquer tamanho, sem arquivo grande no
// repositório e sem depender de figura que alguém precise manter.
//
// A FOLHA VAI DEITADA
//
// Em pé, a tabela caberia em 541pt de largura útil — 30pt por elemento. Deitada
// na mesma folha, cabe em 720pt — 40pt por elemento, um terço maior. Numa
// grade de 118 células cheias de número pequeno, esse terço é a diferença entre
// ler e adivinhar. Por isso o miolo da folha é girado (`.tp-giro` em
// css/estilo.css) e a moldura da página — identificação, fios e “folha N / M” —
// fica em pé como em todas as outras: o número da folha se procura sempre no
// mesmo lugar, com o caderno na mão.

// [Z, símbolo, nome, massa, grupo, período]
// O estado vem à parte, embaixo: é exceção, e listar 118 vezes 'sólido' seria
// ruído. Massa entre colchetes é número de massa do nuclídeo mais estável —
// elemento sem abundância isotópica característica em amostra terrestre.
const PERIODICOS = [
  [1, 'H', 'hidrogênio', '1,0080(2)', 1, 1],
  [2, 'He', 'hélio', '4,0026', 18, 1],
  [3, 'Li', 'lítio', '6,94(6)', 1, 2],
  [4, 'Be', 'berílio', '9,0122', 2, 2],
  [5, 'B', 'boro', '10,81(2)', 13, 2],
  [6, 'C', 'carbono', '12,011(2)', 14, 2],
  [7, 'N', 'nitrogênio', '14,007', 15, 2],
  [8, 'O', 'oxigênio', '15,999', 16, 2],
  [9, 'F', 'flúor', '18,998', 17, 2],
  [10, 'Ne', 'neônio', '20,180', 18, 2],
  [11, 'Na', 'sódio', '22,990', 1, 3],
  [12, 'Mg', 'magnésio', '24,305(2)', 2, 3],
  [13, 'Al', 'alumínio', '26,982', 13, 3],
  [14, 'Si', 'silício', '28,085', 14, 3],
  [15, 'P', 'fósforo', '30,974', 15, 3],
  [16, 'S', 'enxofre', '32,06(2)', 16, 3],
  [17, 'Cl', 'cloro', '35,45', 17, 3],
  [18, 'Ar', 'argônio', '39,95(16)', 18, 3],
  [19, 'K', 'potássio', '39,098', 1, 4],
  [20, 'Ca', 'cálcio', '40,078(4)', 2, 4],
  [21, 'Sc', 'escândio', '44,956', 3, 4],
  [22, 'Ti', 'titânio', '47,867', 4, 4],
  [23, 'V', 'vanádio', '50,942', 5, 4],
  [24, 'Cr', 'crômio', '51,996', 6, 4],
  [25, 'Mn', 'manganês', '54,938', 7, 4],
  [26, 'Fe', 'ferro', '55,845(2)', 8, 4],
  [27, 'Co', 'cobalto', '58,933', 9, 4],
  [28, 'Ni', 'níquel', '58,693', 10, 4],
  [29, 'Cu', 'cobre', '63,546(3)', 11, 4],
  [30, 'Zn', 'zinco', '65,38(2)', 12, 4],
  [31, 'Ga', 'gálio', '69,723', 13, 4],
  [32, 'Ge', 'germânio', '72,630(8)', 14, 4],
  [33, 'As', 'arsênio', '74,922', 15, 4],
  [34, 'Se', 'selênio', '78,971(8)', 16, 4],
  [35, 'Br', 'bromo', '79,904(3)', 17, 4],
  [36, 'Kr', 'kriptônio', '83,798(2)', 18, 4],
  [37, 'Rb', 'rubídio', '85,468', 1, 5],
  [38, 'Sr', 'estrôncio', '87,62', 2, 5],
  [39, 'Y', 'ítrio', '88,906', 3, 5],
  [40, 'Zr', 'zircônio', '91,222(3)', 4, 5],
  [41, 'Nb', 'nióbio', '92,906', 5, 5],
  [42, 'Mo', 'molibdênio', '95,95', 6, 5],
  [43, 'Tc', 'tecnécio', '[97]', 7, 5],
  [44, 'Ru', 'rutênio', '101,07(2)', 8, 5],
  [45, 'Rh', 'ródio', '102,91', 9, 5],
  [46, 'Pd', 'paládio', '106,42', 10, 5],
  [47, 'Ag', 'prata', '107,87', 11, 5],
  [48, 'Cd', 'cádmio', '112,41', 12, 5],
  [49, 'In', 'índio', '114,82', 13, 5],
  [50, 'Sn', 'estanho', '118,71', 14, 5],
  [51, 'Sb', 'antimônio', '121,76', 15, 5],
  [52, 'Te', 'telúrio', '127,60(3)', 16, 5],
  [53, 'I', 'iodo', '126,90', 17, 5],
  [54, 'Xe', 'xenônio', '131,29', 18, 5],
  [55, 'Cs', 'césio', '132,91', 1, 6],
  [56, 'Ba', 'bário', '137,33', 2, 6],
  [72, 'Hf', 'háfnio', '178,49', 4, 6],
  [73, 'Ta', 'tântalo', '180,95', 5, 6],
  [74, 'W', 'tungstênio', '183,84', 6, 6],
  [75, 'Re', 'rênio', '186,21', 7, 6],
  [76, 'Os', 'ósmio', '190,23(3)', 8, 6],
  [77, 'Ir', 'irídio', '192,22', 9, 6],
  [78, 'Pt', 'platina', '195,08(2)', 10, 6],
  [79, 'Au', 'ouro', '196,97', 11, 6],
  [80, 'Hg', 'mercúrio', '200,59', 12, 6],
  [81, 'Tl', 'tálio', '204,38', 13, 6],
  [82, 'Pb', 'chumbo', '207,2(1,1)', 14, 6],
  [83, 'Bi', 'bismuto', '208,98', 15, 6],
  [84, 'Po', 'polônio', '[209]', 16, 6],
  [85, 'At', 'astato', '[210]', 17, 6],
  [86, 'Rn', 'radônio', '[222]', 18, 6],
  [87, 'Fr', 'frâncio', '[223]', 1, 7],
  [88, 'Ra', 'rádio', '[226]', 2, 7],
  [104, 'Rf', 'rutherfórdio', '[267]', 4, 7],
  [105, 'Db', 'dúbnio', '[268]', 5, 7],
  [106, 'Sg', 'seabórgio', '[269]', 6, 7],
  [107, 'Bh', 'bóhrio', '[270]', 7, 7],
  [108, 'Hs', 'hássio', '[269]', 8, 7],
  [109, 'Mt', 'meitnério', '[277]', 9, 7],
  [110, 'Ds', 'darmstádtio', '[281]', 10, 7],
  [111, 'Rg', 'roentgênio', '[282]', 11, 7],
  [112, 'Cn', 'copernício', '[285]', 12, 7],
  [113, 'Nh', 'nihônio', '[286]', 13, 7],
  [114, 'Fl', 'fleróvio', '[290]', 14, 7],
  [115, 'Mc', 'moscóvio', '[290]', 15, 7],
  [116, 'Lv', 'livermório', '[293]', 16, 7],
  [117, 'Ts', 'tennesso', '[294]', 17, 7],
  [118, 'Og', 'oganessônio', '[294]', 18, 7]
];

// As duas séries que saem embaixo. `bloco` decide a cor da faixa, como na
// referência: lantanídios em amarelo, actinídios em verde.
const LANTANIDIOS = [
  [57, 'La', 'lantânio', '138,91'], [58, 'Ce', 'cério', '140,12'],
  [59, 'Pr', 'praseodímio', '140,91'], [60, 'Nd', 'neodímio', '144,24'],
  [61, 'Pm', 'promécio', '[145]'], [62, 'Sm', 'samário', '150,36(2)'],
  [63, 'Eu', 'európio', '151,96'], [64, 'Gd', 'gadolínio', '157,25'],
  [65, 'Tb', 'térbio', '158,93'], [66, 'Dy', 'disprósio', '162,50'],
  [67, 'Ho', 'hólmio', '164,93'], [68, 'Er', 'érbio', '167,26'],
  [69, 'Tm', 'túlio', '168,93'], [70, 'Yb', 'itérbio', '173,05(2)'],
  [71, 'Lu', 'lutécio', '174,97']
];
const ACTINIDIOS = [
  [89, 'Ac', 'actínio', '[227]'], [90, 'Th', 'tório', '232,04'],
  [91, 'Pa', 'protactínio', '231,04'], [92, 'U', 'urânio', '238,03'],
  [93, 'Np', 'neptúnio', '[237]'], [94, 'Pu', 'plutônio', '[244]'],
  [95, 'Am', 'amerício', '[243]'], [96, 'Cm', 'cúrio', '[247]'],
  [97, 'Bk', 'berkélio', '[247]'], [98, 'Cf', 'califórnio', '[251]'],
  [99, 'Es', 'einstênio', '[252]'], [100, 'Fm', 'férmio', '[257]'],
  [101, 'Md', 'mendelévio', '[258]'], [102, 'No', 'nobélio', '[259]'],
  [103, 'Lr', 'laurêncio', '[262]']
];

// Estado do elemento nas condições de referência, para a cor do símbolo. Só as
// exceções: quem não está aqui é sólido.
const GASES = new Set([1, 2, 7, 8, 9, 10, 17, 18, 36, 54, 86]);
const LIQUIDOS = new Set([35, 80]);    // bromo e mercúrio
// Sem abundância isotópica característica em amostra terrestre natural: saem
// vazados, como na referência.
const SINTETICOS = new Set([
  95, 96, 97, 98, 99, 100, 101, 102, 103,
  104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118
]);

const classeDoEstado = z =>
  SINTETICOS.has(z) ? 'tp-sintetico'
    : LIQUIDOS.has(z) ? 'tp-liquido'
      : GASES.has(z) ? 'tp-gas' : '';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Uma célula. O nome longo (“praseodímio”, “darmstádtio”) encolhe sozinho em
// vez de estourar a célula ou ser cortado: `tp-longo` baixa o corpo do nome.
function celula(z, simbolo, nome, massa, estilo = '', fundo = '') {
  const longo = nome.length > 11 ? ' tp-longo' : '';
  return `<div class="tp-el ${classeDoEstado(z)} ${fundo}"${estilo}>
    <span class="tp-cab"><b>${z}</b><i>${esc(massa)}</i></span>
    <span class="tp-s">${esc(simbolo)}</span>
    <span class="tp-n${longo}">${esc(nome)}</span>
  </div>`;
}

function htmlTabelaPeriodica() {
  const principais = PERIODICOS.map(([z, s, nome, massa, grupo, periodo]) =>
    celula(z, s, nome, massa, ` style="grid-column:${grupo};grid-row:${periodo + 1}"`)).join('');

  // Os rótulos dos grupos (1 a 18) e dos períodos, na borda da grade.
  const grupos = Array.from({ length: 18 }, (_, i) =>
    `<div class="tp-grupo" style="grid-column:${i + 1};grid-row:1">${i + 1}</div>`).join('');

  // As duas caixas que remetem às séries de baixo, no lugar do grupo 3.
  const remissoes = `
    <div class="tp-serie tp-lant" style="grid-column:3;grid-row:7">lantanídios<br>57 – 71</div>
    <div class="tp-serie tp-act" style="grid-column:3;grid-row:8">actinídios<br>89 – 103</div>`;

  // As duas séries entram na MESMA grade, nas duas últimas linhas, alinhadas à
  // coluna do grupo 3 — de onde as remissões as chamam. Estar na mesma grade é
  // o que garante que a célula delas tenha o tamanho da célula do resto: série
  // mais baixa que a grade pareceria nota de rodapé, e ela é tabela como o
  // resto. Amarrar duas alturas separadas à mão daria certo hoje e desalinharia
  // na primeira vez que a folha mudasse de medida.
  const serie = (lista, cls, linha) => lista.map(([z, s, nome, massa], i) =>
    celula(z, s, nome, massa, ` style="grid-column:${i + 3};grid-row:${linha}"`, cls)).join('');

  // A legenda mora DENTRO da grade, no vão que os grupos 3 a 12 deixam nos três
  // primeiros períodos — é onde a referência a põe, e é espaço que já estava
  // ali sem uso. Fora da grade ela roubaria altura de todas as 118 células.
  const legenda = `
    <div class="tp-legenda" style="grid-column:3 / 13;grid-row:2 / 5">
      <span class="tp-chave">
        <span class="tp-el tp-exemplo"><span class="tp-cab"><b>14</b><i>28,085</i></span>
          <span class="tp-s">Si</span><span class="tp-n">silício</span></span>
        <span class="tp-chave-txt">número atômico · peso atômico<br>símbolo<br>nome</span>
      </span>
      <span class="tp-estados">
        <span><b class="tp-am">Zn</b> sólido</span>
        <span><b class="tp-am tp-liquido">Hg</b> líquido</span>
        <span><b class="tp-am tp-gas">Ne</b> gás</span>
        <span><b class="tp-am tp-sintetico">Cf</b> sem isótopo característico<br>
          em amostras terrestres naturais</span>
      </span>
    </div>`;

  return `
  <div class="tp">
    <h2 class="tp-titulo">Tabela periódica dos elementos</h2>
    <div class="tp-grade">${grupos}${principais}${remissoes}${legenda}${
      serie(LANTANIDIOS, 'tp-lant', 10)}${serie(ACTINIDIOS, 'tp-act', 11)}</div>
    <p class="tp-nota">Pesos atômicos padrão abreviados (IUPAC, 2024); a incerteza no último dígito é ±1,
      exceto quando indicada entre parênteses. Valor entre colchetes: número de massa do nuclídeo mais
      estável, para os elementos sem abundância isotópica característica em amostras terrestres naturais.</p>
  </div>`;
}

export { htmlTabelaPeriodica };
