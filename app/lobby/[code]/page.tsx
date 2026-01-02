"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useState } from "react";

export default function LobbyPage() {
  const { code } = useParams();
  const router = useRouter();
  const [botCount, setBotCount] = useState(0);

  const game = useQuery(api.games.getByCode, { code: code as string });
  const players = useQuery(
    api.players.getByGame,
    game ? { gameId: game._id } : "skip"
  );

  const addBots = useMutation(api.games.addBots);
  const startGame = useMutation(api.games.startGame);

  const playerId = typeof window !== "undefined"
    ? localStorage.getItem("playerId")
    : null;
  const sessionToken = typeof window !== "undefined"
    ? localStorage.getItem("sessionToken")
    : null;

  const isHost = game?.hostPlayerId === playerId;

  const humanCount = useMemo(
    () => players?.filter((p) => !p.isBot).length ?? 0,
    [players]
  );
  const currentBotCount = useMemo(
    () => players?.filter((p) => p.isBot).length ?? 0,
    [players]
  );
  const maxBots = Math.max(0, 10 - humanCount - currentBotCount);

  useEffect(() => {
    if (game?.status === "playing") {
      router.push(`/game/${code}`);
    }
  }, [game?.status, router, code]);

  if (game === undefined) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <p className="text-lg text-zinc-500">Loading lobby...</p>
      </main>
    );
  }

  if (game === null) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <p className="text-lg text-zinc-500">Lobby not found.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-900/80 to-zinc-800 p-8">
          <p className="text-xs uppercase tracking-[0.4em] text-zinc-400">
            Lobby Code
          </p>
          <h1 className="mt-2 text-4xl font-semibold">{game.code}</h1>
          <p className="mt-4 text-sm text-zinc-400">
            Share this code or link to invite players. You need at least 4 total
            players to start.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Input
              readOnly
              value={
                typeof window !== "undefined" ? window.location.href : ""
              }
              className="max-w-lg bg-zinc-900/70 text-zinc-200"
            />
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-zinc-900/70 p-6">
            <h2 className="text-xl font-semibold">Players</h2>
            <p className="mt-1 text-sm text-zinc-400">
              {players?.length ?? 0}/10 connected
            </p>
            <ul className="mt-6 space-y-3">
              {players?.map((player) => (
                <li
                  key={player._id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{player.name}</span>
                    {player.isBot && (
                      <span className="text-xs text-zinc-400">AI Bot</span>
                    )}
                  </div>
                  {player._id === game.hostPlayerId && (
                    <span className="text-xs uppercase tracking-[0.3em] text-amber-400">
                      Host
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-6">
            {isHost ? (
              <div className="rounded-3xl border border-white/10 bg-zinc-900/70 p-6">
                <h3 className="text-lg font-semibold">Host controls</h3>
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-zinc-400">
                      <span>Add bots</span>
                      <span>{botCount}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={maxBots}
                      value={botCount}
                      onChange={(e) => setBotCount(Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                    <Button
                      onClick={async () => {
                        if (!sessionToken || !playerId) return;
                        if (botCount === 0) return;
                        await addBots({
                          gameId: game._id,
                          count: botCount,
                          playerId: playerId as Id<"players">,
                          sessionToken,
                        });
                        setBotCount(0);
                      }}
                      className="w-full rounded-full bg-amber-400 text-zinc-900 hover:bg-amber-300"
                      disabled={!sessionToken || !playerId || botCount === 0}
                    >
                      Add {botCount} bot{botCount === 1 ? "" : "s"}
                    </Button>
                  </div>
                  <Button
                    onClick={async () => {
                      if (!sessionToken || !playerId) return;
                      await startGame({
                        gameId: game._id,
                        playerId: playerId as Id<"players">,
                        sessionToken,
                      });
                    }}
                    disabled={(players?.length ?? 0) < 4}
                    className="w-full rounded-full bg-white text-zinc-900 hover:bg-zinc-100"
                  >
                    Start Game
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-white/10 bg-zinc-900/70 p-6">
                <h3 className="text-lg font-semibold">Waiting for host</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  The host will start the game when everyone is ready.
                </p>
              </div>
            )}

            <div className="rounded-3xl border border-white/10 bg-zinc-900/70 p-6 text-sm text-zinc-400">
              <p>Humans: {humanCount}</p>
              <p>Bots: {currentBotCount}</p>
              <p>Available bot slots: {maxBots}</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
