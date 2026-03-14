import {
    Box,
    Button,
    Card,
    CardContent,
    Grid,
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

const CombinedView: React.FC<ViewModeProps> = ({
    filteredQuotes,
    peopleMap,
    quoteOfTheDay,
    quoteOfTheWeek,
    stats,
    search,
    onSearchChange,
    onQuoteSelect,
    favorites,
    onToggleFavorite
}) => {
    const [visibleCount, setVisibleCount] = useState(20);
    const favoriteSet = useMemo(() => new Set(favorites ?? []), [favorites]);
    const canFavorite = Boolean(onToggleFavorite);

    useEffect(() => {
        setVisibleCount(20);
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
            <Grid container spacing={2}>
                <Grid item xs={12} md={7}>
                    <Stack spacing={2}>
                        <Card
                            sx={(theme) => ({
                                borderLeft: `4px solid ${theme.palette.primary.main}`,
                                background:
                                    theme.palette.mode === "dark"
                                        ? "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))"
                                        : "linear-gradient(135deg, rgba(0,0,0,0.05), rgba(0,0,0,0.00))"
                            })}
                        >
                            <CardContent>
                                <Stack spacing={1.5}>
                                    <Typography variant="overline" color="text.secondary">
                                        Quote of the day
                                    </Typography>
                                    {quoteOfTheDay ? (
                                        <Stack spacing={1}>
                                            <Typography variant="h5" sx={{ lineHeight: 1.4 }}>
                                                "{quoteOfTheDay.text}"
                                            </Typography>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                                - {peopleMap.get(quoteOfTheDay.personId)?.name || "Unknown"}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Added by {quoteOfTheDay.createdByName}
                                            </Typography>
                                        </Stack>
                                    ) : (
                                        <Typography variant="body2" color="text.secondary">
                                            Add the first quote to start the daily rotation.
                                        </Typography>
                                    )}
                                </Stack>
                            </CardContent>
                        </Card>
                        <Card
                            sx={(theme) => ({
                                borderLeft: `4px solid ${theme.palette.secondary.main}`,
                                background:
                                    theme.palette.mode === "dark"
                                        ? "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))"
                                        : "linear-gradient(135deg, rgba(0,0,0,0.04), rgba(0,0,0,0.00))"
                            })}
                        >
                            <CardContent>
                                <Stack spacing={1.5}>
                                    <Typography variant="overline" color="text.secondary">
                                        Quote of the week
                                    </Typography>
                                    {quoteOfTheWeek ? (
                                        <Stack spacing={1}>
                                            <Typography variant="h5" sx={{ lineHeight: 1.4 }}>
                                                "{quoteOfTheWeek.text}"
                                            </Typography>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                                - {peopleMap.get(quoteOfTheWeek.personId)?.name || "Unknown"}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Added by {quoteOfTheWeek.createdByName}
                                            </Typography>
                                        </Stack>
                                    ) : (
                                        <Typography variant="body2" color="text.secondary">
                                            Add the first quote to start the weekly highlight.
                                        </Typography>
                                    )}
                                </Stack>
                            </CardContent>
                        </Card>
                    </Stack>
                </Grid>
                <Grid item xs={12} md={5}>
                    <Card>
                        <CardContent>
                            <Stack spacing={2}>
                                <Typography variant="h6">Group stats</Typography>
                                <Grid container spacing={2}>
                                    <Grid item xs={6}>
                                        <Box
                                            sx={{
                                                border: "1px solid",
                                                borderColor: "divider",
                                                borderRadius: 2,
                                                padding: 2
                                            }}
                                        >
                                            <Typography variant="overline" color="text.secondary">
                                                Total quotes
                                            </Typography>
                                            <Typography variant="h5">{stats.totalQuotes}</Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Box
                                            sx={{
                                                border: "1px solid",
                                                borderColor: "divider",
                                                borderRadius: 2,
                                                padding: 2
                                            }}
                                        >
                                            <Typography variant="overline" color="text.secondary">
                                                People tracked
                                            </Typography>
                                            <Typography variant="h5">{stats.totalPeople}</Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={12}>
                                        <Box
                                            sx={{
                                                border: "1px solid",
                                                borderColor: "divider",
                                                borderRadius: 2,
                                                padding: 2
                                            }}
                                        >
                                            <Typography variant="overline" color="text.secondary">
                                                Top quoter
                                            </Typography>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                                {stats.topQuoter?.name || "-"}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {stats.topQuoter ? `${stats.topQuoter.count} quotes` : "No quotes yet"}
                                            </Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={12}>
                                        <Box
                                            sx={{
                                                border: "1px solid",
                                                borderColor: "divider",
                                                borderRadius: 2,
                                                padding: 2
                                            }}
                                        >
                                            <Typography variant="overline" color="text.secondary">
                                                Most quoted
                                            </Typography>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                                {stats.topQuoted?.name || "-"}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {stats.topQuoted ? `${stats.topQuoted.count} quotes` : "No quotes yet"}
                                            </Typography>
                                        </Box>
                                    </Grid>
                                </Grid>
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                    <Card>
                        <CardContent>
                            <Stack spacing={2}>
                                <Typography variant="h6">Browse quotes</Typography>
                                <TextField
                                    label="Search quotes or people"
                                    value={search}
                                    onChange={(event) => onSearchChange(event.target.value)}
                                />
                                <Typography variant="body2" color="text.secondary">
                                    Showing {Math.min(visibleQuotes.length, filteredQuotes.length)} of{" "}
                                    {filteredQuotes.length} quotes.
                                </Typography>
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={8}>
                    <Card>
                        <CardContent>
                            <Stack spacing={2}>
                                <Typography variant="h6">All quotes</Typography>
                                {filteredQuotes.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">
                                        No quotes match your search yet.
                                    </Typography>
                                ) : (
                                    <Stack spacing={2}>
                                        {visibleQuotes.map((quote, index) => (
                                            <Box
                                                key={quote.$id}
                                                className="stagger"
                                                sx={{ animationDelay: `${index * 30}ms` }}
                                            >
                                                <QuoteCard
                                                    text={quote.text}
                                                    author={peopleMap.get(quote.personId)?.name || "Unknown"}
                                                    addedBy={quote.createdByName}
                                                    onSelect={() => onQuoteSelect?.(quote.$id)}
                                                    actions={renderFavoriteAction(quote.$id)}
                                                />
                                            </Box>
                                        ))}
                                        {filteredQuotes.length > visibleQuotes.length && (
                                            <Button
                                                variant="text"
                                                onClick={() => setVisibleCount((prev) => prev + 20)}
                                            >
                                                Load more
                                            </Button>
                                        )}
                                    </Stack>
                                )}
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Stack>
    );
};

export default CombinedView;
