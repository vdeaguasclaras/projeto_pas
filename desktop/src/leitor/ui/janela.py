"""A janela do leitor de cartões.

Cinco passos, na ordem em que o trabalho acontece na secretaria: escolher a
prova, ler os cartões, conferir o que ficou em dúvida, ver os resultados,
imprimir os boletins. Cada passo só abre quando o anterior deu o que ele precisa
— não há como pedir boletim de um lote que ainda não foi lido.

O desenho é o do sistema on-line, e as cores vêm de lá de verdade (`tema.py`, que
é gerado do `css/estilo.css`). O que NÃO se repete aqui é o trabalho: ler o lote
é `lote.ler_lote`, corrigir é `correcao`, montar boletim é `boletim` — os mesmos
que a linha de comando chama. Uma janela que reimplementasse a leitura seria uma
segunda leitura para manter, e a segunda diverge.
"""
from __future__ import annotations

import csv
import sys
from dataclasses import dataclass, field
from pathlib import Path

from PySide6.QtCore import Qt, QThread, QUrl, Signal
from PySide6.QtGui import QDesktopServices, QPixmap
from PySide6.QtWidgets import (
    QApplication, QDialog, QFileDialog, QFrame, QHBoxLayout, QHeaderView, QLabel,
    QLineEdit, QListWidget, QListWidgetItem, QMainWindow, QMessageBox,
    QPlainTextEdit, QProgressBar, QPushButton, QScrollArea, QSizePolicy,
    QStackedWidget, QTableWidget, QTableWidgetItem, QVBoxLayout, QWidget,
)

from ..apuracao import apurar, marcacoes_de
from ..correcao import Resultado
from ..imagem import digitalizacoes
from ..lote import Lote, ler_lote
from ..molde import GabaritoIncompativel
from ..pacote import Pacote, carregar
from .estilo import folha

PASSOS = ["Prova", "Ler cartões", "Conferência", "Resultados", "Boletins"]


@dataclass
class Sessao:
    """O que a janela sabe no momento. Um passo enche o que o próximo consome."""
    pacote: Pacote | None = None
    caminho_pacote: Path | None = None
    entrada: Path | None = None
    saida: Path | None = None
    lote: Lote | None = None
    marcacoes: dict[str, dict[int, str]] = field(default_factory=dict)
    resultados: list[Resultado] = field(default_factory=list)


# ------------------------------------------------------------ peças de desenho

def rotulo(texto: str, nome: str = "", quebra: bool = True) -> QLabel:
    etiqueta = QLabel(texto)
    if nome:
        etiqueta.setObjectName(nome)
    etiqueta.setWordWrap(quebra)
    return etiqueta


def botao(texto: str, papel: str = "", ao_clicar=None) -> QPushButton:
    b = QPushButton(texto)
    if papel:
        b.setProperty("papel", papel)
    if ao_clicar:
        b.clicked.connect(ao_clicar)
    b.setCursor(Qt.PointingHandCursor)
    return b


def quadro(*filhos: QWidget, margens: int = 22, espaco: int = 12) -> QFrame:
    """O cartão branco de conteúdo — o `.quadro` do sistema."""
    caixa = QFrame()
    caixa.setObjectName("quadro")
    coluna = QVBoxLayout(caixa)
    coluna.setContentsMargins(margens, margens, margens, margens)
    coluna.setSpacing(espaco)
    for filho in filhos:
        coluna.addWidget(filho) if isinstance(filho, QWidget) else coluna.addLayout(filho)
    return caixa


def linha(*filhos, espaco: int = 10) -> QHBoxLayout:
    faixa = QHBoxLayout()
    faixa.setSpacing(espaco)
    for filho in filhos:
        if filho is None:
            faixa.addStretch(1)
        elif isinstance(filho, QWidget):
            faixa.addWidget(filho)
        else:
            faixa.addLayout(filho)
    return faixa


# ------------------------------------------------------------------- a leitura

class LeituraEmThread(QThread):
    """A leitura fora da thread da janela, para ela não congelar.

    Um lote de 340 folhas leva minutos. Janela parada é janela que o Windows
    pinta de branco e chama de “não está respondendo”, e quem opera fecha.
    """
    andou = Signal(int, int, str)
    terminou = Signal(object)
    falhou = Signal(str)

    def __init__(self, pacote: Pacote, arquivos: list[Path], saida: Path):
        super().__init__()
        self._pacote, self._arquivos, self._saida = pacote, arquivos, saida

    def run(self) -> None:
        try:
            resultado = ler_lote(self._pacote, self._arquivos, self._saida,
                                 progresso=lambda f, t, o: self.andou.emit(f, t, o))
            self.terminou.emit(resultado)
        except Exception as erro:                      # a janela não pode morrer calada
            self.falhou.emit(str(erro))


# -------------------------------------------------------------------- as telas

class PaginaProva(QWidget):
    """Passo 1 — de que prova é este lote."""

    def __init__(self, janela: "Janela"):
        super().__init__()
        self.janela = janela
        self.resumo = rotulo("Nenhum pacote escolhido ainda.", "sub")
        self.detalhe = rotulo("")
        self.detalhe.setTextFormat(Qt.RichText)
        coluna = QVBoxLayout(self)
        coluna.setContentsMargins(0, 0, 0, 0)
        coluna.addWidget(quadro(
            rotulo("O pacote da prova", "titulo"),
            rotulo("O arquivo que o sistema exporta em Cartões-resposta → “Exportar pacote da "
                   "prova”. Ele traz o gabarito, o desenho do cartão, o elenco e as notas já "
                   "lançadas — é dele que saem a leitura e os boletins.", "sub"),
            linha(botao("Escolher o pacote…", ao_clicar=self.escolher), None),
            self.resumo, self.detalhe))
        coluna.addStretch(1)

    def escolher(self) -> None:
        caminho, _ = QFileDialog.getOpenFileName(
            self, "Escolher o pacote da prova", "", "Pacote da prova (*.json)")
        if caminho:
            self.janela.carregar_pacote(Path(caminho))

    def mostrar(self, pacote: Pacote, caminho: Path) -> None:
        prova = pacote.molde.prova
        self.resumo.setText(f"{prova.get('nome', '')} · {prova.get('serie', '')} · "
                            f"{prova.get('etapa', '')}")
        itens = {v: len(pacote.molde.itens_da_versao(v)) for v in ("regular", "adaptada")}
        partes = [f"<b>Arquivo:</b> {caminho.name}",
                  f"<b>Itens:</b> {itens['regular']} na regular · {itens['adaptada']} na adaptada",
                  f"<b>Elenco:</b> {len(pacote.elenco)} estudante(s)",
                  f"<b>Notas já lançadas:</b> {len(pacote.notas)} estudante(s)"]
        if not pacote.tem_boletim:
            partes.append("<b style='color:#e88b00'>Sem elenco:</b> dá para ler os cartões, "
                          "mas não para gerar resultados nem boletins. Exporte o "
                          "<i>pacote</i> da prova, e não o gabarito sozinho.")
        self.detalhe.setText("<br>".join(partes))


class PaginaLeitura(QWidget):
    """Passo 2 — a pasta das digitalizações e a barra de progresso."""

    def __init__(self, janela: "Janela"):
        super().__init__()
        self.janela = janela
        self.thread: LeituraEmThread | None = None
        self.pasta = rotulo("Nada escolhido ainda.", "sub")
        self.barra = QProgressBar()
        self.barra.setVisible(False)
        self.registro = QPlainTextEdit()
        self.registro.setReadOnly(True)
        self.registro.setMinimumHeight(180)
        self.botao_ler = botao("Ler os cartões", "rosa", self.ler)
        self.botao_ler.setEnabled(False)
        coluna = QVBoxLayout(self)
        coluna.setContentsMargins(0, 0, 0, 0)
        coluna.addWidget(quadro(
            rotulo("Ler os cartões digitalizados", "titulo"),
            rotulo("As digitalizações do lote, a 300 dpi: a pasta que as contém, ou o próprio "
                   "PDF de várias páginas — que é como o scanner costuma salvar o lote inteiro. "
                   "O cartão-gabarito deve estar no topo da pilha.", "sub"),
            linha(botao("Escolher a pasta…", "fantasma", self.escolher),
                  botao("Escolher um arquivo…", "fantasma", self.escolher_arquivo),
                  self.botao_ler, None),
            self.pasta, self.barra, self.registro))
        coluna.addStretch(1)

    def escolher(self) -> None:
        caminho = QFileDialog.getExistingDirectory(self, "Pasta com as digitalizações")
        if caminho:
            self._usar(Path(caminho))

    def escolher_arquivo(self) -> None:
        """O lote num arquivo só — o PDF de várias páginas que o scanner salva.

        Escolher a PASTA seria mandar ler tudo o que houver de PDF e de imagem
        dentro dela, e esse PDF costuma cair em Downloads ou na Área de Trabalho,
        no meio de centenas de outros arquivos.
        """
        caminho, _filtro = QFileDialog.getOpenFileName(
            self, "Arquivo com as digitalizações", "",
            "Digitalizações (*.pdf *.jpg *.jpeg *.png *.tif *.tiff *.bmp)")
        if caminho:
            self._usar(Path(caminho))

    def _usar(self, escolhido: Path) -> None:
        arquivos = digitalizacoes(escolhido)
        # O resultado sai AO LADO do que foi escolhido, com o nome dele — a pessoa
        # acabou de navegar até ali, e é onde vai procurar o que saiu.
        nome = escolhido.stem if escolhido.is_file() else escolhido.name
        self.janela.sessao.entrada = escolhido
        self.janela.sessao.saida = escolhido.parent / f"resultado-{nome}"
        self.botao_ler.setEnabled(bool(arquivos))
        if not arquivos:
            self.pasta.setText(f"{escolhido} — não achei digitalização aqui.")
            return
        self.pasta.setText(f"{escolhido} — {len(arquivos)} arquivo(s). "
                           f"O resultado vai para {self.janela.sessao.saida.name}.")

    def ler(self) -> None:
        sessao = self.janela.sessao
        if not (sessao.pacote and sessao.entrada and sessao.saida):
            return
        arquivos = digitalizacoes(sessao.entrada)
        self.botao_ler.setEnabled(False)
        self.barra.setVisible(True)
        self.barra.setValue(0)
        self.registro.clear()
        self.registro.appendPlainText("Procurando o cartão-gabarito no topo da pilha…")
        self.thread = LeituraEmThread(sessao.pacote, arquivos, sessao.saida)
        self.thread.andou.connect(self.andou)
        self.thread.terminou.connect(self.terminou)
        self.thread.falhou.connect(self.falhou)
        self.thread.start()

    def andou(self, feito: int, total: int, onde: str) -> None:
        self.barra.setMaximum(max(1, total))
        self.barra.setValue(feito)
        self.barra.setFormat("%v de %m folhas")
        if feito:
            self.registro.appendPlainText(f"folha {feito}/{total} — {onde}")

    def falhou(self, erro: str) -> None:
        self.botao_ler.setEnabled(True)
        self.barra.setVisible(False)
        QMessageBox.critical(self, "A leitura parou", erro)

    def terminou(self, lote: Lote) -> None:
        self.botao_ler.setEnabled(True)
        self.registro.appendPlainText("")
        self.registro.appendPlainText(f"Limiar de tinta: {lote.limiares}")
        for aviso in lote.avisos + lote.divergencias:
            self.registro.appendPlainText(f"ATENÇÃO — {aviso}")
        self.registro.appendPlainText(
            f"{len(lote.leituras)} página(s) · {lote.lidas} lida(s) · "
            f"{lote.referencia} de referência · {lote.a_conferir} para conferência")
        if lote.deitadas:
            self.registro.appendPlainText(
                f"{lote.deitadas} folha(s) vieram deitadas e foram endireitadas aqui — "
                "digitalizar em pé é mais rápido.")
        self.janela.leitura_pronta(lote)
        if lote.divergencias:
            QMessageBox.warning(
                self, "O cartão-gabarito divergiu",
                "O cartão-gabarito impresso não corresponde ao gabarito deste pacote:\n\n"
                + "\n".join(lote.divergencias[:6])
                + "\n\nAlguém pode ter mexido nos itens depois de imprimir os cartões. "
                  "Confira antes de usar estes resultados.")


class ImagemClicavel(QLabel):
    """Um recorte que se abre ao clique — a miniatura não decide sozinha.

    300px bastam para “tem alguma coisa marcada aqui”. Não bastam para “é o 8 ou
    o 3”, que é a pergunta que trouxe a marcação para esta fila.
    """
    clicada = Signal()

    def __init__(self):
        super().__init__()
        self.setCursor(Qt.PointingHandCursor)
        self.setToolTip("Clique para ver a marcação em tamanho grande")

    def mouseReleaseEvent(self, evento) -> None:
        if evento.button() == Qt.LeftButton:
            self.clicada.emit()
        super().mouseReleaseEvent(evento)


def _esc_html(texto) -> str:
    return str(texto).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class DialogoMarcacao(QDialog):
    """A marcação duvidosa em tamanho grande, com a folha em volta.

    Duas imagens, e cada uma responde a uma pergunta diferente: a de cima, o que
    está marcado; a de baixo, o que há em volta. Quase toda dúvida se explica
    pelo vizinho — um traço que invadiu a linha, uma rasura ao lado —, e o
    recorte apertado esconde exatamente isso.

    O campo de resposta está aqui dentro de propósito: quem ampliou para decidir
    quer decidir agora, não voltar à lista para procurar a linha certa.
    """

    def __init__(self, achado: dict, saida: Path, campo: QLineEdit, pai=None):
        super().__init__(pai)
        self.setWindowTitle(f"Item {achado['item']} · {achado['matricula'] or 'sem matrícula'}")
        self.campo_da_lista = campo
        coluna = QVBoxLayout(self)
        coluna.setContentsMargins(18, 16, 18, 16)
        coluna.setSpacing(10)

        coluna.addWidget(rotulo(
            f"<b>{_esc_html(achado['matricula'] or '—')}</b> · item {achado['item']}"
            f" · <span style='color:#8a5a00'>{_esc_html(achado['motivo'])}</span>"
            f"<br><span style='color:#5d6685;font-size:12px'>{_esc_html(achado['folha'])}</span>",
            "sub"))
        for chave, legenda in (("imagem", "A marcação"), ("contexto", "Com a folha em volta")):
            caminho = saida / achado[chave] if achado.get(chave) else None
            if not (caminho and caminho.exists()):
                continue
            coluna.addWidget(rotulo(legenda, "secao"))
            imagem = QLabel()
            mapa = QPixmap(str(caminho))
            if mapa.width() > 620:
                mapa = mapa.scaledToWidth(620, Qt.SmoothTransformation)
            imagem.setPixmap(mapa)
            coluna.addWidget(imagem)

        self.campo = QLineEdit(campo.text())
        self.campo.setFixedWidth(140)
        self.campo.setAlignment(Qt.AlignCenter)
        coluna.addWidget(rotulo("Resposta — apague se o cartão estiver em branco", "sub"))
        coluna.addLayout(linha(self.campo, None, botao("Guardar e fechar", "rosa", self.guardar)))

    def guardar(self) -> None:
        self.campo_da_lista.setText(self.campo.text().strip().upper())
        self.accept()


class PaginaConferencia(QWidget):
    """Passo 3 — o que o leitor não leu com certeza, com a imagem da marcação."""

    def __init__(self, janela: "Janela"):
        super().__init__()
        self.janela = janela
        self.campos: list[tuple[dict, QLineEdit]] = []
        self.aviso = rotulo("", "sub")
        self.lista = QWidget()
        self.coluna_lista = QVBoxLayout(self.lista)
        self.coluna_lista.setSpacing(8)
        rolagem = QScrollArea()
        rolagem.setWidgetResizable(True)
        rolagem.setWidget(self.lista)
        self.botao_aplicar = botao("Aplicar e recorrigir", "rosa", self.aplicar)
        self.botao_aplicar.setEnabled(False)
        coluna = QVBoxLayout(self)
        coluna.setContentsMargins(0, 0, 0, 0)
        coluna.addWidget(quadro(
            rotulo("Conferência", "titulo"),
            rotulo("O leitor recusa o que não é inequívoco. Aqui está cada marcação duvidosa "
                   "com o pedaço do papel onde ela está: confira, corrija o que estiver errado "
                   "e apague o que estiver em branco no cartão.", "sub"),
            self.aviso, rolagem, linha(None, self.botao_aplicar)))

    def mostrar(self, achados: list[dict], saida: Path) -> None:
        while self.coluna_lista.count():
            item = self.coluna_lista.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        self.campos.clear()
        if not achados:
            self.aviso.setText("Nada em dúvida neste lote — todas as marcações foram lidas "
                               "com certeza.")
            self.botao_aplicar.setEnabled(False)
            return
        self.aviso.setText(f"{len(achados)} marcação(ões) para conferir.")
        self.botao_aplicar.setEnabled(True)
        for achado in achados:
            self.coluna_lista.addWidget(self._fila(achado, saida))
        self.coluna_lista.addStretch(1)

    def _fila(self, achado: dict, saida: Path) -> QWidget:
        fila = QFrame()
        fila.setObjectName("quadro")
        faixa = QHBoxLayout(fila)
        faixa.setContentsMargins(10, 8, 10, 8)
        faixa.setSpacing(12)

        imagem = ImagemClicavel()
        caminho = saida / achado["imagem"]
        if caminho.exists():
            mapa = QPixmap(str(caminho))
            # Cabe em 300×170: o bloco do tipo B é alto e estreito, e limitá-lo
            # pela altura de uma linha de item o deixaria ilegível justamente no
            # caso em que quem confere precisa contar dez alvéolos. Para além
            # disso, o clique abre em tamanho grande.
            if mapa.width() > 300 or mapa.height() > 170:
                mapa = mapa.scaled(300, 170, Qt.KeepAspectRatio, Qt.SmoothTransformation)
            imagem.setPixmap(mapa)
        imagem.setFixedWidth(310)
        faixa.addWidget(imagem)

        texto = rotulo(f"<b>{achado['matricula'] or '—'}</b> · item {achado['item']}"
                       f"<br><span style='color:#8a5a00'>{achado['motivo']}</span>")
        texto.setTextFormat(Qt.RichText)
        texto.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)
        faixa.addWidget(texto, 1)

        campo = QLineEdit(achado["resposta"])
        campo.setFixedWidth(110)
        campo.setAlignment(Qt.AlignCenter)
        faixa.addWidget(campo)

        lupa = botao("Ampliar", "fantasma")
        lupa.setFixedWidth(96)
        faixa.addWidget(lupa)
        abrir = lambda: DialogoMarcacao(achado, saida, campo, self).exec()
        imagem.clicada.connect(abrir)
        lupa.clicked.connect(abrir)

        self.campos.append((achado, campo))
        return fila

    def aplicar(self) -> None:
        """Grava o que a pessoa decidiu e refaz a correção com isso."""
        sessao = self.janela.sessao
        if not sessao.saida:
            return
        conferido = sessao.saida / "conferido.csv"
        with conferido.open("w", encoding="utf-8", newline="") as arquivo:
            escritor = csv.writer(arquivo, delimiter=";", lineterminator="\n")
            escritor.writerow(["matricula", "item", "resposta"])
            for achado, campo in self.campos:
                if achado["matricula"]:
                    escritor.writerow([achado["matricula"], achado["item"],
                                       campo.text().strip().upper()])
        self.janela.recorrigir()
        QMessageBox.information(
            self, "Conferência aplicada",
            f"O que você decidiu foi gravado em {conferido.name} e já entrou nos resultados "
            "e nos boletins.")


class PaginaResultados(QWidget):
    """Passo 4 — a planilha de quem fez quanto."""

    # Certas, erradas e brancos numa coluna só. Como três, empurravam a posição e
    # a redação para fora da janela — e são o detalhe, não a resposta: quem abre
    # esta tela quer a nota e o lugar na turma, e tem tudo isso na planilha.
    #
    # Os títulos são curtos DE PROPÓSITO: a coluna se ajusta ao conteúdo, e aqui
    # o conteúdo é sempre menor que o título — quem manda na largura é o texto do
    # cabeçalho. “Escore PAS” custava 25px de janela para dizer o que a ajuda ao
    # lado (e o resumo acima da tabela) já dizem. O que ficou curto demais para
    # ser óbvio ganha `AJUDA`, que aparece ao pousar o ponteiro.
    COLUNAS = ["Matrícula", "Nome", "Turma", "Versão", "Cert·Err·Br",
               "Escore", "% acertos", "Marista", "Redação", "Posição"]
    AJUDA = {
        "Cert·Err·Br": "Certas · erradas · em branco",
        "Escore": "Escore bruto do PAS — acerto soma, erro desconta",
        "% acertos": "Proporção de acertos, sem desconto",
        "Marista": "Nota Marista — a proporção de acertos na escala da escola",
        "Redação": "NR, a nota da redação lançada no sistema",
        "Posição": "Lugar na turma pelo escore do PAS",
    }
    # “1º/5” em vez de “1º de 5”: a coluna é a última, e é a que caía fora da
    # janela quando o texto crescia.
    NOME_MINIMO, NOME_MAXIMO = 130, 320

    def __init__(self, janela: "Janela"):
        super().__init__()
        self.janela = janela
        self.tabela = QTableWidget(0, len(self.COLUNAS))
        self.tabela.setHorizontalHeaderLabels(self.COLUNAS)
        self.tabela.verticalHeader().setVisible(False)
        self.tabela.setEditTriggers(QTableWidget.NoEditTriggers)
        # O nome estica e o resto se ajusta ao conteúdo: com tudo ajustado ao
        # conteúdo a última coluna caía fora da janela, e a posição do estudante
        # é justamente o que se quer ver sem rolar.
        # Os números se ajustam ao conteúdo; o NOME tem largura própria, porque
        # é a coluna que a pessoa lê para achar o estudante. Deixá-lo “esticar o
        # que sobrar” o espremia a nada quando as outras colunas somavam mais que
        # a janela, e a tabela virava uma fileira de números sem dono.
        cabecalho = self.tabela.horizontalHeader()
        cabecalho.setSectionResizeMode(QHeaderView.ResizeToContents)
        cabecalho.setSectionResizeMode(1, QHeaderView.Interactive)
        cabecalho.setStretchLastSection(False)
        self.tabela.setColumnWidth(1, self.NOME_MINIMO)
        for j, titulo in enumerate(self.COLUNAS):
            if titulo in self.AJUDA:
                self.tabela.horizontalHeaderItem(j).setToolTip(self.AJUDA[titulo])
        self.resumo = rotulo("", "sub")
        coluna = QVBoxLayout(self)
        coluna.setContentsMargins(0, 0, 0, 0)
        coluna.addWidget(quadro(
            rotulo("Resultados", "titulo"), self.resumo,
            linha(botao("Abrir a pasta do resultado", "fantasma", self.abrir_pasta), None),
            self.tabela))

    def abrir_pasta(self) -> None:
        if self.janela.sessao.saida:
            QDesktopServices.openUrl(QUrl.fromLocalFile(str(self.janela.sessao.saida)))

    def _ajustar_nome(self) -> None:
        """A coluna do nome fica com o que sobrar — nem esticada, nem espremida.

        Com todas as colunas ajustadas ao conteúdo, a soma passava da janela e a
        última — a posição na turma — ficava do lado de fora, atrás de uma barra
        de rolagem horizontal. Deixar o Qt esticar o nome (`Stretch`) faz o
        contrário: quando as outras somam mais que a janela, o nome encolhe até
        virar uma tira de dois caracteres e a tabela vira uma fileira de números
        sem dono. A conta é aqui, e é sempre a mesma: sobra = janela − as outras,
        com piso e teto. Nome comprido demais sai com reticências e o inteiro
        fica na dica — e na planilha.
        """
        outras = sum(self.tabela.columnWidth(c)
                     for c in range(self.tabela.columnCount()) if c != 1)
        sobra = self.tabela.viewport().width() - outras
        self.tabela.setColumnWidth(
            1, max(self.NOME_MINIMO, min(self.NOME_MAXIMO, sobra)))

    def resizeEvent(self, evento) -> None:  # noqa: N802 (nome do Qt)
        super().resizeEvent(evento)
        self._ajustar_nome()

    def mostrar(self, resultados: list[Resultado]) -> None:
        com_resposta = [r for r in resultados if r.tem_resposta]
        com_resposta.sort(key=lambda r: (r.estudante.turma, r.estudante.nome))
        self.resumo.setText(
            f"{len(com_resposta)} estudante(s) com respostas · planilha em resultados.csv. "
            "Duas notas: o escore do PAS, que desconta erro, e a Nota Marista, que é a "
            "proporção de acertos na escala da escola.")
        self.tabela.setRowCount(len(com_resposta))
        for i, r in enumerate(com_resposta):
            # A versão sai como o CÓDIGO impresso no cartão (A1/A2), não como a
            # palavra: é o que está no papel que a pessoa tem na mão, e cabe na
            # coluna. “Adaptada” também é palavra de bastidor — ver o CLAUDE.md.
            codigo = "A2" if r.estudante.versao == "adaptada" else "A1"
            valores = [r.estudante.matricula, r.estudante.nome, r.estudante.turma,
                       codigo, f"{r.acertos} · {r.erros} · {r.brancos}",
                       f"{r.escore:.2f}".replace(".", ","),
                       "—" if r.percentual is None
                       else f"{r.percentual * 100:.1f}%".replace(".", ","),
                       "—" if r.nota_marista is None
                       else f"{r.nota_marista:.2f}".replace(".", ","),
                       "—" if r.nr is None else f"{r.nr:.1f}".replace(".", ","),
                       f"{r.posicao}º/{r.de}" if r.posicao else "—"]
            for j, valor in enumerate(valores):
                celula = QTableWidgetItem(valor)
                if j >= 3:
                    celula.setTextAlignment(Qt.AlignCenter)
                if j == 1:
                    celula.setToolTip(r.estudante.nome)
                if j == 4:
                    celula.setToolTip(f"{r.acertos} certas · {r.erros} erradas · "
                                      f"{r.brancos} em branco")
                self.tabela.setItem(i, j, celula)
        self._ajustar_nome()


class PaginaBoletins(QWidget):
    """Passo 5 — o boletim de cada estudante."""

    def __init__(self, janela: "Janela"):
        super().__init__()
        self.janela = janela
        self.resumo = rotulo("", "sub")
        self.abrir = botao("Abrir os boletins para imprimir", "rosa", self.abrir_boletins)
        self.abrir.setEnabled(False)
        coluna = QVBoxLayout(self)
        coluna.setContentsMargins(0, 0, 0, 0)
        coluna.addWidget(quadro(
            rotulo("Boletins de desempenho", "titulo"),
            rotulo("Um boletim por estudante, no desenho do sistema: proporção de acertos por "
                   "grupo de habilidades comparada à média da turma, escore, redação, posição e "
                   "o gabarito ao lado das marcações. Abre no navegador — escolha “Salvar como "
                   "PDF” na impressão.", "sub"),
            self.resumo, linha(self.abrir, None)))
        coluna.addStretch(1)

    def abrir_boletins(self) -> None:
        alvo = (self.janela.sessao.saida or Path()) / "boletins.html"
        if alvo.exists():
            QDesktopServices.openUrl(QUrl.fromLocalFile(str(alvo)))

    def mostrar(self, resultados: list[Resultado], saida: Path) -> None:
        quantos = sum(1 for r in resultados if r.tem_resposta)
        existe = (saida / "boletins.html").exists()
        self.resumo.setText(f"{quantos} boletim(ns) prontos em boletins.html"
                            if existe else "Nenhum boletim gerado ainda.")
        self.abrir.setEnabled(existe)


# ------------------------------------------------------------------- a janela

class Janela(QMainWindow):
    def __init__(self):
        super().__init__()
        self.sessao = Sessao()
        self.setWindowTitle("PAS Marista — Leitor de Cartões")
        self.resize(1280, 800)

        self.paginas = [PaginaProva(self), PaginaLeitura(self), PaginaConferencia(self),
                        PaginaResultados(self), PaginaBoletins(self)]
        self.pilha = QStackedWidget()
        for pagina in self.paginas:
            self.pilha.addWidget(pagina)

        corpo = QWidget()
        faixa = QHBoxLayout(corpo)
        faixa.setContentsMargins(0, 0, 0, 0)
        faixa.setSpacing(0)
        faixa.addWidget(self._lado())
        conteudo = QWidget()
        coluna = QVBoxLayout(conteudo)
        coluna.setContentsMargins(24, 22, 24, 22)
        coluna.addWidget(self.pilha)
        faixa.addWidget(conteudo, 1)
        self.setCentralWidget(corpo)
        self.setStyleSheet(folha())
        self._atualizar_passos()

    def _lado(self) -> QFrame:
        lado = QFrame()
        lado.setObjectName("lado")
        lado.setFixedWidth(268)
        coluna = QVBoxLayout(lado)
        coluna.setContentsMargins(12, 18, 12, 12)
        coluna.setSpacing(12)

        logo = QLabel("PAS")
        logo.setObjectName("logo")
        logo.setAlignment(Qt.AlignCenter)
        marca = QVBoxLayout()
        marca.setSpacing(0)
        marca.addWidget(rotulo("Leitor de Cartões", "marca", quebra=False))
        marca.addWidget(rotulo("Marista Águas Claras", "marcaSub", quebra=False))
        coluna.addLayout(linha(logo, marca, None))

        self.caixa_prova = QFrame()
        self.caixa_prova.setObjectName("selProva")
        dentro = QVBoxLayout(self.caixa_prova)
        dentro.setContentsMargins(11, 9, 11, 10)
        dentro.setSpacing(3)
        dentro.addWidget(rotulo("PROVA", "selProvaRot", quebra=False))
        self.prova_atual = rotulo("nenhuma escolhida", "selProvaVal")
        dentro.addWidget(self.prova_atual)
        coluna.addWidget(self.caixa_prova)

        self.passos = QListWidget()
        self.passos.setObjectName("passos")
        for i, nome in enumerate(PASSOS):
            item = QListWidgetItem(f"{i + 1}   {nome}")
            self.passos.addItem(item)
        self.passos.setCurrentRow(0)
        self.passos.currentRowChanged.connect(self.pilha.setCurrentIndex)
        coluna.addWidget(self.passos, 1)
        coluna.addWidget(rotulo("Funciona sem internet. Tudo o que sai fica na pasta do "
                                "resultado, ao lado das digitalizações.", "sub"))
        return lado

    # ------------------------------------------------------------- o andamento

    def _atualizar_passos(self) -> None:
        """Um passo só abre quando o anterior deu o que ele precisa."""
        pronto = [True,
                  self.sessao.pacote is not None,
                  self.sessao.lote is not None,
                  bool(self.sessao.resultados),
                  bool(self.sessao.resultados)]
        for i, aberto in enumerate(pronto):
            item = self.passos.item(i)
            item.setFlags(item.flags() | Qt.ItemIsEnabled if aberto
                          else item.flags() & ~Qt.ItemIsEnabled)

    def ir_para(self, passo: int) -> None:
        self.passos.setCurrentRow(passo)

    def carregar_pacote(self, caminho: Path) -> None:
        try:
            pacote = carregar(caminho)
        except (GabaritoIncompativel, ValueError, KeyError) as erro:
            QMessageBox.critical(self, "Não deu para abrir o pacote", str(erro))
            return
        self.sessao = Sessao(pacote=pacote, caminho_pacote=caminho)
        self.paginas[0].mostrar(pacote, caminho)
        self.prova_atual.setText(f"{pacote.molde.prova.get('serie', '')} — "
                                 f"{pacote.molde.prova.get('etapa', '')}")
        self._atualizar_passos()
        self.ir_para(1)

    def leitura_pronta(self, lote: Lote) -> None:
        self.sessao.lote = lote
        self.paginas[2].mostrar(lote.achados, self.sessao.saida)
        self._atualizar_passos()
        self.recorrigir()
        self.ir_para(2 if lote.achados else 3)

    def recorrigir(self) -> None:
        """Corrige com tudo o que existe hoje: o que se leu e o que se conferiu."""
        sessao = self.sessao
        if not (sessao.pacote and sessao.saida and sessao.pacote.tem_boletim):
            return
        marcacoes, _, _ = marcacoes_de(
            sessao.pacote, [sessao.saida / "respostas.csv", sessao.saida / "conferido.csv"])
        sessao.marcacoes = marcacoes
        sessao.resultados, _, _ = apurar(sessao.pacote, marcacoes, sessao.saida)
        self.paginas[3].mostrar(sessao.resultados)
        self.paginas[4].mostrar(sessao.resultados, sessao.saida)
        self._atualizar_passos()



def abrir() -> int:
    """Abre a janela. É o que o `.exe` chama."""
    aplicacao = QApplication.instance() or QApplication(sys.argv)
    janela = Janela()
    janela.show()
    return aplicacao.exec()
