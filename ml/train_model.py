"""Part D.2 / D.3 - train, evaluate and export everything the AI dashboards need.

Writes public/ai/metrics.json (read by the admin console dashboards).
"""
import json
import time
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score, precision_score,
                             recall_score, roc_auc_score, roc_curve)
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

SEED = 42
df = pd.read_csv("ml/data/recipebox_interactions.csv")
CAT = ["category", "skill", "time_pref", "device", "age_group", "source"]
NUM = ["cook_minutes", "difficulty", "rating", "n_ingredients", "n_steps", "category_match",
       "prior_favourites", "position", "hour", "is_weekend"]
FEATURES = CAT + NUM
X, y, groups = df[FEATURES], df["favourited"], df["user_id"]

# Split by USER so no person appears in both train and test (prevents leakage).
gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=SEED)
tr, te = next(gss.split(X, y, groups))
Xtr, Xte, ytr, yte = X.iloc[tr], X.iloc[te], y.iloc[tr], y.iloc[te]
gtr = groups.iloc[tr].to_numpy()


def make(name):
    pre = ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore"), CAT),
                             ("num", StandardScaler(), NUM)])
    est = {"Logistic Regression": LogisticRegression(max_iter=2000),
           "Random Forest": RandomForestClassifier(n_estimators=300, min_samples_leaf=10, n_jobs=-1, random_state=SEED),
           "Gradient Boosting": HistGradientBoostingClassifier(max_depth=4, learning_rate=0.06, max_iter=250, random_state=SEED)}[name]
    return Pipeline([("pre", pre), ("model", est)])


def best_threshold(y_true, p):
    ts = np.linspace(0.05, 0.8, 76)
    f1s = [f1_score(y_true, p >= t) for t in ts]
    return float(ts[int(np.argmax(f1s))])


models, fitted = [], {}
t0 = time.time()
for name in ["Logistic Regression", "Random Forest", "Gradient Boosting"]:
    pipe = make(name).fit(Xtr, ytr)
    p_te, p_tr = pipe.predict_proba(Xte)[:, 1], pipe.predict_proba(Xtr)[:, 1]
    thr = best_threshold(yte, p_te)
    fitted[name] = (pipe, p_te, thr)
    models.append(dict(name=name,
                       accuracy=accuracy_score(yte, p_te >= 0.5), precision=precision_score(yte, p_te >= thr),
                       recall=recall_score(yte, p_te >= thr), f1=f1_score(yte, p_te >= thr),
                       auc=roc_auc_score(yte, p_te), train_auc=roc_auc_score(ytr, p_tr),
                       threshold=thr, accuracy_at_threshold=accuracy_score(yte, p_te >= thr)))
best_name = max(models, key=lambda m: m["auc"])["name"]
pipe, p_best, thr = fitted[best_name]

baseline_acc = float(1 - yte.mean())  # always predicting "not favourited"
fpr, tpr, _ = roc_curve(yte, p_best)
idx = np.unique(np.linspace(0, len(fpr) - 1, 40).astype(int))
roc = [dict(fpr=float(fpr[i]), tpr=float(tpr[i])) for i in idx]
tn, fp, fn, tp = confusion_matrix(yte, p_best >= thr).ravel()

# Oracle: AUC achievable using the TRUE probabilities of the simulation (the noise ceiling).
oracle_auc = float(roc_auc_score(yte, df.loc[Xte.index, "true_probability"]))

# Learning curve -> saturation. Re-fit the best model on growing shares of the training users.
rng = np.random.default_rng(SEED)
users_tr = np.unique(gtr)
curve = []
for frac in [0.03, 0.06, 0.1, 0.2, 0.35, 0.5, 0.7, 0.85, 1.0]:
    aucs_te, aucs_tr, accs_te, accs_tr, rows = [], [], [], [], []
    for rep in range(3):
        pick = rng.choice(users_tr, max(5, int(len(users_tr) * frac)), replace=False)
        mask = np.isin(gtr, pick)
        m = make(best_name).fit(Xtr[mask], ytr[mask])
        pt, pr = m.predict_proba(Xte)[:, 1], m.predict_proba(Xtr[mask])[:, 1]
        aucs_te.append(roc_auc_score(yte, pt)); aucs_tr.append(roc_auc_score(ytr[mask], pr))
        accs_te.append(accuracy_score(yte, pt >= 0.5)); accs_tr.append(accuracy_score(ytr[mask], pr >= 0.5))
        rows.append(int(mask.sum()))
    curve.append(dict(n_rows=int(np.mean(rows)), train_auc=float(np.mean(aucs_tr)), test_auc=float(np.mean(aucs_te)),
                      train_acc=float(np.mean(accs_tr)), test_acc=float(np.mean(accs_te))))
final_auc = curve[-1]["test_auc"]
sat = next(c for c in curve if c["test_auc"] >= final_auc - 0.005)

# Permutation importance on the held-out set (raw columns, so one-hot groups stay together).
pi = permutation_importance(pipe, Xte, yte, scoring="roc_auc", n_repeats=5, random_state=SEED, n_jobs=-1)
importance = sorted([dict(feature=f, importance=float(m), std=float(s)) for f, m, s in zip(FEATURES, pi.importances_mean, pi.importances_std)],
                    key=lambda d: -d["importance"])

# ---- overview aggregates for dashboard 1 ----
def rate_by(col):
    g = df.groupby(col).favourited.agg(["mean", "count"]).reset_index()
    return [dict(label=(str(int(r[col])) if col in ("hour", "position") else str(r[col])), rate=float(r["mean"]), impressions=int(r["count"])) for _, r in g.iterrows()]
overview = dict(
    impressions=int(len(df)), users=int(df.user_id.nunique()), favourites=int(df.favourited.sum()),
    favourite_rate=float(df.favourited.mean()),
    by_category=sorted(rate_by("category"), key=lambda d: -d["rate"]),
    by_source=rate_by("source"), by_skill=rate_by("skill"), by_device=rate_by("device"),
    by_hour=[dict(label=str(d["label"]), rate=d["rate"], impressions=d["impressions"]) for d in sorted(rate_by("hour"), key=lambda d: int(d["label"]))],
    by_position=rate_by("position"),
)

# ---- recommendations for dashboard 3 (content discovery) ----
recipes = pd.read_csv("ml/data/recipes_table.csv")
cats = sorted(recipes.category.unique())
personas = [("Beginner, short on time", "beginner", "quick"), ("Beginner, flexible", "beginner", "flexible"),
            ("Intermediate, flexible", "intermediate", "flexible"), ("Advanced, flexible", "advanced", "flexible")]
rec_out = []
recipe_scores = {r.recipe_id: [] for r in recipes.itertuples()}
for label, skill, tpref in personas:
    scored = []
    for r in recipes.itertuples():
        rows = []
        for fav in cats:
            rows.append(dict(category=r.category, skill=skill, time_pref=tpref, device="mobile", age_group="25-34", source="home",
                             cook_minutes=r.cook_minutes, difficulty=r.difficulty, rating=r.rating, n_ingredients=r.n_ingredients,
                             n_steps=r.n_steps, category_match=int(fav == r.category), prior_favourites=1, position=1, hour=19, is_weekend=0))
        s = float(pipe.predict_proba(pd.DataFrame(rows)[FEATURES])[:, 1].mean())
        scored.append((r.recipe_id, r.title, s)); recipe_scores[r.recipe_id].append(s)
    scored.sort(key=lambda t: -t[2])
    rec_out.append(dict(persona=label, top=[dict(recipe_id=a, title=b, score=c) for a, b, c in scored[:3]]))
titles = dict(zip(recipes.recipe_id, recipes.title))
recipe_overview = sorted([dict(recipe_id=k, title=titles[k], score=float(np.mean(v))) for k, v in recipe_scores.items()], key=lambda d: -d["score"])

out = dict(
    meta=dict(synthetic=True, seed=SEED, rows=int(len(df)), users=int(df.user_id.nunique()), recipes=int(len(recipes)),
              train_rows=int(len(tr)), test_rows=int(len(te)), target="favourited (user saves a recipe)",
              objective="Boost engagement and enhance content discovery: rank recipes by the probability a user will favourite them.",
              split="GroupShuffleSplit by user (80/20)", seconds=round(time.time() - t0, 1)),
    overview=overview,
    models=models, best_model=best_name, baseline_accuracy=baseline_acc, threshold=thr,
    roc=roc, confusion=dict(tn=int(tn), fp=int(fp), fn=int(fn), tp=int(tp)),
    oracle_auc=oracle_auc, learning_curve=curve, saturation=dict(n_rows=sat["n_rows"], test_auc=sat["test_auc"], final_auc=final_auc, rule="smallest training size within 0.005 AUC of the full-data model"),
    importance=importance, recommendations=rec_out, recipe_scores=recipe_overview,
)
json.dump(out, open("public/ai/metrics.json", "w"), indent=1)
print("best:", best_name)
for m in models:
    print({k: (round(v, 3) if isinstance(v, float) else v) for k, v in m.items()})
print("baseline acc", round(baseline_acc, 3), "oracle auc", round(oracle_auc, 3))
print("saturation", sat["n_rows"], round(sat["test_auc"], 3), "final", round(final_auc, 3))
print("top features", [(d["feature"], round(d["importance"], 3)) for d in importance[:5]])
print("confusion", dict(tn=int(tn), fp=int(fp), fn=int(fn), tp=int(tp)), "thr", round(thr, 2))
