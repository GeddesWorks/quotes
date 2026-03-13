import type { PersonDoc, QuoteDoc } from "../../util/appwriteTypes";

export interface StatsSummary {
    totalQuotes: number;
    totalPeople: number;
    topQuoted: { name: string; count: number } | null;
    topQuoter: { name: string; count: number } | null;
}

export interface ViewModeProps {
    quotes: QuoteDoc[];
    filteredQuotes: QuoteDoc[];
    people: PersonDoc[];
    peopleMap: Map<string, PersonDoc>;
    quoteOfTheDay: QuoteDoc | null;
    quoteOfTheWeek: QuoteDoc | null;
    stats: StatsSummary;
    search: string;
    onSearchChange: (value: string) => void;
    onQuoteSelect?: (quoteId: string) => void;
    favorites?: string[];
    quoteLikeCounts?: Record<string, number>;
    onToggleFavorite?: (quoteId: string) => void;
}
