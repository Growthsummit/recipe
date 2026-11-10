import React, { useCallback, useEffect, useState } from 'react';
import { StarIcon } from '../components/Icons';
import { useApp } from '../state/AppContext';
import { presentationFor } from '../data/recipes';
import { api } from '../services/api';
import { connectMetaMaskWallet, getMetaMaskStatus, registerRecipeOnSepolia } from '../blockchain/ethereum';

function RatingStars({ value, onSelect, disabled }) {
  return (
    <div className="rate-stars" role="group" aria-label="Rate this recipe">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`rate-star ${star <= value ? 'is-on' : ''}`}
          disabled={disabled}
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
          aria-pressed={star <= value}
          onClick={() => onSelect(star)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function RecipeDetails({ recipeId, onBack, onOpenRecipe, onEditRecipe, blockchainMessage: initialBlockchainMessage = '' }) {
  const { isFavourite, toggleFavourite, isAuthenticated, user, requireAuth } = useApp();
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [reviews, setReviews] = useState([]);
  const [reviewDraft, setReviewDraft] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [busy, setBusy] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [chainHistory, setChainHistory] = useState([]);
  const [chainVerification, setChainVerification] = useState(null);
  const [chainWallet, setChainWallet] = useState(null);
  const [walletStatus, setWalletStatus] = useState(null);
  const [chainBusy, setChainBusy] = useState(false);
  const [chainError, setChainError] = useState('');
  const [chainMessage, setChainMessage] = useState(initialBlockchainMessage);
  const [aiRecommendations, setAiRecommendations] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [popularity, setPopularity] = useState(null);
  const [aiCluster, setAiCluster] = useState(null);
  const [aiActionLoading, setAiActionLoading] = useState(false);

  const loadRecipe = useCallback(() => {
    setLoading(true);
    return api.recipes
      .get(recipeId)
      .then((data) => { setRecipe(data.recipe); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [recipeId]);

  useEffect(() => { loadRecipe(); }, [loadRecipe]);

  useEffect(() => {
    if (!recipe?.id) return;
    let cancelled = false;
    setAiLoading(true);
    api.ai.recommendations(recipe.id, 8, 'recipehub')
      .then((result) => { if (!cancelled) { setAiRecommendations(result?.recipes || []); setAiError(''); } })
      .catch((err) => { if (!cancelled) setAiError(err.message); })
      .finally(() => { if (!cancelled) setAiLoading(false); });
    return () => { cancelled = true; };
  }, [recipe?.id]);

  const loadAiInsights = async () => {
    if (!recipe?.id) return;
    setAiActionLoading(true); setAiError('');
    const [pop, group] = await Promise.allSettled([api.ai.popularity(recipe.id), api.ai.recipeCluster(recipe.id)]);
    if (pop.status === 'fulfilled') setPopularity(pop.value?.prediction || null);
    if (group.status === 'fulfilled') setAiCluster(group.value?.cluster ?? null);
    const failures = [pop, group].filter((result) => result.status === 'rejected');
    if (failures.length === 2) setAiError(failures[0].reason.message);
    setAiActionLoading(false);
  };

  const loadBlockchainInfo = useCallback(async () => {
    if (!recipe?.id) return;
    const historyPromise = api.blockchain.history(recipe.id).then((data) => setChainHistory(data?.history?.records || []));
    const verifyPromise = api.blockchain.verify(recipe.id).then((data) => setChainVerification(data?.verification || null)).catch((err) => setChainError(err.message));
    const walletPromise = isAuthenticated
      ? api.blockchain.wallet().then((data) => setChainWallet(data?.wallet || null)).catch(() => setChainWallet(null))
      : Promise.resolve();
    const statusPromise = getMetaMaskStatus().then(setWalletStatus);
    await Promise.allSettled([historyPromise, verifyPromise, walletPromise, statusPromise]);
  }, [recipe?.id, isAuthenticated]);

  useEffect(() => { loadBlockchainInfo(); }, [loadBlockchainInfo]);

  // Record the view against the database (fire-and-forget; never blocks the UI).
  useEffect(() => {
    const id = Number(recipeId);
    if (Number.isInteger(id) && id > 0) {
      api.recipes.recordView(id).catch(() => {});
    }
  }, [recipeId]);

  const loadReviews = useCallback((id) => {
    api.reviews
      .list(id, { limit: 20 })
      .then((data) => setReviews(data?.items || []))
      .catch(() => setReviews([]));
  }, []);

  useEffect(() => {
    if (recipe?.id) loadReviews(recipe.id);
  }, [recipe?.id, loadReviews]);

  useEffect(() => {
    if (!isAuthenticated || !recipe?.id) { setMyRating(0); return; }
    api.ratings
      .mine(recipe.id)
      .then((data) => setMyRating(data?.rating?.rating || 0))
      .catch(() => setMyRating(0));
  }, [isAuthenticated, recipe?.id]);

  if (loading) {
    return (
      <div className="screen">
        <div className="canvas" style={{ paddingBottom: 40 }}>
          <button type="button" className="circle-btn" style={{ left: 33, top: 17 }} onClick={onBack} aria-label="Back">
            <span style={{ fontSize: 36, lineHeight: 1, marginTop: -4 }}>&lt;</span>
          </button>
          <p className="status" style={{ marginTop: 120 }}>Loading recipe…</p>
        </div>
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="screen">
        <div className="canvas" style={{ paddingBottom: 40 }}>
          <button type="button" className="circle-btn" style={{ left: 33, top: 17 }} onClick={onBack} aria-label="Back">
            <span style={{ fontSize: 36, lineHeight: 1, marginTop: -4 }}>&lt;</span>
          </button>
          <p className="status status--error" style={{ marginTop: 120 }}>{error || 'Recipe not found.'}</p>
        </div>
      </div>
    );
  }

  const saved = isFavourite(recipe.id);
  const style = presentationFor(recipe);
  const steps = recipe.instructions || recipe.steps || [];
  const ingredients = recipe.ingredients || [];

  const submitRating = async (value) => {
    if (!isAuthenticated) { requireAuth(); return; }
    setBusy(true);
    try {
      const result = await api.ratings.set(recipe.id, value);
      setMyRating(value);
      setRecipe((prev) => ({ ...prev, rating: Number(result.ratingAvg).toFixed(1), ratingAvg: result.ratingAvg, ratingCount: result.ratingCount }));
    } catch (err) {
      setReviewError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async (event) => {
    event.preventDefault();
    if (!isAuthenticated) { requireAuth(); return; }
    if (reviewDraft.trim().length < 3) { setReviewError('Please write at least a few words.'); return; }
    setBusy(true);
    try {
      await api.reviews.create(recipe.id, { body: reviewDraft.trim() });
      setReviewDraft('');
      setReviewError('');
      loadReviews(recipe.id);
    } catch (err) {
      setReviewError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteReview = async (reviewId) => {
    setBusy(true);
    try {
      await api.reviews.remove(reviewId);
      loadReviews(recipe.id);
    } catch (err) {
      setReviewError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const markCooked = async () => {
    if (!isAuthenticated) { requireAuth(); return; }
    setBusy(true);
    try {
      await api.history.add(recipe.id, {});
      setReviewError('');
      window.alert('Added to your cooking history.');
    } catch (err) {
      setReviewError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const connectRecipeWallet = async () => {
    setChainBusy(true); setChainError(''); setChainMessage('');
    try {
      const connected = await connectMetaMaskWallet();
      setWalletStatus({ installed: true, ...connected });
      const linked = await api.blockchain.wallet();
      setChainWallet(linked?.wallet || null);
      setChainMessage(`Wallet ${connected.address} is connected to Sepolia and verified for this RecipeHub account.`);
    } catch (err) { setChainError(err.message); }
    finally { setChainBusy(false); }
  };

  const registerBlockchainProof = async () => {
    setChainBusy(true); setChainError(''); setChainMessage('');
    try {
      const result = await registerRecipeOnSepolia(recipe.id, (progress) => {
        if (progress.state === 'awaiting-signature') setChainMessage(`Approve the version ${progress.version} registration in MetaMask.`);
        if (progress.state === 'confirming') setChainMessage(`Transaction ${progress.transactionHash} was sent. Waiting for Sepolia confirmation…`);
      });
      setChainMessage(result.isCurrentContent ? `Version ${result.version} is confirmed on Ethereum Sepolia.` : `Version ${result.version} was confirmed, but the recipe changed after the transaction was prepared. Register the current content as a new version.`);
      await loadBlockchainInfo();
    } catch (err) {
      setChainError(err.message);
      await loadBlockchainInfo();
    } finally { setChainBusy(false); }
  };

  const verifyBlockchainProof = async () => {
    setChainBusy(true); setChainError('');
    try {
      const data = await api.blockchain.verify(recipe.id);
      setChainVerification(data?.verification || null);
      setChainMessage(data?.verification?.verified ? 'The current recipe content matches the latest Sepolia proof.' : 'The current recipe content does not match the latest Sepolia proof.');
    } catch (err) { setChainError(err.message); }
    finally { setChainBusy(false); }
  };

  const ownsRecipe = Boolean(isAuthenticated && recipe.author?.id && Number(recipe.author.id) === Number(user?.id));
  const canEditAnyRecipe = Boolean(isAuthenticated && user?.permissions?.includes('recipe:update:any'));

  return (
    <div className="screen">
      <div className="canvas" style={{ paddingBottom: 40 }}>
        <div style={{ position: 'relative', height: 319 }}>
          <button type="button" className="circle-btn" style={{ left: 33, top: 17 }} onClick={onBack} aria-label="Back">
            <span style={{ fontSize: 36, lineHeight: 1, marginTop: -4 }}>&lt;</span>
          </button>
          <button
            type="button"
            className="circle-btn"
            style={{ left: 318, top: 17 }}
            onClick={() => toggleFavourite(recipe.id)}
            aria-pressed={saved}
            aria-label={saved ? 'Remove from favourites' : 'Save to favourites'}
          >
            <span style={{ fontSize: saved ? 22 : 32, lineHeight: 1, marginTop: saved ? 0 : -3 }}>{saved ? '🖤' : '♡'}</span>
          </button>

          <div className="rcard d-card">
            <div className="photo"><img src={recipe.image || recipe.imageUrl} alt={`${recipe.title} recipe`} /></div>
            <p className="rcard__title">{recipe.title}</p>
            <StarIcon className="rcard__star" />
            <p className="rcard__rating" style={{ left: 39 }}>{recipe.rating}</p>
            <p className="rcard__time">{recipe.time}</p>
            <p className="rcard__difficulty">{recipe.difficulty}</p>
          </div>
          <h2 className="d-heading" style={{ position: 'absolute', left: 0, right: 0, top: 295 }}>Ingredients</h2>
        </div>

        <div className="d-text" style={{ marginTop: 8 }}>
          {canEditAnyRecipe && (
            <div className="recipe-admin-edit">
              <p>Notice an incorrect image or recipe detail?</p>
              <button type="button" className="btn-secondary" onClick={() => onEditRecipe?.(recipe)}>Edit recipe</button>
            </div>
          )}
          {recipe.servings && (<><p>{recipe.servings}</p><div className="d-gap" /></>)}
          <ul className={`d-list ${style.ingredientStyle === 'disc' ? 'd-list--disc' : ''}`}>
            {ingredients.map((item) => (
              <li key={item}>{style.ingredientStyle === 'circle' ? `○ ${item}` : item}</li>
            ))}
          </ul>
        </div>

        <h2 className="d-heading" style={{ marginTop: 14 }}>Instructions</h2>
        <div className="d-text" style={{ marginTop: 0 }}>
          {steps.map((s, i) => (
            <div key={`${s.title}-${i}`}>
              {style.stepLabels && <p>{`Step ${i + 1}`}</p>}
              <p>{s.title ? `${i + 1}. ${s.title}` : `${i + 1}.`}</p>
              <p>{s.text}</p>
              {!style.stepLabels && i < steps.length - 1 && <div className="d-gap" />}
            </div>
          ))}
        </div>

        {/* ---- rating + reviews (backed by the database) ---- */}
        <h2 className="d-heading" style={{ marginTop: 18 }}>Rate this recipe</h2>
        <div className="d-text" style={{ marginTop: 0 }}>
          <p>
            Average {recipe.rating} from {recipe.ratingCount || 0} rating{recipe.ratingCount === 1 ? '' : 's'}
            {myRating > 0 ? ` · your rating: ${myRating}` : ''}
          </p>
          <div style={{ marginTop: 8 }}>
            <RatingStars value={myRating} onSelect={submitRating} disabled={busy} />
          </div>
          {!isAuthenticated && <p className="d-note">Sign in to rate this recipe.</p>}

          <button type="button" className="btn-secondary" style={{ marginTop: 12 }} onClick={markCooked} disabled={busy}>
            I cooked this
          </button>
        </div>

        <section className="ai-section" aria-labelledby="ai-recommendation-title">
          <h2 className="d-heading" id="ai-recommendation-title">AI recipe discovery</h2>
          <p className="d-note">Recommendations compare recipe names, ingredients, descriptions and tags using TF-IDF and cosine similarity.</p>
          {aiLoading && <p className="status">Finding similar recipes…</p>}
          {!aiLoading && aiError && <p className="d-note d-note--error" role="status">AI is unavailable: {aiError}</p>}
          {!aiLoading && !aiError && aiRecommendations.length === 0 && <p className="d-note">No similar recipes are available yet.</p>}
          <div className="ai-recommendation-list">
            {aiRecommendations.map((item) => (
              <article key={item.recipe_id} className="ai-recommendation">
                <div><strong>{item.title}</strong><p>{item.category} · {item.minutes ? `${item.minutes} min · ` : ''}{Math.round(item.similarity * 100)}% text similarity</p></div>
                {item.source === 'recipehub' && <button type="button" className="btn-secondary" onClick={() => onOpenRecipe(Number(item.source_recipe_id))}>Open recipe</button>}
              </article>
            ))}
          </div>
          <button type="button" className="btn-secondary" style={{ marginTop: 12 }} onClick={loadAiInsights} disabled={aiActionLoading}>
            {aiActionLoading ? 'Loading AI insights…' : 'Show popularity and recipe cluster'}
          </button>
          {popularity && <p className="d-note" role="status">Estimated future engagement: {popularity.predicted_future_interactions} interactions.</p>}
          {aiCluster !== null && <p className="d-note" role="status">This recipe is in AI cluster {aiCluster}.</p>}
        </section>

        <h2 className="d-heading" style={{ marginTop: 18 }}>Reviews</h2>
        <div className="d-text" style={{ marginTop: 0 }}>
          {isAuthenticated ? (
            <form onSubmit={submitReview} className="review-form">
              <textarea
                className="review-input"
                rows={3}
                maxLength={2000}
                placeholder={`Share your thoughts as ${user?.name || 'you'}…`}
                value={reviewDraft}
                onChange={(e) => setReviewDraft(e.target.value)}
              />
              <button type="submit" className="btn-primary" disabled={busy}>Post review</button>
            </form>
          ) : (
            <button type="button" className="btn-primary" onClick={requireAuth}>Sign in to write a review</button>
          )}

          {reviewError && <p className="d-note d-note--error">{reviewError}</p>}

          {reviews.length === 0 && <p className="d-note">No reviews yet.</p>}
          {reviews.map((review) => (
            <div key={review.id} className="review">
              <p className="review__head">
                {review.authorName}
                {user && Number(review.userId) === Number(user.id) ? ' (you)' : ''}
              </p>
              <p className="review__body">{review.body}</p>
              {user && (Number(review.userId) === Number(user.id) || user.role === 'admin' || user.role === 'security_admin') && (
                <button type="button" className="review__delete" onClick={() => deleteReview(review.id)} disabled={busy}>
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>

        <section className="blockchain-card" aria-labelledby="blockchain-title">
          <h2 id="blockchain-title">Blockchain integrity</h2>
          <p>Only a SHA-256 digest, recipe ID, version, wallet address and timestamp are sent to Ethereum Sepolia. Recipe text and personal details stay in RecipeHub.</p>
          <p><strong>Status:</strong> {chainVerification?.verified ? 'Verified on Sepolia' : chainVerification?.reason === 'CONTENT_CHANGED' ? 'Content differs from the latest proof' : chainVerification?.reason === 'NOT_REGISTERED' ? 'Not registered yet' : chainHistory.some((row) => row.status === 'pending') ? 'Registration pending' : chainHistory.some((row) => row.status === 'failed') ? 'Registration failed' : 'No confirmed proof'}</p>
          {chainVerification?.currentVersion > 0 && <p><strong>Latest version:</strong> {chainVerification.currentVersion}</p>}
          {(chainVerification?.creatorWallet || chainWallet?.address) && <p className="blockchain-address"><strong>Creator wallet:</strong> {chainVerification?.creatorWallet || chainWallet.address}</p>}
          {chainVerification?.verifiedAt && <p><strong>Verification date:</strong> {new Date(chainVerification.verifiedAt).toLocaleString()}</p>}
          {walletStatus && <p><strong>MetaMask:</strong> {walletStatus.installed ? walletStatus.address ? `${walletStatus.address} · ${walletStatus.chainId === 11155111 ? 'Sepolia' : `chain ${walletStatus.chainId}`}` : 'Installed, not connected' : 'Not detected'}</p>}
          {!walletStatus?.installed && <p className="d-note">Install MetaMask to sign recipe registration transactions.</p>}
          {chainMessage && <p className="form-ok" role="status">{chainMessage}</p>}
          {chainError && <p className="form-error" role="alert">{chainError}</p>}
          <div className="blockchain-actions">
            {isAuthenticated && ownsRecipe && <button type="button" className="btn-secondary" onClick={connectRecipeWallet} disabled={chainBusy}>{chainBusy ? 'Working…' : chainWallet ? 'Connect / change wallet' : 'Connect MetaMask'}</button>}
            {isAuthenticated && ownsRecipe && recipe.isPublished && recipe.status === 'published' && <button type="button" className="btn-primary" onClick={registerBlockchainProof} disabled={chainBusy}>{chainBusy ? 'Waiting…' : 'Register this version on Sepolia'}</button>}
            <button type="button" className="btn-secondary" onClick={verifyBlockchainProof} disabled={chainBusy}>{chainBusy ? 'Checking…' : 'Verify recipe hash'}</button>
          </div>
          {chainHistory.length > 0 && <div className="blockchain-versions"><h3>Version history</h3>{chainHistory.map((row) => <article key={`${row.version}-${row.createdAt}`}>
            <p><strong>Version {row.version}</strong> · {row.status} · {row.network || 'Sepolia'}</p>
            {row.creatorWallet && <p className="blockchain-address">Wallet: {row.creatorWallet}</p>}
            {row.transactionHash ? <p><a href={`https://sepolia.etherscan.io/tx/${row.transactionHash}`} target="_blank" rel="noreferrer">View transaction on Sepolia Etherscan</a></p> : <p>No transaction hash recorded.</p>}
            {row.confirmedAt && <p>Confirmed: {new Date(`${row.confirmedAt}Z`).toLocaleString()}</p>}
          </article>)}</div>}
          {!chainVerification && <p className="blockchain-footnote">Blockchain verification is unavailable until the operator configures a Sepolia RPC and deploys RecipeRegistry.</p>}
        </section>
      </div>
    </div>
  );
}
