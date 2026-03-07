import { Card, CardContent, Chip, Grid, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import QuoteCard from "../QuoteCard";
import type { QuoteDoc } from "../../util/appwriteTypes";
import type { ViewModeProps } from "./types";

const getYearKey = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "Unknown";
    }
    return String(date.getFullYear());
};

const sortYearEntries = (entries: Array<[string, QuoteDoc[]]>) =>
    [...entries].sort((a, b) => {
        if (a[0] === "Unknown") return 1;
        if (b[0] === "Unknown") return -1;
        return b[0].localeCompare(a[0]);
    });

const YearbookView: React.FC<ViewModeProps> = ({
    filteredQuotes,
    peopleMap,
    search,
    onSearchChange,
    onQuoteSelect
}) => {
    const [activeYear, setActiveYear] = useState("all");

    useEffect(() => {
        setActiveYear("all");
    }, [filteredQuotes.length, search]);

    const grouped = useMemo(() => {
        const map = new Map<string, QuoteDoc[]>();
        for (const quote of filteredQuotes) {
            const year = getYearKey(quote.createdAt || "");
            const list = map.get(year) ?? [];
            list.push(quote);
            map.set(year, list);
        }
        return map;
    }, [filteredQuotes]);

    const yearEntries = useMemo(() => sortYearEntries(Array.from(grouped.entries())), [grouped]);
    const visibleEntries = activeYear === "all"
        ? yearEntries
        : yearEntries.filter(([year]) => year === activeYear);

    return (
        <Stack spacing={2}>
            <Card>
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6">Yearbook</Typography>
                        <TextField
                            label="Search quotes or people"
                            value={search}
                            onChange={(event) => onSearchChange(event.target.value)}
                        />
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                            <Chip
                                label="All years"
                                color={activeYear === "all" ? "primary" : "default"}
                                variant={activeYear === "all" ? "filled" : "outlined"}
                                onClick={() => setActiveYear("all")}
                            />
                            {yearEntries.map(([year]) => (
                                <Chip
                                    key={year}
                                    label={year === "Unknown" ? "Unknown" : year}
                                    color={activeYear === year ? "primary" : "default"}
                                    variant={activeYear === year ? "filled" : "outlined"}
                                    onClick={() => setActiveYear(year)}
                                />
                            ))}
                        </Stack>
                    </Stack>
                </CardContent>
            </Card>

            {visibleEntries.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    No quotes match your search yet.
                </Typography>
            ) : (
                <Stack spacing={3}>
                    {visibleEntries.map(([year, quotes]) => (
                        <Card key={year}>
                            <CardContent>
                                <Stack spacing={2}>
                                    <Stack
                                        direction={{ xs: "column", sm: "row" }}
                                        spacing={1}
                                        justifyContent="space-between"
                                        alignItems={{ xs: "flex-start", sm: "center" }}
                                    >
                                        <Typography variant="h6">
                                            {year === "Unknown" ? "Unknown year" : year}
                                        </Typography>
                                        <Chip label={`${quotes.length} quotes`} />
                                    </Stack>
                                    <Grid container spacing={2}>
                                        {quotes.slice(0, 3).map((quote) => (
                                            <Grid item xs={12} md={6} key={quote.$id}>
                                                <QuoteCard
                                                    text={quote.text}
                                                    author={peopleMap.get(quote.personId)?.name || "Unknown"}
                                                    addedBy={quote.createdByName}
                                                    onSelect={() => onQuoteSelect?.(quote.$id)}
                                                />
                                            </Grid>
                                        ))}
                                    </Grid>
                                </Stack>
                            </CardContent>
                        </Card>
                    ))}
                </Stack>
            )}
        </Stack>
    );
};

export default YearbookView;
