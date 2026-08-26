import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { UIProvider } from './contexts/UIContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

if ('serviceWorker' in navigator) {
  registerSW({ immediate: true });
}


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <UIProvider>
        <App />
      </UIProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
