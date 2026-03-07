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
    <div style={{ padding: 24 }}>
      <h1>Axis Wars</h1>
      <input
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        placeholder="Game code"
        value={gameId}
        onChange={(e) => setGameId(e.target.value)}
      />
      <button onClick={join} disabled={!name.trim() || !gameId.trim()}>
        Join
      </button>
    </div>
  );
}