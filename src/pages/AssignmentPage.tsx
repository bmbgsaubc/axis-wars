import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../lib/firebase";
import { useNavigate } from "react-router-dom";

type PairAssignment = {
  id: string;
  roundId: string;
  figureId: string;
  memberAUid: string;
  memberBUid: string;
  memberARole: "x" | "y";
  memberBRole: "x" | "y";
  matchupId: string;
  xText: string | null;
  yText: string | null;
  complete: boolean;
};

type FigureDoc = {
  imageUrl: string;
  active: boolean;
  difficulty?: "easy" | "medium" | "cursed";
};

export default function AssignmentPage() {
  const [pair, setPair] = useState<PairAssignment | null>(null);
  const [figure, setFigure] = useState<FigureDoc | null>(null);
  const [text, setText] = useState("");
  const navigate = useNavigate();

  const gameId = localStorage.getItem("gameId")!;

  useEffect(() => {
    async function load() {
      const gameSnap = await getDoc(doc(db, "games", gameId));
      const roundId = gameSnap.data()?.currentRoundId as string | undefined;
      if (!roundId) return;

      const pairsSnap = await getDocs(
        query(collection(db, "games", gameId, "rounds", roundId, "pairs"))
      );

      const myPairDoc = pairsSnap.docs.find((d) => {
        const p = d.data();
        return (
          p.memberAUid === auth.currentUser?.uid ||
          p.memberBUid === auth.currentUser?.uid
        );
      });

      if (!myPairDoc) return;

      const data = myPairDoc.data();

      const pairData: PairAssignment = {
        id: myPairDoc.id,
        roundId,
        figureId: data.figureId,
        memberAUid: data.memberAUid,
        memberBUid: data.memberBUid,
        memberARole: data.memberARole,
        memberBRole: data.memberBRole,
        matchupId: data.matchupId,
        xText: data.xText ?? null,
        yText: data.yText ?? null,
        complete: data.complete ?? false,
      };

      const uid = auth.currentUser?.uid;
      const myRoleText =
        pairData.memberAUid === uid
          ? pairData.memberARole === "x"
            ? pairData.xText
            : pairData.yText
          : pairData.memberBRole === "x"
            ? pairData.xText
            : pairData.yText;

      if (myRoleText) {
        navigate("/submitted");
        return;
      }

      setPair(pairData);

      const figSnap = await getDoc(doc(db, "figures", pairData.figureId));
      if (figSnap.exists()) {
        setFigure(figSnap.data() as FigureDoc);
      }
    }

    load();
  }, [gameId]);

  async function submit() {
    if (!pair) return;
    const fn = httpsCallable(functions, "submitAxis");
    await fn({
      gameId,
      roundId: pair.roundId,
      text,
    });
    navigate("/submitted");
  }

  if (!pair || !figure) {
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
        <div style={{ width: "100%", maxWidth: 420, textAlign: "center", color: "#444" }}>
          Loading...
        </div>
      </div>
    );
  }

  const uid = auth.currentUser!.uid;
  const role = pair.memberAUid === uid ? pair.memberARole : pair.memberBRole;

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
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          textAlign: "center",
        }}
      >
        <img
          src={figure.imageUrl}
          alt="Assigned figure"
          style={{
            width: "100%",
            maxWidth: 420,
            height: "auto",
            display: "block",
            borderRadius: 22,
            objectFit: "cover",
          }}
        />
        <div style={{ maxWidth: 340 }}>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#777",
            }}
          >
            Your prompt
          </p>
          <h2 style={{ margin: "10px 0 0", fontSize: 28, color: "#111" }}>
            Assign the {role.toUpperCase()} axis
          </h2>
        </div>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Enter ${role.toUpperCase()}-axis title`}
          style={{
            width: "85%",
            maxWidth: 320,
            height: 52,
            padding: "0 18px",
            border: "1px solid #d7d7d7",
            borderRadius: 16,
            fontSize: 16,
            color: "#111",
            background: "#fff",
            textAlign: "center",
          }}
        />
        <button
          onClick={submit}
          disabled={!text.trim()}
          style={{
            width: "85%",
            maxWidth: 320,
            height: 52,
            border: "none",
            borderRadius: 16,
            background: !text.trim() ? "#d9d9d9" : "#111",
            color: "#fff",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          Submit
        </button>
      </div>
    </div>
  );
}
