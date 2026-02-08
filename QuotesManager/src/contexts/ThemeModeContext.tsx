import { createContext, useContext, useEffect, useMemo, useState } from "react";
import useMediaQuery from "@mui/material/useMediaQuery";

type ThemePreference = "system" | "light" | "dark";

interface ThemeModeContextValue {
    preference: ThemePreference;
    resolvedMode: "light" | "dark";
    setPreference: (value: ThemePreference) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | undefined>(undefined);
const STORAGE_KEY = "qm_theme_preference";

export const ThemeModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
    const [preference, setPreferenceState] = useState<ThemePreference>(() => {
        if (typeof window === "undefined") {
            return "system";
        }
        const stored = window.localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
        if (stored === "light" || stored === "dark" || stored === "system") {
            return stored;
        }
        return "system";
    });

    const resolvedMode = preference === "system" ? (prefersDark ? "dark" : "light") : preference;

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }
        window.localStorage.setItem(STORAGE_KEY, preference);
    }, [preference]);

    useEffect(() => {
        if (typeof document === "undefined") {
            return;
        }
        document.documentElement.dataset.theme = resolvedMode;
        document.documentElement.style.colorScheme = resolvedMode;
    }, [resolvedMode]);

    const value = useMemo(
        () => ({
            preference,
            resolvedMode,
            setPreference: setPreferenceState
        }),
        [preference, resolvedMode]
    );

    return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
};

export const useThemeMode = () => {
    const context = useContext(ThemeModeContext);
    if (!context) {
        throw new Error("useThemeMode must be used within ThemeModeProvider.");
    }
    return context;
};
