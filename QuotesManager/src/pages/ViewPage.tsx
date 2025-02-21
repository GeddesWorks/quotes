import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../util/firestore.ts";
import QuoteCard from "../components/QuoteCard.tsx";
import { Box, Typography, Button } from "@mui/material";
import { User } from "../types/User.ts";
import { useNavigate } from "react-router-dom";

const ViewPage = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [randomQuoteIndex, setRandomQuoteIndex] = useState(0);
    const [randomUserIndex, setRandomUserIndex] = useState(0);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchQuotes = async () => {
            const querySnapshot = await getDocs(collection(db, "quotes"));
            const fetchedQuotes = querySnapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as User[];
            setUsers(fetchedQuotes);
        };

        fetchQuotes();


    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            if (users.length > 0) {
                const randomUserIdx = Math.floor(Math.random() * users.length);
                setRandomUserIndex(randomUserIdx);
                const randomUser = users[randomUserIdx];
                if (randomUser.quotes.length > 0) {
                    setRandomQuoteIndex(Math.floor(Math.random() * randomUser.quotes.length));
                }
            }
        }, 15000);

        return () => clearInterval(interval);
    }, [users]);

    return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
            <Box p={3} display="flex" flexDirection="column" gap={2} width="100%" maxWidth="600px">
                <Typography variant="h4" align="center">View Quotes</Typography>
                {users.length > 0 && (
                    <QuoteCard
                        text={users[randomUserIndex]?.quotes[randomQuoteIndex] || "No quotes available"}
                        author={users[randomUserIndex]?.name || "Unknown"}
                    />
                )}
                <Button variant="outlined" color="secondary" onClick={() => navigate("/")}>
                    Go Home
                </Button>
            </Box>
        </Box>
    );
};

export default ViewPage;