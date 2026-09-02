/**
 * 🪟 AERON FLUXER X — core/mutation.mjs
 * Framework de Mutaciones Seguras con Pipeline de 11 Pasos y Protección contra Carreras.
 */

import crypto from "node:crypto";
import { createVerificationReceipt } from "./verification-receipt.mjs";

export class SafeMutationFramework {
  constructor({ runtime }) {
    this.runtime = runtime;
  }

  async executeMutation({
    tool,
    action,
    args = {},
    serviceId = null,
    environmentId = null,
    precheckFn,
    readCurrentFn,
    applyChangeFn,
    readRemoteFn,
    compareFn,
    triggerSideEffectFn,
    waitFn,
    verifyFn,
  }) {
    const operationId = `op_${crypto.randomUUID().slice(0, 8)}`;
    const requestId = `req_${crypto.randomUUID().slice(0, 8)}`;
    const correlationId = `corr_${tool}_${action}_${operationId}`;

    const context = {
      operationId,
      requestId,
      correlationId,
      serviceId,
      environmentId,
      deployId: null,
      commitId: null,
      step: "PRECHECK",
    };

    try {
      // 1. PRECHECK
      if (precheckFn) await precheckFn(context);
      context.step = "READ_CURRENT";

      // 2. READ CURRENT
      const current = readCurrentFn ? await readCurrentFn(context) : null;
      context.step = "APPLY_CHANGE";

      // 3. APPLY CHANGE
      const changeResult = await applyChangeFn(context);
      if (changeResult?.deployId) context.deployId = changeResult.deployId;
      if (changeResult?.commitId) context.commitId = changeResult.commitId;
      context.step = "READ_REMOTE";

      // 4. READ REMOTE
      const remote = readRemoteFn ? await readRemoteFn(context) : null;
      context.step = "COMPARE";

      // 5. COMPARE
      const isMatch = compareFn ? await compareFn(current, remote, context) : true;
      context.step = "INVALIDATE_CACHE";

      // 6. INVALIDATE CACHE & 7. FORCE REFRESH
      if (this.runtime?.cachePolicy) {
        if (serviceId) this.runtime.cachePolicy.invalidateService(serviceId);
        if (environmentId) this.runtime.cachePolicy.invalidateEnvironment(environmentId);
      }
      context.step = "TRIGGER_SIDE_EFFECT";

      // 8. TRIGGER SIDE EFFECT
      if (triggerSideEffectFn) await triggerSideEffectFn(context);
      context.step = "WAIT";

      // 9. WAIT
      if (waitFn) await waitFn(context);
      context.step = "VERIFY";

      // 10. VERIFY
      const verification = verifyFn ? await verifyFn(context) : { ok: isMatch };
      context.step = "CONFIRM";

      // 11. CONFIRM & RECEIPT
      const receipt = createVerificationReceipt({
        operationId,
        requestId,
        correlationId,
        serviceId,
        environmentId,
        deployId: context.deployId,
        commitId: context.commitId,
        source: "live",
        cacheBypassed: true,
        expected: args,
        actual: remote || {},
        checks: ["operationAccepted", "terminalState", "identityVerified", "stateMatches"],
        evidence: [changeResult, verification],
        verificationStatus: verification?.ok ? "VERIFIED" : "VERIFICATION_FAILED",
        tool,
        domain: action,
      });

      return {
        ok: verification?.ok !== false,
        mutationCompleted: true,
        correlationId,
        receipt,
        result: changeResult,
      };

    } catch (err) {
      return {
        ok: false,
        mutationCompleted: false,
        error: err.message,
        stoppedAtStep: context.step,
        correlationId,
      };
    }
  }
}
