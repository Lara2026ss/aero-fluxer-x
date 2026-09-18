/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚡ FLUXER XZ (V4.0 Architecture) — tools/workflow.mjs
 * DAG Workflow Capability Domain: Parallel execution, template orchestration,
 * cycle validation, and error rollbacks.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { WorkflowEngine } from "../core/workflow-engine.mjs";

export function createWorkflowDomain({ runtime, router, capabilityRegistry, domain }) {
  const engine = new WorkflowEngine({
    runtime,
    router: router || runtime?.router,
    capabilityRegistry: capabilityRegistry || runtime?.capabilityRegistry,
  });

  // Attach engine to runtime for global access
  if (runtime) {
    runtime.workflowEngine = engine;
  }

  const actions = {
    // ── 1. Run DAG Workflow ──────────────────────────────────────────────────
    run: async (params = {}) => {
      const tasks = params.tasks || params.steps || [];
      const input = params.input || {};
      const concurrency = Number(params.concurrency) || 4;
      const rollbackOnError = Boolean(params.rollbackOnError || params.rollback);
      const timeoutMs = Number(params.timeoutMs) || 120000;

      // Ensure engine has active router
      if (!engine.router && runtime?.router) {
        engine.router = runtime.router;
      }

      const result = await engine.run({
        tasks,
        input,
        concurrency,
        rollbackOnError,
        timeoutMs,
        checkpoint: params.checkpoint !== false,
        runId: params.runId || params.run_id || null,
      });

      return result;
    },

    // ── 2. Validate DAG Workflow ─────────────────────────────────────────────
    validate: async (params = {}) => {
      const tasks = params.tasks || params.steps || [];
      return engine.validate(tasks);
    },

    // ── 3. Workflow Templates ────────────────────────────────────────────────
    template: async (params = {}) => {
      const templateId = params.templateId || params.id || params.name;
      const execute = Boolean(params.run || params.execute);

      if (!templateId) {
        return {
          ok: true,
          templates: engine.listTemplates(),
          summary: "List of available built-in workflow templates. Pass { templateId: '...', run: true } to execute.",
        };
      }

      const tpl = engine.getTemplate(templateId);
      if (!tpl) {
        return {
          ok: false,
          code: "TEMPLATE_NOT_FOUND",
          error: `Workflow template '${templateId}' does not exist. Available: ${engine.listTemplates().map((t) => t.id).join(", ")}`,
        };
      }

      if (execute) {
        if (!engine.router && runtime?.router) {
          engine.router = runtime.router;
        }
        return engine.run({
          tasks: tpl.tasks,
          input: params.input || params.params || {},
        });
      }

      return {
        ok: true,
        template: tpl,
        summary: `Template '${tpl.name}': ${tpl.description} (${tpl.tasks.length} tasks). Run with { templateId: '${tpl.id}', run: true }.`,
      };
    },

    // ── 4. Workflow Status ───────────────────────────────────────────────────
    status: async (params = {}) => {
      const workflowId = params.workflowId || params.id;
      if (!workflowId) {
        return {
          ok: true,
          activeWorkflows: Array.from(engine.activeWorkflows.keys()),
          recentRuns: engine.listRuns({ limit: 10 }),
          summary: "Pass workflowId to inspect details of a specific execution.",
        };
      }

      const run = engine.getRun(workflowId);
      const checkpoints = engine.getCheckpoints(workflowId);

      return {
        ok: true,
        workflowId,
        run: run || null,
        checkpoints,
      };
    },

    // ── 5. Resume DAG Workflow ───────────────────────────────────────────────
    resume: async (params = {}) => {
      const runId = params.runId || params.run_id || params.id;
      const fromStep = params.fromStep || params.from_step || params.step || null;
      const patchInput = params.patchInput || params.patch_input || params.input || {};
      const patchTasks = params.patchTasks || params.patch_tasks || null;
      const concurrency = Number(params.concurrency) || 4;
      const rollbackOnError = Boolean(params.rollbackOnError || params.rollback);
      const timeoutMs = Number(params.timeoutMs) || 120000;

      if (!engine.router && runtime?.router) {
        engine.router = runtime.router;
      }

      return engine.resume({
        runId,
        fromStep,
        patchInput,
        patchTasks,
        concurrency,
        rollbackOnError,
        timeoutMs,
      });
    },

    // ── 6. List Runs ─────────────────────────────────────────────────────────
    runs: async (params = {}) => {
      const limit = Number(params.limit) || 20;
      const status = params.status || null;
      return {
        ok: true,
        runs: engine.listRuns({ limit, status }),
      };
    },

    // ── 7. Get Checkpoints ───────────────────────────────────────────────────
    checkpoints: async (params = {}) => {
      const runId = params.runId || params.run_id || params.id;
      if (!runId) {
        return { ok: false, code: "INVALID_ARGUMENT", error: "runId is required to view checkpoints." };
      }
      return {
        ok: true,
        runId,
        run: engine.getRun(runId),
        checkpoints: engine.getCheckpoints(runId),
      };
    },
  };

  const permissions = {
    run: "standard",
    validate: "standard",
    template: "standard",
    status: "standard",
    resume: "standard",
    runs: "standard",
    checkpoints: "standard",
  };

  if (typeof domain === "function") {
    return domain(
      "workflow",
      "DAG Workflow Orchestration Engine — Parallel execution, dependency sorting, cycle detection, templating, and rollback.",
      actions,
      permissions
    );
  }

  return {
    name: "workflow",
    description: "DAG Workflow Orchestration Engine — Parallel execution, dependency sorting, cycle detection, templating, and rollback.",
    actions,
    permissions,
  };
}
