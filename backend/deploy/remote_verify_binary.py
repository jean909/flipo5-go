#!/usr/bin/env python3
import os
import paramiko

ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")

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

env = parse_env(ENV_PATH)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(env["SERVER_NAME"], username=env["SERVER_USER"], password=env["SERVER_PASSWORD"], timeout=30, look_for_keys=False, allow_agent=False)
cmds = [
    "docker exec flipo5-api strings /app/api | grep -E 'claude-fable|gpt-image-2|textmodel' | head",
    "cd /root/backend/flipo5 && git log -1 --oneline && ls backend/internal/textmodel 2>/dev/null || ls internal/textmodel 2>/dev/null",
]
for c in cmds:
    print("$", c)
    _, o, e = ssh.exec_command(c)
    o.channel.recv_exit_status()
    print((o.read()+e.read()).decode())
ssh.close()
