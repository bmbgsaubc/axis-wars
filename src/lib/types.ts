export type Game = {
  status: "lobby" | "submitting" | "voting" | "leaderboard" | "finished";
  hostUid: string;
  roundNumber: number;
  currentRoundId: string | null;
  currentMatchupId: string | null;
  createdAt: number;
};

export type Player = {
  name: string;
  score: number;
  joinedAt: number;
  connected: boolean;
};

export type Round = {
  roundNumber: number;
  status: "submitting" | "voting" | "complete";
};

export type Pair = {
  memberAUid: string;
  memberBUid: string;
  memberARole: "x" | "y";
  memberBRole: "x" | "y";
  figureId: string;
  matchupId: string;
  xText: string | null;
  yText: string | null;
  complete: boolean;
};

export type Matchup = {
  figureId: string;
  pairAId: string;
  pairBId: string;
  state: "pending" | "live" | "closed";
  winnerPairId: string | null;
  votesA: number;
  votesB: number;
};

export type Figure = {
  imageUrl: string;
  difficulty?: "easy" | "medium" | "cursed";
  active: boolean;
};