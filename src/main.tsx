import React from "react";
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