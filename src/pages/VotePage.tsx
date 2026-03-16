import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions, ensureAnonAuth } from "../lib/firebase";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

type SubmissionDoc = {
  figureId: string;
  xText: string | null;
  yText: string | null;
};

type MatchupDoc = {
  entryAId: string;
  entryBId: string;
  figureId: string;
  state: string;
};

type FigureDoc = {
  imageUrl: string;
};

function FigureCard({
  title,
  imageUrl,
  xText,
  yText,
  votes,
  onVote,
  disabled,
}: {
  title: string;
  imageUrl: string;
  xText: string;
  yText: string;
  votes: number;
  onVote: () => void;
  disabled: boolean;
}) {
  return (
    <div style={{ width: "100%", maxWidth: 340 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 22, color: "#111", textAlign: "center" }}>
        {title}
      </h3>
      <p
        style={{
          margin: "0 0 14px",
          fontSize: 12,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "#888",
          textAlign: "center",
        }}
      >
        Votes: {votes}
      </p>
      <div style={{ position: "relative", width: "100%" }}>
        <img
          src={imageUrl}
          alt={title}
          style={{
            width: "100%",
            display: "block",
            background: "white",
            borderRadius: 22,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: -30,
            transform: "translateY(-50%) rotate(-90deg)",
            transformOrigin: "left top",
            background: "rgba(255,255,255,0.9)",
            padding: "8px 12px",
            borderRadius: 12,
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {yText}
        </div>
      </div>
      <div
        style={{
          marginTop: 14,
          background: "rgba(255,255,255,0.95)",
          padding: "12px 16px",
          borderRadius: 14,
          fontWeight: 700,
          fontSize: 20,
          textAlign: "center",
          color: "#111",
        }}
      >
        {xText}
      </div>
      <button
        onClick={onVote}
        disabled={disabled}
        style={{
          width: "100%",
          height: 52,
          marginTop: 16,
          border: "none",
          borderRadius: 16,
          background: disabled ? "#d9d9d9" : "#111",
          color: "#fff",
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: "0.04em",
        }}
      >
        Vote {title}
      </button>
    </div>
  );
}

export default function VotePage() {
  const gameId = localStorage.getItem("gameId") || "demo-game";
  const navigate = useNavigate();

  const [roundId, setRoundId] = useState("");
  const [matchupId, setMatchupId] = useState("");
  const [matchup, setMatchup] = useState<MatchupDoc | null>(null);
  const [entryA, setEntryA] = useState<SubmissionDoc | null>(null);
  const [entryB, setEntryB] = useState<SubmissionDoc | null>(null);
  const [figureUrl, setFigureUrl] = useState("");
  const [votesA, setVotesA] = useState(0);
  const [votesB, setVotesB] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);
  const [message, setMessage] = useState("Loading...");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        await ensureAnonAuth();
      } catch (error: any) {
        console.error(error);
        setMessage(error?.message || "Failed to sign in.");
      }
    }
    init();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "games", gameId), async (snap) => {
      const game = snap.data();
      if (!game) return;

      if (game.status === "leaderboard" || game.status === "finished") {
        navigate("/leaderboard");
        return;
      }

      if (game.status === "lobby") {
        navigate("/", { replace: true });
        return;
      }

      if (!game.currentRoundId || !game.currentMatchupId) {
        setMessage("No active matchup yet.");
        setLoading(false);
        return;
      }

      setRoundId(game.currentRoundId);
      setMatchupId(game.currentMatchupId);
      setHasVoted(false);
      setVotesA(0);
      setVotesB(0);
      setMessage("Choose the better graph.");

      const matchupSnap = await getDoc(
        doc(db, "games", gameId, "rounds", game.currentRoundId, "matchups", game.currentMatchupId)
      );
      const matchupData = matchupSnap.data() as MatchupDoc | undefined;

      if (!matchupData) {
        setMessage("Matchup not found.");
        setLoading(false);
        return;
      }

      setMatchup(matchupData);

      const entryASnap = await getDoc(
        doc(db, "games", gameId, "rounds", game.currentRoundId, "submissions", matchupData.entryAId)
      );
      const entryBSnap = await getDoc(
        doc(db, "games", gameId, "rounds", game.currentRoundId, "submissions", matchupData.entryBId)
      );
      const figSnap = await getDoc(doc(db, "figures", matchupData.figureId));

      setEntryA(entryASnap.data() as SubmissionDoc);
      setEntryB(entryBSnap.data() as SubmissionDoc);
      setFigureUrl((figSnap.data() as FigureDoc).imageUrl);
      setLoading(false);
    });

    return () => unsub();
  }, [gameId, navigate]);

  useEffect(() => {
    if (!roundId || !matchupId || !matchup) return;

    const votesQ = query(
      collection(db, "games", gameId, "rounds", roundId, "votes"),
      where("matchupId", "==", matchupId)
    );

    const unsub = onSnapshot(votesQ, (snap) => {
      let a = 0;
      let b = 0;
      const uid = auth.currentUser?.uid;
      let nextHasVoted = false;

      for (const docSnap of snap.docs) {
        const vote = docSnap.data();
        if (vote.votedForEntryId === matchup.entryAId) a++;
        if (vote.votedForEntryId === matchup.entryBId) b++;
        if (vote.voterUid === uid) nextHasVoted = true;
      }

      setVotesA(a);
      setVotesB(b);
      setHasVoted(nextHasVoted);
    });

    return () => unsub();
  }, [gameId, roundId, matchupId, matchup]);

  async function voteFor(entryId: string) {
    try {
      await ensureAnonAuth();
      const fn = httpsCallable(functions, "castVote");
      await fn({
        gameId,
        roundId,
        matchupId,
        votedForEntryId: entryId,
      });
      setHasVoted(true);
      setMessage("Vote submitted.");
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to vote.");
    }
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#fff",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "24px 20px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 360, textAlign: "center", color: "#444" }}>
          Loading vote screen...
        </div>
      </div>
    );
  }

  if (!matchup || !entryA || !entryB) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#fff",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "24px 20px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 360, textAlign: "center", color: "#444" }}>
          {message}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fff",
        display: "flex",
        justifyContent: "center",
        padding: "24px 20px 40px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 780,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          textAlign: "center",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#888",
            }}
          >
            Live matchup
          </p>
          <h2 style={{ margin: "10px 0 0", fontSize: 30, color: "#111" }}>
            Vote for the better graph
          </h2>
        </div>
        {message ? <p style={{ margin: 0, color: "#666" }}>{message}</p> : null}
        <div
          style={{
            width: "100%",
            display: "flex",
            gap: 28,
            alignItems: "flex-start",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <FigureCard
            title="Graph A"
            imageUrl={figureUrl}
            xText={entryA.xText || ""}
            yText={entryA.yText || ""}
            votes={votesA}
            onVote={() => voteFor(matchup.entryAId)}
            disabled={hasVoted}
          />
          <FigureCard
            title="Graph B"
            imageUrl={figureUrl}
            xText={entryB.xText || ""}
            yText={entryB.yText || ""}
            votes={votesB}
            onVote={() => voteFor(matchup.entryBId)}
            disabled={hasVoted}
          />
        </div>
      </div>
    </div>
  );
}
