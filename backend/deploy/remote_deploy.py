#!/usr/bin/env python3
"""One-shot remote deploy via SSH (reads SERVER_* from backend/.env)."""
import os
import re
import sys

import paramiko

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ENV_PATH = os.path.join(ROOT, "backend", ".env")

REMOTE_PATHS = [
    "~/backend/flipo5",
    "/root/backend/flipo5",
    "~/flipo5",
    "/root/flipo5",
]


def parse_env(path: str) -> dict[str, str]:
    out: dict[str, str] = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if ":" in line and not line.startswith("http"):
                k, v = line.split(":", 1)
                out[k.strip()] = v.strip()
            elif "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def run(ssh: paramiko.SSHClient, cmd: str) -> tuple[int, str, str]:
    print(f"\n$ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out:
        print(out.rstrip())
    if err:
        print(err.rstrip(), file=sys.stderr)
    return code, out, err


def main() -> int:
    env = parse_env(ENV_PATH)
    host = env.get("SERVER_NAME") or env.get("SERVER_HOST")
    user = env.get("SERVER_USER", "root")
    password = env.get("SERVER_PASSWORD")
    if not host or not password:
        print("Missing SERVER_NAME or SERVER_PASSWORD in backend/.env", file=sys.stderr)
        return 1

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {user}@{host} ...")
    ssh.connect(host, username=user, password=password, timeout=30, look_for_keys=False, allow_agent=False)

    code, out, _ = run(ssh, "hostname && whoami && docker --version")
    if code != 0:
        return code

    project = None
    for p in REMOTE_PATHS:
        code, out, _ = run(ssh, f"test -d {p}/.git && echo {p}")
        if code == 0 and out.strip():
            project = out.strip().splitlines()[-1]
            break
    if not project:
        print("Could not find git repo on server. Tried:", REMOTE_PATHS, file=sys.stderr)
        return 1
    print(f"Project path: {project}")

    env_updates = r"""
cd {project} && \
if grep -q '^REPLICATE_MODEL_TEXT=' .env; then sed -i 's|^REPLICATE_MODEL_TEXT=.*|REPLICATE_MODEL_TEXT=anthropic/claude-fable-5|' .env; else echo 'REPLICATE_MODEL_TEXT=anthropic/claude-fable-5' >> .env; fi && \
if grep -q '^REPLICATE_MODEL_IMAGE=' .env; then sed -i 's|^REPLICATE_MODEL_IMAGE=.*|REPLICATE_MODEL_IMAGE=openai/gpt-image-2|' .env; else echo 'REPLICATE_MODEL_IMAGE=openai/gpt-image-2' >> .env; fi && \
if grep -q '^REPLICATE_MODEL_IMAGE_4K=' .env; then sed -i 's|^REPLICATE_MODEL_IMAGE_4K=.*|REPLICATE_MODEL_IMAGE_4K=bytedance/seedream-4.5|' .env; else echo 'REPLICATE_MODEL_IMAGE_4K=bytedance/seedream-4.5' >> .env; fi && \
grep -E 'REPLICATE_MODEL_(TEXT|IMAGE|IMAGE_4K)=' .env
""".format(project=project)
    code, _, _ = run(ssh, env_updates)
    if code != 0:
        return code

    deploy = f"cd {project} && git pull && docker compose build api && docker compose up -d"
    code, _, _ = run(ssh, deploy)
    if code != 0:
        return code

    run(ssh, f"cd {project} && docker compose ps")
    run(ssh, f"cd {project} && docker compose logs api --tail 25")
    run(ssh, "curl -sf http://localhost:8080/health || curl -sf http://127.0.0.1:8080/health")

    ssh.close()
    print("\nDeploy finished.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
