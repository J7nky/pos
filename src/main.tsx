import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { RouterProvider } from 'react-router-dom';
import { router } from './router.tsx';

// Wait for DOM to be ready
function initApp() {
  const rootElement = document.getElementById('root');
  
  if (!rootElement) {
    console.error('Root element not found!');
    // Create a fallback root element
    const fallbackRoot = document.createElement('div');
    fallbackRoot.id = 'root';
    document.body.appendChild(fallbackRoot);
    console.log('Created fallback root element');
  }
  
  const root = createRoot(rootElement || document.getElementById('root')!);
  
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
  
  console.log('React app initialized successfully');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
