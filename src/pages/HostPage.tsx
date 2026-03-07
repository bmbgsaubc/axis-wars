import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

export default function HostPage() {
  const gameId = localStorage.getItem("gameId") || "demo-game";

  async function startRound() {
    await httpsCallable(functions, "startRound")({ gameId });
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Host Dashboard</h1>
      <button onClick={startRound}>Start Round</button>
    </div>
  );
}