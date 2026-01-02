import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const sendMessage = mutation({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
    sessionToken: v.string(),
    content: v.string(),
    isSpectatorChat: v.boolean(),
  },
  handler: async (ctx, { gameId, playerId, sessionToken, content, isSpectatorChat }) => {
    const player = await ctx.db.get(playerId);
    if (!player || player.sessionToken !== sessionToken) {
      throw new Error("Unauthorized");
    }
    if (player.gameId !== gameId) {
      throw new Error("Unauthorized");
    }

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");

    const trimmed = content.trim();
    if (!trimmed) return;

    if (game.phase === "night") {
      throw new Error("Cannot chat during night phase");
    }

    if (player.isSpectator && !isSpectatorChat) {
      throw new Error("Spectators can only use spectator chat");
    }

    if (!player.isSpectator && isSpectatorChat) {
      throw new Error("Only spectators can send spectator chat");
    }

    await ctx.db.insert("chatMessages", {
      gameId,
      playerId,
      content: trimmed.slice(0, 280),
      isSpectatorChat,
      timestamp: Date.now(),
    });

    if (!player.isBot && !isSpectatorChat && game.phase === "day_discussion") {
      const bots = await ctx.db
        .query("players")
        .withIndex("by_game", (q) => q.eq("gameId", gameId))
        .filter((q) =>
          q.and(q.eq(q.field("isBot"), true), q.eq(q.field("isAlive"), true))
        )
        .collect();

      if (bots.length > 0) {
        const shuffled = bots.sort(() => Math.random() - 0.5);
        const numResponders = Math.min(bots.length, Math.floor(Math.random() * 2) + 1);
        const respondingBots = shuffled.slice(0, numResponders);

        for (const bot of respondingBots) {
          const delay = 2000 + Math.floor(Math.random() * 4000);
          await ctx.scheduler.runAfter(delay, internal.ai.processBotChat, {
            gameId,
            playerId: bot._id,
          });
        }
      }
    }
  },
});

export const getMessages = query({
  args: { gameId: v.id("games"), isSpectatorChat: v.optional(v.boolean()) },
  handler: async (ctx, { gameId, isSpectatorChat }) => {
    let query = ctx.db
      .query("chatMessages")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .order("asc");

    if (isSpectatorChat !== undefined) {
      query = query.filter((q) =>
        q.eq(q.field("isSpectatorChat"), isSpectatorChat)
      );
    }

    const messages = await query.take(200);

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    const playerMap = new Map(players.map((p) => [p._id, { name: p.name, isBot: p.isBot }]));

    return messages.map((message) => ({
      _id: message._id,
      playerId: message.playerId,
      playerName: playerMap.get(message.playerId)?.name ?? "Unknown",
      content: message.content,
      isSpectatorChat: message.isSpectatorChat,
      isBot: playerMap.get(message.playerId)?.isBot ?? false,
      timestamp: message.timestamp,
    }));
  },
});

export const getRecentMessages = internalQuery({
  args: { gameId: v.id("games"), limit: v.number() },
  handler: async (ctx, { gameId, limit }) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .order("desc")
      .take(limit);

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    const playerMap = new Map(players.map((p) => [p._id, { name: p.name, isBot: p.isBot }]));

    return messages
      .filter((message) => !message.isSpectatorChat)
      .reverse()
      .map((message) => ({
        _id: message._id,
        playerId: message.playerId,
        playerName: playerMap.get(message.playerId)?.name ?? "Unknown",
        isBot: playerMap.get(message.playerId)?.isBot ?? false,
        content: message.content,
        timestamp: message.timestamp,
      }));
  },
});
