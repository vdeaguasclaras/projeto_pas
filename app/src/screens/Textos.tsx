import { useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { linhasTexto3, slotsTexto3, slotsTexto5, type SlotItem } from '../data/mock'

const TIPO_COR: Record<string, string> = {
  A: '#1d5cff',
  B: '#8b5cf6',
  C: '#e5007e',
  D: '#e88b00',
}

const TINT_BG: Record<SlotItem['tint'], string> = {
  pink: '#ffe3f1',
  blue: '#e8efff',
  green: 'rgba(18,183,106,.12)',
  purple: 'rgba(139,92,246,.12)',
}

function Slot({ slot }: { slot: SlotItem }) {
  return (
    <span className="slot" style={{ background: TINT_BG[slot.tint] }}>
      <span className="slot-tipo" style={{ background: TIPO_COR[slot.tipo] }}>{slot.tipo}</span>
      {slot.disciplina} · {slot.autor}
    </span>
  )
}

function SlotsLivres({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <button key={i} className="slot-livre">＋ alocar item</button>
      ))}
    </>
  )
}

export function Textos() {
  const [exp3, setExp3] = useState(false)
  const [exp5, setExp5] = useState(false)

  return (
    <div className="screen">
      <ScreenHeader
        eyebrow="Alocação livre por texto"
        title="Textos-base"
        sub="Clique num espaço livre para alocar um item seu · Sua produção: 3 itens"
        actions={<button className="btn btn-green">+ Sugerir novo texto</button>}
      />

      {/* Texto 3 */}
      <div className="texto-card fade-up d15">
        <div className="texto-head texto-head--blue" onClick={() => setExp3(v => !v)}>
          <div className="texto-badge texto-badge--blue">3</div>
          <div style={{ flex: 1 }}>
            <div className="texto-title">“O Cerrado e as veredas” — Guimarães Rosa (adapt.)</div>
            <div className="texto-meta">8 itens · 6 alocados · 2 livres</div>
          </div>
          <span className="texto-rule">🔒 regra: sem itens tipo D neste texto</span>
          <span className="texto-toggle" style={{ color: 'var(--blue)' }}>
            {exp3 ? 'ocultar texto' : 'ver texto'}{' '}
            <span className={'chev' + (exp3 ? ' open' : '')}>▾</span>
          </span>
        </div>
        {exp3 && (
          <div className="texto-body">
            <div className="texto-fonte">Guimarães Rosa (adaptado) · aprovado em 03/08 · linhas 1–12</div>
            <div className="texto-linhas">
              {linhasTexto3.map(l => (
                <div key={l.n} className="linha">
                  <span className="linha-num">{l.n}</span>
                  <span>{l.txt}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="slots">
          {slotsTexto3.map((s, i) => (
            <Slot key={i} slot={s} />
          ))}
          <SlotsLivres n={2} />
        </div>
      </div>

      {/* Texto 5 — infográfico */}
      <div className="texto-card fade-up d25">
        <div className="texto-head texto-head--pink" onClick={() => setExp5(v => !v)}>
          <div className="texto-badge texto-badge--pink">5</div>
          <div style={{ flex: 1 }}>
            <div className="texto-title">Infográfico — matriz energética brasileira 2025</div>
            <div className="texto-meta">6 itens · 2 alocados · 4 livres</div>
          </div>
          <span className="texto-rule">sem restrições</span>
          <span className="texto-toggle" style={{ color: 'var(--pink)' }}>
            {exp5 ? 'ocultar texto' : 'ver texto'}{' '}
            <span className={'chev' + (exp5 ? ' open' : '')}>▾</span>
          </span>
        </div>
        {exp5 && (
          <div className="texto-body">
            <div className="texto-fonte">
              Fonte: EPE — Balanço Energético Nacional (adaptado), 2025 · material visual
            </div>
            <div className="infografico-ph">
              <span className="emoji">📊</span>
              <div className="titulo">Infográfico — matriz energética brasileira 2025</div>
              <div className="nota">
                Imagem em alta resolução anexada pelo coordenador.
                <br />
                No caderno, é reproduzida em meia página, acima dos itens 42–47.
              </div>
            </div>
          </div>
        )}
        <div className="slots">
          {slotsTexto5.map((s, i) => (
            <Slot key={i} slot={s} />
          ))}
          <SlotsLivres n={4} />
        </div>
      </div>

      {/* Sugestão aguardando aprovação */}
      <div className="sugestao-card fade-up d35">
        <div className="texto-badge texto-badge--amber">S</div>
        <div style={{ flex: 1 }}>
          <div className="texto-title">Sugestão — “Carta da Terra” (trecho)</div>
          <div className="texto-meta">enviada por João Pedro (História) · fonte: ONU, 2000</div>
        </div>
        <span className="chip-amber">● Aguardando aprovação</span>
      </div>
    </div>
  )
}
