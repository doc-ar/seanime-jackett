// Produces manifest.bundle.json with inline payload — push this file to GitHub.
// Usage: node bundle.mjs [--github-raw-url <url>]
import { execSync } from "child_process"
import { readFileSync, writeFileSync } from "fs"

execSync("npx tsc", { stdio: "inherit" })

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"))
const payload = readFileSync("dist/main.js", "utf8")

const args = process.argv.slice(2)
const urlIdx = args.indexOf("--github-raw-url")
const manifestURI = urlIdx !== -1 ? args[urlIdx + 1] : undefined

const bundle = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    type: manifest.type,
    language: manifest.language,
    author: manifest.author,
    description: manifest.description,
    ...(manifestURI ? { manifestURI } : {}),
    userConfig: manifest.userConfig,
    payload,
}

writeFileSync("manifest.bundle.json", JSON.stringify(bundle, null, 4))
console.log("manifest.bundle.json ready — push this file to GitHub")
if (!manifestURI) {
    console.log("Tip: run again with --github-raw-url <raw-url-of-manifest.bundle.json> to enable auto-updates")
}
