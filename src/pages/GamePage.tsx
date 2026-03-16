import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db, ensureAnonAuth } from "../lib/firebase";

type GameStatus = "lobby" | "submitting" | "voting" | "leaderboard" | "finished";

type GameDoc = {
  status?: GameStatus;
  roundNumber?: number;
  currentRoundId?: string | null;
  currentMatchupId?: string | null;
};

type PlayerRow = {
  id: string;
  name: string;
  score: number;
  joinedAt: number;
  connected: boolean;
};

type SubmissionRow = {
  id: string;
  playerUid: string;
  figureId: string;
  matchupId: string;
  sequenceNumber: number;
  xText: string | null;
  yText: string | null;
  complete: boolean;
};

type MatchupRow = {
  id: string;
  entryAId: string;
  entryBId: string;
  figureId: string;
  state: "pending" | "live" | "closed";
  winnerEntryId: string | null;
  votesA?: number;
  votesB?: number;
};

function getInitialRoomCode() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("gameId")?.trim();
  const fromStorage =
    localStorage.getItem("displayGameId")?.trim() ||
    localStorage.getItem("gameId")?.trim();

  return fromUrl || fromStorage || "";
}

function getJoinUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

function formatStage(status: GameStatus | undefined, matchupState?: MatchupRow["state"]) {
  if (!status) return "Connecting";
  if (status === "voting" && matchupState === "closed") return "Between matchups";
  if (status === "submitting") return "Answer phase";
  if (status === "leaderboard") return "Leaderboard";
  if (status === "finished") return "Final results";
  if (status === "voting") return "Vote phase";
  return "Lobby";
}

function panelStyle(borderColor: string) {
  return {
    background: "rgba(255,255,255,0.92)",
    border: `1px solid ${borderColor}`,
    borderRadius: 28,
    boxShadow: "0 24px 60px rgba(24, 29, 39, 0.08)",
    backdropFilter: "blur(18px)",
  } as const;
}

function MetricCard({
  label,
  value,
  hint,
  compactValue = false,
  compact = false,
}: {
  label: string;
  value: string;
  hint?: string;
  compactValue?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        ...panelStyle("rgba(17, 17, 17, 0.08)"),
        padding: compact ? "14px 16px" : "20px 22px",
        minHeight: compact ? 96 : 138,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <p
          style={{
            margin: 0,
            fontSize: compact ? 11 : 13,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#6c727f",
          }}
      >
        {label}
      </p>
      <div>
        <h3
          style={{
            margin: compact ? "10px 0 0" : "16px 0 0",
            fontSize: compact
              ? compactValue
                ? "clamp(0.9rem, 1.2vw, 1.05rem)"
                : "clamp(1.4rem, 2vw, 1.9rem)"
              : compactValue
                ? "clamp(1rem, 1.5vw, 1.25rem)"
                : "clamp(2rem, 3vw, 2.8rem)",
            lineHeight: 1,
            color: "#111111",
            wordBreak: "break-word",
          }}
        >
          {value}
        </h3>
        {hint ? (
          <p style={{ margin: "12px 0 0", color: "#5f6570", fontSize: 15 }}>{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

function ProgressCard({
  title,
  subtitle,
  current,
  total,
}: {
  title: string;
  subtitle: string;
  current: number;
  total: number;
}) {
  const safeTotal = Math.max(total, 1);
  const percentage = Math.min(100, Math.round((current / safeTotal) * 100));

  return (
    <div
      style={{
        ...panelStyle("rgba(17, 17, 17, 0.08)"),
        padding: "28px 30px",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 13,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "#6c727f",
        }}
      >
        Live progress
      </p>
      <h2
        style={{
          margin: "14px 0 0",
          fontSize: "clamp(2rem, 4vw, 3.5rem)",
          lineHeight: 1,
          color: "#111111",
        }}
      >
        {title}
      </h2>
      <p style={{ margin: "14px 0 0", color: "#5f6570", fontSize: 18 }}>{subtitle}</p>
      <div
        style={{
          marginTop: 26,
          height: 18,
          borderRadius: 999,
          background: "#e9ebef",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            borderRadius: 999,
            background: "linear-gradient(90deg, #111111 0%, #5b616f 100%)",
            transition: "width 180ms ease-out",
          }}
        />
      </div>
      <p
        style={{
          margin: "16px 0 0",
          fontSize: 16,
          fontWeight: 600,
          color: "#111111",
        }}
      >
        {current}/{total} complete
      </p>
    </div>
  );
}

function FigureDisplay({
  title,
  imageUrl,
  xText,
  yText,
  votes,
  highlight,
}: {
  title: string;
  imageUrl: string;
  xText: string;
  yText: string;
  votes: number;
  highlight: boolean;
}) {
  return (
    <div
      style={{
        ...panelStyle(highlight ? "rgba(17, 17, 17, 0.18)" : "rgba(17, 17, 17, 0.08)"),
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 28, color: "#111111" }}>{title}</h3>
        <div
          style={{
            padding: "12px 18px",
            borderRadius: 999,
            background: highlight ? "#c96b2c" : "#dfe8f6",
            color: highlight ? "#ffffff" : "#1f3b63",
            fontWeight: 700,
            fontSize: 24,
            lineHeight: 1,
          }}
        >
          {votes} vote{votes === 1 ? "" : "s"}
        </div>
      </div>
      <div style={{ position: "relative" }}>
        <img
          src={imageUrl}
          alt={title}
          style={{
            width: "100%",
            maxHeight: 420,
            objectFit: "contain",
            display: "block",
            background: "#ffffff",
            borderRadius: 24,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 20,
            transform: "translateX(-50%)",
            maxWidth: "70%",
            background: "rgba(255,255,255,0.95)",
            color: "#111111",
            padding: "12px 18px",
            borderRadius: 16,
            fontSize: 18,
            fontWeight: 700,
            textAlign: "center",
            boxShadow: "0 12px 30px rgba(17, 17, 17, 0.12)",
          }}
        >
          {xText}
        </div>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 40,
            transform: "translate(-100%, -50%)",
            maxWidth: 260,
            background: "rgba(255,255,255,0.95)",
            color: "#111111",
            padding: "12px 18px",
            borderRadius: 16,
            fontSize: 18,
            fontWeight: 700,
            textAlign: "right",
            whiteSpace: "nowrap",
            boxShadow: "0 12px 30px rgba(17, 17, 17, 0.12)",
          }}
        >
          {yText}
        </div>
      </div>
    </div>
  );
}

export default function GamePage() {
  const [roomCodeInput, setRoomCodeInput] = useState(getInitialRoomCode);
  const [gameId, setGameId] = useState(getInitialRoomCode);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [gameMissing, setGameMissing] = useState(false);
  const [game, setGame] = useState<GameDoc | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [matchups, setMatchups] = useState<MatchupRow[]>([]);
  const [figureUrl, setFigureUrl] = useState("");
  const [liveVotes, setLiveVotes] = useState({ a: 0, b: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;

    async function initAuth() {
      try {
        await ensureAnonAuth();
        if (!cancelled) {
          setAuthReady(true);
          setAuthError("");
        }
      } catch (error: any) {
        if (!cancelled) {
          setAuthError(error?.message || "Failed to sign in.");
        }
      }
    }

    initAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authReady || !gameId) {
      setGame(null);
      setGameMissing(false);
      return;
    }

    const unsub = onSnapshot(doc(db, "games", gameId), (snap) => {
      if (!snap.exists()) {
        setGame(null);
        setGameMissing(true);
        return;
      }

      setGameMissing(false);
      setGame(snap.data() as GameDoc);
    });

    return () => unsub();
  }, [authReady, gameId]);

  useEffect(() => {
    if (!authReady || !gameId) {
      setPlayers([]);
      return;
    }

    const playersQuery = query(collection(db, "games", gameId, "players"), orderBy("joinedAt"));

    const unsub = onSnapshot(playersQuery, (snap) => {
      const nextPlayers = snap.docs
        .map((playerDoc) => {
          const data = playerDoc.data();
          return {
            id: playerDoc.id,
            name: data.name ?? "Anonymous",
            score: data.score ?? 0,
            joinedAt: data.joinedAt ?? 0,
            connected: data.connected ?? true,
          };
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.name.localeCompare(b.name);
        });

      setPlayers(nextPlayers);
    });

    return () => unsub();
  }, [authReady, gameId]);

  useEffect(() => {
    if (!authReady || !gameId || !game?.currentRoundId) {
      setSubmissions([]);
      setMatchups([]);
      setFigureUrl("");
      setLiveVotes({ a: 0, b: 0, total: 0 });
      return;
    }

    const roundId = game.currentRoundId;
    const submissionsQuery = query(
      collection(db, "games", gameId, "rounds", roundId, "submissions"),
      orderBy("__name__")
    );
    const matchupsQuery = query(
      collection(db, "games", gameId, "rounds", roundId, "matchups"),
      orderBy("__name__")
    );

    const unsubSubmissions = onSnapshot(submissionsQuery, (snap) => {
      setSubmissions(
        snap.docs.map((submissionDoc) => ({
          id: submissionDoc.id,
          ...(submissionDoc.data() as Omit<SubmissionRow, "id">),
        }))
      );
    });

    const unsubMatchups = onSnapshot(matchupsQuery, (snap) => {
      setMatchups(
        snap.docs.map((matchupDoc) => ({
          id: matchupDoc.id,
          ...(matchupDoc.data() as Omit<MatchupRow, "id">),
        }))
      );
    });

    return () => {
      unsubSubmissions();
      unsubMatchups();
    };
  }, [authReady, game?.currentRoundId, gameId]);

  const currentMatchup =
    matchups.find((matchup) => matchup.id === game?.currentMatchupId) ||
    matchups.find((matchup) => matchup.state === "live") ||
    null;

  const entryA = currentMatchup
    ? submissions.find((submission) => submission.id === currentMatchup.entryAId) || null
    : null;
  const entryB = currentMatchup
    ? submissions.find((submission) => submission.id === currentMatchup.entryBId) || null
    : null;

  useEffect(() => {
    const figureId = currentMatchup?.figureId;

    if (!figureId) {
      setFigureUrl("");
      return;
    }

    let cancelled = false;

    async function loadFigure(resolvedFigureId: string) {
      const figSnap = await getDoc(doc(db, "figures", resolvedFigureId));
      if (!cancelled) {
        setFigureUrl(figSnap.data()?.imageUrl ?? "");
      }
    }

    loadFigure(figureId);

    return () => {
      cancelled = true;
    };
  }, [currentMatchup?.figureId]);

  useEffect(() => {
    if (!authReady || !gameId || !game?.currentRoundId || !currentMatchup?.id) {
      setLiveVotes({ a: 0, b: 0, total: 0 });
      return;
    }

    const votesQuery = query(
      collection(db, "games", gameId, "rounds", game.currentRoundId, "votes"),
      where("matchupId", "==", currentMatchup.id)
    );

    const unsub = onSnapshot(votesQuery, (snap) => {
      let votesA = 0;
      let votesB = 0;

      for (const voteDoc of snap.docs) {
        const vote = voteDoc.data();
        if (vote.votedForEntryId === currentMatchup.entryAId) votesA++;
        if (vote.votedForEntryId === currentMatchup.entryBId) votesB++;
      }

      setLiveVotes({
        a: votesA,
        b: votesB,
        total: votesA + votesB,
      });
    });

    return () => unsub();
  }, [authReady, currentMatchup?.id, currentMatchup?.entryAId, currentMatchup?.entryBId, game?.currentRoundId, gameId]);

  const joinUrl = getJoinUrl();
  const signedInCount = players.length;
  const submittedCount = submissions.filter((submission) => submission.complete).length;
  const totalSubmissions = submissions.length;
  const firstPassComplete = submissions.filter(
    (submission) => submission.sequenceNumber === 1 && submission.complete
  ).length;
  const secondPassComplete = submissions.filter(
    (submission) => submission.sequenceNumber === 2 && submission.complete
  ).length;
  const currentMatchupNumber = currentMatchup
    ? matchups.findIndex((matchup) => matchup.id === currentMatchup.id) + 1
    : 0;
  const displayedVotesA =
    currentMatchup?.state === "closed" ? currentMatchup.votesA ?? liveVotes.a : liveVotes.a;
  const displayedVotesB =
    currentMatchup?.state === "closed" ? currentMatchup.votesB ?? liveVotes.b : liveVotes.b;
  const leadingEntryId =
    displayedVotesA === displayedVotesB
      ? null
      : displayedVotesA > displayedVotesB
        ? currentMatchup?.entryAId ?? null
        : currentMatchup?.entryBId ?? null;
  const stageLabel = formatStage(game?.status, currentMatchup?.state);
  const inputReady = roomCodeInput.trim().length > 0;

  function connectRoom() {
    const nextGameId = roomCodeInput.trim();
    if (!nextGameId) return;

    localStorage.setItem("displayGameId", nextGameId);
    localStorage.setItem("gameId", nextGameId);
    window.history.replaceState({}, "", `${window.location.pathname}?gameId=${encodeURIComponent(nextGameId)}`);
    setGameId(nextGameId);
  }

  function clearRoom() {
    localStorage.removeItem("displayGameId");
    window.history.replaceState({}, "", window.location.pathname);
    setRoomCodeInput("");
    setGameId("");
    setGame(null);
    setGameMissing(false);
  }

  if (authError) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: 32,
          background:
            "radial-gradient(circle at top left, #f5f0e5 0%, #f7f6f2 42%, #edf3f6 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            ...panelStyle("rgba(17, 17, 17, 0.08)"),
            maxWidth: 520,
            width: "100%",
            padding: "32px 36px",
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 34, color: "#111111" }}>Display unavailable</h1>
          <p style={{ margin: "16px 0 0", color: "#5f6570", fontSize: 18 }}>{authError}</p>
        </div>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: 32,
          background:
            "radial-gradient(circle at top left, #f5f0e5 0%, #f7f6f2 42%, #edf3f6 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            ...panelStyle("rgba(17, 17, 17, 0.08)"),
            maxWidth: 520,
            width: "100%",
            padding: "32px 36px",
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 34, color: "#111111" }}>Connecting display</h1>
          <p style={{ margin: "16px 0 0", color: "#5f6570", fontSize: 18 }}>
            Signing in to the room screen.
          </p>
        </div>
      </div>
    );
  }

  if (!gameId) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: 32,
          background:
            "radial-gradient(circle at top left, #f5f0e5 0%, #f7f6f2 42%, #edf3f6 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            ...panelStyle("rgba(17, 17, 17, 0.08)"),
            maxWidth: 620,
            width: "100%",
            padding: "32px 36px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <img
            src={`${import.meta.env.BASE_URL}fig-figures.png`}
            alt="Axis Wars"
            style={{
              width: "100%",
              maxWidth: 200,
              height: "auto",
              display: "block",
            }}
          />
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#6c727f",
              }}
            >
              Projector display
            </p>
            <h1 style={{ margin: "12px 0 0", fontSize: 42, color: "#111111" }}>
              Connect to a room
            </h1>
            <p style={{ margin: "14px 0 0", color: "#5f6570", fontSize: 18 }}>
              Enter the room code for the game you want to project.
            </p>
          </div>
          <input
            placeholder="Room code"
            value={roomCodeInput}
            onChange={(event) => setRoomCodeInput(event.target.value)}
            style={{
              width: "100%",
              height: 64,
              borderRadius: 20,
              border: "1px solid #d6dae3",
              padding: "0 20px",
              fontSize: 20,
              color: "#111111",
              background: "#ffffff",
            }}
          />
          <button
            onClick={connectRoom}
            disabled={!inputReady}
            style={{
              width: "100%",
              height: 62,
              border: "none",
              borderRadius: 20,
              background: inputReady ? "#111111" : "#d9dce3",
              color: "#ffffff",
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}
          >
            Open game page
          </button>
          <p style={{ margin: 0, color: "#5f6570", fontSize: 16 }}>
            Players join at {joinUrl}
          </p>
        </div>
      </div>
    );
  }

  if (gameMissing) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: 32,
          background:
            "radial-gradient(circle at top left, #f5f0e5 0%, #f7f6f2 42%, #edf3f6 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            ...panelStyle("rgba(17, 17, 17, 0.08)"),
            maxWidth: 620,
            width: "100%",
            padding: "32px 36px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <img
            src={`${import.meta.env.BASE_URL}fig-figures.png`}
            alt="Axis Wars"
            style={{
              width: "100%",
              maxWidth: 200,
              height: "auto",
              display: "block",
            }}
          />
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#6c727f",
              }}
            >
              Room not found
            </p>
            <h1 style={{ margin: "12px 0 0", fontSize: 42, color: "#111111" }}>{gameId}</h1>
            <p style={{ margin: "14px 0 0", color: "#5f6570", fontSize: 18 }}>
              Check the room code, then reconnect the projector display.
            </p>
          </div>
          <input
            placeholder="Room code"
            value={roomCodeInput}
            onChange={(event) => setRoomCodeInput(event.target.value)}
            style={{
              width: "100%",
              height: 64,
              borderRadius: 20,
              border: "1px solid #d6dae3",
              padding: "0 20px",
              fontSize: 20,
              color: "#111111",
              background: "#ffffff",
            }}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            <button
              onClick={connectRoom}
              disabled={!inputReady}
              style={{
                width: "100%",
                height: 62,
                border: "none",
                borderRadius: 20,
                background: inputReady ? "#111111" : "#d9dce3",
                color: "#ffffff",
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              Try another room
            </button>
            <button
              onClick={clearRoom}
              style={{
                width: "100%",
                height: 62,
                border: "1px solid #d6dae3",
                borderRadius: 20,
                background: "#ffffff",
                color: "#111111",
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              Clear display
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "24px clamp(20px, 3vw, 36px) 36px",
        background:
          "radial-gradient(circle at top left, #f5f0e5 0%, #f7f6f2 42%, #edf3f6 100%)",
        color: "#111111",
      }}
    >
      <div
        style={{
          ...panelStyle("rgba(17, 17, 17, 0.08)"),
          padding: "20px clamp(18px, 2.5vw, 30px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 18,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <img
            src={`${import.meta.env.BASE_URL}fig-figures.png`}
            alt="Axis Wars"
            style={{
              width: "100%",
              maxWidth: 150,
              height: "auto",
              display: "block",
            }}
          />
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#6c727f",
              }}
            >
              Live game page
            </p>
            <h1 style={{ margin: "8px 0 0", fontSize: "clamp(2rem, 4vw, 3.2rem)" }}>
              {game?.status === "finished" ? "Final results" : stageLabel}
            </h1>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div
            style={{
              padding: "12px 18px",
              borderRadius: 999,
              background: "#111111",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: "0.06em",
            }}
          >
            ROOM {gameId}
          </div>
          <button
            onClick={clearRoom}
            style={{
              height: 48,
              border: "1px solid #d6dae3",
              borderRadius: 999,
              background: "#ffffff",
              color: "#111111",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            Switch room
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 16,
        }}
      >
        <MetricCard
          label="Players signed in"
          value={`${signedInCount}`}
          compact
        />
        <MetricCard
          label="Join URL"
          value={joinUrl.replace(/^https?:\/\//, "")}
          compactValue
          compact
        />
        <MetricCard
          label="Round"
          value={game?.roundNumber ? `${game.roundNumber}` : "0"}
          hint={
            game?.status === "lobby"
              ? "The next round begins when the host starts."
              : `Status: ${game?.status ?? "loading"}`
          }
          compact
        />
        <MetricCard
          label="Display sync"
          value="On"
          compact
        />
      </div>

      {game?.status === "lobby" ? (
        <div
          style={{
            marginTop: 20,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 20,
          }}
        >
          <div
            style={{
              ...panelStyle("rgba(17, 17, 17, 0.08)"),
              padding: "30px clamp(24px, 3vw, 38px)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 13,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#6c727f",
              }}
            >
              Before the round starts
            </p>
            <h2
              style={{
                margin: "14px 0 0",
                fontSize: "clamp(2.4rem, 5vw, 4.8rem)",
                lineHeight: 0.95,
                maxWidth: 760,
              }}
            >
              Sign in, join room <span style={{ whiteSpace: "nowrap" }}>{gameId}</span>, and wait for
              the host.
            </h2>
            <p
              style={{
                margin: "20px 0 0",
                maxWidth: 760,
                color: "#5f6570",
                fontSize: 22,
                lineHeight: 1.5,
              }}
            >
              Each player will complete two full graphs by naming both axes, then the room will
              vote on the head-to-head results for each figure.
            </p>
          </div>

          <div
            style={{
              ...panelStyle("rgba(17, 17, 17, 0.08)"),
              padding: "26px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 13,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#6c727f",
              }}
            >
              Joined players
            </p>
            {players.length === 0 ? (
              <p style={{ margin: "8px 0 0", color: "#5f6570", fontSize: 18 }}>
                No one has joined this room yet.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 12,
                }}
              >
                {players.map((player) => (
                  <div
                    key={player.id}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 18,
                      background: "#f4f6f9",
                      border: "1px solid #e3e7ef",
                      fontSize: 18,
                      fontWeight: 600,
                    }}
                  >
                    {player.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {game?.status === "submitting" ? (
        <div
          style={{
            marginTop: 20,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 20,
          }}
        >
          <div
            style={{
              ...panelStyle("rgba(17, 17, 17, 0.08)"),
              padding: "30px clamp(24px, 3vw, 38px)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 13,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#6c727f",
              }}
            >
              Round {game.roundNumber ?? 0}
            </p>
            <h2
              style={{
                margin: "14px 0 0",
                fontSize: "clamp(2.8rem, 6vw, 5.4rem)",
                lineHeight: 0.94,
                maxWidth: 780,
              }}
            >
              Input your answers.
            </h2>
            <p
              style={{
                margin: "20px 0 0",
                maxWidth: 760,
                color: "#5f6570",
                fontSize: 22,
                lineHeight: 1.5,
              }}
            >
              Everyone should finish both assigned figures on their own device. Voting will open
              automatically once all graphs are ready.
            </p>
          </div>

          <ProgressCard
            title={`${submittedCount} submitted`}
            subtitle={`${firstPassComplete}/${signedInCount} first-pass and ${secondPassComplete}/${signedInCount} second-pass graphs done`}
            current={submittedCount}
            total={totalSubmissions || 1}
          />
        </div>
      ) : null}

      {game?.status === "voting" ? (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              ...panelStyle("rgba(17, 17, 17, 0.08)"),
              padding: "28px clamp(24px, 3vw, 36px)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "#6c727f",
                  }}
                >
                  Round {game.roundNumber ?? 0}
                </p>
                <h2
                  style={{
                    margin: "12px 0 0",
                    fontSize: "clamp(2.4rem, 5vw, 4.6rem)",
                    lineHeight: 0.95,
                  }}
                >
                  {currentMatchup?.state === "closed"
                    ? "Waiting for the next matchup"
                    : "Vote for the better graph"}
                </h2>
                <p style={{ margin: "14px 0 0", color: "#5f6570", fontSize: 20 }}>
                  {currentMatchupNumber > 0
                    ? `Matchup ${currentMatchupNumber} of ${matchups.length}`
                    : "Opening matchup..."}
                  {" · "}
                  {currentMatchup?.state === "closed"
                    ? "Voting is closed until the host advances."
                    : "Cast one vote from your device."}
                </p>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div
                  style={{
                    padding: "14px 18px",
                    borderRadius: 18,
                    background: "#f4f6f9",
                    border: "1px solid #e3e7ef",
                    minWidth: 150,
                  }}
                  >
                    <p style={{ margin: 0, fontSize: 12, textTransform: "uppercase", color: "#6c727f" }}>
                      Votes in
                    </p>
                    <p style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 700 }}>
                      {liveVotes.total}/{signedInCount}
                    </p>
                  </div>
              </div>
            </div>
          </div>

          {currentMatchup && entryA && entryB && figureUrl ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
                gap: 20,
              }}
            >
              <FigureDisplay
                title="Graph A"
                imageUrl={figureUrl}
                xText={entryA.xText || "Pending"}
                yText={entryA.yText || "Pending"}
                votes={displayedVotesA}
                highlight={
                  currentMatchup.winnerEntryId === currentMatchup.entryAId ||
                  leadingEntryId === currentMatchup.entryAId
                }
              />
              <FigureDisplay
                title="Graph B"
                imageUrl={figureUrl}
                xText={entryB.xText || "Pending"}
                yText={entryB.yText || "Pending"}
                votes={displayedVotesB}
                highlight={
                  currentMatchup.winnerEntryId === currentMatchup.entryBId ||
                  leadingEntryId === currentMatchup.entryBId
                }
              />
            </div>
          ) : (
            <div
              style={{
                ...panelStyle("rgba(17, 17, 17, 0.08)"),
                padding: "28px 30px",
                textAlign: "center",
                color: "#5f6570",
                fontSize: 20,
              }}
            >
              Loading the current matchup...
            </div>
          )}
        </div>
      ) : null}

      {game?.status === "leaderboard" || game?.status === "finished" ? (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              ...panelStyle("rgba(17, 17, 17, 0.08)"),
              padding: "30px clamp(24px, 3vw, 38px)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 13,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#6c727f",
              }}
            >
              {game.status === "finished" ? "Game complete" : "Round complete"}
            </p>
            <h2
              style={{
                margin: "14px 0 0",
                fontSize: "clamp(2.8rem, 6vw, 5.4rem)",
                lineHeight: 0.94,
              }}
            >
              {game.status === "finished" ? "Final leaderboard" : "Leaderboard"}
            </h2>
            <p style={{ margin: "18px 0 0", color: "#5f6570", fontSize: 22 }}>
              {game.status === "finished"
                ? "The game is over."
                : "Scores update live here as soon as the round ends."}
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            {players.length === 0 ? (
              <div
                style={{
                  ...panelStyle("rgba(17, 17, 17, 0.08)"),
                  padding: "28px 30px",
                  color: "#5f6570",
                  fontSize: 20,
                }}
              >
                No player scores yet.
              </div>
            ) : (
              players.map((player, index) => (
                <div
                  key={player.id}
                  style={{
                    ...panelStyle(index === 0 ? "rgba(17, 17, 17, 0.14)" : "rgba(17, 17, 17, 0.08)"),
                    padding: "24px 26px",
                    background: index === 0 ? "rgba(249, 244, 231, 0.96)" : "rgba(255,255,255,0.92)",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "#6c727f",
                    }}
                  >
                    Place #{index + 1}
                  </p>
                  <h3 style={{ margin: "14px 0 0", fontSize: 32, color: "#111111" }}>
                    {player.name}
                  </h3>
                  <p style={{ margin: "12px 0 0", fontSize: 22, fontWeight: 700, color: "#111111" }}>
                    {player.score} pts
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
