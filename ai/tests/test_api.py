import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from src import api


class InferenceApiTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {"AI_SERVICE_TOKEN": "test-token"})
        self.environment.start()
        self.client = TestClient(api.app)
        self.models = patch.object(api, "_models", return_value={"recommendation": object(), "random_forest": object(), "clusters": {"recipe_clusters": {"recipehub:1": 3}}})
        self.models.start()

    def tearDown(self):
        self.models.stop()
        self.environment.stop()

    def test_recommendation_requires_service_token_and_returns_results(self):
        with patch.object(api, "recommend", return_value=[{"recipe_id": "recipehub:2", "similarity": 0.8}]) as recommend:
            denied = self.client.get("/recommendations/recipehub:1")
            allowed = self.client.get("/recommendations/recipehub:1?limit=5&source=recipehub", headers={"Authorization": "Bearer test-token"})
        self.assertEqual(denied.status_code, 401)
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.json()["recipes"][0]["recipe_id"], "recipehub:2")
        self.assertEqual(recommend.call_args.args[1], "recipehub:1")
        self.assertEqual(recommend.call_args.args[4], "recipehub")

    def test_ingredient_query_and_cluster_assignment(self):
        with patch.object(api, "recommend_for_ingredients", return_value=[{"recipe_id": "recipehub:9"}]) as recommend:
            response = self.client.post("/recommendations/ingredients", headers={"Authorization": "Bearer test-token"}, json={"ingredients": ["chicken", "rice"], "limit": 5, "source": "recipehub"})
        cluster = self.client.get("/clusters/recipehub:1", headers={"Authorization": "Bearer test-token"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["recipes"][0]["recipe_id"], "recipehub:9")
        self.assertEqual(recommend.call_args.args[4], "recipehub")
        self.assertEqual(cluster.json()["cluster"], 3)

    def test_missing_recipe_prediction_returns_not_found(self):
        with patch.object(api, "predict_popularity", return_value=None):
            response = self.client.get("/popularity/recipehub:999", headers={"Authorization": "Bearer test-token"})
        self.assertEqual(response.status_code, 404)

    def test_recipehub_discovery_combines_trained_models_and_excludes_other_sources(self):
        class FakePopularityPipeline:
            def predict(self, frame):
                return [0.4] * len(frame)

        catalog = {"recipes": [
            {"recipe_id": "recipehub:1", "source": "recipehub", "source_recipe_id": "1", "title": "Lentil soup", "category": "Soup", "minutes": 30, "ingredients": ["lentils"]},
            {"recipe_id": "foodcom:2", "source": "foodcom", "source_recipe_id": "2", "title": "Other soup", "category": "Soup", "minutes": 25, "ingredients": ["beans"]},
        ]}
        forest = {"recipe_features": {"recipehub:1": {"feature": 0.1}}, "feature_columns": ["feature"], "pipeline": FakePopularityPipeline()}
        models = {"recommendation": catalog, "random_forest": forest, "clusters": {"recipe_clusters": {"recipehub:1": 2}}}
        with patch.object(api, "_models", return_value=models):
            response = self.client.get("/discovery/recipehub", headers={"Authorization": "Bearer test-token"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([recipe["recipe_id"] for recipe in response.json()["recipes"]], ["1"])
        self.assertEqual(response.json()["recipes"][0]["cluster"], 2)
        self.assertGreaterEqual(response.json()["recipes"][0]["predicted_future_interactions"], 0)


if __name__ == "__main__":
    unittest.main()
