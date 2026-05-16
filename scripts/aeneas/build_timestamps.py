#!/usr/bin/env python3
"""
Pipeline completo: gera timestamps do culto mensal via aeneas (Docker).

Workflow:
  1. roda prepare_fragments.py
  2. roda aeneas via Docker
  3. valida resultado (nº fragmentos == nº parágrafos, durações sãs)

Pré-requisitos:
  - Docker Desktop rodando
  - assets/audio/culto_mensal_atual.mp3 e data/culto_mensal_atual.md presentes

Saída: data/culto_mensal_atual.timestamps.json
"""
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
AUDIO = "assets/audio/culto_mensal_atual.mp3"
FRAGMENTS = "data/culto_mensal_atual.fragments.txt"
OUT = "data/culto_mensal_atual.timestamps.json"
DOCKER_IMAGE = "readbeyond/aeneas"

MIN_DURATION = 0.3   # < isso é suspeito (fragmento "engolido")
MAX_DURATION = 90.0  # > isso costuma ser desalinhamento grave


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    print(f"$ {' '.join(cmd)}")
    return subprocess.run(cmd, check=True, **kw)


def step_prepare() -> int:
    print("\n[1/3] preparando fragments.txt …")
    run([sys.executable, str(REPO / "scripts" / "aeneas" / "prepare_fragments.py")])
    n = sum(1 for _ in (REPO / FRAGMENTS).open(encoding="utf-8"))
    return n


def step_aeneas() -> None:
    print(f"\n[2/3] rodando aeneas via Docker ({DOCKER_IMAGE}) …")
    cwd_posix = REPO.as_posix()
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{cwd_posix}:/work",
        "-w", "/work",
        DOCKER_IMAGE,
        "python", "-m", "aeneas.tools.execute_task",
        AUDIO,
        FRAGMENTS,
        "task_language=por|is_text_type=plain|os_task_file_format=json",
        OUT,
    ]
    try:
        run(cmd)
    except FileNotFoundError:
        print(
            "ERRO: comando 'docker' não encontrado. Instale Docker Desktop:\n"
            "  https://www.docker.com/products/docker-desktop/",
            file=sys.stderr,
        )
        sys.exit(2)
    except subprocess.CalledProcessError as e:
        print(
            f"\nERRO: aeneas falhou (exit {e.returncode}).\n"
            f"Possíveis causas:\n"
            f"  - imagem '{DOCKER_IMAGE}' não pôde ser baixada (sem internet?)\n"
            f"  - áudio ou texto corrompido\n"
            f"  - tente uma imagem alternativa: xnoreq/aeneas",
            file=sys.stderr,
        )
        sys.exit(3)


def step_validate(expected_n: int) -> None:
    print("\n[3/3] validando timestamps …")
    out_path = REPO / OUT
    if not out_path.exists():
        print(f"ERRO: {OUT} não foi gerado", file=sys.stderr)
        sys.exit(4)

    data = json.loads(out_path.read_text(encoding="utf-8"))
    frags = data.get("fragments", [])

    if len(frags) != expected_n:
        print(
            f"AVISO: esperava {expected_n} fragmentos, recebi {len(frags)}",
            file=sys.stderr,
        )

    suspicious = []
    for i, f in enumerate(frags):
        begin = float(f["begin"])
        end = float(f["end"])
        dur = end - begin
        if dur < MIN_DURATION or dur > MAX_DURATION:
            preview = (f.get("lines", [""])[0] or "")[:60]
            suspicious.append((i, dur, preview))

    if suspicious:
        print(f"\nAVISO: {len(suspicious)} fragmento(s) com duração suspeita:")
        for i, dur, preview in suspicious[:10]:
            print(f"  #{i:03d}  {dur:6.2f}s  '{preview}…'")
        if len(suspicious) > 10:
            print(f"  … (+{len(suspicious) - 10})")
        print(
            "\nIsso pode indicar desalinhamento (narrador pulou/repetiu um trecho)\n"
            "ou TTS-engine tropeçou. Inspecione os fragmentos no front."
        )
    else:
        print(f"OK: {len(frags)} fragmentos, todas as durações dentro do esperado.")

    print(f"\n=> {OUT}")


def main() -> int:
    if not (REPO / AUDIO).exists():
        print(f"ERRO: {AUDIO} não encontrado", file=sys.stderr)
        return 1
    if not (REPO / "data" / "culto_mensal_atual.md").exists():
        print("ERRO: data/culto_mensal_atual.md não encontrado", file=sys.stderr)
        return 1

    n = step_prepare()
    step_aeneas()
    step_validate(n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
