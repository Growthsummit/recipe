import React, { useCallback, useEffect, useState } from 'react';
import BottomNav from './components/BottomNav';
import Home from './screens/Home';
import Search from './screens/Search';
import Favourites from './screens/Favourites';
import Profile from './screens/Profile';
import RecipeDetails from './screens/RecipeDetails';
import MyRecipes from './screens/MyRecipes';
import RecipeForm from './screens/RecipeForm';
import Auth from './screens/Auth';
import { useApp } from './state/AppContext';
import { recordEvent } from './blockchain/ledger';
import ResetPassword from './screens/ResetPassword';
import AIScreen from './screens/AIScreen';

const NAV_HIDDEN = new Set(['recipe', 'auth', 'myRecipes', 'recipeForm']);

export default function MobileApp() {
  const { actor, initialising, setAuthPromptHandler, storageError, clearStorageError } = useApp();
  const [stack, setStack] = useState([{ name: 'home' }]);
  const [searchQuery, setSearchQuery] = useState('');
  const current = stack[stack.length - 1];
  const resetToken = new URLSearchParams(window.location.search).get('resetToken');
  if (resetToken) return <ResetPassword token={resetToken} />;

  const goTab = useCallback((tab) => setStack([{ name: tab }]), []);
  const push = useCallback((entry) => setStack((s) => [...s, entry]), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  // Any screen can request the sign-in screen (e.g. tapping a heart while logged out).
  useEffect(() => {
    setAuthPromptHandler(() => setStack((s) => [...s, { name: 'auth' }]));
  }, [setAuthPromptHandler]);

  const openRecipe = useCallback((id) => {
    recordEvent('RECIPE_VIEWED', actor, { recipeId: id });
    push({ name: 'recipe', id });
  }, [actor, push]);

  const openCategory = useCallback((query) => {
    setSearchQuery(query);
    setStack([{ name: 'search' }]);
  }, []);

  const afterAuth = useCallback(() => {
    setStack((s) => {
      const withoutAuth = s.filter((entry) => entry.name !== 'auth');
      return withoutAuth.length ? withoutAuth : [{ name: 'home' }];
    });
  }, []);

  let screen;
  let activeTab = current.name;
  switch (current.name) {
    case 'search':
      screen = <Search query={searchQuery} setQuery={setSearchQuery} onOpenRecipe={openRecipe} />;
      break;
    case 'favourites':
      screen = <Favourites onOpenRecipe={openRecipe} />;
      break;
    case 'ai':
      screen = <AIScreen onOpenRecipe={openRecipe} />;
      break;
    case 'profile':
      activeTab = 'profile';
      screen = (
        <Profile
          view="main"
          onOpenView={(view) => push({ name: 'profileView', view })}
          onOpenFavourites={() => goTab('favourites')}
          onOpenMyRecipes={() => push({ name: 'myRecipes' })}
          onOpenAuth={() => push({ name: 'auth' })}
          onOpenRecipe={openRecipe}
        />
      );
      break;
    case 'profileView':
      activeTab = 'profile';
      screen = (
        <Profile
          view={current.view}
          onBack={back}
          onOpenRecipe={openRecipe}
        />
      );
      break;
    case 'recipe':
      screen = <RecipeDetails recipeId={current.id} onBack={back} onOpenRecipe={openRecipe} onEditRecipe={(recipe) => push({ name: 'recipeForm', recipe })} blockchainMessage={current.blockchainMessage} />;
      break;
    case 'myRecipes':
      screen = (
        <MyRecipes
          onBack={back}
          onOpenRecipe={openRecipe}
          onCreate={() => push({ name: 'recipeForm', recipe: null })}
          onEdit={(recipe) => push({ name: 'recipeForm', recipe })}
        />
      );
      break;
    case 'recipeForm':
      screen = <RecipeForm recipe={current.recipe} onBack={back} onSaved={(saved, blockchainMessage) => {
        back();
        if (saved?.id) push({ name: 'recipe', id: saved.id, blockchainMessage });
      }} />;
      break;
    case 'auth':
      screen = <Auth onBack={back} onSuccess={afterAuth} />;
      break;
    default:
      screen = <Home onOpenRecipe={openRecipe} onOpenCategory={openCategory} />;
  }

  return (
    <div className="app">
      {storageError && (
        <div className="storage-alert" role="alert">
          <span>{storageError}</span>
          <button type="button" onClick={clearStorageError} aria-label="Dismiss storage message">×</button>
        </div>
      )}
      {initialising && current.name !== 'auth' ? (
        <div className="screen"><p className="status" style={{ marginTop: 200 }}>Loading RecipeBox…</p></div>
      ) : (
        <>
          {screen}
          {!NAV_HIDDEN.has(current.name) && <BottomNav active={activeTab} onChange={goTab} />}
        </>
      )}
    </div>
  );
}
