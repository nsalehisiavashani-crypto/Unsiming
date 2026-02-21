import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("unsiming.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT,
    avatar TEXT,
    theme TEXT DEFAULT 'dark',
    lastSeen INTEGER
  );
  CREATE TABLE IF NOT EXISTS contacts (
    userId TEXT,
    contactId TEXT,
    PRIMARY KEY (userId, contactId)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    senderId TEXT,
    receiverId TEXT,
    content TEXT,
    timestamp INTEGER,
    status TEXT
  );
`);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(express.json());

  // Auth Routes
  app.post("/api/register", (req, res) => {
    const { username, email, password } = req.body;
    try {
      const id = Math.random().toString(36).substr(2, 9);
      db.prepare("INSERT INTO users (id, username, email, password, lastSeen) VALUES (?, ?, ?, ?, ?)")
        .run(id, username, email, password, Date.now());
      res.json({ success: true, user: { id, username, email, theme: 'dark' } });
    } catch (e) {
      res.status(400).json({ error: "Username or email already exists" });
    }
  });

  app.post("/api/login", (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?").get(email, password);
    if (user) {
      res.json({ success: true, user: { id: user.id, username: user.username, email: user.email, theme: user.theme } });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  // Contact Management
  app.post("/api/contacts/add", (req, res) => {
    const { userId, contactEmail } = req.body;
    const contact = db.prepare("SELECT id FROM users WHERE email = ?").get(contactEmail);
    if (!contact) return res.status(404).json({ error: "User not found" });
    if (contact.id === userId) return res.status(400).json({ error: "Cannot add yourself" });
    
    try {
      db.prepare("INSERT INTO contacts (userId, contactId) VALUES (?, ?)").run(userId, contact.id);
      db.prepare("INSERT INTO contacts (userId, contactId) VALUES (?, ?)").run(contact.id, userId); // Mutual for demo
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Contact already added" });
    }
  });

  app.get("/api/contacts/:userId", (req, res) => {
    const contacts = db.prepare(`
      SELECT u.id, u.username, u.email, u.avatar, u.lastSeen 
      FROM users u 
      JOIN contacts c ON u.id = c.contactId 
      WHERE c.userId = ?
    `).all(req.params.userId);
    res.json(contacts);
  });

  // Settings
  app.post("/api/user/theme", (req, res) => {
    const { userId, theme } = req.body;
    db.prepare("UPDATE users SET theme = ? WHERE id = ?").run(theme, userId);
    res.json({ success: true });
  });

  // Data Export (JSON)
  app.get("/api/export/:userId", (req, res) => {
    const messages = db.prepare("SELECT * FROM messages WHERE senderId = ? OR receiverId = ?").all(req.params.userId, req.params.userId);
    res.json(messages);
  });

  // Message History
  app.get("/api/messages/:userId/:otherId", (req, res) => {
    const { userId, otherId } = req.params;
    const messages = db.prepare(`
      SELECT * FROM messages 
      WHERE (senderId = ? AND receiverId = ?) 
      OR (senderId = ? AND receiverId = ?)
      ORDER BY timestamp ASC
    `).all(userId, otherId, otherId, userId);
    res.json(messages);
  });

  // WebSocket handling
  const userSockets = new Map<string, WebSocket>();

  wss.on("connection", (ws) => {
    let currentUserId: string | null = null;

    ws.on("message", (data) => {
      try {
        const payload = JSON.parse(data.toString());
        
        if (payload.type === 'auth') {
          currentUserId = payload.userId;
          userSockets.set(currentUserId!, ws);
        }

        if (payload.type === 'message') {
          const { senderId, receiverId, content, id, timestamp } = payload;
          db.prepare("INSERT INTO messages (id, senderId, receiverId, content, timestamp, status) VALUES (?, ?, ?, ?, ?, ?)")
            .run(id, senderId, receiverId, content, timestamp, 'sent');

          const receiverSocket = userSockets.get(receiverId);
          if (receiverSocket && receiverSocket.readyState === WebSocket.OPEN) {
            receiverSocket.send(JSON.stringify({ type: 'message', senderId, receiverId, content, id, timestamp }));
          }
        }
      } catch (e) {
        console.error("WS Error:", e);
      }
    });

    ws.on("close", () => {
      if (currentUserId) userSockets.delete(currentUserId);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Unsiming by Darzi running at http://localhost:${PORT}`);
  });
}

startServer();
