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

  if (players.length < 4) {
    throw new HttpsError("failed-precondition", "Need at least 4 players");
  }

  const shuffledPlayers = shuffle(players);

  // Pair players
  const pairs: Array<{
    pairId: string;
    memberAUid: string;
    memberBUid: string;
    memberARole: "x" | "y";
    memberBRole: "x" | "y";
  }> = [];

  for (let i = 0; i < shuffledPlayers.length - 1; i += 2) {
    const a = shuffledPlayers[i];
    const b = shuffledPlayers[i + 1];
    const roles = Math.random() < 0.5 ? ["x", "y"] : ["y", "x"];
    pairs.push({
      pairId: `pair_${i / 2 + 1}`,
      memberAUid: a.uid,
      memberBUid: b.uid,
      memberARole: roles[0] as "x" | "y",
      memberBRole: roles[1] as "x" | "y",
    });
  }

  // Pair pairs into matchups
  const shuffledPairs = shuffle(pairs);
  const matchupCount = Math.floor(shuffledPairs.length / 2);
  const matchups: Array<{
    matchupId: string;
    pairAId: string;
    pairBId: string;
    figureId: string;
  }> = [];

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

  let figureIndex = 0;
  for (let i = 0; i < shuffledPairs.length - 1; i += 2) {
    matchups.push({
      matchupId: `matchup_${i / 2 + 1}`,
      pairAId: shuffledPairs[i].pairId,
      pairBId: shuffledPairs[i + 1].pairId,
      figureId: figureIds[figureIndex++],
    });
  }

  const roundNumber = (game.roundNumber || 0) + 1;
  const roundId = `round_${roundNumber}`;
  const roundRef = gameRef.collection("rounds").doc(roundId);

  const batch = db.batch();

  batch.set(roundRef, {
    roundNumber,
    status: "submitting",
  });

  // Attach figure/matchup to pairs
  for (const pair of shuffledPairs) {
    const matchup = matchups.find(
      (m) => m.pairAId === pair.pairId || m.pairBId === pair.pairId
    );
    if (!matchup) continue;

    batch.set(roundRef.collection("pairs").doc(pair.pairId), {
      ...pair,
      figureId: matchup.figureId,
      matchupId: matchup.matchupId,
      xText: null,
      yText: null,
      complete: false,
    });
  }

  for (const matchup of matchups) {
    batch.set(roundRef.collection("matchups").doc(matchup.matchupId), {
      ...matchup,
      state: "pending",
      winnerPairId: null,
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

  const { gameId, roundId, text } = req.data as {
    gameId: string;
    roundId: string;
    text: string;
  };

  if (!text?.trim()) {
    throw new HttpsError("invalid-argument", "Text required");
  }

  const pairSnap = await db
    .collection("games").doc(gameId)
    .collection("rounds").doc(roundId)
    .collection("pairs")
    .get();

  const pairDoc = pairSnap.docs.find((doc) => {
    const d = doc.data();
    return d.memberAUid === uid || d.memberBUid === uid;
  });

  if (!pairDoc) throw new HttpsError("not-found", "Pair not found");

  const pairRef = pairDoc.ref;
  const pair = pairDoc.data();

  const updates: Record<string, unknown> = {};
  if (pair.memberAUid === uid) {
    updates[pair.memberARole === "x" ? "xText" : "yText"] = text.trim();
  } else {
    updates[pair.memberBRole === "x" ? "xText" : "yText"] = text.trim();
  }

  const newX = updates.xText ?? pair.xText;
  const newY = updates.yText ?? pair.yText;

  updates.complete = !!newX && !!newY;

  await pairRef.update(updates);

  const roundRef = db.collection("games").doc(gameId).collection("rounds").doc(roundId);

  const allPairsSnap = await roundRef.collection("pairs").get();
  const allComplete = allPairsSnap.docs.every((d) => d.data().complete === true);

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

  const { gameId, roundId, matchupId, votedForPairId } = req.data as {
    gameId: string;
    roundId: string;
    matchupId: string;
    votedForPairId: string;
  };

  if (!gameId || !roundId || !matchupId || !votedForPairId) {
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

  if (votedForPairId !== matchup.pairAId && votedForPairId !== matchup.pairBId) {
    throw new HttpsError("invalid-argument", "Invalid pair selected");
  }

  const existingVote = await voteRef.get();
  if (existingVote.exists) {
    throw new HttpsError("already-exists", "You already voted for this matchup");
  }

  await voteRef.set({
    matchupId,
    voterUid: uid,
    votedForPairId,
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
    if (vote.votedForPairId === matchup.pairAId) votesA++;
    if (vote.votedForPairId === matchup.pairBId) votesB++;
  }

  const winnerPairId = votesA >= votesB ? matchup.pairAId : matchup.pairBId;

  const pairASnap = await roundRef.collection("pairs").doc(matchup.pairAId).get();
  const pairBSnap = await roundRef.collection("pairs").doc(matchup.pairBId).get();

  const pairA = pairASnap.data()!;
  const pairB = pairBSnap.data()!;

  const batch = db.batch();

  batch.update(matchupRef, {
    state: "closed",
    votesA,
    votesB,
    winnerPairId,
  });

  // Add vote totals as points to both members of each pair
  const addScore = (playerUid: string, delta: number) => {
    const playerRef = gameRef.collection("players").doc(playerUid);
    batch.update(playerRef, {
      score: admin.firestore.FieldValue.increment(delta),
    });
  };

  addScore(pairA.memberAUid, votesA);
  addScore(pairA.memberBUid, votesA);
  addScore(pairB.memberAUid, votesB);
  addScore(pairB.memberBUid, votesB);

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
    winnerPairId,
  };
});
