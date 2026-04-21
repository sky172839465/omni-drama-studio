import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execPromise = promisify(exec);

export async function processVideoClip(inputPath, outputPath, targetDuration) {
  const { stdout } = await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`);
  const actualDuration = parseFloat(stdout.trim());
  const ratio = actualDuration / targetDuration;

  const command = `ffmpeg -i "${inputPath}" -y -filter:v "setpts=${1/ratio}*PTS,fps=30" -t ${targetDuration} "${outputPath}"`;
  await execPromise(command);
}

export async function mergeVideos(inputPaths, outputPath) {
  const listFile = `concat_list_${Date.now()}.txt`;
  const listContent = inputPaths.map(p => `file '${path.resolve(p)}'`).join('\n');
  await fs.writeFile(listFile, listContent);

  try {
    // -f concat -safe 0 is standard for merging files with a list
    const command = `ffmpeg -f concat -safe 0 -i ${listFile} -c copy ${outputPath}`;
    await execPromise(command);
  } finally {
    await fs.unlink(listFile);
  }
}
