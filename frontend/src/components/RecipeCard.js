import React from 'react';
import { StarIcon } from './Icons';
import HeartButton from './HeartButton';

// 327 x 210 card (Home, Search results). `small` = 166 x 210 (Search → Trending Recipes).
export default function RecipeCard({ recipe, title, rating, time, image, onOpen, small = false, withHeart = true, recipeIdForHeart }) {
  const shownTitle = title || recipe.title;
  return (
    <div className="card-wrap">
      {withHeart && <HeartButton recipeId={recipeIdForHeart || recipe.id} />}
      <div className={`rcard ${small ? 'rcard--small' : ''}`}>
        <button type="button" className="rcard__open" onClick={onOpen} aria-label={`Open ${shownTitle}`} />
        <div className="photo"><img src={image || recipe.image || recipe.imageUrl} alt={shownTitle ? `${shownTitle} recipe` : 'Recipe'} /></div>
        <p className="rcard__title">{shownTitle}</p>
        <StarIcon className="rcard__star" />
        <p className="rcard__rating">{rating || recipe.rating}</p>
        <p className="rcard__time">{time || recipe.time}</p>
      </div>
    </div>
  );
}
