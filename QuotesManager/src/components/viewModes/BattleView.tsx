import { Box, Button, Card, CardContent, Grid, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import QuoteCard from "../QuoteCard";
import type { QuoteDoc } from "../../util/appwriteTypes";
import type { ViewModeProps } from "./types";

const buildQuoteMap = (quotes: QuoteDoc[]) => {
    const map = new Map<string, QuoteDoc[]>();
    for (const quote of quotes) {
        const list = map.get(quote.personId) ?? [];
        list.push(quote);
        map.set(quote.personId, list);
    }
    return map;
};

const BattleView: React.FC<ViewModeProps> = ({ quotes, people, peopleMap, onQuoteSelect }) => {
    const quoteMap = useMemo(() => buildQuoteMap(quotes), [quotes]);
    const eligible = useMemo(
        () => people.filter((person) => (quoteMap.get(person.$id)?.length ?? 0) > 0),
        [people, quoteMap]
    );
    const [pair, setPair] = useState<[string, string] | null>(null);

    const pickPair = () => {
        if (eligible.length < 2) {
            setPair(null);
            return;
        }
        const firstIndex = Math.floor(Math.random() * eligible.length);
        let secondIndex = Math.floor(Math.random() * eligible.length);
        if (eligible.length > 1) {
            while (secondIndex === firstIndex) {
                secondIndex = Math.floor(Math.random() * eligible.length);
            }
        }
        setPair([eligible[firstIndex].$id, eligible[secondIndex].$id]);
    };

    useEffect(() => {
        pickPair();
    }, [eligible]);

    const firstId = pair?.[0] ?? "";
    const secondId = pair?.[1] ?? "";
    return (
        <Stack spacing={2}>
            <Card>
                <CardContent>
                    <Stack spacing={1.5} direction={{ xs: "column", sm: "row" }} justifyContent="space-between">
                        <Box>
                            <Typography variant="h6">Battle mode</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Head-to-head matchup based on who has the most quotes.
                            </Typography>
                        </Box>
                        <Button variant="outlined" onClick={pickPair} disabled={eligible.length < 2}>
                            New battle
                        </Button>
                    </Stack>
                </CardContent>
            </Card>

            {eligible.length < 2 ? (
                <Typography variant="body2" color="text.secondary">
                    Add at least two people with quotes to start a battle.
                </Typography>
            ) : !pair ? (
                <Typography variant="body2" color="text.secondary">
                    Setting up the next matchup...
                </Typography>
            ) : (
                <Grid container spacing={2}>
                    {[firstId, secondId].map((personId) => {
                        const person = peopleMap.get(personId);
                        const personQuotes = quoteMap.get(personId) ?? [];
                        return (
                            <Grid item xs={12} md={6} key={personId}>
                                <Card>
                                    <CardContent>
                                        <Stack spacing={2}>
                                            <Stack spacing={0.5}>
                                                <Typography variant="overline" color="text.secondary">
                                                    Challenger
                                                </Typography>
                                                <Typography variant="h6">{person?.name || "Unknown"}</Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {personQuotes.length} quotes
                                                </Typography>
                                            </Stack>
                                            <Stack spacing={1.5}>
                                                {personQuotes.slice(0, 2).map((quote) => (
                                                    <QuoteCard
                                                        key={quote.$id}
                                                        text={quote.text}
                                                        author={person?.name || "Unknown"}
                                                        addedBy={quote.createdByName}
                                                        onSelect={() => onQuoteSelect?.(quote.$id)}
                                                    />
                                                ))}
                                                {personQuotes.length === 0 && (
                                                    <Typography variant="body2" color="text.secondary">
                                                        No quotes yet.
                                                    </Typography>
                                                )}
                                            </Stack>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            </Grid>
                        );
                    })}
                </Grid>
            )}
        </Stack>
    );
};

export default BattleView;
