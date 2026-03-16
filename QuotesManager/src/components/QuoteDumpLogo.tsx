import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

type QuoteDumpLogoProps = {
    size?: number | string;
    sx?: SxProps<Theme>;
};

const QuoteDumpLogo = ({ size = 48, sx }: QuoteDumpLogoProps) => (
    <Box
        component="span"
        aria-label="QuoteDump"
        sx={{
            display: "inline-flex",
            alignItems: "baseline",
            whiteSpace: "nowrap",
            fontFamily: "\"Lobster Two\", \"Fraunces\", serif",
            fontWeight: 700,
            fontStyle: "italic",
            fontSize: typeof size === "number" ? `${size}px` : size,
            letterSpacing: "-0.03em",
            lineHeight: 0.9,
            userSelect: "none",
            filter: "drop-shadow(0 10px 18px rgba(28, 27, 25, 0.18))",
            ...sx
        }}
    >
        <Box
            component="span"
            sx={{
                display: "inline-block",
                backgroundImage: "linear-gradient(135deg, #4FD0C1 0%, #2FB67D 100%)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                color: "transparent",
                WebkitTextFillColor: "transparent",
                transform: "rotate(-3deg)"
            }}
        >
            Quote
        </Box>
        <Box
            component="span"
            sx={{
                display: "inline-block",
                marginLeft: "-0.1em",
                backgroundImage: "linear-gradient(135deg, #D08B72 0%, #A95A44 100%)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                color: "transparent",
                WebkitTextFillColor: "transparent",
                transform: "translateY(0.02em) rotate(-1deg)"
            }}
        >
            Dump
        </Box>
    </Box>
);

export default QuoteDumpLogo;
