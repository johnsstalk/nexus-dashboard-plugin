import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = import.meta.dirname;
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf-8"));
const version = manifest.version;

const versions = JSON.parse(readFileSync(join(ROOT, "versions.json"), "utf-8"));
versions[version] = manifest.minAppVersion;

writeFileSync(join(ROOT, "versions.json"), JSON.stringify(versions, null, "\t") + "\n");
console.log(`[version-bump] ${version} → versions.json`);
