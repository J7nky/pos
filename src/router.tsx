// src/router.tsx
import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import Layout from "./layouts/Layout";
import Login from "./components/Login";
import Home from './pages/Home';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Reports from './pages/Reports';
import Customers from './pages/Customers';
import Accounting from './pages/Accounting';
import Settings from './pages/Settings';

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />, // This is the root component that handles auth and providers
    children: [
      {
        path: "login",
        element: <Login />,
      },
      {
        element: <Layout />, // This is the nested layout for authenticated users
        children: [
          {
            index: true,
            element: <Home />,
          },
          {
            path: "inventory",
            element: <Inventory />,
          },
          {
            path: "pos",
            element: <POS />,
          },
          {
            path: "reports",
            element: <Reports />,
          },
          {
            path: "accounting",
            element: <Accounting />,
          },
          {
            path: "customers",
            element: <Customers />,
          },
          {
            path: "settings",
            element: <Settings />,
          },
        ],
      },
    ],
  },
]);