"""Derive the slim RecipeHub-only artefacts served by the inference API.

Training keeps the full Food.com corpus for the academic pipeline, but the API
only ever serves RecipeHub recipes and the full artefacts do not fit in a
free-tier instance's memory. This module slices the trained artefacts down to
the RecipeHub rows without re-fitting anything, so similarity scores and
predictions are unchanged for every recipe the app can ask about.
"""

from __future__ import annotations

import gc
import json
from pathlib import Path

import joblib

from .clustering_model import MODEL_PATH as CLUSTER_MODEL
from .random_forest_model import MODEL_PATH as RF_MODEL
from .recommendation_model import MODEL_PATH as RECOMMENDATION_MODEL

ROOT = Path(__file__).resolve().parents[1]
SERVING_DIR = ROOT / "models" / "serving"


def build_serving_models() -> dict:
    recommendation = joblib.load(RECOMMENDATION_MODEL)
    recipe_ids = {item["recipe_id"] for item in recommendation["recipes"] if item.get("source") == "recipehub"}
    if not recipe_ids:
        raise SystemExit("No RecipeHub recipes found in the trained recommender artefact.")

    rows = [index for index, item in enumerate(recommendation["recipes"]) if item["recipe_id"] in recipe_ids]
    recipes = [recommendation["recipes"][index] for index in rows]
    serving_recommendation = {
        "version": recommendation.get("version", 1),
        "vectorizer": recommendation["vectorizer"],
        "matrix": recommendation["matrix"][rows].tocsr(),
        "recipes": recipes,
        "recipe_to_index": {item["recipe_id"]: index for index, item in enumerate(recipes)},
    }
    del recommendation, rows, recipes
    gc.collect()

    popularity = joblib.load(RF_MODEL)
    serving_popularity = {
        "pipeline": popularity["pipeline"],
        "feature_columns": popularity["feature_columns"],
        "recipe_features": {key: value for key, value in popularity["recipe_features"].items() if key in recipe_ids},
        "target_description": popularity["target_description"],
    }
    del popularity
    gc.collect()

    clusters = joblib.load(CLUSTER_MODEL)
    serving_clusters = dict(clusters)
    serving_clusters["recipe_clusters"] = {key: value for key, value in clusters["recipe_clusters"].items() if key in recipe_ids}
    serving_clusters["recipes"] = [item for item in clusters["recipes"] if item["recipe_id"] in recipe_ids]
    del clusters
    gc.collect()

    SERVING_DIR.mkdir(parents=True, exist_ok=True)
    artefacts = {
        RECOMMENDATION_MODEL.name: serving_recommendation,
        RF_MODEL.name: serving_popularity,
        CLUSTER_MODEL.name: serving_clusters,
    }
    return {
        "recipes": len(recipe_ids),
        "artefacts": {name: _write(name, artifact) for name, artifact in artefacts.items()},
    }


def _write(name: str, artifact: dict) -> dict:
    path = SERVING_DIR / name
    joblib.dump(artifact, path, compress=3)
    return {"path": str(path.relative_to(ROOT)), "bytes": path.stat().st_size}


if __name__ == "__main__":
    print(json.dumps(build_serving_models(), indent=2))
