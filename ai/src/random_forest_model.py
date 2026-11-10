"""Random Forest regressor for next-period recipe engagement (Food.com only).

Target: number of recipe interactions after a fixed chronological cutoff.
Every predictor is derived only from recipe attributes and interactions before
that cutoff, avoiding target/future leakage.
"""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "datasets" / "processed"
MODEL_PATH = ROOT / "models" / "random_forest" / "popularity.joblib"
REPORT_PATH = ROOT / "reports" / "evaluation" / "random_forest.json"
NUMERIC = ["minutes", "n_ingredients", "n_steps", "nutrition_calories", "prior_interactions", "prior_mean_rating"]
CATEGORICAL = ["category"]
FEATURES = NUMERIC + CATEGORICAL
SEED = 42


def _recipes_and_target() -> tuple[pd.DataFrame, pd.Series, pd.Timestamp, pd.DataFrame]:
    recipes_all = pd.read_csv(PROCESSED / "recipes_master.csv", keep_default_na=False)
    recipes = recipes_all[recipes_all.source.eq("foodcom")].copy()
    interactions = pd.read_csv(PROCESSED / "user_interactions.csv", dtype={"recipe_id": "string", "user_id": "string", "has_review": "string"}, low_memory=False)
    interactions = interactions[interactions.source.eq("foodcom")].copy()
    interactions["event_date"] = pd.to_datetime(interactions.event_date, errors="coerce", utc=True)
    interactions["rating"] = pd.to_numeric(interactions.rating, errors="coerce")
    interactions = interactions.dropna(subset=["event_date", "recipe_id"])
    cutoff = interactions.event_date.quantile(0.8)
    before, after = interactions[interactions.event_date < cutoff], interactions[interactions.event_date >= cutoff]
    prior_count = before.groupby("recipe_id").size()
    prior_rating = before.groupby("recipe_id").rating.mean()
    future_count = after.groupby("recipe_id").size()
    def make_features(frame):
        frame = frame.copy()
        frame["recipe_id"] = frame.recipe_id.astype(str)
        frame["minutes"] = pd.to_numeric(frame.minutes, errors="coerce").where(lambda x: x.ge(0))
        frame["n_ingredients"] = pd.to_numeric(frame.n_ingredients, errors="coerce")
        frame["n_steps"] = pd.to_numeric(frame.n_steps, errors="coerce")
        frame["nutrition_calories"] = frame.nutrition.map(_calories)
        frame["prior_interactions"] = frame.recipe_id.map(prior_count).fillna(0)
        frame["prior_mean_rating"] = frame.recipe_id.map(prior_rating)
        frame["category"] = frame.category.replace("", "Uncategorized")
        return frame

    recipes = make_features(recipes)
    recipes_all = make_features(recipes_all)
    target = recipes.recipe_id.map(future_count).fillna(0).astype(float)
    return recipes, target, cutoff, recipes_all


def _calories(value):
    import ast
    try:
        data = value if isinstance(value, list) else ast.literal_eval(value) if value else []
        return float(data[0]) if data else np.nan
    except (ValueError, SyntaxError, TypeError, IndexError):
        return np.nan


def _pipeline() -> Pipeline:
    prep = ColumnTransformer([
        ("numeric", SimpleImputer(strategy="median", add_indicator=True), NUMERIC),
        ("category", Pipeline([("impute", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore", min_frequency=2))]), CATEGORICAL),
    ])
    model = RandomForestRegressor(n_estimators=80, max_depth=18, min_samples_leaf=3, max_features=0.8, n_jobs=-1, random_state=SEED)
    return Pipeline([("preprocess", prep), ("forest", model)])


def _measure(pipe: Pipeline, x_test: pd.DataFrame, y_test: pd.Series) -> dict:
    prediction = np.maximum(0, np.expm1(pipe.predict(x_test)))
    actual_log, predicted_log = np.log1p(y_test), np.log1p(prediction)
    return {"mae_log1p": float(mean_absolute_error(actual_log, predicted_log)), "rmse_log1p": float(np.sqrt(mean_squared_error(actual_log, predicted_log))), "r2_log1p": float(r2_score(actual_log, predicted_log)), "mae_interactions": float(mean_absolute_error(y_test, prediction))}


def train_random_forest(saturation: bool = True) -> dict:
    recipes, target, cutoff, recipe_library = _recipes_and_target()
    x = recipes[FEATURES]
    y = np.log1p(target)
    indices = np.arange(len(recipes))
    train_idx, test_idx = train_test_split(indices, test_size=0.2, random_state=SEED)
    x_train, x_test, y_train, y_test = x.iloc[train_idx], x.iloc[test_idx], y.iloc[train_idx], y.iloc[test_idx]
    pipe = _pipeline().fit(x_train, y_train)
    report = {"model": "RandomForestRegressor", "target": "log1p(Food.com interactions after the 80th percentile date)", "cutoff_utc": cutoff.isoformat(), "split": "fixed random 80/20 recipe split; all predictors use pre-cutoff data", "train_recipes": len(train_idx), "test_recipes": len(test_idx), "metrics": _measure(pipe, x_test, target.iloc[test_idx])}
    importance = pipe.named_steps["forest"].feature_importances_
    names = pipe.named_steps["preprocess"].get_feature_names_out()
    report["feature_importance"] = sorted([{"feature": str(name), "importance": float(value)} for name, value in zip(names, importance)], key=lambda item: -item["importance"])[:30]
    if saturation:
        curve = []
        rng = np.random.default_rng(SEED)
        for fraction in (0.2, 0.4, 0.6, 0.8, 1.0):
            n = max(10, int(len(train_idx) * fraction))
            chosen = np.sort(rng.choice(train_idx, size=min(n, len(train_idx)), replace=False))
            fitted = _pipeline().fit(x.iloc[chosen], y.iloc[chosen])
            curve.append({"model": "random_forest", "training_percent": int(fraction * 100), "training_rows": len(chosen), **_measure(fitted, x_test, target.iloc[test_idx])})
        report["saturation"] = curve
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"pipeline": pipe, "feature_columns": FEATURES, "recipe_features": recipe_library.set_index("recipe_id")[FEATURES].to_dict(orient="index"), "target_description": report["target"]}, MODEL_PATH, compress=3)
    import json
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def predict_popularity(artifact: dict, recipe_id: str) -> dict | None:
    features = artifact["recipe_features"].get(str(recipe_id))
    if not features:
        return None
    frame = pd.DataFrame([features], columns=artifact["feature_columns"])
    estimate = float(np.expm1(artifact["pipeline"].predict(frame)[0]))
    return {"recipe_id": recipe_id, "predicted_future_interactions": round(max(0.0, estimate), 2), "target": artifact["target_description"]}


def refresh_recipe_feature_library() -> int:
    """Add the exported RecipeHub catalog to inference without retraining the Food.com model."""
    artifact = joblib.load(MODEL_PATH)
    _, _, _, library = _recipes_and_target()
    artifact["recipe_features"] = library.set_index("recipe_id")[FEATURES].to_dict(orient="index")
    joblib.dump(artifact, MODEL_PATH, compress=3)
    return len(library)


if __name__ == "__main__":
    import json
    print(json.dumps(train_random_forest(), indent=2))
