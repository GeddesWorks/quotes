import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    FormControl,
    FormControlLabel,
    InputLabel,
    IconButton,
    MenuItem,
    Select,
    Stack,
    Switch,
    TextField,
    Typography
} from "@mui/material";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StarIcon from "@mui/icons-material/Star";
import { useEffect, useMemo, useState } from "react";
import QuoteCard from "../QuoteCard";
import type { ViewModeProps } from "./types";

const helperWords = new Set([
    "the",
    "and",
    "that",
    "this",
    "with",
    "for",
    "from",
    "you",
    "your",
    "but",
    "are",
    "was",
    "were",
    "have",
    "has",
    "had",
    "not",
    "its",
    "our",
    "out",
    "about",
    "they",
    "them",
    "him",
    "her",
    "she",
    "his",
    "hers",
    "their",
    "what",
    "when",
    "where",
    "who",
    "why",
    "how",
    "just",
    "like",
    "then",
    "than",
    "into",
    "over",
    "under",
    "been",
    "will",
    "would",
    "could",
    "should",
    "dont",
    "cant",
    "wont",
    "isnt",
    "youre",
    "yours",
    "we",
    "us",
    "i",
    "me",
    "my",
    "mine",
    "a",
    "an",
    "of",
    "to",
    "in",
    "on",
    "at",
    "it",
    "im",
    "ive",
    "id",
    "ill"
]);

const CombinedView: React.FC<ViewModeProps> = ({
    quotes,
    filteredQuotes,
    peopleMap,
    quoteOfTheDay,
    quoteOfTheWeek,
    stats,
    search,
    onSearchChange,
    onQuoteSelect,
    favorites,
    quoteLikeCounts,
    onToggleFavorite
}) => {
    const [visibleCount, setVisibleCount] = useState(20);
    const [personFilter, setPersonFilter] = useState("all");
    const [timeRange, setTimeRange] = useState<"all" | "30d" | "90d" | "1y">("all");
    const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "person">("newest");
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const favoriteSet = useMemo(() => new Set(favorites ?? []), [favorites]);
    const canFavorite = Boolean(onToggleFavorite);
    const hasSyncedLikeCounts = Boolean(quoteLikeCounts);

    useEffect(() => {
        setVisibleCount(20);
    }, [favoritesOnly, filteredQuotes.length, personFilter, search, sortOrder, timeRange]);

    const peopleOptions = useMemo(() => {
        const ids = new Set(quotes.map((quote) => quote.personId));
        return Array.from(ids)
            .map((personId) => ({
                personId,
                name: peopleMap.get(personId)?.name || "Unknown"
            }))
            .sort((left, right) => left.name.localeCompare(right.name));
    }, [peopleMap, quotes]);

    const mostLiked = useMemo(() => {
        const counts = new Map<string, number>();
        if (quoteLikeCounts) {
            Object.entries(quoteLikeCounts).forEach(([quoteId, count]) => {
                if (count > 0) {
                    counts.set(quoteId, count);
                }
            });
        } else if (favorites) {
            favorites.forEach((quoteId) => {
                counts.set(quoteId, (counts.get(quoteId) ?? 0) + 1);
            });
        }
        if (counts.size === 0) {
            return null;
        }
        let bestId = "";
        let bestCount = 0;
        counts.forEach((count, quoteId) => {
            if (count > bestCount) {
                bestId = quoteId;
                bestCount = count;
            }
        });
        if (!bestId) {
            return null;
        }
        const quote = quotes.find((entry) => entry.$id === bestId);
        if (!quote) {
            return null;
        }
        return { quote, likeCount: bestCount };
    }, [favorites, quoteLikeCounts, quotes]);

    const topWords = useMemo(() => {
        const counts = new Map<string, number>();
        for (const quote of quotes) {
            const words = quote.text
                .toLowerCase()
                .replace(/[^a-z0-9'\s]/g, " ")
                .split(/\s+/)
                .map((word) => word.trim())
                .filter(
                    (word) =>
                        word.length >= 3 &&
                        /^[a-z0-9][a-z0-9'-]*$/.test(word) &&
                        !helperWords.has(word)
                );
            words.forEach((word) => {
                counts.set(word, (counts.get(word) ?? 0) + 1);
            });
        }
        return Array.from(counts.entries())
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
            .slice(0, 5);
    }, [quotes]);

    const browseQuotes = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const cutoffDays = timeRange === "30d" ? 30 : timeRange === "90d" ? 90 : timeRange === "1y" ? 365 : 0;
        const cutoff = cutoffDays > 0 ? new Date(now) : null;
        if (cutoff) {
            cutoff.setDate(cutoff.getDate() - (cutoffDays - 1));
        }

        const filtered = filteredQuotes.filter((quote) => {
            if (personFilter !== "all" && quote.personId !== personFilter) {
                return false;
            }
            if (favoritesOnly && !favoriteSet.has(quote.$id)) {
                return false;
            }
            if (cutoff) {
                const created = Date.parse(quote.createdAt || "");
                if (Number.isNaN(created) || created < cutoff.getTime()) {
                    return false;
                }
            }
            return true;
        });

        const sorted = [...filtered];
        sorted.sort((left, right) => {
            if (sortOrder === "person") {
                const leftName = peopleMap.get(left.personId)?.name || "Unknown";
                const rightName = peopleMap.get(right.personId)?.name || "Unknown";
                return leftName.localeCompare(rightName);
            }
            const leftTime = Date.parse(left.createdAt || "") || 0;
            const rightTime = Date.parse(right.createdAt || "") || 0;
            if (sortOrder === "oldest") {
                return leftTime - rightTime;
            }
            return rightTime - leftTime;
        });
        return sorted;
    }, [favoriteSet, favoritesOnly, filteredQuotes, peopleMap, personFilter, sortOrder, timeRange]);

    const visibleQuotes = useMemo(
        () => browseQuotes.slice(0, visibleCount),
        [browseQuotes, visibleCount]
    );

    const renderFavoriteAction = (quoteId: string) => {
        if (!canFavorite) return null;
        const isFavorite = favoriteSet.has(quoteId);
        return (
            <IconButton
                aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
                title={isFavorite ? "Unstar quote" : "Star quote"}
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
        <Stack spacing={2} sx={{ width: "100%", maxWidth: 1280, mx: "auto", alignSelf: "center" }}>
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "minmax(0, 2fr) minmax(0, 1fr)" },
                    gap: 2,
                    alignItems: "stretch"
                }}
            >
                <Stack spacing={2} sx={{ height: "100%", minHeight: 0 }}>
                    <Card
                        sx={(theme) => ({
                            flex: 1,
                            display: "flex",
                            borderLeft: `4px solid ${theme.palette.primary.main}`,
                            background:
                                theme.palette.mode === "dark"
                                    ? "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))"
                                    : "linear-gradient(135deg, rgba(0,0,0,0.05), rgba(0,0,0,0.00))"
                        })}
                    >
                        <CardContent sx={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
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
                            flex: 1,
                            display: "flex",
                            borderLeft: `4px solid ${theme.palette.secondary.main}`,
                            background:
                                theme.palette.mode === "dark"
                                    ? "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))"
                                    : "linear-gradient(135deg, rgba(0,0,0,0.04), rgba(0,0,0,0.00))"
                        })}
                    >
                        <CardContent sx={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
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
                    <Card
                        sx={(theme) => ({
                            flex: 1,
                            display: "flex",
                            borderLeft: `4px solid ${theme.palette.warning.main}`,
                            background:
                                theme.palette.mode === "dark"
                                    ? "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))"
                                    : "linear-gradient(135deg, rgba(0,0,0,0.04), rgba(0,0,0,0.00))"
                        })}
                    >
                        <CardContent sx={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                            <Stack spacing={1.5}>
                                <Typography variant="overline" color="text.secondary">
                                    Most favorited quote
                                </Typography>
                                {mostLiked ? (
                                    <Stack spacing={1}>
                                        <Typography variant="h6" sx={{ lineHeight: 1.4 }}>
                                            "{mostLiked.quote.text}"
                                        </Typography>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                            - {peopleMap.get(mostLiked.quote.personId)?.name || "Unknown"}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {mostLiked.likeCount} like{mostLiked.likeCount === 1 ? "" : "s"}
                                        </Typography>
                                    </Stack>
                                ) : (
                                    <Typography variant="body2" color="text.secondary">
                                        {hasSyncedLikeCounts
                                            ? "Favorite quotes to surface the group's most favorited quote."
                                            : "Favorite quotes to surface the most favorited quote."}
                                    </Typography>
                                )}
                            </Stack>
                        </CardContent>
                    </Card>
                </Stack>
                <Card sx={{ height: "100%" }}>
                    <CardContent sx={{ height: "100%" }}>
                        <Stack spacing={2} sx={{ height: "100%" }}>
                            <Typography variant="h6">Group stats</Typography>
                            <Box
                                sx={{
                                    flex: 1,
                                    minHeight: 0,
                                    display: "grid",
                                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                    gridTemplateRows: "repeat(4, minmax(0, 1fr))",
                                    gap: 2
                                }}
                            >
                                <Box
                                    sx={{
                                        border: "1px solid",
                                        borderColor: "divider",
                                        borderRadius: "999px",
                                        height: "100%",
                                        padding: 2,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        textAlign: "center"
                                    }}
                                >
                                    <Typography variant="overline" color="text.secondary">
                                        Total quotes
                                    </Typography>
                                    <Typography variant="h5">{stats.totalQuotes}</Typography>
                                </Box>
                                <Box
                                    sx={{
                                        border: "1px solid",
                                        borderColor: "divider",
                                        borderRadius: "999px",
                                        height: "100%",
                                        padding: 2,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        textAlign: "center"
                                    }}
                                >
                                    <Typography variant="overline" color="text.secondary">
                                        People tracked
                                    </Typography>
                                    <Typography variant="h5">{stats.totalPeople}</Typography>
                                </Box>
                                <Box
                                    sx={{
                                        gridColumn: "1 / -1",
                                        border: "1px solid",
                                        borderColor: "divider",
                                        borderRadius: 2,
                                        height: "100%",
                                        padding: 2,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        textAlign: "center"
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
                                <Box
                                    sx={{
                                        gridColumn: "1 / -1",
                                        border: "1px solid",
                                        borderColor: "divider",
                                        borderRadius: 2,
                                        height: "100%",
                                        padding: 2,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        textAlign: "center"
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
                                <Box
                                    sx={{
                                        gridColumn: "1 / -1",
                                        border: "1px solid",
                                        borderColor: "divider",
                                        borderRadius: 2,
                                        height: "100%",
                                        padding: 2,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        textAlign: "center",
                                        gap: 1.25
                                    }}
                                >
                                    <Typography variant="overline" color="text.secondary">
                                        Top quoted words
                                    </Typography>
                                    {topWords.length === 0 ? (
                                        <Typography variant="body2" color="text.secondary">
                                            Add more quotes to build this list.
                                        </Typography>
                                    ) : (
                                        <Box
                                            sx={{
                                                display: "flex",
                                                flexWrap: "wrap",
                                                gap: 0.75,
                                                justifyContent: "center"
                                            }}
                                        >
                                            {topWords.map(([word, count]) => (
                                                <Chip
                                                    key={word}
                                                    label={`${word} (${count})`}
                                                    size="small"
                                                    variant="outlined"
                                                />
                                            ))}
                                        </Box>
                                    )}
                                </Box>
                            </Box>
                        </Stack>
                    </CardContent>
                </Card>
            </Box>

            <Card variant="outlined">
                <CardContent>
                    <Stack spacing={1.5}>
                        <Typography variant="subtitle1">Search and filters</Typography>
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: {
                                    xs: "1fr",
                                    md: "repeat(2, minmax(0, 1fr))",
                                    xl: "repeat(4, minmax(0, 1fr))"
                                },
                                gap: 1.5
                            }}
                        >
                            <TextField
                                label="Search quotes or people"
                                value={search}
                                onChange={(event) => onSearchChange(event.target.value)}
                            />
                            <FormControl fullWidth>
                                <InputLabel id="combined-person-filter-label">Person</InputLabel>
                                <Select
                                    labelId="combined-person-filter-label"
                                    label="Person"
                                    value={personFilter}
                                    onChange={(event) => setPersonFilter(String(event.target.value))}
                                >
                                    <MenuItem value="all">All people</MenuItem>
                                    {peopleOptions.map((option) => (
                                        <MenuItem key={option.personId} value={option.personId}>
                                            {option.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl fullWidth>
                                <InputLabel id="combined-range-label">Date range</InputLabel>
                                <Select
                                    labelId="combined-range-label"
                                    label="Date range"
                                    value={timeRange}
                                    onChange={(event) =>
                                        setTimeRange(event.target.value as "all" | "30d" | "90d" | "1y")
                                    }
                                >
                                    <MenuItem value="all">All time</MenuItem>
                                    <MenuItem value="30d">Last 30 days</MenuItem>
                                    <MenuItem value="90d">Last 90 days</MenuItem>
                                    <MenuItem value="1y">Last year</MenuItem>
                                </Select>
                            </FormControl>
                            <FormControl fullWidth>
                                <InputLabel id="combined-sort-label">Sort</InputLabel>
                                <Select
                                    labelId="combined-sort-label"
                                    label="Sort"
                                    value={sortOrder}
                                    onChange={(event) =>
                                        setSortOrder(event.target.value as "newest" | "oldest" | "person")
                                    }
                                >
                                    <MenuItem value="newest">Newest first</MenuItem>
                                    <MenuItem value="oldest">Oldest first</MenuItem>
                                    <MenuItem value="person">Person (A-Z)</MenuItem>
                                </Select>
                            </FormControl>
                        </Box>
                        <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1.5}
                            justifyContent="space-between"
                            alignItems={{ sm: "center" }}
                        >
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={favoritesOnly}
                                        onChange={(event) => setFavoritesOnly(event.target.checked)}
                                    />
                                }
                                label="Favorites only"
                            />
                            <Typography variant="body2" color="text.secondary">
                                Showing {browseQuotes.length} of {quotes.length} quotes.
                            </Typography>
                        </Stack>
                    </Stack>
                </CardContent>
            </Card>

            <Card>
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6">All quotes</Typography>
                        {browseQuotes.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                                No quotes match your current filters.
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
                                {browseQuotes.length > visibleQuotes.length && (
                                    <Button variant="text" onClick={() => setVisibleCount((prev) => prev + 20)}>
                                        Load more
                                    </Button>
                                )}
                            </Stack>
                        )}
                    </Stack>
                </CardContent>
            </Card>
        </Stack>
    );
};

export default CombinedView;
