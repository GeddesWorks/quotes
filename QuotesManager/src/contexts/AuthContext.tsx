import type { Models } from "appwrite";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ID, account } from "../util/appwrite";

interface AuthContextValue {
    user: Models.User<Models.Preferences> | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (name: string, email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        setLoading(true);
        try {
            const current = await account.get();
            setUser(current);
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
    }, []);

    const signIn = async (email: string, password: string) => {
        setLoading(true);
        try {
            await account.createEmailPasswordSession(email, password);
            const current = await account.get();
            setUser(current);
        } finally {
            setLoading(false);
        }
    };

    const signUp = async (name: string, email: string, password: string) => {
        setLoading(true);
        try {
            await account.create(ID.unique(), email, password, name);
            await account.createEmailPasswordSession(email, password);
            const current = await account.get();
            setUser(current);
        } finally {
            setLoading(false);
        }
    };

    const signOut = async () => {
        setLoading(true);
        try {
            await account.deleteSessions();
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    const value = useMemo(
        () => ({ user, loading, signIn, signUp, signOut, refresh }),
        [user, loading]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within AuthProvider.");
    }
    return context;
};
