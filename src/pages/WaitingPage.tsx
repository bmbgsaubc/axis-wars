import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function WaitingPage() {
  const [status, setStatus] = useState("lobby");
  const navigate = useNavigate();
  const gameId = localStorage.getItem("gameId")!;

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "games", gameId), (snap) => {
      const data = snap.data();
      if (!data) return;
      setStatus(data.status);

      if (data.status === "submitting") navigate("/assignment");
      if (data.status === "voting") navigate("/vote");
      if (data.status === "leaderboard") navigate("/leaderboard");
    });

    return () => unsub();
  }, [gameId, navigate]);

  return (
    <div style={{ padding: 24 }}>
      <h2>Waiting for host to start…</h2>
      <p>Current status: {status}</p>
    </div>
  );
}