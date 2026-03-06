export interface ScoreItem {
  label: string;
  stars: number;
  reason: string;
}

export interface EvaluationResult {
  recommendation: 'RECOMMENDED' | 'NOT_RECOMMENDED' | 'NEEDS_REVIEW';
  totalScore: number;
  scores: ScoreItem[];
  opinion: string;
}

export interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}
