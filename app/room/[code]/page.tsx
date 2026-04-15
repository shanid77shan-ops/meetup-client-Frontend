"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  `http://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:4000`;

interface Peer {
  id: string;
  name: string;
  stream?: MediaStream;
  pc: RTCPeerConnection;
  audio: boolean;
  video: boolean;
}

interface ChatMessage {
  id: string;
  name: string;
  message: string;
  timestamp: string;
  self: boolean;
}

function createPeerConnection(
  remoteId: string,
  localStream: MediaStream,
  socket: Socket,
  roomCode: string,
  onStream: (id: string, stream: MediaStream) => void
): RTCPeerConnection {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  });

  // Add local tracks
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", { to: remoteId, candidate: event.candidate });
    }
  };

  // Remote stream
  pc.ontrack = (event) => {
    onStream(remoteId, event.streams[0]);
  };

  return pc;
}

function VideoTile({
  stream,
  name,
  muted = false,
  audioOn = true,
  videoOn = true,
}: {
  stream?: MediaStream;
  name: string;
  muted?: boolean;
  audioOn?: boolean;
  videoOn?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative bg-[#1a1a1a] rounded-xl overflow-hidden aspect-video flex items-center justify-center">
      {stream && videoOn ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-xl font-bold">
            {initials}
          </div>
          <span className="text-gray-400 text-sm">Camera off</span>
        </div>
      )}
      {/* Name badge */}
      <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1.5">
        {!audioOn && (
          <svg className="w-3 h-3 text-red-400" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M5.293 5.293a1 1 0 011.414 0L10 8.586l3.293-3.293a1 1 0 111.414 1.414L11.414 10l3.293 3.293a1 1 0 01-1.414 1.414L10 11.414l-3.293 3.293a1 1 0 01-1.414-1.414L8.586 10 5.293 6.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {name}
      </div>
    </div>
  );
}

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomCode = params.code as string;
  const userName = searchParams.get("name") || "Guest";

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, Peer>>(new Map());

  const [peers, setPeers] = useState<Peer[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [unread, setUnread] = useState(0);
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [roomFull, setRoomFull] = useState(false);

  const updatePeerState = useCallback(() => {
    setPeers(Array.from(peersRef.current.values()));
  }, []);

  const onRemoteStream = useCallback(
    (id: string, stream: MediaStream) => {
      const peer = peersRef.current.get(id);
      if (peer) {
        peer.stream = stream;
        updatePeerState();
      }
    },
    [updatePeerState]
  );

  useEffect(() => {
    let stream: MediaStream;
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    const init = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);

        socket.emit("join-room", { roomCode, userName });
      } catch (err) {
        console.error("Media error:", err);
        // Try audio only
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          localStreamRef.current = stream;
          setLocalStream(stream);
          setVideoOn(false);
          socket.emit("join-room", { roomCode, userName });
        } catch {
          socket.emit("join-room", { roomCode, userName });
        }
      }
    };

    init();

    socket.on("room-full", () => {
      setRoomFull(true);
    });

    // Existing users → initiate offers
    socket.on("existing-users", async (users: { id: string; name: string }[]) => {
      for (const user of users) {
        const pc = createPeerConnection(
          user.id,
          localStreamRef.current || new MediaStream(),
          socket,
          roomCode,
          onRemoteStream
        );
        peersRef.current.set(user.id, {
          id: user.id,
          name: user.name,
          pc,
          audio: true,
          video: true,
        });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { to: user.id, offer });
      }
      updatePeerState();
    });

    // New user joined → wait for their offer
    socket.on("user-joined", ({ id, name }: { id: string; name: string }) => {
      if (!peersRef.current.has(id)) {
        const pc = createPeerConnection(
          id,
          localStreamRef.current || new MediaStream(),
          socket,
          roomCode,
          onRemoteStream
        );
        peersRef.current.set(id, { id, name, pc, audio: true, video: true });
        updatePeerState();
      }
    });

    // Receive offer → answer
    socket.on("offer", async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
      let peer = peersRef.current.get(from);
      if (!peer) {
        const pc = createPeerConnection(
          from,
          localStreamRef.current || new MediaStream(),
          socket,
          roomCode,
          onRemoteStream
        );
        peer = { id: from, name: "Guest", pc, audio: true, video: true };
        peersRef.current.set(from, peer);
        updatePeerState();
      }
      await peer.pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      socket.emit("answer", { to: from, answer });
    });

    // Receive answer
    socket.on("answer", async ({ from, answer }: { from: string; answer: RTCSessionDescriptionInit }) => {
      const peer = peersRef.current.get(from);
      if (peer) {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    // ICE candidate
    socket.on("ice-candidate", async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      const peer = peersRef.current.get(from);
      if (peer) {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error("ICE error:", e);
        }
      }
    });

    // User left
    socket.on("user-left", ({ id }: { id: string }) => {
      const peer = peersRef.current.get(id);
      if (peer) {
        peer.pc.close();
        peersRef.current.delete(id);
        updatePeerState();
      }
    });

    // Chat
    socket.on("chat-message", (msg: Omit<ChatMessage, "self">) => {
      setMessages((prev) => [...prev, { ...msg, self: msg.id === socket.id }]);
      if (!chatOpen) setUnread((u) => u + 1);
    });

    // Media state
    socket.on("media-state", ({ id, audio, video }: { id: string; audio: boolean; video: boolean }) => {
      const peer = peersRef.current.get(id);
      if (peer) {
        peer.audio = audio;
        peer.video = video;
        updatePeerState();
      }
    });

    return () => {
      socket.disconnect();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      peersRef.current.forEach((p) => p.pc.close());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, userName]);

  useEffect(() => {
    if (chatOpen) {
      setUnread(0);
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatOpen, messages]);

  const toggleAudio = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setAudioOn(track.enabled);
      socketRef.current?.emit("media-state", {
        roomCode,
        audio: track.enabled,
        video: videoOn,
      });
    }
  };

  const toggleVideo = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setVideoOn(track.enabled);
      socketRef.current?.emit("media-state", {
        roomCode,
        audio: audioOn,
        video: track.enabled,
      });
    }
  };

  const sendChat = () => {
    const msg = chatInput.trim();
    if (!msg) return;
    socketRef.current?.emit("chat-message", { roomCode, message: msg });
    setChatInput("");
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const leaveRoom = () => {
    socketRef.current?.disconnect();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    router.push("/");
  };

  if (roomFull) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Room is Full</h2>
          <p className="text-gray-400 mb-6">This room already has 10 participants.</p>
          <button
            onClick={() => router.push("/")}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const allTiles = [
    { id: "local", name: `${userName} (You)`, stream: localStream ?? undefined, audioOn, videoOn, muted: true },
    ...peers.map((p) => ({ id: p.id, name: p.name, stream: p.stream, audioOn: p.audio, videoOn: p.video, muted: false })),
  ];

  const gridCols =
    allTiles.length === 1
      ? "grid-cols-1"
      : allTiles.length === 2
      ? "grid-cols-2"
      : allTiles.length <= 4
      ? "grid-cols-2"
      : allTiles.length <= 6
      ? "grid-cols-3"
      : "grid-cols-4";

  return (
    <div className="flex h-screen bg-[#0f0f0f] overflow-hidden">
      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.889L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <span className="font-semibold text-sm">MeetUp</span>
          </div>
          <button
            onClick={copyRoomCode}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg text-xs text-gray-300 transition-colors"
          >
            <span className="font-mono">{roomCode}</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {copied && <span className="text-green-400">Copied!</span>}
          </button>
          <span className="text-xs text-gray-500">{allTiles.length} participant{allTiles.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Video grid */}
        <div className={`flex-1 grid ${gridCols} gap-3 p-4 overflow-auto`}>
          {allTiles.map((tile) => (
            <VideoTile
              key={tile.id}
              stream={tile.stream}
              name={tile.name}
              muted={tile.muted}
              audioOn={tile.audioOn}
              videoOn={tile.videoOn}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 py-4 border-t border-white/10">
          {/* Mic */}
          <button
            onClick={toggleAudio}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              audioOn ? "bg-white/10 hover:bg-white/20" : "bg-red-600 hover:bg-red-700"
            }`}
            title={audioOn ? "Mute" : "Unmute"}
          >
            {audioOn ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )}
          </button>

          {/* Camera */}
          <button
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              videoOn ? "bg-white/10 hover:bg-white/20" : "bg-red-600 hover:bg-red-700"
            }`}
            title={videoOn ? "Turn off camera" : "Turn on camera"}
          >
            {videoOn ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.889L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            )}
          </button>

          {/* Chat */}
          <button
            onClick={() => setChatOpen((o) => !o)}
            className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              chatOpen ? "bg-blue-600 hover:bg-blue-700" : "bg-white/10 hover:bg-white/20"
            }`}
            title="Chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {unread > 0 && !chatOpen && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center font-bold">
                {unread}
              </span>
            )}
          </button>

          {/* Leave */}
          <button
            onClick={leaveRoom}
            className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors"
            title="Leave meeting"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 17l5-5m0 0l-5-5m5 5H9m3 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h3a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Chat sidebar */}
      {chatOpen && (
        <div className="w-80 flex flex-col border-l border-white/10 bg-[#141414]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h2 className="font-semibold text-sm">In-call messages</h2>
            <button onClick={() => setChatOpen(false)} className="text-gray-400 hover:text-white">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-gray-500 text-xs text-center mt-8">No messages yet. Say hi!</p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.self ? "items-end" : "items-start"}`}>
                <span className="text-xs text-gray-500 mb-1">{msg.name}</span>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                    msg.self
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-white/10 text-white rounded-bl-sm"
                  }`}
                >
                  {msg.message}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-white/10 flex gap-2">
            <input
              type="text"
              placeholder="Send a message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={sendChat}
              className="bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-2 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
