import { Card, CardContent, IconButton, Stack, TextField, Typography } from "@mui/material";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StarIcon from "@mui/icons-material/Star";
import { useMemo } from "react";
import QuoteCard from "../QuoteCard";
import type { ViewModeProps } from "./types";

const FavoritesView: React.FC<ViewModeProps> = ({
    quotes,
    peopleMap,
    favorites,
    onToggleFavorite,
    search,
    onSearchChange,
    onQuoteSelect
}) => {
    const favoriteList = useMemo(() => {
        if (!favorites || favorites.length === 0) return [];
        const favoriteSet = new Set(favorites);
        return quotes.filter((quote) => favoriteSet.has(quote.$id));
    }, [favorites, quotes]);

    const filtered = useMemo(() => {
        if (!search.trim()) return favoriteList;
        const query = search.trim().toLowerCase();
        return favoriteList.filter((quote) => {
            const author = peopleMap.get(quote.personId)?.name ?? "";
            return quote.text.toLowerCase().includes(query) || author.toLowerCase().includes(query);
        });
    }, [favoriteList, peopleMap, search]);

    const canToggle = Boolean(onToggleFavorite);

    return (
        <Stack spacing={2}>
            <Card>
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6">Favorites</Typography>
                        <TextField
                            label="Search favorites"
                            value={search}
                            onChange={(event) => onSearchChange(event.target.value)}
                        />
                        <Typography variant="body2" color="text.secondary">
                            {filtered.length} favorite quotes
                        </Typography>
                    </Stack>
                </CardContent>
            </Card>

            {filtered.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    Star quotes to see them listed here.
                </Typography>
            ) : (
                <Stack spacing={2}>
                    {filtered.map((quote) => {
                        const isFavorite = favorites?.includes(quote.$id) ?? false;
                        return (
                            <QuoteCard
                                key={quote.$id}
                                text={quote.text}
                                author={peopleMap.get(quote.personId)?.name || "Unknown"}
                                addedBy={quote.createdByName}
                                onSelect={() => onQuoteSelect?.(quote.$id)}
                                actions={
                                    canToggle ? (
                                        <IconButton
                                            aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onToggleFavorite?.(quote.$id);
                                            }}
                                        >
                                            {isFavorite ? <StarIcon /> : <StarBorderIcon />}
                                        </IconButton>
                                    ) : null
                                }
                            />
                        );
                    })}
                </Stack>
            )}
        </Stack>
    );
};

export default FavoritesView;
