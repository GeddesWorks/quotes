# Appwrite Setup

## Environment
Use the values below in `.env.local` (see `.env.example` for the template).
- `VITE_APPWRITE_ENDPOINT=https://sfo.cloud.appwrite.io/v1`
- `VITE_APPWRITE_PROJECT_ID=69876eae003275d80ff8`
- `VITE_APPWRITE_DATABASE_ID=quotes`
- `VITE_APPWRITE_PERMISSION_MODE=strict`
- `VITE_APPWRITE_FUNCTION_ID=qm_api`
- `VITE_APPWRITE_COLLECTION_GROUPS_ID=qm_groups`
- `VITE_APPWRITE_COLLECTION_MEMBERSHIPS_ID=qm_memberships`
- `VITE_APPWRITE_COLLECTION_PEOPLE_ID=qm_people`
- `VITE_APPWRITE_COLLECTION_QUOTES_ID=qm_quotes`
- `VITE_APPWRITE_COLLECTION_INVITES_ID=qm_invites`

## Automated Setup
Run `node scripts/appwrite-setup.mjs` with `APPWRITE_API_KEY` set. The script is idempotent and will reuse the existing `quotes` database when plan limits prevent creating a new one.

## Function Deployment (Strict Permissions)
Run `node scripts/appwrite-function-deploy.mjs` with `APPWRITE_API_KEY` set. This deploys the `qm_api` function used for all write operations in strict mode.

## Collections
Create all collections with Document Security enabled. Set collection Create permissions to `create("users")` so authenticated members can create documents with per-document permissions.

Groups (string IDs, 1 document per group)
- `name` (string, required)
- `ownerId` (string, required)
- `createdAt` (string ISO, required)

Memberships
- `groupId` (string, required)
- `groupName` (string, required)
- `userId` (string, required)
- `role` (enum: owner, admin, member)
- `displayName` (string, required)
- `personId` (string, optional)
- `claimedPlaceholderId` (string, optional)
- `claimedPlaceholderName` (string, optional)
- `createdAt` (string ISO, required)

People
- `groupId` (string, required)
- `name` (string, required)
- `userId` (string, optional)
- `isPlaceholder` (boolean, required)
- `createdAt` (string ISO, required)
- `createdBy` (string, required)

Quotes
- `groupId` (string, required)
- `personId` (string, required)
- `text` (string, required)
- `createdAt` (string ISO, required)
- `createdBy` (string, required)
- `createdByName` (string, required)
- `sourcePlaceholderId` (string, optional)

Invites
- `groupId` (string, required)
- `groupName` (string, required)
- `name` (string, optional)
- `code` (string, required)
- `createdAt` (string ISO, required)
- `createdBy` (string, required)

## Indexes
Add indexes to keep list queries fast.
- Memberships: `userId`, `groupId + displayName`, `groupId + userId` (unique)
- People: `groupId + name`
- Quotes: `groupId + createdAt`, `groupId + personId`, `groupId + sourcePlaceholderId`
- Invites: `groupId + createdAt`, `code` (unique)

## Notes
- Invite documents are readable by any authenticated user so they can join by code.
- New groups automatically create a default invite code.
- `VITE_APPWRITE_PERMISSION_MODE=strict` calls the `qm_api` function for all writes so group scoping stays intact.
- `VITE_APPWRITE_PERMISSION_MODE=relaxed` uses permissive document permissions (users can read/update/delete). This avoids Appwrite client permission errors for new members, but does not fully isolate groups.
