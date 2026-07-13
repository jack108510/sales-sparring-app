// Buyer persona types — each has a distinct selling challenge
export type BuyerPersona =
  | 'skeptic'      // challenges every claim, wants proof
  | 'rusher'       // limited time, wants the bottom line fast
  | 'price_hunter' // fixated on cost, constantly compares
  | 'indifferent'  // hard to engage, low urgency
  | 'executive'    // big picture only, no patience for details
  | 'champion';    // already interested, needs help making the case internally

export type Difficulty = 'warm' | 'cold' | 'ice_cold';

export interface BuyerSetup {
  persona: BuyerPersona;
  difficulty: Difficulty;
  scenario_type?: string;
}

export interface ScoreBreakdown {
  rapport: number;
  discovery: number;
  handling: number;
  closing: number;
}

export interface FeedbackData {
  overall_summary: string;
  strengths: string[];
  areas_to_improve: string[];
  one_fix?: string;
  talk_ratio?: number;          // 0–100, rep's share of air time
  filler_count?: number;        // um, uh, like, you know
  question_count?: number;      // discovery questions asked
  objections_handled?: number;
  score_breakdown?: ScoreBreakdown;
}

export interface SparringSession {
  id: string;
  user_id: string;
  created_at: string;
  duration_seconds: number;
  score: number;
  feedback_json: FeedbackData | null;
  buyer_persona?: BuyerPersona;
  difficulty?: Difficulty;
  scenario_type?: string;
  retell_call_id?: string;
}

// Objection Gym drill results
export interface DrillResult {
  objection: string;
  response: string;
  score: number;
  coaching: string;
  category: DrillCategory;
}

export type DrillCategory = 'price' | 'timing' | 'trust' | 'authority' | 'fit';

export interface DrillSession {
  id: string;
  user_id: string;
  created_at: string;
  category: DrillCategory;
  rounds: DrillResult[];
  avg_score: number;
}

export type RootStackParamList = {
  Main: undefined;
  VoiceCall: { setup?: BuyerSetup };
  CallResults: { sessionId: string };
  DrillResults: { session: DrillSession };
};

export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

export type TabParamList = {
  Spar: undefined;
  Drill: undefined;
  Vault: undefined;
  You: undefined;
};
