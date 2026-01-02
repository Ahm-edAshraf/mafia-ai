import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  games: defineTable({
    code: v.string(),
    hostPlayerId: v.optional(v.id("players")),
    status: v.union(
      v.literal("lobby"),
      v.literal("playing"),
      v.literal("finished")
    ),
    phase: v.optional(
      v.union(
        v.literal("night"),
        v.literal("day_discussion"),
        v.literal("day_voting")
      )
    ),
    dayNumber: v.optional(v.number()),
    phaseEndTime: v.optional(v.number()),
    winner: v.optional(v.union(v.literal("town"), v.literal("mafia"))),
    lastNightResult: v.optional(v.string()),
    lastDayResult: v.optional(v.string()),
  }).index("by_code", ["code"]),

  players: defineTable({
    gameId: v.id("games"),
    name: v.string(),
    sessionToken: v.string(),
    isBot: v.boolean(),
    isAlive: v.boolean(),
    role: v.optional(
      v.union(
        v.literal("mafia"),
        v.literal("doctor"),
        v.literal("sheriff"),
        v.literal("citizen")
      )
    ),
    isSpectator: v.boolean(),
  })
    .index("by_game", ["gameId"])
    .index("by_session", ["sessionToken"]),

  nightActions: defineTable({
    gameId: v.id("games"),
    dayNumber: v.number(),
    playerId: v.id("players"),
    actionType: v.union(
      v.literal("kill"),
      v.literal("protect"),
      v.literal("investigate")
    ),
    targetId: v.id("players"),
  }).index("by_game_day", ["gameId", "dayNumber"]),

  votes: defineTable({
    gameId: v.id("games"),
    dayNumber: v.number(),
    voterId: v.id("players"),
    targetId: v.optional(v.id("players")),
  }).index("by_game_day", ["gameId", "dayNumber"]),

  chatMessages: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    content: v.string(),
    isSpectatorChat: v.boolean(),
    timestamp: v.number(),
  }).index("by_game", ["gameId"]),

  sheriffReveals: defineTable({
    gameId: v.id("games"),
    sheriffId: v.id("players"),
    targetId: v.id("players"),
    isMafia: v.boolean(),
    dayNumber: v.number(),
  }).index("by_sheriff", ["sheriffId"]),

  botMemory: defineTable({
    playerId: v.id("players"),
    gameId: v.id("games"),
    memories: v.array(
      v.object({
        dayNumber: v.number(),
        event: v.string(),
      })
    ),
  }).index("by_player", ["playerId"]),
});
