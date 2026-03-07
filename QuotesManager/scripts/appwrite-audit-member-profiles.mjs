import { Client, Databases, Query } from "node-appwrite";

const endpoint = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const databaseId = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const collections = {
  memberships: process.env.APPWRITE_COLLECTION_MEMBERSHIPS_ID || process.env.VITE_APPWRITE_COLLECTION_MEMBERSHIPS_ID,
  people: process.env.APPWRITE_COLLECTION_PEOPLE_ID || process.env.VITE_APPWRITE_COLLECTION_PEOPLE_ID,
  quotes: process.env.APPWRITE_COLLECTION_QUOTES_ID || process.env.VITE_APPWRITE_COLLECTION_QUOTES_ID
};

const shouldFix = process.argv.includes("--fix");

const requireValue = (value, key) => {
  if (!value) {
    throw new Error(`Missing ${key}.`);
  }
  return value;
};

const listAllDocuments = async (databases, collectionId, queries = []) => {
  const docs = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const page = await databases.listDocuments(databaseId, collectionId, [
      ...queries,
      Query.limit(limit),
      Query.offset(offset)
    ]);
    docs.push(...page.documents);
    if (page.documents.length < limit) {
      break;
    }
    offset += limit;
  }

  return docs;
};

const chooseCanonical = (people, preferredPersonId) => {
  if (preferredPersonId) {
    const preferred = people.find((person) => person.$id === preferredPersonId);
    if (preferred) {
      return preferred;
    }
  }
  return [...people].sort((left, right) =>
    String(left.createdAt || "").localeCompare(String(right.createdAt || ""))
  )[0];
};

const main = async () => {
  requireValue(endpoint, "APPWRITE_ENDPOINT or VITE_APPWRITE_ENDPOINT");
  requireValue(projectId, "APPWRITE_PROJECT_ID or VITE_APPWRITE_PROJECT_ID");
  requireValue(databaseId, "APPWRITE_DATABASE_ID or VITE_APPWRITE_DATABASE_ID");
  requireValue(apiKey, "APPWRITE_API_KEY");
  requireValue(collections.memberships, "APPWRITE_COLLECTION_MEMBERSHIPS_ID");
  requireValue(collections.people, "APPWRITE_COLLECTION_PEOPLE_ID");
  requireValue(collections.quotes, "APPWRITE_COLLECTION_QUOTES_ID");

  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const databases = new Databases(client);

  const people = await listAllDocuments(databases, collections.people);
  const memberPeople = people.filter((person) => !person.isPlaceholder && String(person.userId || "").trim());

  const grouped = new Map();
  for (const person of memberPeople) {
    const key = `${person.groupId}:${person.userId}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(person);
  }

  const duplicates = Array.from(grouped.entries())
    .map(([key, docs]) => ({ key, docs }))
    .filter((entry) => entry.docs.length > 1);

  console.log(`Duplicate member profile sets: ${duplicates.length}`);
  for (const entry of duplicates) {
    console.log(`${entry.key} -> ${entry.docs.length} docs`);
    for (const doc of entry.docs) {
      console.log(`  - ${doc.$id} | ${doc.name} | ${doc.createdAt}`);
    }
  }

  if (!shouldFix || duplicates.length === 0) {
    if (!shouldFix) {
      console.log("Dry run complete. Use --fix to merge duplicates.");
    }
    return;
  }

  let movedQuotes = 0;
  let updatedMemberships = 0;
  let deletedPeople = 0;

  for (const entry of duplicates) {
    const [groupId, userId] = entry.key.split(":");
    const membershipDocs = await listAllDocuments(databases, collections.memberships, [
      Query.equal("groupId", groupId),
      Query.equal("userId", userId),
      Query.limit(1)
    ]);
    const membership = membershipDocs[0];
    const canonical = chooseCanonical(entry.docs, membership?.personId || "");
    if (!canonical) {
      continue;
    }

    for (const person of entry.docs) {
      if (person.$id === canonical.$id) {
        continue;
      }

      const quotes = await listAllDocuments(databases, collections.quotes, [
        Query.equal("groupId", groupId),
        Query.equal("personId", person.$id)
      ]);
      for (const quote of quotes) {
        await databases.updateDocument(databaseId, collections.quotes, quote.$id, {
          personId: canonical.$id
        });
        movedQuotes += 1;
      }

      const groupMemberships = await listAllDocuments(databases, collections.memberships, [
        Query.equal("groupId", groupId)
      ]);
      for (const groupMembership of groupMemberships) {
        if (groupMembership.personId !== person.$id) {
          continue;
        }
        await databases.updateDocument(databaseId, collections.memberships, groupMembership.$id, {
          personId: canonical.$id
        });
        updatedMemberships += 1;
      }

      await databases.deleteDocument(databaseId, collections.people, person.$id);
      deletedPeople += 1;
    }
  }

  console.log(`Fix complete. Quotes moved: ${movedQuotes}`);
  console.log(`Memberships updated: ${updatedMemberships}`);
  console.log(`People deleted: ${deletedPeople}`);
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
