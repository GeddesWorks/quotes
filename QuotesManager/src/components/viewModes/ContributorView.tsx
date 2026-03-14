import { Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { useMemo } from "react";
import QuoteCard from "../QuoteCard";
import type { QuoteDoc } from "../../util/appwriteTypes";
import type { ViewModeProps } from "./types";

interface ContributorSummary {
    id: string;
    name: string;
    count: number;
    latestQuote: QuoteDoc | null;
}

const ContributorView: React.FC<ViewModeProps> = ({
    quotes,
    peopleMap,
    search,
    onSearchChange,
    onQuoteSelect
}) => {
    const contributors = useMemo(() => {
        const map = new Map<string, ContributorSummary>();
        for (const quote of quotes) {
            const existing = map.get(quote.createdBy) ?? {
                id: quote.createdBy,
                name: quote.createdByName,
                count: 0,
                latestQuote: null
            };
            existing.count += 1;
            if (!existing.latestQuote || (quote.createdAt || "") > (existing.latestQuote.createdAt || "")) {
                existing.latestQuote = quote;
            }
            map.set(quote.createdBy, existing);
        }
        return Array.from(map.values()).sort((a, b) => b.count - a.count);
    }, [quotes]);

    const filtered = useMemo(() => {
        if (!search.trim()) {
            return contributors;
        }
        const query = search.trim().toLowerCase();
        return contributors.filter((contributor) => contributor.name.toLowerCase().includes(query));
    }, [contributors, search]);

    return (
        <Stack spacing={2}>
            <Card>
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6">Contributor board</Typography>
                        <TextField
                            label="Search contributors"
                            value={search}
                            onChange={(event) => onSearchChange(event.target.value)}
                        />
                        <Typography variant="body2" color="text.secondary">
                            {filtered.length} contributors have added quotes.
                        </Typography>
                    </Stack>
                </CardContent>
            </Card>
            {filtered.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    No contributors match your search yet.
                </Typography>
            ) : (
                <Stack spacing={2}>
                    {filtered.map((contributor) => {
                        const latestQuote = contributor.latestQuote;
                        return (
                            <Card key={contributor.id}>
                                <CardContent>
                                    <Stack spacing={1.5}>
                                        <Stack spacing={0.5}>
                                            <Typography variant="overline" color="text.secondary">
                                                {contributor.count} quotes added
                                            </Typography>
                                            <Typography variant="h6">{contributor.name}</Typography>
                                        </Stack>
                                        {latestQuote ? (
                                            <QuoteCard
                                                text={latestQuote.text}
                                                author={
                                                    peopleMap.get(latestQuote.personId)?.name || "Unknown"
                                                }
                                                addedBy={latestQuote.createdByName}
                                                onSelect={() => onQuoteSelect?.(latestQuote.$id)}
                                            />
                                        ) : (
                                            <Typography variant="body2" color="text.secondary">
                                                No quotes yet.
                                            </Typography>
                                        )}
                                    </Stack>
                                </CardContent>
                            </Card>
                        );
                    })}
                </Stack>
            )}
        </Stack>
    );
};

export default ContributorView;
