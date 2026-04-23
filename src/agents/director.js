import { uploadToR2, downloadFromR2, getSignedUrlForR2 } from "../utils/r2.js";
import { askGemini } from "../utils/gemini.js";
import fs from "fs/promises";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";

const execPromise = promisify(exec);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateClip(storyId, actNumber, clipIndex, scriptClip, config, lastFrameKey) {
  console.log(`Generating Act ${actNumber} Clip ${clipIndex} for ${storyId}`);

  const appearancePrompt = config.appearance_seeds.join(", ");
  const fullPrompt = `${config.global_mood}. ${scriptClip.visual_description}. Featuring: ${scriptClip.key_object}. Appearance traits: ${appearancePrompt}. Cinematic.`;

  const clipKey = `drama/${storyId}/clips/act_${actNumber}_clip_${clipIndex}.mp4`;
  const nextFrameKey = `drama/${storyId}/frames/act_${actNumber}_frame_${clipIndex}.png`;

  console.log(`Prompt: ${fullPrompt}`);

  let generateArgs = {
    model: "veo-3.1-lite-generate-preview",
    prompt: fullPrompt,
  };

  if (lastFrameKey) {
    console.log(`Using last frame from ${lastFrameKey}`);
    const lastFrameRes = await downloadFromR2(lastFrameKey);
    const arrayBuffer = await lastFrameRes.transformToByteArray();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    // Convert Buffer to Uint8Array for the image parameter
    generateArgs.image = {
      mimeType: "image/png",
      imageBytes: base64
    };
  }

  let operation = await ai.models.generateVideos(generateArgs);

  while (!operation.done) {
    console.log(`Waiting for video generation to complete... (Act ${actNumber} Clip ${clipIndex})`);
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    operation = await ai.operations.getVideosOperation({
      operation: operation,
    });
  }

  const generatedVideo = operation.response.generatedVideos[0].video;
  const tmpVideoPath = path.join(os.tmpdir(), `act_${actNumber}_clip_${clipIndex}.mp4`);

  await ai.files.download({
    file: generatedVideo,
    downloadPath: tmpVideoPath,
  });

  const videoBuffer = await fs.readFile(tmpVideoPath);
  await uploadToR2(clipKey, videoBuffer, "video/mp4");

  // Extract last frame for next generation
  const tmpFramePath = path.join(os.tmpdir(), `act_${actNumber}_frame_${clipIndex}.png`);
  // -sseof -0.1 seeks to end of file minus 0.1 seconds, -vframes 1 gets 1 frame
  await execPromise(`ffmpeg -sseof -0.1 -i "${tmpVideoPath}" -update 1 -q:v 1 "${tmpFramePath}" -y`);

  const frameBuffer = await fs.readFile(tmpFramePath);
  await uploadToR2(nextFrameKey, frameBuffer, "image/png");

  // Cleanup tmp files
  await fs.unlink(tmpVideoPath);
  await fs.unlink(tmpFramePath);

  return { clipKey, nextFrameKey };
}

export async function runDirector(storyId) {
  const checklistPath = path.join("drama", storyId, "checklist.md");
  const scriptPath = path.join("drama", storyId, "script.json");
  const configPath = path.join("drama", storyId, "config.json");

  const script = JSON.parse(await fs.readFile(scriptPath, "utf-8"));
  const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
  let checklist = await fs.readFile(checklistPath, "utf-8");

  const lines = checklist.split("\n");
  let targetActNum = -1;
  let targetClipIdx = -1;
  let targetLineIdx = -1;
  let currentActNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const actHeader = lines[i].match(/## Act (\d+)/);
    if (actHeader) {
      currentActNum = parseInt(actHeader[1]);
    }

    if (lines[i].startsWith("- [ ] Clip")) {
      const clipMatch = lines[i].match(/Clip (\d+):/);
      targetClipIdx = parseInt(clipMatch[1]);
      targetActNum = currentActNum;
      targetLineIdx = i;
      break;
    }
  }

  if (targetLineIdx === -1) {
    return { done: true };
  }

  // Find specific clip in script data
  const act = script.acts.find(a => a.act_number === targetActNum);
  const clip = act.clips[targetClipIdx - 1];

  let lastFrameKey = null;
  if (targetClipIdx > 1) {
    lastFrameKey = `drama/${storyId}/frames/act_${targetActNum}_frame_${targetClipIdx - 1}.png`;
  } else if (targetActNum > 1) {
    // Get last frame of last clip of previous act
    const prevAct = script.acts.find(a => a.act_number === targetActNum - 1);
    lastFrameKey = `drama/${storyId}/frames/act_${targetActNum - 1}_frame_${prevAct.clips.length}.png`;
  }

  await generateClip(storyId, targetActNum, targetClipIdx, clip, config, lastFrameKey);

  lines[targetLineIdx] = lines[targetLineIdx].replace("- [ ]", "- [x]");
  await fs.writeFile(checklistPath, lines.join("\n"));

  return { done: false, nextAct: targetActNum, nextClip: targetClipIdx + 1 };
}
