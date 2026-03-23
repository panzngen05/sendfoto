// server.js - Backend Node.js + Express + Socket.io
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- SETUP FOLDER UPLOAD ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 }, storage });

// --- DATABASE SEMENTARA ---
const usersDB = {}; 
const messagesDB = [];

const getRandomAvatar = () => {
    const ids = [1506794778202, 1534528741775, 1542156822, 1522075469751, 1535713875002];
    const id = ids[Math.floor(Math.random() * ids.length)];
    return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=150&q=80`;
};

// --- API HTTP ENDPOINTS ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Nama dan sandi wajib diisi!' });

    if (!usersDB[username]) {
        usersDB[username] = { password, socketId: null, isOnline: false, avatar: getRandomAvatar() };
    } else if (usersDB[username].password !== password) {
        return res.status(401).json({ error: 'Sandi salah, Bos!' });
    }

    res.json({ success: true, username, avatar: usersDB[username].avatar });
});

app.get('/api/messages/:user1/:user2', (req, res) => {
    const { user1, user2 } = req.params;
    const chatHistory = messagesDB.filter(m => 
        (m.sender === user1 && m.receiver === user2) || 
        (m.sender === user2 && m.receiver === user1)
    );
    res.json(chatHistory);
});

app.post('/api/upload', upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Tidak ada file' });
    res.json({ photoUrl: `/uploads/${req.file.filename}` });
});

// --- WEBSOCKET (SOCKET.IO) ---
io.on('connection', (socket) => {
    socket.on('join', (username) => {
        if (usersDB[username]) {
            usersDB[username].socketId = socket.id;
            usersDB[username].isOnline = true;
            socket.username = username;
            io.emit('users_update', getCleanUsersList());
        }
    });

    socket.on('private_message', (data) => {
        const { sender, receiver, text, photo } = data;
        const newMessage = {
            id: Date.now(), sender, receiver, text, photo,
            timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        };
        messagesDB.push(newMessage);

        if (usersDB[receiver] && usersDB[receiver].isOnline) {
            io.to(usersDB[receiver].socketId).emit('receive_message', newMessage);
        }
        socket.emit('receive_message', newMessage);
    });

    socket.on('disconnect', () => {
        if (socket.username && usersDB[socket.username]) {
            usersDB[socket.username].isOnline = false;
            usersDB[socket.username].socketId = null;
            io.emit('users_update', getCleanUsersList());
        }
    });
});

function getCleanUsersList() {
    return Object.keys(usersDB).map(uname => ({
        username: uname, isOnline: usersDB[uname].isOnline, avatar: usersDB[uname].avatar
    }));
}

// --- SERVE FILE STATIS ---
app.use('/uploads', express.static(uploadDir));
app.use(express.static(__dirname));
app.use((req, res) => res.sendFile(path.join(__dirname, 'index.html')));

server.listen(PORT, () => console.log(`🔥 Server Real-time nyala di http://localhost:${PORT}`));
