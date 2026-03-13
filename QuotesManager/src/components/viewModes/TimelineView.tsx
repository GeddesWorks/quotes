import {
    Box,
    Button,
    Card,
    CardContent,
    IconButton,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography
} from "@mui/material";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StarIcon from "@mui/icons-material/Star";
import { useEffect, useMemo, useRef, useState } from "react";
import QuoteCard from "../QuoteCard";
import type { QuoteDoc } from "../../util/appwriteTypes";
import type { ViewModeProps } from "./types";

type TimelineZoom = "30d" | "90d" | "1y" | "all";

const DAY_MS = 24 * 60 * 60 * 1000;
const zoomDays: Record<Exclude<TimelineZoom, "all">, number> = {
    "30d": 30,
    "90d": 90,
    "1y": 365
};

interface DayPoint {
    key: string;
    count: number;
}

interface HeatCell {
    key: string;
    count: number;
    inRange: boolean;
}

const toDayKey = (value: string) => {
    if (!value) return "";
    const key = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : "";
};

const dayKeyFromDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const parseDayKey = (key: string) => new Date(`${key}T00:00:00`);

const startOfDay = (value: Date) => {
    const next = new Date(value);
    next.setHours(0, 0, 0, 0);
    return next;
};

const formatDate = (value: string) => {
    const date = parseDayKey(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric"
    }).format(date);
};

const formatShortDate = (value: string) => {
    const date = parseDayKey(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric"
    }).format(date);
};

const TimelineView: React.FC<ViewModeProps> = ({
    filteredQuotes,
    peopleMap,
    search,
    onSearchChange,
    onQuoteSelect,
    favorites,
    onToggleFavorite
}) => {
    const [visibleCount, setVisibleCount] = useState(25);
    const [zoom, setZoom] = useState<TimelineZoom>("90d");
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const graphScrollRef = useRef<HTMLDivElement | null>(null);
    const favoriteSet = useMemo(() => new Set(favorites ?? []), [favorites]);
    const canFavorite = Boolean(onToggleFavorite);

    const quoteCountByDay = useMemo(() => {
        const map = new Map<string, number>();
        filteredQuotes.forEach((quote) => {
            const key = toDayKey(quote.createdAt || "");
            if (!key) return;
            map.set(key, (map.get(key) ?? 0) + 1);
        });
        return map;
    }, [filteredQuotes]);

    const chartSeries = useMemo<DayPoint[]>(() => {
        if (quoteCountByDay.size === 0) {
            return [];
        }

        const keys = Array.from(quoteCountByDay.keys()).sort((a, b) => a.localeCompare(b));
        const today = startOfDay(new Date());
        let start = today;

        if (zoom === "all") {
            start = startOfDay(parseDayKey(keys[0]));
        } else {
            start = new Date(today);
            start.setDate(start.getDate() - (zoomDays[zoom] - 1));
        }

        const totalDays = Math.max(1, Math.floor((today.getTime() - start.getTime()) / DAY_MS) + 1);
        return Array.from({ length: totalDays }, (_, index) => {
            const day = new Date(start);
            day.setDate(start.getDate() + index);
            const key = dayKeyFromDate(day);
            return {
                key,
                count: quoteCountByDay.get(key) ?? 0
            };
        });
    }, [quoteCountByDay, zoom]);

    useEffect(() => {
        if (chartSeries.length === 0) {
            if (selectedDay) {
                setSelectedDay(null);
            }
            return;
        }
        const available = new Set(chartSeries.map((entry) => entry.key));
        if (selectedDay && available.has(selectedDay)) {
            return;
        }
        const latestWithQuotes =
            [...chartSeries].reverse().find((entry) => entry.count > 0)?.key ??
            chartSeries[chartSeries.length - 1].key;
        setSelectedDay(latestWithQuotes);
    }, [chartSeries, selectedDay]);

    useEffect(() => {
        const node = graphScrollRef.current;
        if (!node) return;
        node.scrollLeft = node.scrollWidth;
    }, [chartSeries.length, zoom]);

    const selectedDayQuotes = useMemo(() => {
        if (!selectedDay) {
            return [] as QuoteDoc[];
        }
        return filteredQuotes.filter((quote) => toDayKey(quote.createdAt || "") === selectedDay);
    }, [filteredQuotes, selectedDay]);

    useEffect(() => {
        setVisibleCount(25);
    }, [search, selectedDay, zoom]);

    const grouped = useMemo(() => {
        const visible = selectedDayQuotes.slice(0, visibleCount);
        const map = new Map<string, QuoteDoc[]>();
        visible.forEach((quote) => {
            const key = toDayKey(quote.createdAt || "") || "unknown";
            const list = map.get(key) ?? [];
            list.push(quote);
            map.set(key, list);
        });
        return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    }, [selectedDayQuotes, visibleCount]);

    const maxCount = useMemo(
        () => chartSeries.reduce((max, entry) => Math.max(max, entry.count), 0),
        [chartSeries]
    );

    const totalInView = useMemo(
        () => chartSeries.reduce((sum, entry) => sum + entry.count, 0),
        [chartSeries]
    );

    const firstKey = chartSeries[0]?.key ?? "";
    const middleKey = chartSeries[Math.floor((chartSeries.length - 1) / 2)]?.key ?? "";
    const lastKey = chartSeries[chartSeries.length - 1]?.key ?? "";

    const heatmapWeeks = useMemo(() => {
        if (chartSeries.length === 0) {
            return [] as HeatCell[][];
        }
        const first = parseDayKey(chartSeries[0].key);
        const last = parseDayKey(chartSeries[chartSeries.length - 1].key);
        const gridStart = new Date(first);
        const gridEnd = new Date(last);
        gridStart.setDate(gridStart.getDate() - gridStart.getDay());
        gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

        const firstKeyInRange = chartSeries[0].key;
        const lastKeyInRange = chartSeries[chartSeries.length - 1].key;
        const cells: HeatCell[] = [];

        for (let day = new Date(gridStart); day <= gridEnd; day.setDate(day.getDate() + 1)) {
            const key = dayKeyFromDate(day);
            const inRange = key >= firstKeyInRange && key <= lastKeyInRange;
            cells.push({
                key,
                count: inRange ? quoteCountByDay.get(key) ?? 0 : 0,
                inRange
            });
        }

        const weeks: HeatCell[][] = [];
        for (let index = 0; index < cells.length; index += 7) {
            weeks.push(cells.slice(index, index + 7));
        }
        return weeks;
    }, [chartSeries, quoteCountByDay]);

    const levelForCount = (count: number) => {
        if (count <= 0 || maxCount <= 0) {
            return 0;
        }
        const ratio = count / maxCount;
        if (ratio < 0.25) return 1;
        if (ratio < 0.5) return 2;
        if (ratio < 0.75) return 3;
        return 4;
    };

    const colorForLevel = (level: number) => {
        if (level <= 0) return "action.hover";
        if (level === 1) return "success.light";
        if (level === 2) return "success.main";
        if (level === 3) return "success.dark";
        return "success.dark";
    };

    const renderFavoriteAction = (quoteId: string) => {
        if (!canFavorite) return null;
        const isFavorite = favoriteSet.has(quoteId);
        return (
            <IconButton
                aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
                title={isFavorite ? "Unstar quote" : "Star quote"}
                onClick={(event) => {
                    event.stopPropagation();
                    onToggleFavorite?.(quoteId);
                }}
            >
                {isFavorite ? <StarIcon /> : <StarBorderIcon />}
            </IconButton>
        );
    };

    return (
        <Stack spacing={2}>
            <Card>
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6">Timeline explorer</Typography>
                        <TextField
                            label="Search quotes or people"
                            value={search}
                            onChange={(event) => onSearchChange(event.target.value)}
                        />
                        <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={zoom}
                            onChange={(_, value) => {
                                if (value) {
                                    setZoom(value as TimelineZoom);
                                }
                            }}
                        >
                            <ToggleButton value="30d">30D</ToggleButton>
                            <ToggleButton value="90d">90D</ToggleButton>
                            <ToggleButton value="1y">1Y</ToggleButton>
                            <ToggleButton value="all">All</ToggleButton>
                        </ToggleButtonGroup>
                        <Typography variant="body2" color="text.secondary">
                            {totalInView} quotes in this window. Click a day in the graph to show that day&apos;s
                            quotes.
                        </Typography>
                    </Stack>
                </CardContent>
            </Card>

            <Card variant="outlined">
                <CardContent>
                    <Stack spacing={1.5}>
                        <Typography variant="subtitle1">Activity graph</Typography>
                        {chartSeries.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                                No dated quotes match the current search.
                            </Typography>
                        ) : (
                            <>
                                <Box ref={graphScrollRef} sx={{ overflowX: "auto", overflowY: "hidden", pb: 1 }}>
                                    <Box
                                        sx={{
                                            display: "flex",
                                            alignItems: "flex-end",
                                            gap: 0.5,
                                            width: "max-content",
                                            minWidth: "100%",
                                            minHeight: 220,
                                            borderBottom: "1px solid",
                                            borderColor: "divider",
                                            px: 1.5,
                                            pt: 1
                                        }}
                                    >
                                        {chartSeries.map((entry) => {
                                            const selected = selectedDay === entry.key;
                                            const height =
                                                maxCount === 0
                                                    ? 6
                                                    : entry.count === 0
                                                      ? 6
                                                      : Math.max((entry.count / maxCount) * 160, 10);
                                            return (
                                                <Box
                                                    key={entry.key}
                                                    sx={{
                                                        flexGrow: entry.count > 0 ? 1.5 : 0.45,
                                                        flexBasis: 0,
                                                        minWidth: entry.count > 0 ? 8 : 3,
                                                        display: "flex"
                                                    }}
                                                >
                                                    <Box
                                                        component="button"
                                                        type="button"
                                                        onClick={() => setSelectedDay(entry.key)}
                                                        title={`${formatDate(entry.key)}: ${entry.count} quotes`}
                                                        sx={{
                                                            width: "100%",
                                                            border: 0,
                                                            p: 0,
                                                            m: 0,
                                                            background: "none",
                                                            cursor: "pointer",
                                                            display: "flex",
                                                            alignItems: "flex-end",
                                                            minHeight: 170,
                                                            "&:focus-visible": {
                                                                outline: "2px solid",
                                                                outlineColor: "primary.main",
                                                                outlineOffset: 2
                                                            }
                                                        }}
                                                    >
                                                        <Box
                                                            sx={{
                                                                width: "100%",
                                                                height,
                                                                borderRadius: "4px 4px 0 0",
                                                                backgroundColor: selected
                                                                    ? "secondary.main"
                                                                    : entry.count > 0
                                                                      ? "primary.main"
                                                                      : "divider",
                                                                opacity: selected ? 1 : entry.count > 0 ? 0.9 : 0.55
                                                            }}
                                                        />
                                                    </Box>
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                </Box>
                                <Stack direction="row" justifyContent="space-between">
                                    <Typography variant="caption" color="text.secondary">
                                        {firstKey ? formatShortDate(firstKey) : ""}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {middleKey ? formatShortDate(middleKey) : ""}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {lastKey ? formatShortDate(lastKey) : ""}
                                    </Typography>
                                </Stack>
                            </>
                        )}
                    </Stack>
                </CardContent>
            </Card>

            <Card variant="outlined">
                <CardContent>
                    <Stack spacing={1.5}>
                        <Typography variant="subtitle1">Activity heatmap</Typography>
                        {heatmapWeeks.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                                No activity for this window.
                            </Typography>
                        ) : (
                            <>
                                <Box sx={{ overflowX: "auto", overflowY: "hidden" }}>
                                    <Box
                                        sx={{
                                            display: "flex",
                                            gap: 0.5,
                                            width: "max-content",
                                            minWidth: "100%",
                                            px: 1.5
                                        }}
                                    >
                                        {heatmapWeeks.map((week, weekIndex) => (
                                            <Stack key={weekIndex} spacing={0.5}>
                                                {week.map((cell) => {
                                                    const level = levelForCount(cell.count);
                                                    const selected = selectedDay === cell.key;
                                                    return (
                                                        <Box
                                                            key={cell.key}
                                                            component="button"
                                                            type="button"
                                                            onClick={() =>
                                                                cell.inRange ? setSelectedDay(cell.key) : undefined
                                                            }
                                                            title={
                                                                cell.inRange
                                                                    ? `${formatDate(cell.key)}: ${cell.count} quotes`
                                                                    : ""
                                                            }
                                                            disabled={!cell.inRange}
                                                            sx={{
                                                                width: 11,
                                                                height: 11,
                                                                borderRadius: 0.75,
                                                                border: "1px solid",
                                                                borderColor: selected ? "secondary.main" : "transparent",
                                                                backgroundColor: cell.inRange
                                                                    ? selected
                                                                        ? "secondary.main"
                                                                        : colorForLevel(level)
                                                                    : "transparent",
                                                                cursor: cell.inRange ? "pointer" : "default",
                                                                p: 0,
                                                                opacity: cell.inRange ? 1 : 0,
                                                                "&:focus-visible": {
                                                                    outline: "2px solid",
                                                                    outlineColor: "primary.main",
                                                                    outlineOffset: 2
                                                                }
                                                            }}
                                                        />
                                                    );
                                                })}
                                            </Stack>
                                        ))}
                                    </Box>
                                </Box>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Typography variant="caption" color="text.secondary">
                                        Less
                                    </Typography>
                                    {[0, 1, 2, 3, 4].map((level) => (
                                        <Box
                                            key={level}
                                            sx={{
                                                width: 11,
                                                height: 11,
                                                borderRadius: 0.75,
                                                backgroundColor: colorForLevel(level),
                                                border: "1px solid",
                                                borderColor: "divider"
                                            }}
                                        />
                                    ))}
                                    <Typography variant="caption" color="text.secondary">
                                        More
                                    </Typography>
                                </Stack>
                            </>
                        )}
                    </Stack>
                </CardContent>
            </Card>

            <Card>
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6">
                            {selectedDay ? `Quotes for ${formatDate(selectedDay)}` : "Select a day"}
                        </Typography>
                        {selectedDay && (
                            <Typography variant="body2" color="text.secondary">
                                Showing {Math.min(visibleCount, selectedDayQuotes.length)} of {selectedDayQuotes.length}{" "}
                                quotes.
                            </Typography>
                        )}
                        {!selectedDay ? (
                            <Typography variant="body2" color="text.secondary">
                                Click a day in the graph or heatmap to view quotes.
                            </Typography>
                        ) : grouped.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                                No quotes found for this day.
                            </Typography>
                        ) : (
                            <Stack spacing={3}>
                                {grouped.map(([date, quotes]) => (
                                    <Box
                                        key={date}
                                        sx={{
                                            borderLeft: "2px solid",
                                            borderColor: "divider",
                                            paddingLeft: 2
                                        }}
                                    >
                                        <Typography variant="overline" color="text.secondary">
                                            {formatDate(date)}
                                        </Typography>
                                        <Stack spacing={2} mt={1.5}>
                                            {quotes.map((quote) => (
                                                <QuoteCard
                                                    key={quote.$id}
                                                    text={quote.text}
                                                    author={peopleMap.get(quote.personId)?.name || "Unknown"}
                                                    addedBy={quote.createdByName}
                                                    onSelect={() => onQuoteSelect?.(quote.$id)}
                                                    actions={renderFavoriteAction(quote.$id)}
                                                />
                                            ))}
                                        </Stack>
                                    </Box>
                                ))}
                            </Stack>
                        )}
                        {selectedDay && selectedDayQuotes.length > visibleCount && (
                            <Button variant="text" onClick={() => setVisibleCount((prev) => prev + 25)}>
                                Load more
                            </Button>
                        )}
                    </Stack>
                </CardContent>
            </Card>
        </Stack>
    );
};

export default TimelineView;
