import { Alert, Box, Stack, Typography } from "@mui/material";
import ConfigNotice from "../components/ConfigNotice";
import GroupDashboard from "../components/GroupDashboard";
import LoadingState from "../components/LoadingState";
import { useGroups } from "../contexts/GroupContext";
import { appwriteConfigured } from "../util/appwrite";

const AdminPage = () => {
    const { activeGroup, activeMembership, loading, error } = useGroups();

    if (!appwriteConfigured) {
        return (
            <Box display="flex" justifyContent="center" padding={4}>
                <ConfigNotice />
            </Box>
        );
    }

    if (loading) {
        return <LoadingState label="Loading panel" />;
    }

    if (!activeGroup || !activeMembership) {
        return (
            <Stack spacing={2} className="page">
                <Typography variant="h5">No active group</Typography>
                <Typography variant="body2" color="text.secondary">
                    Create or join a group before opening the settings panel.
                </Typography>
            </Stack>
        );
    }

    return (
        <Stack spacing={2} className="page">
            {error && <Alert severity="error">{error}</Alert>}
            <GroupDashboard
                groupId={activeGroup.$id}
                groupName={activeGroup.name}
                currentMembership={activeMembership}
            />
        </Stack>
    );
};

export default AdminPage;
