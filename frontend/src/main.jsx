import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import LocationProvider from "./components/location/LocationProvider";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <LocationProvider><App /></LocationProvider>
    </BrowserRouter>
  </StrictMode>,
);
