// src/router.tsx
import React from "react";
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
import PublicCustomerStatement from './pages/PublicCustomerStatement';
import QRCodeDemo from './pages/QRCodeDemo';
import ErrorBoundary from './components/ErrorBoundary';

// Use hash router for Electron (file:// protocol) and browser router for web
const isElectron = typeof window !== 'undefined' && window.electronAPI;
const createRouter = isElectron ? createHashRouter : createBrowserRouter;

export const router = createRouter([
  {
    path: "/",
    element: <App />, // This is the root component that handles auth and providers
    errorElement: <ErrorBoundary />,
    children: [
      {
        element: <Layout />, // This is the nested layout for authenticated users
        errorElement: <ErrorBoundary />,
        children: [
          {
            index: true,
            element: <Home />,
            errorElement: <ErrorBoundary />,
          },
          {
            path: "inventory",
            element: <Inventory />,
            errorElement: <ErrorBoundary />,
          },
          {
            path: "pos",
            element: <POS />,
            errorElement: <ErrorBoundary />,
          },
          {
            path: "reports",
            element: <Reports />,
            errorElement: <ErrorBoundary />,
          },
          {
            path: "accounting",
            element: <Accounting />,
            errorElement: <ErrorBoundary />,
          },
          {
            path: "customers",
            element: <Customers />,
            errorElement: <ErrorBoundary />,
          },
          {
            path: "settings",
            element: <Settings />,
            errorElement: <ErrorBoundary />,
          },
          {
            path: "qr-demo",
            element: <QRCodeDemo />,
            errorElement: <ErrorBoundary />,
          },
        ],
      },
      // Public routes (no authentication required)
      {
        path: "public/customer-statement/:customerId/:billId",
        element: <PublicCustomerStatement />,
        errorElement: <ErrorBoundary />,
      },
    ],
  },
]);