export interface SparringSession {
  id: string;
  user_id: string;
  created_at: string;
  duration_seconds: number;
  score: number;
  feedback_json: FeedbackData | null;
}

export interface FeedbackData {
  overall_summary: string;
  strengths: string[];
  areas_to_improve: string[];
  talk_ratio?: number;
  objections_handled?: number;
}

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  VoiceCall: undefined;
  CallResults: { sessionId: string };
};

export type TabParamList = {
  Home: undefined;
  History: undefined;
  Profile: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};
