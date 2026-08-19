#!/usr/bin/env python3
"""Teste ponta a ponta do leitor: do PDF impresso ao CSV, conferido.

O que este teste cobra não é que o código roda — é que o leitor **acerta o que
está no papel e recusa o que não dá para ler**. Por isso ele não desenha cartão
nenhum: parte do PDF que o sistema web imprimiu (`gerar-amostras.mjs`), sujeita
esse PDF ao que um scanner de mesa faz com o papel — gira, desloca, borra,
chuvisca e recomprime — e então cobra do leitor, marcação por marcação, o que o
navegador registrou ter impresso.

Um leitor testado contra imagem limpa e reta passa aqui e falha na secretaria.
A digitalização simulada é o teste; o resto é conferência.

    python3 desktop/testes/testar-leitura.py                  # a prova de exemplo
    python3 desktop/testes/testar-leitura.py amostras-grande  # 42 itens, 32 estudantes
"""
from __future__ import annotations

import csv
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

RAIZ = Path(__file__).resolve().parents[2]
AMOSTRAS = Path(__file__).resolve().parent / (
    sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else "amostras")
sys.path.insert(0, str(RAIZ / "desktop" / "src"))

DPI = 300


def digitalizar(pdf: Path, destino: Path, semente: int = 7) -> int:
    """Simula a passagem do lote pelo scanner de mesa da escola.

    Cada folha entra torta de um jeito diferente — é assim que o alimentador
    trabalha —, então a distorção é sorteada por página, mas com semente fixa
    para o teste ser reprodutível.

    **O que esta função faz com a página é o que o scanner da escola fez de
    verdade**, e não uma ideia do que ele faria. A primeira digitalização real
    chegou assim: mesa A3, o cartão A4 solto no meio de uma página quase duas
    vezes maior, e DEITADO. O leitor recusou o lote inteiro com “as quatro
    manchas achadas não formam o retângulo do cartão” — as âncoras estavam
    perfeitas, o retângulo delas é que vinha com a proporção invertida. Até
    então o teste digitalizava em A4, em pé, porque foi assim que alguém
    imaginou que seria.

    Uma folha sai ainda por cima de cabeça para baixo, que é o defeito mais
    comum da pilha, e o leitor tem de resolver as duas coisas sozinho.
    """
    import pypdfium2 as pdfium

    aleatorio = np.random.default_rng(semente)
    destino.mkdir(parents=True, exist_ok=True)
    documento = pdfium.PdfDocument(pdf)
    try:
        for i in range(len(documento)):
            pagina = documento[i].render(scale=DPI / 72, grayscale=True).to_numpy()
            if pagina.ndim == 3:
                pagina = pagina[:, :, 0]
            imagem = pagina.astype(np.float32)

            # 1. o papel nunca entra reto, nem no mesmo lugar
            angulo = float(aleatorio.uniform(-0.9, 0.9))
            escala = float(aleatorio.uniform(0.985, 1.015))
            desloca = aleatorio.uniform(-25, 25, size=2)
            centro = (imagem.shape[1] / 2, imagem.shape[0] / 2)
            giro = cv2.getRotationMatrix2D(centro, angulo, escala)
            giro[:, 2] += desloca
            imagem = cv2.warpAffine(imagem, giro, (imagem.shape[1], imagem.shape[0]),
                                    flags=cv2.INTER_LINEAR, borderValue=255)

            # 2. a lente borra, a lâmpada varia, o sensor chuvisca
            imagem = cv2.GaussianBlur(imagem, (3, 3), float(aleatorio.uniform(0.4, 1.1)))
            imagem *= float(aleatorio.uniform(0.88, 1.0))
            imagem += float(aleatorio.uniform(0, 14))
            imagem += aleatorio.normal(0, 4.5, imagem.shape)
            imagem = np.clip(imagem, 0, 255).astype(np.uint8)

            # 3. a folha vai deitada para a mesa, e a mesa é A3: o cartão fica
            #    solto no meio de uma página bem maior que ele. Uma folha entra
            #    ainda de cabeça para baixo.
            imagem = np.rot90(imagem, 3 if i != 3 else 1)
            mesa = np.full((int(imagem.shape[0] * 2), imagem.shape[1]), 255, dtype=np.uint8)
            topo = int(aleatorio.integers(0, mesa.shape[0] - imagem.shape[0]))
            mesa[topo:topo + imagem.shape[0], :] = imagem
            imagem = mesa

            # 4. e o scanner salva em JPEG, com o que isso custa
            cv2.imwrite(str(destino / f"folha-{i + 1:03d}.jpg"), imagem,
                        [cv2.IMWRITE_JPEG_QUALITY, 82])
        return len(documento)
    finally:
        documento.close()


def ler_csv(caminho: Path) -> list[dict]:
    if not caminho.exists():
        return []
    with caminho.open(encoding="utf-8") as arquivo:
        return list(csv.DictReader(arquivo, delimiter=";"))


def somente_digitos(texto: str) -> str:
    return "".join(c for c in texto if c.isdigit())


def _conferir_extras() -> list[str]:
    """O cartão extra: a matrícula que o leitor tem de tirar dos alvéolos.

    É o único caminho em que a identificação da folha não vem da faixa do
    rodapé — a faixa do extra sai sem matrícula, porque na hora de imprimir não
    se sabe de quem ele vai ser. Se este teste não existisse, o cartão de
    reserva poderia estar quebrado por meses sem ninguém notar: ele só é usado
    no dia da aplicação, e só quando algo dá errado.
    """
    pdf = AMOSTRAS / "cartoes-extras-preenchidos.pdf"
    verdade_json = AMOSTRAS / "verdade-extras.json"
    if not pdf.exists() or not verdade_json.exists():
        return ["faltam as amostras de cartão extra — gere-as de novo"]

    verdade = json.loads(verdade_json.read_text(encoding="utf-8"))
    validas = [v for v in verdade if v.get("valida")]
    invalidas = [v for v in verdade if not v.get("valida")]
    esperado = {(v["matricula"], r["item"]): r["resposta"]
                for v in validas for r in v["respostas"]}
    with tempfile.TemporaryDirectory() as temporario:
        base = Path(temporario)
        entrada, saida = base / "digitalizacoes", base / "resultado"
        digitalizar(pdf, entrada, semente=19)
        subprocess.run(
            [sys.executable, "-m", "src.leitor.cli", "ler",
             "--gabarito", str(AMOSTRAS / "gabarito.json"),
             "--entrada", str(entrada), "--saida", str(saida)],
            cwd=RAIZ / "desktop", capture_output=True, text=True)
        lidas = {(l["matricula"], int(l["item"])): l["resposta"]
                 for l in ler_csv(saida / "respostas.csv")}

    falhas = []
    boas = {v["matricula"] for v in validas}
    lidas_mat = {chave[0] for chave in lidas}
    for matricula in sorted(boas - lidas_mat):
        falhas.append(f"cartão extra: a matrícula {matricula} foi preenchida nos alvéolos "
                      "e não voltou em resposta nenhuma")
    for chave, valor in sorted(esperado.items()):
        if chave in lidas and lidas[chave] != valor:
            falhas.append(f"cartão extra {chave[0]} item {chave[1]}: impresso “{valor}”, "
                          f"lido “{lidas[chave]}”")
    # A matrícula fora do padrão da escola não pode virar resposta de ninguém:
    # sem CRC por baixo, aceitá-la é lançar a prova na conta de outra pessoa.
    for v in invalidas:
        if v["matricula"] in lidas_mat:
            falhas.append(f"cartão extra: a matrícula “{v['matricula']}” está fora do padrão "
                          "da escola e o leitor a aceitou em vez de mandar conferir")
    for chave in sorted(lidas):
        if chave[0] not in boas:
            falhas.append(f"cartão extra: matrícula “{chave[0]}” lida, e nenhuma válida "
                          "foi impressa assim")
    print(f"cartão extra: {len(boas)} matrícula(s) válida(s) e {len(invalidas)} fora do padrão · "
          f"{len(lidas)} marcação(ões) lida(s)")
    return falhas


def main() -> int:
    pdf = AMOSTRAS / "cartoes-preenchidos.pdf"
    verdade_json = AMOSTRAS / "verdade-preenchidos.json"
    if not pdf.exists() or not verdade_json.exists():
        print(f"Faltam as amostras em {AMOSTRAS}. Rode antes:\n"
              "  node desktop/testes/gerar-amostras.mjs", file=sys.stderr)
        return 2

    verdade = json.loads(verdade_json.read_text(encoding="utf-8"))
    esperado = {(somente_digitos(v["mat"]), int(v["item"])): str(v["resposta"])
                for v in verdade["verdade"]}
    anomalias = {(somente_digitos(a["mat"]), int(a["item"])): a["caso"]
                 for a in verdade["anomalias"]}

    with tempfile.TemporaryDirectory() as temporario:
        base = Path(temporario)
        entrada, saida = base / "digitalizacoes", base / "resultado"
        n = digitalizar(pdf, entrada)
        print(f"Digitalização simulada: {n} folha(s) tortas, borradas e em JPEG.")

        processo = subprocess.run(
            [sys.executable, "-m", "src.leitor.cli", "ler",
             "--gabarito", str(AMOSTRAS / "gabarito.json"),
             "--entrada", str(entrada), "--saida", str(saida)],
            cwd=RAIZ / "desktop", capture_output=True, text=True)
        print(processo.stdout)
        if processo.stderr.strip():
            print(processo.stderr, file=sys.stderr)

        lidas = {(somente_digitos(l["matricula"]), int(l["item"])): l["resposta"]
                 for l in ler_csv(saida / "respostas.csv")}
        conferir = {(somente_digitos(l["matricula"]), int(l["item"])): l["motivo"]
                    for l in ler_csv(saida / "respostas_conferir.csv") if l["item"]}
        folhas = ler_csv(saida / "folhas.csv")

    falhas: list[str] = []

    # 1. Toda folha tem de ter sido alinhada e identificada — inclusive a virada.
    descartadas = [f for f in folhas if f["situacao"] == "descartada"]
    if descartadas:
        falhas.append(f"{len(descartadas)} folha(s) sem âncoras: "
                      + ", ".join(f["folha"] for f in descartadas))
    sem_id = [f for f in folhas if not f["tipo"]]
    if sem_id:
        falhas.append(f"{len(sem_id)} folha(s) sem identificação: "
                      + ", ".join(f["folha"] for f in sem_id))

    # 2. Cada marcação impressa tem de voltar, e com o mesmo valor.
    for chave, valor in sorted(esperado.items()):
        if chave not in lidas:
            falhas.append(f"matrícula {chave[0]} item {chave[1]}: impresso “{valor}”, "
                          f"não veio em respostas.csv ({conferir.get(chave, 'nem em conferir')})")
        elif lidas[chave] != valor:
            falhas.append(f"matrícula {chave[0]} item {chave[1]}: impresso “{valor}”, "
                          f"lido “{lidas[chave]}”")

    # 3. E nada além delas — resposta inventada é o pior defeito possível aqui.
    for chave, valor in sorted(lidas.items()):
        if chave not in esperado:
            falhas.append(f"matrícula {chave[0]} item {chave[1]}: nada foi impresso, "
                          f"e o leitor devolveu “{valor}”")

    # 4. Os casos difíceis têm de ter sido RECUSADOS, não resolvidos no chute.
    for chave, caso in sorted(anomalias.items()):
        if caso == "branco":
            if chave in lidas:
                falhas.append(f"matrícula {chave[0]} item {chave[1]}: ficou em branco no papel "
                              f"e o leitor devolveu “{lidas[chave]}”")
        elif chave in lidas:
            falhas.append(f"matrícula {chave[0]} item {chave[1]}: era {caso} no papel e o leitor "
                          f"devolveu “{lidas[chave]}” em vez de mandar conferir")
        elif chave not in conferir:
            falhas.append(f"matrícula {chave[0]} item {chave[1]}: era {caso} no papel e não "
                          "apareceu nem em respostas.csv nem na conferência")

    falhas.extend(_conferir_extras())

    print(f"{len(esperado)} marcação(ões) esperada(s) · {len(lidas)} lida(s) · "
          f"{len(anomalias)} caso(s) difícil(eis) · {len(conferir)} em conferência")
    if falhas:
        print("\nFALHOU:", file=sys.stderr)
        for f in falhas:
            print(f"  · {f}", file=sys.stderr)
        return 1
    print("\nPASSOU: tudo que estava impresso voltou, nada foi inventado, e o duvidoso "
          "foi para a conferência.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
