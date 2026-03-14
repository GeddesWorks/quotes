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
import type { QuoteDoc } from "../../util/appwriteTypes";
import type { ViewModeProps } from "./types";

const formatDate = (value: string) => {
    if (value === "unknown") {
        return "Unknown date";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric"
    }).format(date);
};

const TimelineView: React.FC<ViewModeProps> = ({
    filteredQuotes,
    peopleMap,
    search,
    onSearchChange,
    onQuoteSelect,
    favorites,
    onToggleFavorite
}) => {
    const [visibleCount, setVisibleCount] = useState(25);
    const favoriteSet = useMemo(() => new Set(favorites ?? []), [favorites]);
    const canFavorite = Boolean(onToggleFavorite);

    useEffect(() => {
        setVisibleCount(25);
    }, [filteredQuotes.length, search]);

    const grouped = useMemo(() => {
        const visible = filteredQuotes.slice(0, visibleCount);
        const map = new Map<string, QuoteDoc[]>();
        for (const quote of visible) {
            const key = quote.createdAt ? quote.createdAt.slice(0, 10) : "unknown";
            const list = map.get(key) ?? [];
            list.push(quote);
            map.set(key, list);
        }
        return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    }, [filteredQuotes, visibleCount]);

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
                        <Typography variant="h6">Quote timeline</Typography>
                        <TextField
                            label="Search quotes or people"
                            value={search}
                            onChange={(event) => onSearchChange(event.target.value)}
                        />
                        <Typography variant="body2" color="text.secondary">
                            Showing {Math.min(visibleCount, filteredQuotes.length)} of {filteredQuotes.length} quotes.
                        </Typography>
                    </Stack>
                </CardContent>
            </Card>
            {grouped.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    No quotes match your search yet.
                </Typography>
            ) : (
                <Stack spacing={3}>
                    {grouped.map(([date, quotes]) => (
                        <Box key={date} sx={{ borderLeft: "2px solid", borderColor: "divider", paddingLeft: 2 }}>
                            <Typography variant="overline" color="text.secondary">
                                {formatDate(date)}
                            </Typography>
                            <Stack spacing={2} marginTop={1.5}>
                                {quotes.map((quote) => (
                                    <QuoteCard
                                        key={quote.$id}
                                        text={quote.text}
                                        author={peopleMap.get(quote.personId)?.name || "Unknown"}
                                        addedBy={quote.createdByName}
                                        onSelect={() => onQuoteSelect?.(quote.$id)}
                                        actions={renderFavoriteAction(quote.$id)}
                                    />
                                ))}
                            </Stack>
                        </Box>
                    ))}
                </Stack>
            )}
            {filteredQuotes.length > visibleCount && (
                <Button variant="text" onClick={() => setVisibleCount((prev) => prev + 25)}>
                    Load more
                </Button>
            )}
        </Stack>
    );
};

export default TimelineView;
