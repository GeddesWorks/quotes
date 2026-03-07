import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Drawer,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Switch,
    TextField,
    Typography
} from "@mui/material";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import TuneIcon from "@mui/icons-material/Tune";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useGroups } from "../contexts/GroupContext";
import {
    claimPlaceholder,
    createPlaceholderPerson,
    createQuote,
    listGroupMembers,
    listPeople,
    listQuotes,
    unclaimPlaceholder
} from "../util/appwriteApi";
import type { MembershipDoc, PersonDoc, QuoteDoc } from "../util/appwriteTypes";
import LoadingState from "./LoadingState";
import { CombinedView, CustomView, PeopleFirstView, QuoteWallView, TimelineView } from "./viewModes";
import { defaultModuleOrder, viewModules } from "./viewModules";
import type { Layout, LayoutItem } from "react-grid-layout";

interface GroupViewProps {
    groupId: string;
    groupName: string;
    currentMembership: MembershipDoc;
}

const hashString = (value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) % 2147483647;
    }
    return hash;
};

const getWeekSeed = (date: Date) => {
    const year = date.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const days = Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    const week = Math.floor(days / 7) + 1;
    return `${year}-W${String(week).padStart(2, "0")}`;
};

const getHourSeed = (date: Date) => date.toISOString().slice(0, 13);

const readStoredList = (key: string) => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.filter((value) => typeof value === "string");
        }
    } catch (error) {
        return null;
    }
    return null;
};

const readStoredObject = <T,>(key: string): T | null => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as T;
        }
    } catch (error) {
        return null;
    }
    return null;
};

const readStoredArray = <T,>(key: string): T[] | null => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed as T[];
        }
    } catch (error) {
        return null;
    }
    return null;
};

const moduleKeySet = new Set(viewModules.map((module) => module.key));
const defaultItemSize = { w: 2, h: 2 };
const moduleSizeOverrides: Record<string, { w: number; h: number; minW?: number; minH?: number }> = {
    spacer: { w: 1, h: 1 },
    separator: { w: 2, h: 1, minW: 2, minH: 1 },
    container: { w: 2, h: 2 }
};

const buildDefaultLayoutItem = (key: string, index: number, cols: number): LayoutItem => {
    const size = moduleSizeOverrides[key] ?? defaultItemSize;
    const w = Math.min(size.w, cols);
    const minW = Math.min(size.minW ?? 1, cols);
    return {
        i: key,
        x: (index * w) % cols,
        y: Infinity,
        w,
        h: size.h,
        minW,
        minH: size.minH ?? 1
    };
};

const normalizeLayoutForCols = (layout: Layout, cols: number): Layout =>
    layout.map((item) => {
        const minW = Math.min(item.minW ?? 1, cols);
        const minH = item.minH ?? 1;
        const w = Math.min(item.w, cols);
        const x = Math.min(item.x, Math.max(0, cols - w));
        return {
            ...item,
            w,
            x,
            minW,
            minH
        };
    });

const syncLayoutForModules = (layout: Layout, keys: string[], cols: number): Layout => {
    const layoutMap = new Map(layout.map((item) => [item.i, item]));
    const nextLayout = keys.map((key, index) => layoutMap.get(key) ?? buildDefaultLayoutItem(key, index, cols));
    return normalizeLayoutForCols(nextLayout, cols);
};

const GroupView: React.FC<GroupViewProps> = ({ groupId, groupName, currentMembership }) => {
    const { user } = useAuth();
    const { refresh: refreshGroups } = useGroups();
    const storagePrefix = user?.$id ?? "guest";
    const customModulesKey = useMemo(
        () => `qm_custom_modules_${storagePrefix}_${groupId}`,
        [groupId, storagePrefix]
    );
    const customLayoutKey = useMemo(
        () => `qm_custom_layout_${storagePrefix}_${groupId}`,
        [groupId, storagePrefix]
    );
    const customGridKey = useMemo(
        () => `qm_custom_grid_${storagePrefix}_${groupId}`,
        [groupId, storagePrefix]
    );
    const favoritesKey = useMemo(
        () => `qm_favorites_${storagePrefix}_${groupId}`,
        [groupId, storagePrefix]
    );
    const recentlyViewedKey = useMemo(
        () => `qm_recently_viewed_${storagePrefix}_${groupId}`,
        [groupId, storagePrefix]
    );
    const [members, setMembers] = useState<MembershipDoc[]>([]);
    const [people, setPeople] = useState<PersonDoc[]>([]);
    const [quotes, setQuotes] = useState<QuoteDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const [search, setSearch] = useState("");
    const [addOpen, setAddOpen] = useState(false);
    const [claimOpen, setClaimOpen] = useState(false);
    const [selectedPersonId, setSelectedPersonId] = useState("");
    const [newPersonMode, setNewPersonMode] = useState<"invite" | "placeholder" | "">("");
    const [newPersonName, setNewPersonName] = useState("");
    const [quoteText, setQuoteText] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [viewMode, setViewMode] = useState("combined");
    const [moreOpen, setMoreOpen] = useState(false);
    const [customizeOpen, setCustomizeOpen] = useState(false);
    const [customModules, setCustomModules] = useState<string[]>(defaultModuleOrder);
    const [customLayout, setCustomLayout] = useState<Layout>([]);
    const [gridCols, setGridCols] = useState(4);
    const [rowHeight, setRowHeight] = useState(160);
    const [isEditingLayout, setIsEditingLayout] = useState(false);
    const [flashKeys, setFlashKeys] = useState<string[]>([]);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);
    const [kioskEnabled, setKioskEnabled] = useState(false);
    const [kioskViewMode, setKioskViewMode] = useState("combined");
    const stableLayoutRef = useRef<Layout>([]);
    const itemRefs = useRef(new Map<string, HTMLDivElement | null>());

    const loadAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [memberDocs, peopleDocs, quoteDocs] = await Promise.all([
                listGroupMembers(groupId),
                listPeople(groupId),
                listQuotes(groupId)
            ]);
            setMembers(memberDocs);
            setPeople(peopleDocs);
            setQuotes(quoteDocs);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load group data.");
        } finally {
            setLoading(false);
        }
    }, [groupId]);

    useEffect(() => {
        void loadAll();
    }, [loadAll]);

    useEffect(() => {
        const stored = readStoredList(customModulesKey);
        if (stored) {
            const filtered = stored.filter((key) => moduleKeySet.has(key));
            setCustomModules(filtered);
        } else {
            setCustomModules(defaultModuleOrder);
        }
    }, [customModulesKey]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(customModulesKey, JSON.stringify(customModules));
    }, [customModules, customModulesKey]);

    useEffect(() => {
        const stored = readStoredObject<{ cols: number; rowHeight: number }>(customGridKey);
        if (stored) {
            setGridCols(Math.min(Math.max(stored.cols ?? 4, 1), 6));
            setRowHeight(Math.min(Math.max(stored.rowHeight ?? 160, 100), 240));
        } else {
            setGridCols(4);
            setRowHeight(160);
        }
    }, [customGridKey]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(customGridKey, JSON.stringify({ cols: gridCols, rowHeight }));
    }, [customGridKey, gridCols, rowHeight]);

    useEffect(() => {
        const stored = readStoredArray<LayoutItem>(customLayoutKey);
        if (stored) {
            const normalized = syncLayoutForModules(stored, customModules, gridCols);
            setCustomLayout(normalized);
            stableLayoutRef.current = normalized;
        } else {
            const initial = syncLayoutForModules([], customModules, gridCols);
            setCustomLayout(initial);
            stableLayoutRef.current = initial;
        }
    }, [customLayoutKey]);

    useEffect(() => {
        setCustomLayout((prev) => {
            const next = syncLayoutForModules(prev, customModules, gridCols);
            stableLayoutRef.current = next;
            return next;
        });
    }, [customModules, gridCols]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(customLayoutKey, JSON.stringify(customLayout));
    }, [customLayout, customLayoutKey]);


    useEffect(() => {
        const stored = readStoredList(favoritesKey);
        setFavorites(stored ?? []);
    }, [favoritesKey]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(favoritesKey, JSON.stringify(favorites));
    }, [favorites, favoritesKey]);

    useEffect(() => {
        const stored = readStoredList(recentlyViewedKey);
        setRecentlyViewed(stored ?? []);
    }, [recentlyViewedKey]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(recentlyViewedKey, JSON.stringify(recentlyViewed));
    }, [recentlyViewed, recentlyViewedKey]);

    useEffect(() => {
        if (!quotes.length) {
            return;
        }
        const ids = new Set(quotes.map((quote) => quote.$id));
        setFavorites((prev) => prev.filter((id) => ids.has(id)));
        setRecentlyViewed((prev) => prev.filter((id) => ids.has(id)));
    }, [quotes]);

    const memberIds = useMemo(
        () => Array.from(new Set([...members.map((member) => member.userId), currentMembership.userId])),
        [members, currentMembership.userId]
    );
    const adminIds = useMemo(() => {
        const ids = members.filter((member) => member.role !== "member").map((member) => member.userId);
        if (currentMembership.role !== "member") {
            ids.push(currentMembership.userId);
        }
        return Array.from(new Set(ids));
    }, [members, currentMembership.role, currentMembership.userId]);

    const peopleMap = useMemo(() => new Map(people.map((person) => [person.$id, person])), [people]);
    const placeholderPeople = useMemo(
        () => people.filter((person) => person.isPlaceholder),
        [people]
    );
    const currentMember = useMemo(
        () => members.find((member) => member.userId === currentMembership.userId) ?? currentMembership,
        [members, currentMembership]
    );
    const hasClaimedPlaceholder = Boolean(currentMember.claimedPlaceholderId);
    const claimablePlaceholders = useMemo(() => {
        const joinedAt = Date.parse(currentMember.createdAt || "") || 0;
        return placeholderPeople.filter((person) => {
            const createdAt = Date.parse(person.createdAt || "") || 0;
            return createdAt < joinedAt;
        });
    }, [currentMember.createdAt, placeholderPeople]);

    const quoteOfTheDay = useMemo(() => {
        if (quotes.length === 0) {
            return null;
        }
        const seed = new Date().toISOString().slice(0, 10);
        const index = Math.abs(hashString(`${groupId}-${seed}`)) % quotes.length;
        return quotes[index];
    }, [groupId, quotes]);

    const quoteOfTheWeek = useMemo(() => {
        if (quotes.length === 0) {
            return null;
        }
        const seed = getWeekSeed(new Date());
        const index = Math.abs(hashString(`${groupId}-${seed}-week`)) % quotes.length;
        return quotes[index];
    }, [groupId, quotes]);

    const quoteOfTheHour = useMemo(() => {
        if (quotes.length === 0) {
            return null;
        }
        const seed = getHourSeed(new Date());
        const index = Math.abs(hashString(`${groupId}-${seed}-hour`)) % quotes.length;
        return quotes[index];
    }, [groupId, quotes]);

    const stats = useMemo(() => {
        const totalQuotes = quotes.length;
        const totalPeople = people.length;

        const quoteeCounts = new Map<string, number>();
        const quoterCounts = new Map<string, { name: string; count: number }>();

        for (const quote of quotes) {
            quoteeCounts.set(quote.personId, (quoteeCounts.get(quote.personId) || 0) + 1);
            const current = quoterCounts.get(quote.createdBy);
            if (current) {
                current.count += 1;
            } else {
                quoterCounts.set(quote.createdBy, { name: quote.createdByName, count: 1 });
            }
        }

        let topQuoted: { name: string; count: number } | null = null;
        for (const [personId, count] of quoteeCounts) {
            if (!topQuoted || count > topQuoted.count) {
                topQuoted = {
                    name: peopleMap.get(personId)?.name || "Unknown",
                    count
                };
            }
        }

        let topQuoter: { name: string; count: number } | null = null;
        for (const entry of quoterCounts.values()) {
            if (!topQuoter || entry.count > topQuoter.count) {
                topQuoter = entry;
            }
        }

        return { totalQuotes, totalPeople, topQuoted, topQuoter };
    }, [people.length, peopleMap, quotes]);

    const filteredQuotes = useMemo(() => {
        if (!search.trim()) {
            return quotes;
        }
        const query = search.trim().toLowerCase();
        return quotes.filter((quote) => {
            const author = peopleMap.get(quote.personId)?.name ?? "";
            return quote.text.toLowerCase().includes(query) || author.toLowerCase().includes(query);
        });
    }, [peopleMap, quotes, search]);

    const toggleFavorite = useCallback((quoteId: string) => {
        setFavorites((prev) => {
            if (prev.includes(quoteId)) {
                return prev.filter((id) => id !== quoteId);
            }
            return [quoteId, ...prev];
        });
    }, []);

    const markViewed = useCallback((quoteId: string) => {
        setRecentlyViewed((prev) => {
            const next = [quoteId, ...prev.filter((id) => id !== quoteId)];
            return next.slice(0, 20);
        });
    }, []);

    const moduleProps = useMemo(
        () => ({
            quotes,
            people,
            peopleMap,
            stats,
            quoteOfTheDay,
            quoteOfTheWeek,
            quoteOfTheHour,
            favorites,
            toggleFavorite,
            recentlyViewed,
            markViewed
        }),
        [
            quotes,
            people,
            peopleMap,
            stats,
            quoteOfTheDay,
            quoteOfTheWeek,
            quoteOfTheHour,
            favorites,
            toggleFavorite,
            recentlyViewed,
            markViewed
        ]
    );

    const toggleModule = useCallback((key: string) => {
        setCustomModules((prev) => {
            if (prev.includes(key)) {
                return prev.filter((item) => item !== key);
            }
            return [...prev, key];
        });
    }, []);

    const registerItemRef = useCallback((key: string, node: HTMLDivElement | null) => {
        if (node) {
            itemRefs.current.set(key, node);
        } else {
            itemRefs.current.delete(key);
        }
    }, []);

    const getOverflowKeys = useCallback(
        (keys?: string[]) => {
            const targetKeys = keys ?? customLayout.map((item) => item.i);
            const overflow: string[] = [];
            targetKeys.forEach((key) => {
                const node = itemRefs.current.get(key);
                if (!node) return;
                const hasVerticalOverflow = node.scrollHeight - node.clientHeight > 4;
                const hasHorizontalOverflow = node.scrollWidth - node.clientWidth > 4;
                if (hasVerticalOverflow || hasHorizontalOverflow) {
                    overflow.push(key);
                }
            });
            return overflow;
        },
        [customLayout]
    );

    const flashOverflow = useCallback((keys: string[]) => {
        if (!keys.length) return;
        setFlashKeys(keys);
        window.setTimeout(() => setFlashKeys([]), 1200);
    }, []);

    const handleLayoutChange = useCallback((nextLayout: Layout) => {
        setCustomLayout(nextLayout);
    }, []);

    const handleDragStop = useCallback(
        (nextLayout: Layout, _item: LayoutItem) => {
            const normalized = syncLayoutForModules(nextLayout, customModules, gridCols);
            setCustomLayout(normalized);
            stableLayoutRef.current = normalized;
        },
        [customModules, gridCols]
    );

    const handleResizeStart = useCallback((_item: LayoutItem) => {
        // Ensure we have a stable snapshot before resize begins.
        stableLayoutRef.current = customLayout;
    }, [customLayout]);

    const handleResizeStop = useCallback(
        (nextLayout: Layout, item: LayoutItem) => {
            const normalized = syncLayoutForModules(nextLayout, customModules, gridCols);
            setCustomLayout(normalized);
            window.requestAnimationFrame(() => {
                const overflow = getOverflowKeys([item.i]);
                if (overflow.length) {
                    setCustomLayout(stableLayoutRef.current);
                    flashOverflow(overflow);
                } else {
                    stableLayoutRef.current = normalized;
                }
            });
        },
        [customModules, gridCols, flashOverflow, getOverflowKeys]
    );

    const handleGridChange = useCallback(
        (nextCols: number, nextRowHeight: number) => {
            const safeCols = Math.min(Math.max(nextCols, 1), 6);
            const safeRowHeight = Math.min(Math.max(nextRowHeight, 100), 240);
            const prevCols = gridCols;
            const prevRowHeight = rowHeight;
            const prevLayout = customLayout;
            const normalized = syncLayoutForModules(customLayout, customModules, safeCols);
            setGridCols(safeCols);
            setRowHeight(safeRowHeight);
            setCustomLayout(normalized);
            window.requestAnimationFrame(() => {
                const overflow = getOverflowKeys();
                if (overflow.length) {
                    setGridCols(prevCols);
                    setRowHeight(prevRowHeight);
                    setCustomLayout(prevLayout);
                    flashOverflow(overflow);
                } else {
                    stableLayoutRef.current = normalized;
                }
            });
        },
        [customLayout, customModules, flashOverflow, getOverflowKeys, gridCols, rowHeight]
    );

    const resetLayout = useCallback(() => {
        const initial = syncLayoutForModules([], customModules, gridCols);
        setCustomLayout(initial);
        stableLayoutRef.current = initial;
    }, [customModules, gridCols]);

    const enterKiosk = useCallback(async () => {
        setMoreOpen(false);
        setCustomizeOpen(false);
        setAddOpen(false);
        setClaimOpen(false);
        setKioskViewMode(viewMode);
        setKioskEnabled(true);
        if (document.documentElement.requestFullscreen) {
            try {
                await document.documentElement.requestFullscreen();
            } catch (error) {
                // Ignore fullscreen failures and still show kiosk layout.
            }
        }
    }, [viewMode]);

    const exitKiosk = useCallback(async (skipFullscreenExit = false) => {
        setKioskEnabled(false);
        if (!skipFullscreenExit && document.fullscreenElement && document.exitFullscreen) {
            try {
                await document.exitFullscreen();
            } catch (error) {
                // Ignore fullscreen exit errors.
            }
        }
    }, []);

    useEffect(() => {
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement && kioskEnabled) {
                void exitKiosk(true);
            }
        };
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, [exitKiosk, kioskEnabled]);

    const viewModes = useMemo(
        () => [
            {
                key: "combined",
                label: "Combined",
                description: "Featured quotes, stats, and the main list together."
            },
            {
                key: "custom",
                label: "Custom",
                description: "Build your own layout with modular cards."
            },
            {
                key: "wall",
                label: "Quote wall",
                description: "Masonry grid for quick browsing and scanning."
            },
            {
                key: "timeline",
                label: "Timeline",
                description: "Quotes grouped by date in a vertical feed."
            },
            {
                key: "people",
                label: "People-first",
                description: "Pick a person and explore their quotes."
            }
        ],
        []
    );

    const displayLayout = useMemo(
        () => normalizeLayoutForCols(customLayout, gridCols),
        [customLayout, gridCols]
    );

    const baseViewProps = {
        quotes,
        filteredQuotes,
        people,
        peopleMap,
        quoteOfTheDay,
        quoteOfTheWeek,
        stats,
        search,
        onSearchChange: setSearch
    };

    const renderView = (mode: string) => {
        const editing = isEditingLayout && !kioskEnabled;
        switch (mode) {
            case "custom":
                return (
                    <CustomView
                        modules={viewModules}
                        moduleOrder={customModules}
                        moduleProps={moduleProps}
                        layout={displayLayout}
                        cols={gridCols}
                        rowHeight={rowHeight}
                        isEditing={editing}
                        onLayoutChange={handleLayoutChange}
                        onDragStop={handleDragStop}
                        onResizeStart={handleResizeStart}
                        onResizeStop={handleResizeStop}
                        registerItemRef={registerItemRef}
                        flashKeys={flashKeys}
                    />
                );
            case "wall":
                return (
                    <QuoteWallView
                        {...baseViewProps}
                        onQuoteSelect={markViewed}
                        favorites={favorites}
                        onToggleFavorite={toggleFavorite}
                    />
                );
            case "timeline":
                return (
                    <TimelineView
                        {...baseViewProps}
                        onQuoteSelect={markViewed}
                        favorites={favorites}
                        onToggleFavorite={toggleFavorite}
                    />
                );
            case "people":
                return (
                    <PeopleFirstView
                        {...baseViewProps}
                        onQuoteSelect={markViewed}
                        favorites={favorites}
                        onToggleFavorite={toggleFavorite}
                    />
                );
            case "combined":
            default:
                return (
                    <CombinedView
                        {...baseViewProps}
                        onQuoteSelect={markViewed}
                        favorites={favorites}
                        onToggleFavorite={toggleFavorite}
                    />
                );
        }
    };

    const isAddingNewPerson = selectedPersonId === "__new__";

    const handleAddQuote = async () => {
        if (!user) return;
        if (!quoteText.trim()) {
            setError("Please enter a quote.");
            return;
        }
        setSubmitting(true);
        setError(null);
        setMessage(null);
        try {
            let personId = selectedPersonId;
            if (isAddingNewPerson) {
                if (newPersonMode !== "placeholder") {
                    setError("Choose how to add the new person.");
                    return;
                }
                if (!newPersonName.trim()) {
                    setError("Enter a placeholder name.");
                    return;
                }
                const placeholder = await createPlaceholderPerson(
                    groupId,
                    newPersonName.trim(),
                    memberIds,
                    adminIds,
                    user.$id
                );
                personId = placeholder.$id;
            }

            if (!personId) {
                setError("Select a person or add a new placeholder.");
                return;
            }

            await createQuote(
                groupId,
                personId,
                quoteText.trim(),
                user.$id,
                currentMembership.displayName,
                memberIds,
                adminIds
            );
            setQuoteText("");
            setNewPersonName("");
            setSelectedPersonId("");
            setNewPersonMode("");
            setAddOpen(false);
            await loadAll();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to add quote.";
            setError(message);
            if (message.toLowerCase().includes("not a member")) {
                await refreshGroups();
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleClaimPlaceholder = async (placeholderId: string) => {
        setSubmitting(true);
        setError(null);
        setMessage(null);
        try {
            await claimPlaceholder(placeholderId, currentMember, groupId);
            setClaimOpen(false);
            await loadAll();
            await refreshGroups();
            setMessage("Placeholder claimed. Welcome to the group!");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to claim placeholder.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleUnclaimPlaceholder = async () => {
        if (!user) return;
        if (!window.confirm("Unclaim your placeholder? Your old quotes will move back.")) {
            return;
        }
        setSubmitting(true);
        setError(null);
        setMessage(null);
        try {
            await unclaimPlaceholder(currentMember, groupId, memberIds, adminIds, user.$id);
            await loadAll();
            await refreshGroups();
            setMessage("Placeholder unclaimed. You can claim a different one.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to unclaim placeholder.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <LoadingState label="Loading group" />;
    }

    if (kioskEnabled) {
        return (
            <Box
                sx={(theme) => ({
                    position: "fixed",
                    inset: 0,
                    zIndex: theme.zIndex.modal + 2,
                    backgroundColor: theme.palette.background.default,
                    padding: { xs: 2, md: 4 },
                    overflowY: "auto"
                })}
            >
                <Stack spacing={2}>
                    <Box display="flex" justifyContent="flex-end">
                        <Button
                            variant="contained"
                            startIcon={<FullscreenExitIcon />}
                            onClick={() => void exitKiosk()}
                        >
                            Exit kiosk
                        </Button>
                    </Box>
                    {renderView(kioskViewMode)}
                </Stack>
            </Box>
        );
    }

    return (
        <Stack spacing={3} className="page">
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
                <Box flex={1}>
                    <Typography variant="h4" gutterBottom>
                        {groupName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Viewing panel
                    </Typography>
                </Box>
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                    <Button variant="contained" onClick={() => setAddOpen(true)}>
                        Add quote
                    </Button>
                    {!hasClaimedPlaceholder && claimablePlaceholders.length > 0 && (
                        <Button variant="outlined" onClick={() => setClaimOpen(true)} disabled={submitting}>
                            Claim placeholder
                        </Button>
                    )}
                    {hasClaimedPlaceholder && (
                        <Button
                            variant="outlined"
                            color="secondary"
                            onClick={handleUnclaimPlaceholder}
                            disabled={submitting}
                        >
                            Unclaim placeholder
                        </Button>
                    )}
                </Stack>
            </Stack>

            {message && <Alert severity="success">{message}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}

            <Stack spacing={1}>
                <Typography variant="overline" color="text.secondary">
                    View mode
                </Typography>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
                    <Stack
                        direction="row"
                        spacing={1}
                        sx={{
                            overflowX: "auto",
                            paddingBottom: { xs: 1, md: 0 },
                            alignItems: "center",
                            "&::-webkit-scrollbar": { display: "none" }
                        }}
                    >
                        {["combined", "wall", "timeline"].map((modeKey) => {
                            const mode = viewModes.find((entry) => entry.key === modeKey);
                            if (!mode) {
                                return null;
                            }
                            return (
                                <Chip
                                    key={mode.key}
                                    label={mode.label}
                                    color={viewMode === mode.key ? "primary" : "default"}
                                    variant={viewMode === mode.key ? "filled" : "outlined"}
                                    onClick={() => setViewMode(mode.key)}
                                />
                            );
                        })}
                        {(() => {
                            const isInQuick = ["combined", "wall", "timeline"].includes(viewMode);
                            const label = isInQuick
                                ? "More"
                                : `More: ${viewModes.find((entry) => entry.key === viewMode)?.label ?? ""}`;
                            return (
                                <Chip
                                    label={label}
                                    color={!isInQuick ? "primary" : "default"}
                                    variant={!isInQuick ? "filled" : "outlined"}
                                    onClick={() => setMoreOpen(true)}
                                />
                            );
                        })()}
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                        {viewMode === "custom" && (
                            <>
                                <Button
                                    variant={isEditingLayout ? "contained" : "outlined"}
                                    size="small"
                                    onClick={() => setIsEditingLayout((prev) => !prev)}
                                    sx={{ alignSelf: { xs: "flex-start", md: "center" } }}
                                >
                                    {isEditingLayout ? "Editing layout" : "Edit layout"}
                                </Button>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<TuneIcon />}
                                    onClick={() => setCustomizeOpen(true)}
                                    sx={{ alignSelf: { xs: "flex-start", md: "center" } }}
                                >
                                    Customize
                                </Button>
                            </>
                        )}
                    </Stack>
                </Stack>
            </Stack>

            {renderView(viewMode)}

            <Drawer
                anchor="bottom"
                open={moreOpen}
                onClose={() => setMoreOpen(false)}
                PaperProps={{
                    sx: {
                        borderTopLeftRadius: 16,
                        borderTopRightRadius: 16
                    }
                }}
            >
                <Box padding={3} paddingBottom={4}>
                    <Stack spacing={2}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="h6">Choose a view</Typography>
                            <Button variant="text" onClick={() => setMoreOpen(false)}>
                                Close
                            </Button>
                        </Stack>
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                                gap: 2
                            }}
                        >
                            {viewModes.map((mode) => (
                                <Card
                                    key={mode.key}
                                    variant="outlined"
                                    sx={(theme) => ({
                                        borderColor:
                                            viewMode === mode.key
                                                ? theme.palette.primary.main
                                                : theme.palette.divider
                                    })}
                                >
                                    <CardContent>
                                        <Stack spacing={1.5}>
                                            <Typography variant="subtitle1">{mode.label}</Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {mode.description}
                                            </Typography>
                                            <Button
                                                variant={viewMode === mode.key ? "contained" : "outlined"}
                                                onClick={() => {
                                                    setViewMode(mode.key);
                                                    setMoreOpen(false);
                                                }}
                                            >
                                                {viewMode === mode.key ? "Selected" : "Use this view"}
                                            </Button>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            ))}
                        </Box>
                        <Card
                            variant="outlined"
                            sx={(theme) => ({
                                borderStyle: "dashed",
                                borderColor: theme.palette.primary.main,
                                background:
                                    theme.palette.mode === "dark"
                                        ? "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))"
                                        : "linear-gradient(135deg, rgba(0,0,0,0.05), rgba(0,0,0,0.01))"
                            })}
                        >
                            <CardContent>
                                <Stack spacing={1.5}>
                                    <Typography variant="subtitle1">Kiosk mode</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Turns the current selected view into fullscreen kiosk mode with no navigation.
                                    </Typography>
                                    <Button
                                        variant="contained"
                                        startIcon={<FullscreenIcon />}
                                        onClick={() => {
                                            setMoreOpen(false);
                                            void enterKiosk();
                                        }}
                                    >
                                        Enter kiosk
                                    </Button>
                                </Stack>
                            </CardContent>
                        </Card>
                    </Stack>
                </Box>
            </Drawer>

            <Drawer
                anchor="right"
                open={customizeOpen}
                onClose={() => setCustomizeOpen(false)}
                PaperProps={{ sx: { width: { xs: "100%", sm: 420 } } }}
            >
                <Box padding={3} paddingBottom={4}>
                    <Stack spacing={2}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="h6">Customize view</Typography>
                            <Button variant="text" onClick={() => setCustomizeOpen(false)}>
                                Close
                            </Button>
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                            Choose which modules appear in Custom and Kiosk mode. Toggle edit mode to drag and resize
                            cards on the grid.
                        </Typography>
                        <Card variant="outlined">
                            <CardContent>
                                <Stack spacing={2}>
                                    <Typography variant="subtitle1">Layout editor</Typography>
                                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                                        <Button
                                            variant={isEditingLayout ? "contained" : "outlined"}
                                            onClick={() => setIsEditingLayout((prev) => !prev)}
                                        >
                                            {isEditingLayout ? "Editing layout" : "Edit layout"}
                                        </Button>
                                        <Button variant="outlined" onClick={resetLayout}>
                                            Reset layout
                                        </Button>
                                    </Stack>
                                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                                        <FormControl size="small" fullWidth>
                                            <InputLabel id="grid-cols-label">Grid columns</InputLabel>
                                            <Select
                                                labelId="grid-cols-label"
                                                label="Grid columns"
                                                value={gridCols}
                                                onChange={(event) => {
                                                    const nextCols = Number(event.target.value);
                                                    handleGridChange(nextCols, rowHeight);
                                                }}
                                            >
                                                {[1, 2, 3, 4, 5, 6].map((value) => (
                                                    <MenuItem key={value} value={value}>
                                                        {value} columns
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                        <FormControl size="small" fullWidth>
                                            <InputLabel id="row-height-label">Row height</InputLabel>
                                            <Select
                                                labelId="row-height-label"
                                                label="Row height"
                                                value={rowHeight}
                                                onChange={(event) => {
                                                    const nextHeight = Number(event.target.value);
                                                    handleGridChange(gridCols, nextHeight);
                                                }}
                                            >
                                                {[120, 140, 160, 180, 200, 220].map((value) => (
                                                    <MenuItem key={value} value={value}>
                                                        {value}px
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Stack>
                                </Stack>
                            </CardContent>
                        </Card>
                        <Stack spacing={2}>
                            {viewModules.map((module) => {
                                const enabled = customModules.includes(module.key);
                                return (
                                    <Card key={module.key} variant="outlined">
                                        <CardContent>
                                            <Stack spacing={1.5} alignItems="flex-start">
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <Typography variant="subtitle1">{module.label}</Typography>
                                                    {module.isPro && <Chip label="Pro" size="small" />}
                                                </Stack>
                                                <Typography variant="body2" color="text.secondary">
                                                    {module.description}
                                                </Typography>
                                                <Switch
                                                    checked={enabled}
                                                    onChange={() => toggleModule(module.key)}
                                                />
                                            </Stack>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </Stack>
                    </Stack>
                </Box>
            </Drawer>

            <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Add a quote</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} marginTop={1}>
                        <TextField
                            select
                            label="Person"
                            SelectProps={{ displayEmpty: true }}
                            InputLabelProps={{ shrink: true }}
                            value={selectedPersonId}
                            onChange={(event) => {
                                const value = event.target.value;
                                setSelectedPersonId(value);
                                if (value !== "__new__") {
                                    setNewPersonMode("");
                                    setNewPersonName("");
                                }
                            }}
                        >
                            <MenuItem value="">
                                <em>Select a person</em>
                            </MenuItem>
                            {people.map((person) => (
                                <MenuItem key={person.$id} value={person.$id}>
                                    {person.name}
                                    {person.isPlaceholder ? " (placeholder)" : ""}
                                </MenuItem>
                            ))}
                            <MenuItem value="__new__">Add new user...</MenuItem>
                        </TextField>
                        {isAddingNewPerson && (
                            <Card variant="outlined">
                                <CardContent>
                                    <Stack spacing={2}>
                                        <Typography variant="subtitle1">Add a new person</Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Invite them to join, or create a placeholder you can claim later.
                                        </Typography>
                                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                                            <Button
                                                variant={newPersonMode === "invite" ? "contained" : "outlined"}
                                                onClick={() => setNewPersonMode("invite")}
                                            >
                                                Invite and wait
                                            </Button>
                                            <Button
                                                variant={newPersonMode === "placeholder" ? "contained" : "outlined"}
                                                onClick={() => setNewPersonMode("placeholder")}
                                            >
                                                Create placeholder
                                            </Button>
                                        </Stack>
                                        {newPersonMode === "invite" && (
                                            <Stack spacing={1}>
                                                <Typography variant="body2" color="text.secondary">
                                                    Copy an existing invite link from Settings. Once they join, you can
                                                    add quotes directly to their profile.
                                                </Typography>
                                                <Button
                                                    component={RouterLink}
                                                    to="/admin?tab=invites"
                                                    variant="text"
                                                >
                                                    Go to invites
                                                </Button>
                                            </Stack>
                                        )}
                                        {newPersonMode === "placeholder" && (
                                            <Stack spacing={1.5}>
                                                <Typography variant="body2" color="text.secondary">
                                                    Use this when you want to add quotes right now. They can claim
                                                    the placeholder later.
                                                </Typography>
                                                <TextField
                                                    label="Placeholder name"
                                                    value={newPersonName}
                                                    onChange={(event) => setNewPersonName(event.target.value)}
                                                />
                                                <Button
                                                    component={RouterLink}
                                                    to="/admin?tab=invites"
                                                    variant="text"
                                                >
                                                    Go to invites (optional)
                                                </Button>
                                            </Stack>
                                        )}
                                    </Stack>
                                </CardContent>
                            </Card>
                        )}
                        <TextField
                            label="Quote"
                            value={quoteText}
                            onChange={(event) => setQuoteText(event.target.value)}
                            multiline
                            rows={3}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddOpen(false)} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleAddQuote}
                        disabled={submitting || (isAddingNewPerson && newPersonMode !== "placeholder")}
                    >
                        Save quote
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={claimOpen} onClose={() => setClaimOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Claim your placeholder</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} marginTop={1}>
                        {claimablePlaceholders.length === 0 && (
                            <Typography variant="body2" color="text.secondary">
                                There are no placeholders created before you joined.
                            </Typography>
                        )}
                        {claimablePlaceholders.map((person) => (
                            <Card key={person.$id} variant="outlined">
                                <CardContent>
                                    <Stack spacing={1.5} direction={{ xs: "column", sm: "row" }} alignItems="center">
                                        <Box flex={1}>
                                            <Typography variant="subtitle1">{person.name}</Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Claiming will move all quotes onto your profile.
                                            </Typography>
                                        </Box>
                                        <Button
                                            variant="contained"
                                            onClick={() => handleClaimPlaceholder(person.$id)}
                                            disabled={submitting}
                                        >
                                            Claim
                                        </Button>
                                    </Stack>
                                </CardContent>
                            </Card>
                        ))}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setClaimOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default GroupView;
