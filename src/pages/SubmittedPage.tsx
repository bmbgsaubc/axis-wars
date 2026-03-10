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

      if (data.status === "leaderboard" || data.status === "finished") {
        navigate("/leaderboard");
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
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 14,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 28, color: "#111" }}>Submission received</h2>
        <p style={{ margin: 0, fontSize: 15, color: "#666", lineHeight: 1.5 }}>{message}</p>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#999",
          }}
        >
          Status: {status}
        </p>
      </div>
    </div>
  );
}
