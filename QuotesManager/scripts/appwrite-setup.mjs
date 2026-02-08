import process from "node:process";

const endpoint = (process.env.APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1").replace(/\/$/, "");
const projectId = process.env.APPWRITE_PROJECT_ID || "69876eae003275d80ff8";
const apiKey = process.env.APPWRITE_API_KEY;

if (!apiKey) {
  console.error("Missing APPWRITE_API_KEY in environment.");
  process.exit(1);
}

let databaseId = process.env.APPWRITE_DATABASE_ID || "qm_v2";
const collections = {
  groups: process.env.APPWRITE_COLLECTION_GROUPS_ID || "qm_groups",
  memberships: process.env.APPWRITE_COLLECTION_MEMBERSHIPS_ID || "qm_memberships",
  people: process.env.APPWRITE_COLLECTION_PEOPLE_ID || "qm_people",
  quotes: process.env.APPWRITE_COLLECTION_QUOTES_ID || "qm_quotes",
  invites: process.env.APPWRITE_COLLECTION_INVITES_ID || "qm_invites"
};

const headers = {
  "Content-Type": "application/json",
  "X-Appwrite-Project": projectId,
  "X-Appwrite-Key": apiKey
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const request = async (method, path, body) => {
  const res = await fetch(`${endpoint}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = new Error(data?.message || `Request failed: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
};

const ensureDatabase = async () => {
  try {
    await request("GET", `/databases/${databaseId}`);
    console.log(`Using existing database ${databaseId}`);
    return;
  } catch (err) {
    if (err.status !== 404) {
      throw err;
    }
  }

  try {
    await request("POST", "/databases", { databaseId, name: "Quotes Manager v2" });
    console.log(`Created database ${databaseId}`);
  } catch (err) {
    if (err.status === 409) {
      console.log(`Database ${databaseId} already exists`);
      return;
    }
    if (err.status === 403 && err.data?.type === "additional_resource_not_allowed") {
      const list = await request("GET", "/databases");
      if (list.total > 0) {
        databaseId = list.databases[0].$id;
        console.log(`Database limit reached. Using existing database ${databaseId}`);
        return;
      }
    }
    throw err;
  }
};

const ensureCollection = async (collectionId, name) => {
  try {
    await request("POST", `/databases/${databaseId}/collections`, {
      collectionId,
      name,
      permissions: ["create(\"users\")"],
      documentSecurity: true
    });
    console.log(`Created collection ${collectionId}`);
  } catch (err) {
    if (err.status === 409) {
      console.log(`Collection ${collectionId} already exists`);
      return;
    }
    throw err;
  }
};

const ensureCollectionSettings = async (collectionId) => {
  const data = await request("GET", `/databases/${databaseId}/collections/${collectionId}`);
  const existingPermissions = data.permissions || [];
  const hasCreate = existingPermissions.includes("create(\"users\")");
  const permissions = Array.from(new Set([...existingPermissions, "create(\"users\")"]));
  const needsUpdate = data.documentSecurity !== true || !hasCreate;

  if (needsUpdate) {
    await request("PUT", `/databases/${databaseId}/collections/${collectionId}`, {
      name: data.name,
      permissions,
      documentSecurity: true
    });
    console.log(`Updated collection settings for ${collectionId}`);
  }
};

const listAttributes = async (collectionId) => {
  const data = await request("GET", `/databases/${databaseId}/collections/${collectionId}/attributes`);
  return data.attributes || [];
};

const waitForAttributes = async (collectionId, keys) => {
  const deadline = Date.now() + 120000;
  const pending = new Set(keys);

  while (pending.size > 0 && Date.now() < deadline) {
    const attributes = await listAttributes(collectionId);
    for (const attr of attributes) {
      if (!pending.has(attr.key)) continue;
      if (attr.status === "failed") {
        throw new Error(`Attribute ${collectionId}.${attr.key} failed: ${attr.error}`);
      }
      if (attr.status === "available") {
        pending.delete(attr.key);
      }
    }

    if (pending.size > 0) {
      await sleep(1500);
    }
  }

  if (pending.size > 0) {
    throw new Error(`Timed out waiting for attributes: ${Array.from(pending).join(", ")}`);
  }
};

const ensureAttribute = async (collectionId, type, body) => {
  const existing = await listAttributes(collectionId);
  if (existing.some((attr) => attr.key === body.key)) {
    return false;
  }

  await request(
    "POST",
    `/databases/${databaseId}/collections/${collectionId}/attributes/${type}`,
    body
  );
  return true;
};

const ensureIndex = async (collectionId, key, type, attributes, orders) => {
  try {
    await request("POST", `/databases/${databaseId}/collections/${collectionId}/indexes`, {
      key,
      type,
      attributes,
      orders
    });
    console.log(`Created index ${collectionId}.${key}`);
  } catch (err) {
    if (err.status === 409) {
      console.log(`Index ${collectionId}.${key} already exists`);
      return;
    }
    throw err;
  }
};

const setup = async () => {
  await ensureDatabase();

  await ensureCollection(collections.groups, "Groups");
  await ensureCollection(collections.memberships, "Memberships");
  await ensureCollection(collections.people, "People");
  await ensureCollection(collections.quotes, "Quotes");
  await ensureCollection(collections.invites, "Invites");

  await ensureCollectionSettings(collections.groups);
  await ensureCollectionSettings(collections.memberships);
  await ensureCollectionSettings(collections.people);
  await ensureCollectionSettings(collections.quotes);
  await ensureCollectionSettings(collections.invites);

  const attributeCreates = [];

  // Groups
  attributeCreates.push(
    ensureAttribute(collections.groups, "string", { key: "name", size: 255, required: true, array: false }),
    ensureAttribute(collections.groups, "string", { key: "ownerId", size: 64, required: true, array: false }),
    ensureAttribute(collections.groups, "string", { key: "createdAt", size: 64, required: true, array: false })
  );

  // Memberships
  attributeCreates.push(
    ensureAttribute(collections.memberships, "string", { key: "groupId", size: 64, required: true, array: false }),
    ensureAttribute(collections.memberships, "string", { key: "groupName", size: 255, required: true, array: false }),
    ensureAttribute(collections.memberships, "string", { key: "userId", size: 64, required: true, array: false }),
    ensureAttribute(collections.memberships, "enum", {
      key: "role",
      elements: ["owner", "admin", "member"],
      required: true,
      array: false
    }),
    ensureAttribute(collections.memberships, "string", { key: "displayName", size: 255, required: true, array: false }),
    ensureAttribute(collections.memberships, "string", { key: "personId", size: 64, required: false, array: false }),
    ensureAttribute(collections.memberships, "string", { key: "claimedPlaceholderId", size: 64, required: false, array: false }),
    ensureAttribute(collections.memberships, "string", { key: "claimedPlaceholderName", size: 255, required: false, array: false }),
    ensureAttribute(collections.memberships, "string", { key: "createdAt", size: 64, required: true, array: false })
  );

  // People
  attributeCreates.push(
    ensureAttribute(collections.people, "string", { key: "groupId", size: 64, required: true, array: false }),
    ensureAttribute(collections.people, "string", { key: "name", size: 255, required: true, array: false }),
    ensureAttribute(collections.people, "string", { key: "userId", size: 64, required: false, array: false }),
    ensureAttribute(collections.people, "boolean", { key: "isPlaceholder", required: true, array: false }),
    ensureAttribute(collections.people, "string", { key: "createdAt", size: 64, required: true, array: false }),
    ensureAttribute(collections.people, "string", { key: "createdBy", size: 64, required: true, array: false })
  );

  // Quotes
  attributeCreates.push(
    ensureAttribute(collections.quotes, "string", { key: "groupId", size: 64, required: true, array: false }),
    ensureAttribute(collections.quotes, "string", { key: "personId", size: 64, required: true, array: false }),
    ensureAttribute(collections.quotes, "string", { key: "text", size: 1024, required: true, array: false }),
    ensureAttribute(collections.quotes, "string", { key: "createdAt", size: 64, required: true, array: false }),
    ensureAttribute(collections.quotes, "string", { key: "createdBy", size: 64, required: true, array: false }),
    ensureAttribute(collections.quotes, "string", { key: "createdByName", size: 255, required: true, array: false }),
    ensureAttribute(collections.quotes, "string", { key: "sourcePlaceholderId", size: 64, required: false, array: false })
  );

  // Invites
  attributeCreates.push(
    ensureAttribute(collections.invites, "string", { key: "groupId", size: 64, required: true, array: false }),
    ensureAttribute(collections.invites, "string", { key: "groupName", size: 255, required: true, array: false }),
    ensureAttribute(collections.invites, "string", { key: "name", size: 255, required: false, array: false }),
    ensureAttribute(collections.invites, "string", { key: "code", size: 32, required: true, array: false }),
    ensureAttribute(collections.invites, "string", { key: "createdAt", size: 64, required: true, array: false }),
    ensureAttribute(collections.invites, "string", { key: "createdBy", size: 64, required: true, array: false })
  );

  await Promise.all(attributeCreates);

  await waitForAttributes(collections.groups, ["name", "ownerId", "createdAt"]);
  await waitForAttributes(collections.memberships, [
    "groupId",
    "groupName",
    "userId",
    "role",
    "displayName",
    "personId",
    "claimedPlaceholderId",
    "claimedPlaceholderName",
    "createdAt"
  ]);
  await waitForAttributes(collections.people, [
    "groupId",
    "name",
    "userId",
    "isPlaceholder",
    "createdAt",
    "createdBy"
  ]);
  await waitForAttributes(collections.quotes, [
    "groupId",
    "personId",
    "text",
    "createdAt",
    "createdBy",
    "createdByName",
    "sourcePlaceholderId"
  ]);
  await waitForAttributes(collections.invites, [
    "groupId",
    "groupName",
    "name",
    "code",
    "createdAt",
    "createdBy"
  ]);

  await ensureIndex(collections.memberships, "membership_user", "key", ["userId"], ["ASC"]);
  await ensureIndex(collections.memberships, "membership_group_display", "key", ["groupId", "displayName"], ["ASC", "ASC"]);
  await ensureIndex(collections.memberships, "membership_group_user", "unique", ["groupId", "userId"], ["ASC", "ASC"]);

  await ensureIndex(collections.people, "people_group_name", "key", ["groupId", "name"], ["ASC", "ASC"]);

  await ensureIndex(collections.quotes, "quotes_group_created", "key", ["groupId", "createdAt"], ["ASC", "DESC"]);
  await ensureIndex(collections.quotes, "quotes_group_person", "key", ["groupId", "personId"], ["ASC", "ASC"]);
  await ensureIndex(collections.quotes, "quotes_group_source", "key", ["groupId", "sourcePlaceholderId"], ["ASC", "ASC"]);

  await ensureIndex(collections.invites, "invites_group_created", "key", ["groupId", "createdAt"], ["ASC", "DESC"]);
  await ensureIndex(collections.invites, "invites_code_unique", "unique", ["code"], ["ASC"]);

  console.log("Appwrite setup complete.");
  console.log(`Database ID: ${databaseId}`);
  console.log(`Collections: ${JSON.stringify(collections, null, 2)}`);
};

setup().catch((err) => {
  console.error(err);
  process.exit(1);
});
