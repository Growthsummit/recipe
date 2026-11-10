# RecipeHub AI

This adds an offline training and evaluation pipeline, a saved-model inference service, a Streamlit academic dashboard, and React/Express endpoints without replacing the existing application. The original CSV files under `datasets/raw/` are inputs only and are never rewritten.

## Existing data and provenance

The project contains Food.com `RAW_recipes.csv` and `RAW_interactions.csv` and an existing `ml/` demo pipeline. That earlier pipeline trains on simulated RecipeHub interactions. Its metrics remain explicitly labelled simulated and are not used by the models or reports in this directory.

The live Turso schema was inspected read-only. It has `recipes`, `recipe_ingredients`, `categories`, `ratings`, `favourites`, and `cooking_history` with the columns used by `backend/scripts/exportAiDataset.js`. At inspection time it contained 116 recipes, 917 ingredient links, 10 categories, 7 ratings, 4 favourites, and 6 cooking-history records. There is no search-event table. The small custom interaction history is exported for provenance and content coverage; model evaluation and future-engagement training use the larger Food.com set.

The provided Food.com files are a subset/version mismatch: the recipe file has IDs from 275,022–537,716, while the interactions file refers to 185,913 distinct recipe IDs. ID validation matched 83,781 recipe IDs and 234,428 interaction rows to the supplied recipe catalog. Interactions for recipes outside that catalog are excluded from model training and counted in `dataset_summary.csv`; the raw files are unchanged.

RecipeHub exports contain recipe content and interaction event type/date/rating. User IDs are HMAC pseudonyms made with the backend JWT secret; no emails, names, passwords, tokens, review text, or other user profile fields are exported. Food.com user IDs are also HMAC pseudonymised with a local key at `ai/.anon_key`; set `AI_ANONYMIZATION_SECRET` to supply a managed key. The key file is ignored by Git. Review text is deliberately reduced to a `has_review` flag so user-written text cannot leak personal information.

Food.com source: [Kaggle Food.com Recipes and Interactions](https://www.kaggle.com/datasets/shuyangli94/food-com-recipes-and-user-interactions). The source research describes the collection and its temporal interaction data in [Generating Personalized Recipes from Historical User Preferences](https://nijianmo.github.io/paper/emnlp19c.pdf). The Kaggle page does not expose a machine-readable license in this workspace. Confirm the dataset terms and Food.com rights before redistribution or commercial use; the project keeps source attribution and excludes raw data from Git.

## Directory map

```text
ai/
  datasets/raw/                User-provided Food.com CSVs (read only)
  datasets/processed/          Regenerated, Git-ignored outputs
  src/data_cleaning.py         Shared parsers and text cleanup
  src/dataset_builder.py       Validation, deduplication and master datasets
  src/recommendation_model.py  TF-IDF and sparse cosine retrieval
  src/random_forest_model.py  Temporal next-period engagement regression
  src/clustering_model.py      Recipe and eligible-user K-Means
  src/evaluation.py            Held-out metrics, reports and plots
  src/train_all.py             Explicit offline training command
  src/api.py                   Inference-only FastAPI application
  dashboard/app.py             Streamlit dashboard using saved outputs
  tests/                       Python data, model and inference API tests
  models/                      Saved Joblib models (committed so the deployed service can load them)
  reports/                     Evaluation JSON/CSV and visualisations
```

## PowerShell: local setup and execution

Run from the project root. `uv` provisions Python 3.12 and the versions allowed by `requirements.txt`. If package downloads are blocked, run the commands in an environment with access to PyPI.

```powershell
Set-Location C:\Users\DELL\Downloads\recipebox
$env:UV_CACHE_DIR = Join-Path $PWD '.uv-cache-task'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $PWD '.uv-python-task'

# Read available Turso tables and export anonymised RecipeHub content/events.
Set-Location backend
npm run export:ai
Set-Location ..

# Clean the Food.com sources, merge the optional RecipeHub export, train all
# models, evaluate them, and write the saturation results and charts.
uv run --directory ai --python 3.12 --with-requirements requirements.txt python -m src.train_all

# Run the automated AI tests.
uv run --directory ai --python 3.12 --with-requirements requirements.txt python -m unittest discover -s tests -v

# Launch the Streamlit dashboard.
uv run --directory ai --python 3.12 --with-requirements requirements.txt streamlit run dashboard/app.py
```

Run the Express API as usual from `backend` with `npm run dev`. To run the Python inference service in a second PowerShell window, set the same long random `AI_SERVICE_TOKEN` in both processes, set `AI_SERVICE_URL` in `backend/.env` (for example `http://127.0.0.1:8000/`), then run:

```powershell
Set-Location C:\Users\DELL\Downloads\recipebox
$env:UV_CACHE_DIR = Join-Path $PWD '.uv-cache-task'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $PWD '.uv-python-task'
$env:AI_SERVICE_TOKEN = '<same long random token as backend/.env>'
uv run --directory ai --python 3.12 --with-requirements requirements.txt uvicorn src.api:app --host 127.0.0.1 --port 8000
```

The main React application uses its existing `VITE_API_URL` setting; all AI model requests go through Express. It never receives Turso or AI-service credentials. The AI Kitchen in the app offers a TF-IDF ingredient finder, content matches conditioned on the signed-in user's dietary preferences and saved/cooked recipes, recipe-grounded cooking help, K-Means groups, and Random Forest future-engagement estimates. Finder and personalized results are restricted to actual published RecipeHub recipes so they open in the app. The cooking helper retrieves and presents real recipe descriptions, ingredients, and instructions; no generative AI service is configured, and it does not invent responses. Streamlit remains the separate evaluation dashboard.

## Dataset preparation

`npm run export:ai` only selects recipe, category, ingredient, rating, favourite, and cooking-history fields that actually exist. It checks which tables are present and treats optional interaction tables as absent when needed. The Python builder:

1. Reads source CSVs without writing to them.
2. Parses serialized lists with `ast.literal_eval`, cleans missing text, drops malformed recipe IDs, and keeps the first duplicate recipe ID.
3. Validates interaction recipe IDs against recipes; removes orphan IDs, invalid dates, invalid ratings (outside 1–5), incomplete events, and duplicate user/recipe/date/rating events.
4. Excludes review text, preserves source labels and prefixes recipe identifiers (`foodcom:` / `recipehub:`), and writes `recipes_master.csv`, `user_interactions.csv`, and `dataset_summary.csv`.

`dataset_summary.csv` records source input/output counts, duplicates, invalid rows and cleaning notes. No live database row is modified. Interaction tables are event-level; cumulative `views_count` is not converted into fake timestamped interactions. There are no search logs in the confirmed schema.

## Models and evaluation

### TF-IDF recommendation

Recipe title, ingredients, description, tags and category (the first Food.com tag is a proxy because the source has no category column) are normalised and vectorised with unigram/bigram TF-IDF. A sparse cosine score ranks candidates, with selected/explicitly excluded recipes removed. Query-time retrieval scores one sparse row against the catalog; it does not create a dense all-pairs similarity matrix. Ingredient-only queries use the same vocabulary and ranking method.

Recommendation evaluation uses a per-user chronological 80/20 split over distinct recipes rated at least 4, with at most 500 seeded Food.com users who have at least four positive ratings. It records Precision@10, Recall@10, F1@10 and catalog coverage. These labels are rating-based relevance proxies, not observed click-through or satisfaction. Fixed users and held-out events are reused while training-history availability grows from 20% to 100%.

### Random Forest

The target is the number of Food.com interactions after the 80th-percentile interaction-date cutoff. Input features include recipe category, cooking time, ingredient/step counts, parsed calories, pre-cutoff interaction count and pre-cutoff mean rating. The RandomForestRegressor learns `log1p(future interaction count)`. A fixed seeded recipe-level 80/20 holdout is used; all predictors are computed before the cutoff. Reports give MAE/RMSE/R² on the log1p target plus MAE in interaction counts. Saturation uses the same test recipes and 20/40/60/80/100% of the training recipes. RecipeHub user events are not mixed into the Food.com time range.

### K-Means

Recipe features combine TF-IDF ingredients with scaled cooking time, ingredient count and step count. TruncatedSVD reduces the sparse ingredient representation before K-Means. Candidate `k=2..8` is compared with inertia (elbow) and a fixed sampled silhouette score; resulting clusters are described by category and ingredient frequency. When enough interactions exist, a separate user-clustering model uses only rating distributions, interaction count and category preference proportions. It excludes identifiable profile data and writes only pseudonymous assignment IDs. Silhouette and inertia are reported; clusters are descriptive groupings, not user labels or quality scores.

### Saturation and reports

One fixed seed (`42`) is used. Outputs include:

- `reports/evaluation/evaluation.json`
- `reports/evaluation/model_comparison.csv`
- `reports/evaluation/random_forest.json`
- `reports/evaluation/kmeans.json`
- `reports/evaluation/saturation_experiment.csv` and `.json`
- `reports/evaluation/cluster_assignments.csv` and optional `user_cluster_assignments.csv`
- `reports/visualisations/saturation_comparison.png`
- `reports/visualisations/random_forest_importance.png`
- `reports/visualisations/kmeans_elbow.png` and `recipe_clusters.png`

These files are generated only by executing training/evaluation. No metric values are embedded as sample values. The RF task is regression, so no confusion matrix is appropriate. The dashboard shows a setup message until actual reports exist.

## Express and React integration

Express mounts `/api/ai` and calls the Python service with a shared bearer token and a bounded 15-second default request timeout. Input schemas limit ingredient text, exclusions and result count. Python exposes health, similar-recipe and ingredient recommendations, future-engagement prediction, recipe cluster summaries, and a per-recipe cluster lookup. The service loads Joblib artifacts once during startup and never trains during API requests. When offline/unconfigured, Express returns an explicit service error; it does not fabricate fallback metrics.

Recipe details load similar items with a clear loading/error/empty state and show similarity scores and dataset categories. Food.com records can be recommended by the model but are not inserted into RecipeHub or presented as navigable app recipes. Popularity and cluster predictions are fetched only when the user asks for the additional insight.

## Deployment notes

- Deploy the existing Vite frontend to Vercel with `VITE_API_URL` pointing at Express. No AI token belongs in Vercel client variables.
- Deploy Express to Render with `AI_SERVICE_URL` set to the private AI service URL, `AI_SERVICE_TOKEN` shared only with the AI process, `AI_SERVICE_TIMEOUT_MS` (default 15000), and the existing Turso variables.
- Deploy `ai/src/api.py` as a separate Render Python web service running `uvicorn src.api:app --host 0.0.0.0 --port $PORT`. Set the same `AI_SERVICE_TOKEN`. The Joblib artifacts under `models/` are committed because the free tier offers no persistent disk to stage them; raw CSVs stay excluded. A private artifact store or persistent disk remains the better option if the models grow. Train in a one-off job, not in the web service startup path.
- The Streamlit dashboard can be deployed separately for assessment with the processed data, saved models and reports available in its private runtime. Protect the dashboard if it is publicly reachable.
- Turso connection credentials are used only by the one-off Node export. Training and inference need no database credentials.

No service has been deployed or production settings changed by this implementation.
