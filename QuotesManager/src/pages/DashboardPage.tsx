import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ConfigNotice from "../components/ConfigNotice";
import GroupView from "../components/GroupView";
import LoadingState from "../components/LoadingState";
import { useGroups } from "../contexts/GroupContext";
import { appwriteConfigured } from "../util/appwrite";

const DashboardPage = () => {
    const {
        groups,
        activeGroup,
        activeMembership,
        loading,
        error,
        createGroup,
        joinGroup
    } = useGroups();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const joinCode = searchParams.get("join");
    const [groupName, setGroupName] = useState("");
    const [inviteCode, setInviteCode] = useState("");
    const [localError, setLocalError] = useState<string | null>(null);
    const [joiningFromLink, setJoiningFromLink] = useState(false);

    useEffect(() => {
        if (!joinCode || joiningFromLink) {
            return;
        }

        let cancelled = false;
        setJoiningFromLink(true);
        setLocalError(null);

        joinGroup(joinCode)
            .catch((err) => {
                if (!cancelled) {
                    setLocalError(err instanceof Error ? err.message : "Failed to join group.");
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setJoiningFromLink(false);
                    navigate("/", { replace: true });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [joinCode, joiningFromLink, joinGroup, navigate]);

    if (!appwriteConfigured) {
        return (
            <Box display="flex" justifyContent="center" padding={4}>
                <ConfigNotice />
            </Box>
        );
    }

    if (loading || joiningFromLink) {
        return <LoadingState label="Loading groups" />;
    }

    if (!activeGroup || !activeMembership || groups.length === 0) {
        return (
            <Stack spacing={3} className="page">
                <Typography variant="h4">Welcome back</Typography>
                <Typography variant="body1" color="text.secondary">
                    Create a new group or join one with an invite code.
                </Typography>
                {error && <Alert severity="error">{error}</Alert>}
                {localError && <Alert severity="warning">{localError}</Alert>}
                <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="stretch">
                    <Card sx={{ flex: 1 }}>
                        <CardContent>
                            <Stack spacing={2}>
                                <Typography variant="h6">Create a group</Typography>
                                <TextField
                                    label="Group name"
                                    value={groupName}
                                    onChange={(event) => setGroupName(event.target.value)}
                                />
                                <Button
                                    variant="contained"
                                    onClick={async () => {
                                        setLocalError(null);
                                        if (!groupName.trim()) {
                                            setLocalError("Enter a group name to continue.");
                                            return;
                                        }
                                        await createGroup(groupName.trim());
                                        setGroupName("");
                                    }}
                                >
                                    Create group
                                </Button>
                            </Stack>
                        </CardContent>
                    </Card>
                    <Card sx={{ flex: 1 }}>
                        <CardContent>
                            <Stack spacing={2}>
                                <Typography variant="h6">Join with a code</Typography>
                                <TextField
                                    label="Invite code"
                                    value={inviteCode}
                                    onChange={(event) => setInviteCode(event.target.value)}
                                />
                                <Button
                                    variant="outlined"
                                    onClick={async () => {
                                        setLocalError(null);
                                        if (!inviteCode.trim()) {
                                            setLocalError("Enter an invite code to join.");
                                            return;
                                        }
                                        await joinGroup(inviteCode.trim());
                                        setInviteCode("");
                                    }}
                                >
                                    Join group
                                </Button>
                            </Stack>
                        </CardContent>
                    </Card>
                </Stack>
            </Stack>
        );
    }

    return <GroupView groupId={activeGroup.$id} groupName={activeGroup.name} currentMembership={activeMembership} />;
};

export default DashboardPage;
