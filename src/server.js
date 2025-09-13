// index.js
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({ apiKey });

async function main() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            { text: "Who are the sidemen" }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.9
      }
    });
    console.log(response.candidates[0].content.parts[0].text);
  } catch (err) {
    console.error("Error calling Gemini API:", err);
  }
}

main();
