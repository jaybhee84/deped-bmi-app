import { RELEASE_NOTES } from "../src/data/releaseNotes.js";
import fs from "fs";

const version = process.argv[2];
const entry = RELEASE_NOTES[version];

if (!entry) {
  console.error(`No release notes found for version ${version} in releaseNotes.js`);
  process.exit(1);
}

let md = `## ${entry.title}\n\n`;
entry.sections.forEach((section) => {
  md += `### ${section.heading}\n`;
  section.items.forEach((item) => {
    md += `- ${item}\n`;
  });
  md += `\n`;
});

fs.writeFileSync("RELEASE_BODY.md", md);
console.log(md);