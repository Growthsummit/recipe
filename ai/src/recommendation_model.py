"""Content-based recommendations using TF-IDF and sparse cosine similarity."""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel

from .data_cleaning import clean_text, parse_list

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "datasets" / "processed"
MODEL_PATH = ROOT / "models" / "recommendation" / "tfidf.joblib"


def recipe_document(row: pd.Series) -> str:
    ingredients = parse_list(row.get("ingredients"))
    tags = parse_list(row.get("tags"))
    values = [clean_text(row.get("title")), " ".join(ingredients), clean_text(row.get("description")), " ".join(tags), clean_text(row.get("category"))]
    return " ".join(value.lower() for value in values if value)


def train_recommender() -> dict:
    recipes = pd.read_csv(PROCESSED / "recipes_master.csv", keep_default_na=False)
    recipes = recipes.drop_duplicates("recipe_id", keep="first").reset_index(drop=True)
    docs = recipes.apply(recipe_document, axis=1)
    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), min_df=2, max_features=180_000, sublinear_tf=True, dtype=np.float32)
    matrix = vectorizer.fit_transform(docs)
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    artifact = {"version": 1, "vectorizer": vectorizer, "matrix": matrix, "recipes": recipes.to_dict(orient="records"), "recipe_to_index": {value: idx for idx, value in enumerate(recipes.recipe_id)} }
    joblib.dump(artifact, MODEL_PATH, compress=3)
    return artifact


def load_recommender() -> dict:
    return joblib.load(MODEL_PATH) if MODEL_PATH.exists() else train_recommender()


def _format(item: dict, score: float) -> dict:
    return {"recipe_id": str(item["recipe_id"]), "source": item["source"], "source_recipe_id": str(item["source_recipe_id"]), "title": item["title"], "category": item.get("category") or "Uncategorized", "minutes": _number(item.get("minutes")), "ingredients": parse_list(item.get("ingredients")), "similarity": round(float(score), 4)}


def _number(value):
    try:
        number = float(value)
        return number if np.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def recommend(artifact: dict, recipe_id: str, limit: int = 10, exclude_ids: set[str] | None = None, source: str | None = None) -> list[dict]:
    idx = artifact["recipe_to_index"].get(str(recipe_id))
    if idx is None:
        return []
    scores = linear_kernel(artifact["matrix"][idx], artifact["matrix"]).ravel()
    scores[idx] = -1
    excluded = set(exclude_ids or ()) | {str(recipe_id)}
    ordered = np.argsort(scores)[::-1]
    results = []
    for candidate_idx in ordered:
        item = artifact["recipes"][int(candidate_idx)]
        if item["recipe_id"] in excluded or (source and item["source"] != source):
            continue
        score = float(scores[candidate_idx])
        if score <= 0:
            continue
        results.append(_format(item, score))
        if len(results) >= limit:
            break
    return results


def recommend_for_ingredients(artifact: dict, ingredients: list[str], limit: int = 10, exclude_ids: set[str] | None = None, source: str | None = None) -> list[dict]:
    query = " ".join(clean_text(item).lower() for item in ingredients if clean_text(item))
    if not query:
        return []
    query_vector = artifact["vectorizer"].transform([query])
    scores = linear_kernel(query_vector, artifact["matrix"]).ravel()
    excluded = set(exclude_ids or ())
    results = []
    for idx in np.argsort(scores)[::-1]:
        item = artifact["recipes"][int(idx)]
        if item["recipe_id"] in excluded or (source and item["source"] != source):
            continue
        score = float(scores[idx])
        if score <= 0:
            break
        results.append(_format(item, score))
        if len(results) >= limit:
            break
    return results


if __name__ == "__main__":
    model = train_recommender()
    print(json.dumps({"recipes": len(model["recipes"]), "features": len(model["vectorizer"].vocabulary_), "model": str(MODEL_PATH)}, indent=2))
