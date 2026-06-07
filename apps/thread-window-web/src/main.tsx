import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles/tailwind.css";
// import "./styles/thread-window.css";  // 旧样式，Phase 4 后移除

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
