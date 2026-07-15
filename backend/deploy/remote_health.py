#!/usr/bin/env python3
import os, sys, time
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
    _, stdout, stderr = ssh.exec_command(cmd)
    stdout.channel.recv_exit_status()
    return (stdout.read() + stderr.read()).decode("utf-8", "replace")


env = parse_env(ENV_PATH)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(env["SERVER_NAME"], username=env["SERVER_USER"], password=env["SERVER_PASSWORD"], timeout=30, look_for_keys=False, allow_agent=False)
time.sleep(5)
print(run(ssh, "curl -sf http://localhost:8080/health"))
print(run(ssh, f"cd {PROJECT} && docker compose logs api --tail 20"))
ssh.close()
