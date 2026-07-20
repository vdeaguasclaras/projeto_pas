import { ScreenHeader } from '../components/ScreenHeader'
import { CountUp } from '../components/CountUp'
import { boletim, correcao, turmas } from '../data/mock'

const GABARITO = ['C', 'E', 'C', 'E', 'C', 'C', 'E', 'C']
const MARCACOES: Array<string | null> = ['C', 'E', 'C', null, 'C', 'E', 'E', 'C']

export function Correcao() {
  const pct = Math.round((correcao.cartoesLidos / correcao.cartoesTotal) * 100)

  return (
    <div className="screen">
      <ScreenHeader
        eyebrow="Leitura óptica · boletins"
        title="Correção e boletins"
        sub="Simulado PAS 2026 · 1ª etapa · 2ª série EM"
        actions={<button className="btn btn-pink">📄 Boletins em PDF (lote)</button>}
      />

      <div className="grid-2col">
        {/* Coluna esquerda: KPIs, exportações, tabela */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div className="card card-hover fade-up d1">
              <div className="kpi-label">Cartões lidos</div>
              <div className="kpi-number">
                <CountUp value={correcao.cartoesLidos} />
                <small> / {correcao.cartoesTotal}</small>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="card card-hover fade-up d2">
              <div className="kpi-label">Conferência manual</div>
              <div className="kpi-number" style={{ color: 'var(--coral)' }}>
                <CountUp value={correcao.conferenciaManual} />
              </div>
              <div className="kpi-detail">dupla marcação ou leitura duvidosa</div>
            </div>
          </div>

          <div className="card fade-up d3" style={{ padding: '20px 22px' }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Exportações</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-sm btn-blue-flat">Relatório por turma</button>
              <button className="btn btn-sm btn-blue-flat">Relatório por série</button>
              <button className="btn btn-sm btn-ghost">Planilha de notas</button>
            </div>
          </div>

          <div className="card fade-up d4" style={{ padding: '6px 22px 14px' }}>
            <div style={{ fontSize: 13, fontWeight: 800, padding: '16px 0 8px' }}>
              Desempenho por turma — 2ª série
            </div>
            <table className="table-flat" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Turma</th>
                  <th>Média EB</th>
                  <th>Redação</th>
                  <th>Interpretar</th>
                  <th>Executar</th>
                </tr>
              </thead>
              <tbody>
                {turmas.map(t => (
                  <tr key={t.nome}>
                    <td>{t.nome}</td>
                    <td>{t.mediaEB}</td>
                    <td>{t.redacao}</td>
                    <td>{t.interpretar}</td>
                    <td>{t.executar}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Coluna direita: boletim individual fiel */}
        <div className="mesa fade-up d25" style={{ padding: 24, overflow: 'hidden', display: 'block' }}>
          <div className="sheet sheet-flat">
            <div style={{ background: 'linear-gradient(115deg,#0d2f8a,#1d5cff)', color: '#fff', padding: '12px 16px' }}>
              <h4 style={{ margin: 0, fontSize: 13 }}>Boletim de Desempenho Individual</h4>
              <p style={{ margin: '2px 0 0', fontSize: 10, opacity: 0.88 }}>
                Simulado PAS 2026 · 1ª Etapa · {boletim.estudante} · Matrícula {boletim.matricula} · {boletim.turma}
              </p>
            </div>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
              <h5 style={{ margin: '0 0 8px', fontSize: 10, color: '#e5007e', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                Proporção de acertos por grupo de habilidades
              </h5>
              {boletim.habilidades.map((h, i) => (
                <div key={h.grupo} className="hbar-row">
                  <span className="lbl">{h.grupo}</span>
                  <div className="hbar-track">
                    <div
                      className="hbar-fill"
                      style={{ width: `${h.valor * 100}%`, animationDelay: `${0.5 + i * 0.1}s` }}
                    />
                  </div>
                  <b>{h.valor.toFixed(2).replace('.', ',')}</b>
                </div>
              ))}
              <div style={{ fontSize: 7, color: '#777', marginTop: 5 }}>
                Barra azul: estudante · referência: média da turma
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, padding: '12px 16px' }}>
              {[
                { valor: boletim.escoreBruto, label: 'Escore bruto' },
                { valor: boletim.redacao, label: 'Redação' },
                { valor: boletim.posicao, label: `de ${boletim.de}` },
              ].map(box => (
                <div key={box.label} style={{ border: '1px solid #eee', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                  <b style={{ display: 'block', fontSize: 16, color: '#0d2f8a', fontVariantNumeric: 'tabular-nums' }}>
                    {box.valor}
                  </b>
                  <span style={{ fontSize: 8, color: '#777', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                    {box.label}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #eee' }}>
              <h5 style={{ margin: '0 0 6px', fontSize: 10, color: '#e5007e', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                Gabarito × suas marcações (trecho)
              </h5>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, lineHeight: 2, color: '#333' }}>
                <div>Item&nbsp;&nbsp;{GABARITO.map((_, i) => ` ${i + 1} `).join('')}</div>
                <div>Gab.&nbsp;&nbsp;{GABARITO.map(g => ` ${g} `).join('')}</div>
                <div>
                  Você&nbsp;&nbsp;
                  {MARCACOES.map((m, i) => {
                    if (m === null)
                      return (
                        <span key={i} style={{ color: '#999' }}>
                          {' — '}
                        </span>
                      )
                    const certo = m === GABARITO[i]
                    return (
                      <b key={i} style={{ color: certo ? '#12b76a' : '#e5484d' }}>
                        {` ${m} `}
                      </b>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
