import { Card, CardContent, Chip, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import QuoteCard from "../QuoteCard";
import type { QuoteDoc } from "../../util/appwriteTypes";
import type { ViewModeProps } from "./types";

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

const getTopWords = (quotes: QuoteDoc[]) => {
    const counts = new Map<string, number>();
    for (const quote of quotes) {
        const words = quote.text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((word) => word.length >= 4 && !stopWords.has(word));
        for (const word of words) {
            counts.set(word, (counts.get(word) || 0) + 1);
        }
    }
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 16);
};

const ContextView: React.FC<ViewModeProps> = ({
    filteredQuotes,
    peopleMap,
    search,
    onSearchChange,
    onQuoteSelect
}) => {
    const tags = useMemo(() => getTopWords(filteredQuotes), [filteredQuotes]);
    const [activeTag, setActiveTag] = useState<string>("");

    useEffect(() => {
        if (activeTag && !tags.some(([tag]) => tag === activeTag)) {
            setActiveTag("");
        }
    }, [activeTag, tags]);

    const visibleQuotes = useMemo(() => {
        if (!activeTag) return filteredQuotes;
        return filteredQuotes.filter((quote) => quote.text.toLowerCase().includes(activeTag));
    }, [activeTag, filteredQuotes]);

    return (
        <Stack spacing={2}>
            <Card>
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6">Context explorer</Typography>
                        <TextField
                            label="Search quotes or people"
                            value={search}
                            onChange={(event) => onSearchChange(event.target.value)}
                        />
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                            <Chip
                                label="All tags"
                                color={activeTag === "" ? "primary" : "default"}
                                variant={activeTag === "" ? "filled" : "outlined"}
                                onClick={() => setActiveTag("")}
                            />
                            {tags.map(([tag]) => (
                                <Chip
                                    key={tag}
                                    label={tag}
                                    color={activeTag === tag ? "primary" : "default"}
                                    variant={activeTag === tag ? "filled" : "outlined"}
                                    onClick={() => setActiveTag(tag)}
                                />
                            ))}
                        </Stack>
                    </Stack>
                </CardContent>
            </Card>
            {visibleQuotes.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    No quotes match this tag yet.
                </Typography>
            ) : (
                <Stack spacing={2}>
                    {visibleQuotes.slice(0, 10).map((quote) => (
                        <QuoteCard
                            key={quote.$id}
                            text={quote.text}
                            author={peopleMap.get(quote.personId)?.name || "Unknown"}
                            addedBy={quote.createdByName}
                            onSelect={() => onQuoteSelect?.(quote.$id)}
                        />
                    ))}
                    {visibleQuotes.length > 10 && (
                        <Typography variant="body2" color="text.secondary">
                            Showing 10 of {visibleQuotes.length} quotes for this context.
                        </Typography>
                    )}
                </Stack>
            )}
        </Stack>
    );
};

export default ContextView;
