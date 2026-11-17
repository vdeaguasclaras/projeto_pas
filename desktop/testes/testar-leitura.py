#!/usr/bin/env python3
"""Teste ponta a ponta do leitor: do PDF impresso ao CSV, conferido.

O que este teste cobra não é que o código roda — é que o leitor **acerta o que
está no papel e recusa o que não dá para ler**. Por isso ele não desenha cartão
nenhum: parte do PDF que o sistema web imprimiu (`gerar-amostras.mjs`), sujeita
esse PDF ao que um scanner de mesa faz com o papel — gira, desloca, borra,
chuvisca e recomprime —, e ao que acontece com ele até chegar ao vidro: uma
folha em cada seis sai assinada a caneta por cima de uma âncora, e outra em cada
seis perde um canto. Então cobra do leitor, marcação por marcação, o que o
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


# De quantas em quantas folhas uma sai assinada por cima da âncora. Na prova de
# exemplo isso cai nas folhas objetivas de três estudantes; na grande, em folhas
# de todo tipo.
ASSINADA_A_CADA = 6


def assinada(i: int) -> bool:
    return i % ASSINADA_A_CADA == ASSINADA_A_CADA - 1


def assinar(pagina: np.ndarray, ancora: dict, para_a_direita: bool) -> None:
    """Um traço de esferográfica que passa por cima da âncora do alto.

    Foi o que aconteceu num cartão de verdade: o estudante assinou no branco
    entre a faixa do título e as orientações, o traço atravessou o quadrado
    preto e chegou à faixa. Para quem procura mancha quadrada e solta, a âncora
    deixou de existir — e a folha inteira foi descartada, com 121 marcações
    perfeitamente legíveis. O risco aqui tem a largura de uma esferográfica
    (0,55 mm) e faz o mesmo caminho: sai da margem, cruza a âncora e sobe até a
    faixa do título.
    """
    px = DPI / 72
    sentido = 1 if para_a_direita else -1
    inicio = np.array([ancora["x"] - sentido * 10, ancora["y"] + 10])
    guia = np.array([ancora["x"] + sentido * 12, ancora["y"] - 2])
    fim = np.array([ancora["x"] + sentido * 58, ancora["y"] - 15])
    t = np.linspace(0, 1, 48)[:, None]
    curva = ((1 - t) ** 2 * inicio + 2 * t * (1 - t) * guia + t ** 2 * fim) * px
    cv2.polylines(pagina, [np.round(curva).astype(np.int32)], False, 35,
                  thickness=max(2, round(0.55 / 25.4 * DPI)), lineType=cv2.LINE_AA)


def sem_canto(i: int) -> bool:
    """Uma folha em cada seis perde um canto — e não é a mesma que sai assinada."""
    return i % ASSINADA_A_CADA == 2


def apagar_canto(pagina: np.ndarray, ancora: dict) -> None:
    """Um canto que não saiu na digitalização, e a âncora que foi com ele.

    Canto dobrado, rasgado, tapado pelo grampo: o papel está inteiro em todo o
    resto e o quadrado preto daquele canto simplesmente não aparece. Foi assim
    que um cartão de verdade ficou sem nota — três âncoras perfeitas, a faixa do
    rodapé intacta, todos os alvéolos legíveis, e a folha descartada porque o
    leitor só sabia alinhar com quatro. Aqui some o quadrado e uma folga em
    volta dele, sem tocar a faixa do rodapé: se ela fosse junto, a folha não
    teria como dizer de quem é, e recusá-la seria o certo.
    """
    px = DPI / 72
    x, y, folga = ancora["x"] * px, ancora["y"] * px, 8 * px
    pagina[int(y - folga):int(y + folga), int(x - folga):int(x + folga)] = 255


def digitalizar(pdf: Path, destino: Path, semente: int = 7,
                ancoras: list[dict] | None = None) -> int:
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
            # 0. e há quem assine o cartão — por cima da âncora. Ora a do alto
            #    à esquerda, ora a da direita.
            if ancoras and assinada(i):
                pagina = np.ascontiguousarray(pagina).copy()
                lado = (i // ASSINADA_A_CADA) % 2
                assinar(pagina, ancoras[lado], para_a_direita=lado == 0)
            #    E há folha que perde um canto — cada vez um dos quatro.
            if ancoras and sem_canto(i):
                pagina = np.ascontiguousarray(pagina).copy()
                apagar_canto(pagina, ancoras[(i // ASSINADA_A_CADA) % 4])
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
             "--gabarito", str(AMOSTRAS / "pacote.json"),
             "--entrada", str(entrada), "--saida", str(saida)],
            cwd=RAIZ / "desktop", capture_output=True, text=True)
        lidas = {(l["matricula"], int(l["item"])): l["resposta"]
                 for l in ler_csv(saida / "respostas.csv")}
        folhas = ler_csv(saida / "folhas.csv")
        conferir = ler_csv(saida / "respostas_conferir.csv")

    falhas = []
    # Nenhum destes cartões é de estudante do elenco: um tem matrícula boa de
    # quem não está na lista, dois têm matrícula fora do padrão. Nenhum vira
    # nota — e o leitor tem de DIZER isso, folha por folha, com o motivo. Era o
    # que faltava quando 49 folhas deram 46 notas e ninguém sabia onde estavam
    # as outras três.
    sem_nota = [f.get("sem_nota", "") for f in folhas if f.get("sem_nota")]
    fora_do_elenco = [m for m in sem_nota if "não está no elenco" in m]
    sem_matricula = [m for m in sem_nota if "cartão extra com a matrícula" in m]
    if len(fora_do_elenco) != len(validas):
        falhas.append(f"cartão extra: {len(validas)} matrícula(s) boa(s) de fora do elenco, e o "
                      f"rastro avisou de {len(fora_do_elenco)} folha(s) fora do elenco")
    if len(sem_matricula) != len(invalidas):
        falhas.append(f"cartão extra: {len(invalidas)} folha(s) com matrícula fora do padrão, e "
                      f"o rastro avisou de {len(sem_matricula)} folha(s) sem dono")
    # Quadro de matrícula vazio é “em branco”; `com_vao` é um algarismo pulado
    # no meio. Os dois já saíram com o mesmo nome, e o nome é o que manda quem
    # confere procurar a coisa certa no papel.
    for linha in conferir:
        if linha["motivo"] == "matricula_com_vao":
            falhas.append(f"cartão extra {linha['folha']}: saiu como `matricula_com_vao`, e "
                          "nenhuma amostra tem algarismo pulado")
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
        ancoras = json.loads((AMOSTRAS / "pacote.json").read_text(encoding="utf-8"))["layout"]["ancoras"]
        n = digitalizar(pdf, entrada, ancoras=ancoras)
        assinadas = {f"folha-{i + 1:03d}.jpg:1" for i in range(n) if assinada(i)}
        sem_cantos = {f"folha-{i + 1:03d}.jpg:1" for i in range(n) if sem_canto(i)}
        print(f"Digitalização simulada: {n} folha(s) tortas, borradas e em JPEG — "
              f"{len(assinadas)} delas assinadas a caneta por cima de uma âncora e "
              f"{len(sem_cantos)} sem um dos cantos.")

        processo = subprocess.run(
            [sys.executable, "-m", "src.leitor.cli", "ler",
             "--gabarito", str(AMOSTRAS / "pacote.json"),
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
                      + ", ".join(f["folha"] + (" (assinada por cima da âncora)"
                                                if f["folha"] in assinadas else
                                                " (sem um dos cantos)"
                                                if f["folha"] in sem_cantos else "")
                                  for f in descartadas))
    sem_id = [f for f in folhas if not f["tipo"]]
    if sem_id:
        falhas.append(f"{len(sem_id)} folha(s) sem identificação: "
                      + ", ".join(f["folha"] for f in sem_id))
    # E o aviso de folha sem nota não pode gritar à toa: aqui todo cartão é de
    # estudante do elenco, e aviso falso ensina a não ler o verdadeiro.
    sem_nota = [f for f in folhas if f.get("sem_nota")]
    if sem_nota:
        falhas.append(f"{len(sem_nota)} folha(s) avisada(s) como sem nota num lote em que todas "
                      "têm dono: " + ", ".join(f"{f['folha']} ({f['sem_nota']})" for f in sem_nota))

    # E a folha lida por três âncoras tem de ser DITA, com o canto certo: o que
    # estava no pedaço que não apareceu o leitor não viu, e alguém precisa olhar
    # o papel. O canto é o da folha em pé, e aqui todas entram deitadas na mesa.
    NOMES = ("do alto à esquerda", "do alto à direita", "de baixo à esquerda", "de baixo à direita")
    for i in range(n):
        if not sem_canto(i):
            continue
        frase = f"folha-{i + 1:03d}.jpg — faltou o canto {NOMES[(i // ASSINADA_A_CADA) % 4]}"
        if frase not in processo.stderr:
            falhas.append(f"folha-{i + 1:03d}.jpg perdeu o canto {NOMES[(i // ASSINADA_A_CADA) % 4]} "
                          "e o leitor não avisou (ou avisou de outro canto)")
    if processo.stderr.count("— faltou o canto ") != len(sem_cantos):
        falhas.append(f"{len(sem_cantos)} folha(s) sem canto, e o leitor avisou de "
                      f"{processo.stderr.count('— faltou o canto ')}")

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
