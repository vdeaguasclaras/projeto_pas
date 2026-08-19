// Camada de dados local — persistência em localStorage do navegador.
// Na fase 2, o modo nuvem (js/nuvem.js + Supabase) passa a ser a fonte de
// verdade quando configurado em js/config-supabase.js; o localStorage vira
// cache/fallback. Ver docs/plano-implantacao.md.

const KEY = 'pas-marista-mvp-v1';

// Versão do formato do estado. v1 tinha uma prova só (`config`); v2 tem a
// lista `provas`, e textos, itens e respostas passam a saber a que prova
// pertencem; v3 traz `alocacoes` (meta por docente) e o autor do item por
// e-mail. `load()` converte o cache antigo em vez de descartá-lo.
const VERSAO_ESTADO = 3;

// As séries que a escola aplica. É por elas que estudante e prova se
// encontram: o estudante pertence a uma série, a prova é de uma série.
const SERIES = ['9º ano', '1ª série EM', '2ª série EM', '3ª série EM'];

// Componentes curriculares em ordem alfabética (única língua estrangeira: Inglês).
// Artes é lançada pelas quatro linguagens da BNCC — quem dá aula de Música e
// quem dá aula de Artes Visuais são pessoas diferentes, e a coordenação precisa
// ver a entrega de cada uma separada.
//
// Redação é componente como os outros: quem a leciona recebe meta, escreve item
// e aparece na entrega por componente. Ela faltava aqui, e por isso não havia
// como atribuí-la a ninguém no cadastro da equipe — o papel `redacao` responde
// por outra coisa (quem corrige a redação da prova), não pela aula.
const COMPONENTES = {
  'Artes Visuais': 'd-artv', 'Biologia': 'd-bio', 'Dança': 'd-dan',
  'Filosofia': 'd-fil', 'Física': 'd-fis', 'Geografia': 'd-geo',
  'História': 'd-his', 'Inglês': 'd-ing', 'Literatura': 'd-lit',
  'Matemática': 'd-mat', 'Música': 'd-mus', 'Português': 'd-lp',
  'Química': 'd-qui', 'Redação': 'd-red', 'Sociologia': 'd-soc', 'Teatro': 'd-tea'
};

// “Artes” genérica não é mais oferecida, mas continua válida: há gente
// cadastrada nela. Some do seletor de componente e aparece marcada para
// reclassificar, em vez de virar valor inválido no cadastro de alguém.
const COMPONENTES_LEGADOS = { 'Artes': 'd-art' };
const TODOS_COMPONENTES = { ...COMPONENTES, ...COMPONENTES_LEGADOS };
const ehComponenteLegado = c => Object.hasOwn(COMPONENTES_LEGADOS, c);

// Para onde “Artes” se desdobrou — o texto que a tela usa para explicar.
const SUCESSORAS_DE_ARTES = ['Artes Visuais', 'Dança', 'Música', 'Teatro'];

const GRUPOS = ['Interpretar', 'Planejar', 'Executar', 'Criticar'];

// Tipos de item no formato PAS. Pontuação do MVP (calibrável na fase 3):
// A: certo +1 / errado −1 · B: certo +1 · C: certo +1 / errado −1 ·
// D (discursivo): nota lançada de 0 a 10, vale nota/10 no escore bruto.
const TIPOS = {
  A: { rotulo: 'A — Certo/Errado', respostas: ['C', 'E'] },
  B: { rotulo: 'B — Numérico (000 a 999)', respostas: null },
  C: { rotulo: 'C — Múltipla escolha', respostas: ['A', 'B', 'C', 'D'] },
  D: { rotulo: 'D — Discursivo (resposta construída)', respostas: null }
};

const STATUS_ITEM = {
  rascunho:  { rot: 'Rascunho',                          cls: 'info'  },
  area:      { rot: 'Em revisão — coord. de área',       cls: 'pend'  },
  geral:     { rot: 'Em revisão — coordenação geral',    cls: 'pend'  },
  devolvido: { rot: 'Devolvido com ajustes',             cls: 'falta' },
  aprovado:  { rot: 'Aprovado',                          cls: 'ok'    }
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

// Identificadores estáveis e legíveis — os mesmos gravados na migração 0007,
// para que o modo local e o banco falem da mesma prova.
const ID_DA_SERIE = {
  '9º ano': 'pr-9ano', '1ª série EM': 'pr-1em',
  '2ª série EM': 'pr-2em', '3ª série EM': 'pr-3em'
};

// Quantidade de questões, por série e por versão da prova. Os números da versão
// regular vieram da coordenação; os da adaptada são diferentes e ainda não
// foram definidos — ficam nulos, e a interface mostra "a definir" em vez de
// inventar denominador.
//
// São dois números, não um: a prova adaptada (de inclusão) não tem o tamanho da
// regular, e comparar a entrega de uma com a meta da outra daria conta errada.
const QUESTOES_DA_SERIE = {
  '9º ano':       { regular: 90,  adaptada: null },
  '1ª série EM':  { regular: 100, adaptada: null },
  '2ª série EM':  { regular: 110, adaptada: null },
  '3ª série EM':  { regular: 120, adaptada: null }
};

function provaNova(serie, ordem) {
  return {
    id: ID_DA_SERIE[serie] || uid(),
    ordem,
    serie,
    nome: 'Simulado PAS 2026',
    etapa: '1ª Etapa',
    dataAplicacao: '',
    duracao: '4h30',
    totalQuestoes: { ...(QUESTOES_DA_SERIE[serie] || { regular: null, adaptada: null }) },
    temRedacao: true,
    imprimirRedacao: true,
    // Arranjo da capa: 'vertical' (arte na faixa esquerda, como no caderno do
    // PAS) ou 'horizontal' (arte na metade de cima da folha). Mora no `dados`
    // jsonb da prova, então não pede mudança de esquema; a prova antiga, que
    // não tem o campo, cai no vertical em `arranjoCapa()` (js/app.js).
    capaArranjo: 'vertical'
  };
}

const provasPadrao = () => SERIES.map((s, i) => provaNova(s, i));

function blank() {
  return {
    versao: VERSAO_ESTADO,
    provas: provasPadrao(),
    provaAtiva: ID_DA_SERIE['1ª série EM'],
    perfil: { papel: 'coordenacao', nome: 'Coordenação', componente: null },
    textos: [],
    itens: [],
    estudantes: [],
    // provaId → [estId]: quem faz cada prova. Materializado, e não derivado da
    // série, para que a turma que fez a etapa continue no histórico depois de
    // todo mundo passar de ano.
    elencos: {},
    // provaId → estId → respostas. Sem a prova na chave, a 2ª etapa
    // sobrescreveria a 1ª do mesmo estudante.
    respostas: {},
    // provaId → e-mail do docente → meta. Quanto cada um deve entregar em cada
    // prova. Chaveado por e-mail, não por nome: nome é rótulo, e-mail é
    // identidade — é por ele que meta e produção se cruzam.
    alocacoes: {}
  };
}

// Exemplo de demonstração. O conteúdo todo vive na prova da 1ª série; as
// outras três nascem vazias, como ficam de verdade até a coordenação começar.
const PROVA_EXEMPLO = ID_DA_SERIE['1ª série EM'];
const SERIE_EXEMPLO = '1ª série EM';

function seed() {
  const s = blank();
  s.provaAtiva = PROVA_EXEMPLO;
  Object.assign(s.provas.find(p => p.id === PROVA_EXEMPLO), {
    nome: 'Simulado PAS 2026', etapa: '1ª Etapa',
    dataAplicacao: '2026-09-12', duracao: '4h30',
    // A proposta de redação é da prova, como a capa e as instruções: tema,
    // comando, tipo de texto esperado e os textos motivadores. Fica no próprio
    // registro da prova, que é uma linha {id, dados jsonb} em `public.provas` —
    // não há esquema novo a criar. Prova com `temRedacao: false` simplesmente
    // não tem este campo, e nada de redação aparece em lugar nenhum.
    redacao: {
      tema: 'A água do Cerrado como patrimônio de todos',
      tipoTexto: 'texto argumentativo em prosa',
      comando: 'A partir dos textos motivadores e das leituras feitas ao longo da etapa, ' +
        'redija um texto argumentativo em prosa defendendo uma posição sobre a proteção das ' +
        'nascentes do Cerrado. Apresente pelo menos dois argumentos e uma proposta de ação ' +
        'que envolva a comunidade escolar.',
      motivadores: [
        {
          titulo: 'Trecho de reportagem',
          texto: 'Das doze grandes bacias hidrográficas brasileiras, oito nascem no Cerrado. ' +
            'A vegetação de raízes profundas funciona como uma esponja: infiltra a água da ' +
            'chuva e a devolve devagar às nascentes.\n\n' +
            'Onde a vereda é drenada para plantio, a devolução para de acontecer. O rio não ' +
            'seca de uma vez — ele perde a vazão de base, aquela que o sustenta na estiagem.',
          fonte: 'Agência Brasil, 2025 (adaptado)'
        },
        {
          titulo: 'Do texto de Guimarães Rosa lido nesta prova',
          texto: 'Mas a caixa-d’água racha: onde a vereda seca, o buriti tomba, e com ele ' +
            'vai-se a memória da água.',
          fonte: 'Guimarães Rosa (adaptado)'
        }
      ]
    }
  });
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
    },
    {
      id: 'it8', textoId: 'tx2', tipo: 'D', componente: 'História', autor: 'João Pedro',
      habilidade: 'H10 — Argumentação', grupo: 'Criticar', versao: 'regular',
      linhasRef: '5-6', opcoes: [], dLinhas: 8, dPauta: true,
      gabarito: 'Espera-se que o estudante reconheça a alta participação renovável como argumento favorável e aponte uma limitação (sazonalidade hídrica, intermitência eólica/solar ou impactos socioambientais de hidrelétricas).',
      enunciado: 'Com base no infográfico, avalie em que medida a matriz elétrica brasileira pode ser considerada “limpa”, apresentando um argumento favorável e uma limitação.',
      status: 'aprovado', comentarios: []
    }
  ];

  s.estudantes = [
    { id: 'e1', nome: 'Antonia Silva',   matricula: '225100142', turma: '1ª B', versao: 'regular'  },
    { id: 'e2', nome: 'Bruno Carvalho',  matricula: '225100077', turma: '1ª A', versao: 'regular'  },
    { id: 'e3', nome: 'Clara Nogueira',  matricula: '225100119', turma: '1ª B', versao: 'regular'  },
    { id: 'e4', nome: 'Davi Sampaio',    matricula: '225100205', turma: '1ª C', versao: 'regular'  },
    { id: 'e5', nome: 'Elisa Fontes',    matricula: '225100231', turma: '1ª D', versao: 'adaptada' },
    { id: 'e6', nome: 'Felipe Arruda',   matricula: '225100058', turma: '1ª A', versao: 'regular'  }
  ].map(e => ({ ...e, serie: SERIE_EXEMPLO }));

  s.elencos = { [PROVA_EXEMPLO]: s.estudantes.map(e => e.id) };

  // Respostas por id de item; discursivas (tipo D) por nota 0–10;
  // redação pela planilha oficial (NR = NC − 2·NE/TL).
  s.respostas = {
    [PROVA_EXEMPLO]: {
      e1: { marcacoes: { it1: 'C', it2: 'C', it3: 'B', it5: '960' }, discursivas: { it8: 8.5 }, redacao: { nc: 9.0, ne: 3, tl: 28 } },
      e2: { marcacoes: { it1: 'C', it2: 'E', it3: 'D', it5: '720' }, discursivas: {}, redacao: { nc: 7.5, ne: 6, tl: 30 } },
      e3: { marcacoes: { it1: 'E', it2: 'C', it3: 'B', it5: '960' }, discursivas: { it8: 6.0 }, redacao: { nc: 8.0, ne: 2, tl: 25 } }
    }
  };

  for (const t of s.textos) t.provaId = PROVA_EXEMPLO;
  for (const i of s.itens)  i.provaId = PROVA_EXEMPLO;

  return s;
}

// Converte um estado v1 (prova única) no formato atual. Parte de `blank()`, que
// já é a forma corrente, então acompanha as versões seguintes sem retoque.
// Serve tanto para o cache do navegador quanto para um backup JSON antigo.
function migrarDeV1(velho) {
  const s = blank();
  const c = velho.config || {};
  const serie = SERIES.includes(c.serie) ? c.serie : '1ª série EM';
  const alvo = ID_DA_SERIE[serie];

  Object.assign(s.provas.find(p => p.id === alvo), {
    nome: c.nome || 'Simulado PAS 2026',
    etapa: c.etapa || '1ª Etapa',
    dataAplicacao: c.dataAplicacao || '',
    duracao: c.duracao || '4h30',
    imprimirRedacao: c.imprimirRedacao !== false,
    ...(c.instrucoes ? { instrucoes: c.instrucoes } : {}),
    ...(c.capaImagem ? { capaImagem: c.capaImagem } : {})
  });

  s.provaAtiva  = alvo;
  s.perfil      = velho.perfil || s.perfil;
  s.textos      = (velho.textos || []).map(t => ({ ...t, provaId: alvo }));
  s.itens       = (velho.itens || []).map(i => ({ ...i, provaId: alvo }));
  s.estudantes  = (velho.estudantes || []).map(e => ({ ...e, serie: e.serie || serie }));
  s.elencos     = { [alvo]: s.estudantes.map(e => e.id) };
  s.respostas   = { [alvo]: velho.respostas || {} };
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

// v2 → v3: só acrescenta `alocacoes`. Nada do que já existia muda de forma, e
// o item sem `autorEmail` continua válido — a chave do autor cai no nome.
function migrarV2paraV3(velho) {
  return { ...velho, versao: 3, alocacoes: velho.alocacoes || {} };
}

function load() {
  try {
    const s = JSON.parse(lerLS());
    if (s && s.versao === VERSAO_ESTADO) return s;
    if (s && (s.versao === 1 || s.versao === 2)) {
      const novo = migrarV2paraV3(s.versao === 1 ? migrarDeV1(s) : s);
      save(novo);
      return novo;
    }
  } catch { /* estado corrompido → recomeça do exemplo */ }
  const s = seed();
  save(s);
  return s;
}

function save(s) {
  gravarLS(JSON.stringify(s));
}

function substituir(novo) {
  save(novo);
  return novo;
}

export {
  KEY, VERSAO_ESTADO, COMPONENTES, COMPONENTES_LEGADOS, TODOS_COMPONENTES,
  ehComponenteLegado, SUCESSORAS_DE_ARTES,
  GRUPOS, TIPOS, STATUS_ITEM, SERIES, ID_DA_SERIE,
  uid, blank, seed, load, save, substituir, provaNova, migrarDeV1, migrarV2paraV3
};
