import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { auth, db, ensureAnonAuth } from "../lib/firebase";
import { useNavigate } from "react-router-dom";

export default function JoinPage() {
  const [name, setName] = useState("");
  const [gameId, setGameId] = useState("demo-game");
  const navigate = useNavigate();

  async function join() {
    await ensureAnonAuth();
    const uid = auth.currentUser!.uid;

    await setDoc(doc(db, "games", gameId, "players", uid), {
      name: name.trim(),
      score: 0,
      joinedAt: Date.now(),
      connected: true,
    }, { merge: true });

    localStorage.setItem("gameId", gameId);
    navigate("/waiting");
  }

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
          gap: 18,
        }}
      >
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="Axis Wars"
          style={{
            width: "100%",
            maxWidth: 180,
            height: "auto",
            display: "block",
          }}
        />
        <input
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            width: "85%",
            maxWidth: 320,
            height: 50,
            padding: "0 16px",
            border: "1px solid #d7d7d7",
            borderRadius: 14,
            fontSize: 16,
            color: "#111",
            background: "#fff",
          }}
        />
        <input
          placeholder="Room code"
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
          style={{
            width: "85%",
            maxWidth: 320,
            height: 50,
            padding: "0 16px",
            border: "1px solid #d7d7d7",
            borderRadius: 14,
            fontSize: 16,
            color: "#111",
            background: "#fff",
          }}
        />
        <button
          onClick={join}
          disabled={!name.trim() || !gameId.trim()}
          style={{
            width: "85%",
            maxWidth: 320,
            height: 52,
            border: "none",
            borderRadius: 14,
            background: !name.trim() || !gameId.trim() ? "#d9d9d9" : "#111",
            color: "#fff",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          Join
        </button>
      </div>
    </div>
  );
}
