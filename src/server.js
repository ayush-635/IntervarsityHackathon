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
//const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET, { expiresIn: '1d' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("MongoDB connected"))
.catch(err => console.error("mongodb didnt connect", err));

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
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findOne({ username: decoded.username });
        if(!user) return res.status(401).json({ message: "Invalid user" });
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid token" });
    }
}

app.get("/", (req, res) => res.send("Welcome to the Cyber Escape Room!"));

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

    const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET, { expiresIn: '1d' });

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

app.post("/battle/join", authMiddleware, async (req, res) => {
    const user = req.user;

    if(battleQueue.includes(user.username)){
        return res.json({ message: "youre already in the queue"});
    }

    if(battleQueue.length > 0){
        const opponent = battleQueue.shift();
        const battleId = generateBattleId();
        const puzzleId = Math.floor(Math.random()*puzzles.length);

        battles[battleId] = {
            players: [opponent, user.username],
            puzzleId,
            startTime: Date.now(),
            answers: {},
        };

        return res.json({
            message: "battle started",
            battleId,
            puzzle: puzzles[puzzleId].question,
            opponent,
        });
    }

    battleQueue.push(user.username);
    res.json({ message: "Waiting for an opponent"});
});

app.post("/battle/answer/:battleId", authMiddleware, async (req, res) => {
    const { battleId } = req.params;
    const { answer } = req.body;
    const user = req.user;

    const battle = battles[battleId];
    if(!battle){
        return res.status(400).json({ message: "battle not found"});
    }

    const elapsed = (Date.now()-battle.startTime)/1000;
    if(elapsed > 60){
        return res.json({ message: "Time is up"});
    }

    const correct = answer.toLowerCase() === puzzles[battle.puzzleId].answer.toLowerCase();
    battle.answers[user.username] = { correct, time: elapsed};

    if(Object.keys(battle.answers).length === 2){
        const [p1, p2] = battle.players;
        const a1 = battle.answers[p1];
        const a2 = battle.answers[p2];

        let winner = null;

        if(a1.correct && a2.correct){
            winner = a1.time < a2.time ? p1 : p2;
        } else if(a1.correct){
            winner = p1;
        } else if (a2.correct){
            winner = p2;
        }

        if(winner){
            const winningUser = await User.findOne({ username: winner});
            winningUser.xp +=25;
            await winningUser.save();
        }

        delete battles[battleId];
        return res.json({ message: "battle is now finished", winner, answers: battle.answers });        
    }
    res.json({ message: "answer received, waiting for opponent"});
});

app.get("/battle/status/:battleId", authMiddleware, (req, res) => {
    const { battleId } = req.params;
    const battle= battles[battleId];
    if(!battle){
        return res.status(400).json({ message: "battle not found"});
    }

    res.json({
        players: battle.players,
        puzzleId: battle.puzzleId,
        elapsed: (Date.now() - battle.startTime)/1000,
    });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));