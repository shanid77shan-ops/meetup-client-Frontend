"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function generateRoomCode() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [tab, setTab] = useState<"create" | "join">("create");
  const [error, setError] = useState("");

  const handleCreate = () => {
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    const code = generateRoomCode();
    router.push(`/room/${code}?name=${encodeURIComponent(name.trim())}`);
  };

  const handleJoin = () => {
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!roomCode.trim()) {
      setError("Please enter a room code.");
      return;
    }
    router.push(
      `/room/${roomCode.trim().toLowerCase()}?name=${encodeURIComponent(name.trim())}`
    );
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="mb-10 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.889L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">见面</h1>
        </div>
        <p className="text-gray-400 text-sm">
          Free video meetings — no account required
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-[#1a1a1a] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-white/10">
          <button
            onClick={() => { setTab("create"); setError(""); }}
            className={`flex-1 py-4 text-sm font-medium transition-colors ${
              tab === "create"
                ? "text-white border-b-2 border-blue-500 bg-white/5"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Create Meeting
          </button>
          <button
            onClick={() => { setTab("join"); setError(""); }}
            className={`flex-1 py-4 text-sm font-medium transition-colors ${
              tab === "join"
                ? "text-white border-b-2 border-blue-500 bg-white/5"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Join Meeting
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Name input */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">
              Your name
            </label>
            <input
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && (tab === "create" ? handleCreate() : handleJoin())}
              className="w-full bg-[#252525] border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Room code (join tab only) */}
          {tab === "join" && (
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                Room code
              </label>
              <input
                type="text"
                placeholder="Enter room code"
                value={roomCode}
                onChange={(e) => { setRoomCode(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                className="w-full bg-[#252525] border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors font-mono"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          {/* Action button */}
          <button
            onClick={tab === "create" ? handleCreate : handleJoin}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {tab === "create" ? "Create & Join Meeting" : "Join Meeting"}
          </button>

          {tab === "create" && (
            <p className="text-center text-xs text-gray-500">
              A unique room code will be generated for you to share.
            </p>
          )}
        </div>
      </div>

      <p className="mt-8 text-xs text-gray-600">
        Up to 10 participants per room · No sign-up required
      </p>
    </main>
  );
}
