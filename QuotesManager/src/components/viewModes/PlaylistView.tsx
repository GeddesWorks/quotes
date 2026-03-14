import { Button, Card, CardContent, Stack, Typography } from "@mui/material";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StarIcon from "@mui/icons-material/Star";
import { useEffect, useMemo, useState } from "react";
import type { ViewModeProps } from "./types";

const PlaylistView: React.FC<ViewModeProps> = ({
    quotes,
    peopleMap,
    onQuoteSelect,
    favorites,
    onToggleFavorite
}) => {
    const playlist = useMemo(() => quotes.slice(0, 10), [quotes]);
    const [index, setIndex] = useState(0);
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        setIndex(0);
    }, [playlist.length]);

    useEffect(() => {
        if (!playing || playlist.length === 0) return;
        const id = window.setInterval(() => {
            setIndex((prev) => (prev + 1) % playlist.length);
        }, 5000);
        return () => window.clearInterval(id);
    }, [playing, playlist.length]);

    const activeQuote = playlist[index];
    const isFavorite = activeQuote ? favorites?.includes(activeQuote.$id) ?? false : false;

    useEffect(() => {
        if (activeQuote) {
            onQuoteSelect?.(activeQuote.$id);
        }
    }, [activeQuote, onQuoteSelect]);

    return (
        <Card>
            <CardContent>
                <Stack spacing={2} alignItems="center" textAlign="center">
                    <Typography variant="overline" color="text.secondary">
                        Playlist mode
                    </Typography>
                    {activeQuote ? (
                        <>
                            <Typography variant="h5">"{activeQuote.text}"</Typography>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                - {peopleMap.get(activeQuote.personId)?.name || "Unknown"}
                            </Typography>
                            {onToggleFavorite && (
                                <Button
                                    variant="text"
                                    startIcon={isFavorite ? <StarIcon /> : <StarBorderIcon />}
                                    onClick={() => activeQuote && onToggleFavorite(activeQuote.$id)}
                                >
                                    {isFavorite ? "Unstar" : "Star"}
                                </Button>
                            )}
                        </>
                    ) : (
                        <Typography variant="body2" color="text.secondary">
                            Add quotes to build a playlist.
                        </Typography>
                    )}
                    <Stack direction="row" spacing={2}>
                        <Button
                            variant="outlined"
                            onClick={() =>
                                setIndex((prev) =>
                                    playlist.length ? (prev - 1 + playlist.length) % playlist.length : 0
                                )
                            }
                            disabled={playlist.length === 0}
                        >
                            Previous
                        </Button>
                        <Button
                            variant={playing ? "outlined" : "contained"}
                            onClick={() => setPlaying((prev) => !prev)}
                            disabled={playlist.length === 0}
                        >
                            {playing ? "Pause" : "Play"}
                        </Button>
                        <Button
                            variant="outlined"
                            onClick={() =>
                                setIndex((prev) =>
                                    playlist.length ? (prev + 1) % playlist.length : 0
                                )
                            }
                            disabled={playlist.length === 0}
                        >
                            Next
                        </Button>
                    </Stack>
                    {playlist.length > 0 && (
                        <Typography variant="body2" color="text.secondary">
                            Playing {index + 1} of {playlist.length}
                        </Typography>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
};

export default PlaylistView;
