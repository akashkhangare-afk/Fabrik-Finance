import type { Tone } from "@/components/ui/primitives";
import type { MatchLevel } from "@/server/engines/funding-match";

export const LEVEL_TONE: Record<MatchLevel, Tone> = { high: "ok", possible: "info", more_info: "warn", unlikely: "neutral" };
export const TYPE_LABEL: Record<string, string> = { loan: "Loan", loan_guarantee: "Loan guarantee", grant: "Grant", cost_share: "Cost-share", conservation: "Conservation", disaster_assistance: "Disaster assistance", commodity_support: "Commodity support", tax_incentive: "Tax incentive" };
