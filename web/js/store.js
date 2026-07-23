// Camada de dados do MVP — persistência em localStorage do navegador.
// Fase 2 do plano de implantação: substituir load/save/persistência por
// Supabase (Postgres + Auth + RLS) mantendo esta mesma interface.
// Ver docs/plano-implantacao.md.

const KEY = 'pas-marista-mvp-v1';

export const COMPONENTES = {
  'Português': 'd-lp', 'Literatura': 'd-lit', 'Matemática': 'd-mat', 'Biologia': 'd-bio',
  'Química': 'd-qui', 'História': 'd-his', 'Física': 'd-fis', 'Geografia': 'd-geo',
  'Inglês': 'd-ing', 'Filosofia': 'd-fil', 'Sociologia': 'd-soc', 'Espanhol': 'd-esp', 'Artes': 'd-art'
};

export const GRUPOS = ['Interpretar', 'Planejar', 'Executar', 'Criticar'];

// Tipos de item no formato PAS. A pontuação (fase de calibração) segue a
// simplificação: A = certo +1 / errado −1; B = certo +1; C e D = certo +1 / errado −1.
export const TIPOS = {
  A: { rotulo: 'A — Certo/Errado', respostas: ['C', 'E'] },
  B: { rotulo: 'B — Numérico (000 a 999)', respostas: null },
  C: { rotulo: 'C — Múltipla escolha', respostas: ['A', 'B', 'C', 'D'] },
  D: { rotulo: 'D — Múltipla escolha', respostas: ['A', 'B', 'C', 'D'] }
};

export const STATUS_ITEM = {
  rascunho:  { rot: 'Rascunho',                          cls: 'info'  },
  area:      { rot: 'Em revisão — coord. de área',       cls: 'pend'  },
  geral:     { rot: 'Em revisão — coordenação geral',    cls: 'pend'  },
  devolvido: { rot: 'Devolvido com ajustes',             cls: 'falta' },
  aprovado:  { rot: 'Aprovado',                          cls: 'ok'    }
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

export function blank() {
  return {
    versao: 1,
    config: {
      nome: 'Simulado PAS', etapa: '1ª Etapa', serie: '2ª série EM',
      dataAplicacao: '', duracao: '4h30', sala: ''
    },
    perfil: { papel: 'coordenacao', nome: 'Coordenação', componente: null },
    textos: [],
    itens: [],
    estudantes: [],
    respostas: {}
  };
}

export function seed() {
  const s = blank();
  s.config = {
    nome: 'Simulado PAS 2026', etapa: '1ª Etapa', serie: '2ª série EM',
    dataAplicacao: '2026-09-12', duracao: '4h30', sala: '2101'
  };
  s.perfil = { papel: 'coordenacao', nome: 'Raul', componente: null };

  const t1 = {
    id: 'tx1', numero: 1, status: 'aprovado', sugeridoPor: null,
    titulo: '“O Cerrado e as veredas” — Guimarães Rosa (adapt.)',
    fonte: 'Guimarães Rosa (adaptado)', slots: 8,
    regra: 'regra do coordenador: sem itens tipo D neste texto',
    linhas: [
      'O buriti é a palmeira dos brejos, das veredas, onde a água',
      'aflora e o chão se faz úmido o ano inteiro. Ali, entre capões',
      'e chapadões, o sertão guarda suas nascentes como quem',
      'guarda segredo antigo.',
      'As veredas alimentam os rios que descem para todas as',
      'bacias do país, e por isso o Cerrado é chamado de',
      'caixa-d’água do Brasil.',
      'Mas a caixa-d’água racha: onde a vereda seca, o buriti',
      'tomba, e com ele vai-se a memória da água.'
    ]
  };
  const t2 = {
    id: 'tx2', numero: 2, status: 'aprovado', sugeridoPor: null,
    titulo: 'Infográfico — matriz energética brasileira 2025',
    fonte: 'EPE — Balanço Energético Nacional (adaptado)', slots: 6, regra: '',
    linhas: [
      'O infográfico apresenta a participação das fontes na matriz',
      'energética brasileira em 2025: hidráulica 52%, eólica 14%,',
      'solar 9%, biomassa 8%, gás natural 9%, carvão 3%,',
      'nuclear 2% e petróleo 3%.',
      'As fontes renováveis somam 83% da geração elétrica,',
      'colocando o Brasil entre as matrizes mais limpas do mundo.'
    ]
  };
  const t3 = {
    id: 'tx3', numero: null, status: 'sugestao', sugeridoPor: 'João Pedro (História)',
    titulo: 'Sugestão de texto — “Carta da Terra” (trecho)',
    fonte: 'ONU, 2000', slots: 6, regra: '',
    linhas: [
      'Estamos diante de um momento crítico na história da Terra,',
      'numa época em que a humanidade deve escolher o seu futuro.',
      'À medida que o mundo torna-se cada vez mais interdependente',
      'e frágil, o futuro enfrenta, ao mesmo tempo, grandes perigos',
      'e grandes promessas.'
    ]
  };
  s.textos = [t1, t2, t3];

  const c = (autor, papel, quando, texto) => ({ autor, papel, quando, texto });
  s.itens = [
    {
      id: 'it1', textoId: 'tx1', tipo: 'A', componente: 'Literatura', autor: 'Ana Beatriz',
      habilidade: 'H2 — Recursos expressivos', grupo: 'Interpretar', versao: 'ambas',
      linhasRef: '1-4', gabarito: 'C', opcoes: [],
      enunciado: 'No fragmento, a personificação do sertão (linhas 3 e 4) reforça o tom lírico característico da prosa de Guimarães Rosa.',
      status: 'aprovado', comentarios: []
    },
    {
      id: 'it2', textoId: 'tx1', tipo: 'A', componente: 'Geografia', autor: 'Túlio',
      habilidade: 'H14 — Dinâmica hídrica', grupo: 'Interpretar', versao: 'ambas',
      linhasRef: '5-7', gabarito: 'C', opcoes: [],
      enunciado: 'A expressão “caixa-d’água do Brasil” refere-se ao papel do Cerrado na recarga dos aquíferos e das bacias hidrográficas do país.',
      status: 'aprovado', comentarios: []
    },
    {
      id: 'it3', textoId: 'tx1', tipo: 'C', componente: 'Biologia', autor: 'Fernanda',
      habilidade: 'H18 — Adaptações vegetais', grupo: 'Executar', versao: 'regular',
      linhasRef: '1-2', gabarito: 'B',
      opcoes: [
        'raízes pneumatóforas ausentes em solos alagados',
        'tolerância ao encharcamento permanente do solo',
        'caducifolia acentuada na estação chuvosa',
        'súber espesso como adaptação exclusiva ao fogo'
      ],
      enunciado: 'Considerando a fitofisionomia descrita no texto, assinale a opção correta acerca das adaptações do buriti.',
      status: 'aprovado', comentarios: []
    },
    {
      id: 'it4', textoId: 'tx1', tipo: 'A', componente: 'Biologia', autor: 'Fernanda',
      habilidade: 'H6 — Inferências', grupo: 'Executar', versao: 'ambas',
      linhasRef: '5-7', gabarito: 'C', opcoes: [],
      enunciado: 'Com base nas linhas 5 a 7, julgue o item: as veredas funcionam como zonas de recarga hídrica, e sua supressão reduz a vazão de base dos rios que nascem no Cerrado.',
      status: 'area',
      comentarios: [
        c('Túlio', 'coord. de área (Ciências da Natureza)', 'ontem, 14h32',
          'Fernanda, o termo “compromete a vazão” pode gerar dupla interpretação com chuva regional. Sugiro fechar em “reduz a vazão de base dos rios”.'),
        c('Fernanda', 'docente', 'hoje, 8h15',
          'Boa! Ajustei o enunciado conforme sugerido. Pode reavaliar?')
      ]
    },
    {
      id: 'it5', textoId: 'tx1', tipo: 'B', componente: 'Matemática', autor: 'Carlos Eduardo',
      habilidade: 'H21 — Grandezas proporcionais', grupo: 'Executar', versao: 'ambas',
      linhasRef: '5-7', gabarito: '960', opcoes: [],
      enunciado: 'Se a vazão média de uma nascente é de 12 L/min, calcule, em litros, o volume acumulado em 1h20min.',
      status: 'aprovado', comentarios: []
    },
    {
      id: 'it6', textoId: 'tx2', tipo: 'A', componente: 'Física', autor: 'Marina',
      habilidade: 'H25 — Transformação de energia', grupo: 'Criticar', versao: 'regular',
      linhasRef: '1-4', gabarito: 'E', opcoes: [],
      enunciado: 'De acordo com o infográfico, a energia nuclear responde pela maior parcela da matriz elétrica brasileira.',
      status: 'rascunho', comentarios: []
    },
    {
      id: 'it7', textoId: 'tx2', tipo: 'B', componente: 'Matemática', autor: 'Carlos Eduardo',
      habilidade: 'H22 — Porcentagem', grupo: 'Planejar', versao: 'regular',
      linhasRef: '1-5', gabarito: '830', opcoes: [],
      enunciado: 'Considerando que as fontes renováveis somam 83% da geração, calcule, em décimos percentuais, essa participação (ex.: 83,0% → 830).',
      status: 'geral', comentarios: [
        c('Raul', 'coordenação geral', 'hoje, 9h02',
          'Aprovado na área. Verificar apenas se o comando “décimos percentuais” está claro para a 2ª série.')
      ]
    }
  ];

  s.estudantes = [
    { id: 'e1', nome: 'Antonia Silva',   matricula: '2026-0142', turma: '2ª B', versao: 'regular'  },
    { id: 'e2', nome: 'Bruno Carvalho',  matricula: '2026-0077', turma: '2ª A', versao: 'regular'  },
    { id: 'e3', nome: 'Clara Nogueira',  matricula: '2026-0119', turma: '2ª B', versao: 'regular'  },
    { id: 'e4', nome: 'Davi Sampaio',    matricula: '2026-0205', turma: '2ª C', versao: 'regular'  },
    { id: 'e5', nome: 'Elisa Fontes',    matricula: '2026-0231', turma: '2ª D', versao: 'adaptada' },
    { id: 'e6', nome: 'Felipe Arruda',   matricula: '2026-0058', turma: '2ª A', versao: 'regular'  }
  ];

  // Respostas por id de item; redação pela planilha oficial (NR = NC − 2·NE/TL).
  s.respostas = {
    e1: { marcacoes: { it1: 'C', it2: 'C', it3: 'B', it5: '960' }, redacao: { nc: 9.0, ne: 3, tl: 28 } },
    e2: { marcacoes: { it1: 'C', it2: 'E', it3: 'D', it5: '720' }, redacao: { nc: 7.5, ne: 6, tl: 30 } },
    e3: { marcacoes: { it1: 'E', it2: 'C', it3: 'B', it5: '960' }, redacao: { nc: 8.0, ne: 2, tl: 25 } }
  };

  return s;
}

// localStorage pode estar indisponível (iframe sandbox, modo privado) —
// nesse caso o app roda em memória e o backup JSON vira o único persistente.
function lerLS() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function gravarLS(v) {
  try { localStorage.setItem(KEY, v); } catch { /* sem persistência local */ }
}

export function load() {
  try {
    const s = JSON.parse(lerLS());
    if (s && s.versao === 1) return s;
  } catch { /* estado corrompido → recomeça do exemplo */ }
  const s = seed();
  save(s);
  return s;
}

export function save(s) {
  gravarLS(JSON.stringify(s));
}

export function substituir(novo) {
  save(novo);
  return novo;
}
