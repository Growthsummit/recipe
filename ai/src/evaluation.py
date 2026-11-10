"""Held-out recommendation metrics, combined reports, and academic plots."""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix
from sklearn.metrics.pairwise import linear_kernel

from .recommendation_model import MODEL_PATH, PROCESSED, train_recommender

ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "reports" / "evaluation"
PLOT_DIR = ROOT / "reports" / "visualisations"
SEED = 42


def evaluate_recommendations(artifact: dict, saturation: bool = True, max_users: int = 500, k: int = 10) -> dict:
    interactions = pd.read_csv(PROCESSED / "user_interactions.csv", dtype={"user_id": "string", "recipe_id": "string", "has_review": "string"}, low_memory=False)
    interactions = interactions[(interactions.source.eq("foodcom")) & (pd.to_numeric(interactions.rating, errors="coerce") >= 4)].copy()
    interactions["event_date"] = pd.to_datetime(interactions.event_date, errors="coerce", utc=True)
    interactions = interactions.dropna(subset=["event_date"]).sort_values("event_date")
    rng = np.random.default_rng(SEED)
    eligible = []
    recipe_to_index = artifact["recipe_to_index"]
    for user, group in interactions.groupby("user_id", sort=False):
        group = group.drop_duplicates("recipe_id", keep="last")
        ids = [recipe_to_index[r] for r in group.recipe_id if r in recipe_to_index]
        if len(ids) >= 4:
            split_at = max(1, min(len(ids) - 1, int(len(ids) * 0.8)))
            history, relevant = ids[:split_at], set(ids[split_at:]) - set(ids[:split_at])
            if history and relevant:
                eligible.append((str(user), history, relevant))
    if not eligible:
        raise ValueError("Not enough positive Food.com ratings to evaluate recommendations; need at least four per user.")
    picked = rng.choice(len(eligible), min(max_users, len(eligible)), replace=False)
    test_users = [eligible[int(index)] for index in picked]
    fractions = (0.2, 0.4, 0.6, 0.8, 1.0) if saturation else (1.0,)
    rows = []
    full_report = None
    for fraction in fractions:
        hits = 0
        relevant_total = 0
        recommended_total = 0
        covered: set[int] = set()
        scored_users = 0
        for _, history, relevant in test_users:
            n_history = max(1, int(len(history) * fraction))
            chosen = np.sort(rng.choice(history, min(n_history, len(history)), replace=False)) if fraction < 1 else np.asarray(history, dtype=int)
            profile = csr_matrix(artifact["matrix"][chosen].sum(axis=0))
            scores = linear_kernel(profile, artifact["matrix"]).ravel()
            scores[chosen] = -1
            order = np.argpartition(scores, -min(k, len(scores)))[-min(k, len(scores)):]
            order = order[np.argsort(scores[order])[::-1]]
            recommended = [int(index) for index in order if scores[index] > 0][:k]
            hits += len(set(recommended) & relevant)
            relevant_total += len(relevant)
            recommended_total += len(recommended)
            covered.update(recommended)
            scored_users += 1
        precision = hits / (scored_users * k) if scored_users else 0.0
        recall = hits / relevant_total if relevant_total else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        food_count = sum(1 for row in artifact["recipes"] if row["source"] == "foodcom")
        result = {"model": "tfidf_recommendation", "training_percent": int(fraction * 100), "training_rows": int(sum(max(1, int(len(row[1]) * fraction)) for row in test_users)), "users_evaluated": scored_users, "precision_at_k": precision, "recall_at_k": recall, "f1_at_k": f1, "catalog_coverage": len(covered) / food_count if food_count else 0.0, "k": k}
        rows.append(result)
        if fraction == 1.0:
            full_report = {key: value for key, value in result.items() if key != "training_percent"}
    return {"model": "TF-IDF + cosine similarity", "evaluation": "per-user chronological 80/20 split of positive ratings, with a fixed seeded sample of at most 500 users; relevance is rating >= 4; test set excludes no future recipes from the candidate catalog", "limitations": "Ratings are implicit relevance labels; the benchmark covers Food.com users with at least four positive ratings and does not establish production user satisfaction.", "metrics": full_report, "saturation": rows}


def _save_plots(recommendation: dict, random_forest: dict, kmeans: dict):
    PLOT_DIR.mkdir(parents=True, exist_ok=True)
    saturation = recommendation["saturation"] + random_forest.get("saturation", []) + kmeans.get("saturation", [])
    pd.DataFrame(saturation).to_csv(REPORT_DIR / "saturation_experiment.csv", index=False)
    with (REPORT_DIR / "saturation_experiment.json").open("w", encoding="utf-8") as file:
        json.dump(saturation, file, indent=2, allow_nan=False)
    fig, ax = plt.subplots(figsize=(9, 5))
    series = [("recall_at_k", "tfidf_recommendation", "Recommendation Recall@10"), ("mae_log1p", "random_forest", "Random Forest MAE (log1p)"), ("validation_silhouette", "kmeans", "Recipe K-Means silhouette"), ("validation_silhouette", "kmeans_users", "User K-Means silhouette")]
    for metric, model_name, label in series:
        grouped = [row for row in saturation if row.get("model") == model_name and metric in row and row[metric] is not None and np.isfinite(row[metric])]
        if grouped:
            ax.plot([row["training_percent"] for row in grouped], [row[metric] for row in grouped], marker="o", label=label)
    ax.set(xlabel="Training data available (%)", title="Model response to training data saturation")
    ax.legend(); ax.grid(alpha=0.2); fig.tight_layout(); fig.savefig(PLOT_DIR / "saturation_comparison.png", dpi=160); plt.close(fig)

    features = random_forest.get("feature_importance", [])[:15]
    if features:
        fig, ax = plt.subplots(figsize=(9, 6))
        labels = [item["feature"].replace("numeric__", "").replace("category__", "") for item in features][::-1]
        vals = [item["importance"] for item in features][::-1]
        ax.barh(labels, vals, color="#8d6748"); ax.set(title="Random Forest feature importance", xlabel="Impurity-based importance")
        fig.tight_layout(); fig.savefig(PLOT_DIR / "random_forest_importance.png", dpi=160); plt.close(fig)

    selection = kmeans.get("selection", [])
    if selection:
        fig, ax = plt.subplots(figsize=(8, 5))
        ax.plot([item["k"] for item in selection], [item["inertia"] for item in selection], marker="o")
        ax.set(xlabel="Number of clusters (k)", ylabel="Inertia", title="K-Means elbow curve")
        ax.grid(alpha=0.2); fig.tight_layout(); fig.savefig(PLOT_DIR / "kmeans_elbow.png", dpi=160); plt.close(fig)


def run_evaluation() -> dict:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    artifact = joblib.load(MODEL_PATH) if MODEL_PATH.exists() else train_recommender()
    rec = evaluate_recommendations(artifact)
    rf = json.loads((ROOT / "reports" / "evaluation" / "random_forest.json").read_text(encoding="utf-8"))
    km = json.loads((ROOT / "reports" / "evaluation" / "kmeans.json").read_text(encoding="utf-8"))
    report = {"seed": SEED, "models": {"recommendation": rec, "random_forest": rf, "kmeans": km}, "comparison": [
        {"model": "TF-IDF + cosine", "primary_metric": "Recall@10", "value": rec["metrics"]["recall_at_k"], "interpretation": "Share of held-out positive-rated recipes appearing in the top ten."},
        {"model": "Random Forest regression", "primary_metric": "MAE on log1p target", "value": rf["metrics"]["mae_log1p"], "interpretation": "Error for future interaction count on log1p scale; lower is better."},
        {"model": "K-Means", "primary_metric": "Silhouette score", "value": km["silhouette_sample"], "interpretation": "Cluster separation/cohesion on the recipe feature representation; higher is better."},
    ]}
    (REPORT_DIR / "evaluation.json").write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    pd.DataFrame(report["comparison"]).to_csv(REPORT_DIR / "model_comparison.csv", index=False)
    _save_plots(rec, rf, km)
    return report


if __name__ == "__main__":
    print(json.dumps(run_evaluation(), indent=2))
