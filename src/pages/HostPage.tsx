import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

export default function HostPage() {
  const gameId = localStorage.getItem("gameId") || "demo-game";

  async function startRound() {
    await httpsCallable(functions, "startRound")({ gameId });
  }

  async function openVoting(roundId: string, matchupId: string) {
    await httpsCallable(functions, "openMatchupVoting")({
      gameId,
      roundId,
      matchupId,
    });
  }

  async function closeVoting(roundId: string, matchupId: string) {
    await httpsCallable(functions, "closeMatchupVoting")({
      gameId,
      roundId,
      matchupId,
    });
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Host Dashboard</h1>
      <button onClick={startRound}>Start Round</button>
    </div>
  );
}import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import JoinPage from "./pages/JoinPage";
import WaitingPage from "./pages/WaitingPage";
import AssignmentPage from "./pages/AssignmentPage";
import HostPage from "./pages/HostPage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename="/axis-wars/">
      <Routes>
        <Route path="/" element={<JoinPage />} />
        <Route path="/waiting" element={<WaitingPage />} />
        <Route path="/assignment" element={<AssignmentPage />} />
        <Route path="/host" element={<HostPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);