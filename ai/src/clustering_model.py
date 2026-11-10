"""K-Means recipe clustering from ingredients, categories and recipe attributes."""

from __future__ import annotations

import json
import hashlib
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.sparse import hstack
from sklearn.cluster import KMeans
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from .data_cleaning import parse_list
from .recommendation_model import PROCESSED

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "models" / "kmeans" / "recipe_clusters.joblib"
ASSIGNMENTS = ROOT / "reports" / "evaluation" / "cluster_assignments.csv"
REPORT = ROOT / "reports" / "evaluation" / "kmeans.json"
PLOT_DIR = ROOT / "reports" / "visualisations"
SEED = 42


def _numeric(recipes: pd.DataFrame) -> np.ndarray:
    values = recipes[["minutes", "n_ingredients", "n_steps"]].apply(pd.to_numeric, errors="coerce")
    values = values.replace([np.inf, -np.inf], np.nan)
    values = values.fillna(values.median()).fillna(0)
    values["minutes"] = values.minutes.clip(0, 600)
    return StandardScaler().fit_transform(values)


def _feature_matrix(recipes: pd.DataFrame, vectorizer: TfidfVectorizer | None = None, category_encoder: OneHotEncoder | None = None):
    ingredient_text = recipes.ingredients.map(lambda value: " ".join(parse_list(value)))
    vectorizer = vectorizer or TfidfVectorizer(stop_words="english", min_df=2, max_features=60_000, dtype=np.float32)
    ingredients = vectorizer.fit_transform(ingredient_text) if vectorizer.vocabulary is None else vectorizer.transform(ingredient_text)
    category_encoder = category_encoder or OneHotEncoder(handle_unknown="ignore", sparse_output=True, dtype=np.float32)
    categories = recipes[["category"]].fillna("Uncategorized").replace("", "Uncategorized")
    encoded_categories = category_encoder.fit_transform(categories) if not hasattr(category_encoder, "categories_") else category_encoder.transform(categories)
    matrix = hstack([ingredients, encoded_categories, _numeric(recipes)], format="csr")
    return matrix, vectorizer, category_encoder


def _describe(recipes: pd.DataFrame, labels: np.ndarray) -> list[dict]:
    frame = recipes.copy()
    frame["cluster"] = labels
    output = []
    for cluster_id, group in frame.groupby("cluster"):
        cats = group.category.value_counts().head(5)
        ingredient_counts: dict[str, int] = {}
        for value in group.ingredients:
            for ingredient in parse_list(value):
                key = ingredient.lower()
                ingredient_counts[key] = ingredient_counts.get(key, 0) + 1
        output.append({"cluster": int(cluster_id), "recipes": int(len(group)), "avg_minutes": float(pd.to_numeric(group.minutes, errors="coerce").mean()), "avg_ingredients": float(pd.to_numeric(group.n_ingredients, errors="coerce").mean()), "top_categories": cats.index.tolist(), "top_ingredients": [name for name, _ in sorted(ingredient_counts.items(), key=lambda pair: -pair[1])[:10]]})
    return output


def _sampled_silhouette(values: np.ndarray, labels: np.ndarray, per_cluster: int = 700) -> float | None:
    unique = np.unique(labels)
    if len(unique) < 2 or len(unique) >= len(labels):
        return None
    rng = np.random.default_rng(SEED)
    selected = []
    for cluster in unique:
        members = np.flatnonzero(labels == cluster)
        selected.extend(rng.choice(members, min(per_cluster, len(members)), replace=False).tolist())
    chosen = np.asarray(selected, dtype=int)
    if len(np.unique(labels[chosen])) < 2 or len(chosen) <= len(unique):
        return None
    return float(silhouette_score(values[chosen], labels[chosen]))


def _user_profiles(recipes: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    interactions = pd.read_csv(PROCESSED / "user_interactions.csv", keep_default_na=False, low_memory=False)
    interactions = interactions[(interactions.source.eq("foodcom")) & interactions.rating.ne("")].copy()
    interactions["rating"] = pd.to_numeric(interactions.rating, errors="coerce")
    category = recipes.set_index("recipe_id").category.to_dict()
    interactions["category"] = interactions.recipe_id.map(category).fillna("Uncategorized")
    top_categories = interactions.category.value_counts().head(30).index.tolist()
    interactions["category"] = interactions.category.where(interactions.category.isin(top_categories), "Other")
    profile = interactions.pivot_table(index="user_id", columns="category", values="rating", aggfunc="count", fill_value=0)
    profile = profile.div(profile.sum(axis=1).replace(0, 1), axis=0)
    stats = interactions.groupby("user_id").agg(avg_rating=("rating", "mean"), interaction_count=("recipe_id", "size"), categories_used=("category", "nunique"))
    profile = profile.join(stats).fillna(0)
    columns = list(profile.columns)
    profile.index = [hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:32] for value in profile.index]
    return profile, columns


def train_kmeans(saturation: bool = True) -> dict:
    recipes = pd.read_csv(PROCESSED / "recipes_master.csv", keep_default_na=False).drop_duplicates("recipe_id").reset_index(drop=True)
    matrix, vectorizer, category_encoder = _feature_matrix(recipes)
    # Reduce the sparse TF-IDF space to a compact dense representation before K-Means.
    n_components = min(40, max(2, matrix.shape[1] - 1), max(2, matrix.shape[0] - 1))
    svd = TruncatedSVD(n_components=n_components, n_iter=7, random_state=SEED)
    reduced = svd.fit_transform(matrix)
    n = min(len(reduced), 8_000)
    sample = np.random.default_rng(SEED).choice(len(reduced), n, replace=False)
    k_rows = []
    best_k, best_silhouette = 2, -1.0
    for k in range(2, min(9, n - 1)):
        fitted = KMeans(n_clusters=k, n_init=10, random_state=SEED).fit(reduced[sample])
        score = _sampled_silhouette(reduced[sample], fitted.labels_)
        k_rows.append({"k": k, "inertia": float(fitted.inertia_), "silhouette": score})
        if score is not None and score > best_silhouette:
            best_k, best_silhouette = k, score
    model = KMeans(n_clusters=best_k, n_init=20, random_state=SEED).fit(reduced)
    labels = model.labels_
    summaries = _describe(recipes, labels)
    report = {"model": "KMeans", "feature_sources": ["TF-IDF recipe ingredients", "scaled cooking time", "scaled ingredient count", "scaled step count"], "recipes": len(recipes), "selected_k": best_k, "selection_rule": "highest silhouette among k=2..8 on a fixed reproducible sample; elbow inertias also saved", "selection_sample_size": n, "selection": k_rows, "silhouette_sample": _sampled_silhouette(reduced[sample], model.labels_[sample]), "clusters": summaries}
    saturation_rows = []
    if saturation:
        rng = np.random.default_rng(SEED)
        all_indices = np.arange(len(reduced))
        training_pool = np.sort(rng.choice(all_indices, size=max(best_k + 2, int(len(all_indices) * 0.8)), replace=False))
        validation = np.setdiff1d(all_indices, training_pool)
        for fraction in (0.2, 0.4, 0.6, 0.8, 1.0):
            n_train = max(best_k + 1, int(len(training_pool) * fraction))
            training = np.sort(rng.choice(training_pool, min(n_train, len(training_pool)), replace=False))
            fit = KMeans(n_clusters=best_k, n_init=10, random_state=SEED).fit(reduced[training])
            val_labels = fit.predict(reduced[validation])
            score = _sampled_silhouette(reduced[validation], val_labels)
            saturation_rows.append({"model": "kmeans", "training_percent": int(fraction * 100), "training_rows": len(training), "inertia": float(fit.inertia_), "validation_silhouette": score})
    user_report = None
    user_model = None
    user_assignments = None
    profile, user_columns = _user_profiles(recipes)
    if len(profile) >= 50:
        user_values = StandardScaler().fit_transform(profile.to_numpy(dtype=float))
        user_n = min(len(user_values), 8_000)
        user_sample = np.random.default_rng(SEED).choice(len(user_values), user_n, replace=False)
        user_selection = []
        user_best_k, user_best_score = 2, -1.0
        for k in range(2, min(9, user_n - 1)):
            fitted = KMeans(n_clusters=k, n_init=10, random_state=SEED).fit(user_values[user_sample])
            score = _sampled_silhouette(user_values[user_sample], fitted.labels_)
            user_selection.append({"k": k, "inertia": float(fitted.inertia_), "silhouette": score})
            if score is not None and score > user_best_score:
                user_best_k, user_best_score = k, score
        user_model = KMeans(n_clusters=user_best_k, n_init=20, random_state=SEED).fit(user_values)
        user_labels = user_model.labels_
        user_assignments = pd.DataFrame({"user_hash": profile.index, "cluster": user_labels})
        user_frame = profile.copy()
        user_frame["cluster"] = user_labels
        user_summaries = []
        category_columns = [column for column in user_columns if column not in {"avg_rating", "interaction_count", "categories_used"}]
        for cluster_id, group in user_frame.groupby("cluster"):
            group_categories = group[category_columns].mean().sort_values(ascending=False).head(5)
            user_summaries.append({"cluster": int(cluster_id), "users": int(len(group)), "avg_rating": float(group.avg_rating.mean()), "avg_interactions": float(group.interaction_count.mean()), "avg_category_diversity": float(group.categories_used.mean()), "top_categories": group_categories.index.tolist()})
        user_report = {"source": "Food.com interactions only", "users": len(profile), "selected_k": user_best_k, "selection": user_selection, "clusters": user_summaries}
        if saturation:
            rng = np.random.default_rng(SEED)
            all_rows = np.arange(len(user_values))
            training_pool = np.sort(rng.choice(all_rows, size=max(user_best_k + 2, int(len(all_rows) * 0.8)), replace=False))
            validation = np.setdiff1d(all_rows, training_pool)
            for fraction in (0.2, 0.4, 0.6, 0.8, 1.0):
                n_train = max(user_best_k + 1, int(len(training_pool) * fraction))
                training = np.sort(rng.choice(training_pool, min(n_train, len(training_pool)), replace=False))
                fitted = KMeans(n_clusters=user_best_k, n_init=10, random_state=SEED).fit(user_values[training])
                val_labels = fitted.predict(user_values[validation])
                score = _sampled_silhouette(user_values[validation], val_labels) if len(validation) else None
                saturation_rows.append({"model": "kmeans_users", "training_percent": int(fraction * 100), "training_rows": len(training), "inertia": float(fitted.inertia_), "validation_silhouette": score})
    report["saturation"] = saturation_rows
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    ASSIGNMENTS.parent.mkdir(parents=True, exist_ok=True)
    PLOT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({"vectorizer": vectorizer, "category_encoder": category_encoder, "svd": svd, "model": model, "recipes": recipes[["recipe_id", "title", "source", "category"]].to_dict(orient="records"), "recipe_clusters": dict(zip(recipes.recipe_id, map(int, labels))), "user_model": user_model, "user_feature_columns": user_columns}, MODEL_PATH, compress=3)
    assignments = recipes[["recipe_id", "source", "title", "category"]].copy()
    assignments["cluster"] = labels
    assignments.to_csv(ASSIGNMENTS, index=False)
    if user_assignments is not None:
        user_assignments.to_csv(REPORT.parent / "user_cluster_assignments.csv", index=False)
    report["user_clustering"] = user_report
    report["saturation"] = saturation_rows
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    _plot_clusters(reduced, labels, model.cluster_centers_, PLOT_DIR / "recipe_clusters.png")
    return report


def _plot_clusters(reduced, labels, centers, output: Path):
    points = reduced[:, :2]
    fig, ax = plt.subplots(figsize=(10, 6))
    sample = np.random.default_rng(SEED).choice(len(points), min(len(points), 6_000), replace=False)
    scatter = ax.scatter(points[sample, 0], points[sample, 1], c=labels[sample], cmap="tab10", s=8, alpha=0.55)
    ax.set(title="Recipe K-Means clusters (first two SVD components)", xlabel="SVD component 1", ylabel="SVD component 2")
    fig.colorbar(scatter, ax=ax, label="Cluster")
    fig.tight_layout(); fig.savefig(output, dpi=150); plt.close(fig)


if __name__ == "__main__":
    print(json.dumps(train_kmeans(), indent=2))
