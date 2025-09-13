import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import puzzles from "./puzzles.js";
import path from "path"
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.logg("MongoDB connected"))
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

let users = {};
let usersAuth = {};

function updateUserProgress(userId, correct) {
  const today = new Date().toDateString();

  if (!users[userId]) {
    users[userId] = { xp: 0, streak: 0, lastSolved: null };
  }

  const user = users[userId];

  if (user.lastSolved) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (new Date(user.lastSolved) < yesterday) {
      user.streak = 0;
    }
  }

  if (correct) {
    user.xp += 10;

    if (user.lastSolved === today) {
      // Already solved today
    } else {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      if (user.lastSolved === yesterday.toDateString()) {
        user.streak += 1;
      } else {
        user.streak = 1;
      }
      user.lastSolved = today;
    }
  }
}

function getUserLevel(userId) {
  const xp = users[userId]?.xp || 0;
  return Math.floor(xp / 50) + 1; // 50 XP per level
}

function getUserBadges(userId) {
  const user = users[userId];
  const badges = [];

  if (user.xp >= 50) badges.push("Puzzle Novice");
  if (user.xp >= 100) badges.push("Cyber Sleuth");
  if (user.streak >= 5) badges.push("Consistency Badge");

  return badges;
}

app.get("/", (req, res) => res.send("Welcome to the Cyber Escape Room!"));

app.post("/check/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const userId = req.body.userId || 'guest';
  const userAnswer = req.body.answer;

  if (!puzzles[id]) return res.json({ correct: false, message: "Invalid puzzle" });

  const isCorrect = userAnswer.toLowerCase() === puzzles[id].answer.toLowerCase();

  updateUserProgress(userId, isCorrect);
  const level = getUserLevel(userId);
  const badges = getUserBadges(userId);
  const streak = users[userId].streak;

  if (isCorrect) {
    return res.json({ correct: true, message: "Correct! Proceed to next room.", xp: users[userId].xp, level, streak, badges });
  }
  const hintPrompt = `User failed puzzle: "${puzzles[id].question}". Give a short, friendly hint without revealing the answer.`;
  const hint = await getHint(hintPrompt);

  res.json({ correct: false, hint, xp: users[userId].xp, level, streak, badges });
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

    return res.json({ message: "Login successful", userId: user.username });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));