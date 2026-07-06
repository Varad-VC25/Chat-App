import express from 'express';
import "dotenv/config";
import cors from 'cors';
import http from 'http';
import { connectDB } from './lib/db.js';
import userRouter from './routes/userRoutes.js';
import messageRouter from './routes/messageRoutes.js';
import { Server } from 'socket.io';

// Create an Express application and an HTTP server
const app = express();
const server = http.createServer(app)

// Initialize Socket.IO server
export const io = new Server(server, {
    cors: {origin: "*"},
});

// Store online users
export const userSocketMap = {}; // { userId: socketId }

// Socket.IO connection handler
io.on("connection", (socket) => {
    const userId = socket.handshake.auth?.userId || socket.handshake.query?.userId;
    console.log("User Connected", userId);

    if (userId) {
        userSocketMap[userId] = socket.id;
    }

    // Emit online users to all connected clients
    io.emit("getOnlineUsers", Object.keys(userSocketMap).map(id => id.toString()));


// ---------------- CALLING FEATURE ---------------- //

// CALL USER
socket.on("call-user", (data) => {
  try {
    const { userToCall, from, offer, callerName } = data;

    if (!userToCall || !from || !offer) {
      socket.emit("call-error", {
        message: "Invalid call data",
      });
      return;
    }

    const targetSocket = userSocketMap[userToCall];

    if (!targetSocket) {
      socket.emit("call-error", {
        message: "User is offline",
      });
      return;
    }

    io.to(targetSocket).emit("incoming-call", {
      from,
      to: userToCall,
      callerName,
      offer,
    });

  } catch (err) {
    console.log("call-user error", err);
  }
});


// ANSWER CALL
socket.on("answer-call", (data) => {
    try {
        const { to, answer } = data;

        const targetSocket = userSocketMap[to];

        if (!targetSocket) return;

        io.to(targetSocket).emit("call-accepted", {
            answer,
        });

    } catch (err) {
        console.log("answer-call error", err);
    }
});


// ICE CANDIDATES
socket.on("ice-candidate", (data) => {
    try {
        const { to, candidate, from } = data;

        const targetSocket = userSocketMap[to];

        if (!targetSocket) return;

        io.to(targetSocket).emit("ice-candidate", {
            candidate,
            from,
        });

    } catch (err) {
        console.log("ice-candidate error", err);
    }
});


// END CALL
socket.on("end-call", ({ to, declined }) => {
    try {
        const targetSocket = userSocketMap[to];

        if (!targetSocket) return;

        io.to(targetSocket).emit("end-call", { declined });

    } catch (err) {
        console.log("end-call error", err);
    }
});


    socket.on("disconnect", () => {
        console.log("User Disconnected", userId);
        delete userSocketMap[userId];
        io.emit("getOnlineUsers", Object.keys(userSocketMap).map(id => id.toString()));
    })
});

// Middleware setup
app.use(express.json({limit: '4mb'}));
app.use(cors());


// Routes setup
app.use("/api/status", (req, res) => res.send("Server is live"));
app.use("/api/auth", userRouter);
app.use("/api/messages", messageRouter);


// Connect to MongoDB
await connectDB();


const PORT = process.env.PORT || 5000;
// Start the server
server.listen(PORT, "0.0.0.0", () => console.log("Server is running on PORT: " + PORT));

