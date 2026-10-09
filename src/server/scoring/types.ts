import type { EligibilityResult } from "./eligibility";

export type Dimension = "tech" | "client" | "commercial" | "practical";

export interface ScoreReason {
  /** Human-readable explanation. */
  text: string;
  /** Points contributed (+/-) relative to the dimension baseline. */
  impact: number;
  /** Literal evidence (field value or text snippet) that triggered the reason. */
  evidence?: string;
}

export interface DimensionResult {
  /** null = Unknown: not enough information to score. */
  score: number | null;
  reasons: ScoreReason[];
  unknowns: string[];
}

export type ScoreConfidence = "high" | "medium" | "low";

export type ScoreReasons = Record<Dimension, DimensionResult> & {
  overallNote?: string;
  confidence?: ScoreConfidence;
  confidenceNote?: string;
  eligibility?: EligibilityResult;
};

export interface ScoreResult {
  version: string;
  tech: DimensionResult;
  client: DimensionResult;
  commercial: DimensionResult;
  practical: DimensionResult;
  overall: number | null;
  overallNote: string;
  /** How much of the score rests on known data (not a measure of fit). */
  confidence: ScoreConfidence;
  confidenceNote: string;
  eligibility: EligibilityResult;
}
