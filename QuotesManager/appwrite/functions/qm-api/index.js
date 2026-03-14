import { Client, Databases, ID, Permission, Query, Role } from "node-appwrite";

const requireEnv = (key, fallback) => {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

const getConfig = () => {
  const endpoint = requireEnv("APPWRITE_ENDPOINT", process.env.APPWRITE_FUNCTION_API_ENDPOINT);
  const projectId = requireEnv("APPWRITE_PROJECT_ID", process.env.APPWRITE_FUNCTION_PROJECT_ID);
  const apiKey = requireEnv("APPWRITE_API_KEY", process.env.APPWRITE_FUNCTION_API_KEY);
  const databaseId = requireEnv("APPWRITE_DATABASE_ID", "");
  return {
    endpoint,
    projectId,
    apiKey,
    databaseId,
    collections: {
      groups: requireEnv("APPWRITE_COLLECTION_GROUPS_ID", ""),
      memberships: requireEnv("APPWRITE_COLLECTION_MEMBERSHIPS_ID", ""),
      people: requireEnv("APPWRITE_COLLECTION_PEOPLE_ID", ""),
      quotes: requireEnv("APPWRITE_COLLECTION_QUOTES_ID", ""),
      invites: requireEnv("APPWRITE_COLLECTION_INVITES_ID", "")
    }
  };
};

const nowIso = () => new Date().toISOString();
const unique = (values) => Array.from(new Set(values.filter(Boolean)));
const normalizeAllowWord = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
const normalizeAllowWords = (values) =>
  unique(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeAllowWord(value))
      .filter((value) => /^[a-z0-9][a-z0-9'-]{0,31}$/.test(value))
  ).slice(0, 300);

const buildReadPermissions = (userIds) => unique(userIds).map((id) => Permission.read(Role.user(id)));
const buildUpdatePermissions = (userIds) => unique(userIds).map((id) => Permission.update(Role.user(id)));
const buildDeletePermissions = (userIds) => unique(userIds).map((id) => Permission.delete(Role.user(id)));

const mergePermissions = (...permissionSets) => permissionSets.flat().filter(Boolean);

const normalizePermissions = (permissions) => Array.from(new Set(permissions)).sort();

const permissionsEqual = (a, b) => {
  const left = normalizePermissions(a || []);
  const right = normalizePermissions(b || []);
  return JSON.stringify(left) === JSON.stringify(right);
};

const groupPermissions = (memberIds, adminIds, ownerId) =>
  mergePermissions(
    buildReadPermissions(memberIds),
    buildUpdatePermissions(adminIds),
    buildDeletePermissions([ownerId])
  );

const membershipPermissions = (memberIds, adminIds, membershipUserId) =>
  mergePermissions(
    buildReadPermissions(memberIds),
    buildUpdatePermissions(unique([...adminIds, membershipUserId])),
    buildDeletePermissions(unique([...adminIds, membershipUserId]))
  );

const personPermissions = (memberIds, adminIds, isPlaceholder) =>
  mergePermissions(
    buildReadPermissions(memberIds),
    buildUpdatePermissions(memberIds),
    buildDeletePermissions(isPlaceholder ? memberIds : adminIds)
  );

const quotePermissions = (memberIds, adminIds) =>
  mergePermissions(
    buildReadPermissions(memberIds),
    buildUpdatePermissions(memberIds),
    buildDeletePermissions(adminIds)
  );

const invitePermissions = (adminIds) =>
  mergePermissions(
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

const hashToken = (value) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const buildMemberKey = (groupId, userId) =>
  `${hashToken(groupId)}${hashToken(userId)}${hashToken(`${groupId}:${userId}`)}`;

const getMembershipDocId = (groupId, userId) => `member_${buildMemberKey(groupId, userId)}`;
const getMemberPersonDocId = (groupId, userId) => `person_${buildMemberKey(groupId, userId)}`;

const getErrorCode = (error) => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return 0;
  }
  const code = error.code;
  return typeof code === "number" ? code : Number(code) || 0;
};

const getErrorMessage = (error) => {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return "";
  }
  return typeof error.message === "string" ? error.message : "";
};

const isConflictError = (error) => {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();
  return code === 409 || message.includes("already exists") || message.includes("duplicate");
};

const isNotFoundError = (error) => getErrorCode(error) === 404;

const listMemberPeopleByUser = async (databases, config, groupId, userId) => {
  const people = await listAllDocuments(databases, config.databaseId, config.collections.people, [
    Query.equal("groupId", groupId)
  ]);
  return people
    .filter((person) => !person.isPlaceholder && person.userId === userId)
    .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")));
};

const movePersonReferences = async (databases, config, groupId, fromPersonId, toPersonId) => {
  if (!fromPersonId || !toPersonId || fromPersonId === toPersonId) {
    return;
  }

  const quoteDocs = await listAllDocuments(databases, config.databaseId, config.collections.quotes, [
    Query.equal("groupId", groupId),
    Query.equal("personId", fromPersonId)
  ]);

  for (const quote of quoteDocs) {
    await databases.updateDocument(
      config.databaseId,
      config.collections.quotes,
      quote.$id,
      { personId: toPersonId }
    );
  }

  const membershipDocs = await listAllDocuments(databases, config.databaseId, config.collections.memberships, [
    Query.equal("groupId", groupId)
  ]);

  for (const membership of membershipDocs) {
    if (membership.personId !== fromPersonId) {
      continue;
    }
    await databases.updateDocument(
      config.databaseId,
      config.collections.memberships,
      membership.$id,
      { personId: toPersonId }
    );
  }
};

const pickCanonicalPerson = (people, preferredPersonId, deterministicPersonId) => {
  if (preferredPersonId) {
    const preferred = people.find((person) => person.$id === preferredPersonId);
    if (preferred) {
      return preferred;
    }
  }
  const deterministic = people.find((person) => person.$id === deterministicPersonId);
  if (deterministic) {
    return deterministic;
  }
  return people[0] || null;
};

const ensureSingleMemberPerson = async (
  databases,
  config,
  { groupId, userId, displayName, createdBy, memberIds, adminIds, preferredPersonId = "" }
) => {
  const deterministicPersonId = getMemberPersonDocId(groupId, userId);
  let people = await listMemberPeopleByUser(databases, config, groupId, userId);

  if (people.length === 0) {
    try {
      const created = await databases.createDocument(
        config.databaseId,
        config.collections.people,
        deterministicPersonId,
        {
          groupId,
          name: displayName,
          userId,
          isPlaceholder: false,
          createdAt: nowIso(),
          createdBy
        },
        personPermissions(memberIds, adminIds, false)
      );
      people = [created];
    } catch (err) {
      if (!isConflictError(err)) {
        throw err;
      }
      try {
        const existing = await databases.getDocument(
          config.databaseId,
          config.collections.people,
          deterministicPersonId
        );
        people = [existing];
      } catch (readErr) {
        if (!isNotFoundError(readErr)) {
          throw readErr;
        }
        people = await listMemberPeopleByUser(databases, config, groupId, userId);
      }
    }
  }

  const canonical = pickCanonicalPerson(people, preferredPersonId, deterministicPersonId);
  if (!canonical) {
    throw new Error("Could not resolve member profile.");
  }

  for (const person of people) {
    if (person.$id === canonical.$id) {
      continue;
    }
    await movePersonReferences(databases, config, groupId, person.$id, canonical.$id);
    try {
      await databases.deleteDocument(config.databaseId, config.collections.people, person.$id);
    } catch (err) {
      if (!isNotFoundError(err)) {
        throw err;
      }
    }
  }

  return canonical;
};

const createInviteDocument = async (
  databases,
  config,
  { groupId, groupName, createdBy, adminIds, name }
) => {
  const createdAt = nowIso();
  const maxAttempts = 5;
  const trimmedName = String(name || "General").trim() || "General";

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = randomInviteCode();
    const existing = await databases.listDocuments(config.databaseId, config.collections.invites, [
      Query.equal("code", code),
      Query.limit(1)
    ]);
    if (existing.total > 0) {
      continue;
    }

    return databases.createDocument(
      config.databaseId,
      config.collections.invites,
      ID.unique(),
      {
        groupId,
        groupName,
        name: trimmedName,
        code,
        createdAt,
        createdBy
      },
      invitePermissions(adminIds)
    );
  }

  throw new Error("Could not generate a unique invite code.");
};

const listAllDocuments = async (databases, databaseId, collectionId, queries) => {
  const docs = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const response = await databases.listDocuments(
      databaseId,
      collectionId,
      [...queries, Query.limit(limit), Query.offset(offset)]
    );
    docs.push(...response.documents);
    if (response.documents.length < limit) {
      break;
    }
    offset += limit;
  }

  return docs;
};

const getActorId = (req) => {
  const headers = req.headers || {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "x-appwrite-user-id") {
      return value;
    }
  }
  return "";
};

const parsePayload = (req) => {
  if (req.payload && typeof req.payload === "string" && req.payload.trim()) {
    return JSON.parse(req.payload);
  }
  if (req.bodyJson && typeof req.bodyJson === "object") {
    return req.bodyJson;
  }
  if (req.body && typeof req.body === "string" && req.body.trim()) {
    return JSON.parse(req.body);
  }
  if (req.bodyText && typeof req.bodyText === "string" && req.bodyText.trim()) {
    return JSON.parse(req.bodyText);
  }
  return {};
};

const ensureActor = (actorId) => {
  if (!actorId) {
    throw new Error("Missing authenticated user context.");
  }
};

const listGroupMembers = (databases, config, groupId) =>
  listAllDocuments(databases, config.databaseId, config.collections.memberships, [
    Query.equal("groupId", groupId),
    Query.orderAsc("displayName")
  ]);

const getMembershipByUser = async (databases, config, groupId, userId) => {
  const result = await databases.listDocuments(config.databaseId, config.collections.memberships, [
    Query.equal("groupId", groupId),
    Query.equal("userId", userId),
    Query.limit(1)
  ]);
  return result.documents[0];
};

const getMembershipById = async (databases, config, membershipId) =>
  databases.getDocument(config.databaseId, config.collections.memberships, membershipId);

const getGroup = async (databases, config, groupId) =>
  databases.getDocument(config.databaseId, config.collections.groups, groupId);

const syncGroupPermissionsInternal = async (
  databases,
  config,
  groupId,
  actorId,
  enforceAdmin = true
) => {
  if (enforceAdmin) {
    const actorMembership = await getMembershipByUser(databases, config, groupId, actorId);
    ensureAdmin(actorMembership);
  }
  const memberships = await listGroupMembers(databases, config, groupId);
  const memberIds = memberships.map((member) => member.userId);
  const adminIds = memberships
    .filter((member) => member.role !== "member")
    .map((member) => member.userId);
  const owner = memberships.find((member) => member.role === "owner");
  const ownerId = owner?.userId ?? adminIds[0];

  // Keep one non-placeholder person profile per member user.
  for (const membership of memberships) {
    await ensureSingleMemberPerson(databases, config, {
      groupId,
      userId: membership.userId,
      displayName: membership.displayName || "Member",
      createdBy: membership.userId,
      memberIds,
      adminIds,
      preferredPersonId: membership.personId || ""
    });
  }

  const groupDoc = await getGroup(databases, config, groupId);
  const desiredGroupPermissions = groupPermissions(memberIds, adminIds, ownerId || adminIds[0]);
  if (!permissionsEqual(groupDoc.$permissions, desiredGroupPermissions)) {
    await databases.updateDocument(
      config.databaseId,
      config.collections.groups,
      groupId,
      {},
      desiredGroupPermissions
    );
  }

  for (const membership of memberships) {
    const desired = membershipPermissions(memberIds, adminIds, membership.userId);
    if (!permissionsEqual(membership.$permissions, desired)) {
      await databases.updateDocument(
        config.databaseId,
        config.collections.memberships,
        membership.$id,
        {},
        desired
      );
    }
  }

  const people = await listAllDocuments(databases, config.databaseId, config.collections.people, [
    Query.equal("groupId", groupId)
  ]);

  for (const person of people) {
    const desired = personPermissions(memberIds, adminIds, person.isPlaceholder);
    if (!permissionsEqual(person.$permissions, desired)) {
      await databases.updateDocument(
        config.databaseId,
        config.collections.people,
        person.$id,
        {},
        desired
      );
    }
  }

  const quotes = await listAllDocuments(databases, config.databaseId, config.collections.quotes, [
    Query.equal("groupId", groupId)
  ]);

  for (const quote of quotes) {
    const desired = quotePermissions(memberIds, adminIds);
    if (!permissionsEqual(quote.$permissions, desired)) {
      await databases.updateDocument(
        config.databaseId,
        config.collections.quotes,
        quote.$id,
        {},
        desired
      );
    }
  }

  const invites = await listAllDocuments(databases, config.databaseId, config.collections.invites, [
    Query.equal("groupId", groupId)
  ]);

  for (const invite of invites) {
    const desired = invitePermissions(adminIds);
    if (!permissionsEqual(invite.$permissions, desired)) {
      await databases.updateDocument(
        config.databaseId,
        config.collections.invites,
        invite.$id,
        {},
        desired
      );
    }
  }

  return { memberIds, adminIds, ownerId };
};

const syncGroupPermissions = async (databases, config, payload, actorId) => {
  const groupId = typeof payload === "string" ? payload : String(payload.groupId || "").trim();
  if (!groupId) {
    throw new Error("Group is required.");
  }
  return syncGroupPermissionsInternal(databases, config, groupId, actorId);
};

const ensureAdmin = (membership) => {
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new Error("Admin permissions required.");
  }
};

const ensureOwner = (membership) => {
  if (!membership || membership.role !== "owner") {
    throw new Error("Owner permissions required.");
  }
};

const createGroupWithOwner = async (databases, config, payload, actorId) => {
  const name = String(payload.name || "").trim();
  const displayName = String(payload.displayName || "Owner").trim();
  if (!name) {
    throw new Error("Group name is required.");
  }
  const createdAt = nowIso();
  const groupId = ID.unique();
  const memberIds = [actorId];
  const adminIds = [actorId];

  const group = await databases.createDocument(
    config.databaseId,
    config.collections.groups,
    groupId,
    { name, ownerId: actorId, createdAt, spellingAllowList: [] },
    groupPermissions(memberIds, adminIds, actorId)
  );

  const person = await databases.createDocument(
    config.databaseId,
    config.collections.people,
    ID.unique(),
    {
      groupId,
      name: displayName,
      userId: actorId,
      isPlaceholder: false,
      createdAt,
      createdBy: actorId
    },
    personPermissions(memberIds, adminIds, false)
  );

  const membership = await databases.createDocument(
    config.databaseId,
    config.collections.memberships,
    ID.unique(),
    {
      groupId,
      groupName: name,
      userId: actorId,
      role: "owner",
      displayName,
      personId: person.$id,
      claimedPlaceholderId: "",
      claimedPlaceholderName: "",
      createdAt
    },
    membershipPermissions(memberIds, adminIds, actorId)
  );

  await createInviteDocument(databases, config, {
    groupId,
    groupName: name,
    createdBy: actorId,
    adminIds,
    name: "General"
  });

  return { group, membership, person };
};

const updateGroupSpellingAllowList = async (databases, config, payload, actorId) => {
  const groupId = String(payload.groupId || "").trim();
  if (!groupId) {
    throw new Error("Group is required.");
  }

  const membership = await getMembershipByUser(databases, config, groupId, actorId);
  ensureAdmin(membership);

  const words = normalizeAllowWords(payload.words || payload.spellingAllowList || []);

  const group = await databases.getDocument(config.databaseId, config.collections.groups, groupId);
  if (!group) {
    throw new Error("Group not found.");
  }

  const updated = await databases.updateDocument(
    config.databaseId,
    config.collections.groups,
    groupId,
    { spellingAllowList: words }
  );

  return { spellingAllowList: updated.spellingAllowList || [] };
};

const createInvite = async (databases, config, payload, actorId) => {
  const groupId = String(payload.groupId || "").trim();
  const groupName = String(payload.groupName || "Group").trim();
  const name = String(payload.name || "General").trim() || "General";
  if (!groupId) {
    throw new Error("Group is required.");
  }

  const membership = await getMembershipByUser(databases, config, groupId, actorId);
  ensureAdmin(membership);

  const memberships = await listGroupMembers(databases, config, groupId);
  const adminIds = memberships
    .filter((member) => member.role !== "member")
    .map((member) => member.userId);

  return createInviteDocument(databases, config, {
    groupId,
    groupName,
    createdBy: actorId,
    adminIds,
    name
  });
};

const renameInvite = async (databases, config, payload, actorId) => {
  const inviteId = String(payload.inviteId || "").trim();
  const name = String(payload.name || "").trim();
  if (!inviteId || !name) {
    throw new Error("Invite and name are required.");
  }

  const invite = await databases.getDocument(
    config.databaseId,
    config.collections.invites,
    inviteId
  );
  const groupId = invite.groupId;
  const membership = await getMembershipByUser(databases, config, groupId, actorId);
  ensureAdmin(membership);

  await databases.updateDocument(
    config.databaseId,
    config.collections.invites,
    inviteId,
    { name }
  );

  return { ok: true };
};

const deleteInvite = async (databases, config, payload, actorId) => {
  const inviteId = String(payload.inviteId || "").trim();
  if (!inviteId) {
    throw new Error("Invite is required.");
  }

  const invite = await databases.getDocument(
    config.databaseId,
    config.collections.invites,
    inviteId
  );
  const groupId = invite.groupId;
  const membership = await getMembershipByUser(databases, config, groupId, actorId);
  ensureAdmin(membership);

  await databases.deleteDocument(
    config.databaseId,
    config.collections.invites,
    inviteId
  );

  return { ok: true };
};

const joinGroupByCode = async (databases, config, payload, actorId) => {
  const code = String(payload.code || "").trim().toUpperCase();
  const displayName = String(payload.displayName || "Member").trim();
  if (!code) {
    throw new Error("Invite code is required.");
  }

  const inviteResult = await databases.listDocuments(config.databaseId, config.collections.invites, [
    Query.equal("code", code),
    Query.limit(1)
  ]);
  const invite = inviteResult.documents[0];
  if (!invite) {
    throw new Error("Invite code is invalid.");
  }

  const groupId = invite.groupId;
  const groupName = invite.groupName || "Group";
  const createdAt = nowIso();

  const memberships = await listGroupMembers(databases, config, groupId);
  const memberIds = unique([...memberships.map((member) => member.userId), actorId]);
  const adminIds = memberships.filter((member) => member.role !== "member").map((member) => member.userId);

  let membership = await getMembershipByUser(databases, config, groupId, actorId);
  if (!membership) {
    try {
      membership = await databases.createDocument(
        config.databaseId,
        config.collections.memberships,
        getMembershipDocId(groupId, actorId),
        {
          groupId,
          groupName,
          userId: actorId,
          role: "member",
          displayName,
          personId: "",
          claimedPlaceholderId: "",
          claimedPlaceholderName: "",
          createdAt
        },
        membershipPermissions(memberIds, adminIds, actorId)
      );
    } catch (err) {
      if (!isConflictError(err)) {
        throw err;
      }
      membership = await getMembershipByUser(databases, config, groupId, actorId);
      if (!membership) {
        throw err;
      }
    }
  }

  const refreshedMembers = await listGroupMembers(databases, config, groupId);
  const refreshedMemberIds = refreshedMembers.map((member) => member.userId);
  const refreshedAdminIds = refreshedMembers
    .filter((member) => member.role !== "member")
    .map((member) => member.userId);

  const person = await ensureSingleMemberPerson(databases, config, {
    groupId,
    userId: actorId,
    displayName,
    createdBy: actorId,
    memberIds: refreshedMemberIds,
    adminIds: refreshedAdminIds,
    preferredPersonId: membership.personId || ""
  });

  if (
    membership.personId !== person.$id ||
    membership.displayName !== displayName ||
    membership.groupName !== groupName
  ) {
    membership = await databases.updateDocument(
      config.databaseId,
      config.collections.memberships,
      membership.$id,
      { personId: person.$id, displayName, groupName }
    );
  }

  await syncGroupPermissionsInternal(databases, config, groupId, actorId, false);

  return { groupId, membership, person };
};

const createPlaceholderPerson = async (databases, config, payload, actorId) => {
  const groupId = String(payload.groupId || "").trim();
  const name = String(payload.name || "").trim();
  if (!groupId || !name) {
    throw new Error("Group and name are required.");
  }
  const membership = await getMembershipByUser(databases, config, groupId, actorId);
  if (!membership) {
    throw new Error("You are not a member of this group.");
  }
  const memberships = await listGroupMembers(databases, config, groupId);
  const memberIds = memberships.map((member) => member.userId);
  const adminIds = memberships.filter((member) => member.role !== "member").map((member) => member.userId);

  return databases.createDocument(
    config.databaseId,
    config.collections.people,
    ID.unique(),
    {
      groupId,
      name,
      userId: "",
      isPlaceholder: true,
      createdAt: nowIso(),
      createdBy: actorId
    },
    personPermissions(memberIds, adminIds, true)
  );
};

const createQuote = async (databases, config, payload, actorId) => {
  const groupId = String(payload.groupId || "").trim();
  const personId = String(payload.personId || "").trim();
  const text = String(payload.text || "").trim();
  const createdByName = String(payload.createdByName || "").trim();
  if (!groupId || !personId || !text) {
    throw new Error("Group, person, and text are required.");
  }
  const membership = await getMembershipByUser(databases, config, groupId, actorId);
  if (!membership) {
    throw new Error("You are not a member of this group.");
  }
  const person = await databases.getDocument(config.databaseId, config.collections.people, personId);
  if (person.groupId !== groupId) {
    throw new Error("Person does not belong to this group.");
  }

  const memberships = await listGroupMembers(databases, config, groupId);
  const memberIds = memberships.map((member) => member.userId);
  const adminIds = memberships.filter((member) => member.role !== "member").map((member) => member.userId);

  return databases.createDocument(
    config.databaseId,
    config.collections.quotes,
    ID.unique(),
    {
      groupId,
      personId,
      text,
      createdAt: nowIso(),
      createdBy: actorId,
      createdByName,
      duplicateExcused: false,
      punctuationExcused: false,
      spellingExcused: false
    },
    quotePermissions(memberIds, adminIds)
  );
};

const deleteQuote = async (databases, config, payload, actorId) => {
  const groupId = String(payload.groupId || "").trim();
  const quoteId = String(payload.quoteId || payload.id || "").trim();
  if (!groupId || !quoteId) {
    throw new Error("Group and quote are required.");
  }
  const membership = await getMembershipByUser(databases, config, groupId, actorId);
  ensureAdmin(membership);

  const quote = await databases.getDocument(config.databaseId, config.collections.quotes, quoteId);
  if (quote.groupId !== groupId) {
    throw new Error("Quote does not belong to this group.");
  }

  await databases.deleteDocument(config.databaseId, config.collections.quotes, quoteId);
  return { ok: true };
};

const deleteQuoteSelf = async (databases, config, payload, actorId) => {
  const groupId = String(payload.groupId || "").trim();
  const quoteId = String(payload.quoteId || payload.id || "").trim();
  if (!groupId || !quoteId) {
    throw new Error("Group and quote are required.");
  }
  const membership = await getMembershipByUser(databases, config, groupId, actorId);
  if (!membership) {
    throw new Error("Membership required.");
  }

  const quote = await databases.getDocument(config.databaseId, config.collections.quotes, quoteId);
  if (quote.groupId !== groupId) {
    throw new Error("Quote does not belong to this group.");
  }

  const isAdmin = membership.role === "owner" || membership.role === "admin";
  const isCreator = quote.createdBy === actorId;
  let isQuotee = false;
  if (!isAdmin && !isCreator) {
    try {
      const person = await databases.getDocument(
        config.databaseId,
        config.collections.people,
        quote.personId
      );
      isQuotee = person.userId === actorId;
    } catch {
      isQuotee = false;
    }
  }

  if (!isAdmin && !isCreator && !isQuotee) {
    throw new Error("You can only remove your own quotes.");
  }

  await databases.deleteDocument(config.databaseId, config.collections.quotes, quoteId);
  return { ok: true };
};

const setQuoteExcuse = async (databases, config, payload, actorId) => {
  const groupId = String(payload.groupId || "").trim();
  const quoteId = String(payload.quoteId || "").trim();
  const tool = String(payload.tool || "").trim();
  const excused = Boolean(payload.excused);
  if (!groupId || !quoteId || !tool) {
    throw new Error("Group, quote, and tool are required.");
  }

  if (tool !== "duplicate" && tool !== "punctuation" && tool !== "spelling") {
    throw new Error("Invalid tool.");
  }

  const membership = await getMembershipByUser(databases, config, groupId, actorId);
  ensureAdmin(membership);

  const quote = await databases.getDocument(config.databaseId, config.collections.quotes, quoteId);
  if (quote.groupId !== groupId) {
    throw new Error("Quote does not belong to this group.");
  }

  const field =
    tool === "duplicate"
      ? "duplicateExcused"
      : tool === "punctuation"
        ? "punctuationExcused"
        : "spellingExcused";
  const updated = await databases.updateDocument(
    config.databaseId,
    config.collections.quotes,
    quoteId,
    { [field]: excused }
  );
  return updated;
};

const updateQuoteText = async (databases, config, payload, actorId) => {
  const groupId = String(payload.groupId || "").trim();
  const quoteId = String(payload.quoteId || "").trim();
  const text = String(payload.text || "").trim();
  const tool = String(payload.tool || "punctuation").trim();
  if (!groupId || !quoteId || !text) {
    throw new Error("Group, quote, and text are required.");
  }
  if (tool !== "punctuation" && tool !== "spelling") {
    throw new Error("Invalid tool.");
  }

  const membership = await getMembershipByUser(databases, config, groupId, actorId);
  ensureAdmin(membership);

  const quote = await databases.getDocument(config.databaseId, config.collections.quotes, quoteId);
  if (quote.groupId !== groupId) {
    throw new Error("Quote does not belong to this group.");
  }

  const updates = { text };
  if (tool === "punctuation") {
    updates.punctuationExcused = true;
  } else {
    updates.spellingExcused = true;
  }

  return await databases.updateDocument(config.databaseId, config.collections.quotes, quoteId, updates);
};

const claimPlaceholder = async (databases, config, payload, actorId) => {
  const groupId = String(payload.groupId || "").trim();
  const placeholderId = String(payload.placeholderId || "").trim();
  if (!groupId || !placeholderId) {
    throw new Error("Group and placeholder are required.");
  }
  const membership = await getMembershipByUser(databases, config, groupId, actorId);
  if (!membership) {
    throw new Error("Membership required.");
  }
  if (!membership.personId) {
    throw new Error("Missing member profile for claim.");
  }
  if (membership.claimedPlaceholderId) {
    throw new Error("You have already claimed a placeholder.");
  }

  const placeholder = await databases.getDocument(config.databaseId, config.collections.people, placeholderId);
  if (placeholder.groupId !== groupId || !placeholder.isPlaceholder) {
    throw new Error("That placeholder cannot be claimed.");
  }

  const quotes = await listAllDocuments(databases, config.databaseId, config.collections.quotes, [
    Query.equal("groupId", groupId),
    Query.equal("personId", placeholderId)
  ]);

  for (const quote of quotes) {
    await databases.updateDocument(
      config.databaseId,
      config.collections.quotes,
      quote.$id,
      { personId: membership.personId, sourcePlaceholderId: placeholderId }
    );
  }

  await databases.deleteDocument(config.databaseId, config.collections.people, placeholderId);

  await databases.updateDocument(
    config.databaseId,
    config.collections.memberships,
    membership.$id,
    { claimedPlaceholderId: placeholderId, claimedPlaceholderName: placeholder.name }
  );

  return { ok: true };
};

const unclaimPlaceholder = async (databases, config, payload, actorId) => {
  const groupId = String(payload.groupId || "").trim();
  if (!groupId) {
    throw new Error("Group is required.");
  }
  const membership = await getMembershipByUser(databases, config, groupId, actorId);
  if (!membership) {
    throw new Error("Membership required.");
  }
  if (!membership.personId) {
    throw new Error("Missing member profile for unclaim.");
  }
  if (!membership.claimedPlaceholderId) {
    throw new Error("No placeholder claimed yet.");
  }

  const memberships = await listGroupMembers(databases, config, groupId);
  const memberIds = memberships.map((member) => member.userId);
  const adminIds = memberships.filter((member) => member.role !== "member").map((member) => member.userId);

  const placeholder = await databases.createDocument(
    config.databaseId,
    config.collections.people,
    ID.unique(),
    {
      groupId,
      name: membership.claimedPlaceholderName || "Placeholder",
      userId: "",
      isPlaceholder: true,
      createdAt: nowIso(),
      createdBy: actorId
    },
    personPermissions(memberIds, adminIds, true)
  );

  const quotes = await listAllDocuments(databases, config.databaseId, config.collections.quotes, [
    Query.equal("groupId", groupId),
    Query.equal("sourcePlaceholderId", membership.claimedPlaceholderId)
  ]);

  for (const quote of quotes) {
    await databases.updateDocument(
      config.databaseId,
      config.collections.quotes,
      quote.$id,
      { personId: placeholder.$id }
    );
  }

  await databases.updateDocument(
    config.databaseId,
    config.collections.memberships,
    membership.$id,
    { claimedPlaceholderId: "", claimedPlaceholderName: "" }
  );

  return { ok: true };
};

const updateMemberRole = async (databases, config, payload, actorId) => {
  const groupId = String(payload.groupId || "").trim();
  const membershipId = String(payload.membershipId || "").trim();
  const newRole = String(payload.newRole || "").trim();
  if (!groupId || !membershipId || !newRole) {
    throw new Error("Group, membership, and role are required.");
  }
  const actorMembership = await getMembershipByUser(databases, config, groupId, actorId);
  if (!actorMembership) {
    throw new Error("Membership required.");
  }

  const target = await getMembershipById(databases, config, membershipId);
  if (target.groupId !== groupId) {
    throw new Error("Member does not belong to this group.");
  }
  if (target.role === "owner") {
    throw new Error("Use transfer ownership instead.");
  }

  if (newRole === "admin") {
    if (actorMembership.role === "member") {
      throw new Error("Admin permissions required.");
    }
  } else if (newRole === "member") {
    if (actorMembership.role !== "owner") {
      throw new Error("Only the owner can remove admins.");
    }
  } else {
    throw new Error("Invalid role.");
  }

  await databases.updateDocument(
    config.databaseId,
    config.collections.memberships,
    membershipId,
    { role: newRole }
  );

  await syncGroupPermissionsInternal(databases, config, groupId, actorId);
  return { ok: true };
};

const transferOwnership = async (databases, config, payload, actorId) => {
  const groupId = String(payload.groupId || "").trim();
  const currentOwnerMembershipId = String(payload.currentOwnerMembershipId || "").trim();
  const nextOwnerMembershipId = String(payload.nextOwnerMembershipId || "").trim();
  if (!groupId || !currentOwnerMembershipId || !nextOwnerMembershipId) {
    throw new Error("Group and memberships are required.");
  }
  const actorMembership = await getMembershipByUser(databases, config, groupId, actorId);
  ensureOwner(actorMembership);

  const currentOwner = await getMembershipById(databases, config, currentOwnerMembershipId);
  const nextOwner = await getMembershipById(databases, config, nextOwnerMembershipId);
  if (currentOwner.groupId !== groupId || nextOwner.groupId !== groupId) {
    throw new Error("Memberships must belong to this group.");
  }

  await databases.updateDocument(
    config.databaseId,
    config.collections.groups,
    groupId,
    { ownerId: nextOwner.userId }
  );

  await databases.updateDocument(
    config.databaseId,
    config.collections.memberships,
    currentOwner.$id,
    { role: "admin" }
  );

  await databases.updateDocument(
    config.databaseId,
    config.collections.memberships,
    nextOwner.$id,
    { role: "owner" }
  );

  await syncGroupPermissionsInternal(databases, config, groupId, actorId);
  return { ok: true };
};

const removeMember = async (databases, config, payload, actorId) => {
  const groupId = String(payload.groupId || "").trim();
  const membershipId = String(payload.membershipId || "").trim();
  if (!groupId || !membershipId) {
    throw new Error("Group and membership are required.");
  }
  const actorMembership = await getMembershipByUser(databases, config, groupId, actorId);
  if (!actorMembership) {
    throw new Error("Membership required.");
  }
  let target = await getMembershipById(databases, config, membershipId);
  if (target.groupId !== groupId) {
    throw new Error("Member does not belong to this group.");
  }

  const actorIsAdmin = actorMembership.role === "owner" || actorMembership.role === "admin";
  if (!actorIsAdmin && target.userId !== actorMembership.userId) {
    target = actorMembership;
  }

  const isSelf = actorMembership.userId === target.userId;
  if (isSelf) {
    if (target.role === "owner") {
      throw new Error("Transfer ownership before leaving the group.");
    }
  } else {
    ensureAdmin(actorMembership);
    if (target.role === "owner") {
      throw new Error("Transfer ownership before removing the owner.");
    }
    if (target.role === "admin" && actorMembership.role !== "owner") {
      throw new Error("Only the owner can remove another admin.");
    }
  }

  if (target.personId) {
    let personDoc = null;
    try {
      personDoc = await databases.getDocument(
        config.databaseId,
        config.collections.people,
        target.personId
      );
    } catch {
      personDoc = null;
    }
    const quoteCheck = await databases.listDocuments(config.databaseId, config.collections.quotes, [
      Query.equal("groupId", groupId),
      Query.equal("personId", target.personId),
      Query.limit(1)
    ]);
    if (quoteCheck.total > 0) {
      if (personDoc) {
        await databases.updateDocument(
          config.databaseId,
          config.collections.people,
          target.personId,
          { userId: "", isPlaceholder: true }
        );
      }
    } else if (personDoc) {
      await databases.deleteDocument(
        config.databaseId,
        config.collections.people,
        target.personId
      );
    }
  }

  await databases.deleteDocument(
    config.databaseId,
    config.collections.memberships,
    membershipId
  );

  await syncGroupPermissionsInternal(databases, config, groupId, actorId, isSelf ? false : true);
  return { ok: true };
};

const removePerson = async (databases, config, payload, actorId) => {
  const groupId = String(payload.groupId || "").trim();
  const personId = String(payload.personId || "").trim();
  const force = Boolean(payload.force);
  if (!groupId || !personId) {
    throw new Error("Group and person are required.");
  }
  const membership = await getMembershipByUser(databases, config, groupId, actorId);
  ensureAdmin(membership);

  const person = await databases.getDocument(
    config.databaseId,
    config.collections.people,
    personId
  );
  if (person.groupId !== groupId) {
    throw new Error("Person does not belong to this group.");
  }
  if (!person.isPlaceholder) {
    throw new Error("Only placeholders can be removed here.");
  }

  const quoteCheck = await databases.listDocuments(config.databaseId, config.collections.quotes, [
    Query.equal("groupId", groupId),
    Query.equal("personId", personId),
    Query.limit(1)
  ]);
  if (quoteCheck.total > 0 && !force) {
    throw new Error("Placeholder has quotes. Confirm removal to delete them.");
  }

  if (quoteCheck.total > 0) {
    const quotes = await listAllDocuments(
      databases,
      config.databaseId,
      config.collections.quotes,
      [Query.equal("groupId", groupId), Query.equal("personId", personId)]
    );
    for (const quote of quotes) {
      await databases.deleteDocument(
        config.databaseId,
        config.collections.quotes,
        quote.$id
      );
    }
  }

  await databases.deleteDocument(
    config.databaseId,
    config.collections.people,
    personId
  );

  return { ok: true };
};

const handlers = {
  createGroupWithOwner,
  updateGroupSpellingAllowList,
  createInvite,
  renameInvite,
  deleteInvite,
  joinGroupByCode,
  createPlaceholderPerson,
  createQuote,
  deleteQuote,
  deleteQuoteSelf,
  setQuoteExcuse,
  updateQuoteText,
  removePerson,
  claimPlaceholder,
  unclaimPlaceholder,
  updateMemberRole,
  transferOwnership,
  removeMember,
  syncGroupPermissions
};

export default async ({ req, res, log, error }) => {
  try {
    const config = getConfig();
    const actorId = getActorId(req);
    const payload = parsePayload(req);
    const action = String(payload.action || "").trim();
    const data = payload.payload || {};

    if (!action || !handlers[action]) {
      return res.json({ ok: false, error: "Unknown action." }, 400);
    }

    ensureActor(actorId);

    const client = new Client()
      .setEndpoint(config.endpoint)
      .setProject(config.projectId)
      .setKey(config.apiKey);

    const databases = new Databases(client);

    const result = await handlers[action](databases, config, data, actorId);
    return res.json({ ok: true, data: result });
  } catch (err) {
    error(String(err));
    return res.json({ ok: false, error: err.message || "Function failed." }, 500);
  }
};
