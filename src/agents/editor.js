import { downloadFromR2, uploadToR2 } from "../utils/r2.js";
import { processVideoClip, mergeVideos } from "../utils/ffmpeg.js";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

export async function subEditAct(storyId, actNumber) {
  console.log(`Sub-editing Act ${actNumber} for ${storyId}`);

  const scriptPath = path.join("drama", storyId, "script.json");
  const script = JSON.parse(await fs.readFile(scriptPath, "utf-8"));
  const act = script.acts.find(a => a.act_number === actNumber);

  const processedClipPaths = [];

  for (let i = 0; i < act.clips.length; i++) {
    const clipIndex = i + 1;
    const clip = act.clips[i];
    const clipKey = `drama/${storyId}/clips/act_${actNumber}_clip_${clipIndex}.mp4`;

    const clipBuffer = await downloadFromR2(clipKey);
    // Needs converting to Buffer because downloadFromR2 returns a stream/Uint8Array depending on SDK version
    const buffer = Buffer.isBuffer(clipBuffer) ? clipBuffer : Buffer.from(await clipBuffer.transformToByteArray());

    const inputPath = path.join(os.tmpdir(), `input_act_${actNumber}_clip_${clipIndex}.mp4`);
    const outputPath = path.join(os.tmpdir(), `output_act_${actNumber}_clip_${clipIndex}.mp4`);

    await fs.writeFile(inputPath, buffer);

    await processVideoClip(inputPath, outputPath, clip.duration);
    processedClipPaths.push(outputPath);

    await fs.unlink(inputPath);
  }

  const mergedVideoPath = path.join(os.tmpdir(), `merged_act_${actNumber}.mp4`);
  await mergeVideos(processedClipPaths, mergedVideoPath);

  const mergedVideoBuffer = await fs.readFile(mergedVideoPath);
  const actVideoKey = `drama/${storyId}/videos/act_${actNumber}_full.mp4`;
  await uploadToR2(actVideoKey, mergedVideoBuffer, "video/mp4");

  // Cleanup
  for (const p of processedClipPaths) {
    await fs.unlink(p);
  }
  await fs.unlink(mergedVideoPath);

  return { actVideoKey };
}

export async function finalAssembly(storyId) {
  console.log(`Final assembly for ${storyId}`);

  const scriptPath = path.join("drama", storyId, "script.json");
  const script = JSON.parse(await fs.readFile(scriptPath, "utf-8"));

  const actPaths = [];
  for (const act of script.acts) {
    const actVideoKey = `drama/${storyId}/videos/act_${act.act_number}_full.mp4`;
    const actBuffer = await downloadFromR2(actVideoKey);
    const buffer = Buffer.isBuffer(actBuffer) ? actBuffer : Buffer.from(await actBuffer.transformToByteArray());
    const actPath = path.join(os.tmpdir(), `act_${act.act_number}_full.mp4`);
    await fs.writeFile(actPath, buffer);
    actPaths.push(actPath);
  }

  const allActsVideoPath = path.join(os.tmpdir(), `all_acts.mp4`);
  await mergeVideos(actPaths, allActsVideoPath);

  const masterAudioKey = `drama/${storyId}/audio/master_bgm.wav`;
  const audioBuffer = await downloadFromR2(masterAudioKey);
  const buffer = Buffer.isBuffer(audioBuffer) ? audioBuffer : Buffer.from(await audioBuffer.transformToByteArray());
  const audioPath = path.join(os.tmpdir(), `master_bgm.wav`);
  await fs.writeFile(audioPath, buffer);

  const finalVideoPath = path.join(os.tmpdir(), `final_video.mp4`);

  // Combine video and audio
  await execPromise(`ffmpeg -i "${allActsVideoPath}" -i "${audioPath}" -c:v copy -c:a aac -shortest "${finalVideoPath}" -y`);

  const finalVideoBuffer = await fs.readFile(finalVideoPath);
  const finalVideoKey = `drama/${storyId}/final_video.mp4`;
  await uploadToR2(finalVideoKey, finalVideoBuffer, "video/mp4");

  // Cleanup
  for (const p of actPaths) {
    await fs.unlink(p);
  }
  await fs.unlink(allActsVideoPath);
  await fs.unlink(audioPath);
  await fs.unlink(finalVideoPath);

  return { finalVideoKey };
}

export async function runEditor(storyId, type, actNumber = null) {
  if (type === "sub") {
    return await subEditAct(storyId, actNumber);
  } else {
    return await finalAssembly(storyId);
  }
}
