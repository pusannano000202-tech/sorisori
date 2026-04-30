"""
Generate scaffold manifests for external STT evaluation clips.

This creates:
- services/local-ai/eval/sources/human_external_sources.json (80 entries)
- services/local-ai/eval/sources/music_sources.json (60 entries)

The generated entries are placeholders that you can fill with real files,
timestamps, and transcripts.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def _human_entry(lang: str, index: int) -> dict[str, Any]:
    case_id = f"{lang}_human_{index:03d}"
    transcript = f"TODO_REPLACE_TRANSCRIPT_{lang.upper()}_{index:03d}"
    return {
        "id": case_id,
        "lang": lang,
        "source_type": "human_external",
        "expected_text": transcript,
        "keywords": [],
        "local_path": f"raw/{lang}/human/{case_id}.wav",
        "source_url": "",
        "start_sec": 0.0,
        "duration_sec": 5.0,
        "license_note": "TODO: source-and-license",
        "status": "todo",
    }


def _music_entry(lang: str, index: int) -> dict[str, Any]:
    case_id = f"{lang}_music_{index:03d}"
    transcript = f"TODO_REPLACE_TRANSCRIPT_{lang.upper()}_{index:03d}"
    return {
        "id": case_id,
        "lang": lang,
        "source_type": "music_mixed",
        "expected_text": transcript,
        "keywords": [],
        "local_path": f"raw/{lang}/music/{case_id}.wav",
        "source_url": "",
        "start_sec": 0.0,
        "duration_sec": 5.0,
        "license_note": "TODO: source-and-license",
        "status": "todo",
    }


def _write_json(path: Path, payload: dict[str, Any], overwrite: bool) -> None:
    if path.exists() and not overwrite:
        raise FileExistsError(f"{path} already exists. Use --overwrite to replace it.")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate 140-slot external manifest scaffolds.")
    parser.add_argument("--sources-dir", default="services/local-ai/eval/sources")
    parser.add_argument("--human-en", type=int, default=40)
    parser.add_argument("--human-ja", type=int, default=40)
    parser.add_argument("--music-en", type=int, default=30)
    parser.add_argument("--music-ja", type=int, default=30)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    sources_dir = Path(args.sources_dir).resolve()
    human_path = sources_dir / "human_external_sources.json"
    music_path = sources_dir / "music_sources.json"

    human_entries: list[dict[str, Any]] = []
    human_entries.extend(_human_entry("en", i) for i in range(1, args.human_en + 1))
    human_entries.extend(_human_entry("ja", i) for i in range(1, args.human_ja + 1))

    music_entries: list[dict[str, Any]] = []
    music_entries.extend(_music_entry("en", i) for i in range(1, args.music_en + 1))
    music_entries.extend(_music_entry("ja", i) for i in range(1, args.music_ja + 1))

    human_payload = {
        "description": "Auto-generated scaffold. Replace TODO fields with real data.",
        "entries": human_entries,
    }
    music_payload = {
        "description": "Auto-generated scaffold. Replace TODO fields with real data.",
        "entries": music_entries,
    }

    _write_json(human_path, human_payload, args.overwrite)
    _write_json(music_path, music_payload, args.overwrite)

    print(f"Wrote: {human_path}")
    print(f"Wrote: {music_path}")
    print(
        "Counts -> human_en={0}, human_ja={1}, music_en={2}, music_ja={3}, total={4}".format(
            args.human_en,
            args.human_ja,
            args.music_en,
            args.music_ja,
            args.human_en + args.human_ja + args.music_en + args.music_ja,
        )
    )


if __name__ == "__main__":
    main()
