# Structured results retained as Markdown

The grimoire's existing ignore policy retains Markdown, not PNG/JSON/JSONL files. This file preserves the essential structured evidence without changing ignore rules or staging files. Screenshots and raw supporting files remain local, Git-ignored artifacts in this directory.

## Native Windows Terminal results

```json
{
  "originalUnchanged": true,
  "atSourceUnchanged": true,
  "originalSha256": "fcda09fef5f336f21531ae628f45a3ec28f5a5f11a5594950e4dab59160acba5",
  "atSourceSha256": "1bfe0cd9f39fb071a3a4d14869b8dc5db6dbb39e91d931df9d058f476bef5228",
  "agentStarts": 0,
  "sourceSession": "01a1c44c-5519-7466-9105-726680f73ac4",
  "navigate": {
    "event": "snapshot",
    "time": 1794297397116,
    "sessionId": "01a1c44c-5519-7466-9105-726680f73ac4",
    "file": "C:\\Users\\ADMINI~1\\AppData\\Local\\Temp\\stree-win-qa-ewFPyj\\sessions\\2026-11-10T07-11-39-295Z_01a1c44c-5519-7466-9105-726680f73ac4.jsonl",
    "leaf": "1e60596d",
    "editor": "QA BEFORE prompt restored",
    "label": "fQA orenamed labelw",
    "entries": [
      {
        "id": "3e2b450e",
        "parentId": null,
        "type": "message",
        "role": "user"
      },
      {
        "id": "1e60596d",
        "parentId": "3e2b450e",
        "type": "message",
        "role": "assistant"
      },
      {
        "id": "8e9aa573",
        "parentId": "1e60596d",
        "type": "message",
        "role": "user"
      },
      {
        "id": "82bab8ae",
        "parentId": "8e9aa573",
        "type": "message",
        "role": "assistant"
      },
      {
        "id": "8df3a214",
        "parentId": "82bab8ae",
        "type": "message",
        "role": "user"
      },
      {
        "id": "5c636a75",
        "parentId": "3e2b450e",
        "type": "message",
        "role": "user"
      },
      {
        "id": "b5e2dbc5",
        "parentId": "5c636a75",
        "type": "message",
        "role": "assistant"
      },
      {
        "id": "01a9310b",
        "parentId": "8df3a214",
        "type": "label"
      },
      {
        "id": "0e79e0f2",
        "parentId": "01a9310b",
        "type": "thinking_level_change"
      },
      {
        "id": "9e640555",
        "parentId": "0e79e0f2",
        "type": "label"
      }
    ]
  },
  "forkAt": {
    "event": "start",
    "time": 1794297575520,
    "sessionId": "01a1c478-3237-72ab-867a-6e1a7a748e0b",
    "file": "C:\\Users\\ADMINI~1\\AppData\\Local\\Temp\\stree-win-qa-ewFPyj\\sessions\\2026-11-10T07-59-33-943Z_01a1c478-3237-72ab-867a-6e1a7a748e0b.jsonl",
    "leaf": "549869c0",
    "editor": "",
    "label": "fQA orenamed labelw",
    "entries": [
      {
        "id": "3e2b450e",
        "parentId": null,
        "type": "message",
        "role": "user"
      },
      {
        "id": "1e60596d",
        "parentId": "3e2b450e",
        "type": "message",
        "role": "assistant"
      },
      {
        "id": "8e9aa573",
        "parentId": "1e60596d",
        "type": "message",
        "role": "user"
      },
      {
        "id": "ac4800bc",
        "parentId": "8e9aa573",
        "type": "label"
      },
      {
        "id": "549869c0",
        "parentId": "ac4800bc",
        "type": "thinking_level_change"
      }
    ]
  },
  "forkBefore": {
    "event": "snapshot",
    "time": 1794297794135,
    "sessionId": "01a1c47a-d541-72ab-867a-6e1d3d912114",
    "file": "C:\\Users\\ADMINI~1\\AppData\\Local\\Temp\\stree-win-qa-ewFPyj\\sessions\\2026-11-10T08-02-26-754Z_01a1c47a-d541-72ab-867a-6e1d3d912114.jsonl",
    "leaf": "4cc12299",
    "editor": "QA BEFORE prompt restored",
    "label": "fQA orenamed labelw",
    "entries": [
      {
        "id": "3e2b450e",
        "parentId": null,
        "type": "message",
        "role": "user"
      },
      {
        "id": "1e60596d",
        "parentId": "3e2b450e",
        "type": "message",
        "role": "assistant"
      },
      {
        "id": "2cc4807d",
        "parentId": "1e60596d",
        "type": "label"
      },
      {
        "id": "4cc12299",
        "parentId": "2cc4807d",
        "type": "thinking_level_change"
      }
    ]
  }
}
```

## Full-suite contention measurement

```json
{
  "environment": {
    "platform": "win32",
    "arch": "x64",
    "cpu": "11th Gen Intel(R) Core(TM) i7-1165G7 @ 2.80GHz",
    "node": "v26.13.0",
    "terminal": "headless 120-column injected TUI boundary; not a physical terminal"
  },
  "method": "index20; movement20 warmup+100 samples; ready-setImmediate queued native-history movement20 warmup+100 enqueue-to-render samples with live estimate timers; branch50; cold+warm search20 (debounce=0, Enter flush); modeled first open10; actual stree command+real SessionManager+headless first render10 (fresh config/view IO); cache1000; 5k/25MB snapshot/render3; P95=floor(n*.95)",
  "scores": {
    "index5k": {
      "p95Ms": 91.4997999999996,
      "targetMs": 200,
      "met": true,
      "samples": 20
    },
    "movement5k": {
      "p95Ms": 10.000599999999395,
      "targetMs": 16,
      "met": true,
      "samples": 100
    },
    "branch5k": {
      "p95Ms": 39.48860000000059,
      "targetMs": 20,
      "met": false,
      "samples": 50
    },
    "search5kLinear": {
      "p95Ms": 144.0521000000008,
      "targetMs": 100,
      "met": false,
      "samples": 20
    },
    "firstOpen10kHeadless": {
      "p95Ms": 336.95969999999943,
      "targetMs": 500,
      "met": true,
      "samples": 10
    },
    "cacheHit": {
      "p95Ms": 0.05580000000009022,
      "targetMs": 5,
      "met": true,
      "samples": 1000
    },
    "snapshotRender5k25MBHeadless": {
      "p95Ms": 608.7161999999989,
      "targetMs": 500,
      "met": false,
      "samples": 3
    },
    "assembledCommandFirstOpen10kHeadless": {
      "p95Ms": 203.02649999999994,
      "targetMs": 500,
      "met": true,
      "samples": 10
    },
    "queuedMovement5kWithPendingEstimates": {
      "p95Ms": 19.11869999999908,
      "targetMs": 16,
      "met": false,
      "samples": 100
    }
  },
  "targetsMet": false
}
```

## Isolated measurement

```json
{
  "environment": {
    "platform": "win32",
    "arch": "x64",
    "cpu": "11th Gen Intel(R) Core(TM) i7-1165G7 @ 2.80GHz",
    "node": "v26.13.0",
    "terminal": "headless 120-column injected TUI boundary; not a physical terminal"
  },
  "method": "index20; movement20 warmup+100 samples; ready-setImmediate queued native-history movement20 warmup+100 enqueue-to-render samples with live estimate timers; branch50; cold+warm search20 (debounce=0, Enter flush); modeled first open10; actual stree command+real SessionManager+headless first render10 (fresh config/view IO); cache1000; 5k/25MB snapshot/render3; P95=floor(n*.95)",
  "scores": {
    "index5k": {
      "p95Ms": 29.575199999999313,
      "targetMs": 200,
      "met": true,
      "samples": 20
    },
    "movement5k": {
      "p95Ms": 3.920100000000275,
      "targetMs": 16,
      "met": true,
      "samples": 100
    },
    "branch5k": {
      "p95Ms": 6.183399999999892,
      "targetMs": 20,
      "met": true,
      "samples": 50
    },
    "search5kLinear": {
      "p95Ms": 84.32520000000022,
      "targetMs": 100,
      "met": true,
      "samples": 20
    },
    "firstOpen10kHeadless": {
      "p95Ms": 110.71759999999995,
      "targetMs": 500,
      "met": true,
      "samples": 10
    },
    "cacheHit": {
      "p95Ms": 0.030899999999746797,
      "targetMs": 5,
      "met": true,
      "samples": 1000
    },
    "snapshotRender5k25MBHeadless": {
      "p95Ms": 280.95250000000124,
      "targetMs": 500,
      "met": true,
      "samples": 3
    },
    "assembledCommandFirstOpen10kHeadless": {
      "p95Ms": 98.33930000000146,
      "targetMs": 500,
      "met": true,
      "samples": 10
    },
    "queuedMovement5kWithPendingEstimates": {
      "p95Ms": 8.810900000000402,
      "targetMs": 16,
      "met": true,
      "samples": 100
    }
  },
  "targetsMet": true
}
```

## Direct source reproductions

```json
{
  "snapshot": "f801a259d771994e0001400504f94af220ced077",
  "label": {
    "rawLabelPayload": "native-label-payload",
    "ownedLabelPayload": null,
    "metadataToggle": false,
    "labelVisible": true,
    "rootBookmark": "resolved-root-bookmark"
  },
  "help": {
    "terminalRows": 12,
    "renderedHelpRows": 79,
    "pageDownChangesOutput": false
  }
}
```
