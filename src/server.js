import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import puzzles from "./puzzles.js";
import path from "path"
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_API_KEY="AIzaSyCtvNELI8SwB2b4IxBLE8iRN3sl_qwip1s"
const MONGO_URI="mongodb://localhost:27017/cyberEscapeRoom"
const JWT_SECRET="supersecret123"

const app = express();
const PORT = 3000;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

const userSchema = new mongoose.Schema({
    username: {type: String, unique: true },
    password: String,
    xp: { type: Number, default: 0},
    streak: { type: Number, default: 0},
    lastSolved: {type: Date, default: null}
});

export const User = mongoose.model("User", userSchema);

async function getHint(prompt) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, topP: 0.9 }
    });

    return response.candidates[0].content.parts[0].text;
  } catch (err) {
    console.error("Error calling Gemini API:", err);
    return "Error generating hint";
  }
}

app.use(bodyParser.json());

async function authMiddleware(req, res, next){
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "please login first" });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findOne({ username: decoded.username });
        if(!user) return res.status(401).json({ message: "Invalid user" });
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid token" });
    }
}

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "/front end/home.html"));
});

app.post("/check/:id", authMiddleware, async (req, res) => {
  const user = req.user;
    const id = parseInt(req.params.id);
    const userAnswer = req.body.answer;

    if (!puzzles[id]) return res.json({ correct: false, message: "Invalid puzzle" });

    const isCorrect = userAnswer.toLowerCase() === puzzles[id].answer.toLowerCase();

    if (isCorrect) {
        user.xp += 10;
        const today = new Date().toDateString();
        if (user.lastSolved?.toDateString() === today) {
            // already solved today
        } else {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            if (user.lastSolved?.toDateString() === yesterday.toDateString()) user.streak += 1;
            else user.streak = 1;

            user.lastSolved = new Date();
        }
    }

    await user.save();

    const badges = [];
    if (user.xp >= 50) badges.push("Puzzle Novice");
    if (user.xp >= 100) badges.push("Cyber Sleuth");
    if (user.streak >= 5) badges.push("Consistency Badge");

    const level = Math.floor(user.xp / 50) + 1;

    if (isCorrect) return res.json({ correct: true, message: "Correct!", xp: user.xp, streak: user.streak, level, badges });

    const hintPrompt = `User failed puzzle: "${puzzles[id].question}". Give a short, friendly hint without revealing the answer.`;
    const hint = await getHint(hintPrompt);

    res.json({ correct: false, hint, xp: user.xp, streak: user.streak, level, badges });
});

app.get("/game", (req, res) => {
    res.sendFile(path.join(__dirname, "/front end/index.html"));
});

app.get("/puzzles/:id", (req, res) => {
  const id = parseInt(req.params.id);
  if (!puzzles[id]) {
    return res.json({ question: null });
  }
  res.json({ question: puzzles[id].question });
});

app.post("/register", async(req, res) => {
    const { username, password } = req.body;

    if(!username || !password){
        return res.status(400).json({message: "username and password are required"});
    }

    const exists = await User.findOne({ username });
    if(exists){
        return res.status(400).json({ message: "user exists please login"});
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword});
    await newUser.save();

    return res.json({message: "user is registered"});
});

app.post("/login", async (req, res) =>{
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: "Invalid username or password" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Wrong password" });

    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '1d' });

    return res.json({ message: "Login successful", token });
});

app.get("/me", authMiddleware, async (req, res) => {
    const user = req.user;
    res.json({
        username: user.username,
        xp: user.xp,
        streak: user.streak,
        lastSolved: user.lastSolved
    });
});

app.get("/leaderboard", async (req, res) => {
    const topUsers = await User.find()
        .sort({xp:-1})
        .limit(10)
        .select("username xp streak")
    res.json(topUsers);
});

const battleQueue = [];
const battles = {};

function generateBattleId(){
    return Math.random().toString(36).substr(2, 9);
}

const pendingBattles = {};

app.post("/battle/join", authMiddleware, async (req, res) => {
    const user = req.user;

    if(battleQueue.includes(user.username)) {
        return res.json({ message: "You're already in the queue", waiting: true });
    }

    if(battleQueue.length > 0) {
        const opponent = battleQueue.shift();
        const battleId = generateBattleId();
        const puzzleId = Math.floor(Math.random() * puzzles.length);

        battles[battleId] = {
            players: [opponent, user.username],
            startTime: Date.now(),
            duration: 60,
            scores: { [opponent]: 0, [user.username]: 0 },
            currentPuzzleId: puzzleId,
            answered: new Set()
        };

        pendingBattles[opponent] = battleId;
        pendingBattles[user.username] = battleId;

        return res.json({
            message: "battle started",
            battleId,
            puzzle: puzzles[puzzleId].question,
            opponent
        });
    }

    battleQueue.push(user.username);
    return res.json({ message: "Waiting for an opponent...", waiting: true });
});

app.get("/battle/pending", authMiddleware, (req, res) => {
    const user = req.user;
    const battleId = pendingBattles[user.username];
    if (!battleId) return res.json({ started: false });

    const battle = battles[battleId];
    if(!battle) return res.json({ started: false });
    delete pendingBattles[user.username];

    const opponent = battle.players.find(u => u !== user.username);
    res.json({
        started: true,
        battleId,
        puzzle: puzzles[battle.currentPuzzleId].question,
        opponent,
        scores: battle.scores
    });
});

app.post("/battle/answer/:battleId", authMiddleware, async (req, res) => {
    const { battleId } = req.params;
    const { answer } = req.body;
    const user = req.user;

    const battle = battles[battleId];
    if (!battle) return res.status(400).json({ message: "Battle not found" });

    const elapsed = (Date.now() - battle.startTime) / 1000;
    if (elapsed > battle.duration) {
        let winner = null;
        const [p1, p2] = battle.players;
        if (battle.scores[p1] > battle.scores[p2]) winner = p1;
        else if (battle.scores[p2] > battle.scores[p1]) winner = p2;

        delete battles[battleId];
        return res.json({ message: "Time's up!", winner, scores: battle.scores });
    }

    const currentPuzzle = puzzles[battle.currentPuzzleId];
    if (battle.answered.has(user.username)) {
        return res.json({ message: "Already answered this puzzle", scores: battle.scores });
    }

    const correct = answer.trim().toLowerCase() === currentPuzzle.answer.trim().toLowerCase();

    if (correct) {
        battle.scores[user.username] += 1;
    }

    battle.answered.add(user.username);

    let nextPuzzle = null;
    if (battle.answered.size === battle.players.length) {
        let nextPuzzleId;
        do {
            nextPuzzleId = Math.floor(Math.random() * puzzles.length);
        } while (nextPuzzleId === battle.currentPuzzleId);
        battle.currentPuzzleId = nextPuzzleId;
        battle.answered.clear();
        nextPuzzle = puzzles[nextPuzzleId].question;
    }

    res.json({
        correct,
        nextPuzzle,
        scores: battle.scores,
        message: correct ? "Correct!" : "Wrong answer"
    });
});

app.get("/battle/status/:battleId", authMiddleware, (req, res) => {
    const { battleId } = req.params;
    const battle = battles[battleId];
    if(!battle) return res.status(400).json({ message: "Battle not found" });

    const elapsed = (Date.now() - battle.startTime) / 1000;
    const remaining = Math.max(0, battle.duration - elapsed);

    res.json({
        players: battle.players,
        currentPuzzle: puzzles[battle.currentPuzzleId].question,
        scores: battle.scores,
        timeLeft: remaining
    });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));