import { askGeminiStructured } from "../utils/gemini.js";
import fs from "fs/promises";
import path from "path";

const designerSchema = {
  type: "object",
  properties: {
    concepts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", enum: ["A", "B", "C"] },
          description: { type: "string" },
          prompt: { type: "string" },
          appearance_seeds: {
            type: "array",
            items: { type: "string" },
            minItems: 5,
            maxItems: 5
          }
        },
        required: ["id", "description", "prompt", "appearance_seeds"]
      },
      minItems: 3,
      maxItems: 3
    }
  },
  required: ["concepts"]
};

export async function runDesigner(storyId) {
  const scriptPath = path.join("drama", storyId, "script.json");
  const scriptData = JSON.parse(await fs.readFile(scriptPath, "utf-8"));

  const prompt = `
    Based on the following SCP script, create 3 distinct visual concepts (A, B, C) for the main characters or entities.
    For each concept, provide:
    - description: A brief overview of the visual style.
    - prompt: A detailed prompt for an image generator to create a reference image.
    - appearance_seeds: Exactly 5 key visual traits (e.g., "glowing red eyes", "tattered lab coat") to ensure consistency.

    Script Summary:
    Title: ${scriptData.title}
    Global Mood: ${scriptData.global_mood}
    Key Objects: ${scriptData.acts.flatMap(a => a.clips.map(c => c.key_object)).join(", ")}
  `;

  const design = await askGeminiStructured(prompt, designerSchema);

  // Save designs to story folder
  await fs.writeFile(path.join("drama", storyId, "design.json"), JSON.stringify(design, null, 2));

  return design;
}
