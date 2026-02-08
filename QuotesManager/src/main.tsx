import { CssBaseline, ThemeProvider } from "@mui/material";
import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AuthProvider } from "./contexts/AuthContext.tsx";
import { GroupProvider } from "./contexts/GroupContext.tsx";
import { ThemeModeProvider, useThemeMode } from "./contexts/ThemeModeContext.tsx";
import "./index.css";
import { buildTheme } from "./theme.ts";

const ThemedApp = () => {
  const { resolvedMode } = useThemeMode();
  const theme = useMemo(() => buildTheme(resolvedMode), [resolvedMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <GroupProvider>
          <App />
        </GroupProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeModeProvider>
      <ThemedApp />
    </ThemeModeProvider>
  </StrictMode>
);
