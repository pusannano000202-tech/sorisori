"""
Run STT quality gate for EN/JA and emit decision guidance.

Gate policy:
- EN keyword retention >= 85
- JA keyword retention >= 75
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

from run_stt_eval import run as run_stt_eval


def _now_stamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run EN/JA STT quality gate.")
    parser.add_argument("--corpus", default="services/local-ai/eval/stt_corpus.json")
    parser.add_argument("--url", default="http://127.0.0.1:8789")
    parser.add_argument("--threshold-en", type=float, default=85.0)
    parser.add_argument("--threshold-ja", type=float, default=75.0)
    parser.add_argument("--reports-dir", default="services/local-ai/eval/reports")
    parser.add_argument("--verbose", action="store_true", help="Print per-case rows")
    args = parser.parse_args()

    reports_dir = Path(args.reports_dir).resolve()
    reports_dir.mkdir(parents=True, exist_ok=True)
    summary_path = reports_dir / f"stt-gate-{_now_stamp()}.json"

    code = run_stt_eval(
        corpus_path=str(Path(args.corpus).resolve()),
        base_url=args.url,
        timeout_s=60.0,
        filter_lang=None,
        filter_source_type=None,
        threshold_en=args.threshold_en,
        threshold_ja=args.threshold_ja,
        save_path=str(summary_path),
        quiet=not args.verbose,
    )

    if not summary_path.exists():
        raise SystemExit(code)

    report = json.loads(summary_path.read_text(encoding="utf-8"))
    status = str(report.get("status", "FAIL")).upper()
    by_lang = report.get("by_lang", {})
    en_ret = float(by_lang.get("en", {}).get("retention", 0.0))
    ja_ret = float(by_lang.get("ja", {}).get("retention", 0.0))

    print("\n=== Gate Decision ===")
    print(f"EN retention: {en_ret:.2f} (threshold {args.threshold_en:.2f})")
    print(f"JA retention: {ja_ret:.2f} (threshold {args.threshold_ja:.2f})")
    if status == "PASS":
        print("Decision: PASS - keep tuning current components.")
        raise SystemExit(0)

    print("Decision: FAIL - switch to component replacement phase.")
    print("Recommended next step:")
    print("1) Whisper model A/B: small vs medium (or large-v3).")
    print("2) JA-specialized STT route spike and compare latency/accuracy.")
    raise SystemExit(1)


if __name__ == "__main__":
    main()
