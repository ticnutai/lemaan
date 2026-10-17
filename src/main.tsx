import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { requestPersistentStorage } from "./db/persistStorage";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// שהדפדפן לא ימחק את המסד כשנגמר מקום במכשיר
void requestPersistentStorage();
