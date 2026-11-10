"""Small inference-only Python service. Model fitting is an offline operation."""

from __future__ import annotations

import hmac
import os
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

import joblib
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .clustering_model import MODEL_PATH as CLUSTER_MODEL
from .random_forest_model import MODEL_PATH as RF_MODEL, predict_popularity
from .recommendation_model import MODEL_PATH as RECOMMENDATION_MODEL, recommend, recommend_for_ingredients

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports" / "evaluation"
SERVING_DIR = ROOT / "models" / "serving"


def _serving(default: Path) -> Path:
    """Prefer the slim RecipeHub-only artefact when it has been built."""
    candidate = SERVING_DIR / default.name
    return candidate if candidate.exists() else default


MODELS = {"recommendation": _serving(RECOMMENDATION_MODEL), "random_forest": _serving(RF_MODEL), "clusters": _serving(CLUSTER_MODEL)}


@asynccontextmanager
async def lifespan(_app):
    if not os.environ.get("AI_SERVICE_TOKEN"):
        raise RuntimeError("AI_SERVICE_TOKEN must be configured before starting the inference service.")
    _models()
    yield


app = FastAPI(title="RecipeHub AI Inference", version="1.0.0", lifespan=lifespan)


@lru_cache(maxsize=1)
def _models():
    missing = [path.name for path in MODELS.values() if not path.exists()]
    if missing:
        raise HTTPException(status_code=503, detail=f"AI models have not been trained: {', '.join(missing)}")
    return {name: joblib.load(path) for name, path in MODELS.items()}


def _authorize(authorization: Annotated[str | None, Header()] = None):
    expected = os.environ.get("AI_SERVICE_TOKEN", "")
    if not expected or not authorization or not hmac.compare_digest(authorization.removeprefix("Bearer "), expected):
        raise HTTPException(status_code=401, detail="AI service authentication failed.")


class IngredientRequest(BaseModel):
    ingredients: list[Annotated[str, Field(min_length=1, max_length=160)]] = Field(min_length=1, max_length=30)
    exclude_recipe_ids: list[str] = Field(default_factory=list, max_length=200)
    limit: int = Field(default=10, ge=1, le=20)
    source: Literal["recipehub", "foodcom"] | None = None


@app.get("/health")
def health():
    ready = all(path.exists() for path in MODELS.values())
    return {"status": "ok" if ready else "models_missing", "models_ready": ready}


@app.get("/recommendations/{recipe_id}", dependencies=[Depends(_authorize)])
def similar_recipes(recipe_id: str, limit: int = 10, exclude: list[str] | None = None, source: Literal["recipehub", "foodcom"] | None = None):
    if not 1 <= limit <= 20 or len(exclude or []) > 200:
        raise HTTPException(status_code=422, detail="Limit must be 1–20 and exclusions are limited to 200 IDs.")
    models = _models()
    return {"recipes": recommend(models["recommendation"], recipe_id, limit, set(exclude or []), source), "model": "tfidf_cosine_similarity"}


@app.post("/recommendations/ingredients", dependencies=[Depends(_authorize)])
def ingredient_recommendations(payload: IngredientRequest):
    models = _models()
    return {"recipes": recommend_for_ingredients(models["recommendation"], payload.ingredients, payload.limit, set(payload.exclude_recipe_ids), payload.source), "model": "tfidf_cosine_similarity"}


@app.get("/popularity/{recipe_id}", dependencies=[Depends(_authorize)])
def popularity(recipe_id: str):
    artifact = _models()["random_forest"]
    result = predict_popularity(artifact, recipe_id)
    if result is None:
        raise HTTPException(status_code=404, detail="No trained popularity profile exists for this recipe.")
    return {"prediction": result, "model": "random_forest_regressor"}


@app.get("/clusters", dependencies=[Depends(_authorize)])
def clusters():
    path = REPORTS / "kmeans.json"
    if not path.exists():
        raise HTTPException(status_code=503, detail="Cluster report is not available.")
    import json
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/discovery/recipehub", dependencies=[Depends(_authorize)])
def recipehub_discovery(limit: int = 100):
    if not 1 <= limit <= 200:
        raise HTTPException(status_code=422, detail="Limit must be between 1 and 200.")
    models = _models()
    recommendation = models["recommendation"]
    popularity = models["random_forest"]
    cluster_map = models["clusters"].get("recipe_clusters", {})
    candidates = []
    for item in recommendation["recipes"]:
        if item.get("source") != "recipehub":
            continue
        recipe_id = str(item["recipe_id"])
        features = popularity["recipe_features"].get(recipe_id)
        if not features:
            continue
        candidates.append((item, recipe_id, features))
    if not candidates:
        return {"recipes": [], "models": ["random_forest_regressor", "kmeans"]}
    import numpy as np
    import pandas as pd
    feature_frame = pd.DataFrame([features for _, _, features in candidates], columns=popularity["feature_columns"])
    predictions = np.maximum(0.0, np.expm1(popularity["pipeline"].predict(feature_frame)))
    results = []
    for (item, recipe_id, _), prediction in zip(candidates, predictions):
        results.append({
            "recipe_id": str(item["source_recipe_id"]),
            "title": item["title"],
            "category": item.get("category") or "Uncategorized",
            "minutes": item.get("minutes"),
            "ingredients": item.get("ingredients", []),
            "predicted_future_interactions": round(float(prediction), 2),
            "cluster": cluster_map.get(recipe_id),
        })
    results.sort(key=lambda recipe: (recipe["cluster"] is None, recipe["cluster"] or 0, recipe["title"].casefold()))
    return {"recipes": results[:limit], "models": ["random_forest_regressor", "kmeans"]}


@app.get("/clusters/{recipe_id}", dependencies=[Depends(_authorize)])
def recipe_cluster(recipe_id: str):
    mapping = _models()["clusters"].get("recipe_clusters", {})
    if recipe_id not in mapping:
        raise HTTPException(status_code=404, detail="No cluster assignment is available for this recipe.")
    return {"recipe_id": recipe_id, "cluster": mapping[recipe_id]}
