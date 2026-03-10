import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import JoinPage from "./pages/JoinPage";
import WaitingPage from "./pages/WaitingPage";
import AssignmentPage from "./pages/AssignmentPage";
import HostPage from "./pages/HostPage";
import VotePage from "./pages/VotePage";
import SubmittedPage from "./pages/SubmittedPage";
import LeaderboardPage from "./pages/LeaderboardPage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<JoinPage />} />
        <Route path="/waiting" element={<WaitingPage />} />
        <Route path="/assignment" element={<AssignmentPage />} />
        <Route path="/submitted" element={<SubmittedPage />} />
        <Route path="/host" element={<HostPage />} />
        <Route path="/vote" element={<VotePage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
