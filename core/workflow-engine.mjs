/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚡ FLUXER XZ (V4.0 Architecture) — core/workflow-engine.mjs
 * Directed Acyclic Graph (DAG) Workflow Execution Engine.
 * Parallel execution, topological dependency resolution, cycle detection,
 * variable templating, concurrency limiting, and step rollback.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import crypto from "node:crypto";

/**
 * Resolves template expressions like {{tasks.step1.data.path}} or {{input.target}}
 */
export function resolveTemplate(value, context) {
  if (typeof value === "string") {
    // Exact match for entire string replacement preserving object/array types
    const exactMatch = value.match(/^\{\{([^}]+)\}\}$/);
    if (exactMatch) {
      const path = exactMatch[1].trim();
      const resolved = getValueByPath(context, path);
      return resolved !== undefined ? resolved : value;
    }

    // In-string interpolation
    return value.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
      const resolved = getValueByPath(context, path.trim());
      return resolved !== undefined ? String(resolved) : `{{${path}}}`;
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplate(item, context));
  }

  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveTemplate(v, context);
    }
    return out;
  }

  return value;
}

function getValueByPath(obj, pathStr) {
  const parts = pathStr.split(".");
  let curr = obj;
  for (const part of parts) {
    if (curr === null || curr === undefined) return undefined;
    curr = curr[part];
  }
  return curr;
}

/**
 * Built-in workflow templates
 */
export const WORKFLOW_TEMPLATES = {
  system_health_audit: {
    id: "system_health_audit",
    name: "System Health & Security Audit",
    description: "Multi-point diagnostic: Windows OS telemetry, network connectivity, security status, and storage check.",
    tasks: [
      { id: "sys_snap", capability: "system", operation: "snapshot", options: { compact: true } },
      { id: "net_check", capability: "network", operation: "test_connection", options: {} },
      { id: "sec_status", capability: "security", operation: "status", options: {} },
      {
        id: "summary_report",
        capability: "guide",
        operation: "overview",
        dependsOn: ["sys_snap", "net_check", "sec_status"],
        options: { mode: "compact" },
      },
    ],
  },
  dev_clean_prep: {
    id: "dev_clean_prep",
    name: "Development Workspace Preparation",
    description: "Detects current project, optimizes RAM working sets, and verifies git repository cleanliness.",
    tasks: [
      { id: "detect_proj", capability: "developer", operation: "detect_project", options: {} },
      { id: "ram_cleanup", capability: "system", operation: "optimize_ram", options: {} },
      {
        id: "git_status",
        capability: "developer",
        operation: "git",
        dependsOn: ["detect_proj"],
        options: { subaction: "status" },
      },
    ],
  },
  flstudio_session_prep: {
    id: "flstudio_session_prep",
    name: "FL Studio 2026 Session Preparation",
    description: "Checks physical installation, launches DAW if offline, verifies bridge connection, and focuses Channel Rack.",
    tasks: [
      { id: "fl_detect", capability: "flstudio", operation: "detect", options: {} },
      { id: "fl_bridge", capability: "flstudio", operation: "bridge_status", dependsOn: ["fl_detect"], options: {} },
      { id: "fl_view", capability: "flstudio", operation: "view", dependsOn: ["fl_detect"], options: { window: "channel_rack" } },
    ],
  },
  media_audit: {
    id: "media_audit",
    name: "Visual Media Audit",
    description: "Captures full desktop and lists recent captures in Pictures directory.",
    tasks: [
      { id: "snap_screen", capability: "media", operation: "desktop", options: {} },
      {
        id: "list_captures",
        capability: "files",
        operation: "list",
        dependsOn: ["snap_screen"],
        options: { path: "{{tasks.snap_screen.data.folder}}", depth: 1 },
      },
    ],
  },
};

export class WorkflowEngine {
  constructor({ runtime = null, router = null, capabilityRegistry = null } = {}) {
    this.runtime = runtime;
    this.router = router;
    this.capabilityRegistry = capabilityRegistry;
    this.activeWorkflows = new Map();
  }

  /**
   * Validates DAG tasks for cycle detection and structural integrity
   */
  validate(tasks = []) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return { ok: false, error: "Workflow tasks must be a non-empty array." };
    }

    const taskIds = new Set();
    const adj = new Map();
    const inDegree = new Map();

    for (const task of tasks) {
      if (!task.id || typeof task.id !== "string") {
        return { ok: false, error: `Task missing valid 'id': ${JSON.stringify(task)}` };
      }
      if (taskIds.has(task.id)) {
        return { ok: false, error: `Duplicate task id '${task.id}' found in workflow.` };
      }
      taskIds.add(task.id);
      adj.set(task.id, []);
      inDegree.set(task.id, 0);
    }

    // Build dependency graph
    for (const task of tasks) {
      const deps = task.dependsOn || task.dependencies || [];
      if (!Array.isArray(deps)) {
        return { ok: false, error: `Task '${task.id}' has invalid 'dependsOn', must be an array.` };
      }
      for (const dep of deps) {
        if (!taskIds.has(dep)) {
          return { ok: false, error: `Task '${task.id}' depends on non-existent task '${dep}'.` };
        }
        adj.get(dep).push(task.id);
        inDegree.set(task.id, inDegree.get(task.id) + 1);
      }
    }

    // Kahn's algorithm for cycle detection
    const queue = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    let visitedCount = 0;
    const executionOrder = [];

    while (queue.length > 0) {
      const u = queue.shift();
      visitedCount++;
      executionOrder.push(u);

      for (const v of adj.get(u)) {
        inDegree.set(v, inDegree.get(v) - 1);
        if (inDegree.get(v) === 0) {
          queue.push(v);
        }
      }
    }

    if (visitedCount !== tasks.length) {
      return {
        ok: false,
        error: "Workflow DAG contains cyclic dependencies (cycle detected). Tasks cannot form loops.",
      };
    }

    return {
      ok: true,
      taskCount: tasks.length,
      executionOrder,
    };
  }

  /**
   * Executes a DAG workflow
   */
  async run({
    tasks = [],
    input = {},
    concurrency = 4,
    rollbackOnError = false,
    timeoutMs = 120000,
  } = {}) {
    const validation = this.validate(tasks);
    if (!validation.ok) {
      return {
        ok: false,
        code: "INVALID_DAG",
        error: validation.error,
        summary: `Workflow validation failed: ${validation.error}`,
      };
    }

    const workflowId = `wf_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
    const startTime = performance.now();
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const taskResults = {};
    const taskStates = new Map(); // id -> 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
    const completedTasks = [];
    const failedTasks = [];

    for (const task of tasks) {
      taskStates.set(task.id, "pending");
    }

    const executionContext = {
      workflowId,
      input,
      tasks: taskResults,
    };

    const taskDependents = new Map();
    const remainingDeps = new Map();

    for (const task of tasks) {
      const deps = task.dependsOn || task.dependencies || [];
      remainingDeps.set(task.id, deps.length);
      for (const dep of deps) {
        if (!taskDependents.has(dep)) taskDependents.set(dep, []);
        taskDependents.get(dep).push(task.id);
      }
    }

    // Ready queue contains tasks with 0 pending dependencies
    const readyQueue = [];
    for (const task of tasks) {
      if (remainingDeps.get(task.id) === 0) {
        readyQueue.push(task.id);
      }
    }

    let activeCount = 0;
    let aborted = false;
    let abortReason = null;

    // Helper to execute a single task
    const executeTask = async (taskId) => {
      const taskDef = taskMap.get(taskId);
      taskStates.set(taskId, "running");
      const taskStart = performance.now();

      try {
        // Resolve templates in target and options
        const resolvedTarget = taskDef.target ? resolveTemplate(taskDef.target, executionContext) : null;
        const resolvedOptions = taskDef.options ? resolveTemplate(taskDef.options, executionContext) : {};
        if (resolvedTarget && !resolvedOptions.target) {
          resolvedOptions.target = resolvedTarget;
        }

        const cap = taskDef.capability || taskDef.tool || "system";
        const op = taskDef.operation || taskDef.action || "default";

        let result;
        if (this.router) {
          result = await this.router.execute({
            capability: cap,
            operation: op,
            tool: cap,
            action: op,
            options: resolvedOptions,
            args: resolvedOptions,
            target: resolvedTarget,
          });
        } else {
          result = { ok: true, message: `Task ${taskId} simulated (no router attached)` };
        }

        const taskDurationMs = Math.round(performance.now() - taskStart);
        const isOk = result?.ok !== false && !result?.error;

        taskResults[taskId] = {
          ok: isOk,
          id: taskId,
          capability: cap,
          operation: op,
          durationMs: taskDurationMs,
          data: result?.data !== undefined ? result.data : result,
          ...(result?.error ? { error: result.error, code: result.code } : {}),
        };

        if (isOk) {
          taskStates.set(taskId, "completed");
          completedTasks.push(taskId);
        } else {
          taskStates.set(taskId, "failed");
          failedTasks.push({ id: taskId, error: result?.error || "Task failed" });
          if (!taskDef.continueOnError) {
            aborted = true;
            abortReason = `Task '${taskId}' failed: ${result?.error || "unknown error"}`;
          }
        }
      } catch (err) {
        const taskDurationMs = Math.round(performance.now() - taskStart);
        taskStates.set(taskId, "failed");
        failedTasks.push({ id: taskId, error: err.message });
        taskResults[taskId] = {
          ok: false,
          id: taskId,
          durationMs: taskDurationMs,
          error: err.message,
          code: "TASK_EXCEPTION",
        };
        if (!taskDef.continueOnError) {
          aborted = true;
          abortReason = `Task '${taskId}' threw exception: ${err.message}`;
        }
      }
    };

    // Main parallel orchestration loop
    await new Promise((resolve) => {
      const step = () => {
        if (aborted) {
          // Mark remaining pending tasks as skipped
          for (const [id, st] of taskStates.entries()) {
            if (st === "pending") taskStates.set(id, "skipped");
          }
          if (activeCount === 0) resolve();
          return;
        }

        while (readyQueue.length > 0 && activeCount < concurrency && !aborted) {
          const taskId = readyQueue.shift();
          activeCount++;

          executeTask(taskId).finally(() => {
            activeCount--;

            if (!aborted) {
              const dependents = taskDependents.get(taskId) || [];
              for (const depId of dependents) {
                const curRemaining = remainingDeps.get(depId) - 1;
                remainingDeps.set(depId, curRemaining);
                if (curRemaining === 0) {
                  readyQueue.push(depId);
                }
              }
            }

            if (activeCount === 0 && (readyQueue.length === 0 || aborted)) {
              resolve();
            } else {
              step();
            }
          });
        }

        if (activeCount === 0 && readyQueue.length === 0) {
          resolve();
        }
      };

      step();
    });

    const totalDurationMs = Math.round(performance.now() - startTime);

    // Rollback handling if requested and failure occurred
    const rollbackLog = [];
    if (aborted && rollbackOnError && completedTasks.length > 0) {
      // Execute rollback in reverse order
      const reversedCompleted = [...completedTasks].reverse();
      for (const taskId of reversedCompleted) {
        const taskDef = taskMap.get(taskId);
        if (taskDef.rollback && this.router) {
          try {
            const rbCap = taskDef.rollback.capability || taskDef.rollback.tool || taskDef.capability;
            const rbOp = taskDef.rollback.operation || taskDef.rollback.action;
            const rbOpts = resolveTemplate(taskDef.rollback.options || {}, executionContext);
            const rbRes = await this.router.execute({
              capability: rbCap,
              operation: rbOp,
              options: rbOpts,
              args: rbOpts,
            });
            rollbackLog.push({ taskId, ok: true, result: rbRes });
          } catch (rbErr) {
            rollbackLog.push({ taskId, ok: false, error: rbErr.message });
          }
        }
      }
    }

    const isSuccess = !aborted && failedTasks.length === 0;
    const summary = isSuccess
      ? `Workflow '${workflowId}' completed all ${completedTasks.length} tasks in ${totalDurationMs}ms.`
      : `Workflow '${workflowId}' aborted: ${abortReason || `${failedTasks.length} task(s) failed.`}`;

    return {
      ok: isSuccess,
      workflowId,
      totalTasks: tasks.length,
      completed: completedTasks.length,
      failed: failedTasks.length,
      durationMs: totalDurationMs,
      summary,
      results: taskResults,
      states: Object.fromEntries(taskStates),
      ...(failedTasks.length ? { errors: failedTasks } : {}),
      ...(rollbackLog.length ? { rollbackLog } : {}),
    };
  }

  getTemplate(templateId) {
    return WORKFLOW_TEMPLATES[templateId] || null;
  }

  listTemplates() {
    return Object.values(WORKFLOW_TEMPLATES).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      taskCount: t.tasks.length,
    }));
  }
}
