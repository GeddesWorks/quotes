import { Account, Client, Databases, Functions, ID, Permission, Query, Role } from "appwrite";

const config = {
    endpoint: import.meta.env.VITE_APPWRITE_ENDPOINT ?? "https://sfo.cloud.appwrite.io/v1",
    projectId: import.meta.env.VITE_APPWRITE_PROJECT_ID ?? "69876eae003275d80ff8",
    databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID ?? "",
    permissionMode: (import.meta.env.VITE_APPWRITE_PERMISSION_MODE ?? "relaxed") as
        | "relaxed"
        | "strict",
    functionId: import.meta.env.VITE_APPWRITE_FUNCTION_ID ?? "",
    collections: {
        groups: import.meta.env.VITE_APPWRITE_COLLECTION_GROUPS_ID ?? "",
        memberships: import.meta.env.VITE_APPWRITE_COLLECTION_MEMBERSHIPS_ID ?? "",
        people: import.meta.env.VITE_APPWRITE_COLLECTION_PEOPLE_ID ?? "",
        quotes: import.meta.env.VITE_APPWRITE_COLLECTION_QUOTES_ID ?? "",
        invites: import.meta.env.VITE_APPWRITE_COLLECTION_INVITES_ID ?? ""
    }
};

const missingConfig = [
    !config.databaseId ? "VITE_APPWRITE_DATABASE_ID" : null,
    config.permissionMode === "strict" && !config.functionId ? "VITE_APPWRITE_FUNCTION_ID" : null,
    !config.collections.groups ? "VITE_APPWRITE_COLLECTION_GROUPS_ID" : null,
    !config.collections.memberships ? "VITE_APPWRITE_COLLECTION_MEMBERSHIPS_ID" : null,
    !config.collections.people ? "VITE_APPWRITE_COLLECTION_PEOPLE_ID" : null,
    !config.collections.quotes ? "VITE_APPWRITE_COLLECTION_QUOTES_ID" : null,
    !config.collections.invites ? "VITE_APPWRITE_COLLECTION_INVITES_ID" : null
].filter((entry): entry is string => Boolean(entry));

const client = new Client()
    .setEndpoint(config.endpoint)
    .setProject(config.projectId);

const account = new Account(client);
const databases = new Databases(client);
const functions = new Functions(client);

export const appwriteConfig = config;
export const appwriteConfigIssues = missingConfig;
export const appwriteConfigured = missingConfig.length === 0;

export { client, account, databases, functions, ID, Permission, Query, Role };
