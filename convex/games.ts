import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { randomCode, randomToken, shuffle } from "./utils";
import type { Id } from "./_generated/dataModel";

const NIGHT_DURATION_MS = 30_000;
const DISCUSSION_DURATION_MS = 60_000;
const VOTING_DURATION_MS = 45_000;

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    return await ctx.db
      .query("games")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
  },
});

export const getGameState = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    return await ctx.db.get(gameId);
  },
});

export const createLobby = mutation({
  args: { hostName: v.string() },
  handler: async (ctx, { hostName }) => {
    let code = randomCode();
    let existing = await ctx.db
      .query("games")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    while (existing) {
      code = randomCode();
      existing = await ctx.db
        .query("games")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
    }

    const sessionToken = randomToken();

    const gameId = await ctx.db.insert("games", {
      code,
      status: "lobby",
    });

    const playerId = await ctx.db.insert("players", {
      gameId,
      name: hostName,
      sessionToken,
      isBot: false,
      isAlive: true,
      isSpectator: false,
    });

    await ctx.db.patch(gameId, { hostPlayerId: playerId });

    return { gameId, playerId, sessionToken, code };
  },
});

export const joinLobby = mutation({
  args: {
    code: v.string(),
    playerName: v.string(),
  },
  handler: async (ctx, { code, playerName }) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game already started");

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();

    if (players.length >= 10) throw new Error("Lobby is full");

    const sessionToken = randomToken();

    const playerId = await ctx.db.insert("players", {
      gameId: game._id,
      name: playerName,
      sessionToken,
      isBot: false,
      isAlive: true,
      isSpectator: false,
    });

    return { gameId: game._id, playerId, sessionToken, code };
  },
});

export const addBots = mutation({
  args: {
    gameId: v.id("games"),
    count: v.number(),
    playerId: v.id("players"),
    sessionToken: v.string(),
  },
  handler: async (ctx, { gameId, count, playerId, sessionToken }) => {
    const host = await requirePlayer(ctx, playerId, sessionToken);
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (host.gameId !== gameId) throw new Error("Unauthorized");
    if (game.hostPlayerId !== host._id) throw new Error("Not host");
    if (game.status !== "lobby") throw new Error("Game already started");

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    const availableSlots = 10 - players.length;
    const botsToAdd = Math.min(Math.max(0, count), availableSlots);

    const existingBots = players.filter((p) => p.isBot).length;
    for (let i = 0; i < botsToAdd; i += 1) {
      await ctx.db.insert("players", {
        gameId,
        name: `Bot ${existingBots + i + 1}`,
        sessionToken: randomToken(),
        isBot: true,
        isAlive: true,
        isSpectator: false,
      });
    }

    return { added: botsToAdd };
  },
});

export const startGame = mutation({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
    sessionToken: v.string(),
  },
  handler: async (ctx, { gameId, playerId, sessionToken }) => {
    const host = await requirePlayer(ctx, playerId, sessionToken);
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (host.gameId !== gameId) throw new Error("Unauthorized");
    if (game.hostPlayerId !== host._id) throw new Error("Not host");
    if (game.status !== "lobby") throw new Error("Game already started");

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    if (players.length < 4) throw new Error("Not enough players");

    const roles = buildRoles(players.length);
    const shuffledPlayers = shuffle(players);

    let index = 0;
    for (const role of roles) {
      const player = shuffledPlayers[index];
      await ctx.db.patch(player._id, {
        role,
        isAlive: true,
        isSpectator: false,
      });
      index += 1;
    }

    await ctx.db.patch(gameId, {
      status: "playing",
      winner: undefined,
      lastDayResult: undefined,
      lastNightResult: "Night falls. The town goes quiet...",
    });

    await ctx.runMutation(internal.games.startNightPhaseInternal, { gameId });
  },
});

export const startNightPhaseInternal = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.status !== "playing") return;

    const dayNumber = (game.dayNumber ?? 0) + 1;
    const phaseEndTime = Date.now() + NIGHT_DURATION_MS;

    await ctx.db.patch(gameId, {
      phase: "night",
      dayNumber,
      phaseEndTime,
    });

    await ctx.scheduler.runAfter(2000, internal.ai.processBotNightActions, {
      gameId,
      dayNumber,
    });

    await ctx.scheduler.runAfter(NIGHT_DURATION_MS, internal.games.resolveNightPhase, {
      gameId,
      dayNumber,
    });
  },
});

export const resolveNightPhase = internalMutation({
  args: { gameId: v.id("games"), dayNumber: v.number() },
  handler: async (ctx, { gameId, dayNumber }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.status !== "playing") return;
    if (game.phase !== "night" || game.dayNumber !== dayNumber) return;

    const actions = await ctx.db
      .query("nightActions")
      .withIndex("by_game_day", (q) =>
        q.eq("gameId", gameId).eq("dayNumber", dayNumber)
      )
      .collect();

    const killActions = actions.filter((a) => a.actionType === "kill");
    const protectAction = actions.find((a) => a.actionType === "protect");
    const investigateActions = actions.filter((a) => a.actionType === "investigate");

    const killTargetId = selectMajorityTarget(killActions.map((a) => a.targetId));
    const protectedId = protectAction?.targetId ?? null;

    let killedPlayer = null as null | string;

    if (killTargetId && killTargetId !== protectedId) {
      const target = await ctx.db.get(killTargetId);
      if (target && target.isAlive) {
        await ctx.db.patch(killTargetId, {
          isAlive: false,
          isSpectator: true,
        });
        killedPlayer = target.name;
      }
    }

    for (const action of investigateActions) {
      const target = await ctx.db.get(action.targetId);
      if (!target) continue;
      await ctx.db.insert("sheriffReveals", {
        gameId,
        sheriffId: action.playerId,
        targetId: action.targetId,
        isMafia: target.role === "mafia",
        dayNumber,
      });

      const sheriff = await ctx.db.get(action.playerId);
      if (sheriff?.isBot) {
        await ctx.runMutation(internal.botMemory.updateBotMemory, {
          playerId: sheriff._id,
          gameId,
          dayNumber,
          event: `Investigated ${target.name}: ${target.role === "mafia" ? "Mafia" : "Town"}.`,
        });
      }
    }

    const alivePlayers = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .filter((q) => q.eq(q.field("isAlive"), true))
      .collect();

    const winner = evaluateWinner(alivePlayers);
    if (winner) {
      await ctx.db.patch(gameId, {
        status: "finished",
        winner,
        phase: undefined,
        phaseEndTime: undefined,
        lastNightResult: killedPlayer
          ? `${killedPlayer} was eliminated during the night.`
          : "No one died last night.",
      });
      await updateBotMemories(ctx, gameId, alivePlayers, dayNumber, winner, nightSummaryForMemory(killedPlayer));
      return;
    }

    const nightSummary = killedPlayer
      ? `${killedPlayer} was eliminated during the night.`
      : "No one died last night.";

    await ctx.db.patch(gameId, {
      phase: "day_discussion",
      phaseEndTime: Date.now() + DISCUSSION_DURATION_MS,
      lastNightResult: nightSummary,
      lastDayResult: undefined,
    });

    const bots = alivePlayers.filter((p) => p.isBot);
    await updateBotMemories(
      ctx,
      gameId,
      bots,
      dayNumber,
      null,
      nightSummaryForMemory(killedPlayer)
    );

    const roundTimes = [0.2, 0.5, 0.8];
    for (const round of roundTimes) {
      for (let i = 0; i < bots.length; i += 1) {
        const delay = Math.floor(DISCUSSION_DURATION_MS * round) + i * 800;
        await ctx.scheduler.runAfter(delay, internal.ai.processBotChat, {
          gameId,
          playerId: bots[i]._id,
        });
      }
    }

    await ctx.scheduler.runAfter(DISCUSSION_DURATION_MS, internal.games.startVoting, {
      gameId,
      dayNumber,
    });
  },
});

export const startVoting = internalMutation({
  args: { gameId: v.id("games"), dayNumber: v.number() },
  handler: async (ctx, { gameId, dayNumber }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.status !== "playing") return;
    if (game.phase !== "day_discussion" || game.dayNumber !== dayNumber) return;

    await ctx.db.patch(gameId, {
      phase: "day_voting",
      phaseEndTime: Date.now() + VOTING_DURATION_MS,
    });

    const alivePlayers = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .filter((q) => q.eq(q.field("isAlive"), true))
      .collect();

    const bots = alivePlayers.filter((p) => p.isBot);
    for (const bot of bots) {
      const delay = 2000 + Math.floor(Math.random() * 10_000);
      await ctx.scheduler.runAfter(delay, internal.ai.processBotVote, {
        gameId,
        playerId: bot._id,
        dayNumber,
      });
    }

    await ctx.scheduler.runAfter(VOTING_DURATION_MS, internal.games.resolveVoting, {
      gameId,
      dayNumber,
    });
  },
});

export const resolveVoting = internalMutation({
  args: { gameId: v.id("games"), dayNumber: v.number() },
  handler: async (ctx, { gameId, dayNumber }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.status !== "playing") return;
    if (game.phase !== "day_voting" || game.dayNumber !== dayNumber) return;

    const votes = await ctx.db
      .query("votes")
      .withIndex("by_game_day", (q) =>
        q.eq("gameId", gameId).eq("dayNumber", dayNumber)
      )
      .collect();

    const alivePlayers = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .filter((q) => q.eq(q.field("isAlive"), true))
      .collect();

    const voteCounts = new Map<string, number>();
    for (const vote of votes) {
      if (!vote.targetId) continue;
      voteCounts.set(vote.targetId, (voteCounts.get(vote.targetId) ?? 0) + 1);
    }

    let eliminatedId: Id<"players"> | null = null;
    let highest = 0;
    let isTie = false;

    for (const [targetId, count] of voteCounts.entries()) {
      if (count > highest) {
        highest = count;
        eliminatedId = targetId as Id<"players">;
        isTie = false;
      } else if (count === highest) {
        isTie = true;
      }
    }

    const majority = Math.floor(alivePlayers.length / 2) + 1;
    if (highest < majority || isTie) {
      eliminatedId = null;
    }

    let daySummary = "No one was eliminated today.";

    if (eliminatedId) {
      const target = await ctx.db.get(eliminatedId);
      if (target && target.isAlive) {
        await ctx.db.patch(eliminatedId, {
          isAlive: false,
          isSpectator: true,
        });
        daySummary = `${target.name} was voted out.`;
      }
    }

    const updatedAlive = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .filter((q) => q.eq(q.field("isAlive"), true))
      .collect();

    const winner = evaluateWinner(updatedAlive);
    if (winner) {
      await ctx.db.patch(gameId, {
        status: "finished",
        winner,
        phase: undefined,
        phaseEndTime: undefined,
        lastDayResult: daySummary,
      });
      await updateBotMemories(ctx, gameId, updatedAlive, dayNumber, winner, `Day ${dayNumber}: ${daySummary}`);
      return;
    }

    await ctx.db.patch(gameId, {
      lastDayResult: daySummary,
    });

    await updateBotMemories(ctx, gameId, updatedAlive, dayNumber, null, `Day ${dayNumber}: ${daySummary}`);
    await ctx.runMutation(internal.games.startNightPhaseInternal, { gameId });
  },
});

function buildRoles(playerCount: number) {
  let mafia = 1;
  let doctor = 1;
  let sheriff = 0;

  if (playerCount >= 6 && playerCount <= 7) {
    mafia = 2;
    doctor = 1;
    sheriff = 1;
  } else if (playerCount >= 8) {
    mafia = 3;
    doctor = 1;
    sheriff = 1;
  }

  const citizens = Math.max(0, playerCount - mafia - doctor - sheriff);
  return [
    ...Array.from({ length: mafia }, () => "mafia" as const),
    ...Array.from({ length: doctor }, () => "doctor" as const),
    ...Array.from({ length: sheriff }, () => "sheriff" as const),
    ...Array.from({ length: citizens }, () => "citizen" as const),
  ];
}

function selectMajorityTarget(targets: Id<"players">[]): Id<"players"> | null {
  if (targets.length === 0) return null;
  const counts = new Map<Id<"players">, number>();
  for (const target of targets) {
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }

  let highest = 0;
  let topTargets: Id<"players">[] = [];
  for (const [targetId, count] of counts.entries()) {
    if (count > highest) {
      highest = count;
      topTargets = [targetId];
    } else if (count === highest) {
      topTargets.push(targetId);
    }
  }

  if (topTargets.length === 1) return topTargets[0];
  const randomIndex = Math.floor(Math.random() * topTargets.length);
  return topTargets[randomIndex];
}

function evaluateWinner(players: Array<{ role?: string }>) {
  const mafiaCount = players.filter((p) => p.role === "mafia").length;
  const townCount = players.length - mafiaCount;
  console.log(`[evaluateWinner] Total alive: ${players.length}, Mafia: ${mafiaCount}, Town: ${townCount}`);
  if (mafiaCount === 0) return "town" as const;
  if (mafiaCount >= townCount) return "mafia" as const;
  return null;
}


async function requirePlayer(ctx: any, playerId: any, sessionToken: string) {
  const player = await ctx.db.get(playerId);
  if (!player || player.sessionToken !== sessionToken) {
    throw new Error("Unauthorized");
  }
  return player;
}

function nightSummaryForMemory(killedPlayerName: string | null) {
  return killedPlayerName
    ? `Night result: ${killedPlayerName} was eliminated.`
    : "Night result: No one was eliminated.";
}

async function updateBotMemories(
  ctx: any,
  gameId: any,
  bots: Array<{ _id: any; isBot?: boolean }>,
  dayNumber: number,
  winner: "town" | "mafia" | null,
  summary: string
) {
  const botPlayers = bots.filter((p) => p.isBot !== false);
  for (const bot of botPlayers) {
    await ctx.runMutation(internal.botMemory.updateBotMemory, {
      playerId: bot._id,
      gameId,
      dayNumber,
      event: summary,
    });

    if (winner) {
      await ctx.runMutation(internal.botMemory.updateBotMemory, {
        playerId: bot._id,
        gameId,
        dayNumber,
        event: `Game over: ${winner} wins.`,
      });
    }
  }
}
