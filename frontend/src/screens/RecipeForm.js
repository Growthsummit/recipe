import React, { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext';
import { api, resolveImageUrl } from '../services/api';
import { registerRecipeOnSepolia } from '../blockchain/ethereum';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const emptyForm = {
  title: '',
  description: '',
  categorySlug: '',
  cookingTimeMinutes: '',
  difficulty: 'Easy',
  servings: '',
  imageUrl: '',
  dietaryInfo: '',
  ingredients: '',
  instructions: '',
};

/** Turns the API recipe shape back into the editable text form. */
function toForm(recipe) {
  if (!recipe) return emptyForm;
  return {
    title: recipe.title || '',
    description: recipe.description || '',
    categorySlug: recipe.category?.slug || '',
    cookingTimeMinutes: recipe.cookingTimeMinutes ?? '',
    difficulty: recipe.difficulty || 'Easy',
    servings: recipe.servings || '',
    imageUrl: recipe.imageUrl || '',
    dietaryInfo: (recipe.dietaryInfo || []).join(', '),
    ingredients: (recipe.ingredients || []).join('\n'),
    instructions: (recipe.instructions || [])
      .map((step) => (step.title ? `${step.title} | ${step.text}` : step.text))
      .join('\n'),
  };
}

function splitLines(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Create / edit a recipe. Everything is validated again by Zod on the backend;
 * this form only does light client-side shaping.
 */
export default function RecipeForm({ recipe, onBack, onSaved }) {
  const { isAuthenticated, user, requireAuth } = useApp();
  const [form, setForm] = useState(() => toForm(recipe));
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [localImagePreview, setLocalImagePreview] = useState('');
  const [imagePreviewFailed, setImagePreviewFailed] = useState(false);

  useEffect(() => {
    const initialForm = toForm(recipe);
    setForm(initialForm);
    setImageFile(null);
  }, [recipe]);

  useEffect(() => {
    if (!imageFile) { setLocalImagePreview(''); return undefined; }
    const objectUrl = URL.createObjectURL(imageFile);
    setLocalImagePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const previewImage = imageFile ? localImagePreview : form.imageUrl;
  const adminEditingAnotherRecipe = Boolean(recipe && Number(recipe.author?.id) !== Number(user?.id) && user?.permissions?.includes('recipe:update:any'));
  useEffect(() => { setImagePreviewFailed(false); }, [previewImage]);

  useEffect(() => {
    api.categories.list().then((data) => setCategories(data?.categories || [])).catch(() => setCategories([]));
  }, []);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!isAuthenticated) { requireAuth(); return; }

    const ingredients = splitLines(form.ingredients);
    const instructions = splitLines(form.instructions).map((line) => {
      const [title, ...rest] = line.split('|');
      return rest.length ? { title: title.trim(), text: rest.join('|').trim() } : { title: '', text: line };
    });

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      categorySlug: form.categorySlug || null,
      cookingTimeMinutes: form.cookingTimeMinutes === '' ? null : Number(form.cookingTimeMinutes),
      difficulty: form.difficulty || null,
      servings: form.servings.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      dietaryInfo: form.dietaryInfo.split(',').map((s) => s.trim()).filter(Boolean),
      ingredients,
      instructions,
    };

    setSaving(true);
    setError('');
    try {
      if (imageFile) {
        const uploaded = await api.recipes.uploadImage(imageFile);
        payload.imageUrl = uploaded.imageUrl;
      }
      const result = recipe
        ? await api.recipes.update(recipe.id, payload)
        : await api.recipes.create(payload);
      let blockchainMessage = '';
      if (adminEditingAnotherRecipe && result.recipe?.isPublished !== false && result.recipe?.status !== 'draft') {
        blockchainMessage = 'Recipe saved. The original recipe owner needs to register this corrected version on Sepolia.';
      } else {
        try {
          if (result.recipe?.isPublished !== false && result.recipe?.status !== 'draft') {
            const registration = await registerRecipeOnSepolia(result.recipe.id);
            blockchainMessage = registration.alreadyRegistered ? 'Recipe content is already registered and verified on Sepolia.' : 'Recipe saved and its blockchain registration was confirmed.';
          }
        } catch (chainError) {
          blockchainMessage = `Recipe saved in RecipeHub. Blockchain registration is not confirmed: ${chainError.message}`;
        }
      }
      if (onSaved) onSaved(result.recipe, blockchainMessage);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="screen">
      <div className="canvas form-page" style={{ paddingBottom: 60 }}>
        <button type="button" className="back-lt" onClick={onBack} aria-label="Back">&lt;</button>
        <header className="form-page__heading">
          <h1 className="h-title">{recipe ? 'Edit Recipe' : 'New Recipe'}</h1>
          <p>Enter the recipe details below.</p>
        </header>

        <form className="form-card recipe-form" onSubmit={submit}>
          {adminEditingAnotherRecipe && <p className="field-hint">You can correct this recipe as an administrator. If it has a blockchain proof, the original owner must register the corrected version on Sepolia.</p>}
          <label className="field">
            <span>Title</span>
            <input type="text" value={form.title} required minLength={2} maxLength={120} onChange={set('title')} />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea rows={3} maxLength={2000} value={form.description} onChange={set('description')} />
          </label>

          <label className="field">
            <span>Category</span>
            <select value={form.categorySlug} onChange={set('categorySlug')}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </label>

          <div className="field-row">
            <label className="field">
              <span>Cooking time (min)</span>
              <input type="number" min="1" max="1440" value={form.cookingTimeMinutes} onChange={set('cookingTimeMinutes')} />
            </label>
            <label className="field">
              <span>Difficulty</span>
              <select value={form.difficulty} onChange={set('difficulty')}>
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Servings</span>
            <input type="text" maxLength={60} placeholder="Serves 2" value={form.servings} onChange={set('servings')} />
          </label>

          <fieldset className="recipe-image-options">
            <legend>Recipe image</legend>
            <label className="field recipe-image-file">
              <span>Upload a photo from your device (JPG, PNG, or WebP; up to 5 MB)</span>
              <input
                key={recipe?.id || 'new'}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Choose a replacement recipe image from your device"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) { setError('Choose a JPG, PNG, or WebP image from your device.'); event.target.value = ''; return; }
                  if (file.size > MAX_IMAGE_BYTES) { setError('Choose an image smaller than 5 MB.'); event.target.value = ''; return; }
                  setError('');
                  setImageFile(file);
                }}
              />
            </label>
            {imageFile && <p className="field-hint">{imageFile.name} is selected. It will replace the current recipe image when you save.</p>}
            {previewImage && !imagePreviewFailed && <div className="recipe-image-preview"><img src={resolveImageUrl(previewImage)} alt="Recipe image preview" onError={() => setImagePreviewFailed(true)} /></div>}
            {previewImage && imagePreviewFailed && (
              <p className="field-hint">
                {imageFile
                  ? 'This photo could not be opened. Choose a valid JPG, PNG, or WebP file under 5 MB.'
                  : 'The saved image could not be loaded. Upload a new JPG, PNG, or WebP photo to replace it.'}
              </p>
            )}
          </fieldset>

          <label className="field">
            <span>Dietary info (comma separated)</span>
            <input type="text" placeholder="Vegetarian, Gluten-Free" value={form.dietaryInfo} onChange={set('dietaryInfo')} />
          </label>

          <label className="field">
            <span>Ingredients (one per line)</span>
            <textarea rows={6} value={form.ingredients} onChange={set('ingredients')} />
          </label>

          <label className="field">
            <span>Instructions — one step per line, optionally “Title | text”</span>
            <textarea rows={7} value={form.instructions} onChange={set('instructions')} />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <button type="submit" className="btn-primary btn-block" disabled={saving}>
            {saving ? 'Saving…' : recipe ? 'Save changes' : 'Create recipe'}
          </button>
        </form>
      </div>
    </div>
  );
}
