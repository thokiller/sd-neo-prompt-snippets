from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

EXTENSION_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(EXTENSION_ROOT))

from lib_prompt_snippets import store  # noqa: E402


class PromptSnippetStoreTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="prompt-snippets-test-"))
        store.set_base_dir(self.root)
        self.addCleanup(store.set_base_dir, None)
        self.addCleanup(shutil.rmtree, self.root, True)

    def test_missing_library_returns_defaults(self):
        library, exists = store.load_library()

        self.assertFalse(exists)
        self.assertEqual(library, store.empty_library())

    def test_save_and_load_roundtrip(self):
        source = {
            "schema": 1,
            "snippets": [{"id": "snippet", "name": "Example"}],
            "groups": [{"id": "group", "name": "People"}],
            "ungrouped_open": {
                "positive": False,
                "negative": True,
                "shared": False,
            },
        }

        saved = store.save_library(source)
        loaded, exists = store.load_library()

        self.assertTrue(exists)
        self.assertEqual(loaded, source)
        self.assertIn("saved_at", saved)

    def test_save_is_atomic(self):
        store.save_library(store.empty_library())

        self.assertTrue(store.library_path().is_file())
        self.assertFalse(store.library_path().with_suffix(".json.tmp").exists())

    def test_load_accepts_byte_order_mark(self):
        store.save_library(store.empty_library())
        path = store.library_path()
        path.write_text(path.read_text(encoding="utf-8"), encoding="utf-8-sig")

        _, exists = store.load_library()

        self.assertTrue(exists)

    def test_load_rejects_corrupt_json(self):
        store.library_path().parent.mkdir(parents=True, exist_ok=True)
        store.library_path().write_text("{bad json", encoding="utf-8")

        with self.assertRaisesRegex(store.LibraryError, "Could not read"):
            store.load_library()

    def test_rejects_newer_schema(self):
        with self.assertRaisesRegex(store.LibraryError, "newer version"):
            store.validate_library({"schema": 2})

    def test_rejects_invalid_collection_shapes(self):
        for field in ("snippets", "groups"):
            with self.subTest(field=field):
                with self.assertRaises(store.LibraryError):
                    store.validate_library({field: {}})

    def test_defaults_missing_ungrouped_flags(self):
        library = store.validate_library(
            {
                "snippets": [],
                "groups": [],
                "ungrouped_open": {"positive": False},
            }
        )

        self.assertEqual(
            library["ungrouped_open"],
            {"positive": False, "negative": True, "shared": True},
        )

    def test_saved_file_is_readable_json(self):
        store.save_library(store.empty_library())

        document = json.loads(store.library_path().read_text(encoding="utf-8"))

        self.assertEqual(document["schema"], store.SCHEMA_VERSION)
