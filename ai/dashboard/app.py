"""Streamlit interface over processed datasets and saved, offline-trained models."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd
import streamlit as st

AI_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_ROOT))
from src.clustering_model import MODEL_PATH as CLUSTER_MODEL_PATH
from src.random_forest_model import MODEL_PATH as RF_MODEL_PATH, predict_popularity
from src.recommendation_model import MODEL_PATH as REC_MODEL_PATH, recommend, recommend_for_ingredients

PROCESSED = AI_ROOT / "datasets" / "processed"
REPORTS = AI_ROOT / "reports" / "evaluation"
PLOTS = AI_ROOT / "reports" / "visualisations"

st.set_page_config(page_title="RecipeHub AI", page_icon="🍲", layout="wide")
st.title("RecipeHub AI Laboratory")
st.caption("Food.com source data and optional anonymised RecipeHub exports. Models are trained offline and loaded from saved artifacts.")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


@st.cache_resource
def load_model(path: str):
    import joblib
    return joblib.load(path)


recipes_path = PROCESSED / "recipes_master.csv"
interactions_path = PROCESSED / "user_interactions.csv"
trained = all(path.exists() for path in (REC_MODEL_PATH, RF_MODEL_PATH, CLUSTER_MODEL_PATH))
recipes = pd.read_csv(recipes_path, keep_default_na=False) if recipes_path.exists() else pd.DataFrame()
interactions = pd.read_csv(interactions_path, keep_default_na=False, low_memory=False) if interactions_path.exists() else pd.DataFrame()
evaluation = read_json(REPORTS / "evaluation.json")

overview, rec_tab, rf_tab, cluster_tab, eval_tab, saturation_tab, dataset_tab = st.tabs(["Overview", "Recommendations", "Random Forest", "K-Means", "Evaluation", "Saturation", "Datasets"])

with overview:
    cols = st.columns(4)
    cols[0].metric("Recipes processed", f"{len(recipes):,}" if not recipes.empty else "—")
    cols[1].metric("Interaction rows", f"{len(interactions):,}" if not interactions.empty else "—")
    cols[2].metric("Saved models", f"{sum(p.exists() for p in (REC_MODEL_PATH, RF_MODEL_PATH, CLUSTER_MODEL_PATH))}/3")
    cols[3].metric("Evaluation report", "Available" if evaluation else "Not generated")
    if evaluation:
        st.dataframe(pd.DataFrame(evaluation["comparison"]), width="stretch", hide_index=True)
    if not trained:
        st.info("Train the saved models first. See ai/README.md for the PowerShell commands.")

with rec_tab:
    if REC_MODEL_PATH.exists() and not recipes.empty:
        model = load_model(str(REC_MODEL_PATH))
        recipe_ids = [item["recipe_id"] for item in model["recipes"]]
        title_by_id = {item["recipe_id"]: f"{item['title']} · {item['recipe_id']}" for item in model["recipes"]}
        chosen = st.selectbox("Find recipes similar to", recipe_ids, format_func=lambda value: title_by_id[value])
        limit = st.slider("Recommendations", 5, 20, 10)
        result = recommend(model, chosen, limit)
        st.dataframe(pd.DataFrame(result), width="stretch", hide_index=True)
        ingredients = st.text_input("Or search by ingredients (comma separated)")
        if ingredients.strip():
            found = recommend_for_ingredients(model, [part.strip() for part in ingredients.split(",")], limit)
            st.dataframe(pd.DataFrame(found), width="stretch", hide_index=True)
        if not result:
            st.info("No recipe text overlaps enough to make a useful recommendation.")
    else:
        st.info("Build datasets and train the TF-IDF recommendation model to use this section.")

with rf_tab:
    if RF_MODEL_PATH.exists() and not recipes.empty:
        model = load_model(str(RF_MODEL_PATH))
        ids = list(model["recipe_features"])
        titles = dict(zip(recipes.recipe_id.astype(str), recipes.title))
        chosen = st.selectbox("Recipe to score", ids, format_func=lambda value: f"{titles.get(value, value)} · {value}", key="rf_recipe")
        result = predict_popularity(model, chosen)
        if result:
            st.metric("Predicted future interactions", result["predicted_future_interactions"])
            st.caption(result["target"])
        report = read_json(REPORTS / "random_forest.json")
        if report:
            st.json(report["metrics"])
            st.image(str(PLOTS / "random_forest_importance.png"), caption="Random Forest feature importance") if (PLOTS / "random_forest_importance.png").exists() else None
    else:
        st.info("Train the Random Forest model to score recipes.")

with cluster_tab:
    cluster_report = read_json(REPORTS / "kmeans.json")
    if cluster_report:
        st.metric("Selected number of clusters", cluster_report["selected_k"])
        st.metric("Sampled silhouette", f"{cluster_report['silhouette_sample']:.3f}" if cluster_report["silhouette_sample"] is not None else "Unavailable")
        st.dataframe(pd.DataFrame(cluster_report["clusters"]), width="stretch", hide_index=True)
        image = PLOTS / "recipe_clusters.png"
        if image.exists(): st.image(str(image), caption="Recipe clusters projected into SVD space")
    else:
        st.info("Train K-Means to view cluster descriptions and visualisations.")

with eval_tab:
    if evaluation:
        st.dataframe(pd.DataFrame(evaluation["comparison"]), width="stretch", hide_index=True)
        st.write("Recommendation relevance is a rating-based proxy. Popularity errors are reported on the log1p target scale. Cluster scores measure geometric separation, not user satisfaction.")
        rec_report = evaluation["models"]["recommendation"]
        st.json(rec_report["metrics"])
        st.caption(rec_report["limitations"])
    else:
        st.info("Evaluation results appear after all models have been trained and evaluated.")

with saturation_tab:
    path = REPORTS / "saturation_experiment.csv"
    if path.exists():
        saturation = pd.read_csv(path)
        st.dataframe(saturation, width="stretch", hide_index=True)
        image = PLOTS / "saturation_comparison.png"
        if image.exists(): st.image(str(image), caption="Performance as training data grows")
    else:
        st.info("Saturation experiments have not been run yet.")

with dataset_tab:
    summary_path = PROCESSED / "dataset_summary.csv"
    if summary_path.exists():
        st.dataframe(pd.read_csv(summary_path), width="stretch", hide_index=True)
    if not recipes.empty:
        st.write("Recipes by source")
        st.bar_chart(recipes.groupby("source").size())
        st.write("Missing values by field")
        st.dataframe(recipes.isna().sum().rename("missing_values").to_frame(), width="stretch")
    st.markdown("Food.com data source: [Food.com Recipes and Interactions](https://www.kaggle.com/datasets/shuyangli94/food-com-recipes-and-user-interactions). Check the source dataset terms before redistribution.")
