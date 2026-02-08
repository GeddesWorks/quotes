import { Alert, AlertTitle, Stack, Typography } from "@mui/material";
import { appwriteConfigIssues } from "../util/appwrite";

const ConfigNotice = () => {
    if (appwriteConfigIssues.length === 0) {
        return null;
    }

    return (
        <Alert severity="warning" sx={{ maxWidth: 720 }}>
            <AlertTitle>Appwrite configuration missing</AlertTitle>
            <Stack spacing={0.5}>
                <Typography variant="body2">
                    Add the following environment variables before continuing:
                </Typography>
                {appwriteConfigIssues.map((issue) => (
                    <Typography key={issue} variant="body2" sx={{ fontWeight: 600 }}>
                        {issue}
                    </Typography>
                ))}
            </Stack>
        </Alert>
    );
};

export default ConfigNotice;
