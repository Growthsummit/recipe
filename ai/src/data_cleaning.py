"""Shared, deterministic cleaning helpers for the Food.com datasets."""

from __future__ import annotations

import ast
import re
from typing import Any

import pandas as pd


def parse_list(value: Any) -> list[str]:
    """Parse Food.com Python-list fields without evaluating arbitrary code."""
    if isinstance(value, list):
        values = value
    elif pd.isna(value) or not str(value).strip():
        return []
    else:
        try:
            values = ast.literal_eval(str(value))
        except (ValueError, SyntaxError):
            return []
    if not isinstance(values, (list, tuple)):
        return []
    return [str(item).strip() for item in values if item is not None and str(item).strip()]


def clean_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def food_recipe_text(row: pd.Series) -> dict[str, Any]:
    tags = parse_list(row.get("tags"))
    ingredients = parse_list(row.get("ingredients"))
    steps = parse_list(row.get("steps"))
    nutrition = parse_list(row.get("nutrition"))
    return {
        "source": "foodcom",
        "source_recipe_id": str(int(row["id"])),
        "recipe_id": f"foodcom:{int(row['id'])}",
        "title": clean_text(row.get("name")),
        "minutes": pd.to_numeric(row.get("minutes"), errors="coerce"),
        "description": clean_text(row.get("description")),
        "ingredients": ingredients,
        "tags": tags,
        "category": tags[0] if tags else "Uncategorized",
        "n_ingredients": len(ingredients),
        "n_steps": len(steps),
        "nutrition": nutrition,
    }
