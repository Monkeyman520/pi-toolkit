"""Actual Windows ConPTY test. Optional test-only dependency: pywinpty==2.0.15."""
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
root = Path(tempfile.mkdtemp(prefix="pi-prompt-pipeline-tui-"))
agent = root / "agent"
plugin = root / "plugin"
agent.mkdir()
plugin.mkdir()
shutil.copytree(package / "extensions", plugin / "extensions")
manifest = json.loads((package / "package.json").read_text("utf8"))
manifest.pop("devDependencies", None)
(plugin / "package.json").write_text(json.dumps(manifest), "utf8")
fixture = root / "provider.ts"
shutil.copy(package / "tests" / "provider-fixture.ts", fixture)
config = agent / "prompt-pipeline.json"
config.write_text(json.dumps({"rules": [{"id": "request", "stage": "request",
    "targets": ["all"], "actions": [{"type": "append", "text": "\nrequest-tui"}]}]}), "utf8")
lifecycle = root / "lifecycle.jsonl"
wire = root / "wire.jsonl"
env = dict(os.environ, PI_CODING_AGENT_DIR=str(agent), PI_OFFLINE="1",
           PROMPT_PIPELINE_FIXTURE_LOG=str(wire),
           PROMPT_PIPELINE_FIXTURE_LIFECYCLE=str(lifecycle))
binary = os.environ.get("PI_BINARY") or shutil.which("pi.exe")
assert binary, "Pi executable required"
args = [binary, "--no-session", "--no-extensions", "--no-mcp", "--no-skills",
        "--no-prompt-templates", "--no-themes", "--no-context-files", "--offline", "--approve",
        "-e", str(fixture), "-e", str(plugin),
        "--provider", "antigravity", "--model", "gemini-fixture"]
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

def until(test, label, timeout=30):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        drain()
        if test():
            return
        time.sleep(0.05)
    raise AssertionError(label + "\n" + output[-10000:])

def saved(key, value):
    try:
        return json.loads(config.read_text("utf8")).get(key) == value
    except (OSError, ValueError):
        return False

def snapshots():
    files = list((agent / "prompt-exports").glob("*.json"))
    return [json.loads(path.read_text("utf8")) for path in files]

try:
    child = PtyProcess.spawn(subprocess.list2cmdline(args), env=env,
                             cwd=str(root), dimensions=(45, 140))
    threading.Thread(target=receive, daemon=True).start()
    until(lambda: lifecycle.exists(), "actual session started")
    time.sleep(0.8)
    child.write("/prompt-pipeline\r")
    until(lambda: "Antigravity compatibility preset" in output, "real settings panel opened")
    child.write("\r")
    until(lambda: saved("logging", "info"), "keyboard logging toggle persisted")
    time.sleep(0.3)
    child.write("\x1b[B\r")
    until(lambda: saved("antigravityCompat", True), "keyboard preset toggle persisted")
    child.write("\x1b")
    time.sleep(0.4)
    child.write("/prompt-pipeline config logging s")
    time.sleep(0.4)
    child.write("\t")
    time.sleep(0.4)
    child.write("\r")
    until(lambda: saved("logging", "silent"), "actual multi-token Tab completion saved")
    assert not wire.exists(), "settings commands must not send model requests"
    marker = len(output)
    child.write("/prompt-pipeline export request both\r")
    until(lambda: "Armed next request both" in output[marker:], "request capture armed")
    assert not wire.exists(), "arming must not send a request"
    child.write("fixture user\r")
    until(lambda: len(snapshots()) == 2, "request pair exported")
    pair = snapshots()
    assert pair[0]["captureId"] == pair[1]["captureId"]
    before = next(s for s in pair if s["side"] == "before")["parts"][0]["text"]
    after = next(s for s in pair if s["side"] == "after")["parts"][0]["text"]
    assert not before.endswith("request-tui") and after.endswith("request-tui")
    assert "You are a software engineering assistant." in before, "compatibility preset handles opaque project context"
    assert "<gitmoji> <type>(<scope>): <subject>" in before, "project examples preserved"
    until(lambda: wire.exists(), "fixture provider received transformed request")
    time.sleep(0.5)
    marker = len(output)
    child.write("/prompt-pipeline config\r")
    until(lambda: "Fixture Panel" in output[marker:], "loaded-only panel shown")
    child.write("\x1b[B" * 6 + "\r")
    until(lambda: "Fixture panel opened" in output[marker:], "loaded-panel switch worked")
    marker = len(output)
    child.write("/prompt-pipeline export agent both\r")
    until(lambda: "Armed next agent both" in output[marker:], "pending capture before reload")
    child.write("/reload\r")
    until(lambda: any(row.get("reason") == "reload" for row in
                     map(json.loads, lifecycle.read_text("utf8").splitlines())), "actual reload")
    time.sleep(0.4)
    marker = len(output)
    child.write("/prompt-pipeline status\r")
    until(lambda: "pending=none" in output[marker:], "reload cleared reservation")
    assert saved("logging", "silent") and saved("antigravityCompat", True)
    assert "Failed to load extension" not in output
    child.write("\x03")
    time.sleep(0.3)
    child.write("\x03")
    until(lambda: not child.isalive(), "orderly exit", 15)
    print("PASS: isolated actual Windows ConPTY; SettingsList edits/persistence; Tab completion; one-shot request pair/no extra requests; loaded-panel switch; reload clears reservation; exit")
finally:
    if child and child.isalive():
        child.terminate(force=True)
    shutil.rmtree(root, ignore_errors=True)
