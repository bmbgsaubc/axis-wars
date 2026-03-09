import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

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
  imageUrl,
  xText,
  yText,
  title,
}: {
  imageUrl: string;
  xText: string;
  yText: string;
  title: string;
}) {
  return (
    <div style={{ width: 500 }}>
      <h3>{title}</h3>
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
    </div>
  );
}

export default function VotePage() {
  const gameId = localStorage.getItem("gameId") || "demo-game";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [figureUrl, setFigureUrl] = useState("");
  const [pairA, setPairA] = useState<PairDoc | null>(null);
  const [pairB, setPairB] = useState<PairDoc | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const gameSnap = await getDoc(doc(db, "games", gameId));
        const game = gameSnap.data();

        if (!game) throw new Error("Game not found.");
        if (!game.currentRoundId) throw new Error("No current round found.");
        if (!game.currentMatchupId) throw new Error("No current matchup found.");

        const roundId = game.currentRoundId;
        const matchupId = game.currentMatchupId;

        const matchupSnap = await getDoc(
          doc(db, "games", gameId, "rounds", roundId, "matchups", matchupId)
        );
        const matchup = matchupSnap.data() as MatchupDoc | undefined;

        if (!matchup) throw new Error("Matchup not found.");

        const pairASnap = await getDoc(
          doc(db, "games", gameId, "rounds", roundId, "pairs", matchup.pairAId)
        );
        const pairBSnap = await getDoc(
          doc(db, "games", gameId, "rounds", roundId, "pairs", matchup.pairBId)
        );

        const pairAData = pairASnap.data() as PairDoc | undefined;
        const pairBData = pairBSnap.data() as PairDoc | undefined;

        if (!pairAData || !pairBData) {
          throw new Error("One or both pair docs are missing.");
        }

        const figSnap = await getDoc(doc(db, "figures", matchup.figureId));
        const fig = figSnap.data() as FigureDoc | undefined;

        if (!fig) throw new Error("Figure doc not found.");

        setFigureUrl(fig.imageUrl);
        setPairA(pairAData);
        setPairB(pairBData);
      } catch (err: any) {
        console.error(err);
        setError(err?.message || "Failed to load voting page.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [gameId]);

  if (loading) return <div style={{ padding: 24 }}>Loading vote screen…</div>;
  if (error) return <div style={{ padding: 24 }}>Error: {error}</div>;
  if (!pairA || !pairB) return <div style={{ padding: 24 }}>No matchup data.</div>;

  return (
    <div style={{ padding: 24 }}>
      <h2>Vote for the better graph</h2>
      <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>
        <FigureCard
          title="Pair A"
          imageUrl={figureUrl}
          xText={pairA.xText || ""}
          yText={pairA.yText || ""}
        />
        <FigureCard
          title="Pair B"
          imageUrl={figureUrl}
          xText={pairB.xText || ""}
          yText={pairB.yText || ""}
        />
      </div>
    </div>
  );
}