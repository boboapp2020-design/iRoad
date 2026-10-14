import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { setTransport } from './lib/api/client';
import { isDemo } from './lib/env';
import './index.css';

if (isDemo) {
  setTransport(async (body) => (await import('./demo/demoBackend')).demoTransport(body));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
