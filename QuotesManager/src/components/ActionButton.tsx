import { Button, CircularProgress } from "@mui/material";
import type { ButtonProps } from "@mui/material";

interface ActionButtonProps extends ButtonProps {
    loading?: boolean;
    loadingLabel?: string;
}

const ActionButton: React.FC<ActionButtonProps> = ({
    loading = false,
    loadingLabel,
    disabled,
    startIcon,
    children,
    ...props
}) => (
    <Button
        {...props}
        disabled={disabled || loading}
        startIcon={loading ? <CircularProgress color="inherit" size={16} /> : startIcon}
    >
        {loading ? loadingLabel ?? children : children}
    </Button>
);

export default ActionButton;
