import { useState } from 'react'
import { linhasTexto3 } from '../data/mock'

function Segmented({ options, value, onChange }: {
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="segmented">
      {options.map(o => (
        <span
          key={o}
          className={o === value ? 'active' : ''}
          onClick={() => onChange(o)}
        >
          {o}
        </span>
      ))}
    </div>
  )
}

export function Itens() {
  const [tipo, setTipo] = useState('A')
  const [versao, setVersao] = useState('Regular')
  const [gabarito, setGabarito] = useState<'C' | 'E'>('C')

  return (
    <div className="screen">
      <div className="fade-up">
        <div className="eyebrow">Editor de item · fluxo de revisão</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="screen-title">Item · Texto 3</div>
          <span className="chip-amber">● Em revisão — coord. de área</span>
        </div>
      </div>

      <div className="grid-2col">
        {/* Painel do texto com linhas destacadas */}
        <div className="painel-texto fade-up d15">
          <div className="painel-texto-titulo">Texto 3 — “O Cerrado e as veredas”</div>
          <div className="painel-texto-fonte">
            Guimarães Rosa (adaptado) · aprovado em 03/08 · linhas 1–12
          </div>
          <div className="texto-linhas" style={{ maxWidth: 'none' }}>
            {linhasTexto3.map(l => (
              <div key={l.n} className={'linha' + (l.destaque ? ' mark' : '')}>
                <span className="linha-num">{l.n}</span>
                <span>{l.txt}</span>
              </div>
            ))}
          </div>
          <div className="painel-texto-nota">
            💡 As linhas destacadas são a referência selecionada para este item (5–7).
          </div>
        </div>

        {/* Formulário + conversa */}
        <div className="fade-up d25" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <div>
                <div className="field-label">Tipo</div>
                <Segmented options={['A', 'B', 'C', 'D']} value={tipo} onChange={setTipo} />
              </div>
              <div>
                <div className="field-label">Versão</div>
                <Segmented options={['Regular', 'Adaptada', 'Ambas']} value={versao} onChange={setVersao} />
              </div>
            </div>
            <div>
              <div className="field-label">Habilidade</div>
              <div className="field-box">H6 — Inferências · grupo Executar</div>
            </div>
            <div>
              <div className="field-label">Enunciado</div>
              <div className="field-box field-box--multiline">
                Com base nas linhas 5 a 7, julgue o item: as veredas funcionam como zonas de
                recarga hídrica, e sua supressão reduz a vazão de base dos rios que nascem no
                Cerrado.
              </div>
            </div>
            <div>
              <div className="field-label">Gabarito</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['C', 'E'] as const).map(g => (
                  <button
                    key={g}
                    className={'gabarito-opt' + (gabarito === g ? ' selected' : '')}
                    onClick={() => setGabarito(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="field-label" style={{ fontSize: 11.5, letterSpacing: '.07em', marginBottom: 14 }}>
              Conversa da revisão
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="chat-msg">
                <div className="chat-avatar" style={{ background: 'var(--coral)' }}>TU</div>
                <div className="chat-bubble chat-bubble--revisor">
                  <b>Túlio · coord. de área</b>
                  <span className="ts">ontem, 14h32</span>
                  <p>
                    O termo “compromete a vazão” pode gerar dupla interpretação. Sugiro fechar em
                    “reduz a vazão de base dos rios”.
                  </p>
                </div>
              </div>
              <div className="chat-msg">
                <div className="chat-avatar" style={{ background: 'var(--green)' }}>FE</div>
                <div className="chat-bubble chat-bubble--docente">
                  <b>Fernanda · docente</b>
                  <span className="ts">hoje, 8h15</span>
                  <p>Boa! Ajustei o enunciado conforme sugerido. Pode reavaliar?</p>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-sm btn-ghost">Responder</button>
              <button className="btn btn-sm btn-green" style={{ boxShadow: 'none' }}>Aprovar item</button>
              <button className="btn btn-sm btn-pink" style={{ boxShadow: 'none' }}>Devolver com ajustes</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
