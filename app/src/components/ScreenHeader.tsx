import type { ReactNode } from 'react'

interface Props {
  eyebrow: string
  title: ReactNode
  sub?: ReactNode
  actions?: ReactNode
  large?: boolean
}

export function ScreenHeader({ eyebrow, title, sub, actions, large }: Props) {
  return (
    <div className="screen-header fade-up">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <div className={'screen-title' + (large ? ' screen-title--lg' : '')}>{title}</div>
        {sub && <div className="screen-sub">{sub}</div>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </div>
  )
}
