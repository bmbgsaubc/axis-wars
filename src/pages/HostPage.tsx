import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { auth, functions, ensureAnonAuth } from "../lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function HostPage() {
  const gameId = localStorage.getItem("gameId") || "demo-game";
  const [message, setMessage] = useState("Signing in...");

  useEffect(() => {
    async function init() {
      try {
        await ensureAnonAuth();
        setMessage(`Signed in as host candidate: ${auth.currentUser?.uid ?? "unknown"}`);
      } catch (error: any) {
        console.error(error);
        setMessage(error?.message || "Failed to sign in.");
      }
    }
    init();
  }, []);

  async function claimHost() {
    try {
      await ensureAnonAuth();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("No authenticated user.");

      await setDoc(
        doc(db, "games", gameId),
        { hostUid: uid },
        { merge: true }
      );

      setMessage("Host claimed successfully.");
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to claim host.");
    }
  }

  async function startRound() {
    try {
      await ensureAnonAuth();

      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("No authenticated user.");

      const gameSnap = await getDoc(doc(db, "games", gameId));
      const hostUid = gameSnap.data()?.hostUid;

      if (!hostUid) {
        throw new Error("No hostUid set on demo-game. Click 'Claim Host' first.");
      }

      if (hostUid !== uid) {
        throw new Error("You are signed in, but you are not the host for this game.");
      }

      setMessage("Starting round...");
      const fn = httpsCallable(functions, "startRound");
      await fn({ gameId });
      setMessage("Round started successfully.");
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to start round.");
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Host Dashboard</h1>
      <button onClick={claimHost}>Claim Host</button>
      <button onClick={startRound} style={{ marginLeft: 12 }}>
        Start Round
      </button>
      {message && <p>{message}</p>}
    </div>
  );
}