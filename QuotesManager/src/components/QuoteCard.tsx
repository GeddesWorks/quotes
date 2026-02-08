import { Button, Card, CardActions, CardContent, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

interface QuoteCardProps {
    text: string;
    author: string;
    addedBy?: string;
    canDelete?: boolean;
    onDelete?: () => void;
}

const QuoteCard: React.FC<QuoteCardProps> = ({ text, author, addedBy, canDelete, onDelete }) => {
    const theme = useTheme();
    return (
        <Card
            sx={{
                width: "100%",
                backgroundColor: alpha(theme.palette.background.paper, 0.92),
                backdropFilter: "blur(4px)"
            }}
        >
            <CardContent>
                <Stack spacing={1.5}>
                    <Typography variant="h6" sx={{ lineHeight: 1.5 }}>
                        "{text}"
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            {author}
                        </Typography>
                        {addedBy && (
                            <Typography variant="body2" color="text.secondary">
                                added by {addedBy}
                            </Typography>
                        )}
                    </Stack>
                </Stack>
            </CardContent>
            {canDelete && (
                <CardActions sx={{ justifyContent: "flex-end", paddingX: 2, paddingBottom: 2 }}>
                    <Button variant="outlined" color="secondary" onClick={onDelete}>
                        Remove
                    </Button>
                </CardActions>
            )}
        </Card>
    );
};

export default QuoteCard;

