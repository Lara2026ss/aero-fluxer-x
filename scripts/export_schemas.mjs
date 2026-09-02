import fs from "node:fs";
import path from "node:path";
import { createRuntime } from "../core/runtime.mjs";
import { Registry } from "../core/registry.mjs";

function run() {
  createRuntime({ root: "." }).then(async (rt) => {
    const reg = new Registry(rt);
    await reg.load();

    const userProfile = process.env.USERPROFILE || "";
    const geminiMcpDir = path.join(userProfile, ".gemini", "antigravity", "mcp", "fluxer");
    fs.mkdirSync("config/mcp-schemas", { recursive: true });
    fs.mkdirSync(geminiMcpDir, { recursive: true });

    for (const name of reg.moduleNames()) {
      const actions = reg.actionsFor(name);
      const signatures = reg.actionSignatures(name);
      const actionsCheatSheet = actions
        .map(a => `${a}${signatures[a] ? " " + signatures[a] : ""}`)
        .join(" | ");
      const baseDesc = reg.snapshot().modules.find(m => m.name === name)?.description || `Aeron Fluxer X ${name} domain router`;
      const schema = {
        name,
        description: `${baseDesc}\nAcciones e inputs de exactos: ${actionsCheatSheet}`,
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: actions },
            args: { type: "object" }
          },
          required: ["action"]
        }
      };
      fs.writeFileSync(path.join("config/mcp-schemas", `${name}.json`), JSON.stringify(schema, null, 2), "utf8");
      fs.writeFileSync(path.join(geminiMcpDir, `${name}.json`), JSON.stringify(schema, null, 2), "utf8");
      console.log("Schema written for domain:", name, "with", actions.length, "actions");
    }
    await rt.shutdown();
  });
}
run();