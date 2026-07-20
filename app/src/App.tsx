import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { Painel } from './screens/Painel'
import { Textos } from './screens/Textos'
import { Itens } from './screens/Itens'
import { Provas } from './screens/Provas'
import { Cartao } from './screens/Cartao'
import { Correcao } from './screens/Correcao'

function Shell() {
  const location = useLocation()
  return (
    <div className="app-shell">
      <div className="blob blob-pink" />
      <div className="blob blob-blue" />
      <Sidebar />
      <main className="main">
        {/* key remonta a tela a cada navegação → re-dispara cascata fadeUp + contadores */}
        <Routes key={location.pathname}>
          <Route path="/painel" element={<Painel />} />
          <Route path="/textos" element={<Textos />} />
          <Route path="/itens" element={<Itens />} />
          <Route path="/provas" element={<Provas />} />
          <Route path="/cartao" element={<Cartao />} />
          <Route path="/correcao" element={<Correcao />} />
          <Route path="*" element={<Navigate to="/painel" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}
