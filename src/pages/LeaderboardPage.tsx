import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, doc, onSnapshot, query } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { auth, db, ensureAnonAuth, functions } from "../lib/firebase";

type GameDoc = {
  hostUid?: string;
  status?: "lobby" | "submitting" | "voting" | "leaderboard" | "finished";
  roundNumber?: number;
};

type PlayerRow = {
  id: string;
  name: string;
  score: number;
};

export default function LeaderboardPage() {
  const [game, setGame] = useState<GameDoc | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [message, setMessage] = useState("");
  const [startingRound, setStartingRound] = useState(false);
  const [endingGame, setEndingGame] = useState(false);
  const navigate = useNavigate();
  const gameId = localStorage.getItem("gameId")!;

  useEffect(() => {
    async function init() {
      try {
        await ensureAnonAuth();
      } catch (error: any) {
        setMessage(error?.message || "Failed to sign in.");
      }
    }

    init();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "games", gameId), (snap) => {
      const data = snap.data() as GameDoc | undefined;
      if (!data) return;

      setGame(data);

      if (data.status === "submitting") {
        navigate("/assignment");
        return;
      }

      if (data.status === "voting") {
        navigate("/vote");
        return;
      }

      if (data.status === "lobby") {
        navigate("/waiting");
      }
    });

    return () => unsub();
  }, [gameId, navigate]);

  useEffect(() => {
    const playersQuery = query(collection(db, "games", gameId, "players"));

    const unsub = onSnapshot(playersQuery, (snap) => {
      const nextPlayers = snap.docs
        .map((playerDoc) => {
          const data = playerDoc.data();
          return {
            id: playerDoc.id,
            name: data.name ?? "Anonymous",
            score: data.score ?? 0,
          };
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.name.localeCompare(b.name);
        });

      setPlayers(nextPlayers);
    });

    return () => unsub();
  }, [gameId]);

  async function startNextRound() {
    try {
      setStartingRound(true);
      setMessage("");
      await ensureAnonAuth();
      const fn = httpsCallable(functions, "startRound");
      await fn({ gameId });
    } catch (error: any) {
      setMessage(error?.message || "Failed to start next round.");
    } finally {
      setStartingRound(false);
    }
  }

  async function endGame() {
    try {
      setEndingGame(true);
      setMessage("");
      await ensureAnonAuth();
      const fn = httpsCallable(functions, "endGame");
      await fn({ gameId });
    } catch (error: any) {
      setMessage(error?.message || "Failed to end game.");
    } finally {
      setEndingGame(false);
    }
  }

  const isHost = !!game?.hostUid && game.hostUid === auth.currentUser?.uid;

  return (
    <div style={{ padding: 24 }}>
      <h1>{game?.status === "finished" ? "Final Leaderboard" : "Leaderboard"}</h1>
      <p>
        {game?.status === "finished"
          ? "Game over."
          : `Round ${game?.roundNumber ?? 0} complete.`}
      </p>

      {players.length === 0 ? (
        <p>No player scores yet.</p>
      ) : (
        <div style={{ maxWidth: 640 }}>
          {players.map((player, index) => (
            <div
              key={player.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                marginBottom: 12,
                border: "1px solid #ddd",
                borderRadius: 10,
                background: index === 0 ? "#fff6dd" : "#fff",
              }}
            >
              <div>
                <strong>
                  #{index + 1} {player.name}
                </strong>
              </div>
              <div>{player.score} pts</div>
            </div>
          ))}
        </div>
      )}

      {isHost ? (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={startNextRound}
            disabled={startingRound || endingGame || game?.status !== "leaderboard"}
          >
            {startingRound ? "Starting..." : "Play Another Round"}
          </button>
          <button
            onClick={endGame}
            disabled={startingRound || endingGame || game?.status === "finished"}
            style={{ marginLeft: 12 }}
          >
            {endingGame ? "Ending..." : "End Game"}
          </button>
        </div>
      ) : (
        <p style={{ marginTop: 24 }}>
          {game?.status === "finished"
            ? "The game has ended."
            : "Waiting for the host to start the next round."}
        </p>
      )}

      {message ? <p>{message}</p> : null}
    </div>
  );
}
