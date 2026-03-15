#!/usr/bin/env python3
"""Analyze LeadHookTest CSV: arm extensions and elbow angles (MediaPipe 33)."""
import csv
import math
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent / "LeadHookTest_MiksAboyme_pose_data.csv"

def col(landmark_index, xy):
    return 2 + landmark_index * 4 + (0 if xy == "x" else 1)

def point(row, i):
    return (float(row[col(i, "x")]), float(row[col(i, "y")]))

def dist(a, b):
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)

def elbow_angle_deg(shoulder, elbow, wrist):
    ax = shoulder[0] - elbow[0]
    ay = shoulder[1] - elbow[1]
    bx = wrist[0] - elbow[0]
    by = wrist[1] - elbow[1]
    dot = ax * bx + ay * by
    mag_a = math.sqrt(ax * ax + ay * ay) or 1e-9
    mag_b = math.sqrt(bx * bx + by * by) or 1e-9
    cos = max(-1, min(1, dot / (mag_a * mag_b)))
    return math.degrees(math.acos(cos))

# MediaPipe 33: 11=left shoulder, 12=right shoulder, 13=left elbow, 14=right elbow, 15=left wrist, 16=right wrist
# Camera mirror: MediaPipe "right" = user's LEFT. Lead hook = user LEFT punches => MediaPipe 12,14,16 (right arm)
def main():
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = [row for row in reader if len(row) >= 70]

    left_ext = []   # user right (guard) = lm 11,15
    right_ext = []  # user left (punch) = lm 12,16
    right_elbow = []
    for row in rows:
        ls = point(row, 11)
        rs = point(row, 12)
        le = point(row, 13)
        re = point(row, 14)
        lw = point(row, 15)
        rw = point(row, 16)
        left_ext.append(dist(lw, ls))
        right_ext.append(dist(rw, rs))
        right_elbow.append(elbow_angle_deg(rs, re, rw))

    print("Lead hook CSV analysis (MediaPipe 33)")
    print("Frames:", len(rows))
    print()
    print("Left arm (MediaPipe 11–15) = user RIGHT = guard")
    print("  Wrist–shoulder distance: min=%.4f max=%.4f mean=%.4f" % (min(left_ext), max(left_ext), sum(left_ext) / len(left_ext)))
    print()
    print("Right arm (MediaPipe 12–16) = user LEFT = punching arm")
    print("  Wrist–shoulder distance: min=%.4f max=%.4f mean=%.4f" % (min(right_ext), max(right_ext), sum(right_ext) / len(right_ext)))
    print("  Elbow angle (deg, 180=straight): min=%.1f max=%.1f mean=%.1f" % (min(right_elbow), max(right_elbow), sum(right_elbow) / len(right_elbow)))
    print()
    print("Sample frames:")
    for i in [0, len(rows) // 2, len(rows) - 1]:
        print("  Frame %d: right_ext=%.4f right_elbow=%.1f° left_ext=%.4f" % (i, right_ext[i], right_elbow[i], left_ext[i]))

if __name__ == "__main__":
    main()
