"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export default function GamePage() {
  const { code } = useParams();
  const router = useRouter();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  const [playerId, setPlayerId] = useState<Id<"players"> | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);

  useEffect(() => {
    const storedPlayerId = localStorage.getItem("playerId");
    const storedToken = localStorage.getItem("sessionToken");
    if (storedPlayerId) setPlayerId(storedPlayerId as Id<"players">);
    if (storedToken) setSessionToken(storedToken);
  }, []);

  const game = useQuery(api.games.getByCode, { code: code as string });
  const players = useQuery(
    api.players.getByGame,
    game ? { gameId: game._id } : "skip"
  );

  const self = useQuery(
    api.players.getSelf,
    playerId && sessionToken ? { playerId, sessionToken } : "skip"
  );

  const spectatorPlayers = useQuery(
    api.players.getPlayersWithRoles,
    game && playerId && sessionToken && (self?.isSpectator || game.status === "finished")
      ? { gameId: game._id, playerId, sessionToken }
      : "skip"
  );

  const chatMessages = useQuery(
    api.chat.getMessages,
    game && self !== undefined
      ? { gameId: game._id, isSpectatorChat: self?.isSpectator ?? false }
      : "skip"
  );

  const votes = useQuery(
    api.votes.getVotes,
    game && game.phase === "day_voting"
      ? { gameId: game._id, dayNumber: game.dayNumber ?? 1 }
      : "skip"
  );

  const nightActions = useQuery(
    api.actions.getNightActionsSummary,
    game && self?.isSpectator
      ? { gameId: game._id, dayNumber: game.dayNumber ?? 1 }
      : "skip"
  );

  // Get mafia team list for filtering night targets (only for mafia players)
  const mafiaTeam = useQuery(
    api.players.getMafiaTeam,
    game && playerId && sessionToken && self?.role === "mafia"
      ? { gameId: game._id, playerId, sessionToken }
      : "skip"
  );

  // Get sheriff investigation results
  const sheriffReveals = useQuery(
    api.players.getSheriffReveals,
    game && playerId && sessionToken && self?.role === "sheriff"
      ? { gameId: game._id, playerId, sessionToken }
      : "skip"
  );

  const sendMessage = useMutation(api.chat.sendMessage);
  const submitVote = useMutation(api.votes.submitVote);
  const submitNightAction = useMutation(api.actions.submitNightAction);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Real-time phase timer - must be before any early returns
  useEffect(() => {
    if (!game?.phaseEndTime) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((game.phaseEndTime! - now) / 1000));
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      setTimeRemaining(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    updateTimer(); // Initial update
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [game?.phaseEndTime]);

  if (game === undefined || self === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fef3c7,transparent_45%),radial-gradient(circle_at_bottom,#dbeafe,transparent_45%)]">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (game === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fef3c7,transparent_45%),radial-gradient(circle_at_bottom,#dbeafe,transparent_45%)]">
        <p className="text-zinc-500">Game not found.</p>
      </div>
    );
  }

  const isSpectator = self?.isSpectator ?? false;
  const isGameOver = game.status === "finished";
  const roster = (isSpectator || isGameOver) ? spectatorPlayers ?? players ?? [] : players ?? [];


  if (isGameOver) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fef3c7,transparent_45%),radial-gradient(circle_at_bottom,#dbeafe,transparent_45%)] flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white/80 border-zinc-200 shadow-xl backdrop-blur">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-zinc-900">
              {game.winner === "mafia" ? "🔪 Mafia Wins!" : "🏆 Town Wins!"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-zinc-600">
              {game.winner === "mafia"
                ? "The Mafia has successfully eliminated the town."
                : "The town has eliminated all Mafia members!"}
            </p>

            <div className="space-y-2">
              <h3 className="font-semibold text-center text-zinc-800">Final Roles:</h3>
              {roster.map((p: any) => (
                <div
                  key={p._id}
                  className="flex items-center justify-between rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2"
                >
                  <span className={p.isAlive ? "text-zinc-800" : "text-zinc-400 line-through"}>
                    {p.name}
                  </span>
                  <Badge
                    variant={p.role === "mafia" ? "destructive" : "secondary"}
                    className="capitalize"
                  >
                    {p.role ?? "unknown"}
                  </Badge>
                </div>
              ))}
            </div>

            <Button onClick={() => router.push("/")} className="w-full h-12 rounded-full bg-zinc-900 text-white hover:bg-zinc-800" size="lg">
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fef3c7,transparent_45%),radial-gradient(circle_at_bottom,#dbeafe,transparent_45%)] p-4">
      <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-7xl flex-col gap-4">
        {/* Header Bar */}
        <div className="flex items-center justify-between rounded-2xl border border-zinc-200/80 bg-white/70 backdrop-blur px-5 py-3 shadow-sm">
          <div className="flex items-center gap-4">
            <Badge
              className={`px-4 py-1.5 text-base font-semibold ${game.phase === "night"
                ? "bg-indigo-600 text-white"
                : game.phase === "day_voting"
                  ? "bg-amber-500 text-white"
                  : "bg-emerald-500 text-white"
                }`}
            >
              {game.phase === "night"
                ? "🌙 Night"
                : game.phase === "day_discussion"
                  ? "☀️ Discussion"
                  : game.phase === "day_voting"
                    ? "🗳️ Voting"
                    : game.phase}
            </Badge>
            <span className="text-sm font-medium text-zinc-500">Day {game.dayNumber ?? 1}</span>

            {/* Phase Timer */}
            {timeRemaining && (
              <div className="flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1">
                <span className="text-sm font-mono font-bold text-zinc-700">⏱️ {timeRemaining}</span>
              </div>
            )}
          </div>

          {self && (
            <div className="flex items-center gap-3">
              <span className="font-medium text-zinc-700">{self.name}</span>
              {self.role && !isSpectator && (
                <Badge className="capitalize bg-zinc-900 text-white">
                  {self.role}
                </Badge>
              )}
              {isSpectator && <Badge variant="destructive">Spectating</Badge>}
            </div>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="grid flex-1 min-h-0 grid-cols-12 gap-4">
          {/* Left Column - Players */}
          <div className="col-span-3 flex flex-col gap-4 overflow-hidden">
            <Card className="flex-1 border-zinc-200/80 bg-white/70 backdrop-blur overflow-hidden flex flex-col shadow-sm">
              <CardHeader className="py-3 flex-shrink-0 border-b border-zinc-100">
                <CardTitle className="text-sm font-semibold text-zinc-800">
                  👥 Players ({players?.filter((p) => p.isAlive).length ?? 0}/
                  {players?.length ?? 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="space-y-1 pr-2">
                    {roster.map((p: any) => (
                      <div
                        key={p._id}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 transition-colors ${p.isAlive
                          ? "bg-zinc-50 hover:bg-zinc-100 border border-zinc-100"
                          : "bg-zinc-100/50 opacity-50"
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          {!p.isAlive && <span>💀</span>}
                          <span className={`font-medium ${p.isAlive ? "text-zinc-800" : "line-through text-zinc-400"}`}>
                            {p.name}
                          </span>
                          {p.isBot && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0 text-sky-600 border-sky-300">
                              Bot
                            </Badge>
                          )}
                        </div>

                        {isSpectator && p.role && (
                          <Badge
                            variant={p.role === "mafia" ? "destructive" : "secondary"}
                            className="text-xs capitalize"
                          >
                            {p.role}
                          </Badge>
                        )}

                        {game.phase === "day_voting" && votes && (
                          <span className="text-xs text-amber-600 font-semibold">
                            {votes.filter((v) => v.targetId === p._id).length} votes
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {isSpectator && game.phase === "night" && (
              <Card className="border-zinc-200/80 bg-white/70 backdrop-blur shadow-sm">
                <CardHeader className="py-3 border-b border-zinc-100">
                  <CardTitle className="text-sm font-semibold text-zinc-800">🌙 Night Actions</CardTitle>
                </CardHeader>
                <CardContent className="p-2 text-sm">
                  {nightActions?.length ? (
                    <div className="space-y-1">
                      {nightActions.map((action: any, index: number) => (
                        <div key={index} className="text-zinc-700 py-1">
                          <span className="font-medium text-zinc-900">{action.playerName}</span>
                          <span className="text-zinc-500"> ({action.role}) → </span>
                          <span className="text-zinc-800">{action.targetName}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-zinc-400 py-2">Waiting for actions...</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Center Column - Chat */}
          <div className="col-span-6 flex min-h-0 flex-col overflow-hidden">
            <Card className="flex-1 flex flex-col border-zinc-200/80 bg-white/70 backdrop-blur overflow-hidden shadow-sm">
              <CardHeader className="flex-shrink-0 py-3 border-b border-zinc-100">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                  💬 {isSpectator ? "Spectator Chat" : "Town Square"}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
                <ScrollArea className="flex-1 px-4">
                  <div className="space-y-2 py-3">
                    {chatMessages?.map((msg: any) => (
                      <div
                        key={msg._id}
                        className={`rounded-xl px-3 py-2 ${msg.playerId === playerId
                          ? "ml-8 bg-blue-100 border border-blue-200"
                          : "mr-8 bg-zinc-50 border border-zinc-100"
                          }`}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span
                            className={`text-sm font-semibold ${msg.isBot ? "text-sky-600" : "text-zinc-800"
                              }`}
                          >
                            {msg.playerName}
                          </span>
                          {msg.isBot && (
                            <Badge variant="outline" className="py-0 text-xs text-sky-600 border-sky-300">
                              Bot
                            </Badge>
                          )}
                          <span className="text-xs text-zinc-400">
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-700">{msg.content}</p>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                </ScrollArea>

                {!isSpectator && game.phase?.includes("day") && (
                  <div className="flex-shrink-0 border-t border-zinc-100 p-3 bg-zinc-50/50">
                    <form
                      onSubmit={async (event) => {
                        event.preventDefault();
                        if (!message.trim() || !playerId || !sessionToken || !game._id) return;
                        await sendMessage({
                          gameId: game._id,
                          playerId,
                          sessionToken,
                          content: message,
                          isSpectatorChat: false,
                        });
                        setMessage("");
                      }}
                      className="flex gap-2"
                    >
                      <Input
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 border-zinc-200 bg-white"
                      />
                      <Button type="submit" size="sm" className="bg-zinc-900 text-white hover:bg-zinc-800">
                        Send
                      </Button>
                    </form>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Actions */}
          <div className="col-span-3 flex flex-col gap-4 overflow-y-auto">
            {/* NIGHT ACTION PANEL */}
            {game.phase === "night" && !isSpectator && self?.isAlive && (
              <Card className="border-zinc-200/80 bg-white/70 backdrop-blur shadow-sm">
                <CardHeader className="py-3 border-b border-zinc-100">
                  <CardTitle className="text-sm font-semibold text-zinc-800">
                    🌙 {self.role === "mafia" ? "Choose Kill Target" :
                      self.role === "doctor" ? "Choose Who to Protect" :
                        self.role === "sheriff" ? "Choose Who to Investigate" :
                          "Night Phase"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  {self.role && self.role !== "citizen" ? (
                    <div className="space-y-1">
                      {players
                        ?.filter((p) => {
                          if (!p.isAlive) return false;
                          // Mafia can't target fellow mafia - use mafiaTeam IDs
                          if (self.role === "mafia") {
                            const mafiaIds = mafiaTeam?.map(m => m._id) ?? [];
                            if (mafiaIds.includes(p._id)) return false;
                          }
                          // Sheriff can't investigate self
                          if (self.role === "sheriff" && p._id === playerId) return false;
                          return true;
                        })
                        .map((p) => (
                          <Button
                            key={p._id}
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-zinc-800 hover:bg-zinc-100"
                            onClick={async () => {
                              if (!game._id || !playerId || !sessionToken) return;
                              await submitNightAction({
                                gameId: game._id,
                                playerId,
                                sessionToken,
                                targetId: p._id,
                              });
                              toast.success(`Action submitted: ${self.role === "mafia" ? "Targeting" : self.role === "doctor" ? "Protecting" : "Investigating"} ${p.name}`);
                            }}
                          >
                            {self.role === "mafia" ? "🔪 " :
                              self.role === "doctor" ? "💉 " :
                                self.role === "sheriff" ? "🔍 " : ""}
                            {p.name}
                          </Button>
                        ))}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-zinc-500">
                      <p className="text-2xl mb-2">😴</p>
                      <p className="text-sm text-zinc-600">You have no night action.</p>
                      <p className="text-xs mt-1 text-zinc-400">Wait for day to resume...</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* VOTING PANEL */}
            {game.phase === "day_voting" && !isSpectator && self?.isAlive && (
              <Card className="border-zinc-200/80 bg-white/70 backdrop-blur shadow-sm">
                <CardHeader className="py-3 border-b border-zinc-100">
                  <CardTitle className="text-sm font-semibold text-zinc-800">🗳️ Cast Your Vote</CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <div className="space-y-1">
                    {players
                      ?.filter((p) => p.isAlive && p._id !== playerId)
                      .map((p) => (
                        <Button
                          key={p._id}
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-zinc-700 hover:bg-zinc-100"
                          onClick={async () => {
                            if (!game._id || !playerId || !sessionToken) return;
                            await submitVote({
                              gameId: game._id,
                              voterId: playerId,
                              sessionToken,
                              targetId: p._id,
                            });
                            toast.success(`Vote cast for ${p.name}`);
                          }}
                        >
                          Vote for {p.name}
                        </Button>
                      ))}
                    <Separator className="my-2" />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                      onClick={async () => {
                        if (!game._id || !playerId || !sessionToken) return;
                        await submitVote({
                          gameId: game._id,
                          voterId: playerId,
                          sessionToken,
                        });
                        toast.info("Vote skipped");
                      }}
                    >
                      Skip Vote
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {isSpectator && game.phase === "day_voting" && (
              <Card className="border-zinc-200/80 bg-white/70 backdrop-blur shadow-sm">
                <CardHeader className="py-3 border-b border-zinc-100">
                  <CardTitle className="text-sm font-semibold text-zinc-800">🗳️ Live Votes</CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <ScrollArea className="max-h-48">
                    <div className="space-y-1 text-sm">
                      {votes?.map((vote: any) => (
                        <div key={vote._id} className="flex justify-between text-zinc-700">
                          <span className="font-medium">{vote.voterName}</span>
                          <span className="text-zinc-400">→</span>
                          <span className="text-amber-600 font-medium">{vote.targetName ?? "Skip"}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {self?.role && !isSpectator && (
              <Card className="border-zinc-200/80 bg-white/70 backdrop-blur shadow-sm">
                <CardHeader className="py-3 border-b border-zinc-100">
                  <CardTitle className="text-sm font-semibold text-zinc-800">Your Role</CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  <div className="text-center">
                    <Badge
                      className={`px-4 py-2 text-lg capitalize ${self.role === "mafia" ? "bg-red-500 text-white" : "bg-zinc-900 text-white"}`}
                    >
                      {self.role}
                    </Badge>
                    <p className="mt-2 text-xs text-zinc-500">
                      {self.role === "mafia" && "Kill a player each night. Don't get caught!"}
                      {self.role === "doctor" && "Protect one player each night."}
                      {self.role === "sheriff" && "Investigate one player each night."}
                      {self.role === "citizen" && "Vote wisely to find the Mafia!"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Sheriff Investigation Results */}
            {self?.role === "sheriff" && sheriffReveals && sheriffReveals.length > 0 && (
              <Card className="border-zinc-200/80 bg-white/70 backdrop-blur shadow-sm">
                <CardHeader className="py-3 border-b border-zinc-100">
                  <CardTitle className="text-sm font-semibold text-zinc-800">🔍 Investigation Results</CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <div className="space-y-2">
                    {sheriffReveals.map((reveal: any) => (
                      <div
                        key={reveal._id}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 ${reveal.isMafia ? "bg-red-50 border border-red-200" : "bg-emerald-50 border border-emerald-200"}`}
                      >
                        <span className="font-medium">{reveal.targetName}</span>
                        <Badge variant={reveal.isMafia ? "destructive" : "secondary"}>
                          {reveal.isMafia ? "🔪 MAFIA" : "✓ Not Mafia"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Mafia Team (for Mafia players) */}
            {self?.role === "mafia" && mafiaTeam && mafiaTeam.length > 1 && (
              <Card className="border-red-200 bg-red-50/70 backdrop-blur shadow-sm">
                <CardHeader className="py-3 border-b border-red-100">
                  <CardTitle className="text-sm font-semibold text-red-700">🔪 Your Mafia Team</CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <div className="space-y-1">
                    {mafiaTeam.map((m: any) => (
                      <div key={m._id} className="text-sm text-red-800 px-2 py-1 font-medium">
                        {m.name} {m._id === playerId && "(You)"}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {isSpectator && (
              <Card className="flex-1 border-zinc-200/80 bg-white/70 backdrop-blur shadow-sm">
                <CardHeader className="py-3 border-b border-zinc-100">
                  <CardTitle className="text-sm font-semibold text-zinc-800">📜 Game Log</CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <ScrollArea className="h-32">
                    <div className="space-y-1 text-xs text-zinc-600">
                      {game.lastNightResult && <p className="py-1">{game.lastNightResult}</p>}
                      {game.lastDayResult && <p className="py-1">{game.lastDayResult}</p>}
                      {!game.lastNightResult && !game.lastDayResult && <p className="text-zinc-400">No events yet</p>}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
