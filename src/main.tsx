// @ts-ignore
if (Object.getOwnPropertyDescriptor(window, 'fetch')?.writable === false) {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'fetch');
  if (descriptor && descriptor.configurable) {
    Object.defineProperty(window, 'fetch', {
      ...descriptor,
      writable: true
    });
  }
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
