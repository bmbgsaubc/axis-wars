import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../lib/firebase";
import { useNavigate } from "react-router-dom";

export default function AssignmentPage() {
  const [pair, setPair] = useState<any>(null);
  const [figure, setFigure] = useState<any>(null);
  const [text, setText] = useState("");
  const navigate = useNavigate();

  const gameId = localStorage.getItem("gameId")!;

  useEffect(() => {
    async function load() {
      const gameSnap = await getDoc(doc(db, "games", gameId));
      const roundId = gameSnap.data()?.currentRoundId;
      if (!roundId) return;

      const pairsSnap = await getDocs(
        query(collection(db, "games", gameId, "rounds", roundId, "pairs"))
      );

      const myPair = pairsSnap.docs.find((d) => {
        const p = d.data();
        return p.memberAUid === auth.currentUser?.uid || p.memberBUid === auth.currentUser?.uid;
      });

      if (!myPair) return;

      const pairData = { id: myPair.id, ...myPair.data(), roundId };
      setPair(pairData);

      const figSnap = await getDoc(doc(db, "figures", pairData.figureId));
      setFigure(figSnap.data());
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
  const role =
    pair.memberAUid === uid ? pair.memberARole : pair.memberBRole;

  return (
    <div style={{ padding: 24 }}>
      <h2>Your assignment</h2>
      <p>You are assigning the <strong>{role.toUpperCase()}</strong> axis.</p>
      <img src={figure.imageUrl} alt="Assigned figure" style={{ maxWidth: 500 }} />
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