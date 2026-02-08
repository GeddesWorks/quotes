import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    Stack,
    TextField,
    Typography
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useGroups } from "../contexts/GroupContext";
import {
    claimPlaceholder,
    createPlaceholderPerson,
    createQuote,
    listGroupMembers,
    listPeople,
    listQuotes,
    unclaimPlaceholder
} from "../util/appwriteApi";
import type { MembershipDoc, PersonDoc, QuoteDoc } from "../util/appwriteTypes";
import QuoteCard from "./QuoteCard";
import LoadingState from "./LoadingState";

interface GroupViewProps {
    groupId: string;
    groupName: string;
    currentMembership: MembershipDoc;
}

const hashString = (value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) % 2147483647;
    }
    return hash;
};

const getWeekSeed = (date: Date) => {
    const year = date.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const days = Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    const week = Math.floor(days / 7) + 1;
    return `${year}-W${String(week).padStart(2, "0")}`;
};

const GroupView: React.FC<GroupViewProps> = ({ groupId, groupName, currentMembership }) => {
    const { user } = useAuth();
    const { refresh: refreshGroups } = useGroups();
    const [members, setMembers] = useState<MembershipDoc[]>([]);
    const [people, setPeople] = useState<PersonDoc[]>([]);
    const [quotes, setQuotes] = useState<QuoteDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const [search, setSearch] = useState("");
    const [addOpen, setAddOpen] = useState(false);
    const [claimOpen, setClaimOpen] = useState(false);
    const [selectedPersonId, setSelectedPersonId] = useState("");
    const [newPersonMode, setNewPersonMode] = useState<"invite" | "placeholder" | "">("");
    const [newPersonName, setNewPersonName] = useState("");
    const [quoteText, setQuoteText] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const loadAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [memberDocs, peopleDocs, quoteDocs] = await Promise.all([
                listGroupMembers(groupId),
                listPeople(groupId),
                listQuotes(groupId)
            ]);
            setMembers(memberDocs);
            setPeople(peopleDocs);
            setQuotes(quoteDocs);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load group data.");
        } finally {
            setLoading(false);
        }
    }, [groupId]);

    useEffect(() => {
        void loadAll();
    }, [loadAll]);

    const memberIds = useMemo(
        () => Array.from(new Set([...members.map((member) => member.userId), currentMembership.userId])),
        [members, currentMembership.userId]
    );
    const adminIds = useMemo(() => {
        const ids = members.filter((member) => member.role !== "member").map((member) => member.userId);
        if (currentMembership.role !== "member") {
            ids.push(currentMembership.userId);
        }
        return Array.from(new Set(ids));
    }, [members, currentMembership.role, currentMembership.userId]);

    const peopleMap = useMemo(() => new Map(people.map((person) => [person.$id, person])), [people]);
    const placeholderPeople = useMemo(
        () => people.filter((person) => person.isPlaceholder),
        [people]
    );
    const currentMember = useMemo(
        () => members.find((member) => member.userId === currentMembership.userId) ?? currentMembership,
        [members, currentMembership]
    );
    const hasClaimedPlaceholder = Boolean(currentMember.claimedPlaceholderId);
    const claimablePlaceholders = useMemo(() => {
        const joinedAt = Date.parse(currentMember.createdAt || "") || 0;
        return placeholderPeople.filter((person) => {
            const createdAt = Date.parse(person.createdAt || "") || 0;
            return createdAt < joinedAt;
        });
    }, [currentMember.createdAt, placeholderPeople]);

    const quoteOfTheDay = useMemo(() => {
        if (quotes.length === 0) {
            return null;
        }
        const seed = new Date().toISOString().slice(0, 10);
        const index = Math.abs(hashString(`${groupId}-${seed}`)) % quotes.length;
        return quotes[index];
    }, [groupId, quotes]);

    const quoteOfTheWeek = useMemo(() => {
        if (quotes.length === 0) {
            return null;
        }
        const seed = getWeekSeed(new Date());
        const index = Math.abs(hashString(`${groupId}-${seed}-week`)) % quotes.length;
        return quotes[index];
    }, [groupId, quotes]);

    const stats = useMemo(() => {
        const totalQuotes = quotes.length;
        const totalPeople = people.length;

        const quoteeCounts = new Map<string, number>();
        const quoterCounts = new Map<string, { name: string; count: number }>();

        for (const quote of quotes) {
            quoteeCounts.set(quote.personId, (quoteeCounts.get(quote.personId) || 0) + 1);
            const current = quoterCounts.get(quote.createdBy);
            if (current) {
                current.count += 1;
            } else {
                quoterCounts.set(quote.createdBy, { name: quote.createdByName, count: 1 });
            }
        }

        let topQuoted: { name: string; count: number } | null = null;
        for (const [personId, count] of quoteeCounts) {
            if (!topQuoted || count > topQuoted.count) {
                topQuoted = {
                    name: peopleMap.get(personId)?.name || "Unknown",
                    count
                };
            }
        }

        let topQuoter: { name: string; count: number } | null = null;
        for (const entry of quoterCounts.values()) {
            if (!topQuoter || entry.count > topQuoter.count) {
                topQuoter = entry;
            }
        }

        return { totalQuotes, totalPeople, topQuoted, topQuoter };
    }, [people.length, peopleMap, quotes]);

    const filteredQuotes = useMemo(() => {
        if (!search.trim()) {
            return quotes;
        }
        const query = search.trim().toLowerCase();
        return quotes.filter((quote) => {
            const author = peopleMap.get(quote.personId)?.name ?? "";
            return quote.text.toLowerCase().includes(query) || author.toLowerCase().includes(query);
        });
    }, [peopleMap, quotes, search]);

    const isAddingNewPerson = selectedPersonId === "__new__";

    const handleAddQuote = async () => {
        if (!user) return;
        if (!quoteText.trim()) {
            setError("Please enter a quote.");
            return;
        }
        setSubmitting(true);
        setError(null);
        setMessage(null);
        try {
            let personId = selectedPersonId;
            if (isAddingNewPerson) {
                if (newPersonMode !== "placeholder") {
                    setError("Choose how to add the new person.");
                    return;
                }
                if (!newPersonName.trim()) {
                    setError("Enter a placeholder name.");
                    return;
                }
                const placeholder = await createPlaceholderPerson(
                    groupId,
                    newPersonName.trim(),
                    memberIds,
                    adminIds,
                    user.$id
                );
                personId = placeholder.$id;
            }

            if (!personId) {
                setError("Select a person or add a new placeholder.");
                return;
            }

            await createQuote(
                groupId,
                personId,
                quoteText.trim(),
                user.$id,
                currentMembership.displayName,
                memberIds,
                adminIds
            );
            setQuoteText("");
            setNewPersonName("");
            setSelectedPersonId("");
            setNewPersonMode("");
            setAddOpen(false);
            await loadAll();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to add quote.";
            setError(message);
            if (message.toLowerCase().includes("not a member")) {
                await refreshGroups();
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleClaimPlaceholder = async (placeholderId: string) => {
        setSubmitting(true);
        setError(null);
        setMessage(null);
        try {
            await claimPlaceholder(placeholderId, currentMember, groupId);
            setClaimOpen(false);
            await loadAll();
            await refreshGroups();
            setMessage("Placeholder claimed. Welcome to the group!");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to claim placeholder.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleUnclaimPlaceholder = async () => {
        if (!user) return;
        if (!window.confirm("Unclaim your placeholder? Your old quotes will move back.")) {
            return;
        }
        setSubmitting(true);
        setError(null);
        setMessage(null);
        try {
            await unclaimPlaceholder(currentMember, groupId, memberIds, adminIds, user.$id);
            await loadAll();
            await refreshGroups();
            setMessage("Placeholder unclaimed. You can claim a different one.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to unclaim placeholder.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <LoadingState label="Loading group" />;
    }

    return (
        <Stack spacing={3} className="page">
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
                <Box flex={1}>
                    <Typography variant="h4" gutterBottom>
                        {groupName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Viewing panel
                    </Typography>
                </Box>
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                    <Button variant="contained" onClick={() => setAddOpen(true)}>
                        Add quote
                    </Button>
                    {!hasClaimedPlaceholder && claimablePlaceholders.length > 0 && (
                        <Button variant="outlined" onClick={() => setClaimOpen(true)} disabled={submitting}>
                            Claim placeholder
                        </Button>
                    )}
                    {hasClaimedPlaceholder && (
                        <Button
                            variant="outlined"
                            color="secondary"
                            onClick={handleUnclaimPlaceholder}
                            disabled={submitting}
                        >
                            Unclaim placeholder
                        </Button>
                    )}
                </Stack>
            </Stack>

            {message && <Alert severity="success">{message}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}

            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ width: "100%" }}>
                <Box sx={{ flex: { md: 5 }, minWidth: 0 }}>
                    <Card>
                        <CardContent>
                            <Stack spacing={2}>
                                <Typography variant="h6">Quote of the day</Typography>
                                {quoteOfTheDay ? (
                                    <QuoteCard
                                        text={quoteOfTheDay.text}
                                        author={peopleMap.get(quoteOfTheDay.personId)?.name || "Unknown"}
                                        addedBy={quoteOfTheDay.createdByName}
                                    />
                                ) : (
                                    <Typography variant="body2" color="text.secondary">
                                        Add the first quote to start the daily rotation.
                                    </Typography>
                                )}
                            </Stack>
                        </CardContent>
                    </Card>
                </Box>
                <Box sx={{ flex: { md: 7 }, minWidth: 0 }}>
                    <Card>
                        <CardContent>
                            <Stack spacing={2}>
                                <Typography variant="h6">Quote of the week</Typography>
                                {quoteOfTheWeek ? (
                                    <QuoteCard
                                        text={quoteOfTheWeek.text}
                                        author={peopleMap.get(quoteOfTheWeek.personId)?.name || "Unknown"}
                                        addedBy={quoteOfTheWeek.createdByName}
                                    />
                                ) : (
                                    <Typography variant="body2" color="text.secondary">
                                        Add the first quote to start the weekly highlight.
                                    </Typography>
                                )}
                            </Stack>
                        </CardContent>
                    </Card>
                </Box>
            </Stack>

            <Card>
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6">Group stats</Typography>
                        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                            <Card variant="outlined" sx={{ flex: 1 }}>
                                <CardContent>
                                    <Typography variant="overline" color="text.secondary">
                                        Total quotes
                                    </Typography>
                                    <Typography variant="h5">{stats.totalQuotes}</Typography>
                                </CardContent>
                            </Card>
                            <Card variant="outlined" sx={{ flex: 1 }}>
                                <CardContent>
                                    <Typography variant="overline" color="text.secondary">
                                        People tracked
                                    </Typography>
                                    <Typography variant="h5">{stats.totalPeople}</Typography>
                                </CardContent>
                            </Card>
                        </Stack>
                        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                            <Card variant="outlined" sx={{ flex: 1 }}>
                                <CardContent>
                                    <Typography variant="overline" color="text.secondary">
                                        Top quoter
                                    </Typography>
                                    <Typography variant="h6">
                                        {stats.topQuoter?.name || "—"}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {stats.topQuoter ? `${stats.topQuoter.count} quotes` : "No quotes yet"}
                                    </Typography>
                                </CardContent>
                            </Card>
                            <Card variant="outlined" sx={{ flex: 1 }}>
                                <CardContent>
                                    <Typography variant="overline" color="text.secondary">
                                        Most quoted
                                    </Typography>
                                    <Typography variant="h6">
                                        {stats.topQuoted?.name || "—"}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {stats.topQuoted ? `${stats.topQuoted.count} quotes` : "No quotes yet"}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Stack>
                    </Stack>
                </CardContent>
            </Card>

            <Card>
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6">All quotes</Typography>
                        <TextField
                            label="Search quotes or people"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                        {filteredQuotes.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                                No quotes match your search yet.
                            </Typography>
                        ) : (
                            <Stack spacing={2}>
                                {filteredQuotes.map((quote, index) => (
                                    <Box key={quote.$id} className="stagger" sx={{ animationDelay: `${index * 30}ms` }}>
                                        <QuoteCard
                                            text={quote.text}
                                            author={peopleMap.get(quote.personId)?.name || "Unknown"}
                                            addedBy={quote.createdByName}
                                        />
                                    </Box>
                                ))}
                            </Stack>
                        )}
                    </Stack>
                </CardContent>
            </Card>

            <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Add a quote</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} marginTop={1}>
                        <TextField
                            select
                            label="Person"
                            SelectProps={{ displayEmpty: true }}
                            InputLabelProps={{ shrink: true }}
                            value={selectedPersonId}
                            onChange={(event) => {
                                const value = event.target.value;
                                setSelectedPersonId(value);
                                if (value !== "__new__") {
                                    setNewPersonMode("");
                                    setNewPersonName("");
                                }
                            }}
                        >
                            <MenuItem value="">
                                <em>Select a person</em>
                            </MenuItem>
                            {people.map((person) => (
                                <MenuItem key={person.$id} value={person.$id}>
                                    {person.name}
                                    {person.isPlaceholder ? " (placeholder)" : ""}
                                </MenuItem>
                            ))}
                            <MenuItem value="__new__">Add new user...</MenuItem>
                        </TextField>
                        {isAddingNewPerson && (
                            <Card variant="outlined">
                                <CardContent>
                                    <Stack spacing={2}>
                                        <Typography variant="subtitle1">Add a new person</Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Invite them to join, or create a placeholder you can claim later.
                                        </Typography>
                                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                                            <Button
                                                variant={newPersonMode === "invite" ? "contained" : "outlined"}
                                                onClick={() => setNewPersonMode("invite")}
                                            >
                                                Invite and wait
                                            </Button>
                                            <Button
                                                variant={newPersonMode === "placeholder" ? "contained" : "outlined"}
                                                onClick={() => setNewPersonMode("placeholder")}
                                            >
                                                Create placeholder
                                            </Button>
                                        </Stack>
                                        {newPersonMode === "invite" && (
                                            <Stack spacing={1}>
                                                <Typography variant="body2" color="text.secondary">
                                                    Copy an existing invite link from Settings. Once they join, you can
                                                    add quotes directly to their profile.
                                                </Typography>
                                                <Button
                                                    component={RouterLink}
                                                    to="/admin?tab=invites"
                                                    variant="text"
                                                >
                                                    Go to invites
                                                </Button>
                                            </Stack>
                                        )}
                                        {newPersonMode === "placeholder" && (
                                            <Stack spacing={1.5}>
                                                <Typography variant="body2" color="text.secondary">
                                                    Use this when you want to add quotes right now. They can claim
                                                    the placeholder later.
                                                </Typography>
                                                <TextField
                                                    label="Placeholder name"
                                                    value={newPersonName}
                                                    onChange={(event) => setNewPersonName(event.target.value)}
                                                />
                                                <Button
                                                    component={RouterLink}
                                                    to="/admin?tab=invites"
                                                    variant="text"
                                                >
                                                    Go to invites (optional)
                                                </Button>
                                            </Stack>
                                        )}
                                    </Stack>
                                </CardContent>
                            </Card>
                        )}
                        <TextField
                            label="Quote"
                            value={quoteText}
                            onChange={(event) => setQuoteText(event.target.value)}
                            multiline
                            rows={3}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddOpen(false)} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleAddQuote}
                        disabled={submitting || (isAddingNewPerson && newPersonMode !== "placeholder")}
                    >
                        Save quote
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={claimOpen} onClose={() => setClaimOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Claim your placeholder</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} marginTop={1}>
                        {claimablePlaceholders.length === 0 && (
                            <Typography variant="body2" color="text.secondary">
                                There are no placeholders created before you joined.
                            </Typography>
                        )}
                        {claimablePlaceholders.map((person) => (
                            <Card key={person.$id} variant="outlined">
                                <CardContent>
                                    <Stack spacing={1.5} direction={{ xs: "column", sm: "row" }} alignItems="center">
                                        <Box flex={1}>
                                            <Typography variant="subtitle1">{person.name}</Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Claiming will move all quotes onto your profile.
                                            </Typography>
                                        </Box>
                                        <Button
                                            variant="contained"
                                            onClick={() => handleClaimPlaceholder(person.$id)}
                                            disabled={submitting}
                                        >
                                            Claim
                                        </Button>
                                    </Stack>
                                </CardContent>
                            </Card>
                        ))}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setClaimOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default GroupView;
