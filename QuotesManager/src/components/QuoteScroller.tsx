import { useEffect, useState } from "react";
import { User } from "../types/User";
import QuoteCard from "./QuoteCard";

interface QuoteScrollerProps {
    users: User[];
}

export const QuoteScroller: React.FC<QuoteScrollerProps> = ({ users }) => {  // Destructure users from props
    const [randomQuoteIndex, setRandomQuoteIndex] = useState(0);
    const [randomUserIndex, setRandomUserIndex] = useState(0);

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
        <>
            {users.length > 0 && (
                <QuoteCard
                    text={users[randomUserIndex]?.quotes[randomQuoteIndex] || "No quotes available"}
                    author={users[randomUserIndex]?.name || "Unknown"}
                />
            )}
        </>
    );
};
