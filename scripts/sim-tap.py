"""Tap something in a booted iOS simulator, found by its accessibility label.

Coordinates would be a guess that goes stale the moment the layout moves; a
label is what the element calls itself. Used by .github/workflows/ios-sim.yml
to start a round and put the caret in the clue field, so the keyboard can be
photographed doing whatever it does.

    python3 scripts/sim-tap.py <udid> "one-word clue"
"""

import json
import subprocess
import sys


def elements(udid):
    out = subprocess.run(
        ["idb", "ui", "describe-all", "--udid", udid],
        capture_output=True,
        text=True,
    )
    if out.returncode != 0:
        print(f"idb describe-all failed: {out.stderr.strip()[:200]}", file=sys.stderr)
        return []
    found = []
    # idb emits either one JSON array or a JSON object per line, depending on
    # version. Accept both rather than pinning a version in CI.
    text = out.stdout.strip()
    try:
        data = json.loads(text)
        found = data if isinstance(data, list) else [data]
    except json.JSONDecodeError:
        for line in text.splitlines():
            try:
                found.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return found


def find(els, want):
    want = want.lower()
    for el in els:
        label = f"{el.get('AXLabel') or ''} {el.get('AXValue') or ''} {el.get('AXPlaceholderValue') or ''}"
        if want in label.lower():
            f = el.get("frame") or {}
            if f:
                return int(f["x"] + f["width"] / 2), int(f["y"] + f["height"] / 2)
    return None


def main():
    udid, want = sys.argv[1], sys.argv[2]
    els = elements(udid)
    print(f"{len(els)} elements on screen")
    spot = find(els, want)
    if not spot:
        labels = [
            (e.get("AXLabel") or e.get("AXPlaceholderValue") or "")[:40]
            for e in els
            if e.get("AXLabel") or e.get("AXPlaceholderValue")
        ]
        print(f"no element matching {want!r}. Visible: {labels[:25]}", file=sys.stderr)
        return 1
    x, y = spot
    print(f"tapping {want!r} at {x},{y}")
    subprocess.run(["idb", "ui", "tap", "--udid", udid, str(x), str(y)], check=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
