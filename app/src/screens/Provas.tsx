import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'

const numLinha: React.CSSProperties = {
  color: '#e5007e',
  fontWeight: 700,
  fontSize: 8,
  minWidth: 12,
  textAlign: 'right',
  fontFamily: 'var(--font-mono)',
}
const itemNum: React.CSSProperties = { color: '#e5007e', fontWeight: 800, fontSize: 9 }
const itemRow: React.CSSProperties = { margin: '10px 0', breakInside: 'avoid' }

export function Provas() {
  const nav = useNavigate()

  return (
    <div className="screen">
      <ScreenHeader
        eyebrow="Diagramação fiel ao padrão PAS"
        title="Caderno de provas"
        sub="Prova Regular · 120 itens + redação · pré-visualização"
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => nav('/cartao')}>
              Ver cartão-resposta
            </button>
            <button className="btn btn-pink">Exportar PDF ↓</button>
          </>
        }
      />

      <div className="mesa fade-up d15">
        {/* Capa do caderno */}
        <div className="sheet sheet-430">
          <div className="doc-header">
            <div className="doc-inst">
              COLÉGIO MARISTA<br />ÁGUAS CLARAS
            </div>
            <div style={{ fontSize: 9, color: '#666', textAlign: 'center' }}>
              Aplicação: 12/9/2026<br />Duração: 4h30
            </div>
            <div className="doc-sala">
              <small>SALA</small>2101
            </div>
          </div>
          <div className="doc-faixa">Simulado PAS · Subprograma 2026 · 1ª Etapa · Caderno de Provas</div>
          <div style={{ textAlign: 'center', padding: '28px 24px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0d2f8a', letterSpacing: '.5px' }}>
              PROVA DE<br />CONHECIMENTOS
            </div>
            <div style={{ width: 56, height: 3, background: '#e5007e', margin: '12px auto' }} />
            <div style={{ fontSize: 10, color: '#333', lineHeight: 1.6 }}>
              Parte 1 — Língua Estrangeira (Inglês)
              <br />
              Parte 2 — Conhecimentos + Redação em Língua Portuguesa
            </div>
            <div
              style={{
                border: '1.5px solid #0d2f8a',
                margin: '18px 8px 0',
                padding: 10,
                textAlign: 'left',
                fontSize: 8.5,
                lineHeight: 1.6,
                color: '#222',
              }}
            >
              <b style={{ color: '#e5007e' }}>LEIA COM ATENÇÃO AS INSTRUÇÕES</b>
              <br />
              1&nbsp; Confira se este caderno contém 120 itens e uma prova de redação.
              <br />
              2&nbsp; Não folheie antes de autorizado pelo chefe de sala.
              <br />
              3&nbsp; A marcação do caderno de respostas é de sua responsabilidade.
              <br />
              4&nbsp; Ao terminar, entregue o caderno de respostas ao aplicador.
            </div>
            <div style={{ marginTop: 16, fontSize: 8, color: '#999', fontFamily: 'var(--font-mono)' }}>
              0518 9073 8 · MODELO
            </div>
          </div>
        </div>

        {/* Página interna — texto + itens em duas colunas */}
        <div className="sheet sheet-430 rot-r">
          <div className="doc-faixa">Texto 3 · itens de 24 a 31</div>
          <div style={{ padding: '14px 16px 18px' }}>
            <div
              style={{
                columnCount: 2,
                columnGap: 18,
                columnRule: '1px solid #efc3da',
                fontSize: 9,
                lineHeight: 1.55,
                textAlign: 'justify',
              }}
            >
              <div style={{ breakInside: 'avoid', marginBottom: 8 }}>
                <b style={{ fontSize: 9.5, color: '#0d2f8a' }}>Texto 3 — O Cerrado e as veredas</b>
                <div style={{ display: 'flex', gap: 7, margin: '6px 0 8px', breakInside: 'avoid' }}>
                  <span style={numLinha}>1</span>
                  <span>
                    O buriti é a palmeira dos brejos, das veredas, onde a água aflora e o chão se
                    faz úmido o ano inteiro.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 7, marginBottom: 8, breakInside: 'avoid' }}>
                  <span style={numLinha}>4</span>
                  <span>
                    Ali, entre capões e chapadões, o sertão guarda suas nascentes como quem guarda
                    segredo antigo.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 7, marginBottom: 8, breakInside: 'avoid' }}>
                  <span style={numLinha}>7</span>
                  <span>
                    As veredas alimentam os rios que descem para todas as bacias do país, e por
                    isso o Cerrado é chamado de caixa-d’água do Brasil.
                  </span>
                </div>
                <div style={{ fontSize: 7, color: '#777', marginTop: 4 }}>Guimarães Rosa (adaptado).</div>
              </div>
              <div style={{ breakInside: 'avoid', fontSize: 8.5, margin: '6px 0 4px' }}>
                <b>Com base no texto 3, julgue os itens de 24 a 26.</b>
              </div>
              <div style={itemRow}>
                <span style={itemNum}>24</span> &nbsp;No fragmento, a personificação do sertão
                (linhas 4–6) reforça o tom lírico característico da prosa de Guimarães Rosa.
              </div>
              <div style={itemRow}>
                <span style={itemNum}>25</span> &nbsp;A expressão “caixa-d’água do Brasil”
                refere-se ao papel do Cerrado na recarga dos aquíferos e das bacias hidrográficas
                do país.
              </div>
              <div style={itemRow}>
                <span style={itemNum}>26</span> &nbsp;As veredas descritas funcionam como zonas de
                recarga hídrica, e sua supressão compromete a vazão de base dos rios.
              </div>
              <div style={itemRow}>
                <span style={itemNum}>27</span> &nbsp;Considerando a fitofisionomia descrita no
                texto, assinale a opção correta acerca das adaptações do buriti.
                <ul style={{ margin: '4px 0 0 2px', padding: 0, listStyle: 'none' }}>
                  <li style={{ margin: '2px 0' }}><b style={{ color: '#0d2f8a' }}>A</b> raízes pneumatóforas ausentes em solos alagados</li>
                  <li style={{ margin: '2px 0' }}><b style={{ color: '#0d2f8a' }}>B</b> tolerância ao encharcamento permanente do solo</li>
                  <li style={{ margin: '2px 0' }}><b style={{ color: '#0d2f8a' }}>C</b> caducifolia acentuada na estação chuvosa</li>
                  <li style={{ margin: '2px 0' }}><b style={{ color: '#0d2f8a' }}>D</b> súber espesso como adaptação exclusiva ao fogo</li>
                </ul>
              </div>
              <div style={itemRow}>
                <span style={itemNum}>28</span> &nbsp;Se a vazão média de uma nascente é de 12
                L/min, calcule, em litros, o volume acumulado em 1h20min.{' '}
                <span style={{ color: '#555' }}>Marque o resultado no caderno de respostas (000 a 999).</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="doc-nota-rodape fade-up d3">
        Miniatura ilustrativa — a diagramação final é calibrada página a página contra os PDFs
        reais do PAS (tipografia, comandos, numeração contínua, duas colunas, faixas e capa). A
        versão adaptada gera caderno próprio com a mesma identidade.
      </div>
    </div>
  )
}
