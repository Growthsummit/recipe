import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { useApp } from '../state/AppContext';

const SECTIONS = [
  { id: 'finder', label: 'Find a recipe' },
  { id: 'personal', label: 'For you' },
  { id: 'assistant', label: 'Cooking help' },
  { id: 'explore', label: 'Explore' },
];

function ingredientText(value) {
  if (typeof value === 'string') return value;
  return value?.displayText || value?.name || '';
}

function RecipeResult({ item, onOpen, detail }) {
  const recipeId = Number(item.source_recipe_id || item.recipe_id);
  if (!Number.isInteger(recipeId) || recipeId < 1) return null;
  return (
    <button type="button" className="ai-result" onClick={() => onOpen(recipeId)}>
      <span className="ai-result__title">{item.title}</span>
      <span className="ai-result__meta">
        {[item.category, item.minutes ? `${item.minutes} min` : null, item.similarity != null ? `${Math.round(item.similarity * 100)}% match` : null,
          item.predicted_future_interactions != null ? `Popularity estimate: ${item.predicted_future_interactions}` : null,
          item.cluster != null ? `Group ${item.cluster + 1}` : null].filter(Boolean).join(' · ')}
      </span>
      {detail && <span className="ai-result__hint">View recipe →</span>}
    </button>
  );
}

function Message({ error, children }) {
  return <p className={`ai-message${error ? ' ai-message--error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p>;
}

export default function AIScreen({ onOpenRecipe }) {
  const { isAuthenticated, initialising, requireAuth } = useApp();
  const [section, setSection] = useState('finder');
  const [ingredientDraft, setIngredientDraft] = useState('');
  const [ingredientResults, setIngredientResults] = useState([]);
  const [ingredientBusy, setIngredientBusy] = useState(false);
  const [ingredientError, setIngredientError] = useState('');
  const [ingredientSearched, setIngredientSearched] = useState(false);
  const [personalResults, setPersonalResults] = useState([]);
  const [personalBusy, setPersonalBusy] = useState(false);
  const [personalError, setPersonalError] = useState('');
  const [personalReady, setPersonalReady] = useState(false);
  const [personalHint, setPersonalHint] = useState('');
  const [question, setQuestion] = useState('');
  const [answerRecipes, setAnswerRecipes] = useState([]);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantError, setAssistantError] = useState('');
  const [assistantAsked, setAssistantAsked] = useState(false);
  const [discovery, setDiscovery] = useState([]);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [discoveryError, setDiscoveryError] = useState('');

  const findRecipes = async (event) => {
    event.preventDefault();
    const ingredients = [...new Set(ingredientDraft.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean))].slice(0, 30);
    if (!ingredients.length) {
      setIngredientError('Add one or more ingredients to get started.');
      setIngredientSearched(true);
      return;
    }
    setIngredientBusy(true);
    setIngredientError('');
    setIngredientSearched(true);
    setIngredientResults([]);
    try {
      const result = await api.ai.ingredientRecommendations(ingredients, 12, 'recipehub');
      setIngredientResults(result?.recipes || []);
    } catch (error) {
      setIngredientResults([]);
      setIngredientError(error.message || 'Recipe Finder is unavailable right now.');
    } finally {
      setIngredientBusy(false);
    }
  };

  const loadPersonalized = useCallback(async () => {
    if (!isAuthenticated) return;
    setPersonalBusy(true);
    setPersonalError('');
    setPersonalReady(false);
    try {
      const [preferencesResult, historyResult, favouritesResult] = await Promise.allSettled([
        api.preferences.get(), api.history.list({ limit: 8 }), api.favourites.list({ limit: 12 }),
      ]);
      const preferences = preferencesResult.status === 'fulfilled' ? preferencesResult.value?.preferences : null;
      const history = historyResult.status === 'fulfilled' ? historyResult.value?.items || [] : [];
      const favourites = favouritesResult.status === 'fulfilled' ? favouritesResult.value?.items || [] : [];
      const recentHistory = await Promise.allSettled(history.slice(0, 5).map((entry) => api.recipes.get(entry.recipeId)));
      const historyRecipes = recentHistory.flatMap((result) => result.status === 'fulfilled' && result.value?.recipe ? [result.value.recipe] : []);
      const usedIds = [...history.map((entry) => entry.recipeId), ...favourites.map((recipe) => recipe.id)]
        .map((id) => `recipehub:${id}`);
      const signals = [
        ...(preferences?.dietaryPreferences || []),
        ...favourites.flatMap((recipe) => recipe.ingredients || []),
        ...historyRecipes.flatMap((recipe) => recipe.ingredients || []),
      ].map(ingredientText).map((value) => value.trim()).filter(Boolean);
      const distinctSignals = [...new Set(signals)];
      if (!distinctSignals.length) {
        setPersonalResults([]);
        setPersonalHint('Save a recipe, record a cooked recipe, or add dietary preferences in your profile to personalize suggestions.');
      } else {
        const result = await api.ai.ingredientRecommendations(distinctSignals.slice(0, 30), 12, 'recipehub', usedIds.slice(0, 200));
        setPersonalResults(result?.recipes || []);
        setPersonalHint(`Based on ${preferences?.dietaryPreferences?.length || 0} dietary preference${preferences?.dietaryPreferences?.length === 1 ? '' : 's'}, ${history.length} recent cooking record${history.length === 1 ? '' : 's'} and ${favourites.length} saved recipe${favourites.length === 1 ? '' : 's'}.`);
      }
    } catch (error) {
      setPersonalError(error.message || 'Personalized suggestions are unavailable right now.');
    } finally {
      setPersonalBusy(false);
      setPersonalReady(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (section === 'personal' && isAuthenticated && !personalReady && !personalBusy) loadPersonalized();
  }, [section, isAuthenticated, personalReady, personalBusy, loadPersonalized]);

  const askAssistant = async (event) => {
    event.preventDefault();
    const query = question.trim();
    if (!query) {
      setAssistantError('Enter a cooking question or ingredients you need help with.');
      setAssistantAsked(true);
      return;
    }
    setAssistantBusy(true);
    setAssistantError('');
    setAssistantAsked(true);
    setAnswerRecipes([]);
    try {
      const matches = await api.ai.ingredientRecommendations([query.slice(0, 160)], 4, 'recipehub');
      const retrieved = matches?.recipes || [];
      const details = await Promise.allSettled(retrieved.map((item) => api.recipes.get(item.source_recipe_id)));
      setAnswerRecipes(retrieved.flatMap((item, index) => {
        const result = details[index];
        return result?.status === 'fulfilled' && result.value?.recipe ? [{ recommendation: item, recipe: result.value.recipe }] : [];
      }));
    } catch (error) {
      setAnswerRecipes([]);
      setAssistantError(error.message || 'Cooking help is unavailable right now.');
    } finally {
      setAssistantBusy(false);
    }
  };

  const loadDiscovery = useCallback(async () => {
    setDiscoveryBusy(true);
    setDiscoveryError('');
    try {
      const result = await api.ai.discovery(150);
      setDiscovery(result?.recipes || []);
    } catch (error) {
      setDiscoveryError(error.message || 'Recipe discovery is unavailable right now.');
    } finally {
      setDiscoveryBusy(false);
    }
  }, []);

  useEffect(() => {
    if (section === 'explore' && !discovery.length && !discoveryBusy && !discoveryError) loadDiscovery();
  }, [section, discovery.length, discoveryBusy, discoveryError, loadDiscovery]);

  const clusterGroups = useMemo(() => {
    const groups = new Map();
    discovery.forEach((recipe) => {
      if (recipe.cluster == null) return;
      if (!groups.has(recipe.cluster)) groups.set(recipe.cluster, []);
      groups.get(recipe.cluster).push(recipe);
    });
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [discovery]);

  const predictedPopular = useMemo(() => [...discovery]
    .sort((a, b) => b.predicted_future_interactions - a.predicted_future_interactions)
    .slice(0, 6), [discovery]);

  return (
    <div className="screen ai-screen">
      <div className="canvas ai-canvas">
        <header className="ai-heading">
          <p className="eyebrow">RECIPEBOX · AI KITCHEN</p>
          <h1 className="h-title">Cook something good</h1>
          <p>Real recipe suggestions, matched to what you have and what you like.</p>
        </header>

        <nav className="ai-tabs" aria-label="AI kitchen sections">
          {SECTIONS.map((item) => (
            <button key={item.id} type="button" className={section === item.id ? 'is-active' : ''} aria-pressed={section === item.id} onClick={() => setSection(item.id)}>{item.label}</button>
          ))}
        </nav>

        {section === 'finder' && (
          <section className="ai-panel">
            <h2>What’s in your kitchen?</h2>
            <p>Enter ingredients separated by commas or new lines. Recipe Finder ranks published RecipeHub recipes with the trained TF-IDF and cosine similarity model.</p>
            <form className="ai-form" onSubmit={findRecipes}>
              <label className="field"><span>Your ingredients</span><textarea rows={4} maxLength={1500} placeholder="chickpeas, spinach, coconut milk" value={ingredientDraft} onChange={(event) => setIngredientDraft(event.target.value)} /></label>
              <button type="submit" className="btn-primary btn-block" disabled={ingredientBusy}>{ingredientBusy ? 'Finding recipes…' : 'Find recipes'}</button>
            </form>
            {ingredientBusy && <Message>Matching your ingredients to recipes…</Message>}
            {ingredientError && <Message error>{ingredientError}</Message>}
            {!ingredientBusy && ingredientSearched && !ingredientError && ingredientResults.length === 0 && <Message>No RecipeHub recipes matched those ingredients. Try a few different terms.</Message>}
            {!ingredientBusy && ingredientResults.length > 0 && <div className="ai-results"><h3>Recipes for your ingredients</h3>{ingredientResults.map((item) => <RecipeResult key={item.recipe_id} item={item} onOpen={onOpenRecipe} detail />)}</div>}
          </section>
        )}

        {section === 'personal' && (
          <section className="ai-panel">
            <h2>Picked for you</h2>
            <p>Matches your saved dietary preferences with ingredients from recipes you have saved or cooked.</p>
            {initialising && <Message>Loading your account…</Message>}
            {!initialising && !isAuthenticated && <div className="ai-empty"><p>Sign in to get recommendations based on your preferences and cooking history.</p><button type="button" className="btn-primary" onClick={requireAuth}>Sign in</button></div>}
            {isAuthenticated && personalBusy && <Message>Looking at your preferences and recipe activity…</Message>}
            {personalError && <><Message error>{personalError}</Message><button type="button" className="btn-secondary" onClick={loadPersonalized} disabled={personalBusy}>Try personalized suggestions again</button></>}
            {isAuthenticated && personalReady && !personalError && personalHint && <p className="ai-data-note">{personalHint}</p>}
            {isAuthenticated && personalReady && !personalError && personalResults.length === 0 && <Message>Your profile is ready for recommendations. Save recipes, record what you cook, or add dietary preferences to give RecipeHub a starting point.</Message>}
            {personalResults.length > 0 && <div className="ai-results">{personalResults.map((item) => <RecipeResult key={item.recipe_id} item={item} onOpen={onOpenRecipe} detail />)}</div>}
          </section>
        )}

        {section === 'assistant' && (
          <section className="ai-panel">
            <h2>Cooking help</h2>
            <p>Ask about a dish or ingredients. RecipeHub retrieves matching recipes and shows their published ingredients and cooking steps. This is recipe retrieval, not generated advice.</p>
            <form className="ai-form" onSubmit={askAssistant}>
              <label className="field"><span>Your question</span><textarea rows={3} maxLength={160} placeholder="What can I cook with lentils and tomatoes?" value={question} onChange={(event) => setQuestion(event.target.value)} /></label>
              <button type="submit" className="btn-primary btn-block" disabled={assistantBusy}>{assistantBusy ? 'Looking through recipes…' : 'Find cooking help'}</button>
            </form>
            {assistantBusy && <Message>Finding RecipeHub recipes related to your question…</Message>}
            {assistantError && <Message error>{assistantError}</Message>}
            {!assistantBusy && assistantAsked && !assistantError && answerRecipes.length === 0 && <Message>No matching RecipeHub recipes were found. Try naming a dish or key ingredients.</Message>}
            {answerRecipes.map(({ recommendation, recipe }, index) => (
              <article className="ai-answer" key={recommendation.recipe_id}>
                <p className="ai-answer__label">{index === 0 ? 'Closest recipe match' : 'Another useful recipe'} · {Math.round(recommendation.similarity * 100)}% text similarity</p>
                <h3>{recipe.title}</h3>
                {recipe.description && <p className="ai-answer__description">{recipe.description}</p>}
                <h4>Ingredients</h4>
                <ul>{(recipe.ingredients || []).slice(0, 12).map((item, itemIndex) => <li key={`${itemIndex}-${ingredientText(item)}`}>{ingredientText(item)}</li>)}</ul>
                <h4>Recipe steps</h4>
                <ol>{(recipe.instructions || []).slice(0, 5).map((step, stepIndex) => <li key={stepIndex}>{typeof step === 'string' ? step : [step.title, step.text].filter(Boolean).join(': ')}</li>)}</ol>
                <button type="button" className="btn-secondary" onClick={() => onOpenRecipe(recipe.id)}>Open full recipe</button>
              </article>
            ))}
          </section>
        )}

        {section === 'explore' && (
          <section className="ai-panel">
            <h2>Explore recipe groups</h2>
            <p>RecipeHub recipes are grouped by the trained K-Means model. Random Forest estimates apply a model trained on Food.com engagement data to RecipeHub recipe features; treat them as exploratory predictions, not actual view counts.</p>
            {discoveryBusy && <Message>Loading model-based recipe groups…</Message>}
            {discoveryError && <><Message error>{discoveryError}</Message><button type="button" className="btn-secondary" onClick={loadDiscovery} disabled={discoveryBusy}>Retry discovery</button></>}
            {!discoveryBusy && !discoveryError && !discovery.length && <Message>No model-based RecipeHub discovery results are available.</Message>}
            {predictedPopular.length > 0 && <div className="ai-results"><h3>Popularity predictions</h3><p className="ai-data-note">Estimated future interactions from the Random Forest model. These are predictions, not measured popularity.</p>{predictedPopular.map((item) => <RecipeResult key={item.recipe_id} item={item} onOpen={onOpenRecipe} detail />)}</div>}
            {clusterGroups.map(([cluster, recipes]) => (
              <div className="ai-results" key={cluster}><h3>Recipe group {cluster + 1}</h3><p className="ai-data-note">{recipes.length} RecipeHub recipe{recipes.length === 1 ? '' : 's'} assigned to this K-Means cluster.</p>{recipes.slice(0, 12).map((item) => <RecipeResult key={item.recipe_id} item={item} onOpen={onOpenRecipe} detail />)}</div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
