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
          summary: "Pass workflowId to inspect details of a specific execution.",
        };
      }

      const wf = engine.activeWorkflows.get(workflowId);
      if (!wf) {
        return {
          ok: false,
          code: "NOT_FOUND",
          error: `Workflow with ID '${workflowId}' not found in active session memory.`,
        };
      }

      return { ok: true, workflow: wf };
    },
  };

  const permissions = {
    run: "standard",
    validate: "standard",
    template: "standard",
    status: "standard",
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
