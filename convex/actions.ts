import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const submitNightAction = mutation({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
    sessionToken: v.string(),
    targetId: v.id("players"),
  },
  handler: async (ctx, { gameId, playerId, sessionToken, targetId }) => {
    const player = await ctx.db.get(playerId);
    if (!player || player.sessionToken !== sessionToken) {
      throw new Error("Unauthorized");
    }
    if (player.gameId !== gameId) {
      throw new Error("Unauthorized");
    }

    const game = await ctx.db.get(gameId);
    if (!game || game.status !== "playing") throw new Error("Game not active");
    if (game.phase !== "night") throw new Error("Not night phase");
    if (!player.isAlive) throw new Error("Player is eliminated");
    if (!player.role || player.role === "citizen") {
      throw new Error("No night action available");
    }

    const target = await ctx.db.get(targetId);
    if (!target || target.gameId !== gameId) {
      throw new Error("Invalid target");
    }
    if (!target.isAlive) throw new Error("Target is not alive");

    const actionType =
      player.role === "mafia"
        ? "kill"
        : player.role === "doctor"
          ? "protect"
          : "investigate";

    if (player.role === "mafia" && target.role === "mafia") {
      throw new Error("Mafia cannot target fellow mafia");
    }

    if (player.role === "sheriff" && targetId === playerId) {
      throw new Error("Sheriff cannot investigate themselves");
    }

    if (player.role === "doctor" && targetId === playerId) {
      const previousDay = (game.dayNumber ?? 1) - 1;
      if (previousDay > 0) {
        const previous = await ctx.db
          .query("nightActions")
          .withIndex("by_game_day", (q) =>
            q.eq("gameId", gameId).eq("dayNumber", previousDay)
          )
          .filter((q) => q.eq(q.field("playerId"), playerId))
          .first();
        if (previous && previous.targetId === playerId) {
          throw new Error("Doctor cannot self-protect twice in a row");
        }
      }
    }

    const existing = await ctx.db
      .query("nightActions")
      .withIndex("by_game_day", (q) =>
        q.eq("gameId", gameId).eq("dayNumber", game.dayNumber ?? 1)
      )
      .filter((q) => q.eq(q.field("playerId"), playerId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        actionType,
        targetId,
      });
    } else {
      await ctx.db.insert("nightActions", {
        gameId,
        dayNumber: game.dayNumber ?? 1,
        playerId,
        actionType,
        targetId,
      });
    }
  },
});

export const getNightActionsSummary = query({
  args: {
    gameId: v.id("games"),
    dayNumber: v.number(),
  },
  handler: async (ctx, { gameId, dayNumber }) => {
    const actions = await ctx.db
      .query("nightActions")
      .withIndex("by_game_day", (q) =>
        q.eq("gameId", gameId).eq("dayNumber", dayNumber)
      )
      .collect();

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    const playerMap = new Map(players.map((player) => [player._id, player]));

    return actions.map((action) => {
      const actor = playerMap.get(action.playerId);
      const target = playerMap.get(action.targetId);

      return {
        playerName: actor?.name ?? "Unknown",
        role: actor?.role ?? "unknown",
        targetName: target?.name ?? "Unknown",
        actionType: action.actionType,
      };
    });
  },
});
