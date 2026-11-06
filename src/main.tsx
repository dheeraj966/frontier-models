import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { DatasetProvider } from './data/DatasetProvider';
import { PreferencesProvider } from './state/preferences';
import { ToastProvider } from './components/Toasts';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <PreferencesProvider>
        <ToastProvider>
          <DatasetProvider>
            <App />
          </DatasetProvider>
        </ToastProvider>
      </PreferencesProvider>
    </BrowserRouter>
  </StrictMode>,
);
