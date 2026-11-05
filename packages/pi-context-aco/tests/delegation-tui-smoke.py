"""Actual ConPTY V4 confirmation/denial; test-only Python 3.12 + pywinpty 3.1.2."""
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import tempfile
import threading
import time
from winpty import PtyProcess

package = Path(__file__).resolve().parent.parent
root = Path(tempfile.mkdtemp(prefix="pi-aco-v4-tui-"))
agent = root / "agent"
agent.mkdir()
probe_path = root / "probe.json"
requests = root / "requests.jsonl"
env = dict(os.environ, PI_CODING_AGENT_DIR=str(agent), PI_OFFLINE="1",
           ACO_REQUESTS=str(requests), ACO_PROBE=str(probe_path))
binary = os.environ.get("PI_BINARY") or shutil.which("pi.exe")
assert binary, "Pi executable required"
args = [binary, "--no-extensions", "--no-mcp", "--no-skills", "--no-prompt-templates",
        "--no-themes", "--no-context-files", "--offline", "--approve",
        "-e", str(package), "-e", str(package / "tests" / "delegation-fixture.js"),
        "--provider", "delegation-fixture", "--model", "test"]
child = None
chunks = queue.Queue()
output = ""

def receive():
    try:
        while child.isalive():
            chunks.put(child.read(65536))
    except (EOFError, OSError):
        pass

def drain():
    global output
    while True:
        try:
            output += chunks.get_nowait()
        except queue.Empty:
            return

def until(test, label, timeout=25):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        drain()
        if test():
            return
        time.sleep(0.05)
    raise AssertionError(label + "\n" + output[-10000:])

def probe():
    try:
        return json.loads(probe_path.read_text("utf8"))
    except (OSError, ValueError):
        return {"branch": []}

def send(text):
    child.write(text + "\r")

def query_probe():
    send("/delegation-probe")

try:
    child = PtyProcess.spawn(subprocess.list2cmdline(args), env=env, cwd=str(root), dimensions=(50, 220))
    threading.Thread(target=receive, daemon=True).start()
    until(lambda: "ACO" in output, "ACO loaded")
    send("PARENT_ONLY_HISTORY")
    until(lambda: any(e.get("message", {}).get("role") == "assistant" for e in probe()["branch"]), "parent ready")
    for task_id in ["parent", "child"]:
        marker = len(output)
        send("/aco declare " + json.dumps({"taskId": task_id, "active": task_id == "parent",
              "delegatable": True, "writeConflictRisk": 0, "writeResources": []}))
        until(lambda: '"recorded":true' in output[marker:], "declared " + task_id)
    send("/aco config mode delegate")
    until(lambda: (agent / "pi-context-aco.json").exists() and json.loads((agent / "pi-context-aco.json").read_text("utf8")).get("mode") == "delegate", "mode saved")
    contract = {"tasks": [{"taskId": "child", "goal": "inspect", "constraints": ["read only"],
                "acceptance": ["return analysis"], "resources": [], "evidence": []}]}
    command = "/aco delegate " + json.dumps(contract)
    marker = len(output)
    send(command)
    until(lambda: "ACO delegation" in output[marker:], "default confirmation rendered")
    child.write("\x1b")
    until(lambda: '"status":"denied"' in output[marker:], "Escape denied")
    assert not any(json.loads(line)["child"] for line in requests.read_text("utf8").splitlines())
    marker = len(output)
    send(command)
    until(lambda: "ACO delegation" in output[marker:], "second confirmation rendered")
    child.write("\r")
    until(lambda: '"status":"returned"' in output[marker:], "confirmed child returned")
    query_probe()
    until(lambda: any(e.get("customType") == "aco-delegation-result" for e in probe()["branch"]), "durable child outcome")
    outcomes = [e["data"] for e in probe()["branch"] if e.get("customType") == "aco-delegation-result"]
    assert outcomes[0]["status"] == "needs-verification"
    children = [json.loads(line) for line in requests.read_text("utf8").splitlines() if json.loads(line)["child"]]
    assert len(children) == 1
    assert "PARENT_ONLY_HISTORY" not in json.dumps(children)
    child.write("\x03")
    time.sleep(0.2)
    child.write("\x03")
    until(lambda: not child.isalive(), "orderly exit", 10)
    print("PASS actual ConPTY V4: default confirmation, Escape denial/no launch, confirmed isolated child remains parent-unverified")
finally:
    if child and child.isalive():
        child.terminate(force=True)
    shutil.rmtree(root, ignore_errors=True)
