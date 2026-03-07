import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Divider,
    IconButton,
    Stack,
    Typography
} from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import type { PersonDoc, QuoteDoc } from "../../util/appwriteTypes";
import type { StatsSummary } from "../viewModes/types";
import QuoteCard from "../QuoteCard";

export interface ViewModuleProps {
    quotes: QuoteDoc[];
    people: PersonDoc[];
    peopleMap: Map<string, PersonDoc>;
    stats: StatsSummary;
    quoteOfTheDay: QuoteDoc | null;
    quoteOfTheWeek: QuoteDoc | null;
    quoteOfTheHour: QuoteDoc | null;
    favorites: string[];
    toggleFavorite: (quoteId: string) => void;
    recentlyViewed: string[];
    markViewed: (quoteId: string) => void;
}

export interface ViewModuleDefinition {
    key: string;
    label: string;
    description: string;
    isPro?: boolean;
    render: ComponentType<ViewModuleProps>;
}

const stopWords = new Set([
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
    "your",
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
    "it"
]);

const resolveName = (peopleMap: Map<string, PersonDoc>, personId: string) =>
    peopleMap.get(personId)?.name || "Unknown";

const getTopWords = (quotes: QuoteDoc[]) => {
    const counts = new Map<string, number>();
    for (const quote of quotes) {
        const words = quote.text
            .toLowerCase()
            .replace(/[^a-z0-9\\s]/g, " ")
            .split(/\\s+/)
            .filter((word) => word.length >= 4 && !stopWords.has(word));
        for (const word of words) {
            counts.set(word, (counts.get(word) || 0) + 1);
        }
    }
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
};

const getQuotesLastDays = (quotes: QuoteDoc[], days: number) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return quotes.filter((quote) => {
        const created = new Date(quote.createdAt);
        return !Number.isNaN(created.getTime()) && created >= cutoff;
    });
};

const getStreak = (quotes: QuoteDoc[], maxDays = 30) => {
    const byDate = new Set<string>();
    for (const quote of quotes) {
        if (quote.createdAt) {
            byDate.add(quote.createdAt.slice(0, 10));
        }
    }
    let streak = 0;
    const current = new Date();
    for (let i = 0; i < maxDays; i += 1) {
        const day = new Date(current);
        day.setDate(current.getDate() - i);
        const key = day.toISOString().slice(0, 10);
        if (byDate.has(key)) {
            streak += 1;
        } else {
            break;
        }
    }
    return streak;
};

const getMemoryLaneQuote = (quotes: QuoteDoc[]) => {
    if (quotes.length === 0) {
        return null;
    }
    const today = new Date();
    const targetMonth = today.getMonth();
    const targetDay = today.getDate();
    const matches = quotes.filter((quote) => {
        const created = new Date(quote.createdAt);
        return created.getMonth() === targetMonth && created.getDate() === targetDay;
    });
    if (matches.length > 0) {
        return matches[0];
    }
    return quotes[quotes.length - 1];
};

const getTopContributors = (quotes: QuoteDoc[]) => {
    const counts = new Map<string, number>();
    for (const quote of quotes) {
        counts.set(quote.createdByName, (counts.get(quote.createdByName) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
};

const getMostQuoted = (quotes: QuoteDoc[]) => {
    const counts = new Map<string, number>();
    for (const quote of quotes) {
        counts.set(quote.personId, (counts.get(quote.personId) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
};

const getNewestPeople = (people: PersonDoc[]) =>
    [...people]
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
        .slice(0, 5);

const getTrendingQuotes = (quotes: QuoteDoc[]) =>
    [...quotes]
        .sort((a, b) => b.text.split(/\\s+/).length - a.text.split(/\\s+/).length)
        .slice(0, 3);

const getInsideJokes = (quotes: QuoteDoc[]) => {
    const keywords = ["inside", "joke", "lol", "lmao", "rofl", "jk"];
    return quotes.filter((quote) =>
        keywords.some((keyword) => quote.text.toLowerCase().includes(keyword))
    );
};

const getQuoteCard = (
    quote: QuoteDoc,
    peopleMap: Map<string, PersonDoc>,
    markViewed?: (quoteId: string) => void
) => (
    <QuoteCard
        text={quote.text}
        author={resolveName(peopleMap, quote.personId)}
        addedBy={quote.createdByName}
        onSelect={() => markViewed?.(quote.$id)}
    />
);

const QuoteOfTheDayModule = (props: ViewModuleProps) => (
    <Card>
        <CardContent>
            <Stack spacing={1.5}>
                <Typography variant="overline" color="text.secondary">
                    Quote of the day
                </Typography>
                {props.quoteOfTheDay ? (
                    <Stack spacing={1}>
                        <Typography variant="h6">"{props.quoteOfTheDay.text}"</Typography>
                        <Typography variant="body2" color="text.secondary">
                            - {resolveName(props.peopleMap, props.quoteOfTheDay.personId)}
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
);

const QuoteOfTheWeekModule = (props: ViewModuleProps) => (
    <Card>
        <CardContent>
            <Stack spacing={1.5}>
                <Typography variant="overline" color="text.secondary">
                    Quote of the week
                </Typography>
                {props.quoteOfTheWeek ? (
                    <Stack spacing={1}>
                        <Typography variant="h6">"{props.quoteOfTheWeek.text}"</Typography>
                        <Typography variant="body2" color="text.secondary">
                            - {resolveName(props.peopleMap, props.quoteOfTheWeek.personId)}
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
);

const QuoteOfTheHourModule = (props: ViewModuleProps) => (
    <Card>
        <CardContent>
            <Stack spacing={1.5}>
                <Typography variant="overline" color="text.secondary">
                    Quote of the hour
                </Typography>
                {props.quoteOfTheHour ? (
                    <Stack spacing={1}>
                        <Typography variant="h6">"{props.quoteOfTheHour.text}"</Typography>
                        <Typography variant="body2" color="text.secondary">
                            - {resolveName(props.peopleMap, props.quoteOfTheHour.personId)}
                        </Typography>
                    </Stack>
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        Add the first quote to start the hourly rotation.
                    </Typography>
                )}
            </Stack>
        </CardContent>
    </Card>
);

const SpacerModule = (_props: ViewModuleProps) => (
    <Card variant="outlined" sx={{ borderStyle: "dashed", borderColor: "divider", height: "100%" }}>
        <CardContent>
            <Stack spacing={1}>
                <Typography variant="overline" color="text.secondary">
                    Spacer
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Adds breathing room between sections.
                </Typography>
            </Stack>
        </CardContent>
    </Card>
);

const SeparatorModule = (_props: ViewModuleProps) => (
    <Card variant="outlined" sx={{ borderStyle: "dashed", borderColor: "divider" }}>
        <CardContent>
            <Stack spacing={1}>
                <Typography variant="overline" color="text.secondary">
                    Separator
                </Typography>
                <Divider />
                <Typography variant="body2" color="text.secondary">
                    Use this to break the layout into sections.
                </Typography>
            </Stack>
        </CardContent>
    </Card>
);

const ContainerModule = (_props: ViewModuleProps) => (
    <Card
        variant="outlined"
        sx={{
            borderStyle: "dashed",
            borderColor: "divider",
            height: "100%",
            backgroundColor: "transparent"
        }}
    >
        <CardContent>
            <Stack spacing={1}>
                <Typography variant="overline" color="text.secondary">
                    Container
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Reserve space for a future grouped section.
                </Typography>
            </Stack>
        </CardContent>
    </Card>
);

const SpotlightModule = (props: ViewModuleProps) => {
    const [spotlightId, setSpotlightId] = useState("");

    useEffect(() => {
        if (!props.quotes.length) {
            setSpotlightId("");
            return;
        }
        if (!props.quotes.some((quote) => quote.$id === spotlightId)) {
            setSpotlightId(props.quotes[0].$id);
        }
    }, [props.quotes, spotlightId]);

    const spotlightQuote = useMemo(
        () => props.quotes.find((quote) => quote.$id === spotlightId) ?? null,
        [props.quotes, spotlightId]
    );

    useEffect(() => {
        if (spotlightQuote) {
            props.markViewed(spotlightQuote.$id);
        }
    }, [spotlightQuote, props.markViewed]);

    const rotateSpotlight = () => {
        if (!props.quotes.length) return;
        const next = props.quotes[Math.floor(Math.random() * props.quotes.length)];
        setSpotlightId(next.$id);
    };

    return (
        <Card>
            <CardContent>
                <Stack spacing={1.5}>
                    <Typography variant="overline" color="text.secondary">
                        Spotlight
                    </Typography>
                    {spotlightQuote ? (
                        <Stack spacing={1}>
                            <Typography variant="h6">"{spotlightQuote.text}"</Typography>
                            <Typography variant="body2" color="text.secondary">
                                - {resolveName(props.peopleMap, spotlightQuote.personId)}
                            </Typography>
                        </Stack>
                    ) : (
                        <Typography variant="body2" color="text.secondary">
                            Add a quote to start the spotlight.
                        </Typography>
                    )}
                    <Button variant="outlined" onClick={rotateSpotlight} disabled={!props.quotes.length}>
                        New spotlight
                    </Button>
                </Stack>
            </CardContent>
        </Card>
    );
};

const StoryModule = (props: ViewModuleProps) => {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        setIndex(0);
    }, [props.quotes.length]);

    const activeQuote = props.quotes[index];

    useEffect(() => {
        if (activeQuote) {
            props.markViewed(activeQuote.$id);
        }
    }, [activeQuote, props.markViewed]);

    const handlePrev = () => {
        if (!props.quotes.length) return;
        setIndex((prev) => (prev - 1 + props.quotes.length) % props.quotes.length);
    };

    const handleNext = () => {
        if (!props.quotes.length) return;
        setIndex((prev) => (prev + 1) % props.quotes.length);
    };

    const handleShuffle = () => {
        if (!props.quotes.length) return;
        const next = Math.floor(Math.random() * props.quotes.length);
        setIndex(next);
    };

    return (
        <Card>
            <CardContent>
                <Stack spacing={1.5}>
                    <Typography variant="overline" color="text.secondary">
                        Story
                    </Typography>
                    {activeQuote ? (
                        <Stack spacing={1}>
                            <Typography variant="h6">"{activeQuote.text}"</Typography>
                            <Typography variant="body2" color="text.secondary">
                                - {resolveName(props.peopleMap, activeQuote.personId)}
                            </Typography>
                        </Stack>
                    ) : (
                        <Typography variant="body2" color="text.secondary">
                            Add quotes to start the story.
                        </Typography>
                    )}
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                        <Button variant="outlined" onClick={handlePrev} disabled={!props.quotes.length}>
                            Previous
                        </Button>
                        <Button variant="outlined" onClick={handleShuffle} disabled={!props.quotes.length}>
                            Shuffle
                        </Button>
                        <Button variant="contained" onClick={handleNext} disabled={!props.quotes.length}>
                            Next
                        </Button>
                    </Stack>
                </Stack>
            </CardContent>
        </Card>
    );
};

const PlaylistModule = (props: ViewModuleProps) => {
    const playlist = useMemo(() => props.quotes.slice(0, 8), [props.quotes]);
    const [index, setIndex] = useState(0);
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        setIndex(0);
    }, [playlist.length]);

    useEffect(() => {
        if (!playing || playlist.length === 0) return;
        const id = window.setInterval(() => {
            setIndex((prev) => (prev + 1) % playlist.length);
        }, 5000);
        return () => window.clearInterval(id);
    }, [playing, playlist.length]);

    const activeQuote = playlist[index];

    useEffect(() => {
        if (activeQuote) {
            props.markViewed(activeQuote.$id);
        }
    }, [activeQuote, props.markViewed]);

    return (
        <Card>
            <CardContent>
                <Stack spacing={1.5}>
                    <Typography variant="overline" color="text.secondary">
                        Playlist
                    </Typography>
                    {activeQuote ? (
                        <Stack spacing={1}>
                            <Typography variant="h6">"{activeQuote.text}"</Typography>
                            <Typography variant="body2" color="text.secondary">
                                - {resolveName(props.peopleMap, activeQuote.personId)}
                            </Typography>
                        </Stack>
                    ) : (
                        <Typography variant="body2" color="text.secondary">
                            Add quotes to build a playlist.
                        </Typography>
                    )}
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                        <Button
                            variant="outlined"
                            onClick={() =>
                                setIndex((prev) =>
                                    playlist.length ? (prev - 1 + playlist.length) % playlist.length : 0
                                )
                            }
                            disabled={playlist.length === 0}
                        >
                            Previous
                        </Button>
                        <Button
                            variant={playing ? "outlined" : "contained"}
                            onClick={() => setPlaying((prev) => !prev)}
                            disabled={playlist.length === 0}
                        >
                            {playing ? "Pause" : "Play"}
                        </Button>
                        <Button
                            variant="outlined"
                            onClick={() =>
                                setIndex((prev) =>
                                    playlist.length ? (prev + 1) % playlist.length : 0
                                )
                            }
                            disabled={playlist.length === 0}
                        >
                            Next
                        </Button>
                    </Stack>
                </Stack>
            </CardContent>
        </Card>
    );
};

const YearbookModule = (props: ViewModuleProps) => {
    const yearMap = useMemo(() => {
        const map = new Map<string, QuoteDoc[]>();
        for (const quote of props.quotes) {
            const date = new Date(quote.createdAt);
            const year = Number.isNaN(date.getTime()) ? "Unknown" : String(date.getFullYear());
            const list = map.get(year) ?? [];
            list.push(quote);
            map.set(year, list);
        }
        return map;
    }, [props.quotes]);

    const years = useMemo(
        () => Array.from(yearMap.keys()).sort((a, b) => b.localeCompare(a)),
        [yearMap]
    );
    const [yearIndex, setYearIndex] = useState(0);

    useEffect(() => {
        setYearIndex(0);
    }, [years.length]);

    const activeYear = years[yearIndex];
    const yearQuotes = activeYear ? yearMap.get(activeYear) ?? [] : [];
    const highlight = yearQuotes[0] ?? null;

    useEffect(() => {
        if (highlight) {
            props.markViewed(highlight.$id);
        }
    }, [highlight, props.markViewed]);

    return (
        <Card>
            <CardContent>
                <Stack spacing={1.5}>
                    <Typography variant="overline" color="text.secondary">
                        Yearbook
                    </Typography>
                    {activeYear ? (
                        <Stack spacing={1}>
                            <Typography variant="h6">{activeYear}</Typography>
                            <Typography variant="body2" color="text.secondary">
                                {yearQuotes.length} quotes captured
                            </Typography>
                        </Stack>
                    ) : (
                        <Typography variant="body2" color="text.secondary">
                            No quotes yet.
                        </Typography>
                    )}
                    {highlight && (
                        <Typography variant="body2" color="text.secondary">
                            "{highlight.text}"
                        </Typography>
                    )}
                    <Button
                        variant="outlined"
                        onClick={() =>
                            setYearIndex((prev) => (years.length ? (prev + 1) % years.length : 0))
                        }
                        disabled={years.length === 0}
                    >
                        Next year
                    </Button>
                </Stack>
            </CardContent>
        </Card>
    );
};

const BattleModule = (props: ViewModuleProps) => {
    const counts = useMemo(() => {
        const map = new Map<string, number>();
        for (const quote of props.quotes) {
            map.set(quote.personId, (map.get(quote.personId) || 0) + 1);
        }
        return map;
    }, [props.quotes]);

    const eligible = useMemo(
        () => props.people.filter((person) => (counts.get(person.$id) || 0) > 0),
        [counts, props.people]
    );
    const [pair, setPair] = useState<[string, string] | null>(null);

    const pickPair = () => {
        if (eligible.length < 2) {
            setPair(null);
            return;
        }
        const firstIndex = Math.floor(Math.random() * eligible.length);
        let secondIndex = Math.floor(Math.random() * eligible.length);
        while (secondIndex === firstIndex && eligible.length > 1) {
            secondIndex = Math.floor(Math.random() * eligible.length);
        }
        setPair([eligible[firstIndex].$id, eligible[secondIndex].$id]);
    };

    useEffect(() => {
        pickPair();
    }, [eligible]);

    const firstId = pair?.[0] ?? "";
    const secondId = pair?.[1] ?? "";
    const firstCount = counts.get(firstId) || 0;
    const secondCount = counts.get(secondId) || 0;

    return (
        <Card>
            <CardContent>
                <Stack spacing={1.5}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="overline" color="text.secondary">
                            Battle
                        </Typography>
                        <Button variant="text" onClick={pickPair} disabled={eligible.length < 2}>
                            Rematch
                        </Button>
                    </Stack>
                    {eligible.length < 2 ? (
                        <Typography variant="body2" color="text.secondary">
                            Add at least two people with quotes to start a battle.
                        </Typography>
                    ) : !pair ? (
                        <Typography variant="body2" color="text.secondary">
                            Setting up the matchup...
                        </Typography>
                    ) : (
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                            {[firstId, secondId].map((personId) => (
                                <Box key={personId} flex={1}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                        {resolveName(props.peopleMap, personId)}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {counts.get(personId) || 0} quotes
                                    </Typography>
                                </Box>
                            ))}
                            <Box flex={1}>
                                <Typography variant="body2" color="text.secondary">
                                    {firstCount === secondCount
                                        ? "Currently tied"
                                        : firstCount > secondCount
                                        ? `${resolveName(props.peopleMap, firstId)} is ahead`
                                        : `${resolveName(props.peopleMap, secondId)} is ahead`}
                                </Typography>
                            </Box>
                        </Stack>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
};

const RandomizerModule = (props: ViewModuleProps) => {
    const [quote, setQuote] = useState<QuoteDoc | null>(props.quotes[0] ?? null);

    useEffect(() => {
        setQuote(props.quotes[0] ?? null);
    }, [props.quotes]);

    const shuffle = () => {
        if (props.quotes.length === 0) return;
        const random = props.quotes[Math.floor(Math.random() * props.quotes.length)];
        setQuote(random);
    };

    return (
        <Card>
            <CardContent>
                <Stack spacing={1.5}>
                    <Typography variant="overline" color="text.secondary">
                        Randomizer
                    </Typography>
                    {quote ? (
                        <Typography variant="h6">"{quote.text}"</Typography>
                    ) : (
                        <Typography variant="body2" color="text.secondary">
                            Add a quote to start.
                        </Typography>
                    )}
                    <Button
                        variant="outlined"
                        startIcon={<ShuffleIcon />}
                        onClick={shuffle}
                        disabled={props.quotes.length === 0}
                    >
                        Roll a quote
                    </Button>
                </Stack>
            </CardContent>
        </Card>
    );
};

const TopTopicsModule = (props: ViewModuleProps) => {
    const topics = getTopWords(props.quotes);
    return (
        <Card>
            <CardContent>
                <Stack spacing={1.5}>
                    <Typography variant="overline" color="text.secondary">
                        Top topics
                    </Typography>
                    {topics.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            Add more quotes to surface topics.
                        </Typography>
                    ) : (
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                            {topics.map(([word, count]) => (
                                <Chip key={word} label={`${word} (${count})`} />
                            ))}
                        </Box>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
};

const ThisWeekNewModule = (props: ViewModuleProps) => {
    const recent = getQuotesLastDays(props.quotes, 7);
    return (
        <Card>
            <CardContent>
                <Stack spacing={1}>
                    <Typography variant="overline" color="text.secondary">
                        This week
                    </Typography>
                    <Typography variant="h5">{recent.length}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        New quotes in the last 7 days.
                    </Typography>
                </Stack>
            </CardContent>
        </Card>
    );
};

const HotStreakModule = (props: ViewModuleProps) => {
    const streak = getStreak(props.quotes);
    return (
        <Card>
            <CardContent>
                <Stack spacing={1}>
                    <Typography variant="overline" color="text.secondary">
                        Hot streak
                    </Typography>
                    <Typography variant="h5">{streak} day{streak === 1 ? "" : "s"}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Consecutive days with a new quote.
                    </Typography>
                </Stack>
            </CardContent>
        </Card>
    );
};

const MemoryLaneModule = (props: ViewModuleProps) => {
    const quote = getMemoryLaneQuote(props.quotes);
    return (
        <Card>
            <CardContent>
                <Stack spacing={1.5}>
                    <Typography variant="overline" color="text.secondary">
                        Memory lane
                    </Typography>
                    {quote ? (
                        <>
                            <Typography variant="h6">"{quote.text}"</Typography>
                            <Typography variant="body2" color="text.secondary">
                                - {resolveName(props.peopleMap, quote.personId)}
                            </Typography>
                        </>
                    ) : (
                        <Typography variant="body2" color="text.secondary">
                            Add quotes to unlock this memory.
                        </Typography>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
};

const MostQuotedModule = (props: ViewModuleProps) => {
    const top = getMostQuoted(props.quotes);
    return (
        <Card>
            <CardContent>
                <Stack spacing={1.5}>
                    <Typography variant="overline" color="text.secondary">
                        Most quoted
                    </Typography>
                    {top.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            No quotes yet.
                        </Typography>
                    ) : (
                        <Stack spacing={1}>
                            {top.map(([personId, count]) => (
                                <Stack key={personId} direction="row" justifyContent="space-between">
                                    <Typography variant="body2">
                                        {resolveName(props.peopleMap, personId)}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {count}
                                    </Typography>
                                </Stack>
                            ))}
                        </Stack>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
};

const TopContributorsModule = (props: ViewModuleProps) => {
    const contributors = getTopContributors(props.quotes);
    return (
        <Card>
            <CardContent>
                <Stack spacing={1.5}>
                    <Typography variant="overline" color="text.secondary">
                        Top contributors
                    </Typography>
                    {contributors.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            No quotes yet.
                        </Typography>
                    ) : (
                        <Stack spacing={1}>
                            {contributors.map(([name, count]) => (
                                <Stack key={name} direction="row" justifyContent="space-between">
                                    <Typography variant="body2">{name}</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {count}
                                    </Typography>
                                </Stack>
                            ))}
                        </Stack>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
};

const NewestPeopleModule = (props: ViewModuleProps) => {
    const newest = getNewestPeople(props.people);
    return (
        <Card>
            <CardContent>
                <Stack spacing={1.5}>
                    <Typography variant="overline" color="text.secondary">
                        Newest people
                    </Typography>
                    {newest.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            Add a person to start.
                        </Typography>
                    ) : (
                        <Stack spacing={1}>
                            {newest.map((person) => (
                                <Stack key={person.$id} direction="row" justifyContent="space-between">
                                    <Typography variant="body2">{person.name}</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {person.isPlaceholder ? "Placeholder" : "Member"}
                                    </Typography>
                                </Stack>
                            ))}
                        </Stack>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
};

const TrendingQuotesModule = (props: ViewModuleProps) => {
    const trending = getTrendingQuotes(props.quotes);
    return (
        <Card>
            <CardContent>
                <Stack spacing={1.5}>
                    <Typography variant="overline" color="text.secondary">
                        Trending quotes
                    </Typography>
                    {trending.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            Add quotes to see trends.
                        </Typography>
                    ) : (
                        <Stack spacing={1.5}>
                            {trending.map((quote) => (
                                <Box key={quote.$id}>
                                    {getQuoteCard(quote, props.peopleMap, props.markViewed)}
                                </Box>
                            ))}
                        </Stack>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
};

const InsideJokeModule = (props: ViewModuleProps) => {
    const jokes = getInsideJokes(props.quotes);
    return (
        <Card>
            <CardContent>
                <Stack spacing={1.5}>
                    <Typography variant="overline" color="text.secondary">
                        Inside joke tracker
                    </Typography>
                    {jokes.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            No inside jokes detected yet.
                        </Typography>
                    ) : (
                        <Stack spacing={1}>
                            <Typography variant="h6">{jokes.length} quotes</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Latest: "{jokes[0].text}"
                            </Typography>
                        </Stack>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
};

const FavoritesModule = (props: ViewModuleProps) => {
    const favoriteQuotes = props.favorites
        .map((id) => props.quotes.find((quote) => quote.$id === id))
        .filter(Boolean) as QuoteDoc[];
    return (
        <Card>
            <CardContent>
                <Stack spacing={1.5}>
                    <Typography variant="overline" color="text.secondary">
                        Favorites
                    </Typography>
                    {favoriteQuotes.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            Star quotes to save them here.
                        </Typography>
                    ) : (
                        <Stack spacing={1.5}>
                            {favoriteQuotes.slice(0, 3).map((quote) => (
                                <QuoteCard
                                    key={quote.$id}
                                    text={quote.text}
                                    author={resolveName(props.peopleMap, quote.personId)}
                                    addedBy={quote.createdByName}
                                    onSelect={() => props.markViewed(quote.$id)}
                                    actions={
                                        <IconButton
                                            aria-label="Remove favorite"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                props.toggleFavorite(quote.$id);
                                            }}
                                        >
                                            <StarIcon />
                                        </IconButton>
                                    }
                                />
                            ))}
                        </Stack>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
};

const RecentlyViewedModule = (props: ViewModuleProps) => {
    const recent = props.recentlyViewed
        .map((id) => props.quotes.find((quote) => quote.$id === id))
        .filter(Boolean) as QuoteDoc[];
    const fallback = props.quotes.slice(0, 3);
    const list = recent.length > 0 ? recent : fallback;
    return (
        <Card>
            <CardContent>
                <Stack spacing={1.5}>
                    <Typography variant="overline" color="text.secondary">
                        Recently viewed
                    </Typography>
                    {list.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            No quotes yet.
                        </Typography>
                    ) : (
                        <Stack spacing={1.5}>
                            {list.slice(0, 3).map((quote) => (
                                <QuoteCard
                                    key={quote.$id}
                                    text={quote.text}
                                    author={resolveName(props.peopleMap, quote.personId)}
                                    addedBy={quote.createdByName}
                                    onSelect={() => props.markViewed(quote.$id)}
                                />
                            ))}
                        </Stack>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
};

const StatsSummaryModule = (props: ViewModuleProps) => (
    <Card>
        <CardContent>
            <Stack spacing={1.5}>
                <Typography variant="overline" color="text.secondary">
                    Group snapshot
                </Typography>
                <Stack direction="row" spacing={2}>
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            Quotes
                        </Typography>
                        <Typography variant="h6">{props.stats.totalQuotes}</Typography>
                    </Box>
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            People
                        </Typography>
                        <Typography variant="h6">{props.stats.totalPeople}</Typography>
                    </Box>
                </Stack>
                <Divider />
                <Stack spacing={1}>
                    <Typography variant="body2" color="text.secondary">
                        Top quoter: {props.stats.topQuoter?.name || "-"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Most quoted: {props.stats.topQuoted?.name || "-"}
                    </Typography>
                </Stack>
            </Stack>
        </CardContent>
    </Card>
);

const ContextTagsModule = (props: ViewModuleProps) => {
    const topics = getTopWords(props.quotes);
    return (
        <Card>
            <CardContent>
                <Stack spacing={1.5}>
                    <Typography variant="overline" color="text.secondary">
                        Context tags
                    </Typography>
                    {topics.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            Add quotes to surface context tags.
                        </Typography>
                    ) : (
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                            {topics.map(([word, count]) => (
                                <Chip key={word} label={`${word} (${count})`} />
                            ))}
                        </Box>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
};

const QuoteOfTheHourModuleDef: ViewModuleDefinition = {
    key: "hourly",
    label: "Quote of the hour",
    description: "Rotates every hour for freshness.",
    render: QuoteOfTheHourModule
};

export const viewModules: ViewModuleDefinition[] = [
    {
        key: "spacer",
        label: "Spacer",
        description: "Adjustable empty space to shape the layout.",
        render: SpacerModule
    },
    {
        key: "separator",
        label: "Separator",
        description: "A visual break between sections.",
        render: SeparatorModule
    },
    {
        key: "container",
        label: "Container",
        description: "Reserve room for a grouped section.",
        render: ContainerModule
    },
    {
        key: "daily",
        label: "Quote of the day",
        description: "Daily featured quote for a quick highlight.",
        render: QuoteOfTheDayModule
    },
    {
        key: "weekly",
        label: "Quote of the week",
        description: "Weekly feature to keep the spotlight fresh.",
        render: QuoteOfTheWeekModule
    },
    QuoteOfTheHourModuleDef,
    {
        key: "spotlight",
        label: "Spotlight",
        description: "Feature one quote with a rotating highlight.",
        render: SpotlightModule
    },
    {
        key: "story",
        label: "Story",
        description: "Step through quotes one at a time.",
        render: StoryModule
    },
    {
        key: "playlist",
        label: "Playlist",
        description: "Autoplay a short set of quotes.",
        render: PlaylistModule
    },
    {
        key: "yearbook",
        label: "Yearbook",
        description: "Jump through yearly highlights.",
        render: YearbookModule
    },
    {
        key: "battle",
        label: "Battle",
        description: "Head-to-head matchup between two people.",
        render: BattleModule
    },
    {
        key: "randomizer",
        label: "Randomizer",
        description: "Roll a random quote on demand.",
        render: RandomizerModule
    },
    {
        key: "topTopics",
        label: "Top topics",
        description: "Common keywords across the group.",
        render: TopTopicsModule
    },
    {
        key: "thisWeek",
        label: "This week's new",
        description: "How many quotes were added in the last 7 days.",
        render: ThisWeekNewModule
    },
    {
        key: "streak",
        label: "Hot streak",
        description: "Consecutive days with new quotes.",
        render: HotStreakModule
    },
    {
        key: "memoryLane",
        label: "Memory lane",
        description: "A quote from this date in past years.",
        render: MemoryLaneModule
    },
    {
        key: "mostQuoted",
        label: "Most quoted",
        description: "Top people with the most quotes.",
        render: MostQuotedModule
    },
    {
        key: "topContributors",
        label: "Top contributors",
        description: "Leaderboard of quote adders.",
        render: TopContributorsModule
    },
    {
        key: "newestPeople",
        label: "Newest people",
        description: "Recently added members or placeholders.",
        render: NewestPeopleModule
    },
    {
        key: "trending",
        label: "Trending quotes",
        description: "Longer quotes with extra flavor.",
        render: TrendingQuotesModule
    },
    {
        key: "insideJokes",
        label: "Inside joke tracker",
        description: "Quotes with inside-joke keywords.",
        render: InsideJokeModule
    },
    {
        key: "favorites",
        label: "Favorites",
        description: "Starred quotes for quick access.",
        render: FavoritesModule
    },
    {
        key: "recentlyViewed",
        label: "Recently viewed",
        description: "Recently opened quotes.",
        render: RecentlyViewedModule
    },
    {
        key: "stats",
        label: "Group snapshot",
        description: "Quick stats at a glance.",
        render: StatsSummaryModule
    },
    {
        key: "contextTags",
        label: "Context tags",
        description: "Keyword tags derived from quotes.",
        render: ContextTagsModule
    }
];

export const defaultModuleOrder = [
    "daily",
    "weekly",
    "spotlight",
    "randomizer",
    "stats",
    "topContributors",
    "mostQuoted",
    "favorites",
    "recentlyViewed",
    "topTopics"
];
