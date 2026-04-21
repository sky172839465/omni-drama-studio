import { uploadToR2 } from "../utils/r2.js";
import fs from "fs/promises";
import path from "path";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateAudio(storyId, script) {
  console.log(`Generating master audio for ${storyId}`);

  let audioCues = [];
  script.acts.forEach(act => {
    act.clips.forEach(clip => {
      audioCues.push(`[${clip.timestamp}] ${clip.sound_vibe}`);
    });
  });

  const prompt = `
Generate a continuous background music track with sound effects for the following script.
Global Mood: ${script.global_mood}

Audio cues by timestamp:
${audioCues.join("\n")}
  `.trim();

  console.log(`Prompting Lyria 3: ${prompt.substring(0, 100)}...`);

  const response = await ai.models.generateContent({
    model: "lyria-3-pro-preview",
    contents: prompt,
    config: {
      responseModalities: ["AUDIO", "TEXT"],
      responseMimeType: "audio/wav",
    },
  });

  let audioData = null;
  // Based on the documentation, for Lyria 3 we need to extract the inlineData from the response parts
  if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData && part.inlineData.data) {
        audioData = Buffer.from(part.inlineData.data, "base64");
        break;
      }
    }
  }

  if (!audioData) {
    throw new Error("Failed to generate audio using Lyria 3, no audio data returned.");
  }

  const masterAudioKey = `drama/${storyId}/audio/master_bgm.wav`;
  await uploadToR2(masterAudioKey, audioData, "audio/wav");

  console.log(`Master audio uploaded to ${masterAudioKey}`);

  return { masterAudioKey };
}

export async function runAudioTech(storyId) {
  const scriptPath = path.join("drama", storyId, "script.json");
  const script = JSON.parse(await fs.readFile(scriptPath, "utf-8"));

  const result = await generateAudio(storyId, script);

  // Update checklist if needed or just return result for final editor
  return result;
}
