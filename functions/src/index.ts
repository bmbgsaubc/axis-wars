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
  const matchups: Array<{
    matchupId: string;
    pairAId: string;
    pairBId: string;
    figureId: string;
  }> = [];

  const figuresSnap = await db.collection("figures").where("active", "==", true).get();
  const figureIds = shuffle(figuresSnap.docs.map((d) => d.id));

  if (figureIds.length < Math.floor(shuffledPairs.length / 2)) {
    throw new HttpsError("failed-precondition", "Not enough figures");
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

  const roundRef = db.collection("games").doc(gameId).collection("rounds").doc(roundId);
  const voteRef = roundRef.collection("votes").doc(`${matchupId}_${uid}`);
  const existing = await voteRef.get();
  if (existing.exists) {
    throw new HttpsError("already-exists", "Already voted");
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
  if (gameSnap.data()?.hostUid !== uid) {
    throw new HttpsError("permission-denied", "Only host can do this");
  }

  const roundRef = gameRef.collection("rounds").doc(roundId);
  const matchupRef = roundRef.collection("matchups").doc(matchupId);
  const matchupSnap = await matchupRef.get();
  const matchup = matchupSnap.data()!;
  
  const votesSnap = await roundRef.collection("votes")
    .where("matchupId", "==", matchupId)
    .get();

  let votesA = 0;
  let votesB = 0;
  for (const doc of votesSnap.docs) {
    const v = doc.data();
    if (v.votedForPairId === matchup.pairAId) votesA++;
    if (v.votedForPairId === matchup.pairBId) votesB++;
  }

  const winnerPairId = votesA >= votesB ? matchup.pairAId : matchup.pairBId;

  const pairA = await roundRef.collection("pairs").doc(matchup.pairAId).get();
  const pairB = await roundRef.collection("pairs").doc(matchup.pairBId).get();

  const batch = db.batch();

  batch.update(matchupRef, {
    state: "closed",
    votesA,
    votesB,
    winnerPairId,
  });

  // Score = total votes received by figure
  const pA = pairA.data()!;
  const pB = pairB.data()!;

  const addScore = (playerUid: string, delta: number) => {
    const ref = gameRef.collection("players").doc(playerUid);
    batch.update(ref, {
      score: admin.firestore.FieldValue.increment(delta),
    });
  };

  addScore(pA.memberAUid, votesA);
  addScore(pA.memberBUid, votesA);
  addScore(pB.memberAUid, votesB);
  addScore(pB.memberBUid, votesB);

  await batch.commit();

  return { ok: true, votesA, votesB, winnerPairId };
});