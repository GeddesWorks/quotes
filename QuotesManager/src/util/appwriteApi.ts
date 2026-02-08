import {
    ID,
    Permission,
    Query,
    Role,
    account,
    appwriteConfig,
    appwriteConfigured,
    databases,
    functions
} from "./appwrite";
import type {
    GroupDoc,
    InviteDoc,
    MembershipDoc,
    MembershipRole,
    PersonDoc,
    QuoteDoc
} from "./appwriteTypes";

const requireConfig = () => {
    if (!appwriteConfigured) {
        throw new Error("Appwrite configuration is missing required IDs.");
    }
};

const isStrictPermissions = () => appwriteConfig.permissionMode === "strict";
const isRelaxedPermissions = () => appwriteConfig.permissionMode === "relaxed";

const callFunction = async <T>(action: string, payload: Record<string, unknown>) => {
    requireConfig();
    const execution = await functions.createExecution(
        appwriteConfig.functionId,
        JSON.stringify({ action, payload })
    );
    const executionData = execution as unknown as {
        responseBody?: string;
        status?: string;
        errors?: string;
    };
    const body = executionData.responseBody ?? "";
    if (body) {
        let parsed: { ok?: boolean; error?: string; data?: T };
        try {
            parsed = JSON.parse(body);
        } catch {
            throw new Error("Function returned invalid JSON.");
        }
        if (parsed.ok === false) {
            throw new Error(parsed.error || "Function failed.");
        }
        return parsed.data as T;
    }
    if (executionData.status === "failed") {
        throw new Error(executionData.errors || "Function execution failed.");
    }
    return null as T;
};

const callFunctionAsync = async (action: string, payload: Record<string, unknown>) => {
    requireConfig();
    await functions.createExecution(
        appwriteConfig.functionId,
        JSON.stringify({ action, payload }),
        true
    );
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTimeoutError = (error: unknown) => {
    if (!error || typeof error !== "object") {
        return false;
    }
    if ("code" in error && (error as { code?: number }).code === 408) {
        return true;
    }
    const message =
        "message" in error && typeof (error as { message?: unknown }).message === "string"
            ? (error as { message: string }).message
            : "";
    return (
        message.includes("Synchronous function execution timed out") ||
        message.includes("Error Code: 408") ||
        message.includes("code 408") ||
        message.includes("status 408")
    );
};

const nowIso = () => new Date().toISOString();

const unique = (values: string[]) => Array.from(new Set(values));

const buildReadPermissions = (userIds: string[]) =>
    unique(userIds).map((id) => Permission.read(Role.user(id)));

const buildUpdatePermissions = (userIds: string[]) =>
    unique(userIds).map((id) => Permission.update(Role.user(id)));

const buildDeletePermissions = (userIds: string[]) =>
    unique(userIds).map((id) => Permission.delete(Role.user(id)));

const mergePermissions = (...permissionSets: string[][]) =>
    permissionSets.flat().filter(Boolean);

const normalizePermissions = (permissions: string[]) =>
    Array.from(new Set(permissions)).sort();

const permissionsEqual = (a: string[], b: string[]) =>
    JSON.stringify(normalizePermissions(a)) === JSON.stringify(normalizePermissions(b));

const getCollections = () => appwriteConfig.collections;
const relaxedPermissions = () => [
    Permission.read(Role.users()),
    Permission.update(Role.users()),
    Permission.delete(Role.users())
];

const listAllDocuments = async <T>(
    collectionId: string,
    queries: string[]
): Promise<T[]> => {
    requireConfig();
    const docs: T[] = [];
    const limit = 100;
    let offset = 0;

    while (true) {
        const response = await databases.listDocuments(
            appwriteConfig.databaseId,
            collectionId,
            [...queries, Query.limit(limit), Query.offset(offset)]
        );
        docs.push(...(response.documents as T[]));
        if (response.documents.length < limit) {
            break;
        }
        offset += limit;
    }

    return docs;
};

const groupPermissions = (memberIds: string[], adminIds: string[], ownerId: string) =>
    isRelaxedPermissions()
        ? relaxedPermissions()
        : mergePermissions(
              buildReadPermissions(memberIds),
              buildUpdatePermissions(adminIds),
              buildDeletePermissions([ownerId])
          );

const membershipPermissions = (
    memberIds: string[],
    adminIds: string[],
    membershipUserId: string
) =>
    isRelaxedPermissions()
        ? relaxedPermissions()
        : mergePermissions(
              buildReadPermissions(memberIds),
              buildUpdatePermissions(unique([...adminIds, membershipUserId])),
              buildDeletePermissions(unique([...adminIds, membershipUserId]))
          );

const personPermissions = (
    memberIds: string[],
    adminIds: string[],
    isPlaceholder: boolean
) =>
    isRelaxedPermissions()
        ? relaxedPermissions()
        : mergePermissions(
              buildReadPermissions(memberIds),
              buildUpdatePermissions(memberIds),
              buildDeletePermissions(isPlaceholder ? memberIds : adminIds)
          );

const quotePermissions = (memberIds: string[], adminIds: string[]) =>
    isRelaxedPermissions()
        ? relaxedPermissions()
        : mergePermissions(
              buildReadPermissions(memberIds),
              buildUpdatePermissions(memberIds),
              buildDeletePermissions(adminIds)
          );

const invitePermissions = (adminIds: string[]) =>
    isRelaxedPermissions()
        ? relaxedPermissions()
        : mergePermissions(
              [Permission.read(Role.users())],
              buildUpdatePermissions(adminIds),
              buildDeletePermissions(adminIds)
          );

const randomInviteCode = (length = 8) => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const values = new Uint32Array(length);
    if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
        crypto.getRandomValues(values);
    } else {
        for (let i = 0; i < length; i += 1) {
            values[i] = Math.floor(Math.random() * alphabet.length);
        }
    }
    return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
};

const listInviteIds = async (groupId: string) => {
    try {
        const invites = await listInvites(groupId);
        return new Set(invites.map((invite) => invite.$id));
    } catch {
        return new Set<string>();
    }
};

const pollForNewInvite = async (groupId: string, knownIds: Set<string>) => {
    const maxAttempts = 12;
    let waitMs = 500;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await delay(waitMs);
        const invites = await listInvites(groupId);
        const found = invites.find((invite) => !knownIds.has(invite.$id));
        if (found) {
            return found;
        }
        waitMs = Math.min(waitMs + 250, 1500);
    }
    return null;
};

export const getCurrentUser = () => account.get();

export const listMembershipsByUser = (userId: string) =>
    listAllDocuments<MembershipDoc>(getCollections().memberships, [
        Query.equal("userId", userId)
    ]);

export const listGroupsByIds = async (groupIds: string[]) => {
    if (groupIds.length === 0) {
        return [] as GroupDoc[];
    }
    return listAllDocuments<GroupDoc>(getCollections().groups, [
        Query.equal("$id", groupIds)
    ]);
};

export const listGroupMembers = (groupId: string) =>
    listAllDocuments<MembershipDoc>(getCollections().memberships, [
        Query.equal("groupId", groupId),
        Query.orderAsc("displayName")
    ]);

export const listPeople = (groupId: string) =>
    listAllDocuments<PersonDoc>(getCollections().people, [
        Query.equal("groupId", groupId),
        Query.orderAsc("name")
    ]);

export const listQuotes = (groupId: string) =>
    listAllDocuments<QuoteDoc>(getCollections().quotes, [
        Query.equal("groupId", groupId),
        Query.orderDesc("createdAt")
    ]);

export const listInvites = (groupId: string) =>
    listAllDocuments<InviteDoc>(getCollections().invites, [
        Query.equal("groupId", groupId),
        Query.orderDesc("createdAt")
    ]);

export const createGroupWithOwner = async (name: string, userId: string, displayName: string) => {
    if (isStrictPermissions()) {
        return callFunction<{ group: GroupDoc; membership: MembershipDoc; person: PersonDoc }>(
            "createGroupWithOwner",
            { name, displayName }
        );
    }
    requireConfig();
    const groupId = ID.unique();
    const createdAt = nowIso();
    const memberIds = [userId];
    const adminIds = [userId];

    const group = await databases.createDocument<GroupDoc>(
        appwriteConfig.databaseId,
        getCollections().groups,
        groupId,
        {
            name,
            ownerId: userId,
            createdAt
        },
        groupPermissions(memberIds, adminIds, userId)
    );

    const person = await databases.createDocument<PersonDoc>(
        appwriteConfig.databaseId,
        getCollections().people,
        ID.unique(),
        {
            groupId,
            name: displayName,
            userId,
            isPlaceholder: false,
            createdAt,
            createdBy: userId
        },
        personPermissions(memberIds, adminIds, false)
    );

    const membership = await databases.createDocument<MembershipDoc>(
        appwriteConfig.databaseId,
        getCollections().memberships,
        ID.unique(),
        {
            groupId,
            groupName: name,
            userId,
            role: "owner",
            displayName,
            personId: person.$id,
            claimedPlaceholderId: "",
            claimedPlaceholderName: "",
            createdAt
        },
        membershipPermissions(memberIds, adminIds, userId)
    );

    await createInvite(groupId, name, adminIds, "General");

    return { group, membership, person };
};

export const createInvite = async (
    groupId: string,
    groupName: string,
    adminIds: string[],
    name = "General"
) => {
    if (isStrictPermissions()) {
        const knownIds = await listInviteIds(groupId);
        try {
            return await callFunction<InviteDoc>("createInvite", { groupId, groupName, name });
        } catch (error) {
            if (!isTimeoutError(error)) {
                throw error;
            }
            const completedInvite = await pollForNewInvite(groupId, knownIds);
            if (completedInvite) {
                return completedInvite;
            }
            await callFunctionAsync("createInvite", { groupId, groupName, name });
            const asyncInvite = await pollForNewInvite(groupId, knownIds);
            if (asyncInvite) {
                return asyncInvite;
            }
            throw new Error("Invite creation is taking longer than expected. Please refresh.");
        }
    }
    requireConfig();
    const createdAt = nowIso();
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const code = randomInviteCode();
        const existing = await databases.listDocuments(
            appwriteConfig.databaseId,
            getCollections().invites,
            [Query.equal("code", code), Query.limit(1)]
        );

        if (existing.total > 0) {
            continue;
        }

        return await databases.createDocument<InviteDoc>(
            appwriteConfig.databaseId,
            getCollections().invites,
            ID.unique(),
            {
                groupId,
                groupName,
                name,
                code,
                createdAt,
                createdBy: adminIds[0]
            },
            invitePermissions(adminIds)
        );
    }

    throw new Error("Could not generate a unique invite code.");
};

export const renameInvite = async (inviteId: string, name: string, groupId?: string) => {
    if (isStrictPermissions()) {
        await callFunction("renameInvite", { inviteId, name, groupId });
        return;
    }
    requireConfig();
    await databases.updateDocument(
        appwriteConfig.databaseId,
        getCollections().invites,
        inviteId,
        { name }
    );
};

export const deleteInvite = async (inviteId: string, groupId?: string) => {
    if (isStrictPermissions()) {
        await callFunction("deleteInvite", { inviteId, groupId });
        return;
    }
    requireConfig();
    await databases.deleteDocument(appwriteConfig.databaseId, getCollections().invites, inviteId);
};

export const joinGroupByCode = async (code: string, userId: string, displayName: string) => {
    if (isStrictPermissions()) {
        return callFunction<{ groupId: string; membership: MembershipDoc; person: PersonDoc | null }>(
            "joinGroupByCode",
            { code, displayName }
        );
    }
    requireConfig();
    const sanitizedCode = code.trim().toUpperCase();
    const inviteResults = await databases.listDocuments<InviteDoc>(
        appwriteConfig.databaseId,
        getCollections().invites,
        [Query.equal("code", sanitizedCode), Query.limit(1)]
    );

    const invite = inviteResults.documents[0];
    if (!invite) {
        throw new Error("Invite code is invalid.");
    }

    const groupId = invite.groupId;
    const groupName = invite.groupName || "Group";
    const createdAt = nowIso();

    const existingMemberships = await databases.listDocuments<MembershipDoc>(
        appwriteConfig.databaseId,
        getCollections().memberships,
        [
            Query.equal("groupId", groupId),
            Query.equal("userId", userId),
            Query.limit(1)
        ]
    );

    const existingMembership = existingMemberships.documents[0];
    if (existingMembership) {
        let existingPerson: PersonDoc | undefined;
        if (existingMembership.personId) {
            try {
                existingPerson = await databases.getDocument<PersonDoc>(
                    appwriteConfig.databaseId,
                    getCollections().people,
                    existingMembership.personId
                );
            } catch {
                existingPerson = undefined;
            }
        }
        return { groupId, membership: existingMembership, person: existingPerson };
    }

    const person = await databases.createDocument<PersonDoc>(
        appwriteConfig.databaseId,
        getCollections().people,
        ID.unique(),
        {
            groupId,
            name: displayName,
            userId,
            isPlaceholder: false,
            createdAt,
            createdBy: userId
        },
        personPermissions([userId, invite.createdBy], [invite.createdBy], false)
    );

    const membership = await databases.createDocument<MembershipDoc>(
        appwriteConfig.databaseId,
        getCollections().memberships,
        ID.unique(),
        {
            groupId,
            groupName,
            userId,
            role: "member",
            displayName,
            personId: person.$id,
            claimedPlaceholderId: "",
            claimedPlaceholderName: "",
            createdAt
        },
        membershipPermissions([userId, invite.createdBy], [invite.createdBy], userId)
    );

    return { groupId, membership, person };
};

export const createPlaceholderPerson = async (
    groupId: string,
    name: string,
    memberIds: string[],
    adminIds: string[],
    createdBy: string
) => {
    if (isStrictPermissions()) {
        return callFunction<PersonDoc>("createPlaceholderPerson", { groupId, name });
    }
    requireConfig();
    return await databases.createDocument<PersonDoc>(
        appwriteConfig.databaseId,
        getCollections().people,
        ID.unique(),
        {
            groupId,
            name,
            userId: "",
            isPlaceholder: true,
            createdAt: nowIso(),
            createdBy
        },
        personPermissions(memberIds, adminIds, true)
    );
};

export const createQuote = async (
    groupId: string,
    personId: string,
    text: string,
    createdBy: string,
    createdByName: string,
    memberIds: string[],
    adminIds: string[]
) => {
    if (isStrictPermissions()) {
        return callFunction<QuoteDoc>("createQuote", { groupId, personId, text, createdByName });
    }
    requireConfig();
    return await databases.createDocument<QuoteDoc>(
        appwriteConfig.databaseId,
        getCollections().quotes,
        ID.unique(),
        {
            groupId,
            personId,
            text,
            createdAt: nowIso(),
            createdBy,
            createdByName
        },
        quotePermissions(memberIds, adminIds)
    );
};

export const deleteQuote = async (groupId: string, quoteId: string) => {
    if (isStrictPermissions()) {
        await callFunction("deleteQuote", { groupId, quoteId });
        return;
    }
    requireConfig();
    await databases.deleteDocument(appwriteConfig.databaseId, getCollections().quotes, quoteId);
};

export const claimPlaceholder = async (
    placeholderId: string,
    membership: MembershipDoc,
    groupId: string
) => {
    if (isStrictPermissions()) {
        await callFunction("claimPlaceholder", { groupId, placeholderId });
        return;
    }
    requireConfig();
    const freshMembership = await databases.getDocument<MembershipDoc>(
        appwriteConfig.databaseId,
        getCollections().memberships,
        membership.$id
    );
    if (!freshMembership.personId) {
        throw new Error("Missing member profile for claim.");
    }
    if (freshMembership.claimedPlaceholderId) {
        throw new Error("You have already claimed a placeholder.");
    }
    const placeholder = await databases.getDocument<PersonDoc>(
        appwriteConfig.databaseId,
        getCollections().people,
        placeholderId
    );
    if (placeholder.groupId !== groupId || !placeholder.isPlaceholder) {
        throw new Error("That placeholder cannot be claimed.");
    }

    const quotes = await listAllDocuments<QuoteDoc>(getCollections().quotes, [
        Query.equal("groupId", groupId),
        Query.equal("personId", placeholderId)
    ]);

    for (const quote of quotes) {
        await databases.updateDocument(
            appwriteConfig.databaseId,
            getCollections().quotes,
            quote.$id,
            { personId: freshMembership.personId, sourcePlaceholderId: placeholderId }
        );
    }

    await databases.deleteDocument(
        appwriteConfig.databaseId,
        getCollections().people,
        placeholderId
    );

    await databases.updateDocument<MembershipDoc>(
        appwriteConfig.databaseId,
        getCollections().memberships,
        freshMembership.$id,
        {
            claimedPlaceholderId: placeholderId,
            claimedPlaceholderName: placeholder.name
        }
    );
};

export const unclaimPlaceholder = async (
    membership: MembershipDoc,
    groupId: string,
    memberIds: string[],
    adminIds: string[],
    createdBy: string
) => {
    if (isStrictPermissions()) {
        await callFunction("unclaimPlaceholder", { groupId });
        return;
    }
    requireConfig();
    const freshMembership = await databases.getDocument<MembershipDoc>(
        appwriteConfig.databaseId,
        getCollections().memberships,
        membership.$id
    );
    if (!freshMembership.personId) {
        throw new Error("Missing member profile for unclaim.");
    }
    if (!freshMembership.claimedPlaceholderId) {
        throw new Error("No placeholder claimed yet.");
    }

    const placeholder = await databases.createDocument<PersonDoc>(
        appwriteConfig.databaseId,
        getCollections().people,
        ID.unique(),
        {
            groupId,
            name: freshMembership.claimedPlaceholderName || "Placeholder",
            userId: "",
            isPlaceholder: true,
            createdAt: nowIso(),
            createdBy
        },
        personPermissions(memberIds, adminIds, true)
    );

    const claimedQuotes = await listAllDocuments<QuoteDoc>(getCollections().quotes, [
        Query.equal("groupId", groupId),
        Query.equal("sourcePlaceholderId", freshMembership.claimedPlaceholderId)
    ]);

    for (const quote of claimedQuotes) {
        await databases.updateDocument(
            appwriteConfig.databaseId,
            getCollections().quotes,
            quote.$id,
            { personId: placeholder.$id }
        );
    }

    await databases.updateDocument<MembershipDoc>(
        appwriteConfig.databaseId,
        getCollections().memberships,
        freshMembership.$id,
        {
            claimedPlaceholderId: "",
            claimedPlaceholderName: ""
        }
    );

    return placeholder;
};

export const updateMemberRole = async (
    membershipId: string,
    newRole: MembershipRole,
    groupId?: string
) => {
    if (isStrictPermissions()) {
        await callFunction("updateMemberRole", { membershipId, newRole, groupId });
        return null as unknown as MembershipDoc;
    }
    requireConfig();
    return await databases.updateDocument<MembershipDoc>(
        appwriteConfig.databaseId,
        getCollections().memberships,
        membershipId,
        { role: newRole }
    );
};

export const removeMember = async (membership: MembershipDoc) => {
    if (isStrictPermissions()) {
        await callFunction("removeMember", { membershipId: membership.$id, groupId: membership.groupId });
        return;
    }
    requireConfig();
    if (membership.personId) {
        const quoteCheck = await databases.listDocuments(
            appwriteConfig.databaseId,
            getCollections().quotes,
            [
                Query.equal("groupId", membership.groupId),
                Query.equal("personId", membership.personId),
                Query.limit(1)
            ]
        );
        if (quoteCheck.total > 0) {
            await databases.updateDocument(
                appwriteConfig.databaseId,
                getCollections().people,
                membership.personId,
                {
                    userId: "",
                    isPlaceholder: true
                }
            );
        } else {
            await databases.deleteDocument(
                appwriteConfig.databaseId,
                getCollections().people,
                membership.personId
            );
        }
    }

    await databases.deleteDocument(
        appwriteConfig.databaseId,
        getCollections().memberships,
        membership.$id
    );
};

export const removePerson = async (groupId: string, personId: string, force = false) => {
    if (isStrictPermissions()) {
        await callFunction("removePerson", { groupId, personId, force });
        return;
    }
    requireConfig();
    const person = await databases.getDocument<PersonDoc>(
        appwriteConfig.databaseId,
        getCollections().people,
        personId
    );
    if (person.groupId !== groupId) {
        throw new Error("Person does not belong to this group.");
    }
    if (!person.isPlaceholder) {
        throw new Error("Only placeholders can be removed here.");
    }
    const quoteCheck = await databases.listDocuments(
        appwriteConfig.databaseId,
        getCollections().quotes,
        [Query.equal("groupId", groupId), Query.equal("personId", personId), Query.limit(1)]
    );
    if (quoteCheck.total > 0 && !force) {
        throw new Error("Placeholder has quotes. Confirm removal to delete them.");
    }
    if (quoteCheck.total > 0) {
        const quotes = await listAllDocuments<QuoteDoc>(getCollections().quotes, [
            Query.equal("groupId", groupId),
            Query.equal("personId", personId)
        ]);
        for (const quote of quotes) {
            await databases.deleteDocument(
                appwriteConfig.databaseId,
                getCollections().quotes,
                quote.$id
            );
        }
    }
    await databases.deleteDocument(appwriteConfig.databaseId, getCollections().people, personId);
};

export const syncGroupPermissions = async (groupId: string) => {
    requireConfig();
    if (isStrictPermissions()) {
        return await callFunction<{ memberIds: string[]; adminIds: string[]; ownerId: string }>(
            "syncGroupPermissions",
            { groupId }
        );
    }
    if (isRelaxedPermissions()) {
        return { memberIds: [], adminIds: [], ownerId: "" };
    }
    const memberships = await listGroupMembers(groupId);
    const memberIds = memberships.map((member) => member.userId);
    const adminIds = memberships
        .filter((member) => member.role !== "member")
        .map((member) => member.userId);
    const owner = memberships.find((member) => member.role === "owner");
    const ownerId = owner?.userId ?? adminIds[0];

    const groupDoc = await databases.getDocument<GroupDoc>(
        appwriteConfig.databaseId,
        getCollections().groups,
        groupId
    );

    const desiredGroupPermissions = groupPermissions(memberIds, adminIds, ownerId || adminIds[0]);
    if (!permissionsEqual(groupDoc.$permissions ?? [], desiredGroupPermissions)) {
        await databases.updateDocument<GroupDoc>(
            appwriteConfig.databaseId,
            getCollections().groups,
            groupId,
            {},
            desiredGroupPermissions
        );
    }

    const membershipDocs = await listGroupMembers(groupId);
    for (const membership of membershipDocs) {
        const desired = membershipPermissions(memberIds, adminIds, membership.userId);
        if (!permissionsEqual(membership.$permissions ?? [], desired)) {
            await databases.updateDocument<MembershipDoc>(
                appwriteConfig.databaseId,
                getCollections().memberships,
                membership.$id,
                {},
                desired
            );
        }
    }

    const peopleDocs = await listPeople(groupId);
    for (const person of peopleDocs) {
        const desired = personPermissions(memberIds, adminIds, person.isPlaceholder);
        if (!permissionsEqual(person.$permissions ?? [], desired)) {
            await databases.updateDocument<PersonDoc>(
                appwriteConfig.databaseId,
                getCollections().people,
                person.$id,
                {},
                desired
            );
        }
    }

    const quoteDocs = await listQuotes(groupId);
    for (const quote of quoteDocs) {
        const desired = quotePermissions(memberIds, adminIds);
        if (!permissionsEqual(quote.$permissions ?? [], desired)) {
            await databases.updateDocument<QuoteDoc>(
                appwriteConfig.databaseId,
                getCollections().quotes,
                quote.$id,
                {},
                desired
            );
        }
    }

    const inviteDocs = await listInvites(groupId);
    for (const invite of inviteDocs) {
        const desired = invitePermissions(adminIds);
        if (!permissionsEqual(invite.$permissions ?? [], desired)) {
            await databases.updateDocument<InviteDoc>(
                appwriteConfig.databaseId,
                getCollections().invites,
                invite.$id,
                {},
                desired
            );
        }
    }

    return { memberIds, adminIds, ownerId };
};

export const transferOwnership = async (
    groupId: string,
    currentOwnerMembership: MembershipDoc,
    nextOwnerMembership: MembershipDoc
) => {
    if (isStrictPermissions()) {
        await callFunction("transferOwnership", {
            groupId,
            currentOwnerMembershipId: currentOwnerMembership.$id,
            nextOwnerMembershipId: nextOwnerMembership.$id
        });
        return { memberIds: [], adminIds: [], ownerId: nextOwnerMembership.userId };
    }
    requireConfig();
    await databases.updateDocument(
        appwriteConfig.databaseId,
        getCollections().groups,
        groupId,
        { ownerId: nextOwnerMembership.userId }
    );

    await updateMemberRole(currentOwnerMembership.$id, "admin");
    await updateMemberRole(nextOwnerMembership.$id, "owner");

    return syncGroupPermissions(groupId);
};
