import {
    Box,
    Button,
    Card,
    CardContent,
    IconButton,
    Stack,
    TextField,
    Typography
} from "@mui/material";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StarIcon from "@mui/icons-material/Star";
import { useEffect, useMemo, useState } from "react";
import QuoteCard from "../QuoteCard";
import type { ViewModeProps } from "./types";

const QuoteWallView: React.FC<ViewModeProps> = ({
    filteredQuotes,
    peopleMap,
    search,
    onSearchChange,
    onQuoteSelect,
    favorites,
    onToggleFavorite
}) => {
    const [visibleCount, setVisibleCount] = useState(30);
    const favoriteSet = useMemo(() => new Set(favorites ?? []), [favorites]);
    const canFavorite = Boolean(onToggleFavorite);

    useEffect(() => {
        setVisibleCount(30);
    }, [filteredQuotes.length, search]);

    const visibleQuotes = useMemo(
        () => filteredQuotes.slice(0, visibleCount),
        [filteredQuotes, visibleCount]
    );

    const renderFavoriteAction = (quoteId: string) => {
        if (!canFavorite) return null;
        const isFavorite = favoriteSet.has(quoteId);
        return (
            <IconButton
                aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
                onClick={(event) => {
                    event.stopPropagation();
                    onToggleFavorite?.(quoteId);
                }}
            >
                {isFavorite ? <StarIcon /> : <StarBorderIcon />}
            </IconButton>
        );
    };

    return (
        <Stack spacing={2}>
            <Card>
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6">Quote wall</Typography>
                        <TextField
                            label="Search quotes or people"
                            value={search}
                            onChange={(event) => onSearchChange(event.target.value)}
                        />
                        <Typography variant="body2" color="text.secondary">
                            Showing {Math.min(visibleQuotes.length, filteredQuotes.length)} of {filteredQuotes.length}
                            quotes.
                        </Typography>
                    </Stack>
                </CardContent>
            </Card>
            {filteredQuotes.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    No quotes match your search yet.
                </Typography>
            ) : (
                <>
                    <Box
                        sx={{
                            columnCount: { xs: 1, sm: 2, md: 3 },
                            columnGap: 2
                        }}
                    >
                        {visibleQuotes.map((quote) => (
                            <Box key={quote.$id} sx={{ breakInside: "avoid", marginBottom: 2 }}>
                                <QuoteCard
                                    text={quote.text}
                                    author={peopleMap.get(quote.personId)?.name || "Unknown"}
                                    addedBy={quote.createdByName}
                                    onSelect={() => onQuoteSelect?.(quote.$id)}
                                    actions={renderFavoriteAction(quote.$id)}
                                />
                            </Box>
                        ))}
                    </Box>
                    {filteredQuotes.length > visibleQuotes.length && (
                        <Button variant="text" onClick={() => setVisibleCount((prev) => prev + 30)}>
                            Load more
                        </Button>
                    )}
                </>
            )}
        </Stack>
    );
};

export default QuoteWallView;
