import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "../util/firestore.ts";
import QuoteCard from "../components/QuoteCard.tsx";
import { Box, Typography, Grid } from "@mui/material";
import { User } from "../types/User.ts";
import { QuoteScroller } from "../components/QuoteScroller.tsx";

const MultiViewPage = () => {
    const [users, setUsers] = useState<User[]>([]);

    const [dailyQuotes, setDailyQuotes] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        const fetchQuotes = async () => {
            const querySnapshot = await getDocs(collection(db, "quotes"));
            const fetchedUsers = querySnapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as User[];

            setUsers(fetchedUsers);
        };

        fetchQuotes();
    }, []);

    // Function to check and update daily quotes
    const updateDailyQuotes = useCallback(async () => {
        const dailyDocRef = doc(db, "meta", "dailyQuotes");
        const dailyDocSnap = await getDoc(dailyDocRef);
        const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

        if (dailyDocSnap.exists()) {
            const data = dailyDocSnap.data();
            if (data.lastUpdated === today) {
                setDailyQuotes(data.quotes || {});
                return; // Already updated today
            }
        }

        // Generate new daily quotes
        const newDailyQuotes: { [key: string]: string } = {};
        users.forEach((user) => {
            if (user.quotes.length > 0) {
                const randomQuote = user.quotes[Math.floor(Math.random() * user.quotes.length)];
                newDailyQuotes[user.name] = randomQuote;
            }
        });

        if (users.length > 0) {
            // Store new daily quotes in Firestore
            await setDoc(dailyDocRef, {
                lastUpdated: today,
                quotes: newDailyQuotes,
            });
        }

        setDailyQuotes(newDailyQuotes);
    }, [users]);

    useEffect(() => {
        void updateDailyQuotes(); // Run on mount

        const interval = setInterval(() => {
            void updateDailyQuotes();
        }, 2 * 60 * 60 * 1000); // Every 2 hours

        return () => clearInterval(interval);
    }, [updateDailyQuotes]);

    return (
        <Box display="flex" flexDirection="column" alignItems="center" minHeight="100vh" p={3} width="100%">
            <Grid container spacing={3} justifyContent="center" width="100%" sx={{ flexGrow: 1 }}>
                {/* Daily Quote Section (left-aligned and scrollable) */}
                <Grid item xs={12} md={6} display="flex" flexDirection="column" alignItems="center" sx={{ height: { xs: 'auto', md: '100%' }, overflow: { xs: 'visible', md: 'hidden' } }}>

                    <Typography variant="h5" align="center" paddingBottom="27px">Today's Quotes</Typography>

                    {Object.entries(dailyQuotes).map(([author, quote]) => (
                        <QuoteCard key={author} text={quote} author={author} />
                    ))}
                </Grid>

                {/* Random Quotes Section */}
                <Grid item xs={12} md={6} display="flex" justifyContent="center" alignItems="center" flexDirection="column" sx={{ height: { xs: 'auto', md: '100%' } }}>
                    <Typography variant="h5" align="center" paddingBottom="27px">Random Quotes</Typography>
                    {users.map(() => (
                        <QuoteScroller users={users} />
                    ))}

                </Grid>
            </Grid>
        </Box>
    );
};

export default MultiViewPage;
