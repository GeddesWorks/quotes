import { Box, CircularProgress, Typography } from "@mui/material";

interface LoadingStateProps {
    label?: string;
}

const LoadingState: React.FC<LoadingStateProps> = ({ label = "Loading" }) => (
    <Box display="flex" flexDirection="column" alignItems="center" gap={2} padding={4}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
            {label}
        </Typography>
    </Box>
);

export default LoadingState;
