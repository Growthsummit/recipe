import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

from src import dataset_builder


class DatasetBuilderTests(unittest.TestCase):
    def test_removes_duplicate_recipes_invalid_ids_orphans_and_invalid_ratings(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            raw = root / "raw"
            processed = root / "processed"
            raw.mkdir()
            pd.DataFrame([
                {"id": 101, "name": "Chicken Rice", "minutes": 20, "description": "A recipe", "tags": "['dinner']", "ingredients": "['chicken', 'rice']", "steps": "['cook']", "nutrition": "[100]"},
                {"id": 101, "name": "Duplicate", "minutes": 10, "description": "", "tags": "[]", "ingredients": "[]", "steps": "[]", "nutrition": "[]"},
                {"id": "bad", "name": "Invalid", "minutes": 2, "description": "", "tags": "[]", "ingredients": "[]", "steps": "[]", "nutrition": "[]"},
            ]).to_csv(raw / "RAW_recipes.csv", index=False)
            pd.DataFrame([
                {"user_id": 1, "recipe_id": 101, "date": "2020-01-01", "rating": 5, "review": "private review text"},
                {"user_id": 1, "recipe_id": 101, "date": "2020-01-01", "rating": 5, "review": "duplicate"},
                {"user_id": 2, "recipe_id": 999, "date": "2020-01-02", "rating": 4, "review": "orphan"},
                {"user_id": 3, "recipe_id": 101, "date": "2020-01-03", "rating": 0, "review": "invalid rating"},
            ]).to_csv(raw / "RAW_interactions.csv", index=False)
            with patch.object(dataset_builder, "ROOT", root), patch.object(dataset_builder, "RAW", raw), patch.object(dataset_builder, "PROCESSED", processed), patch.object(dataset_builder, "SUMMARY", processed / "dataset_summary.csv"):
                counts = dataset_builder.build_datasets()
            recipes = pd.read_csv(processed / "recipes_master.csv")
            events = pd.read_csv(processed / "user_interactions.csv")
            self.assertEqual(counts["foodcom_recipes"], 1)
            self.assertEqual(counts["foodcom_interactions"], 1)
            self.assertEqual(recipes.iloc[0].recipe_id, "foodcom:101")
            self.assertNotIn("private review text", (processed / "user_interactions.csv").read_text(encoding="utf-8"))
            self.assertTrue(events.iloc[0].user_id.startswith("foodcom:"))


if __name__ == "__main__":
    unittest.main()
