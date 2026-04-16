import './i18n/index'  // must be first import
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initIndexedDB } from "./lib/indexedDbCache";
import { initializeCacheManager } from "./lib/cacheManager";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./lib/themeContext";

/**
 * Bootstraps the application by ensuring the cache is initialized (and cleared if version mismatch)
 * before rendering any components or performing any data fetches.
 */
async function bootstrap() {
  const rootElement = document.getElementById("root");
  if (!rootElement) return;

  // 1. Show a simple loading screen during initialization
  rootElement.innerHTML = `
    <div style="
      min-height: 100vh; 
      background: #0f1117; 
      display: flex; 
      align-items: center; 
      justify-content: center;
      flex-direction: column;
      gap: 16px;
      font-family: system-ui, -apple-system, sans-serif;
    ">
      <div style="
        width: 40px; height: 40px; 
        border: 3px solid rgba(16, 185, 129, 0.1); 
        border-top: 3px solid #10b981; 
        border-radius: 50%; 
        animation: spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      "></div>
      <div style="text-align: center;">
        <p style="color: #f9fafb; font-size: 16px; font-weight: 500; margin: 0 0 4px 0;">
          Initialisation du système
        </p>
        <p style="color: #9ca3af; font-size: 13px; margin: 0;">
          Préparation des données en cours...
        </p>
      </div>
      <style>
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      </style>
    </div>
  `;

  try {
    // 2. Initialize and clear cache if necessary (Wait for IndexedDB deletion if version bump)
    await initializeCacheManager();
    
    // 3. Prepare IndexedDB for current use
    await initIndexedDB();

    // 4. Render the React application
    createRoot(rootElement).render(
      <React.StrictMode>
        <ErrorBoundary>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </ErrorBoundary>
      </React.StrictMode>
    );
  } catch (err) {
    console.error("[Bootstrap] Critical failure:", err);
    rootElement.innerHTML = `
      <div style="padding: 20px; color: #ef4444; font-family: sans-serif;">
        <h2>Erreur d'initialisation</h2>
        <p>${err instanceof Error ? err.message : String(err)}</p>
        <button onclick="window.location.reload()">Réessayer</button>
      </div>
    `;
  }
}

// Start the application
void bootstrap();
