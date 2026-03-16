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

export type Submission = {
  playerUid: string;
  figureId: string;
  matchupId: string;
  sequenceNumber: 1 | 2;
  xText: string | null;
  yText: string | null;
  complete: boolean;
};

export type Matchup = {
  figureId: string;
  entryAId: string;
  entryBId: string;
  state: "pending" | "live" | "closed";
  winnerEntryId: string | null;
  votesA: number;
  votesB: number;
};

export type Figure = {
  imageUrl: string;
  difficulty?: "easy" | "medium" | "cursed";
  active: boolean;
};
