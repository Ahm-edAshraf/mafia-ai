"use node";

import { internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import Groq from "groq-sdk";
import type { Id } from "./_generated/dataModel";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

const NightActionSchema = {
  type: "object",
  properties: {
    targetPlayerId: { type: "string", description: "The exact player ID to target" },
    reasoning: { type: "string", description: "Brief reasoning for this choice" },
  },
  required: ["targetPlayerId", "reasoning"],
  additionalProperties: false,
};

const VoteDecisionSchema = {
  type: "object",
  properties: {
    targetPlayerId: {
      type: ["string", "null"],
      description: "Player ID to vote for, or null to skip",
    },
    reasoning: { type: "string", description: "Brief reasoning for vote" },
  },
  required: ["targetPlayerId", "reasoning"],
  additionalProperties: false,
};

const ChatMessageSchema = {
  type: "object",
  properties: {
    shouldSpeak: { type: "boolean", description: "Whether to say something" },
    message: { type: "string", description: "What to say (empty string if not speaking)" },
  },
  required: ["shouldSpeak", "message"],
  additionalProperties: false,
};

function safeParseJson(text: string | undefined | null): any {
  if (!text) return null;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(text);
  } catch (error) {
    console.error("Failed to parse JSON:", text?.substring(0, 200));
    return null;
  }
}

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

export const processBotNightActions = internalAction({
  args: {
    gameId: v.id("games"),
    dayNumber: v.number(),
  },
  handler: async (ctx, { gameId, dayNumber }) => {
    const players = await ctx.runQuery(internal.players.getAlivePlayers, { gameId });
    const bots = players.filter((p) => p.isBot && p.isAlive);

    for (const bot of bots) {
      if (!bot.role) continue;

      try {
        const memory = await ctx.runQuery(internal.botMemory.getBotMemory, {
          playerId: bot._id,
        });
        const gameState = await ctx.runQuery(internal.games.getGameState, {
          gameId,
        });

        let targetId: string | null = null;

        if (bot.role === "mafia") {
          targetId = await getMafiaDecision(bot, players, memory, gameState);
        } else if (bot.role === "doctor") {
          targetId = await getDoctorDecision(bot, players, memory, gameState);
        } else if (bot.role === "sheriff") {
          targetId = await getSheriffDecision(bot, players, memory, gameState);
        }

        if (targetId) {
          await ctx.runMutation(api.actions.submitNightAction, {
            gameId,
            playerId: bot._id,
            sessionToken: bot.sessionToken,
            targetId: targetId as Id<"players">,
          });
          console.log(`Bot ${bot.name} (${bot.role}) targeted player`);
        }
      } catch (error) {
        console.error(`Bot ${bot.name} night action failed:`, error);
      }
    }
  },
});

async function getMafiaDecision(
  bot: any,
  players: any[],
  memory: any,
  gameState: any
): Promise<string | null> {
  const aliveTownPlayers = players.filter(
    (p) => p.isAlive && p.role !== "mafia" && p._id !== bot._id
  );

  if (aliveTownPlayers.length === 0) return null;

  try {
    const playerList = aliveTownPlayers.map((p, i) => `${i + 1}. ${p.name} (ID: ${p._id})`).join("\n");
    const otherMafia = players
      .filter((p) => p.role === "mafia" && p._id !== bot._id && p.isAlive)
      .map((p) => p.name)
      .join(", ") || "None";

    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are a Mafia member in a Mafia game. You must choose a player to kill.
Respond ONLY with valid JSON in this exact format: {"targetPlayerId": "EXACT_ID_HERE", "reasoning": "brief reason"}
Do not include any other text, just the JSON object.`,
        },
        {
          role: "user",
          content: `Night ${gameState?.dayNumber ?? 1}. You are Mafia.
Other Mafia: ${otherMafia}

Players to choose from:
${playerList}

Your memories: ${memory?.memories?.map((m: any) => m.event).join("; ") || "None"}

Pick ONE player to kill. Copy their exact ID.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "night_action",
          strict: false,
          schema: NightActionSchema,
        },
      },
      temperature: 0.7,
      max_tokens: 150,
    });

    const text = response.choices[0]?.message?.content;
    console.log("Mafia AI response:", text);

    const parsed = safeParseJson(text);
    if (parsed?.targetPlayerId) {
      const validTarget = aliveTownPlayers.find((p) => p._id === parsed.targetPlayerId);
      if (validTarget) {
        console.log(`Mafia chose to kill: ${validTarget.name}`);
        return parsed.targetPlayerId;
      }
      console.warn(`Mafia AI returned invalid target ID: ${parsed.targetPlayerId}`);
    }
  } catch (error) {
    console.error("Mafia AI failed:", error);
  }

  const randomTarget = pickRandom(aliveTownPlayers);
  return randomTarget?._id ?? null;
}

async function getDoctorDecision(
  bot: any,
  players: any[],
  memory: any,
  gameState: any
): Promise<string | null> {
  const alivePlayers = players.filter((p) => p.isAlive);
  if (alivePlayers.length === 0) return null;

  try {
    const playerList = alivePlayers
      .map((p, i) => `${i + 1}. ${p.name} (ID: ${p._id})${p._id === bot._id ? " (YOU)" : ""}`)
      .join("\n");

    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are the Doctor in a Mafia game. You must choose a player to protect.
Respond ONLY with valid JSON: {"targetPlayerId": "EXACT_ID_HERE", "reasoning": "brief reason"}`,
        },
        {
          role: "user",
          content: `Night ${gameState?.dayNumber ?? 1}. You are the Doctor.

Players to protect:
${playerList}

Your memories: ${memory?.memories?.map((m: any) => m.event).join("; ") || "None"}

Pick ONE player to protect. Copy their exact ID.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "night_action",
          strict: false,
          schema: NightActionSchema,
        },
      },
      temperature: 0.7,
      max_tokens: 150,
    });

    const text = response.choices[0]?.message?.content;
    console.log("Doctor AI response:", text);

    const parsed = safeParseJson(text);
    if (parsed?.targetPlayerId) {
      const validTarget = alivePlayers.find((p) => p._id === parsed.targetPlayerId);
      if (validTarget) {
        console.log(`Doctor chose to protect: ${validTarget.name}`);
        return parsed.targetPlayerId;
      }
      console.warn(`Doctor AI returned invalid target ID: ${parsed.targetPlayerId}`);
    }
  } catch (error) {
    console.error("Doctor AI failed:", error);
  }

  const randomTarget = pickRandom(alivePlayers);
  return randomTarget?._id ?? null;
}

async function getSheriffDecision(
  bot: any,
  players: any[],
  memory: any,
  gameState: any
): Promise<string | null> {
  const otherAlivePlayers = players.filter(
    (p) => p.isAlive && p._id !== bot._id
  );
  if (otherAlivePlayers.length === 0) return null;

  try {
    const playerList = otherAlivePlayers.map((p, i) => `${i + 1}. ${p.name} (ID: ${p._id})`).join("\n");
    const previousInvestigations = memory?.memories?.filter((m: any) =>
      m.event.includes("investigated")
    ) || [];

    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are the Sheriff in a Mafia game. You must choose a player to investigate.
Respond ONLY with valid JSON: {"targetPlayerId": "EXACT_ID_HERE", "reasoning": "brief reason"}`,
        },
        {
          role: "user",
          content: `Night ${gameState?.dayNumber ?? 1}. You are the Sheriff.

Players to investigate:
${playerList}

Previous investigations: ${previousInvestigations.map((m: any) => m.event).join("; ") || "None"}

Pick ONE player to investigate. Copy their exact ID.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "night_action",
          strict: false,
          schema: NightActionSchema,
        },
      },
      temperature: 0.7,
      max_tokens: 150,
    });

    const text = response.choices[0]?.message?.content;
    console.log("Sheriff AI response:", text);

    const parsed = safeParseJson(text);
    if (parsed?.targetPlayerId) {
      const validTarget = otherAlivePlayers.find((p) => p._id === parsed.targetPlayerId);
      if (validTarget) {
        console.log(`Sheriff chose to investigate: ${validTarget.name}`);
        return parsed.targetPlayerId;
      }
      console.warn(`Sheriff AI returned invalid target ID: ${parsed.targetPlayerId}`);
    }
  } catch (error) {
    console.error("Sheriff AI failed:", error);
  }

  const randomTarget = pickRandom(otherAlivePlayers);
  return randomTarget?._id ?? null;
}

export const processBotVote = internalAction({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
    dayNumber: v.number(),
  },
  handler: async (ctx, { gameId, playerId, dayNumber }) => {
    const bot = await ctx.runQuery(internal.players.getPlayer, { playerId });
    if (!bot || !bot.isBot || !bot.isAlive) return;

    try {
      const players = await ctx.runQuery(internal.players.getAlivePlayers, { gameId });
      const memory = await ctx.runQuery(internal.botMemory.getBotMemory, { playerId });
      const chatHistory = await ctx.runQuery(internal.chat.getRecentMessages, {
        gameId,
        limit: 15,
      });

      const otherPlayers = players.filter((p) => p._id !== playerId);
      if (otherPlayers.length === 0) return;

      const playerList = otherPlayers.map((p, i) => `${i + 1}. ${p.name} (ID: ${p._id})`).join("\n");
      const chatLog = chatHistory.map((m: any) => `${m.playerName}: ${m.content}`).join("\n") || "No messages";

      const response = await groq.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `You are ${bot.name} (${bot.role}) in a Mafia game voting phase.
${
  bot.role === "mafia"
    ? "You are Mafia - try to vote out town members or blend in."
    : "Vote out suspected Mafia."
}
Respond ONLY with JSON: {"targetPlayerId": "EXACT_ID_OR_NULL", "reasoning": "brief reason"}
Use null for targetPlayerId to skip voting.`,
          },
          {
            role: "user",
            content: `Day ${dayNumber} voting.

Players to vote for:
${playerList}

Recent chat:
${chatLog}

Your memories: ${memory?.memories?.map((m: any) => m.event).join("; ") || "None"}

Vote for ONE player or null to skip.`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "vote_decision",
            strict: false,
            schema: VoteDecisionSchema,
          },
        },
        temperature: 0.7,
        max_tokens: 150,
      });

      const text = response.choices[0]?.message?.content;
      console.log("Vote AI response:", text);

      const parsed = safeParseJson(text);
      let targetId: Id<"players"> | undefined = undefined;
      let targetName = "skip";

      if (
        parsed?.targetPlayerId &&
        parsed.targetPlayerId !== "null" &&
        parsed.targetPlayerId !== null &&
        typeof parsed.targetPlayerId === "string"
      ) {
        const validTarget = otherPlayers.find((p) => p._id === parsed.targetPlayerId);
        if (validTarget) {
          targetId = parsed.targetPlayerId as Id<"players">;
          targetName = validTarget.name;
        } else {
          console.warn(`Vote AI returned invalid target ID: ${parsed.targetPlayerId}`);
        }
      }

      if (!targetId && Math.random() > 0.3) {
        const randomTarget = pickRandom(otherPlayers);
        if (randomTarget) {
          targetId = randomTarget._id;
          targetName = `${randomTarget.name} (random fallback)`;
        }
      }

      await ctx.runMutation(api.votes.submitVote, {
        gameId,
        voterId: playerId,
        sessionToken: bot.sessionToken,
        ...(targetId ? { targetId } : {}),
      });

      console.log(`Bot ${bot.name} voted for: ${targetName}`);
    } catch (error) {
      console.error(`Bot ${bot.name} vote failed:`, error);
    }
  },
});

export const processBotChat = internalAction({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
  },
  handler: async (ctx, { gameId, playerId }) => {
    const bot = await ctx.runQuery(internal.players.getPlayer, { playerId });
    if (!bot || !bot.isBot || !bot.isAlive) return;

    const gameState = await ctx.runQuery(internal.games.getGameState, { gameId });
    if (gameState?.phase !== "day_discussion") {
      console.log(`🚫 ${bot.name} skipping chat - not discussion phase`);
      return;
    }

    try {
      const chatHistory = await ctx.runQuery(internal.chat.getRecentMessages, {
        gameId,
        limit: 20,
      });
      const memory = await ctx.runQuery(internal.botMemory.getBotMemory, { playerId });

      const last3Messages = chatHistory.slice(-3);
      const botSpokeRecently = last3Messages.some((m: any) => m.playerId === playerId);
      if (botSpokeRecently) {
        console.log(`🤫 ${bot.name} (${bot.role}) waiting - spoke recently`);
        return;
      }

      const botMessageCount = chatHistory.filter((m: any) => m.playerId === playerId).length;
      if (botMessageCount >= 4) {
        console.log(
          `🤫 ${bot.name} (${bot.role}) quiet now - already spoke ${botMessageCount} times`
        );
        return;
      }

      const chatLog =
        chatHistory.map((m: any) => `${m.playerName}: ${m.content}`).join("\n") ||
        "No messages yet";

      const humanMessages = chatHistory.filter((m: any) => !m.isBot).slice(-5);
      const humanContext =
        humanMessages.length > 0
          ? `\n\nRecent human player messages you might want to respond to:\n${humanMessages
              .map((m: any) => `- ${m.playerName}: "${m.content}"`)
              .join("\n")}`
          : "";

      const response = await groq.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `You are ${bot.name} (secretly a ${bot.role}) in a Mafia game discussion.
NEVER reveal your role directly. Act natural and human-like.

${
  bot.role === "mafia"
    ? "AS MAFIA: Blend in. Agree with suspicions on town members. Subtly defend fellow mafia or throw them under the bus if needed."
    : bot.role === "sheriff"
      ? "AS SHERIFF: You can hint at your investigations without claiming your role. Be strategic about revealing info."
      : bot.role === "doctor"
        ? "AS DOCTOR: Act like a normal town member. Don't reveal your role or mafia will target you."
        : "AS CITIZEN: Share observations. Ask questions. Vote based on logic."
}

Conversation rules:
- Keep messages SHORT (1-2 sentences max)
- React to what others say - agree, disagree, or ask follow-up
- Sometimes stay silent (set shouldSpeak: false)
- Don't repeat yourself
- Be conversational, not robotic

Respond with JSON: {"shouldSpeak": true/false, "message": "your message if speaking"}`,
          },
          {
            role: "user",
            content: `Day ${gameState?.dayNumber ?? 1} discussion is ongoing.

Chat so far:
${chatLog}
${humanContext}

Your private info: ${memory?.memories?.map((m: any) => m.event).join("; ") || "Nothing special"}

Decide: Should you say something? If yes, what?`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "chat_message",
            strict: false,
            schema: ChatMessageSchema,
          },
        },
        temperature: 0.8,
        max_tokens: 100,
      });

      const text = response.choices[0]?.message?.content;
      console.log("Chat AI response:", text);

      const parsed = safeParseJson(text);

      if (parsed?.shouldSpeak === true && parsed?.message && parsed.message.trim().length > 0) {
        await ctx.runMutation(api.chat.sendMessage, {
          gameId,
          playerId,
          sessionToken: bot.sessionToken,
          content: parsed.message,
          isSpectatorChat: false,
        });
        console.log(`💬 ${bot.name} (${bot.role}): "${parsed.message}"`);
      } else {
        console.log(`🤫 ${bot.name} (${bot.role}) chose to stay silent`);
      }
    } catch (error) {
      console.error(`❌ Bot ${bot.name} chat failed:`, error);
    }
  },
});
