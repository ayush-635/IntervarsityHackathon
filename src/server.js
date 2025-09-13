import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import puzzles from "./puzzles.js";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

function updateUserProgress(userId, correct) {
  const today = new Date().toDateString();

  if (!users[userId]) {
    users[userId] = { xp: 0, streak: 0, lastSolved: null };
  }

  if (correct) {
    users[userId].xp += 10; // +10 XP 
    if (users[userId].lastSolved === today) {
      // Already solved today
    } else {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (users[userId].lastSolved === yesterday.toDateString()) {
        users[userId].streak += 1;
      } else {
        users[userId].streak = 1;
      }
    }
    users[userId].lastSolved = today;
  }
}

app.get("/", (req, res) => res.send("Welcome to the Cyber Escape Room!"));

app.post("/check/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const userAnswer = req.body.answer;

  if (!puzzles[id]) return res.json({ correct: false, message: "Invalid puzzle" });

  if (userAnswer.toLowerCase() === puzzles[id].answer.toLowerCase()) {
    return res.json({ correct: true, message: "Correct! Proceed to next room." });
  }
  updateUserProgress(req.body.userId || 'guest', isCorrect);

  // Call the helper function here
  const hintPrompt = `User failed puzzle: "${puzzles[id].question}". Give a short, friendly hint without revealing the answer.`;
  const hint = await getHint(hintPrompt);

  res.json({ correct: false, hint });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
