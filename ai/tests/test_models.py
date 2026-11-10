import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

from src import clustering_model, random_forest_model, recommendation_model


def sample_recipes(n=36):
    rows = []
    for i in range(n):
        rows.append({"source": "foodcom", "source_recipe_id": str(i), "recipe_id": f"foodcom:{i}", "title": f"Recipe {i}", "minutes": 10 + i, "description": f"A {'chicken' if i % 2 else 'vegetarian'} meal", "ingredients": "['chicken', 'pasta']" if i % 2 else "['beans', 'tomato']", "tags": "['dinner']", "category": "Dinner" if i % 2 else "Vegetarian", "n_ingredients": 2, "n_steps": 4, "nutrition": "[250]"})
    return pd.DataFrame(rows)


class ModelTests(unittest.TestCase):
    def test_recommender_excludes_selected_recipe_and_supports_ingredient_query(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "recipes_master.csv"
            recipes = sample_recipes()
            recipehub_recipe = recipes.iloc[1].copy()
            recipehub_recipe["source"] = "recipehub"
            recipehub_recipe["source_recipe_id"] = "1"
            recipehub_recipe["recipe_id"] = "recipehub:1"
            recipes = pd.concat([recipes, pd.DataFrame([recipehub_recipe])], ignore_index=True)
            recipes.to_csv(path, index=False)
            with patch.object(recommendation_model, "PROCESSED", Path(temp)), patch.object(recommendation_model, "MODEL_PATH", Path(temp) / "tfidf.joblib"):
                model = recommendation_model.train_recommender()
                selected = recommendation_model.recommend(model, "foodcom:1", 5)
                ingredient = recommendation_model.recommend_for_ingredients(model, ["chicken", "pasta"], 5)
                recipehub_only = recommendation_model.recommend_for_ingredients(model, ["chicken", "pasta"], 5, source="recipehub")
            self.assertTrue(selected)
            self.assertNotIn("foodcom:1", [row["recipe_id"] for row in selected])
            self.assertTrue(all(row["similarity"] > 0 for row in ingredient))
            self.assertTrue(all(row["source"] == "recipehub" for row in recipehub_only))

    def test_random_forest_trains_and_predicts_with_nonnegative_output(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            sample_recipes(40).to_csv(root / "recipes_master.csv", index=False)
            interactions = []
            for day in range(30):
                for recipe in range(40):
                    interactions.append({"source": "foodcom", "recipe_id": f"foodcom:{recipe}", "event_date": f"2020-01-{1 + day:02d}", "rating": 3 + (recipe % 3)})
            pd.DataFrame(interactions).to_csv(root / "user_interactions.csv", index=False)
            model_path, report_path = root / "popularity.joblib", root / "rf.json"
            with patch.object(random_forest_model, "PROCESSED", root), patch.object(random_forest_model, "MODEL_PATH", model_path), patch.object(random_forest_model, "REPORT_PATH", report_path):
                report = random_forest_model.train_random_forest(saturation=False)
                import joblib
                artifact = joblib.load(model_path)
                prediction = random_forest_model.predict_popularity(artifact, "foodcom:1")
            self.assertIn("mae_log1p", report["metrics"])
            self.assertGreaterEqual(prediction["predicted_future_interactions"], 0)

    def test_kmeans_assigns_recipe_clusters_and_writes_report(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            sample_recipes(36).to_csv(root / "recipes_master.csv", index=False)
            pd.DataFrame([{"source": "foodcom", "user_id": "foodcom:hash", "recipe_id": "foodcom:1", "rating": 5}]).to_csv(root / "user_interactions.csv", index=False)
            with patch.object(clustering_model, "PROCESSED", root), patch.object(clustering_model, "MODEL_PATH", root / "clusters.joblib"), patch.object(clustering_model, "ASSIGNMENTS", root / "cluster_assignments.csv"), patch.object(clustering_model, "REPORT", root / "kmeans.json"), patch.object(clustering_model, "PLOT_DIR", root / "plots"):
                result = clustering_model.train_kmeans(saturation=False)
            self.assertGreaterEqual(result["selected_k"], 2)
            self.assertEqual(len(pd.read_csv(root / "cluster_assignments.csv")), 36)
            self.assertTrue((root / "plots" / "recipe_clusters.png").exists())


if __name__ == "__main__":
    unittest.main()
