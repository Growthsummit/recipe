"""Explicit offline training command; normal API requests never train models."""

from __future__ import annotations

import json

from .clustering_model import train_kmeans
from .dataset_builder import build_datasets
from .evaluation import run_evaluation
from .random_forest_model import train_random_forest
from .recommendation_model import train_recommender
from .serving_models import build_serving_models


def main():
    datasets = build_datasets()
    recommender = train_recommender()
    random_forest = train_random_forest(saturation=True)
    clusters = train_kmeans(saturation=True)
    report = run_evaluation()
    serving = build_serving_models()
    summary = {"datasets": datasets, "models": {"recommendation": {"recipes": len(recommender["recipes"])}, "random_forest": random_forest["metrics"], "kmeans": {"selected_k": clusters["selected_k"], "silhouette_sample": clusters["silhouette_sample"]}}, "serving": serving, "evaluation": str(report)}
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
