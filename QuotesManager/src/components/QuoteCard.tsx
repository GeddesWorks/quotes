import { Card, CardContent, Typography } from "@mui/material";
import capitalize from "capitalize";

interface QuoteCardProps {
    text: string;
    author: string;
}

const QuoteCard: React.FC<QuoteCardProps> = ({ text, author }) => {
    return (
        <Card
            sx={{
                width: "100%",   // Ensures it takes the full width of the parent container
                maxWidth: "100%", // Prevents unnecessary restriction
                margin: "auto",
                padding: 2,
                textAlign: "center",
                backgroundColor: "#4444",
                boxShadow: 3,
                borderRadius: 0
            }}
        >
            <CardContent>
                <Typography variant="h6" gutterBottom color="#fffd">
                    "{capitalize(text)}"
                </Typography>
                <Typography variant="subtitle1" color="#fffa">
                    - {author}
                </Typography>
            </CardContent>
        </Card>

    );
};

export default QuoteCard;