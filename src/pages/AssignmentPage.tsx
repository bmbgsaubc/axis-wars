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

  if (!pair || !figure) return <div style={{ padding: 24 }}>Loading…</div>;

  const uid = auth.currentUser!.uid;
  const role = pair.memberAUid === uid ? pair.memberARole : pair.memberBRole;

  return (
    <div style={{ padding: 24 }}>
      <h2>Your assignment</h2>
      <p>
        You are assigning the <strong>{role.toUpperCase()}</strong> axis.
      </p>
      <img
        src={figure.imageUrl}
        alt="Assigned figure"
        style={{ maxWidth: 500 }}
      />
      <div>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Enter ${role.toUpperCase()}-axis title`}
        />
      </div>
      <button onClick={submit} disabled={!text.trim()}>
        Submit
      </button>
    </div>
  );
}
