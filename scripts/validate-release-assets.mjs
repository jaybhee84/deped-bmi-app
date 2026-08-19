import fs from "node:fs";
import path from "node:path";

const releaseDir = path.resolve(process.argv[2] || "release");
const metadataFiles = fs
  .readdirSync(releaseDir)
  .filter((name) => /^latest.*\.ya?ml$/i.test(name));

if (metadataFiles.length === 0) {
  throw new Error(`No updater metadata found in ${releaseDir}`);
}

const missingAssets = [];

for (const metadataFile of metadataFiles) {
  const metadata = fs.readFileSync(path.join(releaseDir, metadataFile), "utf8");
  const urls = [...metadata.matchAll(/^\s*(?:-\s*)?url:\s*(.+?)\s*$/gm)].map(
    ([, value]) => value.replace(/^['"]|['"]$/g, ""),
  );

  if (urls.length === 0) {
    throw new Error(`${metadataFile} does not contain any update asset URLs`);
  }

  for (const url of urls) {
    const assetName = path.basename(decodeURIComponent(url));
    if (!fs.existsSync(path.join(releaseDir, assetName))) {
      missingAssets.push(`${metadataFile} -> ${assetName}`);
    }
  }
}

if (missingAssets.length > 0) {
  throw new Error(
    `Updater metadata references missing assets:\n${missingAssets.join("\n")}`,
  );
}

console.log(
  `Validated ${metadataFiles.length} updater metadata file(s): every referenced asset exists.`,
);
