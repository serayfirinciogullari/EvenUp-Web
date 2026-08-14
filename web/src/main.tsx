import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { AuthProvider } from './context/AuthProvider';
import './index.css';

/**
 * Sira onemli: Router en distaki sarmalayici olmali ki AuthProvider ve altindaki
 * guard'lar `useNavigate` / `useLocation` cagirabilsin.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
