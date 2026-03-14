#!/usr/bin/env python3
"""
POST a pose reference JSON (from extract_reference_pose.py) to the pose-service /write-ref
endpoint so it gets written to Firebase. No need to host the JSON.

Usage:
  python scripts/write_ref_to_db.py reference/punching/ref_lead_jab.json --module-id module_xxx --service-url https://your-pose-service.onrender.com
"""
import argparse
import json
import sys
from pathlib import Path

try:
    import urllib.request
except ImportError:
    sys.exit("Python 3 required")

def main():
    ap = argparse.ArgumentParser(description="POST pose reference JSON to pose-service /write-ref")
    ap.add_argument("json_path", help="Path to ref JSON (e.g. reference/punching/ref_lead_jab.json)")
    ap.add_argument("--module-id", required=True, help="Module ID in Firebase (e.g. module_abc123_456)")
    ap.add_argument("--service-url", required=True, help="Pose service base URL (e.g. https://your-app.onrender.com)")
    args = ap.parse_args()

    path = Path(args.json_path)
    if not path.is_file():
        print(f"Error: file not found: {path}", file=sys.stderr)
        sys.exit(1)

    with open(path) as f:
        data = json.load(f)

    data["moduleId"] = args.module_id.strip()
    url = args.service_url.rstrip("/") + "/write-ref"
    body = json.dumps(data).encode("utf-8")

    req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode())
            print(result.get("message", result))
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f"Error {e.code}: {err}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
