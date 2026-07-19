import express from "express";
import "dotenv/config";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import { connectDB } from "./lib/db.js";
import userRouter from "./routes/userRoutes.js";
import messageRouter from "./routes/messageRoutes.js";

const app = express();
const server = http.createServer(app);

// Increased payload limit for PDF uploads (base64 is ~33% larger than binary)
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://chat-app-varad-dev.vercel.app",
    ],
    methods: ["GET", "POST", "PUT"],
    credentials: true,
  })
);

export const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "https://chat-app-varad-dev.vercel.app",
    ],
    methods: ["GET", "POST", "PUT"],
    credentials: true,
  },
  transports: ["polling", "websocket"],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 20 * 1024 * 1024,
});

export const userSocketMap = {};

const getSocketId = (userId) => {
  if (!userId) return null;
  return userSocketMap[String(userId)] ?? null;
};

io.on("connection", (socket) => {
  const userId =
    socket.handshake.auth?.userId || socket.handshake.query?.userId;

  console.log(`[Socket] Connected — userId: ${userId}`);

  if (userId) userSocketMap[String(userId)] = socket.id;

  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  socket.on("call-user", (data) => {
    try {
      const { userToCall, from, offer, callerName } = data;
      if (!userToCall || !from || !offer) {
        socket.emit("call-error", { message: "Invalid call data." });
        return;
      }
      const target = getSocketId(userToCall);
      if (!target) {
        socket.emit("call-error", { message: "User is offline." });
        return;
      }
      io.to(target).emit("incoming-call", { from, callerName, offer });
    } catch (err) {
      console.error("[call-user] error:", err);
    }
  });

  socket.on("answer-call", (data) => {
    try {
      const { to, answer } = data;
      if (!to || !answer) return;
      const target = getSocketId(to);
      if (!target) return;
      io.to(target).emit("call-accepted", { answer });
    } catch (err) {
      console.error("[answer-call] error:", err);
    }
  });

  socket.on("ice-candidate", (data) => {
    try {
      const { to, candidate, from } = data;
      if (!to || !candidate) return;
      const target = getSocketId(to);
      if (!target) return;
      io.to(target).emit("ice-candidate", { candidate, from });
    } catch (err) {
      console.error("[ice-candidate] error:", err);
    }
  });

  socket.on("end-call", (data) => {
    try {
      const { to } = data ?? {};
      if (!to) return;
      const target = getSocketId(to);
      if (!target) return;
      io.to(target).emit("end-call", {});
    } catch (err) {
      console.error("[end-call] error:", err);
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[Socket] Disconnected — reason: ${reason}`);
    if (userId && userSocketMap[String(userId)] === socket.id) {
      delete userSocketMap[String(userId)];
    }
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

app.use("/api/status", (req, res) => res.send("Server is live"));
app.use("/api/auth", userRouter);
app.use("/api/messages", messageRouter);

await connectDB();

const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () =>
  console.log(`[Server] Running on PORT: ${PORT}`)
);