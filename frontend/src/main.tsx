import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ApiKeyProvider } from "./hooks/useApiKey";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ApiKeyProvider>
        <App />
      </ApiKeyProvider>
    </BrowserRouter>
  </React.StrictMode>
);
