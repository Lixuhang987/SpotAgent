import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles/thread-window.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
