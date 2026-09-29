from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
_write_lock = threading.Lock()
_base_dir_override: Path | None = None


class LibraryError(Exception):
    """Raised when the snippet library cannot be read or validated."""


def set_base_dir(path: str | Path | None) -> None:
    global _base_dir_override
    _base_dir_override = None if path is None else Path(path)


def base_dir() -> Path:
    if _base_dir_override is not None:
        return _base_dir_override

    try:
        from modules.paths_internal import models_path
    except Exception:
        return Path.cwd() / "models" / "prompt-snippets"

    return Path(models_path, "prompt-snippets")


def library_path() -> Path:
    return base_dir() / "library.json"


def empty_library() -> dict[str, Any]:
    return {
        "schema": SCHEMA_VERSION,
        "snippets": [],
        "groups": [],
        "ungrouped_open": {
            "positive": True,
            "negative": True,
            "shared": True,
        },
    }


def validate_library(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise LibraryError("Snippet library must be a JSON object")

    schema = raw.get("schema", SCHEMA_VERSION)
    if not isinstance(schema, int) or schema < 1:
        raise LibraryError("Snippet library schema must be a positive integer")
    if schema > SCHEMA_VERSION:
        raise LibraryError(
            f"Snippet library was written by a newer version (schema {schema})"
        )

    snippets = raw.get("snippets", [])
    groups = raw.get("groups", [])
    ungrouped_open = raw.get("ungrouped_open", {})
    if not isinstance(snippets, list):
        raise LibraryError('"snippets" must be a list')
    if not isinstance(groups, list):
        raise LibraryError('"groups" must be a list')
    if not isinstance(ungrouped_open, dict):
        raise LibraryError('"ungrouped_open" must be an object')
    if not all(isinstance(item, dict) for item in snippets):
        raise LibraryError('Every item in "snippets" must be an object')
    if not all(isinstance(item, dict) for item in groups):
        raise LibraryError('Every item in "groups" must be an object')

    defaults = empty_library()["ungrouped_open"]
    normalized_open = {
        key: value if isinstance(value, bool) else defaults[key]
        for key, value in (
            (key, ungrouped_open.get(key)) for key in defaults
        )
    }
    return {
        "schema": SCHEMA_VERSION,
        "snippets": snippets,
        "groups": groups,
        "ungrouped_open": normalized_open,
    }


def load_library() -> tuple[dict[str, Any], bool]:
    path = library_path()
    if not path.is_file():
        return empty_library(), False

    try:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as exc:
        raise LibraryError(f"Could not read snippet library: {exc}") from exc

    return validate_library(raw), True


def save_library(raw: Any) -> dict[str, Any]:
    library = validate_library(raw)
    document = {
        **library,
        "saved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    path = library_path()

    with _write_lock:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(".json.tmp")
            temporary.write_text(
                json.dumps(document, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            temporary.replace(path)
        except OSError as exc:
            raise LibraryError(f"Could not write snippet library: {exc}") from exc

    return document
