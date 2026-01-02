import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getByGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    return players.map((player) => ({
      _id: player._id,
      name: player.name,
      isBot: player.isBot,
      isAlive: player.isAlive,
      isSpectator: player.isSpectator,
    }));
  },
});

export const getSelf = query({
  args: {
    playerId: v.id("players"),
    sessionToken: v.string(),
  },
  handler: async (ctx, { playerId, sessionToken }) => {
    const player = await ctx.db.get(playerId);
    if (!player || player.sessionToken !== sessionToken) {
      throw new Error("Unauthorized");
    }

    return {
      _id: player._id,
      name: player.name,
      isBot: player.isBot,
      isAlive: player.isAlive,
      isSpectator: player.isSpectator,
      role: player.role,
      gameId: player.gameId,
    };
  },
});

export const getMafiaTeam = query({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
    sessionToken: v.string(),
  },
  handler: async (ctx, { gameId, playerId, sessionToken }) => {
    const player = await ctx.db.get(playerId);
    if (!player || player.sessionToken !== sessionToken) {
      throw new Error("Unauthorized");
    }
    if (player.role !== "mafia" || player.gameId !== gameId) return [];

    const mafia = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .filter((q) => q.eq(q.field("role"), "mafia"))
      .collect();

    return mafia.map((p) => ({ _id: p._id, name: p.name }));
  },
});

export const getPlayersWithRoles = query({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
    sessionToken: v.string(),
  },
  handler: async (ctx, { gameId, playerId, sessionToken }) => {
    const player = await ctx.db.get(playerId);
    if (!player || player.sessionToken !== sessionToken) {
      throw new Error("Unauthorized");
    }

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");

    if (!player.isSpectator && game.status !== "finished") {
      throw new Error("Forbidden");
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();

    return players.map((p) => ({
      _id: p._id,
      name: p.name,
      isBot: p.isBot,
      isAlive: p.isAlive,
      isSpectator: p.isSpectator,
      role: p.role,
    }));
  },
});

export const getSheriffReveals = query({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
    sessionToken: v.string(),
  },
  handler: async (ctx, { gameId, playerId, sessionToken }) => {
    const player = await ctx.db.get(playerId);
    if (!player || player.sessionToken !== sessionToken) {
      throw new Error("Unauthorized");
    }
    if (player.role !== "sheriff" || player.gameId !== gameId) return [];

    const reveals = await ctx.db
      .query("sheriffReveals")
      .withIndex("by_sheriff", (q) => q.eq("sheriffId", playerId))
      .filter((q) => q.eq(q.field("gameId"), gameId))
      .collect();

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    const playerMap = new Map(players.map((p) => [p._id, p.name]));

    return reveals.map((reveal) => ({
      _id: reveal._id,
      targetId: reveal.targetId,
      targetName: playerMap.get(reveal.targetId) ?? "Unknown",
      isMafia: reveal.isMafia,
      dayNumber: reveal.dayNumber,
    }));
  },
});

export const getAlivePlayers = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    return await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .filter((q) => q.eq(q.field("isAlive"), true))
      .collect();
  },
});

export const getPlayer = internalQuery({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    return await ctx.db.get(playerId);
  },
});
