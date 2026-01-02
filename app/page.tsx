"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

export default function Home() {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const router = useRouter();

  const createLobby = useMutation(api.games.createLobby);
  const joinLobby = useMutation(api.games.joinLobby);

  const handleCreate = async () => {
    const result = await createLobby({ hostName: name.trim() });
    localStorage.setItem("sessionToken", result.sessionToken);
    localStorage.setItem("playerId", result.playerId);
    router.push(`/lobby/${result.code}`);
  };

  const handleJoin = async () => {
    const result = await joinLobby({
      code: joinCode.trim(),
      playerName: name.trim(),
    });
    localStorage.setItem("sessionToken", result.sessionToken);
    localStorage.setItem("playerId", result.playerId);
    router.push(`/lobby/${joinCode}`);
  };

  const trimmedName = name.trim();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fef3c7,transparent_45%),radial-gradient(circle_at_bottom,#dbeafe,transparent_45%)] px-6 py-12 text-zinc-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <header className="flex flex-col gap-4">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
            Mafia Night
          </p>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            Outsmart your friends. Outsmart the bots.
          </h1>
          <p className="max-w-2xl text-lg text-zinc-600">
            Create a lobby, invite friends, and let the AI-driven bots keep the
            pressure on. Real-time play, instant updates.
          </p>
        </header>

        <section className="grid gap-8 rounded-3xl border border-zinc-200 bg-white/80 p-8 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.6)] backdrop-blur">
          <div className="flex flex-col gap-4">
            <label className="text-sm font-medium text-zinc-600">
              Display name
            </label>
            <Input
              placeholder="Detective Sam"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="max-w-sm"
            />
          </div>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-end">
            <div className="flex flex-1 flex-col gap-3">
              <p className="text-sm font-medium text-zinc-600">Start a new lobby</p>
              <Button
                onClick={handleCreate}
                disabled={!trimmedName}
                className="h-12 w-full rounded-full bg-zinc-900 text-base text-white shadow-lg shadow-zinc-900/20 hover:bg-zinc-800"
              >
                Create Lobby
              </Button>
            </div>

            <div className="flex flex-1 flex-col gap-3">
              <p className="text-sm font-medium text-zinc-600">Join existing lobby</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  placeholder="ABC123"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="h-12 sm:max-w-[160px]"
                />
                <Button
                  onClick={handleJoin}
                  disabled={!trimmedName || joinCode.trim().length !== 6}
                  className="h-12 flex-1 rounded-full border border-zinc-200 bg-white text-base text-zinc-900 hover:bg-zinc-100"
                >
                  Join Lobby
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 text-sm text-zinc-600 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200/80 bg-white/70 p-4">
            <p className="font-semibold text-zinc-800">Live roles</p>
            <p>Auto-assigned Mafia, Doctor, Sheriff, and Citizens.</p>
          </div>
          <div className="rounded-2xl border border-zinc-200/80 bg-white/70 p-4">
            <p className="font-semibold text-zinc-800">AI pressure</p>
            <p>Bots respond in real time using Gemini 2.5 Flash.</p>
          </div>
          <div className="rounded-2xl border border-zinc-200/80 bg-white/70 p-4">
            <p className="font-semibold text-zinc-800">Instant sync</p>
            <p>Convex keeps every player updated without refresh.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
