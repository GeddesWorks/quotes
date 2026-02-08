import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Divider,
    Grid,
    MenuItem,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useGroups } from "../contexts/GroupContext";
import { appwriteConfig } from "../util/appwrite";
import {
    claimPlaceholder,
    createInvite,
    createPlaceholderPerson,
    createQuote,
    deleteQuote,
    deleteInvite,
    listGroupMembers,
    listInvites,
    listPeople,
    listQuotes,
    removePerson,
    renameInvite,
    removeMember,
    syncGroupPermissions,
    transferOwnership,
    updateMemberRole
} from "../util/appwriteApi";
import type { InviteDoc, MembershipDoc, PersonDoc, QuoteDoc } from "../util/appwriteTypes";
import QuoteCard from "./QuoteCard";
import LoadingState from "./LoadingState";

interface GroupDashboardProps {
    groupId: string;
    groupName: string;
    currentMembership: MembershipDoc;
}

const GroupDashboard: React.FC<GroupDashboardProps> = ({
    groupId,
    groupName,
    currentMembership
}) => {
    const { user } = useAuth();
    const { refresh: refreshGroups, setActiveGroupId } = useGroups();
    const navigate = useNavigate();
    const location = useLocation();
    const [tab, setTab] = useState(0);
    const [members, setMembers] = useState<MembershipDoc[]>([]);
    const [people, setPeople] = useState<PersonDoc[]>([]);
    const [quotes, setQuotes] = useState<QuoteDoc[]>([]);
    const [invites, setInvites] = useState<InviteDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const [selectedPersonId, setSelectedPersonId] = useState("");
    const [newPersonMode, setNewPersonMode] = useState<"invite" | "placeholder" | "">("");
    const [newPersonName, setNewPersonName] = useState("");
    const [quoteText, setQuoteText] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [newInviteName, setNewInviteName] = useState("General");
    const [inviteNameDrafts, setInviteNameDrafts] = useState<Record<string, string>>({});
    const [editingInviteId, setEditingInviteId] = useState<string | null>(null);
    const [leaving, setLeaving] = useState(false);

    const loadAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [memberDocs, peopleDocs, quoteDocs, inviteDocs] = await Promise.all([
                listGroupMembers(groupId),
                listPeople(groupId),
                listQuotes(groupId),
                listInvites(groupId)
            ]);
            setMembers(memberDocs);
            setPeople(peopleDocs);
            setQuotes(quoteDocs);
            setInvites(inviteDocs);
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

    const isOwner = currentMembership.role === "owner";
    const isAdmin = isOwner || currentMembership.role === "admin";
    const showSync = appwriteConfig.permissionMode !== "relaxed";

    const tabOptions = useMemo(
        () =>
            isAdmin
                ? [
                      { key: "quotes", label: "Quotes" },
                      { key: "people", label: "People" },
                      { key: "members", label: "Members" },
                      { key: "invites", label: "Invites" }
                  ]
                : [
                      { key: "invites", label: "Invites" },
                      { key: "leave", label: "Leave group" },
                      { key: "more", label: "More" }
                  ],
        [isAdmin]
    );

    useEffect(() => {
        setTab(0);
    }, [tabOptions]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const target = params.get("tab");
        if (!target) {
            return;
        }
        const index = tabOptions.findIndex((option) => option.key === target);
        if (index >= 0) {
            setTab(index);
        }
    }, [location.search, tabOptions]);

    useEffect(() => {
        setInviteNameDrafts((prev) => {
            const next: Record<string, string> = { ...prev };
            const ids = new Set(invites.map((invite) => invite.$id));
            for (const invite of invites) {
                if (!(invite.$id in next)) {
                    next[invite.$id] = invite.name || "";
                }
            }
            for (const key of Object.keys(next)) {
                if (!ids.has(key)) {
                    delete next[key];
                }
            }
            return next;
        });
    }, [invites]);

    const peopleMap = useMemo(() => new Map(people.map((person) => [person.$id, person])), [people]);
    const placeholderPeople = people.filter((person) => person.isPlaceholder);
    const quoteCountsByPerson = useMemo(() => {
        const counts = new Map<string, number>();
        for (const quote of quotes) {
            counts.set(quote.personId, (counts.get(quote.personId) || 0) + 1);
        }
        return counts;
    }, [quotes]);
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

    const handleAddQuote = async () => {
        if (!user) return;
        if (!quoteText.trim()) {
            setError("Please enter a quote.");
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            let personId = selectedPersonId;
            if (selectedPersonId === "__new__") {
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
            await loadAll();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to add quote.";
            setError(message);
            if (message.toLowerCase().includes("not a member")) {
                await refreshGroups();
                navigate("/", { replace: true });
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteQuote = async (quoteId: string) => {
        if (!isAdmin) return;
        if (!window.confirm("Remove this quote?") || !quoteId) {
            return;
        }
        setSubmitting(true);
        try {
            await deleteQuote(groupId, quoteId);
            await loadAll();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to remove quote.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleClaimPlaceholder = async (placeholderId: string) => {
        setSubmitting(true);
        setError(null);
        try {
            await claimPlaceholder(placeholderId, currentMember, groupId);
            await loadAll();
            await refreshGroups();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to claim placeholder.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleCreateInvite = async () => {
        if (!isAdmin) return;
        setSubmitting(true);
        setError(null);
        try {
            const inviteAdmins = adminIds.length > 0 ? adminIds : [currentMembership.userId].filter(Boolean);
            const inviteName = newInviteName.trim() || "General";
            await createInvite(groupId, groupName, inviteAdmins, inviteName);
            await loadAll();
            setNewInviteName(inviteName);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create invite.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleSync = async () => {
        if (!isAdmin) return;
        setSubmitting(true);
        setMessage(null);
        setError(null);
        try {
            await syncGroupPermissions(groupId);
            await loadAll();
            setMessage("Permissions refreshed for the whole group.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to sync permissions.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleRoleChange = async (membership: MembershipDoc, role: "admin" | "member") => {
        if (!isAdmin) return;
        setSubmitting(true);
        try {
            await updateMemberRole(membership.$id, role, groupId);
            await syncGroupPermissions(groupId);
            await loadAll();
            await refreshGroups();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update role.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleTransferOwnership = async (nextOwner: MembershipDoc) => {
        if (!isOwner) return;
        if (!window.confirm(`Transfer ownership to ${nextOwner.displayName}?`)) {
            return;
        }
        setSubmitting(true);
        try {
            await transferOwnership(groupId, currentMembership, nextOwner);
            await loadAll();
            await refreshGroups();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to transfer ownership.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemoveMember = async (membership: MembershipDoc) => {
        if (!isAdmin) return;
        if (membership.role === "admin" && !isOwner) {
            setError("Only the owner can remove another admin.");
            return;
        }
        if (!window.confirm(`Remove ${membership.displayName} from the group?`)) {
            return;
        }
        setSubmitting(true);
        try {
            await removeMember(membership);
            await syncGroupPermissions(groupId);
            await loadAll();
            await refreshGroups();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to remove member.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleLeaveGroup = async () => {
        if (isOwner) {
            setError("Transfer ownership before leaving the group.");
            return;
        }
        if (!window.confirm("Leave this group?") || !currentMembership) {
            return;
        }
        setSubmitting(true);
        setLeaving(true);
        setError(null);
        try {
            await removeMember(currentMembership);
            const result = await refreshGroups();
            if (!result.ok) {
                setError("Left the group, but failed to refresh your groups. Please reload.");
                setLeaving(false);
                return;
            }
            if (result.groups.length > 0) {
                const nextId = result.activeGroupId ?? result.groups[0].$id;
                if (nextId) {
                    setActiveGroupId(nextId);
                }
            }
            navigate("/", { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to leave group.");
            setLeaving(false);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemovePlaceholder = async (person: PersonDoc) => {
        if (!isAdmin) return;
        const quoteCount = quoteCountsByPerson.get(person.$id) || 0;
        if (quoteCount > 0) {
            const confirmDelete = window.confirm(
                `${person.name} has ${quoteCount} quote${quoteCount === 1 ? "" : "s"}. Removing will delete them. Continue?`
            );
            if (!confirmDelete) {
                return;
            }
        } else if (!window.confirm(`Remove ${person.name}?`)) {
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            await removePerson(groupId, person.$id, quoteCount > 0);
            await loadAll();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to remove placeholder.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleRenameInvite = async (inviteId: string) => {
        if (!isAdmin) return;
        const name = (inviteNameDrafts[inviteId] || "").trim();
        if (!name) {
            setError("Invite name cannot be empty.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await renameInvite(inviteId, name, groupId);
            await loadAll();
            setEditingInviteId(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to rename invite.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteInvite = async (inviteId: string) => {
        if (!isAdmin) return;
        if (!window.confirm("Delete this invite code?")) {
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await deleteInvite(inviteId, groupId);
            await loadAll();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete invite.");
        } finally {
            setSubmitting(false);
        }
    };

    const inviteLinkBase = typeof window !== "undefined" ? window.location.origin : "";
    const activeTab = tabOptions[tab]?.key ?? tabOptions[0]?.key;
    const isAddingNewPerson = selectedPersonId === "__new__";

    if (loading) {
        return <LoadingState label="Loading group" />;
    }

    if (leaving) {
        return <LoadingState label="Leaving group" />;
    }

    return (
        <Stack spacing={3} className="page">
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
                <Box flex={1}>
                    <Typography variant="h4" gutterBottom>
                        {groupName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {isAdmin ? "Admin panel" : "Settings"} · Role: {currentMembership.role}
                    </Typography>
                </Box>
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                    {isAdmin && showSync && (
                        <Button variant="outlined" onClick={handleSync} disabled={submitting}>
                            Sync access
                        </Button>
                    )}
                    {isAdmin && (
                        <Button variant="outlined" color="secondary" onClick={handleLeaveGroup}>
                            Leave group
                        </Button>
                    )}
                </Stack>
            </Stack>

            {message && <Alert severity="success">{message}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}

            <Tabs value={tab} onChange={(_, value) => setTab(value)}>
                {tabOptions.map((option) => (
                    <Tab key={option.key} label={option.label} />
                ))}
            </Tabs>

            {activeTab === "quotes" && (
                <Stack spacing={3}>
                    <Card>
                        <CardContent>
                            <Stack spacing={2}>
                                <Typography variant="h6">Add a quote</Typography>
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
                                            {person.name}{person.isPlaceholder ? " (placeholder)" : ""}
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
                                                        variant={
                                                            newPersonMode === "placeholder" ? "contained" : "outlined"
                                                        }
                                                        onClick={() => setNewPersonMode("placeholder")}
                                                    >
                                                        Create placeholder
                                                    </Button>
                                                </Stack>
                                                {newPersonMode === "invite" && (
                                                    <Stack spacing={1}>
                                                        <Typography variant="body2" color="text.secondary">
                                                            Send them a permanent invite link. Once they join, you can
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
                                                            Use this when you want to add quotes right now. They can
                                                            claim the placeholder later.
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
                                <Button
                                    variant="contained"
                                    onClick={handleAddQuote}
                                    disabled={submitting || (isAddingNewPerson && newPersonMode !== "placeholder")}
                                >
                                    Add quote
                                </Button>
                            </Stack>
                        </CardContent>
                    </Card>

                    <Stack spacing={2}>
                        {quotes.length === 0 && (
                            <Typography variant="body2" color="text.secondary">
                                No quotes yet. Add the first one.
                            </Typography>
                        )}
                        {quotes.map((quote, index) => {
                            const person = peopleMap.get(quote.personId);
                            return (
                                <Box key={quote.$id} className="stagger" sx={{ animationDelay: `${index * 40}ms` }}>
                                    <QuoteCard
                                        text={quote.text}
                                        author={person?.name || "Unknown"}
                                        addedBy={quote.createdByName}
                                        canDelete={isAdmin}
                                        onDelete={() => handleDeleteQuote(quote.$id)}
                                    />
                                </Box>
                            );
                        })}
                    </Stack>
                </Stack>
            )}

            {activeTab === "people" && (
                <Stack spacing={2}>
                    {people.length === 0 && (
                        <Typography variant="body2" color="text.secondary">
                            Add a quote to create the first person.
                        </Typography>
                    )}
                    <Grid container spacing={2}>
                        {people.map((person) => (
                            <Grid item xs={12} md={6} key={person.$id}>
                                <Card>
                                    <CardContent>
                                        <Stack spacing={1}>
                                            <Stack
                                                direction="row"
                                                spacing={2}
                                                alignItems="center"
                                                justifyContent="space-between"
                                            >
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <Typography variant="h6">{person.name}</Typography>
                                                    {person.isPlaceholder ? (
                                                        <Chip label="Placeholder" color="secondary" size="small" />
                                                    ) : (
                                                        <Chip label="Member" color="primary" size="small" />
                                                    )}
                                                </Stack>
                                                <Stack direction="row" spacing={1}>
                                                    {person.isPlaceholder &&
                                                        !hasClaimedPlaceholder &&
                                                        claimablePlaceholders.some((entry) => entry.$id === person.$id) && (
                                                        <Button
                                                            size="small"
                                                            variant="contained"
                                                            onClick={() => handleClaimPlaceholder(person.$id)}
                                                            disabled={submitting}
                                                        >
                                                            Claim
                                                        </Button>
                                                    )}
                                                    {person.isPlaceholder && isAdmin && (
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            color="secondary"
                                                            onClick={() => handleRemovePlaceholder(person)}
                                                            disabled={submitting}
                                                        >
                                                            Remove
                                                        </Button>
                                                    )}
                                                    {!person.isPlaceholder && isAdmin && (() => {
                                                        const membership = members.find(
                                                            (member) => member.personId === person.$id
                                                        );
                                                        if (!membership) {
                                                            return null;
                                                        }
                                                        const isSelf = membership.userId === currentMembership.userId;
                                                        const canRemove =
                                                            !isSelf &&
                                                            (isOwner
                                                                ? membership.role !== "owner"
                                                                : isAdmin && membership.role === "member");
                                                        if (!canRemove) {
                                                            return null;
                                                        }
                                                        return (
                                                            <Button
                                                                size="small"
                                                                variant="outlined"
                                                                color="secondary"
                                                                onClick={() => handleRemoveMember(membership)}
                                                                disabled={submitting}
                                                            >
                                                                Remove
                                                            </Button>
                                                        );
                                                    })()}
                                                </Stack>
                                            </Stack>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                    {claimablePlaceholders.length > 0 && (
                        <Typography variant="body2" color="text.secondary">
                            New members can claim placeholders to inherit their quotes.
                        </Typography>
                    )}
                </Stack>
            )}

            {activeTab === "members" && (
                <Stack spacing={2}>
                    {members.map((member, index) => {
                        const isSelf = member.userId === currentMembership.userId;
                        const canPromote = isAdmin && member.role === "member";
                        const canDemote = isOwner && member.role === "admin";
                        const canRemove =
                            !isSelf &&
                            (isOwner ? member.role !== "owner" : isAdmin && member.role === "member");

                        return (
                            <Card key={member.$id} className="stagger" sx={{ animationDelay: `${index * 40}ms` }}>
                                <CardContent>
                                    <Stack spacing={2}>
                                        <Stack direction="row" spacing={2} alignItems="center">
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Typography variant="h6">{member.displayName}</Typography>
                                                {member.role === "owner" && (
                                                    <Box component="span" role="img" aria-label="Owner crown">
                                                        👑
                                                    </Box>
                                                )}
                                            </Stack>
                                            <Chip label={member.role} />
                                            {isSelf && <Chip label="You" color="secondary" size="small" />}
                                        </Stack>
                                        <Stack direction="row" spacing={2} flexWrap="wrap">
                                            {canPromote && (
                                                <Button variant="outlined" onClick={() => handleRoleChange(member, "admin")}>
                                                    Make admin
                                                </Button>
                                            )}
                                            {canDemote && (
                                                <Button variant="outlined" onClick={() => handleRoleChange(member, "member")}>
                                                    Remove admin
                                                </Button>
                                            )}
                                            {isOwner && member.role !== "owner" && (
                                                <Button variant="outlined" onClick={() => handleTransferOwnership(member)}>
                                                    Make owner
                                                </Button>
                                            )}
                                            {canRemove && (
                                                <Button variant="outlined" color="secondary" onClick={() => handleRemoveMember(member)}>
                                                    Remove
                                                </Button>
                                            )}
                                        </Stack>
                                    </Stack>
                                </CardContent>
                            </Card>
                        );
                    })}
                </Stack>
            )}

            {activeTab === "invites" && (
                <Stack spacing={3}>
                    <Card>
                        <CardContent>
                            <Stack spacing={2}>
                                <Typography variant="h6">Invite teammates</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Invite links are permanent. Anyone who signs up with the code will join this group.
                                </Typography>
                                {isAdmin ? (
                                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                                        <TextField
                                            label="Invite name"
                                            value={newInviteName}
                                            onChange={(event) => setNewInviteName(event.target.value)}
                                            size="small"
                                            sx={{ flex: 1 }}
                                        />
                                        <Button variant="contained" onClick={handleCreateInvite} disabled={submitting}>
                                            Create invite code
                                        </Button>
                                    </Stack>
                                ) : (
                                    <Typography variant="body2" color="text.secondary">
                                        Only admins can create or rename invite codes.
                                    </Typography>
                                )}
                            </Stack>
                        </CardContent>
                    </Card>
                    {invites.length === 0 && (
                        <Typography variant="body2" color="text.secondary">
                            No invites yet. Create a code to share.
                        </Typography>
                    )}
                    <Stack spacing={2}>
                        {invites.map((invite, index) => {
                            const displayName = invite.name || "General";
                            const draftName = inviteNameDrafts[invite.$id] ?? displayName;
                            const canSave = draftName.trim() !== displayName;
                            const isEditing = editingInviteId === invite.$id;
                            return (
                                <Card key={invite.$id} className="stagger" sx={{ animationDelay: `${index * 40}ms` }}>
                                    <CardContent>
                                        <Stack spacing={1.5}>
                                            <Stack
                                                direction={{ xs: "column", sm: "row" }}
                                                spacing={2}
                                                alignItems={{ sm: "center" }}
                                                justifyContent="space-between"
                                            >
                                                <Box flex={1}>
                                                    {isAdmin && isEditing ? (
                                                        <TextField
                                                            label="Invite name"
                                                            size="small"
                                                            value={draftName}
                                                            onChange={(event) =>
                                                                setInviteNameDrafts((prev) => ({
                                                                    ...prev,
                                                                    [invite.$id]: event.target.value
                                                                }))
                                                            }
                                                        />
                                                    ) : (
                                                        <Typography variant="subtitle1">{displayName}</Typography>
                                                    )}
                                                </Box>
                                                {isAdmin && (
                                                    <Stack direction="row" spacing={1}>
                                                        {isEditing ? (
                                    <>
                                        <Button
                                            variant="outlined"
                                            onClick={() => handleRenameInvite(invite.$id)}
                                            disabled={submitting || !draftName.trim() || !canSave}
                                        >
                                            Save
                                        </Button>
                                        <Button
                                            variant="text"
                                            onClick={() => {
                                                setInviteNameDrafts((prev) => ({
                                                    ...prev,
                                                    [invite.$id]: displayName
                                                }));
                                                setEditingInviteId(null);
                                            }}
                                            disabled={submitting}
                                        >
                                            Cancel
                                        </Button>
                                    </>
                                                        ) : (
                                                            <Button
                                                                variant="outlined"
                                                                onClick={() => setEditingInviteId(invite.$id)}
                                                                disabled={submitting}
                                                            >
                                                                Rename
                                                            </Button>
                                                        )}
                                                        <Button
                                                            variant="outlined"
                                                            color="secondary"
                                                            onClick={() => handleDeleteInvite(invite.$id)}
                                                            disabled={submitting || isEditing}
                                                        >
                                                            Delete
                                                        </Button>
                                                    </Stack>
                                                )}
                                            </Stack>
                                            <Typography variant="body2" color="text.secondary">
                                                Code: {invite.code}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Link: {inviteLinkBase}/?join={invite.code}
                                            </Typography>
                                            <Divider />
                                            <Button
                                                variant="outlined"
                                                onClick={() => navigator.clipboard.writeText(invite.code)}
                                            >
                                                Copy code
                                            </Button>
                                            <Button
                                                variant="outlined"
                                                onClick={() => navigator.clipboard.writeText(`${inviteLinkBase}/?join=${invite.code}`)}
                                            >
                                                Copy link
                                            </Button>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </Stack>
                </Stack>
            )}

            {activeTab === "leave" && (
                <Card>
                    <CardContent>
                        <Stack spacing={2}>
                            <Typography variant="h6">Leave group</Typography>
                            <Typography variant="body2" color="text.secondary">
                                You can leave at any time. Owners must transfer ownership before leaving.
                            </Typography>
                            <Button variant="outlined" color="secondary" onClick={handleLeaveGroup}>
                                Leave group
                            </Button>
                        </Stack>
                    </CardContent>
                </Card>
            )}

            {activeTab === "more" && (
                <Card>
                    <CardContent>
                        <Stack spacing={1.5}>
                            <Typography variant="h6">More settings</Typography>
                            <Typography variant="body2" color="text.secondary">
                                More group settings are coming soon.
                            </Typography>
                        </Stack>
                    </CardContent>
                </Card>
            )}
        </Stack>
    );
};

export default GroupDashboard;
