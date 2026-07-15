#!/usr/bin/env python3
"""Quick Hetzner server health check."""
import os
import sys
import paramiko

ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")
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
    return out


def run(ssh, cmd):
    _, stdout, stderr = ssh.exec_command(cmd, timeout=60)
    code = stdout.channel.recv_exit_status()
    text = (stdout.read() + stderr.read()).decode("utf-8", "replace")
    return code, text


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

    checks = [
        ("hostname", "hostname && uptime"),
        ("disk", "df -h / | tail -1"),
        ("memory", "free -h | head -2"),
        ("docker_ps", "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"),
        ("compose_ps", f"cd {PROJECT} && docker compose ps"),
        ("health_local", "curl -sf -m 5 http://127.0.0.1:8080/health || echo FAIL"),
        ("health_public", "curl -sf -m 8 https://api.flipo5.com/health || echo FAIL"),
        ("git_head", f"cd {PROJECT} && git log -1 --oneline"),
        ("env_models", f"cd {PROJECT} && grep -E '^REPLICATE_MODEL_(TEXT|IMAGE|IMAGE_4K)=' .env"),
        ("api_logs", f"cd {PROJECT} && docker compose logs api --tail 12 2>&1"),
        ("redis_ping", "docker exec flipo5-redis redis-cli ping 2>/dev/null || echo FAIL"),
        ("restarting", "docker ps -a --filter 'status=restarting' --format '{{.Names}}'"),
    ]

    results = {}
    for name, cmd in checks:
        code, text = run(ssh, cmd)
        results[name] = {"code": code, "text": text.strip()}

    ssh.close()

    # Print summary for agent
    for name, r in results.items():
        print(f"=== {name} (exit {r['code']}) ===")
        print(r["text"])
        print()

    # Verdict
    ok = (
        "ok" in results["health_local"]["text"].lower()
        and results["restarting"]["text"] == ""
        and "flipo5-api" in results["docker_ps"]["text"]
        and "Up" in results["compose_ps"]["text"]
    )
    print("VERDICT:", "OK" if ok else "ISSUES")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
