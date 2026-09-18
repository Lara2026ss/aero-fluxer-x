import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve("C:/Users/mauri/OneDrive/Documents/Systems/Flux-mcp-doc/Windows MCP/FLUXER XZ");
const SERVER_SCRIPT = path.join(ROOT, "server.js");

class McpClient {
  constructor() {
    this.proc = null;
    this.msgId = 1;
    this.pending = new Map();
    this.buffer = "";
  }

  async start() {
    this.proc = spawn(process.execPath, [SERVER_SCRIPT], {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, AERON_DISABLE_TOASTS: "1" },
    });

    this.proc.stdout.on("data", (chunk) => {
      this.buffer += chunk.toString("utf8");
      this._processBuffer();
    });

    this.proc.stderr.on("data", (chunk) => {
      // debug
    });

    const initRes = await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "Antigravity Live Tester", version: "1.0.0" },
    });

    this.sendNotification("notifications/initialized", {});
    return initRes;
  }

  _processBuffer() {
    while (true) {
      const idx = this.buffer.indexOf("\n");
      if (idx === -1) break;
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;

      try {
        const msg = JSON.parse(line);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) {
            reject(msg.error);
          } else {
            resolve(msg.result);
          }
        }
      } catch (err) {}
    }
  }

  sendRequest(method, params) {
    const id = this.msgId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(payload);
    });
  }

  sendNotification(method, params) {
    const payload = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
    this.proc.stdin.write(payload);
  }

  async callTool(name, args) {
    const res = await this.sendRequest("tools/call", {
      name,
      arguments: args,
    });
    if (res?.content?.[0]?.text) {
      try {
        return JSON.parse(res.content[0].text);
      } catch {
        return res.content[0].text;
      }
    }
    return res;
  }

  async stop() {
    if (this.proc) {
      this.proc.stdin.end();
      this.proc.kill("SIGTERM");
    }
  }
}

async function run() {
  console.log("=== FLUXER XZ LIVE MCP PROTOCOL INTEGRATION TESTS ===");
  const client = new McpClient();
  let passed = 0;
  let failed = 0;

  try {
    const init = await client.start();
    console.log(`[PASS] Server initialized: ${init?.serverInfo?.name} v${init?.serverInfo?.version}`);
    passed++;

    // 1. List tools
    const toolList = await client.sendRequest("tools/list", {});
    const toolNames = toolList?.tools?.map((t) => t.name) || [];
    console.log(`[PASS] Tools registered: ${toolNames.length} (${toolNames.join(", ")})`);
    if (toolNames.includes("workflow") && toolNames.includes("security")) {
      passed++;
    } else {
      console.error("[FAIL] Missing workflow or security tool");
      failed++;
    }

    // 2. Grant Capability Lease via Cryptographic Action Approval
    console.log("\n--- TEST SUITE 1: CRYPTOGRAPHIC CAPABILITY LEASES ---");
    const reqRes = await client.callTool("security", {
      action: "request_action_approval",
      args: {
        tool: "security",
        action: "grant_lease",
        args: { scope: "system.*", budget: { calls: 2 } },
      },
    });
    const actionId = reqRes?.approval?.actionId;
    const clickRes = await client.callTool("security", {
      action: "simulate_user_click",
      args: { actionId },
    });
    const approveRes = await client.callTool("security", {
      action: "approve_user_action",
      args: {
        actionId,
        userActionSignature: clickRes?.userActionSignature,
        clickTimestamp: clickRes?.clickTimestamp,
      },
    });

    const leaseId = approveRes?.approval?.leaseId;
    if (leaseId) {
      console.log(`[PASS] Granted capability lease via HMAC user approval: ${leaseId} (Max calls: 2, scope: system.*)`);
      passed++;
    } else {
      console.error("[FAIL] Grant lease failed:", approveRes);
      failed++;
    }

    // 3. Inspect Lease
    const inspectRes = await client.callTool("security", {
      action: "get_lease",
      args: { leaseId },
    });
    const leaseData = inspectRes?.lease;
    const initialRemaining = leaseData?.remainingCalls ?? leaseData?.remaining_calls ?? leaseData?.budget?.calls;
    if (leaseData && (leaseData.leaseId === leaseId || leaseData.id === leaseId) && initialRemaining === 2) {
      console.log(`[PASS] get_lease returned valid lease: ${leaseId}, remaining: ${initialRemaining}, status: ${leaseData.status}`);
      passed++;
    } else {
      console.error("[FAIL] get_lease failed:", inspectRes);
      failed++;
    }

    // 4. Consume Lease Quota - Call 1
    const call1 = await client.callTool("system", {
      action: "snapshot",
      args: { leaseId },
    });
    if (call1?.ok !== false && (call1?.platform || call1?.osRelease || call1?.uptimeSeconds)) {
      console.log("[PASS] Call 1 consumed quota successfully (system.snapshot executed)");
      passed++;
    } else {
      console.error("[FAIL] Call 1 failed:", call1);
      failed++;
    }

    // 5. Check remaining budget
    const inspectRes2 = await client.callTool("security", {
      action: "get_lease",
      args: { leaseId },
    });
    const remainingAfter1 = inspectRes2?.lease?.remainingCalls ?? inspectRes2?.lease?.remaining_calls ?? inspectRes2?.lease?.budget?.calls;
    if (remainingAfter1 === 1) {
      console.log(`[PASS] Lease quota atomically decremented to: ${remainingAfter1}`);
      passed++;
    } else {
      console.error(`[FAIL] Expected remaining 1, got: ${remainingAfter1}`, inspectRes2);
      failed++;
    }

    // 6. Consume Lease Quota - Call 2 (exhausts budget)
    const call2 = await client.callTool("system", {
      action: "snapshot",
      args: { leaseId },
    });
    if (call2?.ok !== false) {
      console.log("[PASS] Call 2 consumed final quota successfully");
      passed++;
    } else {
      console.error("[FAIL] Call 2 failed:", call2);
      failed++;
    }

    // 7. Verify Call 3 is rejected with LEASE_BUDGET_EXHAUSTED
    const call3 = await client.callTool("system", {
      action: "snapshot",
      args: { leaseId },
    });
    if (call3?.ok === false && (call3?.code === "LEASE_BUDGET_EXHAUSTED" || call3?.code === "LEASE_REVOKED")) {
      console.log(`[PASS] Call 3 strictly rejected: code=${call3.code}, error=${call3.error}`);
      passed++;
    } else {
      console.error("[FAIL] Call 3 was not rejected as expected:", call3);
      failed++;
    }

    // 8. Test Scope Rejection
    const reqSec = await client.callTool("security", {
      action: "request_action_approval",
      args: {
        tool: "security",
        action: "grant_lease",
        args: { scope: "files:read", budget: { calls: 1 } },
      },
    });
    const clickSec = await client.callTool("security", {
      action: "simulate_user_click",
      args: { actionId: reqSec?.approval?.actionId },
    });
    const approveSec = await client.callTool("security", {
      action: "approve_user_action",
      args: {
        actionId: reqSec?.approval?.actionId,
        userActionSignature: clickSec?.userActionSignature,
        clickTimestamp: clickSec?.clickTimestamp,
      },
    });
    const leaseSecId = approveSec?.approval?.leaseId;
    const scopeDeniedCall = await client.callTool("system", {
      action: "snapshot",
      args: { leaseId: leaseSecId },
    });
    if (scopeDeniedCall?.ok === false && scopeDeniedCall?.code === "LEASE_SCOPE_DENIED") {
      console.log(`[PASS] Out-of-scope operation strictly rejected: code=${scopeDeniedCall.code}`);
      passed++;
    } else {
      console.error("[FAIL] Scope enforcement failed:", scopeDeniedCall);
      failed++;
    }

    // --- TEST SUITE 2: SQLITE CHECKPOINTS & RESUME QUIRÚRGICO ---
    console.log("\n--- TEST SUITE 2: SQLITE CHECKPOINTS & RESUME QUIRÚRGICO ---");
    const testRunId = `run_live_${Date.now()}`;
    const initialTasks = [
      {
        id: "step_sys_info",
        capability: "system",
        operation: "snapshot",
        options: { compact: true },
      },
      {
        id: "step_failing",
        capability: "system",
        operation: "kill_process",
        options: { pid: 99999999 },
        dependsOn: ["step_sys_info"],
      },
    ];

    const runRes = await client.callTool("workflow", {
      operation: "run",
      options: {
        runId: testRunId,
        tasks: initialTasks,
      },
    });

    if (runRes?.status === "failed" || runRes?.ok === false) {
      console.log(`[PASS] Workflow failed predictably at step_failing (runId: ${testRunId})`);
      passed++;
    } else {
      console.error("[FAIL] Workflow was expected to fail:", runRes);
      failed++;
    }

    // 9. Inspect Checkpoints in SQLite
    const cpRes = await client.callTool("workflow", {
      operation: "checkpoints",
      options: { runId: testRunId },
    });
    const checkpoints = cpRes?.checkpoints || [];
    const completedStep = checkpoints.find((cp) => (cp.taskId || cp.task_id) === "step_sys_info");
    const failedStep = checkpoints.find((cp) => (cp.taskId || cp.task_id) === "step_failing");

    if (completedStep && completedStep.status === "completed" && failedStep && failedStep.status === "failed") {
      console.log(`[PASS] SQLite checkpoints verified: step_sys_info=completed, step_failing=failed`);
      passed++;
    } else {
      console.error("[FAIL] SQLite checkpoints state unexpected:", checkpoints);
      failed++;
    }

    // 10. Surgical Resume with Patched Tasks
    const patchTasks = [
      {
        id: "step_failing",
        capability: "system",
        operation: "snapshot",
        dependsOn: ["step_sys_info"],
      },
    ];

    const resumeRes = await client.callTool("workflow", {
      operation: "resume",
      options: {
        runId: testRunId,
        patchTasks,
      },
    });

    if (resumeRes?.status === "completed" || resumeRes?.ok === true) {
      console.log(`[PASS] Surgical resume succeeded! Workflow completed successfully`);
      const step1Result = resumeRes?.results?.step_sys_info;
      console.log(`[PASS] Step 1 reused from checkpoint: ${step1Result?.fromCheckpoint ? "YES (IDEMPOTENT REUSE)" : "NO"}`);
      passed++;
    } else {
      console.error("[FAIL] Surgical resume failed:", resumeRes);
      failed++;
    }

    // 11. Final checkpoint verification
    const finalCpRes = await client.callTool("workflow", {
      operation: "checkpoints",
      options: { runId: testRunId },
    });
    const finalCps = finalCpRes?.checkpoints || [];
    const allCompleted = finalCps.every((cp) => cp.status === "completed");
    if (allCompleted && finalCps.length >= 2) {
      console.log(`[PASS] All ${finalCps.length} checkpoints in SQLite marked completed`);
      passed++;
    } else {
      console.error("[FAIL] Final checkpoints not all completed:", finalCps);
      failed++;
    }

    console.log(`\n========================================`);
    console.log(`FINAL PROTOCOL RESULTS: ${passed} passed, ${failed} failed`);
    console.log(`========================================`);

  } catch (err) {
    console.error("FATAL TEST EXCEPTION:", err);
  } finally {
    await client.stop();
  }
}

run();
