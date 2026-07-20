import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  PenLine,
  BookOpen,
  ScanLine,
  CheckCheck,
} from 'lucide-react'

const NAV = [
  { to: '/painel', icon: LayoutDashboard, label: 'Painel' },
  { to: '/textos', icon: FileText, label: 'Textos' },
  { to: '/itens', icon: PenLine, label: 'Itens' },
  { to: '/provas', icon: BookOpen, label: 'Provas' },
  { to: '/cartao', icon: ScanLine, label: 'Cartão-resposta' },
  { to: '/correcao', icon: CheckCheck, label: 'Correção' },
]

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src="/assets/logo-marista.png" alt="Colégio Marista Águas Claras" />
        <div>
          <div className="sidebar-brand-name">
            PAS <span>Marista</span>
          </div>
          <div className="sidebar-brand-sub">Águas Claras</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            <Icon size={18} strokeWidth={2.2} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-user">
        <div className="sidebar-avatar">RC</div>
        <div>
          <div className="sidebar-user-name">Raul</div>
          <div className="sidebar-user-role">Coordenação</div>
        </div>
      </div>
    </aside>
  )
}
