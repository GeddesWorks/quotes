# Quotes Manager 2.0 Agent Notes

## Summary
Prototype quotes manager is being rebuilt as v2.0. Current app is a Vite + React + TypeScript app using Firebase (Firestore) with a single shared quotes collection. The goal is to migrate to Appwrite and add accounts, groups, invite flow, and multi-group support.

## Current State
- Frontend: React 19 + Vite + TypeScript + MUI
- Backend: Firebase (Firestore) with a single `quotes` collection
- Data model today: each document is a person with `name` and `quotes[]`

## Target Capabilities (v2.0)
- Appwrite-managed accounts (sign up / sign in)
- Create group(s)
- Invite by code or link
- Add users and quotes within a group
- Optional multi-group membership with group switching UI

## Proposed Appwrite Direction (confirmed)
- Use Appwrite Authentication for accounts
- Use Appwrite Database for groups, memberships, and quotes
- Use Appwrite document permissions to scope data to groups
- Use a custom group/membership model (no Appwrite Teams)
- Appwrite Cloud endpoint: https://sfo.cloud.appwrite.io/v1
- Appwrite Project ID: 69876eae003275d80ff8
- Hosting: Appwrite Cloud for now; may switch to self-hosted later.

## Decisions (confirmed)
- Auth: email/password
- Quotes: group members can add quotes for any group member or for non-members (placeholder people).
- Placeholder claim flow: when a new member joins, they can claim placeholder people; placeholder is deleted and quotes are reassigned to the new member.
- Roles: owner/admin/member. Owner can create admins and reassign owner; admins can create other admins and remove users; only owner can remove admins.
- Permissions: anyone can add quotes; only admins/owner can remove quotes.
- Invites: codes and links are permanent; joining requires account creation.
- Multi-group: selection persists; users without invite are prompted to create group or join by code; group switcher includes create-group.
- Data migration: import Firebase data into a new group with a test owner user.
- Storage: keep text-only, leave room for avatars/images later.
- Quote metadata: store extra metadata (quoter/quotee/time) now; UI currently shows quote + person who said it; later stats screen.

## Working Assumptions
- Implement group-scoped data in the database and keep quotes text-only for now.
- Secrets like Appwrite API keys should live in local env/config and never be committed.
