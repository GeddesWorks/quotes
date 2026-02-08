import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import {
    createGroupWithOwner,
    joinGroupByCode,
    listGroupsByIds,
    listMembershipsByUser
} from "../util/appwriteApi";
import type { MembershipDoc } from "../util/appwriteTypes";

interface GroupSummary {
    $id: string;
    name: string;
    ownerId?: string;
    createdAt?: string;
}

interface GroupContextValue {
    memberships: MembershipDoc[];
    groups: GroupSummary[];
    activeGroupId: string | null;
    activeGroup: GroupSummary | null;
    activeMembership: MembershipDoc | null;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<{
        memberships: MembershipDoc[];
        groups: GroupSummary[];
        activeGroupId: string | null;
        ok: boolean;
    }>;
    setActiveGroupId: (groupId: string) => void;
    createGroup: (name: string) => Promise<void>;
    joinGroup: (code: string) => Promise<void>;
}

const GroupContext = createContext<GroupContextValue | undefined>(undefined);

const ACTIVE_GROUP_KEY = "qm_active_group";
const PENDING_INVITE_KEY = "qm_pending_invite";

export const GroupProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [memberships, setMemberships] = useState<MembershipDoc[]>([]);
    const [groups, setGroups] = useState<GroupSummary[]>([]);
    const [activeGroupId, setActiveGroupIdState] = useState<string | null>(
        localStorage.getItem(ACTIVE_GROUP_KEY)
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!user) {
            setMemberships([]);
            setGroups([]);
            setActiveGroupIdState(null);
            localStorage.removeItem(ACTIVE_GROUP_KEY);
            return { memberships: [], groups: [], activeGroupId: null, ok: true };
        }

        setLoading(true);
        setError(null);
        try {
            const fetchedMemberships = await listMembershipsByUser(user.$id);
            const groupIds = fetchedMemberships.map((membership) => membership.groupId);
            const fetchedGroups = await listGroupsByIds(groupIds);
            const groupMap = new Map(fetchedGroups.map((group) => [group.$id, group]));
            const hydratedGroups: GroupSummary[] = fetchedMemberships.map((membership) => {
                const stored = groupMap.get(membership.groupId);
                if (stored) {
                    return stored;
                }
                return {
                    $id: membership.groupId,
                    name: membership.groupName,
                    createdAt: membership.createdAt
                };
            });

            setMemberships(fetchedMemberships);
            setGroups(hydratedGroups);

            if (fetchedMemberships.length === 0) {
                setActiveGroupIdState(null);
                localStorage.removeItem(ACTIVE_GROUP_KEY);
                return {
                    memberships: fetchedMemberships,
                    groups: hydratedGroups,
                    activeGroupId: null,
                    ok: true
                };
            } else {
                const stored = localStorage.getItem(ACTIVE_GROUP_KEY);
                const candidates = [activeGroupId, stored].filter(Boolean) as string[];
                const preferred = candidates.find((id) =>
                    fetchedMemberships.some((m) => m.groupId === id)
                );
                const nextGroupId = preferred ?? fetchedMemberships[0].groupId;
                setActiveGroupIdState(nextGroupId);
                localStorage.setItem(ACTIVE_GROUP_KEY, nextGroupId);
                return {
                    memberships: fetchedMemberships,
                    groups: hydratedGroups,
                    activeGroupId: nextGroupId,
                    ok: true
                };
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load groups.");
            return { memberships: [], groups: [], activeGroupId: null, ok: false };
        } finally {
            setLoading(false);
        }
    }, [activeGroupId, user]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const setActiveGroupId = useCallback((groupId: string) => {
        setActiveGroupIdState(groupId);
        localStorage.setItem(ACTIVE_GROUP_KEY, groupId);
    }, []);

    const createGroup = useCallback(async (name: string) => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const displayName = user.name || user.email || "Owner";
            await createGroupWithOwner(name, user.$id, displayName);
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create group.");
        } finally {
            setLoading(false);
        }
    }, [user, refresh]);

    const joinGroup = useCallback(async (code: string) => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const displayName = user.name || user.email || "Member";
            const result = await joinGroupByCode(code, user.$id, displayName);
            await refresh();
            if (result?.groupId) {
                setActiveGroupId(result.groupId);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to join group.");
        } finally {
            setLoading(false);
        }
    }, [user, refresh, setActiveGroupId]);

    useEffect(() => {
        const pendingCode = localStorage.getItem(PENDING_INVITE_KEY);
        if (!user || !pendingCode) {
            return;
        }

        joinGroup(pendingCode).finally(() => {
            localStorage.removeItem(PENDING_INVITE_KEY);
        });
    }, [user, joinGroup]);

    const activeMembership = memberships.find((membership) => membership.groupId === activeGroupId) || null;
    const activeGroup = groups.find((group) => group.$id === activeGroupId) || null;

    const value = useMemo(
        () => ({
            memberships,
            groups,
            activeGroupId,
            activeGroup,
            activeMembership,
            loading,
            error,
            refresh,
            setActiveGroupId,
            createGroup,
            joinGroup
        }),
        [
            memberships,
            groups,
            activeGroupId,
            activeGroup,
            activeMembership,
            loading,
            error,
            refresh,
            setActiveGroupId,
            createGroup,
            joinGroup
        ]
    );

    return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
};

export const useGroups = () => {
    const context = useContext(GroupContext);
    if (!context) {
        throw new Error("useGroups must be used within GroupProvider.");
    }
    return context;
};

export const setPendingInviteCode = (code: string) => {
    localStorage.setItem(PENDING_INVITE_KEY, code.trim().toUpperCase());
};
