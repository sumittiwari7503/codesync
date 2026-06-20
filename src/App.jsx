import { useState, useEffect, useRef, useCallback } from "react";
import MonacoEditor from "@monaco-editor/react";

// ─── Default Workspace Files ──────────────────────────────────────────────────
const DEFAULT_FILES = {
  "index.html": {
    name: "index.html",
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CodeSync Demo</title>
  <style>
    body {
      background: #0f0f1b;
      color: #f8fafc;
      font-family: 'Plus Jakarta Sans', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 90vh;
      margin: 0;
    }
    h1 {
      color: #8b5cf6;
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      text-shadow: 0 0 20px rgba(139, 92, 246, 0.4);
    }
    p {
      color: #94a3b8;
      font-size: 1.1rem;
      margin-bottom: 1.5rem;
    }
    button {
      background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(139, 92, 246, 0.3);
      transition: all 0.2s ease;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(139, 92, 246, 0.5);
    }
  </style>
</head>
<body>
  <h1>Hello from CodeSync!</h1>
  <p>Real-time collaborative editing playground.</p>
  <button id="actionBtn">Click to test console</button>
</body>
</html>`,
    language: "html"
  },
  "styles.css": {
    name: "styles.css",
    content: `/* Add CSS rules here to customize styling */
h1 {
  background: linear-gradient(to right, #8b5cf6, #10b981);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}`,
    language: "css"
  },
  "script.js": {
    name: "script.js",
    content: `// Add interactivity here
console.log("Welcome to CodeSync Live Console!");

const button = document.getElementById("actionBtn");
button.addEventListener("click", () => {
  console.log("Action button clicked!");
  const colors = ["#8b5cf6", "#10b981", "#3b82f6", "#ef4444", "#f59e0b"];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  document.body.style.background = randomColor + "22";
  console.log("Changed background tint to " + randomColor);
});`,
    language: "javascript"
  }
};

const LANG_STARTERS = {
  javascript: `// JavaScript Code\nfunction greet(name) {\n  return \`Hello, \${name}!\`;\n}\nconsole.log(greet("Developer"));\n`,
  python: `# Python Code\ndef greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("Developer"))\n`,
  java: `// Java Code\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, Developer!");\n    }\n}\n`,
  cpp: `// C++ Code\n#include <iostream>\nusing namespace std;\nint main() {\n    cout << "Hello, Developer!" << endl;\n    return 0;\n}\n`,
  typescript: `// TypeScript Code\nconst greet = (name: string): string => {\n  return \`Hello, \${name}!\`;\n};\nconsole.log(greet("Developer"));\n`,
  html: `<!DOCTYPE html>\n<html>\n<body>\n  <h1>Hello World</h1>\n</body>\n</html>`,
  css: `/* CSS */\nbody {\n  background: #12121e;\n  color: #fff;\n}`,
  json: `{\n  "name": "codesync-project",\n  "version": "1.0.0"\n}`
};

// ─── Simulated WebSocket Broker ───────────────────────────────────────────────
const rooms = {};

function getRoom(id) {
  if (!rooms[id]) {
    rooms[id] = {
      files: JSON.parse(JSON.stringify(DEFAULT_FILES)),
      users: {},
      listeners: [],
      chatHistory: []
    };
  }
  return rooms[id];
}

function joinRoom(roomId, userId, userName, color, onEvent) {
  const room = getRoom(roomId);
  
  // Save user details
  room.users[userId] = { name: userName, color, cursor: null };
  room.listeners.push({ userId, cb: onEvent });
  
  // Notify other users
  setTimeout(() => {
    broadcast(roomId, {
      type: "USER_JOIN",
      userId,
      userName,
      color,
      users: { ...room.users }
    });
  }, 50);

  return {
    sendCode: (fileName, code) => {
      if (room.files[fileName]) {
        room.files[fileName].content = code;
      }
      room.listeners.forEach(({ userId: lid, cb }) => {
        if (lid !== userId) {
          cb({ type: "CODE_CHANGE", fileName, code, senderId: userId });
        }
      });
    },
    
    createFile: (fileName, content, language) => {
      room.files[fileName] = { name: fileName, content, language };
      broadcast(roomId, {
        type: "FILE_CREATE",
        fileName,
        content,
        language,
        senderId: userId
      });
    },
    
    renameFile: (oldName, newName, language) => {
      if (room.files[oldName]) {
        const file = room.files[oldName];
        room.files[newName] = { ...file, name: newName, language };
        delete room.files[oldName];
        broadcast(roomId, {
          type: "FILE_RENAME",
          oldName,
          newName,
          language,
          senderId: userId
        });
      }
    },
    
    deleteFile: (fileName) => {
      if (room.files[fileName]) {
        delete room.files[fileName];
        broadcast(roomId, {
          type: "FILE_DELETE",
          fileName,
          senderId: userId
        });
      }
    },
    
    sendChat: (msg) => {
      const chatItem = { type: "CHAT", userId, userName, color, msg, ts: Date.now() };
      room.chatHistory.push(chatItem);
      broadcast(roomId, chatItem);
    },
    
    sendReaction: (emoji) => {
      broadcast(roomId, {
        type: "REACTION",
        emoji,
        userId,
        userName,
        color,
        rxId: Math.random().toString(36).slice(2, 9)
      });
    },
    
    leave: () => {
      delete room.users[userId];
      room.listeners = room.listeners.filter(l => l.userId !== userId);
      broadcast(roomId, {
        type: "USER_LEAVE",
        userId,
        users: { ...room.users }
      });
    },
    
    getFiles: () => JSON.parse(JSON.stringify(room.files)),
    getUsers: () => ({ ...room.users }),
    getChatHistory: () => [...room.chatHistory]
  };
}

function broadcast(roomId, event) {
  const room = rooms[roomId];
  if (!room) return;
  room.listeners.slice().forEach(({ cb }) => {
    setTimeout(() => cb(event), 0);
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────
const COLORS = ["#8B5CF6", "#10B981", "#3B82F6", "#EC4899", "#F59E0B", "#EF4444", "#06B6D4", "#84CC16"];
const adjectives = ["Swift", "Cyber", "Clever", "Quantum", "Hyper", "Agile", "Pixel", "Solar"];
const animals = ["Falcon", "Otter", "Panda", "Matrix", "Phoenix", "Leopard", "Viper", "Aurora"];
const randomName = () => `${adjectives[Math.floor(Math.random() * 8)]} ${animals[Math.floor(Math.random() * 8)]}`;
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];
const uid = () => Math.random().toString(36).slice(2, 8);

const getLanguageForFile = (fileName) => {
  const ext = fileName.split(".").pop();
  switch (ext) {
    case "html": return "html";
    case "css": return "css";
    case "js": return "javascript";
    case "jsx": return "javascript";
    case "ts": return "typescript";
    case "tsx": return "typescript";
    case "py": return "python";
    case "json": return "json";
    case "java": return "java";
    case "cpp": return "cpp";
    case "c": return "cpp";
    default: return "plaintext";
  }
};

// ─── UI Icons ─────────────────────────────────────────────────────────────────
function Icon({ name, size = 16, color = "currentColor", style = {} }) {
  const icons = {
    plus: <path d="M12 5v14M5 12h14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />,
    trash: <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
    edit: <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
    share: <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
    chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
    terminal: <path d="M4 17l6-6-6-6M12 19h8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
    globe: <><circle cx="12" cy="12" r="10" strokeWidth="2" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>,
    users: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
    leave: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
    settings: <><circle cx="12" cy="12" r="3" strokeWidth="2" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>,
    file: <><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M13 2v7h7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>,
    play: <path d="M5 3l14 9-14 9V3z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" />,
    close: <path d="M18 6L6 18M6 6l12 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>,
    check: <path d="M20 6L9 17l-5-5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
    chevron: <path d="M6 9l6 6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
    logo: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" />
  };

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke={color} 
      style={style}
    >
      {icons[name] || null}
    </svg>
  );
}

// ─── CSS Styles ────────────────────────────────────────────────────────────────
const globalCSS = `
  /* Fonts & Root Elements */
  body {
    background: #06060c;
    color: #e2e8f0;
    font-family: 'Plus Jakarta Sans', sans-serif;
  }
  
  /* Scrollbar override */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.01);
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 3px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  /* Micro-Animations & Glows */
  .glow-container {
    position: relative;
  }
  .glow-container::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 16px;
    padding: 1px;
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(16, 185, 129, 0.2));
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
  }

  .glass-card {
    background: rgba(13, 13, 25, 0.7);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 16px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
  }

  .interactive-button {
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .interactive-button:hover {
    transform: translateY(-1.5px);
    box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);
  }
  .interactive-button:active {
    transform: translateY(0.5px);
  }

  /* React Floating Emoji Animation */
  @keyframes emojiRise {
    0% {
      transform: translateY(0) scale(0.5) rotate(0deg);
      opacity: 0;
    }
    10% {
      opacity: 1;
      transform: translateY(-20px) scale(1.2) rotate(10deg);
    }
    100% {
      transform: translateY(-200px) scale(0.7) rotate(-20deg);
      opacity: 0;
    }
  }
  .floating-reaction {
    position: fixed;
    bottom: 30px;
    right: 30px;
    font-size: 32px;
    pointer-events: none;
    animation: emojiRise 1.6s cubic-bezier(0.08, 0.82, 0.17, 1) forwards;
    z-index: 99999;
  }

  /* File Manager Styles */
  .file-tree-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s ease;
    border-left: 2px solid transparent;
  }
  .file-tree-item:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  .file-tree-item.active {
    background: rgba(139, 92, 246, 0.12);
    color: #8b5cf6;
    border-left-color: #8b5cf6;
  }

  /* CodeSync top navigation highlight */
  .nav-glow {
    position: relative;
    overflow: hidden;
  }
  .nav-glow::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 10%;
    right: 10%;
    height: 1px;
    background: linear-gradient(90deg, transparent, #8b5cf6, #10b981, transparent);
  }

  /* Input fields */
  input:focus, select:focus {
    border-color: #8b5cf6 !important;
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.25) !important;
  }
`;

// ─── S Styles Object (Premium Dark Theme) ─────────────────────────────────────
const S = {
  app: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#06060c",
    color: "#e2e8f0"
  },
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 20px",
    height: "56px",
    background: "#0c0c16",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)"
  },
  main: {
    display: "flex",
    flex: 1,
    height: "calc(100vh - 56px)",
    overflow: "hidden"
  },
  sidebar: {
    width: "240px",
    background: "#09090f",
    borderRight: "1px solid rgba(255, 255, 255, 0.05)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0
  },
  editorArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "#0e0e18"
  },
  chatPanel: {
    width: "280px",
    background: "#09090f",
    borderLeft: "1px solid rgba(255, 255, 255, 0.05)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0
  },
  previewPanel: {
    flex: 1,
    background: "#ffffff",
    borderLeft: "1px solid rgba(255, 255, 255, 0.05)",
    display: "flex",
    flexDirection: "column"
  },
  badge: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "6px",
    padding: "4px 10px",
    fontSize: "11px",
    fontWeight: "500",
    color: "#94a3b8"
  },
  btn: {
    background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "6px 14px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(139, 92, 246, 0.25)"
  },
  btnGhost: {
    background: "rgba(255,255,255,0.03)",
    color: "#94a3b8",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "6px",
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: "500",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px"
  },
  btnSuccess: {
    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "6px 14px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer"
  },
  btnDanger: {
    background: "rgba(239, 68, 68, 0.1)",
    color: "#ef4444",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    borderRadius: "6px",
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: "500",
    cursor: "pointer"
  },
  dot: (color) => ({
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: color,
    boxShadow: `0 0 10px ${color}`
  }),
  landing: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background: "radial-gradient(circle at top left, #120e2e 0%, #06060c 80%)",
    padding: "24px",
    position: "relative",
    overflow: "hidden"
  },
  landingBgCircle1: {
    position: "absolute",
    width: "400px",
    height: "400px",
    borderRadius: "50%",
    background: "rgba(139, 92, 246, 0.08)",
    filter: "blur(80px)",
    top: "-100px",
    left: "-50px",
    pointerEvents: "none"
  },
  landingBgCircle2: {
    position: "absolute",
    width: "500px",
    height: "500px",
    borderRadius: "50%",
    background: "rgba(16, 185, 129, 0.05)",
    filter: "blur(100px)",
    bottom: "-150px",
    right: "-50px",
    pointerEvents: "none"
  }
};

// ─── Landing Page Component ──────────────────────────────────────────────────
function Landing({ onJoin }) {
  const [tab, setTab] = useState("create");
  const [joinId, setJoinId] = useState("");
  const [name, setName] = useState(() => randomName());
  const [recentRooms, setRecentRooms] = useState([]);
  const colorRef = useRef(randomColor());

  // Check URL query parameters for auto-fill
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    if (roomParam) {
      setJoinId(roomParam);
      setTab("join");
    }

    // Load recent rooms
    const stored = localStorage.getItem("codesync_recent_rooms");
    if (stored) {
      try {
        setRecentRooms(JSON.parse(stored));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const handleAction = () => {
    const trimmedName = name.trim() || randomName();
    const finalRoomId = tab === "create" ? uid() : joinId.trim();
    if (!finalRoomId) return;

    // Save to recents
    const currentRecents = [...recentRooms];
    const index = currentRecents.findIndex(r => r.roomId === finalRoomId);
    if (index !== -1) currentRecents.splice(index, 1);
    currentRecents.unshift({
      roomId: finalRoomId,
      roomName: tab === "create" ? `${trimmedName}'s Workspace` : `Joined Room ${finalRoomId}`,
      timestamp: Date.now()
    });
    const updated = currentRecents.slice(0, 5); // Keep top 5
    setRecentRooms(updated);
    localStorage.setItem("codesync_recent_rooms", JSON.stringify(updated));

    onJoin(finalRoomId, trimmedName, colorRef.current);
  };

  const handleRecentClick = (room) => {
    setName(name.trim() || randomName());
    onJoin(room.roomId, name.trim() || randomName(), colorRef.current);
  };

  return (
    <div style={S.landing}>
      <style>{globalCSS}</style>
      <div style={S.landingBgCircle1} />
      <div style={S.landingBgCircle2} />

      <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%", maxWidth: "420px", zIndex: 10 }}>
        {/* Logo/Hero */}
        <div style={{ textAlign: "center" }} className="animate-fade-in">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "8px" }}>
            <div style={{ background: "rgba(139, 92, 246, 0.15)", borderRadius: "12px", padding: "10px", border: "1px solid rgba(139, 92, 246, 0.3)" }}>
              <Icon name="logo" size={32} color="#8b5cf6" />
            </div>
          </div>
          <h1 style={{ fontSize: "36px", fontWeight: "800", background: "linear-gradient(to right, #ffffff, #94a3b8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-1px" }}>
            CodeSync
          </h1>
          <p style={{ fontSize: "14px", color: "#64748b", marginTop: "4px" }}>
            Real-time Collaborative Workspace & Live Preview
          </p>
        </div>

        {/* Card */}
        <div className="glass-card glow-container animate-fade-in" style={{ padding: "36px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Tab Selector */}
          <div style={{ display: "flex", background: "rgba(0,0,0,0.25)", padding: "4px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.04)" }}>
            <button 
              onClick={() => setTab("create")} 
              style={{
                flex: 1, padding: "8px 0", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
                background: tab === "create" ? "rgba(139, 92, 246, 0.15)" : "transparent",
                color: tab === "create" ? "#a78bfa" : "#64748b",
                transition: "all 0.2s"
              }}
            >
              Create Room
            </button>
            <button 
              onClick={() => setTab("join")} 
              style={{
                flex: 1, padding: "8px 0", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
                background: tab === "join" ? "rgba(139, 92, 246, 0.15)" : "transparent",
                color: tab === "join" ? "#a78bfa" : "#64748b",
                transition: "all 0.2s"
              }}
            >
              Join Room
            </button>
          </div>

          {/* Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", letterSpacing: "1px", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                Your Name
              </label>
              <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "10px 14px", color: "#f8fafc", fontSize: "14px", fontFamily: "inherit", outline: "none" }}
                placeholder="Enter name..."
              />
            </div>

            {tab === "join" && (
              <div>
                <label style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", letterSpacing: "1px", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                  Room ID
                </label>
                <input 
                  type="text" 
                  value={joinId} 
                  onChange={(e) => setJoinId(e.target.value)} 
                  onKeyDown={(e) => e.key === "Enter" && joinId.trim() && handleAction()}
                  style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "10px 14px", color: "#f8fafc", fontSize: "14px", fontFamily: "inherit", outline: "none" }}
                  placeholder="Paste room code..."
                />
              </div>
            )}

            <button 
              className="interactive-button btn-primary" 
              style={{ width: "100%", padding: "12px", fontSize: "14px", borderRadius: "8px", fontWeight: "700", marginTop: "6px" }}
              onClick={handleAction}
              disabled={tab === "join" && !joinId.trim()}
            >
              {tab === "create" ? "Create Workspace →" : "Join Workspace →"}
            </button>
          </div>
        </div>

        {/* Recent Workspaces */}
        {recentRooms.length > 0 && (
          <div className="glass-card animate-fade-in" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", letterSpacing: "1px" }}>RECENT ROOMS</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {recentRooms.map((room) => (
                <div 
                  key={room.roomId}
                  onClick={() => handleRecentClick(room)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", transition: "all 0.2s" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "13px", fontWeight: "600", color: "#e2e8f0" }}>{room.roomName}</span>
                    <span style={{ fontSize: "11px", color: "#475569" }}>Code: {room.roomId}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#8b5cf6" }}>
                    <span>Rejoin</span>
                    <Icon name="plus" size={10} color="#8b5cf6" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Workspace Editor Component ───────────────────────────────────────────────
function EditorWorkspace({ roomId, userName, userColor, onLeave }) {
  const [files, setFiles] = useState({});
  const [activeFileName, setActiveFileName] = useState("");
  const [users, setUsers] = useState({});
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [output, setOutput] = useState([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  // Panel Toggles
  const [showChat, setShowChat] = useState(true);
  const [showOutput, setShowOutput] = useState(true);
  const [showPreview, setShowPreview] = useState(true);

  // File explorer controls
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileLang, setNewFileLang] = useState("javascript");
  const [editingFileName, setEditingFileName] = useState(null);
  const [editFileVal, setEditFileVal] = useState("");

  // Editor settings
  const [fontSize, setFontSize] = useState(14);
  const [wordWrap, setWordWrap] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Reaction engine
  const [reactions, setReactions] = useState([]);

  const connRef = useRef(null);
  const myIdRef = useRef(uid());
  const chatBottomRef = useRef(null);
  const previewTimeoutRef = useRef(null);

  // Sync ref to read active state inside callbacks safely
  const activeFileNameRef = useRef(activeFileName);
  useEffect(() => {
    activeFileNameRef.current = activeFileName;
  }, [activeFileName]);

  // Synchronize WebSocket connection
  useEffect(() => {
    const conn = joinRoom(roomId, myIdRef.current, userName, userColor, (event) => {
      switch (event.type) {
        case "CODE_CHANGE":
          setFiles(prev => {
            if (!prev[event.fileName]) return prev;
            return {
              ...prev,
              [event.fileName]: {
                ...prev[event.fileName],
                content: event.code
              }
            };
          });
          break;

        case "USER_JOIN":
        case "USER_LEAVE":
          setUsers({ ...event.users });
          break;

        case "CHAT":
          setChatMsgs(prev => [...prev, event]);
          break;

        case "REACTION":
          const offsetLeft = Math.floor(Math.random() * 80) + 10; // Random offset left (10%-90%)
          setReactions(prev => [
            ...prev,
            { id: event.rxId, emoji: event.emoji, left: `${offsetLeft}%` }
          ]);
          // Clean reaction animation after done
          setTimeout(() => {
            setReactions(prev => prev.filter(r => r.id !== event.rxId));
          }, 1700);
          break;

        case "FILE_CREATE":
          setFiles(prev => ({
            ...prev,
            [event.fileName]: {
              name: event.fileName,
              content: event.content,
              language: event.language
            }
          }));
          break;

        case "FILE_RENAME":
          setFiles(prev => {
            const updated = { ...prev };
            if (updated[event.oldName]) {
              updated[event.newName] = {
                ...updated[event.oldName],
                name: event.newName,
                language: event.language
              };
              delete updated[event.oldName];
            }
            
            // Auto switch active selection if renamed
            setTimeout(() => {
              setActiveFileName(active => active === event.oldName ? event.newName : active);
            }, 10);

            return updated;
          });
          break;

        case "FILE_DELETE":
          setFiles(prev => {
            const updated = { ...prev };
            delete updated[event.fileName];

            setTimeout(() => {
              setActiveFileName(active => {
                if (active === event.fileName) {
                  const remaining = Object.keys(updated);
                  return remaining.length > 0 ? remaining[0] : "";
                }
                return active;
              });
            }, 10);

            return updated;
          });
          break;

        default:
          break;
      }
    });

    connRef.current = conn;
    
    // Init state
    const initialFiles = conn.getFiles();
    setFiles(initialFiles);
    
    const fileKeys = Object.keys(initialFiles);
    if (fileKeys.length > 0) {
      setActiveFileName(fileKeys.includes("index.html") ? "index.html" : fileKeys[0]);
    }
    
    setUsers(conn.getUsers());
    setChatMsgs(conn.getChatHistory());

    return () => {
      conn.leave();
    };
  }, [roomId, userName, userColor]);

  // Handle messages sent from the Preview Iframe console
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data && e.data.type === "CONSOLE_LOG") {
        setOutput(prev => [...prev, { type: "out", text: e.data.text }]);
      }
      if (e.data && e.data.type === "CONSOLE_ERROR") {
        setOutput(prev => [...prev, { type: "err", text: e.data.text }]);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Auto scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs]);

  const handleEditorChange = (value) => {
    if (value === undefined || !activeFileName) return;

    // Local update
    setFiles(prev => {
      if (!prev[activeFileName]) return prev;
      return {
        ...prev,
        [activeFileName]: {
          ...prev[activeFileName],
          content: value
        }
      };
    });

    // Sync remote
    connRef.current?.sendCode(activeFileName, value);
  };

  // Run Code Command Execution
  const runCode = () => {
    if (!activeFileName) return;
    setRunning(true);
    
    const currentLang = files[activeFileName]?.language || "javascript";
    setOutput([{ type: "info", text: `▶ Executing ${activeFileName} (${currentLang})...` }]);

    setTimeout(() => {
      const code = files[activeFileName]?.content || "";
      const lines = [];

      try {
        if (currentLang === "javascript" || currentLang === "typescript") {
          const logs = [];
          const errors = [];
          const fakeConsole = {
            log: (...a) => logs.push(a.map(x => typeof x === "object" ? JSON.stringify(x) : String(x)).join(" ")),
            error: (...a) => errors.push(a.map(String).join(" ")),
            warn: (...a) => logs.push("⚠ " + a.map(String).join(" ")),
          };
          
          try {
            const fn = new Function("console", code);
            fn(fakeConsole);
          } catch (err) {
            lines.push({ type: "err", text: `RuntimeError: ${err.message}` });
          }
          
          logs.forEach(t => lines.push({ type: "out", text: t }));
          errors.forEach(t => lines.push({ type: "err", text: t }));
          
          if (!logs.length && !errors.length && !lines.length) {
            lines.push({ type: "info", text: "(Execution complete with no output)" });
          }
        } else if (currentLang === "python") {
          // Process prints
          const printRegex = /print\(([^)]+)\)/g;
          let match;
          let found = false;
          
          lines.push({ type: "info", text: `[docker://python-sandbox] spinning up container...` });
          lines.push({ type: "info", text: `[docker://python-sandbox] mounting ${activeFileName}...` });
          
          while ((match = printRegex.exec(code)) !== null) {
            found = true;
            let val = match[1].trim();
            val = val.replace(/^f["']|["']$/g, "").replace(/\{([^}]+)\}/g, "…");
            val = val.replace(/^["']|["']$/g, "");
            lines.push({ type: "out", text: val });
          }
          if (!found) {
            lines.push({ type: "info", text: `(Python script finished. No print statements detected.)` });
          }
        } else {
          // Standard compiler mock
          lines.push({ type: "info", text: `[sandbox://compile-system] compiling files...` });
          lines.push({ type: "out", text: `Compiled active code model: ${activeFileName}` });
          lines.push({ type: "info", text: `Execution ready. Use Live HTML preview for web renders.` });
        }
      } catch (err) {
        lines.push({ type: "err", text: `CompilerError: ${err.message}` });
      }

      const ms = (Math.random() * 100 + 40).toFixed(0);
      lines.push({ type: "done", text: `✓ Finished process in ${ms}ms` });
      
      setOutput(prev => [...prev, ...lines]);
      setRunning(false);
    }, 700);
  };

  // Build the unified source code block for previewing HTML + CSS + JS inside iframe
  const getPreviewSource = () => {
    const htmlCode = files["index.html"]?.content || "";
    const cssCode = files["styles.css"]?.content || "";
    const jsCode = files["script.js"]?.content || "";

    let source = htmlCode || `
      <!DOCTYPE html>
      <html>
      <body style="background: #090910; color: #64748b; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 90vh;">
        <p>Create an index.html file to preview web content</p>
      </body>
      </html>
    `;

    // Inject CSS
    const styleBlock = `<style>${cssCode}</style>`;
    if (source.includes("</head>")) {
      source = source.replace("</head>", `${styleBlock}</head>`);
    } else {
      source = styleBlock + source;
    }

    // Inject Interceptor JS + main script
    const scriptBlock = `
      <script>
        const _log = console.log;
        const _error = console.error;
        console.log = (...args) => {
          _log(...args);
          window.parent.postMessage({ type: 'CONSOLE_LOG', text: args.join(' ') }, '*');
        };
        console.error = (...args) => {
          _error(...args);
          window.parent.postMessage({ type: 'CONSOLE_ERROR', text: args.join(' ') }, '*');
        };
        window.onerror = (message, source, lineno, colno, error) => {
          window.parent.postMessage({ type: 'CONSOLE_ERROR', text: message }, '*');
        };
      </script>
      <script>
        document.addEventListener("DOMContentLoaded", () => {
          try {
            ${jsCode}
          } catch(err) {
            console.error(err.message);
          }
        });
      </script>
    `;

    if (source.includes("</body>")) {
      source = source.replace("</body>", `${scriptBlock}</body>`);
    } else {
      source = source + scriptBlock;
    }

    return source;
  };

  // Copy Room Link
  const copyRoomLink = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Reactions Manager
  const triggerReaction = (emoji) => {
    connRef.current?.sendReaction(emoji);
  };

  // Chat Submit
  const handleChatSend = () => {
    const text = chatInput.trim();
    if (!text) return;
    connRef.current?.sendChat(text);
    setChatInput("");
  };

  // File Managers
  const handleCreateFile = () => {
    const name = newFileName.trim();
    if (!name) return;
    
    // Check duplication
    if (files[name]) {
      alert("File already exists!");
      return;
    }

    const language = getLanguageForFile(name);
    const starterContent = LANG_STARTERS[language] || "// Start coding...\n";

    setFiles(prev => ({
      ...prev,
      [name]: { name, content: starterContent, language }
    }));
    setActiveFileName(name);

    connRef.current?.createFile(name, starterContent, language);

    // Reset inputs
    setNewFileName("");
    setIsCreatingFile(false);
  };

  const handleStartRename = (file) => {
    setEditingFileName(file.name);
    setEditFileVal(file.name);
  };

  const handleFinishRename = (oldName) => {
    const newName = editFileVal.trim();
    if (!newName || newName === oldName) {
      setEditingFileName(null);
      return;
    }

    const language = getLanguageForFile(newName);
    setFiles(prev => {
      const updated = { ...prev };
      if (updated[oldName]) {
        updated[newName] = { ...updated[oldName], name: newName, language };
        delete updated[oldName];
      }
      return updated;
    });

    if (activeFileName === oldName) {
      setActiveFileName(newName);
    }

    connRef.current?.renameFile(oldName, newName, language);
    setEditingFileName(null);
  };

  const handleDeleteFile = (fileName, e) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) return;

    setFiles(prev => {
      const updated = { ...prev };
      delete updated[fileName];
      return updated;
    });

    if (activeFileName === fileName) {
      const remaining = Object.keys(files).filter(k => k !== fileName);
      setActiveFileName(remaining.length > 0 ? remaining[0] : "");
    }

    connRef.current?.deleteFile(fileName);
  };

  return (
    <div style={S.app}>
      <style>{globalCSS}</style>

      {/* Floating Reactions Container */}
      {reactions.map(r => (
        <span key={r.id} className="floating-reaction" style={{ left: r.left }}>
          {r.emoji}
        </span>
      ))}

      {/* Top Navbar */}
      <div style={S.topbar} className="nav-glow">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(139,92,246,0.1)", borderRadius: "8px", padding: "6px", border: "1px solid rgba(139,92,246,0.2)" }}>
            <Icon name="logo" size={20} color="#8b5cf6" />
          </div>
          <span style={{ fontSize: "16px", fontWeight: "800", letterSpacing: "-0.5px" }}>CodeSync</span>
          
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "12px" }}>
            <div style={S.badge}>
              Room: <span style={{ color: "#a78bfa", fontWeight: "700" }}>{roomId}</span>
            </div>
            
            <button className="interactive-button" style={S.btnGhost} onClick={copyRoomLink}>
              <Icon name={copied ? "check" : "copy"} size={13} color={copied ? "#10b981" : "#94a3b8"} />
              <span>{copied ? "Link Copied!" : "Share Link"}</span>
            </button>
          </div>
        </div>

        {/* Toolbar Toggles */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginRight: "10px" }}>
            <Icon name="users" size={14} color="#64748b" />
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "600" }}>
              {Object.keys(users).length} online
            </span>
          </div>

          <button 
            style={{ ...S.btnGhost, background: showPreview ? "rgba(139,92,246,0.12)" : "rgba(255,255,255,0.02)", border: showPreview ? "1px solid rgba(139,92,246,0.2)" : "1px solid rgba(255,255,255,0.06)", color: showPreview ? "#a78bfa" : "#94a3b8" }} 
            onClick={() => setShowPreview(v => !v)}
          >
            <Icon name="globe" size={13} />
            <span>Web Preview</span>
          </button>

          <button 
            style={{ ...S.btnGhost, background: showOutput ? "rgba(139,92,246,0.12)" : "rgba(255,255,255,0.02)", border: showOutput ? "1px solid rgba(139,92,246,0.2)" : "1px solid rgba(255,255,255,0.06)", color: showOutput ? "#a78bfa" : "#94a3b8" }} 
            onClick={() => setShowOutput(v => !v)}
          >
            <Icon name="terminal" size={13} />
            <span>Console</span>
          </button>

          <button 
            style={{ ...S.btnGhost, background: showChat ? "rgba(139,92,246,0.12)" : "rgba(255,255,255,0.02)", border: showChat ? "1px solid rgba(139,92,246,0.2)" : "1px solid rgba(255,255,255,0.06)", color: showChat ? "#a78bfa" : "#94a3b8" }} 
            onClick={() => setShowChat(v => !v)}
          >
            <Icon name="chat" size={13} />
            <span>Chat</span>
          </button>

          <button 
            style={{ ...S.btnGhost }} 
            onClick={() => setShowSettings(v => !v)}
          >
            <Icon name="settings" size={13} />
          </button>

          <button className="interactive-button" style={S.btnDanger} onClick={onLeave}>
            Leave
          </button>
        </div>
      </div>

      <div style={S.main}>
        {/* Left Sidebar */}
        <div style={S.sidebar}>
          {/* File Explorer */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <span style={{ fontSize: "10px", fontWeight: "700", color: "#475569", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                Files
              </span>
              <button 
                onClick={() => setIsCreatingFile(true)}
                style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", padding: "2px", borderRadius: "4px" }}
              >
                <Icon name="plus" size={14} color="#8b5cf6" />
              </button>
            </div>

            {/* Create File Input Block */}
            {isCreatingFile && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", background: "rgba(0,0,0,0.2)", padding: "8px", borderRadius: "6px", marginBottom: "12px", border: "1px solid rgba(139,92,246,0.2)" }}>
                <input 
                  type="text" 
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="name.html, code.py..."
                  onKeyDown={(e) => e.key === "Enter" && handleCreateFile()}
                  style={{ background: "#05050a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "4px", padding: "4px 8px", fontSize: "12px", color: "#f8fafc", width: "100%", outline: "none" }}
                  autoFocus
                />
                <div style={{ display: "flex", gap: "4px", alignSelf: "flex-end" }}>
                  <button style={{ ...S.btnGhost, padding: "2px 6px", fontSize: "10px" }} onClick={() => setIsCreatingFile(false)}>
                    Cancel
                  </button>
                  <button style={{ ...S.btnSuccess, padding: "2px 8px", fontSize: "10px" }} onClick={handleCreateFile}>
                    Create
                  </button>
                </div>
              </div>
            )}

            {/* File List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {Object.values(files).map((file) => (
                <div 
                  key={file.name} 
                  className={`file-tree-item ${activeFileName === file.name ? "active" : ""}`}
                  onClick={() => setActiveFileName(file.name)}
                >
                  <Icon name="file" size={13} color={activeFileName === file.name ? "#8b5cf6" : "#64748b"} />
                  {editingFileName === file.name ? (
                    <input 
                      type="text" 
                      value={editFileVal} 
                      onChange={(e) => setEditFileVal(e.target.value)}
                      onBlur={() => handleFinishRename(file.name)}
                      onKeyDown={(e) => e.key === "Enter" && handleFinishRename(file.name)}
                      style={{ background: "#000", border: "1px solid #8b5cf6", borderRadius: "3px", color: "#fff", fontSize: "12px", padding: "1px 4px", outline: "none", width: "100%" }}
                      autoFocus
                    />
                  ) : (
                    <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {file.name}
                    </span>
                  )}

                  {/* File Operations */}
                  {editingFileName !== file.name && (
                    <div className="file-ops" style={{ display: "flex", gap: "6px" }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleStartRename(file); }}
                        style={{ background: "transparent", border: "none", cursor: "pointer", opacity: 0.5 }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = 0.5}
                      >
                        <Icon name="edit" size={11} color="#94a3b8" />
                      </button>
                      <button 
                        onClick={(e) => handleDeleteFile(file.name, e)}
                        style={{ background: "transparent", border: "none", cursor: "pointer", opacity: 0.5 }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = 0.5}
                      >
                        <Icon name="trash" size={11} color="#ef4444" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Connected Users List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px" }}>
            <span style={{ fontSize: "10px", fontWeight: "700", color: "#475569", letterSpacing: "1.5px", textTransform: "uppercase", display: "block", marginBottom: "12px" }}>
              Collaborators
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {Object.entries(users).map(([id, u]) => (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ ...S.dot(u.color), width: "8px", height: "8px" }} className="pulse-online" />
                  <span style={{ fontSize: "13px", color: id === myIdRef.current ? "#f8fafc" : "#94a3b8", fontWeight: id === myIdRef.current ? "600" : "400" }}>
                    {u.name} {id === myIdRef.current ? "(You)" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center Editor Container */}
        <div style={S.editorArea}>
          {/* File tab switcher & Execution */}
          <div style={{ height: "38px", background: "#0c0c16", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", flexShrink: 0 }}>
            {/* Active file indicator tab */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Icon name="file" size={12} color="#8b5cf6" />
              <span style={{ fontSize: "12px", color: "#f8fafc", fontWeight: "600" }}>{activeFileName || "No File Selected"}</span>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button 
                className="interactive-button" 
                style={running ? S.btnGhost : S.btnSuccess}
                onClick={runCode}
                disabled={running || !activeFileName}
              >
                {running ? "Compiling..." : "▶ Run Code"}
              </button>
            </div>
          </div>

          {/* Monaco Editor Container */}
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            {activeFileName ? (
              <MonacoEditor
                height="100%"
                path={activeFileName}
                language={getLanguageForFile(activeFileName)}
                value={files[activeFileName]?.content || ""}
                onChange={handleEditorChange}
                options={{
                  fontSize: fontSize,
                  minimap: { enabled: true },
                  wordWrap: wordWrap ? "on" : "off",
                  automaticLayout: true,
                  cursorBlinking: "smooth",
                  cursorSmoothCaretAnimation: "on",
                  padding: { top: 12, bottom: 12 },
                  fontFamily: "'JetBrains Mono', monospace",
                  lineHeight: 22,
                  roundedSelection: true,
                  scrollBeyondLastLine: false,
                  theme: "vs-dark",
                  scrollbar: {
                    vertical: "visible",
                    horizontal: "visible",
                    verticalScrollbarSize: 6,
                    horizontalScrollbarSize: 6
                  }
                }}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "8px" }}>
                <Icon name="file" size={32} color="#475569" />
                <span style={{ color: "#475569", fontSize: "14px" }}>Select or create a file to start coding</span>
              </div>
            )}

            {/* Quick Settings Floating Panel */}
            {showSettings && (
              <div style={{ position: "absolute", top: "12px", right: "12px", background: "#0c0c16", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "14px", zIndex: 100, display: "flex", flexDirection: "column", gap: "10px", width: "180px", boxShadow: "0 10px 25px rgba(0,0,0,0.5)" }}>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", letterSpacing: "1px" }}>EDITOR SETTINGS</span>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "11px", color: "#94a3b8" }}>Font Size: {fontSize}px</label>
                  <input 
                    type="range" 
                    min="12" 
                    max="22" 
                    value={fontSize} 
                    onChange={(e) => setFontSize(parseInt(e.target.value))} 
                    style={{ width: "100%" }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
                  <span style={{ fontSize: "11px", color: "#94a3b8" }}>Word Wrap</span>
                  <input 
                    type="checkbox" 
                    checked={wordWrap} 
                    onChange={(e) => setWordWrap(e.target.checked)}
                    style={{ width: "14px", height: "14px", cursor: "pointer" }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Bottom Console Terminal */}
          {showOutput && (
            <div style={{ height: "180px", background: "#06060c", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 14px", background: "#09090f", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: running ? "#f59e0b" : "#10b981", boxShadow: running ? "0 0 8px #f59e0b" : "0 0 8px #10b981" }} />
                  <span style={{ fontSize: "10px", fontWeight: "700", color: "#64748b", letterSpacing: "1px" }}>CONSOLE TERMINAL</span>
                </div>
                <button 
                  style={{ ...S.btnGhost, padding: "2px 8px", fontSize: "10px" }}
                  onClick={() => setOutput([])}
                >
                  Clear
                </button>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: "1.6" }}>
                {output.length === 0 ? (
                  <span style={{ color: "#334155" }}>Run your program or trigger interactions inside the live preview to inspect outputs here...</span>
                ) : (
                  output.map((o, idx) => (
                    <div key={idx} style={{ display: "flex", gap: "8px", marginBottom: "4px" }}>
                      <span style={{ color: o.type === "err" ? "#ef4444" : o.type === "done" ? "#10b981" : o.type === "info" ? "#8b5cf6" : "#64748b", userSelect: "none" }}>
                        {o.type === "err" ? "✕" : o.type === "done" ? "✓" : o.type === "info" ? "·" : "›"}
                      </span>
                      <span style={{ color: o.type === "err" ? "#fecaca" : o.type === "done" ? "#a7f3d0" : o.type === "info" ? "#c084fc" : "#e2e8f0", whiteSpace: "pre-wrap" }}>
                        {o.text}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Preview Web Pane */}
        {showPreview && (
          <div style={{ width: "320px", display: "flex", flexDirection: "column", background: "#0c0c16", borderLeft: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <Icon name="globe" size={13} color="#10b981" style={{ marginRight: "6px" }} />
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                Live Web View
              </span>
            </div>
            
            <div style={{ flex: 1, background: "#fff", position: "relative" }}>
              <iframe 
                srcDoc={getPreviewSource()}
                title="CodeSync Live Frame"
                sandbox="allow-scripts"
                style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
              />
            </div>
          </div>
        )}

        {/* Right Live Chat & Reactions Panel */}
        {showChat && (
          <div style={S.chatPanel}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                Live Chat & reactions
              </span>
            </div>

            {/* Quick Reactions Bar */}
            <div style={{ display: "flex", justifyContent: "space-around", padding: "8px", background: "rgba(0,0,0,0.15)", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              {["🎉", "🔥", "🚀", "❤️", "👍", "😮"].map(emoji => (
                <button 
                  key={emoji}
                  onClick={() => triggerReaction(emoji)}
                  style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", transition: "transform 0.1s" }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.2)"}
                  onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Chat messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {chatMsgs.length === 0 ? (
                <div style={{ fontSize: "12px", color: "#475569", textAlign: "center", marginTop: "12px" }}>
                  No messages yet. Send a message to get started! 👋
                </div>
              ) : (
                chatMsgs.map((m, idx) => (
                  <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: m.color }} />
                      <span style={{ fontSize: "11px", color: m.color, fontWeight: "700" }}>{m.userName}</span>
                      <span style={{ fontSize: "9px", color: "#475569", marginLeft: "auto" }}>
                        {new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <span style={{ fontSize: "12px", color: "#94a3b8", paddingLeft: "11px", wordBreak: "break-word" }}>
                      {m.msg}
                    </span>
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Chat Input */}
            <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: "6px" }}>
              <input 
                type="text" 
                value={chatInput} 
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleChatSend()}
                style={{ flex: 1, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "6px", padding: "6px 10px", fontSize: "12px", color: "#f8fafc", fontFamily: "inherit", outline: "none" }}
                placeholder="Type message..."
              />
              <button 
                className="interactive-button btn-primary" 
                onClick={handleChatSend} 
                style={{ padding: "6px 10px", borderRadius: "6px" }}
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Root Component ──────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);

  if (!session) {
    return <Landing onJoin={(roomId, name, color) => setSession({ roomId, name, color })} />;
  }

  return (
    <EditorWorkspace 
      roomId={session.roomId}
      userName={session.name}
      userColor={session.color}
      onLeave={() => setSession(null)}
    />
  );
}
