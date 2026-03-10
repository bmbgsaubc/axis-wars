import { doc, getDocs, onSnapshot, query, collection } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../lib/firebase";

export default function SubmittedPage() {
  const [status, setStatus] = useState("submitting");
  const [message, setMessage] = useState("Waiting for the other players to finish submitting.");
  const navigate = useNavigate();
  const gameId = localStorage.getItem("gameId")!;

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "games", gameId), async (snap) => {
      const data = snap.data();
      if (!data) return;

      setStatus(data.status);

      if (data.status === "voting") {
        navigate("/vote");
        return;
      }

      if (data.status === "leaderboard") {
        setMessage("Round complete. Waiting for the next screen.");
        return;
      }

      if (data.status !== "submitting" || !data.currentRoundId) {
        return;
      }

      const pairsSnap = await getDocs(
        query(collection(db, "games", gameId, "rounds", data.currentRoundId, "pairs"))
      );

      const myPair = pairsSnap.docs.find((pairDoc) => {
        const pair = pairDoc.data();
        return (
          pair.memberAUid === auth.currentUser?.uid ||
          pair.memberBUid === auth.currentUser?.uid
        );
      });

      if (!myPair) {
        navigate("/assignment");
        return;
      }

      const pair = myPair.data();
      const mySubmittedText =
        pair.memberAUid === auth.currentUser?.uid
          ? pair.memberARole === "x"
            ? pair.xText
            : pair.yText
          : pair.memberBRole === "x"
            ? pair.xText
            : pair.yText;

      if (!mySubmittedText) {
        navigate("/assignment");
        return;
      }

      const completedCount = pairsSnap.docs.filter((pairDoc) => pairDoc.data().complete === true).length;
      setMessage(
        completedCount === pairsSnap.size
          ? "All submissions are in. Opening voting now."
          : `Waiting for submissions: ${completedCount}/${pairsSnap.size} pairs ready.`
      );
    });

    return () => unsub();
  }, [gameId, navigate]);

  return (
    <div style={{ padding: 24 }}>
      <h2>Submission received</h2>
      <p>{message}</p>
      <p>Current status: {status}</p>
    </div>
  );
}
