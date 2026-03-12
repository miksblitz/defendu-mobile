"""
Pose reference extraction service for Defendu.

Trainers upload only the technique video. When a module is saved with techniqueVideoUrl,
the app calls POST /extract with { videoUrl, moduleId, focus }. This service:
  1. Downloads the video
  2. Runs MediaPipe pose extraction (same as the mobile app)
  3. Writes the pose reference (sequence + focus) directly to the module in Realtime Database

No Firebase Storage / Blaze plan required. Set env:
  FIREBASE_SERVICE_ACCOUNT_JSON  - full JSON string of the service account key
  FIREBASE_DATABASE_URL           - Realtime Database URL (e.g. https://...firebasedatabase.app)
"""
import json
import os
import subprocess
import sys
import tempfile
import threading
import urllib.request
from pathlib import Path

from flask import Flask, request, jsonify

app = Flask(__name__)

# Path to the extraction script (repo root is one level up from pose-service)
REPO_ROOT = Path(__file__).resolve().parent.parent
EXTRACT_SCRIPT = REPO_ROOT / "scripts" / "extract_reference_pose.py"


def download_video(url: str) -> str:
    """Download video from URL to a temp file; return path."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = resp.read()
    suffix = Path(url).suffix or ".mp4"
    if suffix not in (".mp4", ".mov", ".webm", ".avi"):
        suffix = ".mp4"
    fd, path = tempfile.mkstemp(suffix=suffix)
    with open(fd, "wb") as f:
        f.write(data)
    return path


# Max time for pose extraction (seconds). Must be less than gunicorn --timeout (300).
SUBPROCESS_TIMEOUT = 240


def extract_pose(video_path: str, output_path: str, focus: str) -> None:
    """Run the reference pose extraction script; writes JSON to output_path."""
    if not EXTRACT_SCRIPT.is_file():
        raise FileNotFoundError(f"Extraction script not found: {EXTRACT_SCRIPT}")
    subprocess.run(
        [
            sys.executable,
            str(EXTRACT_SCRIPT),
            video_path,
            "-o",
            output_path,
            "--focus",
            focus,
        ],
        check=True,
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
        timeout=SUBPROCESS_TIMEOUT,
    )


def update_module_with_pose_reference(module_id: str, payload: dict, focus: str) -> None:
    """Write pose reference directly to Realtime Database (no Storage / Blaze required)."""
    import firebase_admin
    from firebase_admin import credentials, db

    if not firebase_admin._apps:
        cred_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        database_url = os.environ.get("FIREBASE_DATABASE_URL")
        if not cred_json or not database_url:
            raise ValueError("FIREBASE_SERVICE_ACCOUNT_JSON and FIREBASE_DATABASE_URL must be set")
        cred_dict = json.loads(cred_json)
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred, {"databaseURL": database_url})
    ref = db.reference("modules").child(module_id)
    # Store sequence (and optionally sequences) + focus on the module so the app can use them without a URL
    sequences = payload.get("sequences")
    sequence = payload.get("sequence")
    if sequences and len(sequences) > 0:
        ref.update({"referencePoseSequences": sequences, "referencePoseFocus": focus})
    elif sequence and len(sequence) > 0:
        ref.update({"referencePoseSequence": sequence, "referencePoseFocus": focus})
    else:
        raise ValueError("Payload has no sequence or sequences")


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "service": "Defendu pose extraction",
        "status": "running",
        "health": "/health",
        "extract": "POST /extract with { videoUrl, moduleId, focus }",
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


def _run_extraction(video_url: str, module_id: str, focus: str) -> None:
    """Background thread: download -> extract -> upload to Firebase. Logs each step."""
    video_path = None
    out_path = None
    try:
        print(f"[Extract] Background started module_id={module_id} focus={focus}", flush=True)
        video_path = download_video(video_url)
        print(f"[Extract] Video downloaded", flush=True)
        fd, out_path = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        extract_pose(video_path, out_path, focus)
        print(f"[Extract] Pose extraction finished", flush=True)
        with open(out_path) as f:
            payload = json.load(f)
        focus_from_payload = (payload.get("focus") or focus) if isinstance(payload, dict) else focus
        print(f"[Extract] Writing pose reference to Realtime Database modules/{module_id}...", flush=True)
        update_module_with_pose_reference(module_id, payload, focus_from_payload)
        print(f"[Extract] Done module_id={module_id} reference saved to DB", flush=True)
    except Exception as e:
        print(f"[Extract] Error: {type(e).__name__}: {e}", flush=True)
        import traceback
        traceback.print_exc()
    finally:
        if video_path and os.path.exists(video_path):
            try:
                os.unlink(video_path)
            except OSError:
                pass
        if out_path and os.path.exists(out_path):
            try:
                os.unlink(out_path)
            except OSError:
                pass


@app.route("/extract", methods=["POST"])
def extract():
    """
    Request body: { "videoUrl": string, "moduleId": string, "focus": "punching"|"kicking"|"full" }
    Returns 202 immediately; runs download + pose extraction + Firebase update in a background thread.
    """
    body = request.get_json(force=True, silent=True) or {}
    video_url = (body.get("videoUrl") or "").strip()
    module_id = (body.get("moduleId") or "").strip()
    focus = (body.get("focus") or "full").lower()
    if focus not in ("punching", "kicking", "full"):
        focus = "full"
    if not video_url or not module_id:
        return jsonify({"error": "videoUrl and moduleId are required"}), 400

    print(f"[Extract] Accepted for module_id={module_id} focus={focus} (running in background)", flush=True)
    thread = threading.Thread(target=_run_extraction, args=(video_url, module_id, focus), daemon=True)
    thread.start()
    return jsonify({"message": "Pose reference is being generated. It may take 1–2 minutes.", "moduleId": module_id}), 202


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
