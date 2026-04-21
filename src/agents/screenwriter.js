import { askGeminiStructured } from "../utils/gemini.js";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import slugify from "slugify";

const execPromise = promisify(exec);

export async function crawlSCP(url) {
  // Use agent-browser to get a snapshot of the page
  // npm install -g agent-browser && agent-browser install
  // Command: agent-browser open <url> --snapshot -i
  console.log(`Crawling SCP: ${url}`);
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const { stdout } = await execPromise(`agent-browser open "${url}" snapshot -i`);
      return stdout;
    } catch (error) {
      attempt++;
      console.error(`Crawl error (attempt ${attempt}/${maxRetries}):`, error);
      if (attempt >= maxRetries) {
        throw error;
      }
      // Exponential backoff: 1s, 2s, 4s...
      const delay = Math.pow(2, attempt - 1) * 1000;
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

const scriptSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    acts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          act_number: { type: "number" },
          clips: {
            type: "array",
            items: {
              type: "object",
              properties: {
                timestamp: { type: "string" },
                duration: { type: "number" },
                visual_description: { type: "string" },
                dialogue: { type: "string" },
                sound_vibe: { type: "string" },
                key_object: { type: "string" }
              },
              required: ["timestamp", "duration", "visual_description", "dialogue", "sound_vibe", "key_object"]
            }
          }
        },
        required: ["act_number", "clips"]
      }
    },
    global_mood: { type: "string" }
  },
  required: ["title", "acts", "global_mood"]
};

export async function generateScript(content) {
  const prompt = `
    Transform the following SCP Foundation article content into a cinematic storyboard script for a 10-15 minute video.
    The script should be divided into Acts (approx 2-3 minutes each).
    Each clip should be between 4 to 8 seconds.
    For each clip, provide:
    - timestamp: Current time in the video (MM:SS)
    - duration: Exact duration in seconds (4.0 to 8.0)
    - visual_description: Detailed cinematic description for video generation.
    - dialogue: Narrative or character dialogue.
    - sound_vibe: Background music and SFX description including specific musical terms.
    - key_object: The main focus of the shot.

    Also provide a 'global_mood' for the entire video to ensure color and tone consistency.

    SCP Content:
    ${content}
  `;

  return await askGeminiStructured(prompt, scriptSchema);
}

export async function runScreenwriter(url) {
  const content = await crawlSCP(url);
  const script = await generateScript(content);

  const scpIdMatch = url.match(/scp-([a-z0-9-]+)/i);
  const scpId = scpIdMatch ? scpIdMatch[0].toLowerCase() : "unknown";
  const slugifiedTitle = slugify(script.title, { lower: true, strict: true });
  const storyId = `${scpId}-${slugifiedTitle}`;

  const storyDir = path.join("drama", storyId);
  await fs.mkdir(storyDir, { recursive: true });

  await fs.writeFile(path.join(storyDir, "script.json"), JSON.stringify(script, null, 2));

  // Generate checklist.md
  let checklist = `# Story: ${script.title} (${scpId})\n\n`;
  script.acts.forEach(act => {
    checklist += `## Act ${act.act_number}\n`;
    act.clips.forEach((clip, index) => {
      checklist += `- [ ] Clip ${index + 1}: ${clip.key_object} (${clip.duration}s) - ${clip.visual_description.substring(0, 50)}...\n`;
    });
    checklist += `- [ ] Sub-Edit Act ${act.act_number}\n\n`;
  });
  checklist += `## Final Assembly\n- [ ] Master Audio Sync\n- [ ] Final Export\n`;

  await fs.writeFile(path.join(storyDir, "checklist.md"), checklist);

  return { storyId, scriptPath: path.join(storyDir, "script.json"), checklistPath: path.join(storyDir, "checklist.md") };
}
