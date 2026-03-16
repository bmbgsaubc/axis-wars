import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { auth, db, functions, ensureAnonAuth } from "../lib/firebase";

type GameDoc = {
  hostUid?: string;
  status?: string;
  currentRoundId?: string | null;
  currentMatchupId?: string | null;
  roundNumber?: number;
};

type MatchupDoc = {
  entryAId: string;
  entryBId: string;
  figureId: string;
  state: "pending" | "live" | "closed";
  winnerEntryId: string | null;
  votesA?: number;
  votesB?: number;
};

export default function HostPage() {
  const gameId = localStorage.getItem("gameId") || "demo-game";
  const joinUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
  const displayUrl = new URL(
    `${import.meta.env.BASE_URL.replace(/\/$/, "")}/game?gameId=${encodeURIComponent(gameId)}`,
    window.location.origin
  ).toString();

  const [message, setMessage] = useState("Signing in...");
  const [game, setGame] = useState<GameDoc | null>(null);
  const [matchups, setMatchups] = useState<Array<{ id: string } & MatchupDoc>>(
    []
  );

  useEffect(() => {
    async function init() {
      try {
        await ensureAnonAuth();
        setMessage(`Signed in as ${auth.currentUser?.uid ?? "unknown"}`);
      } catch (error: any) {
        console.error(error);
        setMessage(error?.message || "Failed to sign in.");
      }
    }
    init();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "games", gameId), (snap) => {
      const data = snap.data() as GameDoc | undefined;
      setGame(data ?? null);
    });

    return () => unsub();
  }, [gameId]);

  useEffect(() => {
    async function loadMatchups() {
      if (!game?.currentRoundId) {
        setMatchups([]);
        return;
      }

      const q = query(
        collection(db, "games", gameId, "rounds", game.currentRoundId, "matchups"),
        orderBy("__name__")
      );

      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as MatchupDoc),
      }));

      setMatchups(docs);
    }

    loadMatchups();
  }, [gameId, game?.currentRoundId, game?.currentMatchupId, game?.status]);

  async function claimHost() {
    try {
      await ensureAnonAuth();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("No authenticated user.");

      await setDoc(doc(db, "games", gameId), { hostUid: uid }, { merge: true });
      setMessage("Host claimed successfully.");
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to claim host.");
    }
  }

  async function startRound() {
    try {
      await ensureAnonAuth();
      const fn = httpsCallable(functions, "startRound");
      await fn({ gameId });
      setMessage("Round started successfully.");
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to start round.");
    }
  }

  async function endGame() {
    try {
      await ensureAnonAuth();
      const fn = httpsCallable(functions, "endGame");
      await fn({ gameId });
      setMessage("Game ended.");
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to end game.");
    }
  }

  async function closeCurrentVoting() {
    try {
      await ensureAnonAuth();

      if (!game?.currentRoundId) {
        throw new Error("No current round.");
      }

      if (!game?.currentMatchupId) {
        throw new Error("No live matchup to close.");
      }

      const fn = httpsCallable(functions, "closeMatchupVoting");
      await fn({
        gameId,
        roundId: game.currentRoundId,
        matchupId: game.currentMatchupId,
      });

      setMessage(`Closed voting for ${game.currentMatchupId}.`);
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to close current voting.");
    }
  }

  async function openNextMatchup() {
    try {
      await ensureAnonAuth();

      if (!game?.currentRoundId) {
        throw new Error("No current round.");
      }

      const roundId = game.currentRoundId;

      const q = query(
        collection(db, "games", gameId, "rounds", roundId, "matchups"),
        orderBy("__name__")
      );
      const snap = await getDocs(q);

      const allMatchups = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as MatchupDoc),
      }));

      const nextPending = allMatchups.find((m) => m.state === "pending");

      if (!nextPending) {
        setMessage("No pending matchups left. Round is finished.");
        return;
      }

      const fn = httpsCallable(functions, "openMatchupVoting");
      await fn({
        gameId,
        roundId,
        matchupId: nextPending.id,
      });

      setMessage(`Opened voting for ${nextPending.id}.`);
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to open next matchup.");
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Host Dashboard</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={claimHost}>Claim Host</button>
        <button onClick={startRound}>
          {game?.roundNumber ? "Play Another Round" : "Start Round"}
        </button>
        <button onClick={closeCurrentVoting}>Close Current Voting</button>
        <button onClick={openNextMatchup}>Open Next Matchup</button>
        <button onClick={endGame}>End Game</button>
      </div>

      {message && <p>{message}</p>}

      <div style={{ marginTop: 24 }}>
        <h2>Room Links</h2>
        <p>Room code: {gameId}</p>
        <p>Join URL: {joinUrl}</p>
        <p>Projector URL: {displayUrl}</p>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>Game State</h2>
        <p>Status: {game?.status ?? "unknown"}</p>
        <p>Round: {game?.currentRoundId ?? "none"}</p>
        <p>Current Matchup: {game?.currentMatchupId ?? "none"}</p>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>Matchups</h2>
        {matchups.length === 0 ? (
          <p>No matchups loaded.</p>
        ) : (
          <ul>
            {matchups.map((m) => (
              <li key={m.id}>
                <strong>{m.id}</strong> — state: {m.state}
                {typeof m.votesA === "number" && typeof m.votesB === "number"
                  ? ` — votes ${m.votesA} : ${m.votesB}`
                  : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
