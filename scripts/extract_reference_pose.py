#!/usr/bin/env python3
"""
Extract a reference pose sequence from a technique video for "Try with pose".

This does NOT train a new AI model. It uses the same MediaPipe Pose model that
runs on the device to get 33 landmarks per frame. You then host the output JSON
and set referencePoseSequenceUrl on the module so the app can compare the user's
rep to this reference and mark correct/incorrect.

Usage:
  pip install opencv-python mediapipe

  # From a local file (video in any folder on your PC)
  python scripts/extract_reference_pose.py path/to/technique.mp4 -o reference.json

  # From a URL (script downloads the video first)
  python scripts/extract_reference_pose.py "https://example.com/technique.mp4" -o reference.json

  # Subsample to ~15 frames (faster comparison; tune as needed)
  python scripts/extract_reference_pose.py path/to/technique.mp4 -o reference.json --every 2

  # One rep from 5s to 12s (if video is 30fps, that's frames 150–360)
  python scripts/extract_reference_pose.py path/to/technique.mp4 -o reference.json --start 5 --end 12

Output JSON format (what the app expects):
  Single reference: { "sequence": [ [ { "x", "y", "z?", "visibility?" }, ... ], ... ] }
  Dataset (multiple refs): { "sequences": [ sequence1, sequence2, ... ] }
  Each sequence = one rep; app matches user to any of them.

  # From a folder of videos (dataset): one sequence per video
  python scripts/extract_reference_pose.py path/to/folder/with/videos -o reference_dataset.json
"""

import argparse
import json
import sys
import tempfile
import urllib.request
from pathlib import Path

VIDEO_EXTENSIONS = (".mp4", ".mov", ".webm", ".avi", ".mkv")

try:
    import cv2
    import numpy as np
    import mediapipe as mp
except ImportError:
    print("Install dependencies: pip install opencv-python mediapipe numpy", file=sys.stderr)
    sys.exit(1)

# Prefer new Tasks API (mediapipe 0.10.30+); fall back to legacy solutions if available.
USE_TASKS_API = not getattr(mp, "solutions", None)
if USE_TASKS_API and not getattr(mp, "tasks", None):
    print(
        "Your MediaPipe version has no 'solutions' or 'tasks' API.\n"
        "Install: pip install opencv-python mediapipe",
        file=sys.stderr,
    )
    sys.exit(1)


POSE_LANDMARKER_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
)


def _download_model() -> str:
    """Download pose_landmarker_lite.task to a temp file; return path."""
    path = Path(tempfile.gettempdir()) / "pose_landmarker_lite.task"
    if path.is_file():
        return str(path)
    print("Downloading pose landmarker model...", file=sys.stderr)
    req = urllib.request.Request(POSE_LANDMARKER_MODEL_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        data = resp.read()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return str(path)


def download_video(url: str) -> str:
    """Download video from URL to a temp file; return path. Uses direct links (not Google Drive share links)."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        data = resp.read()
    suffix = Path(url).suffix or ".mp4"
    if suffix not in (".mp4", ".mov", ".webm", ".avi"):
        suffix = ".mp4"
    fd, path = tempfile.mkstemp(suffix=suffix)
    with open(fd, "wb") as f:
        f.write(data)
    return path


def _extract_pose_sequence_tasks_api(
    video_path: str,
    start_sec: float | None,
    end_sec: float | None,
    every_n_frames: int,
) -> list[list[dict]]:
    """Extract pose using MediaPipe Tasks API (PoseLandmarker)."""
    BaseOptions = mp.tasks.BaseOptions
    PoseLandmarker = mp.tasks.vision.PoseLandmarker
    PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
    RunningMode = mp.tasks.vision.RunningMode

    model_path = _download_model()
    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model_path),
        running_mode=RunningMode.VIDEO,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
    )
    try:
        landmarker = PoseLandmarker.create_from_options(options)
    except (AttributeError, OSError) as e:
        err = str(e).lower()
        if "free" in err or "function" in err:
            print(
                "MediaPipe on Windows can hit a known bug: 'function free not found'.\n"
                "Try: python -m pip uninstall mediapipe -y && python -m pip install mediapipe==0.10.21",
                file=sys.stderr,
            )
        raise

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    start_frame = int(start_sec * fps) if start_sec is not None else 0
    end_frame = int(end_sec * fps) if end_sec is not None else total_frames
    start_frame = max(0, min(start_frame, total_frames))
    end_frame = max(start_frame, min(end_frame, total_frames))

    sequence: list[list[dict]] = []
    frame_idx = -1

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1
        if frame_idx < start_frame:
            continue
        if frame_idx > end_frame:
            break
        if (frame_idx - start_frame) % every_n_frames != 0:
            continue

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb = np.ascontiguousarray(rgb)
        timestamp_ms = int(1000 * frame_idx / fps)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect_for_video(mp_image, timestamp_ms)

        if not result.pose_landmarks:
            continue
        # First person only; each landmark has x, y, z, visibility
        landmarks = result.pose_landmarks[0]
        frame_landmarks = []
        for lm in landmarks:
            frame_landmarks.append({
                "x": lm.x,
                "y": lm.y,
                "z": lm.z,
                "visibility": getattr(lm, "visibility", 1.0),
            })
        if len(frame_landmarks) >= 33:
            sequence.append(frame_landmarks)

    cap.release()
    return sequence


def _extract_pose_sequence_solutions_api(
    video_path: str,
    start_sec: float | None,
    end_sec: float | None,
    every_n_frames: int,
) -> list[list[dict]]:
    """Extract pose using legacy MediaPipe Solutions API (mp.solutions.pose)."""
    mp_pose = mp.solutions.pose
    pose = mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    start_frame = int(start_sec * fps) if start_sec is not None else 0
    end_frame = int(end_sec * fps) if end_sec is not None else total_frames
    start_frame = max(0, min(start_frame, total_frames))
    end_frame = max(start_frame, min(end_frame, total_frames))

    sequence = []
    frame_idx = -1

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1
        if frame_idx < start_frame:
            continue
        if frame_idx > end_frame:
            break
        if (frame_idx - start_frame) % every_n_frames != 0:
            continue

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = pose.process(rgb)
        if not results.pose_landmarks:
            continue
        frame_landmarks = []
        for lm in results.pose_landmarks.landmark:
            frame_landmarks.append({
                "x": lm.x,
                "y": lm.y,
                "z": lm.z,
                "visibility": getattr(lm, "visibility", 1.0),
            })
        if len(frame_landmarks) >= 33:
            sequence.append(frame_landmarks)

    cap.release()
    pose.close()
    return sequence


def extract_pose_sequence(
    video_path: str,
    *,
    start_sec: float | None = None,
    end_sec: float | None = None,
    every_n_frames: int = 1,
) -> list[list[dict]]:
    """Read video, run MediaPipe Pose per frame, return sequence of 33-landmark frames."""
    if USE_TASKS_API:
        return _extract_pose_sequence_tasks_api(video_path, start_sec, end_sec, every_n_frames)
    return _extract_pose_sequence_solutions_api(video_path, start_sec, end_sec, every_n_frames)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract reference pose sequence from a technique video (MediaPipe Pose)."
    )
    parser.add_argument(
        "video",
        help="Path to the technique video file, or a direct download URL (http/https).",
    )
    parser.add_argument("-o", "--output", required=True, help="Output JSON path (e.g. reference.json)")
    parser.add_argument(
        "--start",
        type=float,
        default=None,
        metavar="SEC",
        help="Start time in seconds (one rep start)",
    )
    parser.add_argument(
        "--end",
        type=float,
        default=None,
        metavar="SEC",
        help="End time in seconds (one rep end)",
    )
    parser.add_argument(
        "--every",
        type=int,
        default=1,
        metavar="N",
        help="Use every Nth frame (default 1). Use 2–3 to shorten sequence.",
    )
    parser.add_argument(
        "--focus",
        choices=["punching", "kicking", "full"],
        default="full",
        help="Body region to compare: punching (upper body), kicking (legs), full (all). Default full.",
    )
    args = parser.parse_args()

    video_input = args.video.strip()
    is_url = video_input.startswith("http://") or video_input.startswith("https://")
    temp_path = None

    if is_url:
        print(f"Downloading from URL...", file=sys.stderr)
        try:
            video_path = download_video(video_input)
            temp_path = video_path
        except Exception as e:
            print(f"Error downloading: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        video_path = str(Path(video_input).resolve())
        if not Path(video_path).is_file() and not Path(video_path).is_dir():
            print(f"Error: not a file or directory: {video_path}", file=sys.stderr)
            sys.exit(1)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Dataset mode: input is a directory of videos
    if Path(video_path).is_dir():
        video_files = sorted(
            p for p in Path(video_path).iterdir()
            if p.is_file() and p.suffix.lower() in VIDEO_EXTENSIONS
        )
        if not video_files:
            print(f"No video files (e.g. .mp4, .mov) found in {video_path}", file=sys.stderr)
            sys.exit(1)
        print(f"Found {len(video_files)} videos. Extracting pose from each...", file=sys.stderr)
        sequences: list[list[list[dict]]] = []
        for i, p in enumerate(video_files):
            try:
                seq = extract_pose_sequence(
                    str(p),
                    start_sec=args.start,
                    end_sec=args.end,
                    every_n_frames=args.every,
                )
                if seq:
                    sequences.append(seq)
                    print(f"  [{i+1}/{len(video_files)}] {p.name}: {len(seq)} frames", file=sys.stderr)
                else:
                    print(f"  [{i+1}/{len(video_files)}] {p.name}: no pose detected, skipped", file=sys.stderr)
            except Exception as e:
                print(f"  [{i+1}/{len(video_files)}] {p.name}: {e}", file=sys.stderr)
        if not sequences:
            print("No pose detected in any video.", file=sys.stderr)
            sys.exit(1)
        out = {"sequences": sequences, "focus": args.focus}
        with open(out_path, "w") as f:
            json.dump(out, f, separators=(",", ":"))
        print(f"Wrote {len(sequences)} reference sequences to {out_path}.")
        print("Next: upload this JSON and set module.referencePoseSequenceUrl to its URL.")
        return

    # Single video (file or downloaded from URL)
    try:
        sequence = extract_pose_sequence(
            video_path,
            start_sec=args.start,
            end_sec=args.end,
            every_n_frames=args.every,
        )
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if temp_path and Path(temp_path).exists():
            Path(temp_path).unlink(missing_ok=True)
        sys.exit(1)
    finally:
        if temp_path and Path(temp_path).exists():
            Path(temp_path).unlink(missing_ok=True)

    if not sequence:
        print("No pose detected in the selected range. Check video and --start/--end.", file=sys.stderr)
        sys.exit(1)

    out = {"sequence": sequence, "focus": args.focus}
    with open(out_path, "w") as f:
        json.dump(out, f, separators=(",", ":"))

    print(f"Wrote {len(sequence)} frames to {out_path} (focus={args.focus}).")
    print("Next: upload this JSON (e.g. Firebase Storage), then set module.referencePoseSequenceUrl to its URL.")


if __name__ == "__main__":
    main()
