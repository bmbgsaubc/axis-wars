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
      if (data.status === "leaderboard" || data.status === "finished") {
        navigate("/leaderboard");
      }
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
        <h2 style={{ margin: 0, fontSize: 28, color: "#111" }}>Waiting for host to start</h2>
        <p style={{ margin: 0, fontSize: 15, color: "#666", lineHeight: 1.5 }}>
          You are in the room. The next screen will open automatically when the host begins.
        </p>
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
