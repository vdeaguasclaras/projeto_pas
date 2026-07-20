import { ScreenHeader } from '../components/ScreenHeader'

function Bubble({ filled }: { filled?: boolean }) {
  return <span className={'bubble' + (filled ? ' filled' : '')} />
}

/** Linha C/E de um bloco tipo A: resp = 'C' | 'E' | null (em branco). */
function RowCE({ n, resp }: { n: number; resp: 'C' | 'E' | null }) {
  return (
    <div className="omr-row">
      <span className="idx">{n}</span>
      <Bubble filled={resp === 'C'} />C <Bubble filled={resp === 'E'} />E
    </div>
  )
}

/** Linha 0–9 do bloco tipo B com o dígito marcado. */
function RowDigits({ label, marked }: { label: string; marked: number }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', fontSize: 6.5, margin: '2px 0' }}>
      <span style={{ color: '#666', minWidth: 34 }}>{label}</span>
      {Array.from({ length: 10 }, (_, d) => (
        <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <Bubble filled={d === marked} />
          {d}
        </span>
      ))}
    </div>
  )
}

const bloco1: Array<'C' | 'E' | null> = ['C', 'E', 'C', null, 'C']
const bloco2: Array<'C' | 'E' | null> = ['C', 'E', 'C', 'E', null]

export function Cartao() {
  return (
    <div className="screen">
      <ScreenHeader
        eyebrow="Nominal · leitura óptica no scanner"
        title="Cartão-resposta"
        sub="Gerado por estudante a partir da lista de matrícula"
        actions={<button className="btn btn-blue">Gerar lote (398) ↓</button>}
      />

      <div className="mesa fade-up d15">
        <div className="sheet sheet-520">
          <div className="doc-header">
            <div className="doc-inst">
              COLÉGIO MARISTA ÁGUAS CLARAS
              <br />
              <span style={{ color: '#e5007e' }}>SIMULADO PAS 2026 · 1ª ETAPA</span>
            </div>
            <div style={{ fontSize: 8, color: '#333', lineHeight: 1.5 }}>
              Estudante: <b>ANTONIA SILVA</b>
              <br />
              Matrícula: <b style={{ fontFamily: 'var(--font-mono)' }}>2026-0142</b> · 2ª série B · Regular
            </div>
            <div className="doc-sala">
              <small>SALA</small>2101
            </div>
          </div>
          <div className="doc-faixa">Caderno de Respostas — uso exclusivo do estudante</div>
          <div style={{ padding: '14px 16px 18px' }}>
            <div
              style={{
                fontSize: 7.5,
                color: '#555',
                border: '1px solid #efc3da',
                borderRadius: 4,
                padding: 6,
                marginBottom: 8,
              }}
            >
              As marcações devem ser feitas com caneta esferográfica de tinta <b>preta</b>,
              preenchendo totalmente o círculo. Itens tipo A: marque C ou E. Tipo C: apenas uma
              opção. Tipo B: marque os três algarismos.
            </div>
            <b style={{ fontSize: 8.5, color: '#e5007e' }}>RESPOSTAS AOS ITENS DOS TIPOS A e C</b>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 10 }}>
              <div className="omr-box">
                <h5>ITENS 1–5</h5>
                {bloco1.map((r, i) => (
                  <RowCE key={i} n={i + 1} resp={r} />
                ))}
              </div>
              <div className="omr-box">
                <h5>ITENS 6–10</h5>
                {bloco2.map((r, i) => (
                  <RowCE key={i} n={i + 6} resp={r} />
                ))}
              </div>
              <div className="omr-box">
                <h5>ITEM 27 (TIPO C)</h5>
                {(['A', 'B', 'C', 'D'] as const).map(op => (
                  <div key={op} className="omr-row">
                    <span className="idx">{op}</span>
                    <Bubble filled={op === 'B'} />
                  </div>
                ))}
              </div>
              <div className="omr-box" style={{ borderStyle: 'dashed' }}>
                <h5>MARCADORES ÓPTICOS</h5>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 2px 0' }}>
                  <span className="anchor" />
                  <span className="anchor" />
                </div>
                <div style={{ fontSize: 6.5, color: '#777', marginTop: 6, textAlign: 'center' }}>
                  âncoras de alinhamento
                  <br />
                  para leitura no scanner
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 2px 0' }}>
                  <span className="anchor" />
                  <span className="anchor" />
                </div>
              </div>
            </div>
            <div className="omr-box" style={{ padding: 8, marginTop: 10 }}>
              <h5 style={{ textAlign: 'left', fontSize: 8, margin: '0 0 6px' }}>
                ITEM 28 — TIPO B (resposta de 000 a 999)
              </h5>
              <RowDigits label="Centena" marked={7} />
              <RowDigits label="Dezena" marked={2} />
              <RowDigits label="Unidade" marked={0} />
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 7.5,
                color: '#999',
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span>▮▯▮▮▯▮▮▯ 2026-0142</span>
              <span>página 1/2</span>
            </div>
          </div>
        </div>
      </div>

      <div className="doc-nota-rodape fade-up d3">
        Cartão nominal (nome, matrícula, série/turma e tipo de prova impressos). As âncoras pretas
        e o código de matrícula permitem identificar e corrigir cada folha automaticamente no
        scanner, mesmo em lote.
      </div>
    </div>
  )
}
