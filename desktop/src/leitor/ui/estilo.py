"""A folha de estilo da janela, montada com as cores do sistema on-line.

As cores vêm de `tema.py`, que é GERADO a partir do `css/estilo.css` — nenhum
código de cor da identidade está escrito aqui. O desenho (cantos, espaçamentos, pesos) é o do
sistema, transposto para a linguagem de folha de estilo do Qt, que é um
subconjunto do CSS: não há variáveis, nem flexbox, nem `color-mix`.

Onde o Qt não alcança o CSS, prefere-se o que o sistema faz a o que o Qt faz por
padrão — a janela tem de parecer da mesma casa que o site.
"""
from __future__ import annotations

from .tema import CLARO


def _mistura(cor: str, fundo: str, quanto: float) -> str:
    """`color-mix` do CSS, feito à mão: o Qt não tem."""
    def partes(c: str) -> tuple[int, int, int]:
        c = c.lstrip("#")
        return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
    a, b = partes(cor), partes(fundo)
    return "#" + "".join(f"{round(x * quanto + y * (1 - quanto)):02x}" for x, y in zip(a, b))


def folha(t: dict[str, str] = CLARO) -> str:
    """A folha de estilo inteira da janela."""
    return f"""
    QWidget {{
      background: {t['fundo']};
      color: {t['ink']};
      font-family: "Segoe UI", "Aptos", system-ui, Arial, sans-serif;
      font-size: 14px;
    }}
    QLabel {{ background: transparent; }}
    QLabel#titulo {{ font-size: 19px; font-weight: 800; }}
    QLabel#sub {{ color: {t['ink-2']}; font-size: 13px; }}
    QLabel#secao {{ font-size: 11px; font-weight: 800; color: {t['ink-2']};
                    letter-spacing: 1px; }}
    /* O que falta fazer, dito onde a pessoa vai clicar em “abrir os boletins”. */
    QLabel#pendencia {{ background: {t['rosa-fundo']}; color: {t['rosa']};
                        border: 1px solid {t['rosa-claro']};
                        border-left: 4px solid {t['rosa']};
                        border-radius: 10px; padding: 10px 12px;
                        font-size: 13px; font-weight: 600; }}

    /* ---- o menu lateral, como o .lado do sistema ---- */
    QFrame#lado {{ background: {t['papel']}; border-right: 1px solid {t['borda']}; }}
    QLabel#logo {{
      background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                 stop:0 {t['azul-esc']}, stop:0.55 {t['azul']}, stop:1 {t['rosa']});
      color: #fff; font-weight: 800; font-size: 12px; border-radius: 12px;
      min-width: 42px; max-width: 42px; min-height: 42px; max-height: 42px;
    }}
    QLabel#marca {{ font-size: 15px; font-weight: 800; }}
    QLabel#marcaSub {{ font-size: 11px; color: {t['ink-2']}; }}
    QFrame#selProva {{ background: {t['azul-claro']};
      border: 1px solid {_mistura(t['azul'], t['azul-claro'], .18)}; border-radius: 12px; }}
    QLabel#selProvaRot {{ font-size: 10px; font-weight: 800; color: {t['azul']};
      letter-spacing: 1.2px; }}
    QLabel#selProvaVal {{ font-size: 13.5px; font-weight: 700; }}

    QListWidget#passos {{ background: {t['papel']}; border: none; outline: none; }}
    QListWidget#passos::item {{
      border-radius: 12px; padding: 10px 11px; margin: 2px 0;
      color: {t['ink-2']}; font-weight: 600;
    }}
    QListWidget#passos::item:hover {{ background: {t['azul-claro']}; color: {t['azul']}; }}
    QListWidget#passos::item:selected {{
      background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                 stop:0 {t['azul-esc']}, stop:1 {t['azul']});
      color: #fff; font-weight: 700;
    }}
    QListWidget#passos::item:disabled {{ color: {_mistura(t['ink-2'], t['papel'], .45)}; }}

    /* ---- o quadro branco do conteúdo, como o .quadro ---- */
    QFrame#quadro {{ background: {t['papel']}; border: 1px solid {t['borda']};
                     border-radius: 16px; }}
    QFrame#aviso {{ background: {t['rosa-fundo']};
      border: 1px solid {t['rosa-claro']}; border-left: 4px solid {t['amarelo']};
      border-radius: 12px; }}

    /* ---- botões ---- */
    QPushButton {{
      background: {t['azul']}; color: #fff; border: none; border-radius: 11px;
      padding: 9px 18px; font-weight: 700; font-size: 13.5px;
    }}
    QPushButton:hover {{ background: {_mistura('#ffffff', t['azul'], .10)}; }}
    QPushButton:disabled {{ background: {_mistura(t['azul'], t['fundo'], .35)}; color: #fff; }}
    QPushButton[papel="fantasma"] {{
      background: transparent; color: {t['azul']}; border: 2px solid {t['azul']};
    }}
    QPushButton[papel="fantasma"]:hover {{ background: {t['azul-claro']}; }}
    QPushButton[papel="fantasma"]:disabled {{
      color: {_mistura(t['azul'], t['fundo'], .40)};
      border-color: {_mistura(t['azul'], t['fundo'], .40)};
    }}
    QPushButton[papel="rosa"] {{ background: {t['rosa']}; }}
    QPushButton[papel="rosa"]:hover {{ background: {_mistura('#ffffff', t['rosa'], .10)}; }}

    /* ---- campos ---- */
    QLineEdit {{
      border: 1.5px solid {t['borda']}; border-radius: 10px; padding: 8px 12px;
      background: {t['fundo']}; color: {t['ink']}; font-size: 14px;
    }}
    QLineEdit:focus {{ border-color: {t['azul']}; }}

    /* ---- tabelas, como o table do sistema ---- */
    QTableWidget, QTableView {{
      background: {t['papel']}; border: none; gridline-color: transparent;
      font-size: 13.5px; selection-background-color: {t['azul-claro']};
      selection-color: {t['ink']};
    }}
    QHeaderView::section {{
      background: {t['papel']}; color: {t['ink-2']}; border: none;
      border-bottom: 2px solid {t['borda']}; padding: 7px 5px;
      font-size: 11px; font-weight: 700;
    }}
    QTableWidget::item {{ border-bottom: 1px solid {t['borda']}; padding: 7px 5px; }}

    /* ---- progresso ---- */
    QProgressBar {{
      border: none; border-radius: 8px; background: {t['azul-claro']};
      height: 16px; text-align: center; color: {t['ink-2']}; font-size: 11px;
      font-weight: 700;
    }}
    QProgressBar::chunk {{
      border-radius: 8px;
      background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                 stop:0 {t['azul']}, stop:1 {t['ciano']});
    }}

    QPlainTextEdit {{
      background: {t['fundo']}; border: 1px solid {t['borda']}; border-radius: 12px;
      font-family: Consolas, "SF Mono", monospace; font-size: 12px; color: {t['ink-2']};
      padding: 8px;
    }}
    QScrollArea {{ border: none; background: transparent; }}
    QScrollBar:vertical {{ background: transparent; width: 10px; margin: 4px 2px; }}
    QScrollBar::handle:vertical {{ background: {t['borda']}; border-radius: 5px; min-height: 30px; }}
    QScrollBar::add-line, QScrollBar::sub-line {{ height: 0; width: 0; }}
    """
