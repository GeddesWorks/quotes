import type { Models } from "appwrite";

export type MembershipRole = "owner" | "admin" | "member";

export interface GroupDoc extends Models.Document {
    name: string;
    ownerId: string;
    createdAt: string;
}

export interface MembershipDoc extends Models.Document {
    groupId: string;
    groupName: string;
    userId: string;
    role: MembershipRole;
    displayName: string;
    personId?: string;
    claimedPlaceholderId?: string;
    claimedPlaceholderName?: string;
    createdAt: string;
}

export interface PersonDoc extends Models.Document {
    groupId: string;
    name: string;
    userId?: string;
    isPlaceholder: boolean;
    createdAt: string;
    createdBy: string;
}

export interface QuoteDoc extends Models.Document {
    groupId: string;
    personId: string;
    text: string;
    createdAt: string;
    createdBy: string;
    createdByName: string;
    sourcePlaceholderId?: string;
}

export interface InviteDoc extends Models.Document {
    groupId: string;
    groupName: string;
    name?: string;
    code: string;
    createdAt: string;
    createdBy: string;
}
