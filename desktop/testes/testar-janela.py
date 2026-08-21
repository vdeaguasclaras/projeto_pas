#!/usr/bin/env python3
"""Passa a janela pelos seis passos, sem ninguém clicando.

Interface é o que mais apodrece sem ninguém olhar: um campo renomeado no leitor,
e a tela que o mostrava fica vazia sem quebrar nada — nenhum teste de leitura
acusaria. Este roteiro abre a janela de verdade (fora da tela, com o Qt em
`offscreen`), carrega um pacote, lê um lote e confere que cada passo mostrou o
que tinha de mostrar.

Não substitui olhar: aparência ninguém afere por asserção. Substitui descobrir
pela secretaria que a tabela de resultados ficou em branco.

    QT_QPA_PLATFORM=offscreen python3 desktop/testes/testar-janela.py [amostras]
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

RAIZ = Path(__file__).resolve().parents[2]
AMOSTRAS = Path(__file__).resolve().parent / (
    sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else "amostras")
sys.path.insert(0, str(RAIZ / "desktop" / "src"))


def main() -> int:
    pacote = AMOSTRAS / "pacote.json"
    cartoes = AMOSTRAS / "cartoes-preenchidos.pdf"
    if not pacote.exists() or not cartoes.exists():
        print(f"Faltam as amostras em {AMOSTRAS}. Rode antes:\n"
              "  node desktop/testes/gerar-amostras.mjs", file=sys.stderr)
        return 2

    import importlib.util
    import tempfile
    from PySide6.QtCore import Qt
    from PySide6.QtWidgets import QApplication
    from leitor.imagem import digitalizacoes
    from leitor.lote import ler_lote
    from leitor.ui.janela import Janela

    spec = importlib.util.spec_from_file_location(
        "amostrar", Path(__file__).resolve().parent / "testar-leitura.py")
    amostrar = importlib.util.module_from_spec(spec)
    guardado, sys.argv[:] = sys.argv[:], ["testar-leitura"]
    spec.loader.exec_module(amostrar)
    sys.argv[:] = guardado

    aplicacao = QApplication.instance() or QApplication([])
    falhas: list[str] = []

    with tempfile.TemporaryDirectory() as temporario:
        base = Path(temporario)
        entrada, saida = base / "digitalizacoes", base / "resultado"
        amostrar.digitalizar(cartoes, entrada)

        janela = Janela()
        janela.show()

        # 1 · a prova
        janela.carregar_pacote(pacote)
        if janela.sessao.pacote is None:
            print("a janela não carregou o pacote", file=sys.stderr)
            return 1
        if "série" not in janela.prova_atual.text():
            falhas.append("o menu lateral não mostrou a prova carregada")
        # Um passo só abre quando o anterior deu o que ele precisa: com o pacote
        # carregado dá para ler, e ainda não dá para conferir nem ver resultado.
        aberto = lambda i: bool(janela.passos.item(i).flags() & Qt.ItemIsEnabled)
        if len(janela.paginas) != janela.passos.count():
            falhas.append("o menu lateral e as telas discordam de quantos passos existem")
        if not aberto(1):
            falhas.append("com o pacote carregado, o passo de ler continuou fechado")
        if aberto(2) or aberto(3):
            falhas.append("conferência ou resultados abriram antes de haver leitura")

        # 2 · a leitura (direta, sem thread: o teste não tem laço de eventos vivo)
        lote = ler_lote(janela.sessao.pacote, digitalizacoes(entrada), saida)
        janela.sessao.entrada, janela.sessao.saida = entrada, saida
        janela.paginas[1].terminou(lote)
        aplicacao.processEvents()
        if not (aberto(2) and aberto(3)):
            falhas.append("depois de ler, a conferência e os resultados continuaram fechados")
        if lote.lidas == 0:
            falhas.append("a leitura não devolveu folha lida nenhuma")

        # 3 · a conferência mostra uma linha por marcação duvidosa, com imagem
        conferencia = janela.paginas[2]
        if len(conferencia.campos) != len(lote.achados):
            falhas.append(f"a conferência mostrou {len(conferencia.campos)} linha(s) "
                          f"para {len(lote.achados)} marcação(ões) duvidosa(s)")
        sem_imagem = [a for a, _ in conferencia.campos
                      if not (saida / a["imagem"]).exists()]
        if sem_imagem:
            falhas.append(f"{len(sem_imagem)} marcação(ões) sem o recorte da folha")

        # 4 · os resultados enchem a tabela
        tabela = janela.paginas[3].tabela
        com_resposta = sum(1 for r in janela.sessao.resultados if r.tem_resposta)
        if tabela.rowCount() != com_resposta:
            falhas.append(f"a tabela mostrou {tabela.rowCount()} linha(s) para "
                          f"{com_resposta} estudante(s) com resposta")
        if com_resposta and not (tabela.item(0, 1) and tabela.item(0, 1).text().strip()):
            falhas.append("a coluna do nome saiu vazia na tabela de resultados")

        # 5 · e os boletins existem em disco
        if not (saida / "boletins.html").exists():
            falhas.append("os boletins não foram gerados")
        if not janela.paginas[4].abrir.isEnabled():
            falhas.append("o botão de abrir os boletins ficou desligado")

        # a conferência, aplicada, tem de mudar a correção
        if conferencia.campos:
            achado, campo = conferencia.campos[0]
            campo.setText("C")
            conferencia_saida = saida / "conferido.csv"
            with open(conferencia_saida, "w", encoding="utf-8") as arquivo:
                arquivo.write("matricula;item;resposta\n"
                              f"{achado['matricula']};{achado['item']};C\n")
            janela.recorrigir()
            marcada = janela.sessao.marcacoes.get(achado["matricula"], {}).get(achado["item"])
            if marcada != "C":
                falhas.append("o que foi decidido na conferência não entrou na correção "
                              f"(item {achado['item']} ficou {marcada!r})")

        # 6 · a exportação para o sistema acadêmico
        exportacao = janela.paginas[5]
        if not exportacao.caixas:
            falhas.append("a tela de exportação não listou componente nenhum")
        # Com marcação em conferência, exportar tem de estar TRAVADO: essa nota
        # vai para o histórico escolar.
        exportacao.prova.setText("E1_P2")
        for _nome, caixa in exportacao.caixas[:1]:
            caixa.setChecked(True)
        if conferencia.campos and exportacao.botao.isEnabled():
            falhas.append("a exportação ficou liberada com marcação ainda em conferência")

        # Resolvida a conferência inteira, libera.
        with open(saida / "conferido.csv", "w", encoding="utf-8") as arquivo:
            arquivo.write("matricula;item;resposta\n")
            for achado, _campo in conferencia.campos:
                arquivo.write(f"{achado['matricula']};{achado['item']};C\n")
        janela.recorrigir()
        aplicacao.processEvents()
        if not exportacao.botao.isEnabled():
            falhas.append("a exportação continuou travada depois de a conferência ser "
                          f"resolvida ({exportacao.resumo.text()})")
        else:
            from leitor import academico
            linhas = academico.linhas_do_arquivo(
                janela.sessao.pacote, janela.sessao.resultados, "E1_P2", 2026,
                [exportacao.caixas[0][0]], serie=exportacao.serie)
            alvo = academico.escrever(saida / "notas.txt", linhas)
            bruto = alvo.read_bytes()
            if len(linhas) != len(janela.sessao.pacote.elenco):
                falhas.append(f"o TXT saiu com {len(linhas)} linha(s) para "
                              f"{len(janela.sessao.pacote.elenco)} estudante(s)")
            if b"\r\n" not in bruto or not bruto.startswith(b"ALUNO,DISCIPLINA"):
                falhas.append("o TXT não saiu no formato do sistema acadêmico")

        print(f"6 passos percorridos · {lote.lidas} folha(s) lida(s) · "
              f"{len(conferencia.campos)} na conferência · {tabela.rowCount()} no resultado")

    if falhas:
        print("\nFALHOU:", file=sys.stderr)
        for f in falhas:
            print(f"  · {f}", file=sys.stderr)
        return 1
    print("\nPASSOU: a janela percorreu os seis passos e cada tela mostrou o que devia.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
