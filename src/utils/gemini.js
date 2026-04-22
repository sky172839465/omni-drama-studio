import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function askGemini(prompt, modelName = "gemini-2.5-flash") {
  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
  });
  return response.text;
}

function sanitizeJsonString(text) {
  let clean = text.trim();
  if (clean.startsWith('```json')) {
    clean = clean.substring(7);
  } else if (clean.startsWith('```')) {
    clean = clean.substring(3);
  }
  if (clean.endsWith('```')) {
    clean = clean.substring(0, clean.length - 3);
  }
  return clean.trim();
}

export async function askGeminiStructured(prompt, schema, modelName = "gemini-2.5-flash") {
  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });
  return JSON.parse(sanitizeJsonString(response.text));
}
