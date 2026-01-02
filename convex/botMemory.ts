import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const updateBotMemory = internalMutation({
  args: {
    playerId: v.id("players"),
    gameId: v.id("games"),
    dayNumber: v.number(),
    event: v.string(),
  },
  handler: async (ctx, { playerId, gameId, dayNumber, event }) => {
    const existing = await ctx.db
      .query("botMemory")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        memories: [...existing.memories, { dayNumber, event }],
      });
    } else {
      await ctx.db.insert("botMemory", {
        playerId,
        gameId,
        memories: [{ dayNumber, event }],
      });
    }
  },
});

export const getBotMemory = internalQuery({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    return await ctx.db
      .query("botMemory")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .first();
  },
});
