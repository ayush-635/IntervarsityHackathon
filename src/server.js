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
const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET, { expiresIn: '1d' });

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

    const match = bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Wrong password" });

    return res.json({ message: "Login successful", userId: user.username });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));