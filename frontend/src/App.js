import React from 'react';
import { AppProvider } from './state/AppContext';
import MobileApp from './MobileApp';

export default function App() {
  return <AppProvider><MobileApp /></AppProvider>;
}
