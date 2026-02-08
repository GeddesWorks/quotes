import { createTheme } from "@mui/material/styles";

export const buildTheme = (mode: "light" | "dark") =>
    createTheme({
        palette: {
            mode,
            primary: {
                main: mode === "dark" ? "#7ED6B8" : "#1B5E4B",
                contrastText: mode === "dark" ? "#0F1412" : "#F9F6F1"
            },
            secondary: {
                main: mode === "dark" ? "#F09C7C" : "#C05C3D"
            },
            background: {
                default: mode === "dark" ? "#121413" : "#F7F3EB",
                paper: mode === "dark" ? "#1B1F1C" : "#FFFDF7"
            },
            text: {
                primary: mode === "dark" ? "#F4F1EB" : "#1C1B19",
                secondary: mode === "dark" ? "#CFC9BF" : "#4B4945"
            }
        },
        typography: {
            fontFamily: "\"Archivo\", \"Segoe UI\", sans-serif",
            h1: {
                fontFamily: "\"Fraunces\", serif",
                fontWeight: 600
            },
            h2: {
                fontFamily: "\"Fraunces\", serif",
                fontWeight: 600
            },
            h3: {
                fontFamily: "\"Fraunces\", serif",
                fontWeight: 600
            },
            h4: {
                fontFamily: "\"Fraunces\", serif",
                fontWeight: 600
            },
            h5: {
                fontFamily: "\"Fraunces\", serif",
                fontWeight: 600
            },
            h6: {
                fontFamily: "\"Fraunces\", serif",
                fontWeight: 600
            }
        },
        shape: {
            borderRadius: 18
        },
        components: {
            MuiButton: {
                styleOverrides: {
                    root: {
                        textTransform: "none",
                        borderRadius: 999
                    }
                }
            },
            MuiCard: {
                styleOverrides: {
                    root: {
                        borderRadius: 24,
                        boxShadow:
                            mode === "dark"
                                ? "0 18px 40px -30px rgba(0, 0, 0, 0.8)"
                                : "0 18px 40px -30px rgba(28, 27, 25, 0.45)",
                        border:
                            mode === "dark"
                                ? "1px solid rgba(244, 241, 235, 0.08)"
                                : "1px solid rgba(28, 27, 25, 0.08)"
                    }
                }
            }
        }
    });
