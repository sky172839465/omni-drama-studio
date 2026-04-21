import { runDirector } from "./agents/director.js";
import { runAudioTech } from "./agents/audio-tech.js";
import { runEditor } from "./agents/editor.js";
import fs from "fs/promises";
import path from "path";

async function main() {
  const storyId = process.argv[2];
  if (!storyId) {
    console.error("Please provide storyId");
    process.exit(1);
  }

  // Production loop logic
  const directorResult = await runDirector(storyId);

  if (directorResult.done) {
    console.log("Director finished all clips.");
  } else {
    // Check if an Act was just finished to trigger sub-edit
    const checklistPath = path.join("drama", storyId, "checklist.md");
    const checklist = await fs.readFile(checklistPath, "utf-8");
    const lines = checklist.split("\n");

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("- [ ] Sub-Edit Act") ) {
            // Check if all clips in the previous section are done
            let allClipsDone = true;
            let j = i - 1;
            while (j >= 0 && lines[j].startsWith("- [")) {
                if (lines[j].startsWith("- [ ] Clip")) {
                    allClipsDone = false;
                    break;
                }
                j--;
            }

            if (allClipsDone) {
                const actMatch = lines[i].match(/Act (\d+)/);
                if (actMatch) {
                    const actNum = actMatch[1];
                    console.log(`Triggering Sub-Edit for Act ${actNum}`);
                    await runEditor(storyId, "sub", actNum);
                    lines[i] = lines[i].replace("- [ ]", "- [x]");
                    await fs.writeFile(checklistPath, lines.join("\n"));
                }
            }
        }
    }
  }
}

// If running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
