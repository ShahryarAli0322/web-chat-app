const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const userRoutes = require("./routes/userRoutes");
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const requestRoutes = require("./routes/requestRoutes");

dotenv.config();

const app = express();
connectDB();

app.use(express.json()); 

app.get("/", (req, res) => {
  res.send("API is running successfully");
});


app.use("/api/user", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/message", messageRoutes);
app.use("/api/requests", requestRoutes);


app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server is started on PORT ${PORT}`);
});


const io = require("socket.io")(server, {
  pingTimeout: 60000,
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
  },
});


const typingUsers = new Map();

io.on("connection", (socket) => {
  console.log("Connected to Socket.io:", socket.id);


  socket.on("setup", (userData) => {
    if (userData && userData._id) {
      socket.join(userData._id);
      socket.emit("connected");
      console.log("User setup:", userData._id);
    }
  });

  
  socket.on("joinchat", (room) => {
    if (room) {
      socket.join(room);
      console.log(`User ${socket.id} joined room: ${room}`);
    }
  });

  
  socket.on("typing", (room) => {
    if (!room) return;
    if (!typingUsers.has(room)) typingUsers.set(room, new Set());
    typingUsers.get(room).add(socket.id);
    socket.to(room).emit("typing");
  });

  socket.on("stop typing", (room) => {
    if (!room || !typingUsers.has(room)) return;
    typingUsers.get(room).delete(socket.id);
    if (typingUsers.get(room).size === 0) {
      socket.to(room).emit("stop typing");
    }
  });

  
  socket.on("new message", (newMessageReceived) => {
    if (!newMessageReceived || !newMessageReceived.chat) return;

    const chat = newMessageReceived.chat;
    if (!chat.users) return console.log("chat.users not defined");

    
    chat.users.forEach((u) => {
      if (u._id === newMessageReceived.sender._id) return;
      socket.to(u._id).emit("message received", newMessageReceived);
    });
  });


  socket.on("reaction update", (payload) => {
    if (!payload?.chatId || !payload?.message) return;
    
    socket.to(payload.chatId).emit("reaction updated", payload.message);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    typingUsers.forEach((users, room) => {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        if (users.size === 0) {
          socket.to(room).emit("stop typing");
        }
      }
    });
  });
});
