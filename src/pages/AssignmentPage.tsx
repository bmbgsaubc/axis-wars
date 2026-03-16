import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, ensureAnonAuth, functions } from "../lib/firebase";
import { useNavigate } from "react-router-dom";

type SubmissionAssignment = {
  id: string;
  roundId: string;
  figureId: string;
  playerUid: string;
  matchupId: string;
  sequenceNumber: number;
  xText: string | null;
  yText: string | null;
  complete: boolean;
};

type FigureDoc = {
  imageUrl: string;
  active: boolean;
  difficulty?: "easy" | "medium" | "cursed";
};

export default function AssignmentPage() {
  const [submission, setSubmission] = useState<SubmissionAssignment | null>(null);
  const [figure, setFigure] = useState<FigureDoc | null>(null);
  const [xText, setXText] = useState("");
  const [yText, setYText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const gameId = localStorage.getItem("gameId")!;

  async function loadCurrentSubmission() {
    try {
      setLoading(true);
      setError("");
      await ensureAnonAuth();

      const gameSnap = await getDoc(doc(db, "games", gameId));
      const roundId = gameSnap.data()?.currentRoundId as string | undefined;
      if (!roundId) {
        setSubmission(null);
        setFigure(null);
        setLoading(false);
        return;
      }

      const submissionsSnap = await getDocs(
        query(
          collection(db, "games", gameId, "rounds", roundId, "submissions"),
          orderBy("sequenceNumber")
        )
      );

      const mySubmissions = submissionsSnap.docs
        .map((submissionDoc) => ({
          id: submissionDoc.id,
          roundId,
          ...(submissionDoc.data() as Omit<SubmissionAssignment, "id" | "roundId">),
        }))
        .filter((submissionDoc) => submissionDoc.playerUid === auth.currentUser?.uid)
        .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

      const nextSubmission = mySubmissions.find((submissionDoc) => submissionDoc.complete !== true);

      if (!nextSubmission) {
        setSubmission(null);
        setFigure(null);
        setLoading(false);
        navigate("/submitted");
        return;
      }

      setSubmission(nextSubmission);
      setXText(nextSubmission.xText ?? "");
      setYText(nextSubmission.yText ?? "");

      const figSnap = await getDoc(doc(db, "figures", nextSubmission.figureId));
      if (figSnap.exists()) {
        setFigure(figSnap.data() as FigureDoc);
      } else {
        setFigure(null);
      }
    } catch (nextError: any) {
      console.error(nextError);
      setError(nextError?.message || "Failed to load your assigned figure.");
      setSubmission(null);
      setFigure(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCurrentSubmission();
  }, [gameId]);

  async function submit() {
    if (!submission) return;

    try {
      setSubmitting(true);
      setError("");
      const fn = httpsCallable(functions, "submitAxis");
      await fn({
        gameId,
        roundId: submission.roundId,
        submissionId: submission.id,
        xText,
        yText,
      });

      await loadCurrentSubmission();
    } catch (nextError: any) {
      console.error(nextError);
      setError(nextError?.message || "Failed to submit your answers.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
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
        <div style={{ width: "100%", maxWidth: 420, textAlign: "center", color: "#444" }}>
          Loading...
        </div>
      </div>
    );
  }

  if (!submission || !figure) {
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
        <div style={{ width: "100%", maxWidth: 420, textAlign: "center", color: "#444" }}>
          {error || "Loading your figure..."}
        </div>
      </div>
    );
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
          maxWidth: 480,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          textAlign: "center",
        }}
      >
        <img
          src={figure.imageUrl}
          alt="Assigned figure"
          style={{
            width: "100%",
            maxWidth: 420,
            height: "auto",
            display: "block",
            borderRadius: 22,
            objectFit: "cover",
          }}
        />
        <div style={{ maxWidth: 360 }}>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#777",
            }}
          >
            Figure {submission.sequenceNumber} of 2
          </p>
          <h2 style={{ margin: "10px 0 0", fontSize: 28, color: "#111" }}>
            Name both axes for this figure
          </h2>
        </div>
        <input
          value={xText}
          onChange={(event) => setXText(event.target.value)}
          placeholder="Enter X-axis title"
          style={{
            width: "85%",
            maxWidth: 340,
            height: 52,
            padding: "0 18px",
            border: "1px solid #d7d7d7",
            borderRadius: 16,
            fontSize: 16,
            color: "#111",
            background: "#fff",
            textAlign: "center",
          }}
        />
        <input
          value={yText}
          onChange={(event) => setYText(event.target.value)}
          placeholder="Enter Y-axis title"
          style={{
            width: "85%",
            maxWidth: 340,
            height: 52,
            padding: "0 18px",
            border: "1px solid #d7d7d7",
            borderRadius: 16,
            fontSize: 16,
            color: "#111",
            background: "#fff",
            textAlign: "center",
          }}
        />
        <button
          onClick={submit}
          disabled={!xText.trim() || !yText.trim() || submitting}
          style={{
            width: "85%",
            maxWidth: 340,
            height: 52,
            border: "none",
            borderRadius: 16,
            background: !xText.trim() || !yText.trim() || submitting ? "#d9d9d9" : "#111",
            color: "#fff",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {submission.sequenceNumber === 1 ? "Submit and continue" : "Submit"}
        </button>
        {error ? <p style={{ margin: 0, color: "#666" }}>{error}</p> : null}
      </div>
    </div>
  );
}
