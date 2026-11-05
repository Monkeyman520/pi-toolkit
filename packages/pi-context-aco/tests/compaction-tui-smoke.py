"""Actual ConPTY V3 confirmation/denial. Test-only Python 3.12 + pywinpty 3.1.2."""
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
root = Path(tempfile.mkdtemp(prefix="pi-aco-v3-tui-"))
agent = root / "agent"
agent.mkdir()
(agent / "settings.json").write_text(json.dumps({"compaction": {"enabled": False, "keepRecentTokens": 100, "reserveTokens": 4096}}), "utf8")
probe_path = root / "probe.json"
env = dict(os.environ, PI_CODING_AGENT_DIR=str(agent), PI_OFFLINE="1",
           ACO_REQUESTS=str(root / "requests.jsonl"), ACO_PROBE=str(probe_path),
           ACO_FAULT=str(root / "fault.txt"), ACO_FAULT_ROOT=str(root))
binary = os.environ.get("PI_BINARY") or shutil.which("pi.exe")
assert binary, "Pi executable required"
args = [binary, "--no-extensions", "--no-mcp", "--no-skills", "--no-prompt-templates",
        "--no-themes", "--no-context-files", "--offline", "--approve",
        "-e", str(package), "-e", str(package / "tests" / "evidence-fixture.js"),
        "-e", str(package / "tests" / "compaction-fixture.js"),
        "--provider", "evidence-fixture", "--model", "test"]
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
        return {"branch": [], "sourceIds": []}

def send(text):
    child.write(text + "\r")

def action(command, approve):
    marker = len(output)
    send(command)
    until(lambda: "ACO context change" in output[marker:], "actual confirmation dialog rendered")
    child.write("\r" if approve else "\x1b")
    return marker

try:
    child = PtyProcess.spawn(subprocess.list2cmdline(args), env=env, cwd=str(root), dimensions=(50, 180))
    threading.Thread(target=receive, daemon=True).start()
    until(lambda: "ACO" in output, "monitor loaded")
    send("V3_RESEARCH")
    until(lambda: any(e.get("message", {}).get("role") == "toolResult" for e in probe()["branch"]), "controlled research completed")
    source = next(e["id"] for e in probe()["branch"] if e.get("message", {}).get("role") == "toolResult")
    send('/aco declare ' + json.dumps({"taskId": "tui-v3", "active": True}))
    until(lambda: '"recorded":true' in output, "task declared")
    marker = len(output)
    send('/aco checkpoint ' + json.dumps({"sourceEntryIds": [source]}))
    until(lambda: '"recoverable":true' in output[marker:], "checkpoint verified")
    send("/aco config mode compact")
    until(lambda: (agent / "pi-context-aco.json").exists() and json.loads((agent / "pi-context-aco.json").read_text("utf8")).get("mode") == "compact", "V3 mode saved")
    local = "/aco summarize " + json.dumps({"sourceEntryIds": [source]})
    marker = action(local, False)
    until(lambda: '"status":"denied"' in output[marker:], "denial leaves local proposal unapplied")
    assert not any(e["type"] == "context_edit" for e in probe()["branch"])
    marker = action(local, True)
    until(lambda: '"status":"scheduled"' in output[marker:], "confirmed local proposal scheduled")
    send("Apply confirmed local summary")
    until(lambda: any(e["type"] == "context_edit" and e.get("targetId") == source for e in probe()["branch"]), "confirmed local edit committed")
    marker = len(output)
    send("/aco restore " + source)
    until(lambda: '"scheduled":true' in output[marker:], "restore scheduled")
    edits = sum(e["type"] == "context_edit" for e in probe()["branch"])
    send("Apply verified restoration")
    until(lambda: sum(e["type"] == "context_edit" for e in probe()["branch"]) > edits, "restoration committed")
    marker = action("/aco compact", False)
    until(lambda: '"status":"denied"' in output[marker:], "native default denial observed")
    marker = len(output)
    send("/aco checkpoint " + json.dumps({"sourceEntryIds": probe()["sourceIds"]}))
    until(lambda: '"recoverable":true' in output[marker:], "native scope checkpoint verified")
    action("/aco compact", True)
    until(lambda: any(e["type"] == "compaction" for e in probe()["branch"]), "confirmed native prefix actually completed")
    assert any(e["type"] == "custom" and e.get("customType") == "aco-native-outcome" and e["data"].get("status") == "committed" for e in probe()["branch"])
    child.write("\x03")
    time.sleep(0.2)
    child.write("\x03")
    until(lambda: not child.isalive(), "orderly Pi exit", 10)
    print("PASS actual ConPTY V3: default local/native confirmation; Escape denial with no context effects; confirmed local commit/restoration and native prefix completion")
finally:
    if child and child.isalive():
        child.terminate(force=True)
    shutil.rmtree(root, ignore_errors=True)
