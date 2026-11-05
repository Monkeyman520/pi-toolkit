"""Actual Windows ConPTY keyboard smoke; optional test-only dependency: pywinpty."""
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
root = Path(tempfile.mkdtemp(prefix="pi-aco-tui-"))
agent = root / "agent"
agent.mkdir()
config = agent / "pi-context-aco.json"
env = dict(os.environ, PI_CODING_AGENT_DIR=str(agent), PI_OFFLINE="1",
           ACO_REQUESTS=str(root / "requests.jsonl"),
           ACO_LIFECYCLE=str(root / "lifecycle.jsonl"))
binary = os.environ.get("PI_BINARY") or shutil.which("pi.exe")
assert binary, "Pi executable required"
args = [binary, "--no-session", "--no-extensions", "--no-mcp", "--no-skills",
        "--no-prompt-templates", "--no-themes", "--no-context-files", "--offline", "--approve",
        "-e", str(package), "-e", str(package / "tests" / "fixture.js"),
        "--provider", "aco-fixture", "--model", "test0"]
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

def until(test, label, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        drain()
        if test():
            return
        time.sleep(0.05)
    raise AssertionError(label + "\n" + output[-8000:])

def saved(key, value):
    try:
        return json.loads(config.read_text("utf8")).get(key) == value
    except (OSError, ValueError):
        return False

def reloaded():
    try:
        return any(row.get("event") == "start" and row.get("reason") == "reload"
                   for row in map(json.loads, (root / "lifecycle.jsonl").read_text("utf8").splitlines()))
    except (OSError, ValueError):
        return False

try:
    child = PtyProcess.spawn(subprocess.list2cmdline(args), env=env,
                             cwd=str(root), dimensions=(45, 140))
    threading.Thread(target=receive, daemon=True).start()
    until(lambda: "ACO" in output, "monitor status rendered")
    child.write("/aco\r")
    until(lambda: "V1 Status & Settings" in output, "real SettingsList opened")
    child.write("\r")
    until(lambda: saved("enabled", False), "keyboard toggle persisted false")
    child.write("\x1b[B\x1b[B\r")
    until(lambda: saved("horizonTurns", 5), "keyboard forecast setting persisted")
    child.write("\x1b")
    time.sleep(0.4)
    child.write("/aco config enabled tr")
    time.sleep(0.3)
    child.write("\t")
    time.sleep(0.3)
    child.write("\r")
    until(lambda: saved("enabled", True), "full-prefix Tab completion executed config command")
    child.write('/aco declare {"taskId":"tui-task","active":true,"phase":"review","remainingSteps":1,"estimatedFutureTokens":1000}\r')
    until(lambda: '"recorded":true' in output, "task declaration acknowledged")
    marker = len(output)
    child.write("/aco tasks\r")
    until(lambda: '"activeTaskId":"tui-task"' in output[marker:], "task state visible in actual terminal")
    marker = len(output)
    child.write("/aco recommend\r")
    until(lambda: '"executed":false' in output[marker:], "recommendation is non-executing")
    child.write("/aco config\r")
    time.sleep(0.5)
    child.write("\x1b[B" * len(json.loads(config.read_text("utf8"))) + "\r")
    until(lambda: "Fixture Panel" in output, "only other loaded panel offered")
    child.write("\r")
    until(lambda: "Fixture panel alive" in output, "loaded-panel switch worked")
    child.write("/reload\r")
    until(reloaded, "actual session_start reload observed")
    child.write("/aco\r")
    time.sleep(0.5)
    drain()
    assert saved("horizonTurns", 5) and saved("enabled", True), "reload kept settings"
    assert "Failed to load extension" not in output, "no loader failure"
    child.write("\x1b")
    time.sleep(0.3)
    child.write("\x03")
    time.sleep(0.2)
    child.write("\x03")
    until(lambda: not child.isalive(), "orderly Pi exit", 10)
    print("PASS: actual ConPTY TUI; SettingsList keyboard edits/persistence; full-prefix Tab completion; loaded-panel switch; reload; clean exit")
finally:
    if child and child.isalive():
        child.terminate(force=True)
    shutil.rmtree(root, ignore_errors=True)
