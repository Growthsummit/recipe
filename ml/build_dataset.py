"""Part D.1 - build the RecipeBox interaction dataset.

IMPORTANT: this is a SYNTHETIC dataset. The recipe attributes are real (taken from the app),
but the users and their behaviour are simulated with a documented rule + noise, because the
app has no real users yet. Any accuracy reported on it measures how well a model recovers the
simulation rules, NOT real-world performance. See README -> "AI: limits and honesty".
"""
import json
import numpy as np
import pandas as pd

SEED = 42
N_USERS = 1500
rng = np.random.default_rng(SEED)

recipes = json.load(open("ml/data/recipes.json"))
CAT = {"Deserts": "Desserts"}
rows = []
for r in recipes:
    cat = CAT.get(r["tags"][0], r["tags"][0])
    rows.append(dict(
        recipe_id=r["id"], title=r["title"], category=cat,
        cook_minutes=int(r["time"].split()[0]), difficulty=1 if r["difficulty"] == "Easy" else 2,
        rating=float(r["rating"]), n_ingredients=len(r["ingredients"]), n_steps=len(r["steps"]),
    ))
rec = pd.DataFrame(rows)
CATEGORIES = sorted(rec.category.unique())

users = pd.DataFrame({
    "user_id": np.arange(N_USERS),
    "skill": rng.choice(["beginner", "intermediate", "advanced"], N_USERS, p=[.5, .3, .2]),
    "time_pref": rng.choice(["quick", "flexible"], N_USERS, p=[.4, .6]),
    "device": rng.choice(["mobile", "desktop"], N_USERS, p=[.8, .2]),
    "age_group": rng.choice(["18-24", "25-34", "35-44", "45+"], N_USERS, p=[.4, .35, .15, .1]),
    "fav_category": rng.choice(CATEGORIES, N_USERS),
})

hour_p = np.array([1,1,1,1,1,2,3,4,4,3,3,5,6,4,3,3,4,6,8,9,8,6,3,2], float)
hour_p /= hour_p.sum()

recs = []
for _, u in users.iterrows():
    n = int(np.clip(rng.poisson(14), 4, 40))
    prior = 0
    for _ in range(n):
        r = rec.iloc[rng.integers(len(rec))]
        source = rng.choice(["home", "search", "category"], p=[.45, .35, .2])
        position = int(rng.integers(1, 5)) if source == "home" else int(rng.integers(1, 3))
        hour = int(rng.choice(24, p=hour_p))
        dow = int(rng.integers(0, 7))
        match = int(r.category == u.fav_category)
        logit = (-2.3 + 1.3 * match + 4.0 * (r.rating - 4.7)
                 + (0.6 if (u.time_pref == "quick" and r.cook_minutes <= 20) else 0)
                 - (0.5 if (u.time_pref == "quick" and r.cook_minutes >= 35) else 0)
                 + (-0.9 if (r.difficulty == 2 and u.skill == "beginner") else 0)
                 + (0.5 if (r.difficulty == 2 and u.skill == "advanced") else 0)
                 - 0.25 * (position - 1) + (0.4 if source == "search" else 0)
                 + (0.25 if 17 <= hour <= 21 else 0) + (0.15 if dow >= 5 else 0)
                 + 0.12 * min(prior, 5) + rng.normal(0, 0.6))
        p = 1 / (1 + np.exp(-logit))
        y = int(rng.random() < p)
        recs.append(dict(user_id=u.user_id, recipe_id=r.recipe_id, category=r.category,
                         cook_minutes=r.cook_minutes, difficulty=r.difficulty, rating=r.rating,
                         n_ingredients=r.n_ingredients, n_steps=r.n_steps,
                         skill=u.skill, time_pref=u.time_pref, device=u.device, age_group=u.age_group,
                         category_match=match, prior_favourites=prior, source=source, position=position,
                         hour=hour, is_weekend=int(dow >= 5), true_probability=round(float(p), 4), favourited=y))
        prior += y

df = pd.DataFrame(recs)
df.to_csv("ml/data/recipebox_interactions.csv", index=False)
rec.to_csv("ml/data/recipes_table.csv", index=False)
print(len(df), "interactions,", N_USERS, "users, favourite rate", round(df.favourited.mean(), 3))
