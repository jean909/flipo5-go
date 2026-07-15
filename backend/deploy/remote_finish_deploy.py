#!/usr/bin/env python3
import os, sys
import paramiko

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ENV_PATH = os.path.join(ROOT, "backend", ".env")
PROJECT = "/root/backend/flipo5"


def parse_env(path):
    out = {}
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


def run(ssh, cmd):
    print(f"\n$ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd)
    code = stdout.channel.recv_exit_status()
    text = (stdout.read() + stderr.read()).decode("utf-8", "replace")
    sys.stdout.buffer.write(text.encode("utf-8", "replace"))
    return code


def main():
    env = parse_env(ENV_PATH)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        env["SERVER_NAME"],
        username=env.get("SERVER_USER", "root"),
        password=env["SERVER_PASSWORD"],
        timeout=30,
        look_for_keys=False,
        allow_agent=False,
    )

    run(ssh, f"cd {PROJECT} && git pull")
    code = run(ssh, f"cd {PROJECT} && docker compose build api")
    if code != 0:
        print(f"\nbuild exit {code}", file=sys.stderr)
    run(ssh, f"cd {PROJECT} && docker compose up -d")
    run(ssh, f"cd {PROJECT} && git log -1 --oneline")
    run(ssh, f"cd {PROJECT} && grep REPLICATE_MODEL_TEXT .env && grep REPLICATE_MODEL_IMAGE .env && grep REPLICATE_MODEL_IMAGE_4K .env")
    run(ssh, f"cd {PROJECT} && docker compose ps")
    run(ssh, "curl -sf http://localhost:8080/health || echo HEALTH_FAIL")
    run(ssh, f"cd {PROJECT} && docker compose logs api --tail 15")
    ssh.close()


if __name__ == "__main__":
    main()
