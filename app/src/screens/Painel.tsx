import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { CountUp } from '../components/CountUp'
import { etapa, kpis, versoes, entregas } from '../data/mock'

const STATUS = {
  completo: { label: 'Completo', cor: '#12b76a' },
  'em-revisao': { label: 'Em revisão', cor: '#e88b00' },
  atrasado: { label: 'Atrasado', cor: '#e5484d' },
} as const

export function Painel() {
  const nav = useNavigate()
  const pct = Math.round((kpis.itensAprovados / kpis.itensTotal) * 100)

  return (
    <div className="screen screen--painel">
      <ScreenHeader
        large
        eyebrow={etapa.nome}
        title={<>Bom dia, Raul 👋</>}
        sub={`Aplicação em ${etapa.dataAplicacao} · ${etapa.serie} · ${etapa.totalEstudantes} estudantes · faltam ${etapa.diasRestantes} dias`}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => nav('/itens')}>
              Revisar itens
            </button>
            <button className="btn btn-pink" onClick={() => nav('/provas')}>
              Gerar cadernos
            </button>
          </>
        }
      />

      <div className="kpi-grid">
        <div className="card card-hover fade-up d1">
          <div className="kpi-label">Itens aprovados</div>
          <div className="kpi-number">
            <CountUp value={kpis.itensAprovados} />
            <small> / {kpis.itensTotal}</small>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="card card-hover fade-up d2">
          <div className="kpi-label">Em revisão</div>
          <div className="kpi-number" style={{ color: 'var(--pink)' }}>
            <CountUp value={kpis.emRevisao} />
          </div>
          <div className="kpi-detail">{kpis.emRevisaoDetalhe}</div>
        </div>
        <div className="card card-hover fade-up d3">
          <div className="kpi-label">Textos-base ativos</div>
          <div className="kpi-number">
            <CountUp value={kpis.textosAtivos} />
          </div>
          <div className="kpi-detail">{kpis.textosDetalhe}</div>
        </div>
      </div>

      <div className="fade-up d4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div
          className="card card-hover"
          style={{
            background: 'linear-gradient(130deg,#1d5cff,#0d2f8a)',
            color: '#fff',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(110deg,transparent 30%,rgba(255,255,255,.14) 50%,transparent 70%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 4s linear infinite',
            }}
          />
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            📘 Prova regular
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
            {versoes.regular.itens} itens + redação
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
            {versoes.regular.estudantes} estudantes · x&#772; = {versoes.regular.media}
          </div>
        </div>
        <div
          className="card card-hover"
          style={{ border: '1.5px dashed var(--border3)', boxShadow: 'none' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--green)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border3)')}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
            📗 Prova adaptada · inclusão
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: 'var(--navy)' }}>
            {versoes.adaptada.itens} itens + redação
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 4 }}>
            {versoes.adaptada.estudantes} estudantes · x&#772; = {versoes.adaptada.media}
          </div>
        </div>
      </div>

      <div className="card fade-up d5" style={{ padding: '6px 22px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0 6px' }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Entregas por componente curricular</div>
          <a href="#" style={{ fontSize: 12.5, fontWeight: 700 }}>
            ver todos →
          </a>
        </div>
        <table className="table">
          <tbody>
            {entregas.map(e => {
              const s = STATUS[e.status]
              return (
                <tr key={e.componente}>
                  <td style={{ width: 150 }}>
                    <span className="chip-pill" style={{ background: e.cor, color: e.corTexto ?? '#fff' }}>
                      {e.componente}
                    </span>
                  </td>
                  <td style={{ color: 'var(--ink2)' }}>{e.docente}</td>
                  <td className="num">
                    {e.entregues}/{e.total}
                  </td>
                  <td style={{ textAlign: 'right', width: 130 }}>
                    <span className="status-dot" style={{ color: s.cor }}>
                      ● {s.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
