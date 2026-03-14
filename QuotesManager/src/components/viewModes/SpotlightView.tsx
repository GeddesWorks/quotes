import { Button, Card, CardContent, Stack, Typography } from "@mui/material";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StarIcon from "@mui/icons-material/Star";
import { useEffect, useMemo, useState } from "react";
import QuoteCard from "../QuoteCard";
import type { ViewModeProps } from "./types";

const SpotlightView: React.FC<ViewModeProps> = ({
    quotes,
    peopleMap,
    onQuoteSelect,
    favorites,
    onToggleFavorite
}) => {
    const [spotlightId, setSpotlightId] = useState<string>("");

    useEffect(() => {
        if (!quotes.length) {
            setSpotlightId("");
            return;
        }
        if (!quotes.some((quote) => quote.$id === spotlightId)) {
            setSpotlightId(quotes[0].$id);
        }
    }, [quotes, spotlightId]);

    const spotlightQuote = useMemo(
        () => quotes.find((quote) => quote.$id === spotlightId) ?? null,
        [quotes, spotlightId]
    );
    const isFavorite = spotlightQuote ? favorites?.includes(spotlightQuote.$id) ?? false : false;

    useEffect(() => {
        if (spotlightQuote) {
            onQuoteSelect?.(spotlightQuote.$id);
        }
    }, [onQuoteSelect, spotlightQuote]);

    const rotateSpotlight = () => {
        if (!quotes.length) return;
        const next = quotes[Math.floor(Math.random() * quotes.length)];
        setSpotlightId(next.$id);
    };

    const relatedQuotes = useMemo(() => {
        if (!spotlightQuote) return [];
        return quotes
            .filter((quote) => quote.personId === spotlightQuote.personId && quote.$id !== spotlightQuote.$id)
            .slice(0, 3);
    }, [quotes, spotlightQuote]);

    return (
        <Stack spacing={2}>
            <Card>
                <CardContent>
                    <Stack spacing={2} alignItems="flex-start">
                        <Typography variant="h6">Spotlight</Typography>
                        {spotlightQuote ? (
                            <Stack spacing={1.5}>
                                <Typography variant="h4" sx={{ lineHeight: 1.3 }}>
                                    "{spotlightQuote.text}"
                                </Typography>
                                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                    - {peopleMap.get(spotlightQuote.personId)?.name || "Unknown"}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Added by {spotlightQuote.createdByName}
                                </Typography>
                                {onToggleFavorite && (
                                    <Button
                                        variant="text"
                                        startIcon={isFavorite ? <StarIcon /> : <StarBorderIcon />}
                                        onClick={() => spotlightQuote && onToggleFavorite(spotlightQuote.$id)}
                                    >
                                        {isFavorite ? "Unstar" : "Star"}
                                    </Button>
                                )}
                            </Stack>
                        ) : (
                            <Typography variant="body2" color="text.secondary">
                                Add a quote to start the spotlight.
                            </Typography>
                        )}
                        <Button variant="outlined" onClick={rotateSpotlight} disabled={!quotes.length}>
                            New spotlight
                        </Button>
                    </Stack>
                </CardContent>
            </Card>
            {spotlightQuote && (
                <Card>
                    <CardContent>
                        <Stack spacing={2}>
                            <Typography variant="subtitle1">More from this person</Typography>
                            {relatedQuotes.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                    No other quotes for this person yet.
                                </Typography>
                            ) : (
                                <Stack spacing={1.5}>
                                    {relatedQuotes.map((quote) => (
                                        <QuoteCard
                                            key={quote.$id}
                                            text={quote.text}
                                            author={peopleMap.get(quote.personId)?.name || "Unknown"}
                                            addedBy={quote.createdByName}
                                            onSelect={() => onQuoteSelect?.(quote.$id)}
                                        />
                                    ))}
                                </Stack>
                            )}
                        </Stack>
                    </CardContent>
                </Card>
            )}
        </Stack>
    );
};

export default SpotlightView;
