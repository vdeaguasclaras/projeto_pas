// Dados mock da etapa 1 — mesma modelagem que o client da API usará na etapa 2
// (fase online). Os valores espelham o protótipo v2 e o design hifi.

export interface Etapa {
  nome: string
  dataAplicacao: string
  serie: string
  totalEstudantes: number
  diasRestantes: number
}

export interface EntregaComponente {
  componente: string
  cor: string
  corTexto?: string
  docente: string
  entregues: number
  total: number
  status: 'completo' | 'em-revisao' | 'atrasado'
}

export type TipoItem = 'A' | 'B' | 'C' | 'D'

export interface SlotItem {
  tipo: TipoItem
  disciplina: string
  autor: string
  /** tonalidade do fundo: área do texto ou autoria própria */
  tint: 'pink' | 'blue' | 'green' | 'purple'
}

export interface LinhaTexto {
  n: number
  txt: string
  destaque?: boolean
}

export interface TurmaDesempenho {
  nome: string
  mediaEB: string
  redacao: string
  interpretar: string
  executar: string
}

export const etapa: Etapa = {
  nome: 'Simulado PAS 2026 · 1ª etapa',
  dataAplicacao: '12/09',
  serie: '2ª série EM',
  totalEstudantes: 398,
  diasRestantes: 54,
}

export const kpis = {
  itensAprovados: 96,
  itensTotal: 120,
  emRevisao: 14,
  emRevisaoDetalhe: '8 na coord. de área · 6 na geral',
  textosAtivos: 9,
  textosDetalhe: '+2 sugestões aguardando',
}

export const versoes = {
  regular: { itens: 120, estudantes: 371, media: '0,433' },
  adaptada: { itens: 72, estudantes: 27, media: '0,731' },
}

export const entregas: EntregaComponente[] = [
  { componente: 'Português', cor: '#e5007e', docente: 'Ana Beatriz', entregues: 16, total: 16, status: 'completo' },
  { componente: 'Matemática', cor: '#1d5cff', docente: 'Carlos Eduardo', entregues: 11, total: 14, status: 'em-revisao' },
  { componente: 'Biologia', cor: '#12b76a', docente: 'Fernanda', entregues: 10, total: 10, status: 'completo' },
  { componente: 'História', cor: '#ff6b4a', docente: 'João Pedro', entregues: 4, total: 9, status: 'em-revisao' },
  { componente: 'Física', cor: '#8b5cf6', docente: 'Marina', entregues: 0, total: 2, status: 'atrasado' },
  { componente: 'Inglês', cor: '#ffc224', corTexto: '#5c4300', docente: 'Paulo', entregues: 12, total: 12, status: 'completo' },
]

export const linhasTexto3: LinhaTexto[] = [
  { n: 1, txt: 'O buriti é a palmeira dos brejos, das veredas, onde a água' },
  { n: 2, txt: 'aflora e o chão se faz úmido o ano inteiro. Ali, entre capões' },
  { n: 3, txt: 'e chapadões, o sertão guarda suas nascentes como quem' },
  { n: 4, txt: 'guarda segredo antigo.' },
  { n: 5, txt: 'As veredas alimentam os rios que descem para todas as', destaque: true },
  { n: 6, txt: 'bacias do país, e por isso o Cerrado é chamado de', destaque: true },
  { n: 7, txt: 'caixa-d’água do Brasil.', destaque: true },
  { n: 8, txt: 'Mas a caixa-d’água racha: onde a vereda seca, o buriti' },
  { n: 9, txt: 'tomba, e com ele vai-se a memória da água.' },
]

export const slotsTexto3: SlotItem[] = [
  { tipo: 'A', disciplina: 'Literatura', autor: 'Ana', tint: 'pink' },
  { tipo: 'A', disciplina: 'Literatura', autor: 'Ana', tint: 'pink' },
  { tipo: 'A', disciplina: 'Geografia', autor: 'Túlio', tint: 'blue' },
  { tipo: 'C', disciplina: 'Geografia', autor: 'Túlio', tint: 'blue' },
  { tipo: 'C', disciplina: 'Biologia', autor: 'você', tint: 'green' },
  { tipo: 'B', disciplina: 'Matemática', autor: 'Carlos', tint: 'blue' },
]

export const slotsTexto5: SlotItem[] = [
  { tipo: 'B', disciplina: 'Matemática', autor: 'Carlos', tint: 'blue' },
  { tipo: 'A', disciplina: 'Física', autor: 'Marina', tint: 'purple' },
]

export const turmas: TurmaDesempenho[] = [
  { nome: '2ª A', mediaEB: '54,10', redacao: '7,8', interpretar: '0,66', executar: '0,58' },
  { nome: '2ª B', mediaEB: '57,92', redacao: '8,1', interpretar: '0,71', executar: '0,62' },
  { nome: '2ª C', mediaEB: '51,37', redacao: '7,2', interpretar: '0,60', executar: '0,55' },
  { nome: '2ª D (adaptada)', mediaEB: '49,80', redacao: '7,5', interpretar: '0,63', executar: '0,57' },
]

export const boletim = {
  estudante: 'ANTONIA SILVA',
  matricula: '2026-0142',
  turma: '2ª B',
  habilidades: [
    { grupo: 'Interpretar', valor: 0.72 },
    { grupo: 'Planejar', valor: 0.55 },
    { grupo: 'Executar', valor: 0.64 },
    { grupo: 'Criticar', valor: 0.47 },
  ],
  escoreBruto: '59,83',
  redacao: '8,40',
  posicao: '42º',
  de: 398,
}

export const correcao = {
  cartoesLidos: 392,
  cartoesTotal: 398,
  conferenciaManual: 6,
}
