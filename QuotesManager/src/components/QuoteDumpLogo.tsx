import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import logoUrl from "../../logo.png";

type QuoteDumpLogoProps = {
    size?: number | string;
    sx?: SxProps<Theme>;
};

const QuoteDumpLogo = ({ size = 48, sx }: QuoteDumpLogoProps) => (
    <Box
        component="img"
        src={logoUrl}
        alt="QuoteDump"
        sx={{
            display: "block",
            height: typeof size === "number" ? `${size}px` : size,
            width: "auto",
            maxWidth: "100%",
            userSelect: "none",
            ...sx
        }}
    />
);

export default QuoteDumpLogo;
