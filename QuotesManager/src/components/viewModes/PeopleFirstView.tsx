import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Grid,
    IconButton,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography
} from "@mui/material";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StarIcon from "@mui/icons-material/Star";
import { useEffect, useMemo, useState } from "react";
import QuoteCard from "../QuoteCard";
import type { ViewModeProps } from "./types";

const PeopleFirstView: React.FC<ViewModeProps> = ({
    quotes,
    people,
    peopleMap,
    onQuoteSelect,
    favorites,
    onToggleFavorite
}) => {
    const [selectedPersonId, setSelectedPersonId] = useState<string>("");
    const [peopleSearch, setPeopleSearch] = useState("");
    const [peopleFilter, setPeopleFilter] = useState<"all" | "members" | "placeholders">("all");
    const favoriteSet = useMemo(() => new Set(favorites ?? []), [favorites]);
    const canFavorite = Boolean(onToggleFavorite);

    const quoteCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const quote of quotes) {
            counts.set(quote.personId, (counts.get(quote.personId) || 0) + 1);
        }
        return counts;
    }, [quotes]);

    const filteredPeople = useMemo(() => {
        let filtered = people;
        if (peopleFilter === "members") {
            filtered = filtered.filter((person) => !person.isPlaceholder);
        } else if (peopleFilter === "placeholders") {
            filtered = filtered.filter((person) => person.isPlaceholder);
        }
        if (peopleSearch.trim()) {
            const query = peopleSearch.trim().toLowerCase();
            filtered = filtered.filter((person) => person.name.toLowerCase().includes(query));
        }
        return filtered;
    }, [people, peopleFilter, peopleSearch]);

    useEffect(() => {
        if (!filteredPeople.length) {
            setSelectedPersonId("");
            return;
        }
        if (!selectedPersonId || !filteredPeople.some((person) => person.$id === selectedPersonId)) {
            setSelectedPersonId(filteredPeople[0].$id);
        }
    }, [filteredPeople, selectedPersonId]);

    const selectedQuotes = useMemo(
        () => quotes.filter((quote) => quote.personId === selectedPersonId),
        [quotes, selectedPersonId]
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
        <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
                <Card>
                    <CardContent>
                        <Stack spacing={2}>
                            <Typography variant="h6">People</Typography>
                            <TextField
                                label="Search people"
                                value={peopleSearch}
                                onChange={(event) => setPeopleSearch(event.target.value)}
                            />
                            <ToggleButtonGroup
                                value={peopleFilter}
                                exclusive
                                onChange={(_, value) => value && setPeopleFilter(value)}
                                size="small"
                            >
                                <ToggleButton value="all">All</ToggleButton>
                                <ToggleButton value="members">Members</ToggleButton>
                                <ToggleButton value="placeholders">Placeholders</ToggleButton>
                            </ToggleButtonGroup>
                            <Stack spacing={1.5}>
                                {filteredPeople.length === 0 && (
                                    <Typography variant="body2" color="text.secondary">
                                        No people match your search.
                                    </Typography>
                                )}
                                {filteredPeople.map((person) => {
                                    const isSelected = person.$id === selectedPersonId;
                                    const count = quoteCounts.get(person.$id) || 0;
                                    return (
                                        <Button
                                            key={person.$id}
                                            variant={isSelected ? "contained" : "outlined"}
                                            onClick={() => setSelectedPersonId(person.$id)}
                                            sx={{
                                                justifyContent: "space-between",
                                                textTransform: "none"
                                            }}
                                        >
                                            <span>{person.name}</span>
                                            <Chip label={count} size="small" />
                                        </Button>
                                    );
                                })}
                            </Stack>
                        </Stack>
                    </CardContent>
                </Card>
            </Grid>
            <Grid item xs={12} md={8}>
                <Card>
                    <CardContent>
                        <Stack spacing={2}>
                            <Typography variant="h6">
                                {selectedPersonId ? peopleMap.get(selectedPersonId)?.name : "Select a person"}
                            </Typography>
                            {selectedPersonId && selectedQuotes.length === 0 && (
                                <Typography variant="body2" color="text.secondary">
                                    No quotes for this person yet.
                                </Typography>
                            )}
                            {selectedPersonId && selectedQuotes.length > 0 && (
                                <Stack spacing={2}>
                                    {selectedQuotes.map((quote) => (
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
                            )}
                            {!selectedPersonId && (
                                <Box paddingY={2}>
                                    <Typography variant="body2" color="text.secondary">
                                        Pick someone to see all the quotes attributed to them.
                                    </Typography>
                                </Box>
                            )}
                        </Stack>
                    </CardContent>
                </Card>
            </Grid>
        </Grid>
    );
};

export default PeopleFirstView;
