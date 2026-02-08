import {
    AppBar,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    IconButton,
    InputLabel,
    List,
    ListItemButton,
    ListItemText,
    Drawer,
    MenuItem,
    Select,
    Stack,
    Toolbar,
    TextField,
    Typography,
    useMediaQuery
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useState } from "react";
import { Link as RouterLink, Outlet, useLocation } from "react-router-dom";
import CloseIcon from "@mui/icons-material/Close";
import MenuIcon from "@mui/icons-material/Menu";
import { useAuth } from "../contexts/AuthContext";
import { useGroups } from "../contexts/GroupContext";
import { useThemeMode } from "../contexts/ThemeModeContext";
import { joinGroupByCode } from "../util/appwriteApi";
import CreateGroupDialog from "./CreateGroupDialog";

const AppShell = () => {
    const theme = useTheme();
    const location = useLocation();
    const { user, signOut } = useAuth();
    const { groups, activeGroupId, setActiveGroupId, createGroup, activeMembership, refresh } = useGroups();
    const { preference, setPreference } = useThemeMode();
    const [createOpen, setCreateOpen] = useState(false);
    const [joinOpen, setJoinOpen] = useState(false);
    const [joinCode, setJoinCode] = useState("");
    const [joinError, setJoinError] = useState<string | null>(null);
    const [joining, setJoining] = useState(false);
    const [installOpen, setInstallOpen] = useState(false);
    const [navOpen, setNavOpen] = useState(false);
    const isAdmin = activeMembership?.role === "owner" || activeMembership?.role === "admin";
    const onAdminRoute = location.pathname.startsWith("/admin");
    const adminLabel = isAdmin ? "Admin" : "Settings";
    const joinOptionValue = "__join_group__";
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isIOS =
        typeof navigator !== "undefined" &&
        (/iPad|iPhone|iPod/i.test(ua) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    const isAndroid = /Android/i.test(ua);
    const isMobile = isIOS || isAndroid || /Mobi/i.test(ua);
    const isCompactNav = useMediaQuery(theme.breakpoints.down("md"));
    const activeGroupName = groups.find((group) => group.$id === activeGroupId)?.name ?? "No group";

    const handleJoinGroup = async () => {
        if (!user) {
            setJoinError("Sign in to join a group.");
            return;
        }
        if (!joinCode.trim()) {
            setJoinError("Enter a join code.");
            return;
        }
        setJoining(true);
        setJoinError(null);
        try {
            const displayName = user.name || user.email || "Member";
            const result = await joinGroupByCode(joinCode.trim(), user.$id, displayName);
            await refresh();
            if (result?.groupId) {
                setActiveGroupId(result.groupId);
            }
            setJoinOpen(false);
            setJoinCode("");
        } catch (err) {
            setJoinError(err instanceof Error ? err.message : "Failed to join group.");
        } finally {
            setJoining(false);
        }
    };

    return (
        <Box display="flex" flexDirection="column" minHeight="100vh">
            <AppBar
                position="sticky"
                elevation={0}
                sx={{
                    backdropFilter: "blur(12px)",
                    backgroundColor: alpha(theme.palette.background.paper, 0.82),
                    borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`
                }}
            >
                <Toolbar sx={{ gap: { xs: 1.5, md: 3 }, flexWrap: { xs: "nowrap", md: "wrap" } }}>
                    {isCompactNav ? (
                        <>
                            <IconButton
                                edge="start"
                                color="inherit"
                                aria-label="Open navigation menu"
                                onClick={() => setNavOpen(true)}
                            >
                                <MenuIcon />
                            </IconButton>
                            <Box
                                sx={{
                                    flex: 1,
                                    minWidth: 0,
                                    display: "flex",
                                    alignItems: "baseline",
                                    flexWrap: "wrap",
                                    columnGap: 1,
                                    rowGap: 0.5
                                }}
                            >
                                <Typography
                                    variant="h6"
                                    sx={{ fontWeight: 700, color: "text.primary", whiteSpace: "nowrap" }}
                                >
                                    Quotes Manager
                                </Typography>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ marginLeft: "auto", textAlign: "right", fontWeight: 600 }}
                                >
                                    {activeGroupName}
                                </Typography>
                            </Box>
                        </>
                    ) : (
                        <>
                            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                                <Typography variant="h6" sx={{ fontWeight: 700, color: "text.primary" }}>
                                    Quotes Manager
                                </Typography>
                                <Stack direction="row" spacing={1}>
                                    <Button
                                        component={RouterLink}
                                        to="/"
                                        variant={onAdminRoute ? "text" : "contained"}
                                    >
                                        View
                                    </Button>
                                    <Button
                                        component={RouterLink}
                                        to="/admin"
                                        variant={onAdminRoute ? "contained" : "text"}
                                    >
                                        {adminLabel}
                                    </Button>
                                </Stack>
                                <FormControl size="small" sx={{ minWidth: 220 }} disabled={!user}>
                                    <InputLabel id="group-select">Group</InputLabel>
                                    <Select
                                        labelId="group-select"
                                        value={activeGroupId ?? ""}
                                        label="Group"
                                        onChange={(event) => {
                                            const next = String(event.target.value);
                                            if (next === joinOptionValue) {
                                                setJoinError(null);
                                                setJoinCode("");
                                                setJoinOpen(true);
                                                return;
                                            }
                                            if (next) {
                                                setActiveGroupId(next);
                                            }
                                        }}
                                    >
                                        {groups.map((group) => (
                                            <MenuItem key={group.$id} value={group.$id}>
                                                {group.name}
                                            </MenuItem>
                                        ))}
                                        <Divider />
                                        <MenuItem value={joinOptionValue}>Join group...</MenuItem>
                                    </Select>
                                </FormControl>
                                <Button variant="outlined" onClick={() => setCreateOpen(true)}>
                                    Create group
                                </Button>
                            </Stack>
                            <Box flexGrow={1} />
                            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                                <FormControl size="small" sx={{ minWidth: 140 }}>
                                    <InputLabel id="theme-select">Theme</InputLabel>
                                    <Select
                                        labelId="theme-select"
                                        value={preference}
                                        label="Theme"
                                        onChange={(event) =>
                                            setPreference(
                                                event.target.value as "system" | "light" | "dark"
                                            )
                                        }
                                    >
                                        <MenuItem value="system">System</MenuItem>
                                        <MenuItem value="light">Light</MenuItem>
                                        <MenuItem value="dark">Dark</MenuItem>
                                    </Select>
                                </FormControl>
                                {isMobile && (
                                    <Button variant="outlined" onClick={() => setInstallOpen(true)}>
                                        Add as app
                                    </Button>
                                )}
                                <Typography variant="body2" color="text.secondary">
                                    {user?.name || user?.email}
                                </Typography>
                                <Button color="secondary" variant="contained" onClick={signOut}>
                                    Sign out
                                </Button>
                            </Stack>
                        </>
                    )}
                </Toolbar>
            </AppBar>
            <Box component="main" sx={{ flex: 1, px: { xs: 2, md: 6 }, py: 4 }}>
                <Outlet />
            </Box>
            <Drawer
                anchor="left"
                open={navOpen}
                onClose={() => setNavOpen(false)}
                PaperProps={{ sx: { width: { xs: "82vw", sm: 360 } } }}
            >
                <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            Menu
                        </Typography>
                        <IconButton aria-label="Close navigation menu" onClick={() => setNavOpen(false)}>
                            <CloseIcon />
                        </IconButton>
                    </Stack>
                    <List disablePadding>
                        <ListItemButton
                            component={RouterLink}
                            to="/"
                            selected={!onAdminRoute}
                            onClick={() => setNavOpen(false)}
                        >
                            <ListItemText primary="View" />
                        </ListItemButton>
                        <ListItemButton
                            component={RouterLink}
                            to="/admin"
                            selected={onAdminRoute}
                            onClick={() => setNavOpen(false)}
                        >
                            <ListItemText primary={adminLabel} />
                        </ListItemButton>
                    </List>
                    <Divider />
                    <FormControl size="small" disabled={!user} fullWidth>
                        <InputLabel id="group-select-drawer">Group</InputLabel>
                        <Select
                            labelId="group-select-drawer"
                            value={activeGroupId ?? ""}
                            label="Group"
                            onChange={(event) => {
                                const next = String(event.target.value);
                                if (next === joinOptionValue) {
                                    setJoinError(null);
                                    setJoinCode("");
                                    setJoinOpen(true);
                                    return;
                                }
                                if (next) {
                                    setActiveGroupId(next);
                                    setNavOpen(false);
                                }
                            }}
                        >
                            {groups.map((group) => (
                                <MenuItem key={group.$id} value={group.$id}>
                                    {group.name}
                                </MenuItem>
                            ))}
                            <Divider />
                            <MenuItem value={joinOptionValue}>Join group...</MenuItem>
                        </Select>
                    </FormControl>
                    <Stack spacing={1.5}>
                        <Button
                            variant="outlined"
                            onClick={() => {
                                setCreateOpen(true);
                                setNavOpen(false);
                            }}
                        >
                            Create group
                        </Button>
                        <Button
                            variant="text"
                            onClick={() => {
                                setJoinError(null);
                                setJoinCode("");
                                setJoinOpen(true);
                                setNavOpen(false);
                            }}
                        >
                            Join group
                        </Button>
                    </Stack>
                    <Divider />
                    <FormControl size="small" fullWidth>
                        <InputLabel id="theme-select-drawer">Theme</InputLabel>
                        <Select
                            labelId="theme-select-drawer"
                            value={preference}
                            label="Theme"
                            onChange={(event) =>
                                setPreference(event.target.value as "system" | "light" | "dark")
                            }
                        >
                            <MenuItem value="system">System</MenuItem>
                            <MenuItem value="light">Light</MenuItem>
                            <MenuItem value="dark">Dark</MenuItem>
                        </Select>
                    </FormControl>
                    {isMobile && (
                        <Button variant="outlined" onClick={() => setInstallOpen(true)}>
                            Add as app
                        </Button>
                    )}
                    <Divider />
                    <Stack spacing={1}>
                        <Typography variant="body2" color="text.secondary">
                            {user?.name || user?.email}
                        </Typography>
                        <Button color="secondary" variant="contained" onClick={signOut}>
                            Sign out
                        </Button>
                    </Stack>
                </Box>
            </Drawer>
            <CreateGroupDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreate={createGroup}
            />
            <Dialog
                open={joinOpen}
                onClose={() => {
                    setJoinOpen(false);
                    setJoinError(null);
                }}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>Join a group</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} marginTop={1}>
                        <Typography variant="body2" color="text.secondary">
                            Paste an invite code to join an existing group.
                        </Typography>
                        <TextField
                            label="Join code"
                            value={joinCode}
                            onChange={(event) => setJoinCode(event.target.value)}
                            error={Boolean(joinError)}
                            helperText={joinError ?? " "}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setJoinOpen(false)} disabled={joining}>
                        Cancel
                    </Button>
                    <Button variant="contained" onClick={handleJoinGroup} disabled={joining}>
                        Join group
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog open={installOpen} onClose={() => setInstallOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Add Quotes Manager to your home screen</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} marginTop={1}>
                        {isIOS && (
                            <>
                                <Typography variant="subtitle1">iPhone / iPad (Safari)</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    1. Open this page in Safari.
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    2. Tap the Share button (square with an up arrow).
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    3. Choose “Add to Home Screen”.
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    4. Rename if you want, then tap “Add”.
                                </Typography>
                            </>
                        )}
                        {isAndroid && (
                            <>
                                <Typography variant="subtitle1">Android (Chrome / Edge)</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    1. Tap the menu (three dots).
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    2. Tap “Add to Home screen” or “Install app”.
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    3. Confirm to add it.
                                </Typography>
                            </>
                        )}
                        {!isIOS && !isAndroid && (
                            <>
                                <Typography variant="subtitle1">Mobile browser</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Open the browser menu or share menu and choose “Add to Home screen”.
                                </Typography>
                            </>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setInstallOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default AppShell;
