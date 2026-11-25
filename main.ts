// Real-font rebuild: the image beside this file was rendered in-session
// from the page source (system fonts, headless browser screenshot) and
// verified at full size and at phone-preview sizes. The program copies
// it to the output directory, the shape the kit starter uses. Node
// standard library only; no network; the copy is byte-identical.
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
const src = new URL("./entry.png", import.meta.url);
const dest = join(outDir, "entry.png");
copyFileSync(src, dest);
// A short write must never pass silently: the output has to be the whole image.
if (statSync(src).size !== statSync(dest).size) {
  throw new Error("entry.png copy is incomplete");
}
