import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "sonner";
import App from "./App";
import { GOOGLE_CLIENT_ID } from "./utils/constants";
import { useTheme } from "./hooks/useTheme";
import "./index.css";

// Initialize persisted light/dark on <html> before first paint (store applies on module load; this guarantees import order).
void useTheme.getState().theme;

createRoot(document.getElementById("root")!).render(
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <App />
    <Toaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        duration: 3000,
        style: {
          borderRadius: "12px",
          fontSize: "14px",
        },
      }}
    />
  </GoogleOAuthProvider>
);
