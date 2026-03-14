import { Button, Card, CardContent, Stack, Typography } from "@mui/material";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StarIcon from "@mui/icons-material/Star";
import { useEffect, useMemo, useState } from "react";
import type { ViewModeProps } from "./types";

const StoryView: React.FC<ViewModeProps> = ({
    quotes,
    peopleMap,
    onQuoteSelect,
    favorites,
    onToggleFavorite
}) => {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        setIndex(0);
    }, [quotes.length]);

    const activeQuote = useMemo(() => quotes[index], [index, quotes]);
    const isFavorite = activeQuote ? favorites?.includes(activeQuote.$id) ?? false : false;

    useEffect(() => {
        if (activeQuote) {
            onQuoteSelect?.(activeQuote.$id);
        }
    }, [activeQuote, onQuoteSelect]);

    const handlePrev = () => {
        if (quotes.length === 0) return;
        setIndex((prev) => (prev - 1 + quotes.length) % quotes.length);
    };

    const handleNext = () => {
        if (quotes.length === 0) return;
        setIndex((prev) => (prev + 1) % quotes.length);
    };

    const handleShuffle = () => {
        if (quotes.length === 0) return;
        const nextIndex = Math.floor(Math.random() * quotes.length);
        setIndex(nextIndex);
    };

    return (
        <Card>
            <CardContent>
                <Stack spacing={3} alignItems="center" textAlign="center">
                    <Typography variant="overline" color="text.secondary">
                        Story mode
                    </Typography>
                    {activeQuote ? (
                        <>
                            <Typography variant="h4" sx={{ lineHeight: 1.3 }}>
                                "{activeQuote.text}"
                            </Typography>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                - {peopleMap.get(activeQuote.personId)?.name || "Unknown"}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Added by {activeQuote.createdByName}
                            </Typography>
                            {onToggleFavorite && (
                                <Button
                                    variant="text"
                                    startIcon={isFavorite ? <StarIcon /> : <StarBorderIcon />}
                                    onClick={() => activeQuote && onToggleFavorite(activeQuote.$id)}
                                >
                                    {isFavorite ? "Unstar" : "Star"}
                                </Button>
                            )}
                        </>
                    ) : (
                        <Typography variant="body2" color="text.secondary">
                            Add some quotes to start the story.
                        </Typography>
                    )}
                    <Stack direction="row" spacing={2}>
                        <Button variant="outlined" onClick={handlePrev} disabled={quotes.length === 0}>
                            Previous
                        </Button>
                        <Button variant="outlined" onClick={handleShuffle} disabled={quotes.length === 0}>
                            Shuffle
                        </Button>
                        <Button variant="contained" onClick={handleNext} disabled={quotes.length === 0}>
                            Next
                        </Button>
                    </Stack>
                </Stack>
            </CardContent>
        </Card>
    );
};

export default StoryView;
