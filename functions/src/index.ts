/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */


// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildDerangement(size: number): number[] {
  if (size < 2) {
    throw new Error("Need at least 2 items for a derangement");
  }

  const base = Array.from({length: size}, (_, index) => index);
  let attempt = shuffle(base);

  while (attempt.some((value, index) => value === index)) {
    attempt = shuffle(base);
  }

  return attempt;
}

export const startRound = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Must be signed in");

  const { gameId } = req.data as { gameId: string };
  if (!gameId) throw new HttpsError("invalid-argument", "Missing gameId");

  const gameRef = db.collection("games").doc(gameId);
  const gameSnap = await gameRef.get();
  if (!gameSnap.exists) throw new HttpsError("not-found", "Game not found");

  const game = gameSnap.data()!;
  if (game.hostUid !== uid) {
    throw new HttpsError("permission-denied", "Only host can start round");
  }

  if (game.status === "finished") {
    throw new HttpsError("failed-precondition", "Game has already ended.");
  }

  const currentRoundId = game.currentRoundId;
  if (currentRoundId) {
    const currentRoundSnap = await gameRef.collection("rounds").doc(currentRoundId).get();
    if (currentRoundSnap.exists) {
      const currentRound = currentRoundSnap.data();
      if (currentRound?.status !== "complete") {
        throw new HttpsError(
          "failed-precondition",
          `Current round (${currentRoundId}) is not complete yet.`
        );
      }
    }
  }

  const playersSnap = await gameRef.collection("players").get();
  const players = playersSnap.docs.map((d) => ({ uid: d.id, ...d.data() })) as Array<{uid: string; name: string}>;

  if (players.length < 2) {
    throw new HttpsError("failed-precondition", "Need at least 2 players");
  }

  const shuffledPlayers = shuffle(players);
  const matchupCount = shuffledPlayers.length;

  const figuresSnap = await db.collection("figures").where("active", "==", true).get();
  const previousRoundsSnap = await gameRef.collection("rounds").get();
  const usedFigureIds = new Set<string>();

  for (const roundDoc of previousRoundsSnap.docs) {
    const priorMatchupsSnap = await roundDoc.ref.collection("matchups").get();
    for (const matchupDoc of priorMatchupsSnap.docs) {
      const figureId = matchupDoc.data().figureId;
      if (figureId) usedFigureIds.add(figureId);
    }
  }

  const figureIds = shuffle(
    figuresSnap.docs
      .map((d) => d.id)
      .filter((figureId) => !usedFigureIds.has(figureId))
  );

  if (figureIds.length < matchupCount) {
    throw new HttpsError(
      "failed-precondition",
      "Not enough unused figures available for another round."
    );
  }

  const selectedFigureIds = figureIds.slice(0, matchupCount);
  const secondPassAssignments = buildDerangement(shuffledPlayers.length);

  const submissions: Array<{
    submissionId: string;
    playerUid: string;
    figureId: string;
    sequenceNumber: 1 | 2;
  }> = [];

  shuffledPlayers.forEach((player, index) => {
    submissions.push({
      submissionId: `submission_${submissions.length + 1}`,
      playerUid: player.uid,
      figureId: selectedFigureIds[index],
      sequenceNumber: 1,
    });
  });

  shuffledPlayers.forEach((player, index) => {
    submissions.push({
      submissionId: `submission_${submissions.length + 1}`,
      playerUid: player.uid,
      figureId: selectedFigureIds[secondPassAssignments[index]],
      sequenceNumber: 2,
    });
  });

  const submissionsByFigure = new Map<string, Array<(typeof submissions)[number]>>();

  for (const submission of submissions) {
    const existing = submissionsByFigure.get(submission.figureId) ?? [];
    existing.push(submission);
    submissionsByFigure.set(submission.figureId, existing);
  }

  const matchups = selectedFigureIds.map((figureId, index) => {
    const matchupSubmissions = shuffle(submissionsByFigure.get(figureId) ?? []);

    if (matchupSubmissions.length !== 2) {
      throw new HttpsError(
        "internal",
        `Figure ${figureId} has ${matchupSubmissions.length} submissions instead of 2.`
      );
    }

    return {
      matchupId: `matchup_${index + 1}`,
      figureId,
      entryAId: matchupSubmissions[0].submissionId,
      entryBId: matchupSubmissions[1].submissionId,
    };
  });

  const matchupIdBySubmission = new Map<string, string>();

  for (const matchup of matchups) {
    matchupIdBySubmission.set(matchup.entryAId, matchup.matchupId);
    matchupIdBySubmission.set(matchup.entryBId, matchup.matchupId);
  }

  const roundNumber = (game.roundNumber || 0) + 1;
  const roundId = `round_${roundNumber}`;
  const roundRef = gameRef.collection("rounds").doc(roundId);

  const batch = db.batch();

  batch.set(roundRef, {
    roundNumber,
    status: "submitting",
  });

  for (const submission of submissions) {
    const matchupId = matchupIdBySubmission.get(submission.submissionId);
    if (!matchupId) {
      throw new HttpsError(
        "internal",
        `No matchup found for submission ${submission.submissionId}.`
      );
    }

    batch.set(roundRef.collection("submissions").doc(submission.submissionId), {
      playerUid: submission.playerUid,
      figureId: submission.figureId,
      matchupId,
      sequenceNumber: submission.sequenceNumber,
      xText: null,
      yText: null,
      complete: false,
    });
  }

  for (const matchup of matchups) {
    batch.set(roundRef.collection("matchups").doc(matchup.matchupId), {
      ...matchup,
      state: "pending",
      winnerEntryId: null,
      votesA: 0,
      votesB: 0,
    });
  }

  batch.update(gameRef, {
    status: "submitting",
    roundNumber,
    currentRoundId: roundId,
    currentMatchupId: null,
  });

  await batch.commit();

  return { ok: true, roundId };
});

export const endGame = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Must be signed in");

  const { gameId } = req.data as { gameId: string };
  if (!gameId) throw new HttpsError("invalid-argument", "Missing gameId");

  const gameRef = db.collection("games").doc(gameId);
  const gameSnap = await gameRef.get();
  if (!gameSnap.exists) throw new HttpsError("not-found", "Game not found");

  const game = gameSnap.data()!;
  if (game.hostUid !== uid) {
    throw new HttpsError("permission-denied", "Only host can end the game");
  }

  await gameRef.update({
    status: "finished",
    currentMatchupId: null,
  });

  return { ok: true };
});

export const submitAxis = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Must be signed in");

  const { gameId, roundId, submissionId, xText, yText } = req.data as {
    gameId: string;
    roundId: string;
    submissionId: string;
    xText: string;
    yText: string;
  };

  if (!gameId || !roundId || !submissionId) {
    throw new HttpsError("invalid-argument", "Missing submission data");
  }

  if (!xText?.trim() || !yText?.trim()) {
    throw new HttpsError("invalid-argument", "Both axes are required");
  }

  const submissionRef = db
    .collection("games").doc(gameId)
    .collection("rounds").doc(roundId)
    .collection("submissions")
    .doc(submissionId);

  const submissionSnap = await submissionRef.get();
  if (!submissionSnap.exists) {
    throw new HttpsError("not-found", "Submission not found");
  }

  const submission = submissionSnap.data()!;
  if (submission.playerUid !== uid) {
    throw new HttpsError("permission-denied", "You do not own this submission");
  }

  await submissionRef.update({
    xText: xText.trim(),
    yText: yText.trim(),
    complete: true,
  });

  const roundRef = db.collection("games").doc(gameId).collection("rounds").doc(roundId);

  const allSubmissionsSnap = await roundRef.collection("submissions").get();
  const allComplete = allSubmissionsSnap.docs.every((d) => d.data().complete === true);

  if (allComplete) {
    const matchupsSnap = await roundRef.collection("matchups").get();
    const firstMatchup = matchupsSnap.docs[0];

    if (firstMatchup) {
      await roundRef.update({
        status: "voting",
      });

      await db.collection("games").doc(gameId).update({
        status: "voting",
        currentMatchupId: firstMatchup.id,
      });

      await firstMatchup.ref.update({
        state: "live",
      });
    }
  }

  return { ok: true };
});

export const openMatchupVoting = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Must be signed in");

  const { gameId, roundId, matchupId } = req.data as {
    gameId: string;
    roundId: string;
    matchupId: string;
  };

  const gameRef = db.collection("games").doc(gameId);
  const gameSnap = await gameRef.get();
  if (gameSnap.data()?.hostUid !== uid) {
    throw new HttpsError("permission-denied", "Only host can do this");
  }

  const matchupRef = gameRef.collection("rounds").doc(roundId).collection("matchups").doc(matchupId);
  await matchupRef.update({ state: "live" });
  await gameRef.update({
    status: "voting",
    currentMatchupId: matchupId,
  });

  return { ok: true };
});

export const castVote = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Must be signed in");

  const { gameId, roundId, matchupId, votedForEntryId } = req.data as {
    gameId: string;
    roundId: string;
    matchupId: string;
    votedForEntryId: string;
  };

  if (!gameId || !roundId || !matchupId || !votedForEntryId) {
    throw new HttpsError("invalid-argument", "Missing required vote data");
  }

  const roundRef = db.collection("games").doc(gameId).collection("rounds").doc(roundId);
  const matchupRef = roundRef.collection("matchups").doc(matchupId);
  const voteRef = roundRef.collection("votes").doc(`${matchupId}_${uid}`);

  const matchupSnap = await matchupRef.get();
  if (!matchupSnap.exists) {
    throw new HttpsError("not-found", "Matchup not found");
  }

  const matchup = matchupSnap.data()!;
  if (matchup.state !== "live") {
    throw new HttpsError("failed-precondition", "Voting is not open for this matchup");
  }

  if (votedForEntryId !== matchup.entryAId && votedForEntryId !== matchup.entryBId) {
    throw new HttpsError("invalid-argument", "Invalid submission selected");
  }

  const existingVote = await voteRef.get();
  if (existingVote.exists) {
    throw new HttpsError("already-exists", "You already voted for this matchup");
  }

  await voteRef.set({
    matchupId,
    voterUid: uid,
    votedForEntryId,
    createdAt: Date.now(),
  });

  return { ok: true };
});

export const closeMatchupVoting = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Must be signed in");

  const { gameId, roundId, matchupId } = req.data as {
    gameId: string;
    roundId: string;
    matchupId: string;
  };

  const gameRef = db.collection("games").doc(gameId);
  const gameSnap = await gameRef.get();

  if (!gameSnap.exists) {
    throw new HttpsError("not-found", "Game not found");
  }

  const game = gameSnap.data()!;
  if (game.hostUid !== uid) {
    throw new HttpsError("permission-denied", "Only host can close voting");
  }

  const roundRef = gameRef.collection("rounds").doc(roundId);
  const matchupRef = roundRef.collection("matchups").doc(matchupId);
  const matchupSnap = await matchupRef.get();

  if (!matchupSnap.exists) {
    throw new HttpsError("not-found", "Matchup not found");
  }

  const matchup = matchupSnap.data()!;

  const votesSnap = await roundRef
    .collection("votes")
    .where("matchupId", "==", matchupId)
    .get();

  let votesA = 0;
  let votesB = 0;

  for (const doc of votesSnap.docs) {
    const vote = doc.data();
    if (vote.votedForEntryId === matchup.entryAId) votesA++;
    if (vote.votedForEntryId === matchup.entryBId) votesB++;
  }

  const winnerEntryId = votesA >= votesB ? matchup.entryAId : matchup.entryBId;

  const entryASnap = await roundRef.collection("submissions").doc(matchup.entryAId).get();
  const entryBSnap = await roundRef.collection("submissions").doc(matchup.entryBId).get();

  const entryA = entryASnap.data()!;
  const entryB = entryBSnap.data()!;

  const batch = db.batch();

  batch.update(matchupRef, {
    state: "closed",
    votesA,
    votesB,
    winnerEntryId,
  });

  const addScore = (playerUid: string, delta: number) => {
    const playerRef = gameRef.collection("players").doc(playerUid);
    batch.update(playerRef, {
      score: admin.firestore.FieldValue.increment(delta),
    });
  };

  addScore(entryA.playerUid, votesA);
  addScore(entryB.playerUid, votesB);

  await batch.commit();

  const allMatchupsSnap = await roundRef.collection("matchups").get();
  const allClosed = allMatchupsSnap.docs.every(
    (d) => d.data().state === "closed"
  );

  if (allClosed) {
    await roundRef.update({
      status: "complete",
    });

    await gameRef.update({
      status: "leaderboard",
      currentMatchupId: null,
    });
  }

  return {
    ok: true,
    votesA,
    votesB,
    winnerEntryId,
  };
});
