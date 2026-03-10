import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions, ensureAnonAuth } from "../lib/firebase";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

type PairDoc = {
  figureId: string;
  xText: string | null;
  yText: string | null;
};

type MatchupDoc = {
  pairAId: string;
  pairBId: string;
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
    <div style={{ width: 500 }}>
      <h3>
        {title} — Votes: {votes}
      </h3>
      <div style={{ position: "relative", width: 500 }}>
        <img
          src={imageUrl}
          alt={title}
          style={{ width: "100%", display: "block", background: "white" }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(255,255,255,0.9)",
            padding: "4px 8px",
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          {xText}
        </div>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: -40,
            transform: "translateY(-50%) rotate(-90deg)",
            transformOrigin: "left top",
            background: "rgba(255,255,255,0.9)",
            padding: "4px 8px",
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          {yText}
        </div>
      </div>
      <button onClick={onVote} disabled={disabled} style={{ marginTop: 12 }}>
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
  const [pairA, setPairA] = useState<PairDoc | null>(null);
  const [pairB, setPairB] = useState<PairDoc | null>(null);
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

      if (game.status === "leaderboard") {
        navigate("/leaderboard");
        return;
      }

      if (!game.currentRoundId || !game.currentMatchupId) {
        setMessage("No active matchup yet.");
        setLoading(false);
        return;
      }

      setRoundId(game.currentRoundId);
      setMatchupId(game.currentMatchupId);

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

      const pairASnap = await getDoc(
        doc(db, "games", gameId, "rounds", game.currentRoundId, "pairs", matchupData.pairAId)
      );
      const pairBSnap = await getDoc(
        doc(db, "games", gameId, "rounds", game.currentRoundId, "pairs", matchupData.pairBId)
      );
      const figSnap = await getDoc(doc(db, "figures", matchupData.figureId));

      setPairA(pairASnap.data() as PairDoc);
      setPairB(pairBSnap.data() as PairDoc);
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

      for (const docSnap of snap.docs) {
        const vote = docSnap.data();
        if (vote.votedForPairId === matchup.pairAId) a++;
        if (vote.votedForPairId === matchup.pairBId) b++;
        if (vote.voterUid === uid) setHasVoted(true);
      }

      setVotesA(a);
      setVotesB(b);
    });

    return () => unsub();
  }, [gameId, roundId, matchupId, matchup]);

  async function voteFor(pairId: string) {
    try {
      await ensureAnonAuth();
      const fn = httpsCallable(functions, "castVote");
      await fn({
        gameId,
        roundId,
        matchupId,
        votedForPairId: pairId,
      });
      setHasVoted(true);
      setMessage("Vote submitted.");
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to vote.");
    }
  }

  if (loading) return <div style={{ padding: 24 }}>Loading vote screen…</div>;
  if (!matchup || !pairA || !pairB) return <div style={{ padding: 24 }}>{message}</div>;

  return (
    <div style={{ padding: 24 }}>
      <h2>Vote for the better graph</h2>
      {message && <p>{message}</p>}
      <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>
        <FigureCard
          title="Pair A"
          imageUrl={figureUrl}
          xText={pairA.xText || ""}
          yText={pairA.yText || ""}
          votes={votesA}
          onVote={() => voteFor(matchup.pairAId)}
          disabled={hasVoted}
        />
        <FigureCard
          title="Pair B"
          imageUrl={figureUrl}
          xText={pairB.xText || ""}
          yText={pairB.yText || ""}
          votes={votesB}
          onVote={() => voteFor(matchup.pairBId)}
          disabled={hasVoted}
        />
      </div>
    </div>
  );
}
