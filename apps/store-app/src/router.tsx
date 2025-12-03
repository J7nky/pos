// src/router.tsx
import { createBrowserRouter, createHashRouter } from "react-router-dom";
import App from "./App";
import Layout from "./layouts/Layout";
import Home from './pages/Home';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Reports from './pages/Reports';
import Customers from './pages/Customers';
import Accounting from './pages/Accounting';
import Settings from './pages/Settings';
import Employees from './pages/Employees';
import UnsyncedItems from './pages/UnsyncedItems';
import PublicCustomerStatement from './pages/PublicCustomerStatement';
import ErrorPage from './components/ErrorPage';

// Use hash router for Electron (file:// protocol) and browser router for web
const isElectron = typeof window !== 'undefined' && window.electronAPI;
const createRouter = isElectron ? createHashRouter : createBrowserRouter;

export const router = createRouter([
  {
    path: "/",
    element: <App />, // This is the root component that handles auth and providers
    errorElement: <ErrorPage />,
    children: [
      {
        element: <Layout />, // This is the nested layout for authenticated users
        errorElement: <ErrorPage />,
        children: [
          {
            index: true,
            element: <Home />,
            errorElement: <ErrorPage />,
          },
          {
            path: "inventory",
            element: <Inventory />,
            errorElement: <ErrorPage />,
          },
          {
            path: "pos",
            element: <POS />,
            errorElement: <ErrorPage />,
          },
          {
            path: "reports",
            element: <Reports />,
            errorElement: <ErrorPage />,
          },
          {
            path: "accounting",
            element: <Accounting />,
            errorElement: <ErrorPage />,
          },
          {
            path: "customers",
            element: <Customers />,
            errorElement: <ErrorPage />,
          },
          {
            path: "settings",
            element: <Settings />,
            errorElement: <ErrorPage />,
          },
          {
            path: "employees",
            element: <Employees />,
            errorElement: <ErrorPage />,
          },
          {
            path: "unsynced",
            element: <UnsyncedItems />,
            errorElement: <ErrorPage />,
          },
        
        ],
      },
      // Public routes (no authentication required)
      {
        path: "public/statement/:token",
        element: <PublicCustomerStatement />,
        errorElement: <ErrorPage />,
      },
    ],
  },
]);