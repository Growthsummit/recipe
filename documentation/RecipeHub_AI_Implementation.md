# RecipeHub AI Integration and Evaluation

## 1. Introduction and objectives

This work adds recipe similarity recommendations, recipe engagement prediction, recipe and user clustering, offline model evaluation, a separate Streamlit evaluation dashboard, and a user-facing AI Kitchen in the existing RecipeHub React application. Existing RecipeHub login, recipe operations, Turso storage, and blockchain modules remain in their existing code paths.

## 2. Data sources and provenance

The supplied Food.com files are `ai/datasets/raw/RAW_recipes.csv` and `ai/datasets/raw/RAW_interactions.csv`. The files were treated as immutable inputs. The source research describes historical Food.com recipes and reviews spanning 2000–2018; see [Majumder et al., “Generating Personalized Recipes from Historical User Preferences”](https://nijianmo.github.io/paper/emnlp19c.pdf) and the [Kaggle dataset page](https://www.kaggle.com/datasets/shuyangli94/food-com-recipes-and-user-interactions). The Kaggle page’s license was not machine-readable during implementation. Verify the source terms before redistribution or commercial use.

Read-only inspection of the live Turso schema found tables for recipes, recipe ingredients, categories, ratings, favourites, and cooking history. At inspection time those held 116 recipes, 917 ingredient links, 10 categories, 7 ratings, 4 favourites, and 6 cooking-history events. No search-event table was present. The optional RecipeHub export produced 116 recipe records and 17 interaction events. It excludes account/profile fields, review text, passwords and tokens; user IDs are HMAC pseudonyms.

The Food.com files are not a fully aligned pair: the supplied recipe IDs span 275,022–537,716, while interaction IDs span 38–537,716. Of 185,913 distinct interaction recipe IDs, 83,781 match the supplied catalog; 234,428 interaction rows point to those recipes. The builder removes out-of-catalog events rather than silently training on unavailable recipes.

## 3. Data cleaning and processed outputs

`ai/src/dataset_builder.py` parses serialized arrays with `ast.literal_eval`, normalizes missing text, removes duplicate recipe IDs, validates interaction recipe IDs, removes invalid dates and ratings outside 1–5, and de-duplicates same-user/same-recipe/same-date/same-rating events. It writes:

- `ai/datasets/processed/recipes_master.csv`
- `ai/datasets/processed/user_interactions.csv`
- `ai/datasets/processed/dataset_summary.csv`

The completed run retained 83,781 named Food.com recipes (one source row had no title) and 219,393 valid Food.com interaction rows. It removed 497,499 interactions whose recipe IDs are outside the supplied recipe catalog and rejected 51,832 invalid or missing ratings, plus incomplete records. It found 71 missing recipe cells and 169 missing interaction cells. The original source files were not changed. Review bodies are reduced to a boolean `has_review` field to avoid retaining potentially identifying free text.

## 4. Recommendation model

Recipe title, ingredients, description, tags and category proxy are combined into a text document. The source has no formal Food.com category column, so its first tag is preserved as a proxy. A word unigram/bigram TF-IDF vectorizer produces sparse vectors; cosine similarity ranks recipes. Ingredient-only queries use the same vectorizer. Retrieval computes a single query-to-catalog score vector and does not build a dense all-pairs matrix.

Evaluation uses distinct recipes per user, chronological 80/20 history/holdout, ratings ≥4 as a relevance proxy, and a fixed seeded sample of 500 users with at least four positive ratings. At K=10, observed results were:

| Metric | Result |
| --- | ---: |
| Precision@10 | 0.00120 |
| Recall@10 | 0.00176 |
| F1@10 | 0.00143 |
| Catalog coverage | 0.04125 |

These are low relevance scores. They show that content similarity is available to the application, but this evaluation does not support a claim of strong personalised ranking. Ratings are imperfect relevance labels; the test includes only a sampled subset of users and does not measure click-through or satisfaction. The app displays the similarity score as a content match, not as a probability that a user will like a recipe.

## 5. Random Forest popularity model

The model predicts the number of future Food.com interactions after the 80th percentile of interaction dates (cutoff: 2013-07-28 UTC). Inputs are recipe category/tag proxy, cooking time, ingredient count, step count, calories, pre-cutoff interaction count, and pre-cutoff mean rating. It trains a RandomForestRegressor on `log1p(future interaction count)`, with a fixed 80/20 recipe holdout. No post-cutoff data enters the predictors.

On 16,757 held-out recipes, the saved run achieved MAE 0.2611, RMSE 0.4069 and R² 0.2164 on the log1p target, and raw interaction-count MAE 0.5010. R² indicates modest predictive power. The most influential features were pre-cutoff interactions (0.245), parsed calories (0.202), missing prior-rating indicator (0.197), minutes (0.104), steps (0.090), and ingredient count (0.080). These are impurity importances, not causal effects. Prediction output describes a Food.com-derived future-interaction estimate and should not be interpreted as a calibrated RecipeHub forecast.

## 6. K-Means clusters

Recipe clustering uses TF-IDF ingredient terms, one-hot category/tag proxy, scaled cooking time, number of ingredients, and number of steps. TruncatedSVD reduces the sparse representation. Candidate k values 2–8 are compared with inertia and sampled silhouette; k=3 had the highest selected silhouette in the completed run. The full recipe set silhouette was 0.2729. Cluster descriptions show typical tags and ingredients; they are exploratory groupings, not recipe quality labels.

User clustering was run only on the larger Food.com interactions. Features were anonymised user interaction count, rating patterns and recipe-tag preference proportions. It produced 57,142 pseudonymous user profiles and k=2. Cluster sizes were 13,645 users (mean 1.16 interactions) and 43,497 users (mean 4.68 interactions). This split is strongly influenced by interaction frequency and does not represent personal demographics. RecipeHub’s 17 events were too few for custom-user clustering.

## 7. Saturation experiments

All models use random seed 42 and five training fractions; held-out data/users remain fixed when applicable.

| Model / metric | 20% | 40% | 60% | 80% | 100% |
| --- | ---: | ---: | ---: | ---: | ---: |
| TF-IDF Recall@10 | 0.00117 | 0.00088 | 0.00059 | 0.00146 | 0.00176 |
| Random Forest MAE (log1p; lower is better) | 0.26388 | 0.26470 | 0.26212 | 0.26173 | 0.26097 |
| Recipe K-Means validation silhouette | 0.27131 | 0.26658 | 0.27481 | 0.26921 | 0.26842 |

The forest improves modestly with more training data, with a small fluctuation at 40%. Recommendation Recall@10 is noisy and non-monotonic in this fixed 500-user sample; the 100% result is better than 20%, but remains low. Recipe-cluster silhouette also varies without a monotonic trend, which is expected for unsupervised cluster quality and does not establish that more data improves user outcomes. User-cluster validation silhouettes were not estimable at 20–80% because the fitted models assigned the fixed validation subset to one predicted cluster; the 100% fit returned 0.3679. These null values are preserved in the CSV/JSON rather than fabricated.

## 8. System integration

Offline training writes Joblib artifacts under `ai/models/` and metrics/plots under `ai/reports/`. FastAPI loads saved artifacts before advertising startup readiness and never starts training in response to a user request. Express exposes `/api/ai/health`, `/api/ai/recommendations/:recipeId`, `/api/ai/recommendations/ingredients`, `/api/ai/popularity/:recipeId`, `/api/ai/clusters`, `/api/ai/discovery`, and `/api/ai/clusters/:recipeId`. Express authenticates to the Python service using a server-side bearer token and enforces a 15-second default request timeout. AI Kitchen includes TF-IDF ingredient search, content recommendations conditioned on saved preferences and cooking/favourite history, recipe-grounded cooking help, K-Means recipe groups, and Random Forest engagement estimates. Cooking help retrieves published recipe details and instructions; it is not presented as generative AI. Recipe detail pages also show TF-IDF similar recipes and model insights with loading, empty, and error states.

Food.com results are not copied into the RecipeHub database. User-facing AI search and discovery are scoped to published RecipeHub recipes, so each result opens its actual recipe details. The Streamlit dashboard remains a separate administrative/academic interface that reads generated dataset summaries, saved models, metrics and charts; it does not contain hardcoded performance values.

## 9. Testing and local execution

Nine Python unit/inference tests pass, covering CSV list parsing, privacy-aware cleaning, ID validation, TF-IDF and ingredient recommendation, Random Forest training/prediction, K-Means assignment output, service authentication, request validation, and error handling. Full-data training and saturation execution completed and generated reports/plots. The Express-to-Python HTTP service and React browser flow still require a local end-to-end run with both services configured.

PowerShell commands are in [`ai/README.md`](../ai/README.md). In short: run `npm run export:ai` from `backend`, then `python -m src.train_all` from `ai`; start the FastAPI service and Express API in separate terminals, and run Streamlit with `streamlit run dashboard/app.py`.

## 10. Limitations and future work

The Food.com catalog/interaction mismatch discards most interaction rows for recipe-level training. Recommendation ranking is weak by offline Recall@10. Food.com labels and temporal behavior may not transfer to RecipeHub. Category is only a first-tag proxy. User clusters primarily separate interaction frequency and are not validated with external labels. RecipeHub interaction volume is not yet sufficient to train custom engagement or personalization models. Future work should obtain a consistently versioned dataset, improve relevance with a larger RecipeHub event sample and online/offline candidate baselines, calibrate engagement predictions on local events, and review the dataset’s redistribution rights.
