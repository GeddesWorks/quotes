import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography
} from "@mui/material";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { setPendingInviteCode } from "../contexts/GroupContext";

const AuthPage = () => {
    const { signIn, signUp, loading, user } = useAuth();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [mode, setMode] = useState<"signin" | "signup">("signin");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            navigate("/");
        }
    }, [user, navigate]);

    useEffect(() => {
        const inviteCode = searchParams.get("join");
        if (inviteCode) {
            setPendingInviteCode(inviteCode);
        }
    }, [searchParams]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        try {
            if (mode === "signin") {
                await signIn(email, password);
            } else {
                await signUp(name, email, password);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Authentication failed.");
        }
    };

    return (
        <Box display="flex" alignItems="center" justifyContent="center" minHeight="100vh" padding={3}>
            <Card sx={{ maxWidth: 520, width: "100%" }} className="page">
                <CardContent>
                    <Stack spacing={3}>
                        <Box>
                            <Typography variant="h4" gutterBottom>
                                Quotes Manager 2.0
                            </Typography>
                            <Typography variant="body1" color="text.secondary">
                                Sign in to manage groups, invites, and the new Appwrite-powered quote flow.
                            </Typography>
                        </Box>
                        <Tabs
                            value={mode}
                            onChange={(_, value) => setMode(value)}
                            textColor="primary"
                            indicatorColor="primary"
                        >
                            <Tab value="signin" label="Sign in" />
                            <Tab value="signup" label="Create account" />
                        </Tabs>
                        {error && <Alert severity="error">{error}</Alert>}
                        <Box component="form" onSubmit={handleSubmit} display="flex" flexDirection="column" gap={2}>
                            {mode === "signup" && (
                                <TextField
                                    label="Name"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    required
                                />
                            )}
                            <TextField
                                label="Email"
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                required
                            />
                            <TextField
                                label="Password"
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                required
                            />
                            <Button variant="contained" type="submit" disabled={loading}>
                                {mode === "signin" ? "Sign in" : "Create account"}
                            </Button>
                        </Box>
                    </Stack>
                </CardContent>
            </Card>
        </Box>
    );
};

export default AuthPage;
