import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const submitVote = mutation({
  args: {
    gameId: v.id("games"),
    voterId: v.id("players"),
    sessionToken: v.string(),
    targetId: v.optional(v.id("players")),
  },
  handler: async (ctx, { gameId, voterId, sessionToken, targetId }) => {
    const player = await ctx.db.get(voterId);
    if (!player || player.sessionToken !== sessionToken) {
      throw new Error("Unauthorized");
    }
    if (player.gameId !== gameId) {
      throw new Error("Unauthorized");
    }

    const game = await ctx.db.get(gameId);
    if (!game || game.status !== "playing") throw new Error("Game not active");
    if (game.phase !== "day_voting") throw new Error("Not voting phase");
    if (!player.isAlive) throw new Error("Player is eliminated");

    if (targetId) {
      const target = await ctx.db.get(targetId);
      if (!target || target.gameId !== gameId) {
        throw new Error("Invalid target");
      }
      if (!target.isAlive) throw new Error("Target is not alive");
    }

    const existing = await ctx.db
      .query("votes")
      .withIndex("by_game_day", (q) =>
        q.eq("gameId", gameId).eq("dayNumber", game.dayNumber ?? 1)
      )
      .filter((q) => q.eq(q.field("voterId"), voterId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { targetId });
    } else {
      await ctx.db.insert("votes", {
        gameId,
        dayNumber: game.dayNumber ?? 1,
        voterId,
        targetId: targetId ?? undefined,
      });
    }
  },
});

export const getVotes = query({
  args: {
    gameId: v.id("games"),
    dayNumber: v.number(),
  },
  handler: async (ctx, { gameId, dayNumber }) => {
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_game_day", (q) =>
        q.eq("gameId", gameId).eq("dayNumber", dayNumber)
      )
      .collect();

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    const playerMap = new Map(players.map((player) => [player._id, player]));

    return votes.map((vote) => {
      const voter = playerMap.get(vote.voterId);
      const target = vote.targetId ? playerMap.get(vote.targetId) : null;

      return {
        ...vote,
        voterName: voter?.name ?? "Unknown",
        targetName: target?.name ?? null,
      };
    });
  },
});
