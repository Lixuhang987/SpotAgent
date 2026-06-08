import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Activity window root element is missing");
}

createRoot(rootElement).render(<App />);
