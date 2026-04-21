import { uploadToR2, downloadFromR2, getSignedUrlForR2 } from "../utils/r2.js";
import { askGemini } from "../utils/gemini.js";
import fs from "fs/promises";
import path from "path";

/**
 * Mock Veo 3.1 Lite call
 */
export async function generateClip(storyId, actNumber, clipIndex, scriptClip, config, lastFrameKey) {
  console.log(`Generating Act ${actNumber} Clip ${clipIndex} for ${storyId}`);

  const appearancePrompt = config.appearance_seeds.join(", ");
  const fullPrompt = `${config.global_mood}. ${scriptClip.visual_description}. Featuring: ${scriptClip.key_object}. Appearance traits: ${appearancePrompt}. Cinematic, 4k.`;

  const clipKey = `drama/${storyId}/clips/act_${actNumber}_clip_${clipIndex}.mp4`;
  const nextFrameKey = `drama/${storyId}/frames/act_${actNumber}_frame_${clipIndex}.png`;

  console.log(`Prompt: ${fullPrompt}`);
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
