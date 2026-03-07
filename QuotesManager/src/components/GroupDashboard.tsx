import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Button,
    Card,
    CardActions,
    CardContent,
    Chip,
    Collapse,
    Divider,
    Grid,
    MenuItem,
    Stack,
    Tab,
    Tabs,
    ToggleButton,
    ToggleButtonGroup,
    TextField,
    Typography
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useGroups } from "../contexts/GroupContext";
import { account, appwriteConfig, databases } from "../util/appwrite";
import {
    claimPlaceholder,
    createInvite,
    createPlaceholderPerson,
    createQuote,
    deleteQuote,
    deleteQuoteSelf,
    deleteInvite,
    listGroupMembers,
    listInvites,
    listPeople,
    listQuotes,
    removePerson,
    renameInvite,
    removeMember,
    setQuoteExcuse,
    syncGroupPermissions,
    transferOwnership,
    updateGroupSpellingAllowList,
    updateMemberRole,
    updateQuoteText
} from "../util/appwriteApi";
import type { InviteDoc, MembershipDoc, PersonDoc, QuoteDoc } from "../util/appwriteTypes";
import ActionButton from "./ActionButton";
import QuoteCard from "./QuoteCard";
import LoadingState from "./LoadingState";

interface GroupDashboardProps {
    groupId: string;
    groupName: string;
    currentMembership: MembershipDoc;
}

interface AccountQuoteEntry {
    quote: QuoteDoc;
    groupId: string;
    groupName: string;
    personName: string;
}

interface ExactDuplicateGroup {
    key: string;
    quotes: QuoteDoc[];
}

interface NearDuplicatePair {
    key: string;
    similarity: number;
    left: QuoteDoc;
    right: QuoteDoc;
}

interface PunctuationIssueEntry {
    quote: QuoteDoc;
    issues: string[];
    suggestions: string[];
}

interface SpellingWordIssue {
    key: string;
    misspelling: string;
    suggestions: string[];
}

interface SpellingIssueEntry {
    quote: QuoteDoc;
    issues: SpellingWordIssue[];
    suggestions: string[];
}

const normalizeQuoteText = (text: string) =>
    text
        .toLowerCase()
        .replace(/['`’]/g, "")
        .replace(/[^a-z0-9\s]/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

const tokenizeQuote = (text: string) => normalizeQuoteText(text).split(" ").filter(Boolean);

const levenshteinDistance = (left: string, right: string) => {
    if (left === right) return 0;
    if (!left) return right.length;
    if (!right) return left.length;
    const row = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= right.length; j += 1) {
            const tmp = row[j];
            const cost = left[i - 1] === right[j - 1] ? 0 : 1;
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
            prev = tmp;
        }
    }
    return row[right.length];
};

const quoteSimilarity = (left: string, right: string) => {
    const normalizedLeft = normalizeQuoteText(left);
    const normalizedRight = normalizeQuoteText(right);
    if (!normalizedLeft || !normalizedRight) {
        return 0;
    }
    if (normalizedLeft === normalizedRight) {
        return 1;
    }
    const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);
    const distance = levenshteinDistance(normalizedLeft, normalizedRight);
    const charScore = 1 - distance / Math.max(maxLength, 1);

    const leftTokens = new Set(tokenizeQuote(left));
    const rightTokens = new Set(tokenizeQuote(right));
    const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
    const union = new Set([...leftTokens, ...rightTokens]).size || 1;
    const tokenScore = intersection / union;

    return Math.max(charScore, tokenScore);
};

const findPunctuationIssues = (text: string) => {
    const issues: string[] = [];
    if (/\s{2,}/.test(text)) {
        issues.push("Contains repeated spaces");
    }
    if (/\s[,.!?;:]/.test(text)) {
        issues.push("Has a space before punctuation");
    }
    if (/[,.!?;:](?!\s|$|["'])\w/.test(text)) {
        issues.push("May be missing a space after punctuation");
    }
    if (((text.match(/"/g) || []).length % 2) !== 0) {
        issues.push("Unbalanced double quotes");
    }
    if (/[!?;:]{2,}|,{2,}|\.{4,}/.test(text)) {
        issues.push("Repeated punctuation");
    }
    if (
        /\b(?:im|ive|id|ill|dont|cant|wont|didnt|isnt|arent|wasnt|werent|couldnt|wouldnt|shouldnt|thats|theres|youre|theyre|weve|youve|lets)\b/i.test(
            text
        )
    ) {
        issues.push("Possible missing apostrophes");
    }
    if (/\bi\b/.test(text)) {
        issues.push("Lowercase 'i' pronoun");
    }
    if (capitalizeLikelySentenceStarts(text) !== text) {
        issues.push("Possible lowercase sentence starts");
    }
    return issues;
};

const contractionFixes: Record<string, string> = {
    im: "I'm",
    ive: "I've",
    id: "I'd",
    ill: "I'll",
    dont: "don't",
    cant: "can't",
    wont: "won't",
    didnt: "didn't",
    isnt: "isn't",
    arent: "aren't",
    wasnt: "wasn't",
    werent: "weren't",
    couldnt: "couldn't",
    wouldnt: "wouldn't",
    shouldnt: "shouldn't",
    thats: "that's",
    theres: "there's",
    youre: "you're",
    theyre: "they're",
    weve: "we've",
    youve: "you've",
    lets: "let's"
};

const fixPunctuationSpacing = (text: string) =>
    text
        .replace(/\s+([,.!?;:])/g, "$1")
        .replace(/([,.!?;:])([A-Za-z0-9])/g, "$1 $2")
        .replace(/\s{2,}/g, " ")
        .trim();

const collapseRepeatedPunctuation = (text: string) =>
    text.replace(/([!?;:]){2,}/g, "$1").replace(/,{2,}/g, ",").replace(/\.{4,}/g, "...");

const fixCommonContractions = (text: string) =>
    text.replace(/\b([A-Za-z]+)\b/g, (word) => {
        const replacement = contractionFixes[word.toLowerCase()];
        if (!replacement) {
            return word;
        }
        if (word === word.toUpperCase()) {
            return replacement.toUpperCase();
        }
        return replacement;
    });

const fixCommonCapitalization = (text: string) =>
    text.replace(/\bi\b/g, "I");

const capitalizeLikelySentenceStarts = (text: string) => {
    let shouldCapitalize = true;
    let output = "";

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];

        if (shouldCapitalize && /[a-z]/.test(character)) {
            output += character.toUpperCase();
            shouldCapitalize = false;
            continue;
        }

        output += character;

        if (/[.!?]/.test(character) || character === "\n") {
            shouldCapitalize = true;
            continue;
        }

        if (/[A-Za-z0-9]/.test(character)) {
            shouldCapitalize = false;
        }
    }

    return output;
};

const promoteLikelySentenceBreakBeforeImGonna = (text: string) =>
    text.replace(
        /\b(kid|child|boy|girl|guy|person|dude|friend|man|woman|bro|brother|sister|dad|mom|father|mother)\s+I'm\s+gonna\b/gi,
        (_, noun: string) => `${noun}. I'm gonna`
    );

const maybeBalanceDoubleQuotes = (text: string) => {
    const quoteCount = (text.match(/"/g) || []).length;
    if (quoteCount % 2 === 0) {
        return text;
    }
    return `${text}"`;
};

const applyEndingPunctuation = (text: string, punctuation: "." | "?" | "!") => {
    const trimmed = text.trim();
    if (!trimmed) {
        return trimmed;
    }
    const endingQuote = trimmed.match(/["']$/)?.[0];
    const core = endingQuote ? trimmed.slice(0, -1) : trimmed;
    const withoutEnding = core.replace(/[.!?]+$/, "");
    const finalized = `${withoutEnding}${punctuation}`;
    return endingQuote ? `${finalized}${endingQuote}` : finalized;
};

const normalizeSpeakerName = (value: string) =>
    value
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\b([a-z])/g, (match) => match.toUpperCase());

const looksLikeSpeakerName = (value: string) => {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized) {
        return false;
    }
    if (/[,.!?;:]/.test(normalized)) {
        return false;
    }
    const words = normalized.split(" ");
    if (words.length > 3) {
        return false;
    }
    return /^[A-Za-z][A-Za-z' -]{0,30}$/.test(normalized);
};

const normalizeDialogueSpeech = (value: string) => {
    let text = value.trim();
    text = collapseRepeatedPunctuation(text);
    text = fixPunctuationSpacing(text);
    text = fixCommonContractions(text);
    text = fixCommonCapitalization(text);
    text = capitalizeLikelySentenceStarts(text);
    if (!/[.!?]["']?$/.test(text)) {
        text = applyEndingPunctuation(text, ".");
    }
    return text;
};

const formatDialogueFromAlternatingQuotedSegments = (text: string) => {
    const normalized = maybeBalanceDoubleQuotes(text.replace(/[“”]/g, '"'));
    const segments: string[] = [];
    const quotedPattern = /"([^"]*)"/g;
    let match: RegExpExecArray | null = quotedPattern.exec(normalized);
    while (match) {
        segments.push(match[1]);
        match = quotedPattern.exec(normalized);
    }
    if (segments.length < 4 || segments.length % 2 !== 0) {
        return "";
    }
    const lines: string[] = [];
    for (let index = 0; index < segments.length; index += 2) {
        const rawName = segments[index];
        const rawSpeech = segments[index + 1];
        if (!looksLikeSpeakerName(rawName) || !rawSpeech.trim()) {
            return "";
        }
        lines.push(`${normalizeSpeakerName(rawName)}: "${normalizeDialogueSpeech(rawSpeech)}"`);
    }
    return lines.join("\n");
};

const formatDialogueFromNamedQuotePattern = (text: string) => {
    const normalized = maybeBalanceDoubleQuotes(text.replace(/[“”]/g, '"'));
    const pattern = /([A-Za-z][A-Za-z' -]{0,30})\s*:?\s*"([^"]+)"/g;
    const matches = Array.from(normalized.matchAll(pattern));
    if (matches.length < 2) {
        return "";
    }
    const lines = matches
        .map((match) => {
            const [, rawName, rawSpeech] = match;
            if (!looksLikeSpeakerName(rawName) || !rawSpeech.trim()) {
                return "";
            }
            return `${normalizeSpeakerName(rawName)}: "${normalizeDialogueSpeech(rawSpeech)}"`;
        })
        .filter(Boolean);
    if (lines.length < 2) {
        return "";
    }
    return lines.join("\n");
};

const buildDialogueSuggestions = (text: string) => {
    const suggestions: string[] = [];
    const add = (candidate: string) => {
        const trimmed = candidate.trim();
        if (!trimmed || suggestions.includes(trimmed)) {
            return;
        }
        suggestions.push(trimmed);
    };
    add(formatDialogueFromAlternatingQuotedSegments(text));
    add(formatDialogueFromNamedQuotePattern(text));
    return suggestions;
};

const buildPunctuationSuggestions = (text: string, issues: string[]) => {
    const suggestions: string[] = [];
    const trimmedOriginal = text.trim();
    const pushSuggestion = (candidate: string) => {
        const trimmed = candidate.trim();
        if (!trimmed || trimmed === trimmedOriginal || suggestions.includes(trimmed)) {
            return;
        }
        suggestions.push(trimmed);
    };

    const hasSpacingIssue = issues.some(
        (issue) =>
            issue === "Contains repeated spaces" ||
            issue === "Has a space before punctuation" ||
            issue === "May be missing a space after punctuation"
    );
    const hasRepeatedPunctuationIssue = issues.includes("Repeated punctuation");
    const hasQuoteIssue = issues.includes("Unbalanced double quotes");
    const hasContractionIssue = issues.includes("Possible missing apostrophes");
    const hasLowercasePronounIssue = issues.includes("Lowercase 'i' pronoun");
    const hasSentenceStartIssue = issues.includes("Possible lowercase sentence starts");

    buildDialogueSuggestions(text).forEach((candidate) => pushSuggestion(candidate));

    let baseline = text;
    if (hasContractionIssue) {
        baseline = fixCommonContractions(baseline);
        pushSuggestion(baseline);
        const withSentenceBreak = promoteLikelySentenceBreakBeforeImGonna(baseline);
        pushSuggestion(withSentenceBreak);
        baseline = withSentenceBreak;
    }
    if (hasLowercasePronounIssue) {
        baseline = fixCommonCapitalization(baseline);
        pushSuggestion(baseline);
    }
    if (hasSentenceStartIssue) {
        baseline = capitalizeLikelySentenceStarts(baseline);
        pushSuggestion(baseline);
    }
    if (hasSpacingIssue) {
        baseline = fixPunctuationSpacing(baseline);
    }
    if (hasRepeatedPunctuationIssue) {
        baseline = collapseRepeatedPunctuation(baseline);
    }
    if (hasQuoteIssue) {
        baseline = maybeBalanceDoubleQuotes(baseline);
    }
    pushSuggestion(baseline);

    return suggestions.slice(0, 3);
};

const normalizeAllowWordToken = (value: string) =>
    value
        .trim()
        .toLowerCase()
        .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");

const defaultSpellingAllowList = [
    "gonna",
    "wanna",
    "gotta",
    "yall",
    "aint",
    "imma",
    "nah",
    "bro",
    "bruh",
    "yo",
    "lol",
    "lmao",
    "rofl",
    "sus",
    "af"
];

const commonMisspellings: Record<string, string[]> = {
    alot: ["a lot"],
    definately: ["definitely"],
    definatly: ["definitely"],
    occured: ["occurred"],
    seperate: ["separate"],
    recieve: ["receive"],
    wierd: ["weird"],
    thier: ["their"],
    becuase: ["because"],
    acheive: ["achieve"],
    neccessary: ["necessary"],
    unessesary: ["unnecessary"],
    accomodate: ["accommodate"],
    arguement: ["argument"],
    enviroment: ["environment"],
    govement: ["government"],
    goverment: ["government"],
    happend: ["happened"],
    sugesstion: ["suggestion"],
    sugegstion: ["suggestion"],
    teh: ["the"],
    adress: ["address"]
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const applyCasePattern = (original: string, replacement: string) => {
    if (original === original.toUpperCase()) {
        return replacement.toUpperCase();
    }
    if (original[0] && original[0] === original[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
};

const detectSpellingIssues = (text: string, allowedWords: Set<string>): SpellingWordIssue[] => {
    const matches = text.match(/[A-Za-z']+/g) ?? [];
    const seen = new Set<string>();
    const issues: SpellingWordIssue[] = [];

    for (const match of matches) {
        const key = match.toLowerCase();
        if (allowedWords.has(key)) {
            continue;
        }
        if (seen.has(key)) {
            continue;
        }
        const suggestions = commonMisspellings[key];
        if (!suggestions || suggestions.length === 0) {
            continue;
        }
        seen.add(key);
        issues.push({
            key,
            misspelling: match,
            suggestions
        });
    }

    return issues;
};

const applySpellingIssueReplacements = (
    text: string,
    issues: SpellingWordIssue[],
    alternateSelection?: Record<string, number>
) => {
    let result = text;

    for (const issue of issues) {
        const suggestionIndex = Math.min(
            alternateSelection?.[issue.key] ?? 0,
            Math.max(issue.suggestions.length - 1, 0)
        );
        const replacement = issue.suggestions[suggestionIndex];
        if (!replacement) {
            continue;
        }
        result = result.replace(new RegExp(`\\b${escapeRegExp(issue.key)}\\b`, "gi"), (matched) =>
            applyCasePattern(matched, replacement)
        );
    }

    return result;
};

const buildSpellingSuggestions = (text: string, issues: SpellingWordIssue[]) => {
    const suggestions: string[] = [];
    const original = text.trim();

    const pushSuggestion = (candidate: string) => {
        const normalized = candidate.trim();
        if (!normalized || normalized === original || suggestions.includes(normalized)) {
            return;
        }
        suggestions.push(normalized);
    };

    const base = applySpellingIssueReplacements(text, issues);
    pushSuggestion(base);

    for (const issue of issues) {
        for (let optionIndex = 1; optionIndex < issue.suggestions.length; optionIndex += 1) {
            pushSuggestion(
                applySpellingIssueReplacements(text, issues, {
                    [issue.key]: optionIndex
                })
            );
            if (suggestions.length >= 3) {
                return suggestions;
            }
        }
    }

    return suggestions.slice(0, 3);
};

const GroupDashboard: React.FC<GroupDashboardProps> = ({
    groupId,
    groupName,
    currentMembership
}) => {
    const { user, refresh: refreshAuth } = useAuth();
    const {
        refresh: refreshGroups,
        setActiveGroupId,
        memberships: allMemberships,
        groups
    } = useGroups();
    const navigate = useNavigate();
    const location = useLocation();
    const [primaryTab, setPrimaryTab] = useState<"account" | "group">("group");
    const [groupTab, setGroupTab] = useState("quotes");
    const [members, setMembers] = useState<MembershipDoc[]>([]);
    const [people, setPeople] = useState<PersonDoc[]>([]);
    const [quotes, setQuotes] = useState<QuoteDoc[]>([]);
    const [invites, setInvites] = useState<InviteDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const [selectedPersonId, setSelectedPersonId] = useState("");
    const [newPersonMode, setNewPersonMode] = useState<"invite" | "placeholder" | "">("");
    const [newPersonName, setNewPersonName] = useState("");
    const [quoteText, setQuoteText] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [newInviteName, setNewInviteName] = useState("General");
    const [inviteNameDrafts, setInviteNameDrafts] = useState<Record<string, string>>({});
    const [editingInviteId, setEditingInviteId] = useState<string | null>(null);
    const [leaving, setLeaving] = useState(false);
    const [peopleFilter, setPeopleFilter] = useState<"all" | "members" | "placeholders">("all");
    const [peopleSearch, setPeopleSearch] = useState("");
    const [memberFilter, setMemberFilter] = useState<"all" | "admins" | "members">("all");
    const [memberSearch, setMemberSearch] = useState("");
    const [expandedInvites, setExpandedInvites] = useState<Record<string, boolean>>({});
    const [addedVisibleCount, setAddedVisibleCount] = useState(8);
    const [quotedVisibleCount, setQuotedVisibleCount] = useState(8);
    const [adminQuoteVisibleCount, setAdminQuoteVisibleCount] = useState(20);
    const [accountSubmitting, setAccountSubmitting] = useState(false);
    const [accountMessage, setAccountMessage] = useState<string | null>(null);
    const [accountError, setAccountError] = useState<string | null>(null);
    const [accountListsError, setAccountListsError] = useState<string | null>(null);
    const [accountLoading, setAccountLoading] = useState(false);
    const [nameDraft, setNameDraft] = useState("");
    const [emailDraft, setEmailDraft] = useState("");
    const [emailPassword, setEmailPassword] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [addedQuotes, setAddedQuotes] = useState<AccountQuoteEntry[]>([]);
    const [quotedQuotes, setQuotedQuotes] = useState<AccountQuoteEntry[]>([]);
    const [addedSearch, setAddedSearch] = useState("");
    const [quotedSearch, setQuotedSearch] = useState("");
    const [duplicateScanRan, setDuplicateScanRan] = useState(false);
    const [duplicateGroups, setDuplicateGroups] = useState<ExactDuplicateGroup[]>([]);
    const [nearDuplicatePairs, setNearDuplicatePairs] = useState<NearDuplicatePair[]>([]);
    const [punctuationScanRan, setPunctuationScanRan] = useState(false);
    const [punctuationIssues, setPunctuationIssues] = useState<PunctuationIssueEntry[]>([]);
    const [punctuationDrafts, setPunctuationDrafts] = useState<Record<string, string>>({});
    const [punctuationActionLoading, setPunctuationActionLoading] = useState<Record<string, boolean>>({});
    const [spellingScanRan, setSpellingScanRan] = useState(false);
    const [spellingIssues, setSpellingIssues] = useState<SpellingIssueEntry[]>([]);
    const [spellingDrafts, setSpellingDrafts] = useState<Record<string, string>>({});
    const [spellingActionLoading, setSpellingActionLoading] = useState<Record<string, boolean>>({});
    const [spellingAllowInput, setSpellingAllowInput] = useState("");
    const [spellingAllowWords, setSpellingAllowWords] = useState<string[]>([]);
    const [spellingAllowSaving, setSpellingAllowSaving] = useState(false);
    const canSyncPermissions = currentMembership.role === "owner" || currentMembership.role === "admin";

    const loadAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [memberDocs, peopleDocs, quoteDocs, inviteDocs] = await Promise.all([
                listGroupMembers(groupId),
                listPeople(groupId),
                listQuotes(groupId),
                listInvites(groupId)
            ]);

            const duplicateMemberProfileCount = peopleDocs
                .filter((person) => !person.isPlaceholder && Boolean(person.userId))
                .reduce((counts, person) => {
                    const key = person.userId ?? "";
                    counts.set(key, (counts.get(key) ?? 0) + 1);
                    return counts;
                }, new Map<string, number>());

            const hasDuplicateMemberProfiles = Array.from(duplicateMemberProfileCount.values()).some(
                (count) => count > 1
            );

            if (canSyncPermissions && hasDuplicateMemberProfiles) {
                await syncGroupPermissions(groupId);
                const [syncedMembers, syncedPeople, syncedQuotes, syncedInvites] = await Promise.all([
                    listGroupMembers(groupId),
                    listPeople(groupId),
                    listQuotes(groupId),
                    listInvites(groupId)
                ]);
                setMembers(syncedMembers);
                setPeople(syncedPeople);
                setQuotes(syncedQuotes);
                setInvites(syncedInvites);
                return;
            }

            setMembers(memberDocs);
            setPeople(peopleDocs);
            setQuotes(quoteDocs);
            setInvites(inviteDocs);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load group data.");
        } finally {
            setLoading(false);
        }
    }, [canSyncPermissions, groupId]);

    useEffect(() => {
        void loadAll();
    }, [loadAll]);

    const memberIds = useMemo(
        () => Array.from(new Set([...members.map((member) => member.userId), currentMembership.userId])),
        [members, currentMembership.userId]
    );
    const adminIds = useMemo(() => {
        const ids = members.filter((member) => member.role !== "member").map((member) => member.userId);
        if (currentMembership.role !== "member") {
            ids.push(currentMembership.userId);
        }
        return Array.from(new Set(ids));
    }, [members, currentMembership.role, currentMembership.userId]);

    const isOwner = currentMembership.role === "owner";
    const isAdmin = isOwner || currentMembership.role === "admin";
    const showSync = appwriteConfig.permissionMode !== "relaxed";
    const punctuationActionsInFlight = useMemo(
        () => Object.values(punctuationActionLoading).some(Boolean),
        [punctuationActionLoading]
    );
    const spellingActionsInFlight = useMemo(
        () => Object.values(spellingActionLoading).some(Boolean),
        [spellingActionLoading]
    );
    const submittingCardSx = submitting ? { opacity: 0.68, pointerEvents: "none" } : undefined;
    const accountSubmittingCardSx = accountSubmitting
        ? { opacity: 0.68, pointerEvents: "none" }
        : undefined;
    const groupDoc = useMemo(
        () => groups.find((candidate) => candidate.$id === groupId),
        [groups, groupId]
    );
    const spellingAllowWordSet = useMemo(
        () =>
            new Set(
                [...defaultSpellingAllowList, ...spellingAllowWords]
                    .map((word) => normalizeAllowWordToken(word))
                    .filter(Boolean)
            ),
        [spellingAllowWords]
    );

    const groupTabs = useMemo(
        () =>
            isAdmin
                ? [
                      { key: "quotes", label: "Quotes" },
                      { key: "people", label: "People" },
                      { key: "members", label: "Members" },
                      { key: "invites", label: "Invites" },
                      { key: "tools", label: "Tools" }
                  ]
                : [
                      { key: "invites", label: "Invites" },
                      { key: "leave", label: "Leave group" },
                      { key: "more", label: "More" }
                  ],
        [isAdmin]
    );

    useEffect(() => {
        const keys = new Set(groupTabs.map((option) => option.key));
        if (!keys.has(groupTab)) {
            setGroupTab(groupTabs[0]?.key ?? "invites");
        }
    }, [groupTab, groupTabs]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const target = params.get("tab");
        if (!target) {
            return;
        }
        if (target === "account") {
            setPrimaryTab("account");
            return;
        }
        const found = groupTabs.find((option) => option.key === target);
        if (found) {
            setPrimaryTab("group");
            setGroupTab(found.key);
        }
    }, [location.search, groupTabs]);

    useEffect(() => {
        setInviteNameDrafts((prev) => {
            const next: Record<string, string> = { ...prev };
            const ids = new Set(invites.map((invite) => invite.$id));
            for (const invite of invites) {
                if (!(invite.$id in next)) {
                    next[invite.$id] = invite.name || "";
                }
            }
            for (const key of Object.keys(next)) {
                if (!ids.has(key)) {
                    delete next[key];
                }
            }
            return next;
        });

        setExpandedInvites((prev) => {
            const next: Record<string, boolean> = { ...prev };
            const ids = new Set(invites.map((invite) => invite.$id));
            for (const key of Object.keys(next)) {
                if (!ids.has(key)) {
                    delete next[key];
                }
            }
            return next;
        });
    }, [invites]);

    useEffect(() => {
        if (!user) {
            setNameDraft("");
            setEmailDraft("");
            return;
        }
        setNameDraft(user.name ?? "");
        setEmailDraft(user.email ?? "");
    }, [user]);

    useEffect(() => {
        const sourceWords = Array.isArray(groupDoc?.spellingAllowList)
            ? groupDoc.spellingAllowList
            : [];
        const normalized = Array.from(
            new Set(
                sourceWords
                    .map((word) => normalizeAllowWordToken(String(word || "")))
                    .filter((word) => /^[a-z0-9][a-z0-9'-]{0,31}$/.test(word))
            )
        );
        setSpellingAllowWords(normalized);
    }, [groupDoc]);

    const loadAccountQuotes = useCallback(async () => {
        if (!user) {
            setAddedQuotes([]);
            setQuotedQuotes([]);
            return;
        }
        if (allMemberships.length === 0) {
            setAddedQuotes([]);
            setQuotedQuotes([]);
            return;
        }
        setAccountLoading(true);
        setAccountListsError(null);
        try {
            const groupNameMap = new Map<string, string>();
            for (const group of groups) {
                groupNameMap.set(group.$id, group.name);
            }
            for (const membership of allMemberships) {
                if (!groupNameMap.has(membership.groupId)) {
                    groupNameMap.set(membership.groupId, membership.groupName || "Group");
                }
            }

            const results = await Promise.all(
                allMemberships.map(async (membership) => {
                    const [quoteDocs, peopleDocs] = await Promise.all([
                        listQuotes(membership.groupId),
                        listPeople(membership.groupId)
                    ]);
                    return {
                        membership,
                        quotes: quoteDocs,
                        people: peopleDocs,
                        groupName:
                            groupNameMap.get(membership.groupId) ||
                            membership.groupName ||
                            "Group"
                    };
                })
            );

            const added: AccountQuoteEntry[] = [];
            const quoted: AccountQuoteEntry[] = [];

            for (const result of results) {
                const peopleMap = new Map(result.people.map((person) => [person.$id, person]));
                for (const quote of result.quotes) {
                    const entry: AccountQuoteEntry = {
                        quote,
                        groupId: result.membership.groupId,
                        groupName: result.groupName,
                        personName: peopleMap.get(quote.personId)?.name || "Unknown"
                    };
                    if (quote.createdBy === user.$id) {
                        added.push(entry);
                    }
                    if (result.membership.personId && quote.personId === result.membership.personId) {
                        quoted.push(entry);
                    }
                }
            }

            const sortByDate = (entries: AccountQuoteEntry[]) =>
                entries.sort((a, b) => (b.quote.createdAt || "").localeCompare(a.quote.createdAt || ""));
            setAddedQuotes(sortByDate(added));
            setQuotedQuotes(sortByDate(quoted));
        } catch (err) {
            setAccountListsError(
                err instanceof Error ? err.message : "Failed to load your quote history."
            );
        } finally {
            setAccountLoading(false);
        }
    }, [allMemberships, groups, user]);

    useEffect(() => {
        void loadAccountQuotes();
    }, [loadAccountQuotes]);

    const peopleMap = useMemo(() => new Map(people.map((person) => [person.$id, person])), [people]);
    const placeholderPeople = people.filter((person) => person.isPlaceholder);
    const quoteCountsByPerson = useMemo(() => {
        const counts = new Map<string, number>();
        for (const quote of quotes) {
            counts.set(quote.personId, (counts.get(quote.personId) || 0) + 1);
        }
        return counts;
    }, [quotes]);
    const currentMember = useMemo(
        () => members.find((member) => member.userId === currentMembership.userId) ?? currentMembership,
        [members, currentMembership]
    );
    const hasClaimedPlaceholder = Boolean(currentMember.claimedPlaceholderId);
    const claimablePlaceholders = useMemo(() => {
        const joinedAt = Date.parse(currentMember.createdAt || "") || 0;
        return placeholderPeople.filter((person) => {
            const createdAt = Date.parse(person.createdAt || "") || 0;
            return createdAt < joinedAt;
        });
    }, [currentMember.createdAt, placeholderPeople]);

    const filteredPeople = useMemo(() => {
        let filtered = people;
        if (peopleFilter === "members") {
            filtered = filtered.filter((person) => !person.isPlaceholder);
        } else if (peopleFilter === "placeholders") {
            filtered = filtered.filter((person) => person.isPlaceholder);
        }
        if (peopleSearch.trim()) {
            const query = peopleSearch.trim().toLowerCase();
            filtered = filtered.filter((person) => person.name.toLowerCase().includes(query));
        }
        return filtered;
    }, [people, peopleFilter, peopleSearch]);

    const filteredMembers = useMemo(() => {
        let filtered = members;
        if (memberFilter === "admins") {
            filtered = filtered.filter((member) => member.role !== "member");
        } else if (memberFilter === "members") {
            filtered = filtered.filter((member) => member.role === "member");
        }
        if (memberSearch.trim()) {
            const query = memberSearch.trim().toLowerCase();
            filtered = filtered.filter((member) =>
                member.displayName.toLowerCase().includes(query)
            );
        }
        return filtered;
    }, [memberFilter, memberSearch, members]);

    const filteredAddedQuotes = useMemo(() => {
        if (!addedSearch.trim()) {
            return addedQuotes;
        }
        const query = addedSearch.trim().toLowerCase();
        return addedQuotes.filter((entry) => {
            return (
                entry.quote.text.toLowerCase().includes(query) ||
                entry.personName.toLowerCase().includes(query) ||
                entry.groupName.toLowerCase().includes(query)
            );
        });
    }, [addedQuotes, addedSearch]);

    const filteredQuotedQuotes = useMemo(() => {
        if (!quotedSearch.trim()) {
            return quotedQuotes;
        }
        const query = quotedSearch.trim().toLowerCase();
        return quotedQuotes.filter((entry) => {
            return (
                entry.quote.text.toLowerCase().includes(query) ||
                entry.quote.createdByName.toLowerCase().includes(query) ||
                entry.groupName.toLowerCase().includes(query)
            );
        });
    }, [quotedQuotes, quotedSearch]);

    const visibleAddedQuotes = useMemo(
        () => filteredAddedQuotes.slice(0, addedVisibleCount),
        [addedVisibleCount, filteredAddedQuotes]
    );
    const visibleQuotedQuotes = useMemo(
        () => filteredQuotedQuotes.slice(0, quotedVisibleCount),
        [filteredQuotedQuotes, quotedVisibleCount]
    );
    const visibleAdminQuotes = useMemo(
        () => quotes.slice(0, adminQuoteVisibleCount),
        [adminQuoteVisibleCount, quotes]
    );

    useEffect(() => {
        setAddedVisibleCount(8);
    }, [addedSearch, addedQuotes.length]);

    useEffect(() => {
        setQuotedVisibleCount(8);
    }, [quotedSearch, quotedQuotes.length]);

    useEffect(() => {
        setAdminQuoteVisibleCount(20);
    }, [groupId, quotes.length]);

    const updateDisplayNameAcrossGroups = async (nextName: string) => {
        if (!appwriteConfig.databaseId) {
            return;
        }
        const updates = allMemberships.map(async (membership) => {
            const operations: Promise<unknown>[] = [];
            operations.push(
                databases.updateDocument<MembershipDoc>(
                    appwriteConfig.databaseId,
                    appwriteConfig.collections.memberships,
                    membership.$id,
                    { displayName: nextName }
                )
            );
            if (membership.personId) {
                operations.push(
                    databases.updateDocument<PersonDoc>(
                        appwriteConfig.databaseId,
                        appwriteConfig.collections.people,
                        membership.personId,
                        { name: nextName }
                    )
                );
            }
            await Promise.allSettled(operations);
        });
        await Promise.all(updates);
        await refreshGroups();
    };

    const handleUpdateName = async () => {
        if (!user) return;
        const nextName = nameDraft.trim();
        if (!nextName) {
            setAccountError("Name is required.");
            return;
        }
        setAccountSubmitting(true);
        setAccountError(null);
        setAccountMessage(null);
        try {
            await account.updateName(nextName);
            await updateDisplayNameAcrossGroups(nextName);
            await refreshAuth();
            setAccountMessage("Name updated.");
        } catch (err) {
            setAccountError(err instanceof Error ? err.message : "Failed to update name.");
        } finally {
            setAccountSubmitting(false);
        }
    };

    const handleUpdateEmail = async () => {
        if (!user) return;
        const nextEmail = emailDraft.trim();
        if (!nextEmail || !emailPassword.trim()) {
            setAccountError("Enter your new email and current password.");
            return;
        }
        setAccountSubmitting(true);
        setAccountError(null);
        setAccountMessage(null);
        try {
            await account.updateEmail(nextEmail, emailPassword);
            await refreshAuth();
            setEmailPassword("");
            setAccountMessage("Email updated.");
        } catch (err) {
            setAccountError(err instanceof Error ? err.message : "Failed to update email.");
        } finally {
            setAccountSubmitting(false);
        }
    };

    const handleUpdatePassword = async () => {
        if (!user) return;
        if (!currentPassword.trim() || !newPassword.trim()) {
            setAccountError("Enter your current and new password.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setAccountError("New password entries do not match.");
            return;
        }
        setAccountSubmitting(true);
        setAccountError(null);
        setAccountMessage(null);
        try {
            await account.updatePassword(newPassword, currentPassword);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setAccountMessage("Password updated.");
        } catch (err) {
            setAccountError(err instanceof Error ? err.message : "Failed to update password.");
        } finally {
            setAccountSubmitting(false);
        }
    };

    const handleDeleteAccountQuote = async (entry: AccountQuoteEntry) => {
        if (!window.confirm("Remove this quote?")) {
            return;
        }
        setAccountSubmitting(true);
        setAccountError(null);
        try {
            await deleteQuoteSelf(entry.groupId, entry.quote.$id);
            await loadAccountQuotes();
            if (entry.groupId === groupId) {
                await loadAll();
            }
        } catch (err) {
            setAccountError(err instanceof Error ? err.message : "Failed to remove quote.");
        } finally {
            setAccountSubmitting(false);
        }
    };

    const handleAddQuote = async () => {
        if (!user) return;
        if (!quoteText.trim()) {
            setError("Please enter a quote.");
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            let personId = selectedPersonId;
            if (selectedPersonId === "__new__") {
                if (newPersonMode !== "placeholder") {
                    setError("Choose how to add the new person.");
                    return;
                }
                if (!newPersonName.trim()) {
                    setError("Enter a placeholder name.");
                    return;
                }
                const placeholder = await createPlaceholderPerson(
                    groupId,
                    newPersonName.trim(),
                    memberIds,
                    adminIds,
                    user.$id
                );
                personId = placeholder.$id;
            }

            if (!personId) {
                setError("Select a person or add a new placeholder.");
                return;
            }

            await createQuote(
                groupId,
                personId,
                quoteText.trim(),
                user.$id,
                currentMembership.displayName,
                memberIds,
                adminIds
            );
            setQuoteText("");
            setNewPersonName("");
            setSelectedPersonId("");
            setNewPersonMode("");
            await loadAll();
            await loadAccountQuotes();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to add quote.";
            setError(message);
            if (message.toLowerCase().includes("not a member")) {
                await refreshGroups();
                navigate("/", { replace: true });
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteQuote = async (quoteId: string) => {
        if (!isAdmin) return;
        if (!window.confirm("Remove this quote?") || !quoteId) {
            return;
        }
        setSubmitting(true);
        try {
            await deleteQuote(groupId, quoteId);
            await loadAll();
            await loadAccountQuotes();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to remove quote.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleClaimPlaceholder = async (placeholderId: string) => {
        setSubmitting(true);
        setError(null);
        try {
            await claimPlaceholder(placeholderId, currentMember, groupId);
            await loadAll();
            await refreshGroups();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to claim placeholder.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleCreateInvite = async () => {
        if (!isAdmin) return;
        setSubmitting(true);
        setError(null);
        try {
            const inviteAdmins = adminIds.length > 0 ? adminIds : [currentMembership.userId].filter(Boolean);
            const inviteName = newInviteName.trim() || "General";
            await createInvite(groupId, groupName, inviteAdmins, inviteName);
            await loadAll();
            setNewInviteName(inviteName);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create invite.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleSync = async () => {
        if (!isAdmin) return;
        setSubmitting(true);
        setMessage(null);
        setError(null);
        try {
            await syncGroupPermissions(groupId);
            await loadAll();
            setMessage("Permissions refreshed for the whole group.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to sync permissions.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleRoleChange = async (membership: MembershipDoc, role: "admin" | "member") => {
        if (!isAdmin) return;
        setSubmitting(true);
        try {
            await updateMemberRole(membership.$id, role, groupId);
            await syncGroupPermissions(groupId);
            await loadAll();
            await refreshGroups();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update role.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleTransferOwnership = async (nextOwner: MembershipDoc) => {
        if (!isOwner) return;
        if (!window.confirm(`Transfer ownership to ${nextOwner.displayName}?`)) {
            return;
        }
        setSubmitting(true);
        try {
            await transferOwnership(groupId, currentMembership, nextOwner);
            await loadAll();
            await refreshGroups();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to transfer ownership.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemoveMember = async (membership: MembershipDoc) => {
        if (!isAdmin) return;
        if (membership.role === "admin" && !isOwner) {
            setError("Only the owner can remove another admin.");
            return;
        }
        if (!window.confirm(`Remove ${membership.displayName} from the group?`)) {
            return;
        }
        setSubmitting(true);
        try {
            await removeMember(membership);
            await syncGroupPermissions(groupId);
            await loadAll();
            await refreshGroups();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to remove member.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleLeaveGroup = async () => {
        if (isOwner) {
            setError("Transfer ownership before leaving the group.");
            return;
        }
        if (!window.confirm("Leave this group?") || !currentMembership) {
            return;
        }
        setSubmitting(true);
        setLeaving(true);
        setError(null);
        try {
            await removeMember(currentMembership);
            const result = await refreshGroups();
            if (!result.ok) {
                setError("Left the group, but failed to refresh your groups. Please reload.");
                setLeaving(false);
                return;
            }
            if (result.groups.length > 0) {
                const nextId = result.activeGroupId ?? result.groups[0].$id;
                if (nextId) {
                    setActiveGroupId(nextId);
                }
            }
            navigate("/", { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to leave group.");
            setLeaving(false);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemovePlaceholder = async (person: PersonDoc) => {
        if (!isAdmin) return;
        const quoteCount = quoteCountsByPerson.get(person.$id) || 0;
        if (quoteCount > 0) {
            const confirmDelete = window.confirm(
                `${person.name} has ${quoteCount} quote${quoteCount === 1 ? "" : "s"}. Removing will delete them. Continue?`
            );
            if (!confirmDelete) {
                return;
            }
        } else if (!window.confirm(`Remove ${person.name}?`)) {
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            await removePerson(groupId, person.$id, quoteCount > 0);
            await loadAll();
            await loadAccountQuotes();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to remove placeholder.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleRenameInvite = async (inviteId: string) => {
        if (!isAdmin) return;
        const name = (inviteNameDrafts[inviteId] || "").trim();
        if (!name) {
            setError("Invite name cannot be empty.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await renameInvite(inviteId, name, groupId);
            await loadAll();
            setEditingInviteId(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to rename invite.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteInvite = async (inviteId: string) => {
        if (!isAdmin) return;
        if (!window.confirm("Delete this invite code?")) {
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await deleteInvite(inviteId, groupId);
            await loadAll();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete invite.");
        } finally {
            setSubmitting(false);
        }
    };

    const toggleInviteDetails = (inviteId: string) => {
        setExpandedInvites((prev) => ({
            ...prev,
            [inviteId]: !prev[inviteId]
        }));
    };

    const runDuplicateScan = useCallback(() => {
        const candidates = quotes.filter((quote) => !quote.duplicateExcused);
        const grouped = new Map<string, QuoteDoc[]>();
        for (const quote of candidates) {
            const normalized = normalizeQuoteText(quote.text);
            if (!normalized) continue;
            if (!grouped.has(normalized)) {
                grouped.set(normalized, []);
            }
            grouped.get(normalized)!.push(quote);
        }

        const exactGroups = Array.from(grouped.entries())
            .filter(([, list]) => list.length > 1)
            .map(([key, list]) => ({
                key,
                quotes: [...list].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
            }));
        const exactIds = new Set(exactGroups.flatMap((group) => group.quotes.map((quote) => quote.$id)));
        const nearCandidates = candidates.filter((quote) => !exactIds.has(quote.$id));
        const nearPairs: NearDuplicatePair[] = [];

        for (let leftIndex = 0; leftIndex < nearCandidates.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < nearCandidates.length; rightIndex += 1) {
                const left = nearCandidates[leftIndex];
                const right = nearCandidates[rightIndex];
                const leftNormalized = normalizeQuoteText(left.text);
                const rightNormalized = normalizeQuoteText(right.text);
                const maxLength = Math.max(leftNormalized.length, rightNormalized.length);
                if (Math.abs(leftNormalized.length - rightNormalized.length) > Math.max(12, maxLength * 0.35)) {
                    continue;
                }
                const similarity = quoteSimilarity(left.text, right.text);
                if (similarity < 0.84) {
                    continue;
                }
                nearPairs.push({
                    key: [left.$id, right.$id].sort().join(":"),
                    similarity,
                    left,
                    right
                });
            }
        }

        nearPairs.sort((a, b) => b.similarity - a.similarity);
        setDuplicateGroups(exactGroups);
        setNearDuplicatePairs(nearPairs.slice(0, 200));
        setDuplicateScanRan(true);
    }, [quotes]);

    const runPunctuationScan = useCallback(() => {
        const issues = quotes
            .filter((quote) => !quote.punctuationExcused)
            .map((quote) => {
                const detectedIssues = findPunctuationIssues(quote.text);
                return {
                    quote,
                    issues: detectedIssues,
                    suggestions: buildPunctuationSuggestions(quote.text, detectedIssues)
                };
            })
            .filter((entry) => entry.issues.length > 0)
            .sort((a, b) => (b.quote.createdAt || "").localeCompare(a.quote.createdAt || ""));
        const drafts = issues.reduce<Record<string, string>>((result, entry) => {
            result[entry.quote.$id] = entry.quote.text;
            return result;
        }, {});
        setPunctuationIssues(issues);
        setPunctuationDrafts(drafts);
        setPunctuationScanRan(true);
    }, [quotes]);

    const runSpellingScan = useCallback(() => {
        const issues = quotes
            .filter((quote) => !quote.spellingExcused)
            .map((quote) => {
                const detectedIssues = detectSpellingIssues(quote.text, spellingAllowWordSet);
                return {
                    quote,
                    issues: detectedIssues,
                    suggestions: buildSpellingSuggestions(quote.text, detectedIssues)
                };
            })
            .filter((entry) => entry.issues.length > 0)
            .sort((a, b) => (b.quote.createdAt || "").localeCompare(a.quote.createdAt || ""));
        const drafts = issues.reduce<Record<string, string>>((result, entry) => {
            result[entry.quote.$id] = entry.quote.text;
            return result;
        }, {});
        setSpellingIssues(issues);
        setSpellingDrafts(drafts);
        setSpellingScanRan(true);
    }, [quotes, spellingAllowWordSet]);

    const refreshAfterToolsAction = useCallback(async () => {
        await loadAll();
        await loadAccountQuotes();
        setDuplicateScanRan(false);
        setPunctuationScanRan(false);
        setSpellingScanRan(false);
        setDuplicateGroups([]);
        setNearDuplicatePairs([]);
        setPunctuationIssues([]);
        setSpellingIssues([]);
        setPunctuationDrafts({});
        setSpellingDrafts({});
        setPunctuationActionLoading({});
        setSpellingActionLoading({});
    }, [loadAccountQuotes, loadAll]);

    const setPunctuationLoadingState = (quoteIds: string[], loadingState: boolean) => {
        setPunctuationActionLoading((prev) => {
            const next = { ...prev };
            quoteIds.forEach((quoteId) => {
                if (loadingState) {
                    next[quoteId] = true;
                } else {
                    delete next[quoteId];
                }
            });
            return next;
        });
    };

    const removeResolvedPunctuationQuotes = (quoteIds: string[], updatedTextByQuoteId?: Record<string, string>) => {
        const idSet = new Set(quoteIds);
        setQuotes((prev) =>
            prev.map((quote) =>
                idSet.has(quote.$id)
                    ? {
                          ...quote,
                          text: updatedTextByQuoteId?.[quote.$id] ?? quote.text,
                          punctuationExcused: true
                      }
                    : quote
            )
        );
        setPunctuationIssues((prev) => prev.filter((entry) => !idSet.has(entry.quote.$id)));
        setPunctuationDrafts((prev) => {
            const next = { ...prev };
            quoteIds.forEach((quoteId) => {
                delete next[quoteId];
            });
            return next;
        });
    };

    const setSpellingLoadingState = (quoteIds: string[], loadingState: boolean) => {
        setSpellingActionLoading((prev) => {
            const next = { ...prev };
            quoteIds.forEach((quoteId) => {
                if (loadingState) {
                    next[quoteId] = true;
                } else {
                    delete next[quoteId];
                }
            });
            return next;
        });
    };

    const removeResolvedSpellingQuotes = (quoteIds: string[], updatedTextByQuoteId?: Record<string, string>) => {
        const idSet = new Set(quoteIds);
        setQuotes((prev) =>
            prev.map((quote) =>
                idSet.has(quote.$id)
                    ? {
                          ...quote,
                          text: updatedTextByQuoteId?.[quote.$id] ?? quote.text,
                          spellingExcused: true
                      }
                    : quote
            )
        );
        setSpellingIssues((prev) => prev.filter((entry) => !idSet.has(entry.quote.$id)));
        setSpellingDrafts((prev) => {
            const next = { ...prev };
            quoteIds.forEach((quoteId) => {
                delete next[quoteId];
            });
            return next;
        });
    };

    const handleExcuseQuotes = async (
        quoteIds: string[],
        tool: "duplicate" | "punctuation" | "spelling"
    ) => {
        if (quoteIds.length === 0) {
            return;
        }

        if (tool === "punctuation" || tool === "spelling") {
            setError(null);
            setMessage(null);
            if (tool === "punctuation") {
                setPunctuationLoadingState(quoteIds, true);
            } else {
                setSpellingLoadingState(quoteIds, true);
            }
            try {
                await Promise.all(
                    quoteIds.map((quoteId) => setQuoteExcuse(groupId, quoteId, tool, true))
                );
                if (tool === "punctuation") {
                    removeResolvedPunctuationQuotes(quoteIds);
                } else {
                    removeResolvedSpellingQuotes(quoteIds);
                }
                setMessage(`${quoteIds.length} quote${quoteIds.length === 1 ? "" : "s"} marked as excused.`);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to mark quote as excused.");
            } finally {
                if (tool === "punctuation") {
                    setPunctuationLoadingState(quoteIds, false);
                } else {
                    setSpellingLoadingState(quoteIds, false);
                }
            }
            return;
        }

        setSubmitting(true);
        setError(null);
        setMessage(null);
        try {
            for (const quoteId of quoteIds) {
                await setQuoteExcuse(groupId, quoteId, tool, true);
            }
            await refreshAfterToolsAction();
            setMessage(`${quoteIds.length} quote${quoteIds.length === 1 ? "" : "s"} marked as excused.`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to mark quote as excused.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleKeepOneFromExactGroup = async (group: ExactDuplicateGroup, keepQuoteId: string) => {
        const removeIds = group.quotes.filter((quote) => quote.$id !== keepQuoteId).map((quote) => quote.$id);
        if (removeIds.length === 0) {
            return;
        }
        if (!window.confirm(`Keep one quote and remove ${removeIds.length} duplicate(s)?`)) {
            return;
        }
        setSubmitting(true);
        setError(null);
        setMessage(null);
        try {
            for (const quoteId of removeIds) {
                await deleteQuote(groupId, quoteId);
            }
            await refreshAfterToolsAction();
            setMessage(`Removed ${removeIds.length} duplicate quote${removeIds.length === 1 ? "" : "s"}.`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to resolve duplicates.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleKeepNearPair = async (pair: NearDuplicatePair, keep: "left" | "right") => {
        const removeId = keep === "left" ? pair.right.$id : pair.left.$id;
        if (!window.confirm("Keep the selected quote and remove the other one?")) {
            return;
        }
        setSubmitting(true);
        setError(null);
        setMessage(null);
        try {
            await deleteQuote(groupId, removeId);
            await refreshAfterToolsAction();
            setMessage("Near-duplicate pair resolved.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to resolve near-duplicate pair.");
        } finally {
            setSubmitting(false);
        }
    };

    const handlePunctuationDraftChange = (quoteId: string, text: string) => {
        setPunctuationDrafts((prev) => ({
            ...prev,
            [quoteId]: text
        }));
    };

    const handleUpdatePunctuationText = async (quoteId: string, nextText: string) => {
        const normalized = nextText.trim();
        if (!normalized) {
            setError("Quote text cannot be empty.");
            return;
        }
        setError(null);
        setMessage(null);
        setPunctuationLoadingState([quoteId], true);
        try {
            const updatedQuote = await updateQuoteText(groupId, quoteId, normalized, "punctuation");
            removeResolvedPunctuationQuotes([quoteId], {
                [quoteId]: updatedQuote?.text || normalized
            });
            setMessage("Quote updated and excused.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update quote text.");
        } finally {
            setPunctuationLoadingState([quoteId], false);
        }
    };

    const handleSpellingDraftChange = (quoteId: string, text: string) => {
        setSpellingDrafts((prev) => ({
            ...prev,
            [quoteId]: text
        }));
    };

    const handleUpdateSpellingText = async (quoteId: string, nextText: string) => {
        const normalized = nextText.trim();
        if (!normalized) {
            setError("Quote text cannot be empty.");
            return;
        }
        setError(null);
        setMessage(null);
        setSpellingLoadingState([quoteId], true);
        try {
            const updatedQuote = await updateQuoteText(groupId, quoteId, normalized, "spelling");
            removeResolvedSpellingQuotes([quoteId], {
                [quoteId]: updatedQuote?.text || normalized
            });
            setMessage("Quote updated and excused.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update quote text.");
        } finally {
            setSpellingLoadingState([quoteId], false);
        }
    };

    const persistSpellingAllowWords = async (nextWords: string[]) => {
        setSpellingAllowSaving(true);
        setError(null);
        setMessage(null);
        try {
            const response = await updateGroupSpellingAllowList(groupId, nextWords);
            const persistedWords = Array.from(
                new Set(
                    (response.spellingAllowList || [])
                        .map((word) => normalizeAllowWordToken(String(word || "")))
                        .filter((word) => /^[a-z0-9][a-z0-9'-]{0,31}$/.test(word))
                )
            );
            setSpellingAllowWords(persistedWords);
            setSpellingScanRan(false);
            setSpellingIssues([]);
            setSpellingDrafts({});
            await refreshGroups();
            setMessage("Allowed word list updated.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update allowed words.");
        } finally {
            setSpellingAllowSaving(false);
        }
    };

    const handleAddAllowedWord = async () => {
        const normalized = normalizeAllowWordToken(spellingAllowInput);
        if (!normalized || !/^[a-z0-9][a-z0-9'-]{0,31}$/.test(normalized)) {
            setError("Enter a valid word (letters, numbers, apostrophes, or hyphens).");
            return;
        }
        if (spellingAllowWords.includes(normalized)) {
            setError("That word is already allowed.");
            return;
        }
        const nextWords = [...spellingAllowWords, normalized].sort((left, right) =>
            left.localeCompare(right)
        );
        setSpellingAllowInput("");
        await persistSpellingAllowWords(nextWords);
    };

    const handleRemoveAllowedWord = async (word: string) => {
        const nextWords = spellingAllowWords.filter((candidate) => candidate !== word);
        await persistSpellingAllowWords(nextWords);
    };

    const inviteLinkBase = typeof window !== "undefined" ? window.location.origin : "";
    const activePrimaryTab = primaryTab;
    const activeGroupTab = groupTab;
    const isAddingNewPerson = selectedPersonId === "__new__";

    if (loading) {
        return <LoadingState label="Loading group" />;
    }

    if (leaving) {
        return <LoadingState label="Leaving group" />;
    }

    return (
        <Stack spacing={3} className="page">
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
                <Box flex={1}>
                    <Typography variant="h4" gutterBottom>
                        {groupName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {isAdmin ? "Admin panel" : "Settings"} - Role: {currentMembership.role}
                    </Typography>
                </Box>
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                    {isAdmin && showSync && (
                        <ActionButton
                            variant="outlined"
                            onClick={handleSync}
                            loading={submitting}
                            loadingLabel="Syncing..."
                        >
                            Sync access
                        </ActionButton>
                    )}
                    {isAdmin && (
                        <ActionButton
                            variant="outlined"
                            color="secondary"
                            onClick={handleLeaveGroup}
                            loading={submitting}
                            loadingLabel="Leaving..."
                        >
                            Leave group
                        </ActionButton>
                    )}
                </Stack>
            </Stack>

            {message && <Alert severity="success">{message}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}

            <Tabs value={primaryTab} onChange={(_, value) => setPrimaryTab(value)}>
                <Tab value="account" label="Account" />
                <Tab value="group" label="Group" />
            </Tabs>
            <Divider />
            {primaryTab === "group" && (
                <Tabs
                    value={groupTab}
                    onChange={(_, value) => setGroupTab(value)}
                    variant="scrollable"
                    allowScrollButtonsMobile
                >
                    {groupTabs.map((option) => (
                        <Tab key={option.key} value={option.key} label={option.label} />
                    ))}
                </Tabs>
            )}

            {activePrimaryTab === "account" && (
                <Stack spacing={3}>
                    <Card
                        sx={(theme) => ({
                            borderLeft: `4px solid ${theme.palette.primary.main}`,
                            backgroundColor:
                                theme.palette.mode === "dark"
                                    ? "rgba(255,255,255,0.04)"
                                    : "rgba(0,0,0,0.02)",
                            ...(accountSubmittingCardSx ?? {})
                        })}
                    >
                        <CardContent>
                            <Stack spacing={2}>
                                <Stack spacing={0.5}>
                                    <Typography variant="overline" color="text.secondary">
                                        Account
                                    </Typography>
                                    <Typography variant="h6">Account settings</Typography>
                                </Stack>
                                {accountMessage && <Alert severity="success">{accountMessage}</Alert>}
                                {accountError && <Alert severity="error">{accountError}</Alert>}
                                <Stack spacing={1.5}>
                                    <Typography variant="subtitle2">Display name</Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
                                        This is how your name appears across all groups.
                                    </Typography>
                                    <TextField
                                        label="Display name"
                                        value={nameDraft}
                                        onChange={(event) => setNameDraft(event.target.value)}
                                    />
                                    <Typography variant="body2" color="text.secondary">
                                        Updates your display name across every group.
                                    </Typography>
                                    <ActionButton
                                        variant="contained"
                                        onClick={handleUpdateName}
                                        loading={accountSubmitting}
                                        loadingLabel="Saving..."
                                        disabled={
                                            accountSubmitting ||
                                            !nameDraft.trim() ||
                                            nameDraft.trim() === (user?.name ?? "")
                                        }
                                    >
                                        Save name
                                    </ActionButton>
                                </Stack>
                                <Divider />
                                <Stack spacing={1.5}>
                                    <Typography variant="subtitle2">Email</Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
                                        Changing your email requires your current password.
                                    </Typography>
                                    <TextField
                                        label="New email"
                                        type="email"
                                        value={emailDraft}
                                        onChange={(event) => setEmailDraft(event.target.value)}
                                    />
                                    <TextField
                                        label="Current password"
                                        type="password"
                                        value={emailPassword}
                                        onChange={(event) => setEmailPassword(event.target.value)}
                                    />
                                    <ActionButton
                                        variant="outlined"
                                        onClick={handleUpdateEmail}
                                        loading={accountSubmitting}
                                        loadingLabel="Updating..."
                                        disabled={
                                            accountSubmitting ||
                                            !emailDraft.trim() ||
                                            !emailPassword.trim() ||
                                            emailDraft.trim() === (user?.email ?? "")
                                        }
                                    >
                                        Update email
                                    </ActionButton>
                                </Stack>
                                <Divider />
                                <Stack spacing={1.5}>
                                    <Typography variant="subtitle2">Password</Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
                                        Use a strong password you don’t reuse elsewhere.
                                    </Typography>
                                    <TextField
                                        label="Current password"
                                        type="password"
                                        value={currentPassword}
                                        onChange={(event) => setCurrentPassword(event.target.value)}
                                    />
                                    <TextField
                                        label="New password"
                                        type="password"
                                        value={newPassword}
                                        onChange={(event) => setNewPassword(event.target.value)}
                                    />
                                    <TextField
                                        label="Confirm new password"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(event) => setConfirmPassword(event.target.value)}
                                    />
                                    <ActionButton
                                        variant="outlined"
                                        onClick={handleUpdatePassword}
                                        loading={accountSubmitting}
                                        loadingLabel="Updating..."
                                        disabled={
                                            accountSubmitting ||
                                            !currentPassword.trim() ||
                                            !newPassword.trim() ||
                                            newPassword !== confirmPassword
                                        }
                                    >
                                        Update password
                                    </ActionButton>
                                </Stack>
                            </Stack>
                        </CardContent>
                    </Card>

                    <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Typography variant="subtitle1">Quotes you've added</Typography>
                                <Chip label={addedQuotes.length} size="small" />
                            </Stack>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Stack spacing={2}>
                                {accountListsError && (
                                    <Alert severity="error">{accountListsError}</Alert>
                                )}
                                <TextField
                                    label="Search quotes, people, or groups"
                                    value={addedSearch}
                                    onChange={(event) => setAddedSearch(event.target.value)}
                                    size="small"
                                />
                                {accountLoading ? (
                                    <Typography variant="body2" color="text.secondary">
                                        Loading your quotes...
                                    </Typography>
                                ) : filteredAddedQuotes.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">
                                        You haven't added any quotes yet.
                                    </Typography>
                                ) : (
                                    <Stack spacing={2}>
                                        {visibleAddedQuotes.map((entry, index) => (
                                            <Card
                                                key={entry.quote.$id}
                                                variant="outlined"
                                                className="stagger"
                                                sx={{
                                                    animationDelay: `${index * 30}ms`,
                                                    ...(accountSubmittingCardSx ?? {})
                                                }}
                                            >
                                                <CardContent>
                                                    <Stack spacing={1}>
                                                        <Typography variant="subtitle1">
                                                            "{entry.quote.text}"
                                                        </Typography>
                                                        <Stack
                                                            direction="row"
                                                            spacing={1}
                                                            alignItems="center"
                                                            flexWrap="wrap"
                                                        >
                                                            <Chip label={entry.groupName} size="small" />
                                                            <Typography
                                                                variant="body2"
                                                                color="text.secondary"
                                                            >
                                                                Quoted: {entry.personName}
                                                            </Typography>
                                                        </Stack>
                                                    </Stack>
                                                </CardContent>
                                                <CardActions
                                                    sx={{
                                                        justifyContent: "flex-end",
                                                        paddingX: 2,
                                                        paddingBottom: 2
                                                    }}
                                                >
                                                    <ActionButton
                                                        variant="outlined"
                                                        color="secondary"
                                                        onClick={() => handleDeleteAccountQuote(entry)}
                                                        loading={accountSubmitting}
                                                        loadingLabel="Removing..."
                                                        disabled={accountSubmitting}
                                                    >
                                                        Remove
                                                    </ActionButton>
                                                </CardActions>
                                            </Card>
                                        ))}
                                        {filteredAddedQuotes.length > visibleAddedQuotes.length && (
                                            <Button
                                                variant="text"
                                                onClick={() =>
                                                    setAddedVisibleCount((prev) => prev + 8)
                                                }
                                            >
                                                Load more
                                            </Button>
                                        )}
                                    </Stack>
                                )}
                            </Stack>
                        </AccordionDetails>
                    </Accordion>

                    <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Typography variant="subtitle1">Quotes about you</Typography>
                                <Chip label={quotedQuotes.length} size="small" />
                            </Stack>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Stack spacing={2}>
                                {accountListsError && (
                                    <Alert severity="error">{accountListsError}</Alert>
                                )}
                                <TextField
                                    label="Search quotes, groups, or who added them"
                                    value={quotedSearch}
                                    onChange={(event) => setQuotedSearch(event.target.value)}
                                    size="small"
                                />
                                {accountLoading ? (
                                    <Typography variant="body2" color="text.secondary">
                                        Loading quotes about you...
                                    </Typography>
                                ) : filteredQuotedQuotes.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">
                                        No one has quoted you yet.
                                    </Typography>
                                ) : (
                                    <Stack spacing={2}>
                                        {visibleQuotedQuotes.map((entry, index) => (
                                            <Card
                                                key={entry.quote.$id}
                                                variant="outlined"
                                                className="stagger"
                                                sx={{
                                                    animationDelay: `${index * 30}ms`,
                                                    ...(accountSubmittingCardSx ?? {})
                                                }}
                                            >
                                                <CardContent>
                                                    <Stack spacing={1}>
                                                        <Typography variant="subtitle1">
                                                            "{entry.quote.text}"
                                                        </Typography>
                                                        <Stack
                                                            direction="row"
                                                            spacing={1}
                                                            alignItems="center"
                                                            flexWrap="wrap"
                                                        >
                                                            <Chip label={entry.groupName} size="small" />
                                                            <Typography
                                                                variant="body2"
                                                                color="text.secondary"
                                                            >
                                                                Added by {entry.quote.createdByName}
                                                            </Typography>
                                                        </Stack>
                                                    </Stack>
                                                </CardContent>
                                                <CardActions
                                                    sx={{
                                                        justifyContent: "flex-end",
                                                        paddingX: 2,
                                                        paddingBottom: 2
                                                    }}
                                                >
                                                    <ActionButton
                                                        variant="outlined"
                                                        color="secondary"
                                                        onClick={() => handleDeleteAccountQuote(entry)}
                                                        loading={accountSubmitting}
                                                        loadingLabel="Removing..."
                                                        disabled={accountSubmitting}
                                                    >
                                                        Remove
                                                    </ActionButton>
                                                </CardActions>
                                            </Card>
                                        ))}
                                        {filteredQuotedQuotes.length > visibleQuotedQuotes.length && (
                                            <Button
                                                variant="text"
                                                onClick={() =>
                                                    setQuotedVisibleCount((prev) => prev + 8)
                                                }
                                            >
                                                Load more
                                            </Button>
                                        )}
                                    </Stack>
                                )}
                            </Stack>
                        </AccordionDetails>
                    </Accordion>
                </Stack>
            )}

            {activePrimaryTab === "group" && activeGroupTab === "quotes" && (
                            <Stack spacing={3}>
                    <Card sx={submittingCardSx}>
                        <CardContent>
                            <Stack spacing={2}>
                                <Typography variant="h6">Add a quote</Typography>
                                <TextField
                                    select
                                    label="Person"
                                    SelectProps={{ displayEmpty: true }}
                                    InputLabelProps={{ shrink: true }}
                                    value={selectedPersonId}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        setSelectedPersonId(value);
                                        if (value !== "__new__") {
                                            setNewPersonMode("");
                                            setNewPersonName("");
                                        }
                                    }}
                                >
                                    <MenuItem value="">
                                        <em>Select a person</em>
                                    </MenuItem>
                                    {people.map((person) => (
                                        <MenuItem key={person.$id} value={person.$id}>
                                            {person.name}{person.isPlaceholder ? " (placeholder)" : ""}
                                        </MenuItem>
                                    ))}
                                    <MenuItem value="__new__">Add new user...</MenuItem>
                                </TextField>
                                {isAddingNewPerson && (
                                    <Card variant="outlined" sx={submittingCardSx}>
                                        <CardContent>
                                            <Stack spacing={2}>
                                                <Typography variant="subtitle1">Add a new person</Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    Invite them to join, or create a placeholder you can claim later.
                                                </Typography>
                                                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                                                    <Button
                                                        variant={newPersonMode === "invite" ? "contained" : "outlined"}
                                                        onClick={() => setNewPersonMode("invite")}
                                                    >
                                                        Invite and wait
                                                    </Button>
                                                    <Button
                                                        variant={
                                                            newPersonMode === "placeholder" ? "contained" : "outlined"
                                                        }
                                                        onClick={() => setNewPersonMode("placeholder")}
                                                    >
                                                        Create placeholder
                                                    </Button>
                                                </Stack>
                                                {newPersonMode === "invite" && (
                                                    <Stack spacing={1}>
                                                        <Typography variant="body2" color="text.secondary">
                                                            Send them a permanent invite link. Once they join, you can
                                                            add quotes directly to their profile.
                                                        </Typography>
                                                        <Button
                                                            component={RouterLink}
                                                            to="/admin?tab=invites"
                                                            variant="text"
                                                        >
                                                            Go to invites
                                                        </Button>
                                                    </Stack>
                                                )}
                                                {newPersonMode === "placeholder" && (
                                                    <Stack spacing={1.5}>
                                                        <Typography variant="body2" color="text.secondary">
                                                            Use this when you want to add quotes right now. They can
                                                            claim the placeholder later.
                                                        </Typography>
                                                        <TextField
                                                            label="Placeholder name"
                                                            value={newPersonName}
                                                            onChange={(event) => setNewPersonName(event.target.value)}
                                                        />
                                                        <Button
                                                            component={RouterLink}
                                                            to="/admin?tab=invites"
                                                            variant="text"
                                                        >
                                                            Go to invites (optional)
                                                        </Button>
                                                    </Stack>
                                                )}
                                            </Stack>
                                        </CardContent>
                                    </Card>
                                )}
                                <TextField
                                    label="Quote"
                                    value={quoteText}
                                    onChange={(event) => setQuoteText(event.target.value)}
                                    multiline
                                    rows={3}
                                />
                                <ActionButton
                                    variant="contained"
                                    onClick={handleAddQuote}
                                    loading={submitting}
                                    loadingLabel="Adding..."
                                    disabled={submitting || (isAddingNewPerson && newPersonMode !== "placeholder")}
                                >
                                    Add quote
                                </ActionButton>
                            </Stack>
                        </CardContent>
                    </Card>

                    <Stack spacing={2}>
                        {quotes.length === 0 && (
                            <Typography variant="body2" color="text.secondary">
                                No quotes yet. Add the first one.
                            </Typography>
                        )}
                        {visibleAdminQuotes.map((quote, index) => {
                            const person = peopleMap.get(quote.personId);
                            return (
                                <Box key={quote.$id} className="stagger" sx={{ animationDelay: `${index * 40}ms` }}>
                                    <QuoteCard
                                        text={quote.text}
                                        author={person?.name || "Unknown"}
                                        addedBy={quote.createdByName}
                                        canDelete={isAdmin}
                                        deleteLoading={submitting}
                                        onDelete={() => handleDeleteQuote(quote.$id)}
                                    />
                                </Box>
                            );
                        })}
                        {quotes.length > visibleAdminQuotes.length && (
                            <Button
                                variant="text"
                                onClick={() => setAdminQuoteVisibleCount((prev) => prev + 20)}
                            >
                                Load more
                            </Button>
                        )}
                    </Stack>
                </Stack>
            )}

            {activePrimaryTab === "group" && activeGroupTab === "people" && (
                <Stack spacing={2}>
                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={2}
                        alignItems={{ sm: "center" }}
                    >
                        <TextField
                            label="Search people"
                            value={peopleSearch}
                            onChange={(event) => setPeopleSearch(event.target.value)}
                            size="small"
                            sx={{ flex: 1 }}
                        />
                        <ToggleButtonGroup
                            value={peopleFilter}
                            exclusive
                            onChange={(_, value) => value && setPeopleFilter(value)}
                            size="small"
                        >
                            <ToggleButton value="all">All</ToggleButton>
                            <ToggleButton value="members">Members</ToggleButton>
                            <ToggleButton value="placeholders">Placeholders</ToggleButton>
                        </ToggleButtonGroup>
                    </Stack>
                    {people.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            Add a quote to create the first person.
                        </Typography>
                    ) : filteredPeople.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            No people match your search.
                        </Typography>
                    ) : null}
                    <Grid container spacing={2}>
                        {filteredPeople.map((person) => (
                            <Grid item xs={12} md={6} key={person.$id}>
                                <Card sx={submittingCardSx}>
                                    <CardContent>
                                        <Stack spacing={1}>
                                            <Stack
                                                direction="row"
                                                spacing={2}
                                                alignItems="center"
                                                justifyContent="space-between"
                                            >
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <Typography variant="h6">{person.name}</Typography>
                                                    {person.isPlaceholder ? (
                                                        <Chip label="Placeholder" color="secondary" size="small" />
                                                    ) : (
                                                        <Chip label="Member" color="primary" size="small" />
                                                    )}
                                                </Stack>
                                                <Stack direction="row" spacing={1}>
                                                    {person.isPlaceholder &&
                                                        !hasClaimedPlaceholder &&
                                                        claimablePlaceholders.some((entry) => entry.$id === person.$id) && (
                                                        <ActionButton
                                                            size="small"
                                                            variant="contained"
                                                            onClick={() => handleClaimPlaceholder(person.$id)}
                                                            loading={submitting}
                                                            loadingLabel="Claiming..."
                                                            disabled={submitting}
                                                        >
                                                            Claim
                                                        </ActionButton>
                                                    )}
                                                    {person.isPlaceholder && isAdmin && (
                                                        <ActionButton
                                                            size="small"
                                                            variant="outlined"
                                                            color="secondary"
                                                            onClick={() => handleRemovePlaceholder(person)}
                                                            loading={submitting}
                                                            loadingLabel="Removing..."
                                                            disabled={submitting}
                                                        >
                                                            Remove
                                                        </ActionButton>
                                                    )}
                                                    {!person.isPlaceholder && isAdmin && (() => {
                                                        const membership = members.find(
                                                            (member) => member.personId === person.$id
                                                        );
                                                        if (!membership) {
                                                            return null;
                                                        }
                                                        const isSelf = membership.userId === currentMembership.userId;
                                                        const canRemove =
                                                            !isSelf &&
                                                            (isOwner
                                                                ? membership.role !== "owner"
                                                                : isAdmin && membership.role === "member");
                                                        if (!canRemove) {
                                                            return null;
                                                        }
                                                        return (
                                                            <ActionButton
                                                                size="small"
                                                                variant="outlined"
                                                                color="secondary"
                                                                onClick={() => handleRemoveMember(membership)}
                                                                loading={submitting}
                                                                loadingLabel="Removing..."
                                                                disabled={submitting}
                                                            >
                                                                Remove
                                                            </ActionButton>
                                                        );
                                                    })()}
                                                </Stack>
                                            </Stack>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                    {claimablePlaceholders.length > 0 && (
                        <Typography variant="body2" color="text.secondary">
                            New members can claim placeholders to inherit their quotes.
                        </Typography>
                    )}
                </Stack>
            )}

            {activePrimaryTab === "group" && activeGroupTab === "members" && (
                <Stack spacing={2}>
                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={2}
                        alignItems={{ sm: "center" }}
                    >
                        <TextField
                            label="Search members"
                            value={memberSearch}
                            onChange={(event) => setMemberSearch(event.target.value)}
                            size="small"
                            sx={{ flex: 1 }}
                        />
                        <ToggleButtonGroup
                            value={memberFilter}
                            exclusive
                            onChange={(_, value) => value && setMemberFilter(value)}
                            size="small"
                        >
                            <ToggleButton value="all">All</ToggleButton>
                            <ToggleButton value="admins">Admins</ToggleButton>
                            <ToggleButton value="members">Members</ToggleButton>
                        </ToggleButtonGroup>
                    </Stack>
                    {filteredMembers.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            No members match your search.
                        </Typography>
                    ) : (
                        filteredMembers.map((member, index) => {
                            const isSelf = member.userId === currentMembership.userId;
                            const canPromote = isAdmin && member.role === "member";
                            const canDemote = isOwner && member.role === "admin";
                            const canRemove =
                                !isSelf &&
                                (isOwner
                                    ? member.role !== "owner"
                                    : isAdmin && member.role === "member");

                            return (
                                <Card
                                    key={member.$id}
                                    className="stagger"
                                    sx={{
                                        animationDelay: `${index * 40}ms`,
                                        ...(submittingCardSx ?? {})
                                    }}
                                >
                                    <CardContent>
                                        <Stack spacing={2}>
                                            <Stack direction="row" spacing={2} alignItems="center">
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <Typography variant="h6">{member.displayName}</Typography>
                                                    {member.role === "owner" && (
                                                        <Box component="span" role="img" aria-label="Owner crown">
                                                            ??
                                                        </Box>
                                                    )}
                                                </Stack>
                                                <Chip label={member.role} />
                                                {isSelf && <Chip label="You" color="secondary" size="small" />}
                                            </Stack>
                                            <Stack direction="row" spacing={2} flexWrap="wrap">
                                                {canPromote && (
                                                    <ActionButton
                                                        variant="outlined"
                                                        onClick={() => handleRoleChange(member, "admin")}
                                                        loading={submitting}
                                                        loadingLabel="Saving..."
                                                    >
                                                        Make admin
                                                    </ActionButton>
                                                )}
                                                {canDemote && (
                                                    <ActionButton
                                                        variant="outlined"
                                                        onClick={() => handleRoleChange(member, "member")}
                                                        loading={submitting}
                                                        loadingLabel="Saving..."
                                                    >
                                                        Remove admin
                                                    </ActionButton>
                                                )}
                                                {isOwner && member.role !== "owner" && (
                                                    <ActionButton
                                                        variant="outlined"
                                                        onClick={() => handleTransferOwnership(member)}
                                                        loading={submitting}
                                                        loadingLabel="Saving..."
                                                    >
                                                        Make owner
                                                    </ActionButton>
                                                )}
                                                {canRemove && (
                                                    <ActionButton
                                                        variant="outlined"
                                                        color="secondary"
                                                        onClick={() => handleRemoveMember(member)}
                                                        loading={submitting}
                                                        loadingLabel="Removing..."
                                                    >
                                                        Remove
                                                    </ActionButton>
                                                )}
                                            </Stack>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            );
                        })
                    )}
                    </Stack>
            )}

            {activePrimaryTab === "group" && activeGroupTab === "invites" && (
                <Stack spacing={3}>
                    <Card sx={submittingCardSx}>
                        <CardContent>
                            <Stack spacing={2}>
                                <Typography variant="h6">Invite teammates</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 560 }}>
                                    Invite links are permanent. Anyone who signs up with the code will join this group.
                                </Typography>
                                {isAdmin ? (
                                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                                        <TextField
                                            label="Invite name"
                                            value={newInviteName}
                                            onChange={(event) => setNewInviteName(event.target.value)}
                                            size="small"
                                            sx={{ flex: 1 }}
                                        />
                                        <ActionButton
                                            variant="contained"
                                            onClick={handleCreateInvite}
                                            loading={submitting}
                                            loadingLabel="Creating..."
                                            disabled={submitting}
                                        >
                                            Create invite code
                                        </ActionButton>
                                    </Stack>
                                ) : (
                                    <Typography variant="body2" color="text.secondary">
                                        Only admins can create or rename invite codes.
                                    </Typography>
                                )}
                            </Stack>
                        </CardContent>
                    </Card>
                    {invites.length === 0 && (
                        <Typography variant="body2" color="text.secondary">
                            No invites yet. Create a code to share.
                        </Typography>
                    )}
                    <Stack spacing={2}>
                        {invites.map((invite, index) => {
                            const displayName = invite.name || "General";
                            const draftName = inviteNameDrafts[invite.$id] ?? displayName;
                            const canSave = draftName.trim() !== displayName;
                            const isEditing = editingInviteId === invite.$id;
                            const isExpanded = Boolean(expandedInvites[invite.$id]);
                            return (
                                <Card
                                    key={invite.$id}
                                    className="stagger"
                                    sx={{
                                        animationDelay: `${index * 40}ms`,
                                        ...(submittingCardSx ?? {})
                                    }}
                                >
                                    <CardContent>
                                        <Stack spacing={1.5}>
                                            <Stack
                                                direction={{ xs: "column", sm: "row" }}
                                                spacing={2}
                                                alignItems={{ sm: "center" }}
                                                justifyContent="space-between"
                                            >
                                                <Box flex={1} minWidth={0}>
                                                    {isAdmin && isEditing ? (
                                                        <TextField
                                                            label="Invite name"
                                                            size="small"
                                                            value={draftName}
                                                            onChange={(event) =>
                                                                setInviteNameDrafts((prev) => ({
                                                                    ...prev,
                                                                    [invite.$id]: event.target.value
                                                                }))
                                                            }
                                                            sx={{ maxWidth: 280 }}
                                                        />
                                                    ) : (
                                                        <Typography variant="subtitle1">{displayName}</Typography>
                                                    )}
                                                    <Typography variant="body2" color="text.secondary">
                                                        Code: {invite.code}
                                                    </Typography>
                                                </Box>
                                                <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="flex-end">
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        onClick={() => navigator.clipboard.writeText(invite.code)}
                                                    >
                                                        Copy code
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        variant="text"
                                                        onClick={() => toggleInviteDetails(invite.$id)}
                                                    >
                                                        {isExpanded ? "Hide link" : "Show link"}
                                                    </Button>
                                                    {isAdmin && (
                                                        <Stack direction="row" spacing={1}>
                                                            {isEditing ? (
                                                                <>
                                                                    <ActionButton
                                                                        size="small"
                                                                        variant="outlined"
                                                                        onClick={() => handleRenameInvite(invite.$id)}
                                                                        loading={submitting}
                                                                        loadingLabel="Saving..."
                                                                        disabled={submitting || !draftName.trim() || !canSave}
                                                                    >
                                                                        Save
                                                                    </ActionButton>
                                                                    <Button
                                                                        size="small"
                                                                        variant="text"
                                                                        onClick={() => {
                                                                            setInviteNameDrafts((prev) => ({
                                                                                ...prev,
                                                                                [invite.$id]: displayName
                                                                            }));
                                                                            setEditingInviteId(null);
                                                                        }}
                                                                        disabled={submitting}
                                                                    >
                                                                        Cancel
                                                                    </Button>
                                                                </>
                                                            ) : (
                                                                <ActionButton
                                                                    size="small"
                                                                    variant="outlined"
                                                                    onClick={() => setEditingInviteId(invite.$id)}
                                                                    loading={submitting}
                                                                    loadingLabel="Loading..."
                                                                    disabled={submitting}
                                                                >
                                                                    Rename
                                                                </ActionButton>
                                                            )}
                                                            <ActionButton
                                                                size="small"
                                                                variant="outlined"
                                                                color="secondary"
                                                                onClick={() => handleDeleteInvite(invite.$id)}
                                                                loading={submitting}
                                                                loadingLabel="Deleting..."
                                                                disabled={submitting || isEditing}
                                                            >
                                                                Delete
                                                            </ActionButton>
                                                        </Stack>
                                                    )}
                                                </Stack>
                                            </Stack>
                                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                                <Stack spacing={1}>
                                                    <Typography variant="body2" color="text.secondary">
                                                        Link: {inviteLinkBase}/?join={invite.code}
                                                    </Typography>
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        onClick={() =>
                                                            navigator.clipboard.writeText(
                                                                `${inviteLinkBase}/?join=${invite.code}`
                                                            )
                                                        }
                                                    >
                                                        Copy link
                                                    </Button>
                                                </Stack>
                                            </Collapse>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </Stack>
                </Stack>
            )}

            {activePrimaryTab === "group" && activeGroupTab === "tools" && isAdmin && (
                <Stack spacing={3}>
                    <Card>
                        <CardContent>
                            <Stack spacing={2}>
                                <Typography variant="h6">Duplicate quote finder</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Scan for exact duplicates (ignoring punctuation/case) and possible
                                    near-duplicates (similar wording). Quotes marked as excused are skipped.
                                </Typography>
                                <ActionButton
                                    variant="contained"
                                    onClick={runDuplicateScan}
                                    loading={submitting}
                                    loadingLabel="Scanning..."
                                    disabled={submitting}
                                    sx={{ alignSelf: "flex-start" }}
                                >
                                    Run duplicate scan
                                </ActionButton>
                                {duplicateScanRan && (
                                    <Typography variant="body2" color="text.secondary">
                                        Found {duplicateGroups.length} exact group
                                        {duplicateGroups.length === 1 ? "" : "s"} and {nearDuplicatePairs.length}
                                        {" "}possible near-duplicate pair
                                        {nearDuplicatePairs.length === 1 ? "" : "s"}.
                                    </Typography>
                                )}
                            </Stack>
                        </CardContent>
                    </Card>

                    {duplicateScanRan && duplicateGroups.length === 0 && nearDuplicatePairs.length === 0 && (
                        <Typography variant="body2" color="text.secondary">
                            No duplicate candidates found.
                        </Typography>
                    )}

                    {duplicateGroups.map((group, groupIndex) => (
                        <Card key={`exact-${group.key}`}>
                            <CardContent>
                                <Stack spacing={2}>
                                    <Typography variant="subtitle1">
                                        Exact duplicate group {groupIndex + 1}
                                    </Typography>
                                    {group.quotes.map((quote) => {
                                        const person = peopleMap.get(quote.personId);
                                        return (
                                            <Card key={quote.$id} variant="outlined">
                                                <CardContent>
                                                    <Stack spacing={1}>
                                                        <Typography>"{quote.text}"</Typography>
                                                        <Typography variant="body2" color="text.secondary">
                                                            Said by {person?.name || "Unknown"} • Added by {quote.createdByName}
                                                        </Typography>
                                                    </Stack>
                                                </CardContent>
                                                <CardActions sx={{ justifyContent: "flex-end", px: 2, pb: 2 }}>
                                                    <ActionButton
                                                        size="small"
                                                        variant="outlined"
                                                        onClick={() => handleExcuseQuotes([quote.$id], "duplicate")}
                                                        loading={submitting}
                                                        loadingLabel="Saving..."
                                                        disabled={submitting}
                                                    >
                                                        Excuse
                                                    </ActionButton>
                                                    <ActionButton
                                                        size="small"
                                                        variant="contained"
                                                        onClick={() => handleKeepOneFromExactGroup(group, quote.$id)}
                                                        loading={submitting}
                                                        loadingLabel="Saving..."
                                                        disabled={submitting}
                                                    >
                                                        Keep this
                                                    </ActionButton>
                                                </CardActions>
                                            </Card>
                                        );
                                    })}
                                    <Stack direction="row" spacing={1} flexWrap="wrap">
                                        <ActionButton
                                            size="small"
                                            variant="outlined"
                                            onClick={() =>
                                                handleExcuseQuotes(
                                                    group.quotes.map((quote) => quote.$id),
                                                    "duplicate"
                                                )
                                            }
                                            loading={submitting}
                                            loadingLabel="Saving..."
                                            disabled={submitting}
                                        >
                                            Keep both/all (excuse group)
                                        </ActionButton>
                                    </Stack>
                                </Stack>
                            </CardContent>
                        </Card>
                    ))}

                    {nearDuplicatePairs.map((pair, index) => {
                        const leftPerson = peopleMap.get(pair.left.personId);
                        const rightPerson = peopleMap.get(pair.right.personId);
                        return (
                            <Card key={`near-${pair.key}`}>
                                <CardContent>
                                    <Stack spacing={2}>
                                        <Typography variant="subtitle1">
                                            Near-duplicate pair {index + 1} ({Math.round(pair.similarity * 100)}% match)
                                        </Typography>
                                        <Grid container spacing={2}>
                                            <Grid item xs={12} md={6}>
                                                <Card variant="outlined">
                                                    <CardContent>
                                                        <Stack spacing={1}>
                                                            <Typography>"{pair.left.text}"</Typography>
                                                            <Typography variant="body2" color="text.secondary">
                                                                Said by {leftPerson?.name || "Unknown"} • Added by {pair.left.createdByName}
                                                            </Typography>
                                                        </Stack>
                                                    </CardContent>
                                                </Card>
                                            </Grid>
                                            <Grid item xs={12} md={6}>
                                                <Card variant="outlined">
                                                    <CardContent>
                                                        <Stack spacing={1}>
                                                            <Typography>"{pair.right.text}"</Typography>
                                                            <Typography variant="body2" color="text.secondary">
                                                                Said by {rightPerson?.name || "Unknown"} • Added by {pair.right.createdByName}
                                                            </Typography>
                                                        </Stack>
                                                    </CardContent>
                                                </Card>
                                            </Grid>
                                        </Grid>
                                        <Stack direction="row" spacing={1} flexWrap="wrap">
                                            <ActionButton
                                                size="small"
                                                variant="contained"
                                                onClick={() => handleKeepNearPair(pair, "left")}
                                                loading={submitting}
                                                loadingLabel="Saving..."
                                                disabled={submitting}
                                            >
                                                Keep first
                                            </ActionButton>
                                            <ActionButton
                                                size="small"
                                                variant="contained"
                                                onClick={() => handleKeepNearPair(pair, "right")}
                                                loading={submitting}
                                                loadingLabel="Saving..."
                                                disabled={submitting}
                                            >
                                                Keep second
                                            </ActionButton>
                                            <ActionButton
                                                size="small"
                                                variant="outlined"
                                                onClick={() =>
                                                    handleExcuseQuotes([pair.left.$id, pair.right.$id], "duplicate")
                                                }
                                                loading={submitting}
                                                loadingLabel="Saving..."
                                                disabled={submitting}
                                            >
                                                Keep both (excuse pair)
                                            </ActionButton>
                                        </Stack>
                                    </Stack>
                                </CardContent>
                            </Card>
                        );
                    })}

                    <Card>
                        <CardContent>
                            <Stack spacing={2}>
                                <Typography variant="h6">Punctuation check</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Scan for likely punctuation/spacing issues. Excused quotes are skipped in
                                    future checks.
                                </Typography>
                                <ActionButton
                                    variant="contained"
                                    onClick={runPunctuationScan}
                                    loading={submitting}
                                    loadingLabel="Scanning..."
                                    disabled={submitting || punctuationActionsInFlight}
                                    sx={{ alignSelf: "flex-start" }}
                                >
                                    Run punctuation check
                                </ActionButton>
                                {punctuationScanRan && (
                                    <Typography variant="body2" color="text.secondary">
                                        Found {punctuationIssues.length} quote
                                        {punctuationIssues.length === 1 ? "" : "s"} with possible punctuation issues.
                                    </Typography>
                                )}
                                {punctuationScanRan && punctuationIssues.length === 0 && (
                                    <Typography variant="body2" color="text.secondary">
                                        No punctuation issues found.
                                    </Typography>
                                )}
                                {punctuationIssues.map((entry) => {
                                    const person = peopleMap.get(entry.quote.personId);
                                    const draft = punctuationDrafts[entry.quote.$id] ?? entry.quote.text;
                                    const normalizedDraft = draft.trim();
                                    const draftChanged = normalizedDraft !== entry.quote.text.trim();
                                    const isPunctuationBusy = Boolean(
                                        punctuationActionLoading[entry.quote.$id]
                                    );
                                    return (
                                        <Card key={`punct-${entry.quote.$id}`} variant="outlined">
                                            <CardContent>
                                                <Stack spacing={1.5}>
                                                    <Typography>"{entry.quote.text}"</Typography>
                                                    <Typography variant="body2" color="text.secondary">
                                                        Said by {person?.name || "Unknown"} • Added by {entry.quote.createdByName}
                                                    </Typography>
                                                    {isPunctuationBusy && (
                                                        <Typography variant="body2" color="text.secondary">
                                                            Saving...
                                                        </Typography>
                                                    )}
                                                    <Stack direction="row" spacing={1} flexWrap="wrap">
                                                        {entry.issues.map((issue) => (
                                                            <Chip key={`${entry.quote.$id}-${issue}`} size="small" label={issue} />
                                                        ))}
                                                    </Stack>
                                                    {entry.suggestions.length > 0 && (
                                                        <Stack spacing={1}>
                                                            <Typography variant="body2" color="text.secondary">
                                                                Suggestions
                                                            </Typography>
                                                            {entry.suggestions.map((suggestion, index) => (
                                                                <Stack
                                                                    key={`${entry.quote.$id}-suggestion-${index}`}
                                                                    direction={{ xs: "column", sm: "row" }}
                                                                    spacing={1}
                                                                    alignItems={{ sm: "center" }}
                                                                >
                                                                    <Typography variant="body2" sx={{ flex: 1 }}>
                                                                        {suggestion}
                                                                    </Typography>
                                                                    <ActionButton
                                                                        size="small"
                                                                        variant="outlined"
                                                                        onClick={() =>
                                                                            handleUpdatePunctuationText(
                                                                                entry.quote.$id,
                                                                                suggestion
                                                                            )
                                                                        }
                                                                        loading={isPunctuationBusy}
                                                                        loadingLabel="Applying..."
                                                                        disabled={submitting || isPunctuationBusy}
                                                                    >
                                                                        Apply {index + 1}
                                                                    </ActionButton>
                                                                </Stack>
                                                            ))}
                                                        </Stack>
                                                    )}
                                                    <TextField
                                                        label="Manual punctuation edit"
                                                        value={draft}
                                                        onChange={(event) =>
                                                            handlePunctuationDraftChange(
                                                                entry.quote.$id,
                                                                event.target.value
                                                            )
                                                        }
                                                        disabled={isPunctuationBusy}
                                                        multiline
                                                        minRows={2}
                                                    />
                                                </Stack>
                                            </CardContent>
                                            <CardActions sx={{ justifyContent: "flex-end", px: 2, pb: 2 }}>
                                                <ActionButton
                                                    size="small"
                                                    variant="contained"
                                                    onClick={() =>
                                                        handleUpdatePunctuationText(entry.quote.$id, draft)
                                                    }
                                                    loading={isPunctuationBusy}
                                                    loadingLabel="Saving..."
                                                    disabled={
                                                        submitting ||
                                                        isPunctuationBusy ||
                                                        !draftChanged ||
                                                        !normalizedDraft
                                                    }
                                                >
                                                    {isPunctuationBusy ? "Saving..." : "Save edit"}
                                                </ActionButton>
                                                <ActionButton
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={() => handleExcuseQuotes([entry.quote.$id], "punctuation")}
                                                    loading={isPunctuationBusy}
                                                    loadingLabel="Saving..."
                                                    disabled={submitting || isPunctuationBusy}
                                                >
                                                    Excuse quote
                                                </ActionButton>
                                            </CardActions>
                                        </Card>
                                    );
                                })}
                            </Stack>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent>
                            <Stack spacing={2}>
                                <Typography variant="h6">Spelling check</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Scan for likely misspellings. Excused quotes are skipped in future checks.
                                </Typography>
                                <Stack spacing={1.25}>
                                    <Stack
                                        direction={{ xs: "column", sm: "row" }}
                                        spacing={1}
                                        alignItems={{ sm: "center" }}
                                    >
                                        <TextField
                                            size="small"
                                            label="Allowed slang/words"
                                            value={spellingAllowInput}
                                            onChange={(event) => setSpellingAllowInput(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                    event.preventDefault();
                                                    if (!spellingAllowSaving) {
                                                        void handleAddAllowedWord();
                                                    }
                                                }
                                            }}
                                            disabled={spellingAllowSaving}
                                            placeholder="Add word (example: yall)"
                                        />
                                        <ActionButton
                                            variant="outlined"
                                            onClick={handleAddAllowedWord}
                                            loading={spellingAllowSaving}
                                            loadingLabel="Adding..."
                                            disabled={spellingAllowSaving || !spellingAllowInput.trim()}
                                        >
                                            Add word
                                        </ActionButton>
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary">
                                        Common slang is allowed by default. Add group-specific words here to
                                        exclude them from spelling checks.
                                    </Typography>
                                    {spellingAllowWords.length > 0 && (
                                        <Stack direction="row" spacing={1} flexWrap="wrap">
                                            {spellingAllowWords.map((word) => (
                                                <Chip
                                                    key={`allow-${word}`}
                                                    size="small"
                                                    label={word}
                                                    onDelete={
                                                        spellingAllowSaving
                                                            ? undefined
                                                            : () => {
                                                                  void handleRemoveAllowedWord(word);
                                                              }
                                                    }
                                                />
                                            ))}
                                        </Stack>
                                    )}
                                </Stack>
                                <ActionButton
                                    variant="contained"
                                    onClick={runSpellingScan}
                                    loading={submitting}
                                    loadingLabel="Scanning..."
                                    disabled={
                                        submitting ||
                                        spellingActionsInFlight ||
                                        spellingAllowSaving
                                    }
                                    sx={{ alignSelf: "flex-start" }}
                                >
                                    Run spelling check
                                </ActionButton>
                                {spellingScanRan && (
                                    <Typography variant="body2" color="text.secondary">
                                        Found {spellingIssues.length} quote
                                        {spellingIssues.length === 1 ? "" : "s"} with possible spelling issues.
                                    </Typography>
                                )}
                                {spellingScanRan && spellingIssues.length === 0 && (
                                    <Typography variant="body2" color="text.secondary">
                                        No spelling issues found.
                                    </Typography>
                                )}
                                {spellingIssues.map((entry) => {
                                    const person = peopleMap.get(entry.quote.personId);
                                    const draft = spellingDrafts[entry.quote.$id] ?? entry.quote.text;
                                    const normalizedDraft = draft.trim();
                                    const draftChanged = normalizedDraft !== entry.quote.text.trim();
                                    const isSpellingBusy = Boolean(spellingActionLoading[entry.quote.$id]);
                                    return (
                                        <Card key={`spell-${entry.quote.$id}`} variant="outlined">
                                            <CardContent>
                                                <Stack spacing={1.5}>
                                                    <Typography>"{entry.quote.text}"</Typography>
                                                    <Typography variant="body2" color="text.secondary">
                                                        Said by {person?.name || "Unknown"} â€¢ Added by {entry.quote.createdByName}
                                                    </Typography>
                                                    {isSpellingBusy && (
                                                        <Typography variant="body2" color="text.secondary">
                                                            Saving...
                                                        </Typography>
                                                    )}
                                                    <Stack direction="row" spacing={1} flexWrap="wrap">
                                                        {entry.issues.map((issue) => (
                                                            <Chip
                                                                key={`${entry.quote.$id}-${issue.key}`}
                                                                size="small"
                                                                label={`${issue.misspelling} -> ${issue.suggestions[0]}`}
                                                            />
                                                        ))}
                                                    </Stack>
                                                    {entry.suggestions.length > 0 && (
                                                        <Stack spacing={1}>
                                                            <Typography variant="body2" color="text.secondary">
                                                                Suggestions
                                                            </Typography>
                                                            {entry.suggestions.map((suggestion, index) => (
                                                                <Stack
                                                                    key={`${entry.quote.$id}-spelling-${index}`}
                                                                    direction={{ xs: "column", sm: "row" }}
                                                                    spacing={1}
                                                                    alignItems={{ sm: "center" }}
                                                                >
                                                                    <Typography variant="body2" sx={{ flex: 1 }}>
                                                                        {suggestion}
                                                                    </Typography>
                                                                    <ActionButton
                                                                        size="small"
                                                                        variant="outlined"
                                                                        onClick={() =>
                                                                            handleUpdateSpellingText(
                                                                                entry.quote.$id,
                                                                                suggestion
                                                                            )
                                                                        }
                                                                        loading={isSpellingBusy}
                                                                        loadingLabel="Applying..."
                                                                        disabled={submitting || isSpellingBusy}
                                                                    >
                                                                        Apply {index + 1}
                                                                    </ActionButton>
                                                                </Stack>
                                                            ))}
                                                        </Stack>
                                                    )}
                                                    <TextField
                                                        label="Manual spelling edit"
                                                        value={draft}
                                                        onChange={(event) =>
                                                            handleSpellingDraftChange(
                                                                entry.quote.$id,
                                                                event.target.value
                                                            )
                                                        }
                                                        disabled={isSpellingBusy}
                                                        multiline
                                                        minRows={2}
                                                    />
                                                </Stack>
                                            </CardContent>
                                            <CardActions sx={{ justifyContent: "flex-end", px: 2, pb: 2 }}>
                                                <ActionButton
                                                    size="small"
                                                    variant="contained"
                                                    onClick={() => handleUpdateSpellingText(entry.quote.$id, draft)}
                                                    loading={isSpellingBusy}
                                                    loadingLabel="Saving..."
                                                    disabled={
                                                        submitting ||
                                                        isSpellingBusy ||
                                                        !draftChanged ||
                                                        !normalizedDraft
                                                    }
                                                >
                                                    {isSpellingBusy ? "Saving..." : "Save edit"}
                                                </ActionButton>
                                                <ActionButton
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={() => handleExcuseQuotes([entry.quote.$id], "spelling")}
                                                    loading={isSpellingBusy}
                                                    loadingLabel="Saving..."
                                                    disabled={submitting || isSpellingBusy}
                                                >
                                                    Excuse quote
                                                </ActionButton>
                                            </CardActions>
                                        </Card>
                                    );
                                })}
                            </Stack>
                        </CardContent>
                    </Card>
                </Stack>
            )}

            {activePrimaryTab === "group" && activeGroupTab === "leave" && (
                <Card sx={submittingCardSx}>
                    <CardContent>
                        <Stack spacing={2}>
                            <Typography variant="h6">Leave group</Typography>
                            <Typography variant="body2" color="text.secondary">
                                You can leave at any time. Owners must transfer ownership before leaving.
                            </Typography>
                            <ActionButton
                                variant="outlined"
                                color="secondary"
                                onClick={handleLeaveGroup}
                                loading={submitting}
                                loadingLabel="Leaving..."
                            >
                                Leave group
                            </ActionButton>
                        </Stack>
                    </CardContent>
                </Card>
            )}

            {activePrimaryTab === "group" && activeGroupTab === "more" && (
                <Card>
                    <CardContent>
                        <Stack spacing={1.5}>
                            <Typography variant="h6">More settings</Typography>
                            <Typography variant="body2" color="text.secondary">
                                More group settings are coming soon.
                            </Typography>
                        </Stack>
                    </CardContent>
                </Card>
            )}
        </Stack>
    );
};

export default GroupDashboard;
