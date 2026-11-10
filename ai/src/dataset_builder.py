"""Prepare separate, provenance-aware RecipeHub and Food.com ML datasets.

The raw Food.com files are read only. Processed outputs are written to
ai/datasets/processed and can always be regenerated from their source files.
"""

from __future__ import annotations

import json
import hashlib
import hmac
import os
import secrets
from pathlib import Path

import numpy as np
import pandas as pd

from .data_cleaning import clean_text, food_recipe_text, parse_list

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "datasets" / "raw"
PROCESSED = ROOT / "datasets" / "processed"
SUMMARY = PROCESSED / "dataset_summary.csv"
RECIPE_COLUMNS = ["source", "source_recipe_id", "recipe_id", "title", "minutes", "description", "ingredients", "tags", "category", "n_ingredients", "n_steps", "nutrition"]
INTERACTION_COLUMNS = ["source", "source_user_id", "user_id", "recipe_id", "event_date", "rating", "interaction_type", "has_review"]


def _anonymization_key() -> bytes:
    configured = os.environ.get("AI_ANONYMIZATION_SECRET", "")
    if configured:
        return configured.encode("utf-8")
    key_path = ROOT / ".anon_key"
    if not key_path.exists():
        key_path.write_bytes(secrets.token_bytes(32))
        try:
            key_path.chmod(0o600)
        except OSError:
            pass
    return key_path.read_bytes()


def build_datasets() -> dict[str, int]:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    summary: list[dict[str, object]] = []

    recipes = pd.read_csv(RAW / "RAW_recipes.csv", low_memory=False)
    recipe_rows = len(recipes)
    recipe_missing_cells = int(recipes.isna().sum().sum())
    recipes["id"] = pd.to_numeric(recipes["id"], errors="coerce")
    recipes = recipes.dropna(subset=["id"]).copy()
    recipes["id"] = recipes["id"].astype("int64")
    dup_recipes = int(recipes.duplicated("id", keep="first").sum())
    recipes = recipes.drop_duplicates("id", keep="first")
    cleaned = pd.DataFrame([food_recipe_text(row) for _, row in recipes.iterrows()], columns=RECIPE_COLUMNS)
    cleaned = cleaned[cleaned.title.ne("")].copy()
    cleaned["minutes"] = pd.to_numeric(cleaned.minutes, errors="coerce").where(lambda s: s.ge(0))

    app_recipes_path = PROCESSED / "recipehub_recipes.json"
    app_interactions_path = PROCESSED / "recipehub_interactions.json"
    if app_recipes_path.exists():
        app_recipes = pd.DataFrame(json.loads(app_recipes_path.read_text(encoding="utf-8")))
        if not app_recipes.empty:
            app_recipes = app_recipes.reindex(columns=RECIPE_COLUMNS)
            cleaned = pd.concat([cleaned, app_recipes], ignore_index=True)

    interactions_path = RAW / "RAW_interactions.csv"
    interactions = pd.read_csv(interactions_path, dtype={"user_id": "string", "recipe_id": "string"}, low_memory=False)
    interaction_rows = len(interactions)
    interaction_missing_cells = int(interactions.isna().sum().sum())
    interactions["recipe_id"] = pd.to_numeric(interactions.recipe_id, errors="coerce")
    interactions["rating"] = pd.to_numeric(interactions.rating, errors="coerce")
    interactions["date"] = pd.to_datetime(interactions.date, errors="coerce", utc=True)
    valid_recipe_ids = set(recipes.id.astype("int64"))
    invalid_id_rows = int(interactions.recipe_id.isna().sum())
    orphan_rows = int((interactions.recipe_id.notna() & ~interactions.recipe_id.isin(valid_recipe_ids)).sum())
    invalid_rating_rows = int((~interactions.rating.between(1, 5)).sum())
    interactions = interactions.dropna(subset=["user_id", "recipe_id", "date"])
    interactions = interactions[interactions.recipe_id.isin(valid_recipe_ids)]
    interactions = interactions[interactions.rating.between(1, 5)].copy()
    interactions["recipe_id"] = interactions.recipe_id.astype("int64")
    anon_key = _anonymization_key()
    interactions["user_id"] = interactions.user_id.astype(str).map(lambda value: f"foodcom:{hmac.new(anon_key, ('foodcom-user:' + value).encode('utf-8'), hashlib.sha256).hexdigest()[:32]}")
    interactions["recipe_id"] = interactions.recipe_id.map(lambda value: f"foodcom:{value}")
    interactions["source"] = "foodcom"
    interactions["source_user_id"] = ""
    interactions["event_date"] = interactions.date.dt.strftime("%Y-%m-%d")
    interactions["interaction_type"] = np.where(interactions.rating >= 4, "positive_rating", "rating")
    interactions["has_review"] = interactions.review.map(lambda value: bool(clean_text(value)))
    dup_interactions = int(interactions.duplicated(["user_id", "recipe_id", "event_date", "rating"]).sum())
    interactions = interactions.drop_duplicates(["user_id", "recipe_id", "event_date", "rating"])
    interactions = interactions.drop(columns=["review"])
    app_interactions = pd.DataFrame()
    if app_interactions_path.exists():
        app_interactions = pd.DataFrame(json.loads(app_interactions_path.read_text(encoding="utf-8")))
    if not app_interactions.empty:
        interactions = pd.concat([interactions.reindex(columns=INTERACTION_COLUMNS), app_interactions.reindex(columns=INTERACTION_COLUMNS)], ignore_index=True)

    recipe_out = cleaned.copy()
    for column in ("ingredients", "tags", "nutrition"):
        recipe_out[column] = recipe_out[column].map(lambda value: json.dumps(value if isinstance(value, list) else parse_list(value), ensure_ascii=False))
    recipe_out.to_csv(PROCESSED / "recipes_master.csv", index=False)
    interactions.reindex(columns=INTERACTION_COLUMNS).to_csv(PROCESSED / "user_interactions.csv", index=False)
    summary.extend([
        {"source": "foodcom_recipes", "input_rows": recipe_rows, "output_rows": int(cleaned.source.eq("foodcom").sum()), "duplicates_removed": dup_recipes, "missing_cells": recipe_missing_cells, "invalid_or_missing_rows": recipe_rows - int(cleaned.source.eq("foodcom").sum()) - dup_recipes, "notes": "Recipe identifiers retained with foodcom: prefix; missing text is blank, malformed list fields become empty lists; raw file unchanged."},
        {"source": "foodcom_interactions", "input_rows": interaction_rows, "output_rows": len(interactions[interactions.source.eq("foodcom")]), "duplicates_removed": dup_interactions, "missing_cells": interaction_missing_cells, "invalid_or_missing_rows": interaction_rows - len(interactions[interactions.source.eq("foodcom")]) - dup_interactions, "notes": f"Removed {invalid_id_rows} invalid IDs, {orphan_rows} recipe orphans, {invalid_rating_rows} ratings outside 1–5, incomplete records, and duplicate events. Review text excluded."},
        {"source": "recipehub_recipes", "input_rows": len(app_recipes) if app_recipes_path.exists() else 0, "output_rows": len(app_recipes) if app_recipes_path.exists() else 0, "duplicates_removed": 0, "missing_cells": 0, "invalid_or_missing_rows": 0, "notes": "Optional live export; only the confirmed schema's recipe, ingredients and category fields are included."},
        {"source": "recipehub_interactions", "input_rows": len(app_interactions), "output_rows": len(app_interactions), "duplicates_removed": 0, "missing_cells": 0, "invalid_or_missing_rows": 0, "notes": "Ratings, favourites and cooking-history events only; user identifiers are HMAC-pseudonymised by backend/scripts/exportAiDataset.js. No profile fields or review text."},
    ])
    pd.DataFrame(summary).to_csv(SUMMARY, index=False)
    return {"recipes": len(recipe_out), "interactions": len(interactions), "foodcom_recipes": len(recipes), "foodcom_interactions": len(interactions[interactions.source.eq("foodcom")])}


if __name__ == "__main__":
    print(json.dumps(build_datasets(), indent=2))
