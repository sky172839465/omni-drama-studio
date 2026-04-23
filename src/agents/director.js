import { uploadToR2, downloadFromR2 } from "../utils/r2.js";
import fs from "fs/promises";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import os from "os";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function _downloadBase64(key) {
  const res = await downloadFromR2(key);
  const arrayBuffer = await res.transformToByteArray();
  return Buffer.from(arrayBuffer).toString("base64");
}

export async function generateImages(storyId, actNumber, clipIndex, scriptClip, config, startFrameKey) {
  console.log(`Generating Images for Act ${actNumber} Clip ${clipIndex} for ${storyId}`);

  const appearancePrompt = config.appearance_seeds.join(", ");
  const basePrompt = `${config.global_mood}. ${scriptClip.visual_description}. Featuring: ${scriptClip.key_object}. Appearance traits: ${appearancePrompt}. Cinematic.`;

  const endFrameKey = `drama/${storyId}/frames/act_${actNumber}_frame_${clipIndex}_end.png`;

  // Always generate end image
  console.log(`Generating End Image with prompt: End of the action: ${basePrompt}`);
  const endImageResponse = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt: `End of the action: ${basePrompt}`,
    config: {
      numberOfImages: 1,
      aspectRatio: "16:9",
      outputMimeType: "image/png"
    }
  });

  const endImageBase64 = endImageResponse.generatedImages[0].image.imageBytes;
  await uploadToR2(endFrameKey, Buffer.from(endImageBase64, 'base64'), "image/png");

  // If startFrameKey is provided, we only generated the end image.
  // Otherwise, we also need to generate the start image (typically for Clip 1 of Act 1)
  if (!startFrameKey) {
    console.log(`Generating Start Image with prompt: Start of the action: ${basePrompt}`);
    const startImageResponse = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: `Start of the action: ${basePrompt}`,
      config: {
        numberOfImages: 1,
        aspectRatio: "16:9",
        outputMimeType: "image/png"
      }
    });

    const startImageBase64 = startImageResponse.generatedImages[0].image.imageBytes;
    const initialStartFrameKey = `drama/${storyId}/frames/act_${actNumber}_frame_${clipIndex}_start.png`;
    await uploadToR2(initialStartFrameKey, Buffer.from(startImageBase64, 'base64'), "image/png");
    return { startFrameKey: initialStartFrameKey, endFrameKey };
  }

  return { startFrameKey, endFrameKey };
}

export async function generateVideoClip(storyId, actNumber, clipIndex, scriptClip, config, startFrameKey, endFrameKey) {
  console.log(`Generating Video Act ${actNumber} Clip ${clipIndex} for ${storyId}`);

  const appearancePrompt = config.appearance_seeds.join(", ");
  const fullPrompt = `${config.global_mood}. ${scriptClip.visual_description}. Featuring: ${scriptClip.key_object}. Appearance traits: ${appearancePrompt}. Cinematic.`;

  const clipKey = `drama/${storyId}/clips/act_${actNumber}_clip_${clipIndex}.mp4`;

  console.log(`Video Prompt: ${fullPrompt}`);

  const startBase64 = await _downloadBase64(startFrameKey);
  const endBase64 = await _downloadBase64(endFrameKey);

  let generateArgs = {
    model: "veo-2.0-generate-001",
    prompt: fullPrompt,
    // Provide both start and end frames
    inputFrames: [
      {
        id: "frame0",
        image: {
            mimeType: "image/png",
            imageBytes: startBase64
        }
      },
      {
        id: "frame1",
        image: {
            mimeType: "image/png",
            imageBytes: endBase64
        }
      }
    ]
  };

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

  await fs.unlink(tmpVideoPath);

  return { clipKey };
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
  let actionType = null; // 'images' or 'video'

  for (let i = 0; i < lines.length; i++) {
    const actHeader = lines[i].match(/## Act (\d+)/);
    if (actHeader) {
      currentActNum = parseInt(actHeader[1]);
    }

    if (lines[i].startsWith("- [ ] Generate Images for Clip")) {
      const clipMatch = lines[i].match(/Clip (\d+):/);
      targetClipIdx = parseInt(clipMatch[1]);
      targetActNum = currentActNum;
      targetLineIdx = i;
      actionType = 'images';
      break;
    } else if (lines[i].startsWith("- [ ] Generate Video for Clip")) {
      const clipMatch = lines[i].match(/Clip (\d+):/);
      targetClipIdx = parseInt(clipMatch[1]);
      targetActNum = currentActNum;
      targetLineIdx = i;
      actionType = 'video';
      break;
    }
  }

  if (targetLineIdx === -1) {
    return { done: true };
  }

  const act = script.acts.find(a => a.act_number === targetActNum);
  const clip = act.clips[targetClipIdx - 1];

  let startFrameKey = null;

  if (targetClipIdx > 1) {
    // The previous clip's end frame is this clip's start frame
    startFrameKey = `drama/${storyId}/frames/act_${targetActNum}_frame_${targetClipIdx - 1}_end.png`;
  } else if (targetActNum > 1) {
    // The previous act's last clip's end frame is this clip's start frame
    const prevAct = script.acts.find(a => a.act_number === targetActNum - 1);
    startFrameKey = `drama/${storyId}/frames/act_${targetActNum - 1}_frame_${prevAct.clips.length}_end.png`;
  } else if (actionType === 'video') {
    // Clip 1 of Act 1 has a special start frame explicitly generated
    startFrameKey = `drama/${storyId}/frames/act_${targetActNum}_frame_${targetClipIdx}_start.png`;
  }

  if (actionType === 'images') {
    await generateImages(storyId, targetActNum, targetClipIdx, clip, config, startFrameKey);
  } else if (actionType === 'video') {
    const endFrameKey = `drama/${storyId}/frames/act_${targetActNum}_frame_${targetClipIdx}_end.png`;
    await generateVideoClip(storyId, targetActNum, targetClipIdx, clip, config, startFrameKey, endFrameKey);
  }

  lines[targetLineIdx] = lines[targetLineIdx].replace("- [ ]", "- [x]");
  await fs.writeFile(checklistPath, lines.join("\n"));

  return { done: false, nextAct: targetActNum, nextClip: targetClipIdx };
}
