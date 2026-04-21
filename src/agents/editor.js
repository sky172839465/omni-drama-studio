import { downloadFromR2, uploadToR2 } from "../utils/r2.js";
import { processVideoClip, mergeVideos } from "../utils/ffmpeg.js";
import fs from "fs/promises";
import path from "path";

export async function subEditAct(storyId, actNumber) {
  console.log(`Sub-editing Act ${actNumber} for ${storyId}`);
  // 1. Download all clips for this act from R2
  // 2. Process each clip to 30fps and exact duration
  // 3. Merge them
  // 4. Upload act_{n}_full.mp4 to R2

  const actVideoKey = `drama/${storyId}/videos/act_${actNumber}_full.mp4`;
  return { actVideoKey };
}

export async function finalAssembly(storyId) {
  console.log(`Final assembly for ${storyId}`);
  // 1. Download all act videos
  // 2. Download master audio
  // 3. Combine video and audio using FFmpeg
  // 4. Upload final_video.mp4

  const finalVideoKey = `drama/${storyId}/final_video.mp4`;
  return { finalVideoKey };
}

export async function runEditor(storyId, type, actNumber = null) {
  if (type === "sub") {
    return await subEditAct(storyId, actNumber);
  } else {
    return await finalAssembly(storyId);
  }
}
