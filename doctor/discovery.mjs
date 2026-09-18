/**
 * 🩺 AERON FLUXER X DOCTOR — doctor/discovery.mjs
 * Descubrimiento automático e inventariado dinámico de dominios y herramientas.
 */

import { getToolContract } from "../core/tool-contracts.mjs";

export async function discoverArchitecture(registry) {
  const domainNames = registry.moduleNames();
  const matrix = [];
  const domainSummary = {};
  let totalActions = 0;

  for (const domain of domainNames) {
    const actions = registry.actionsFor(domain);
    const signatures = registry.actionSignatures(domain);
    domainSummary[domain] = actions.length;

    for (const action of actions) {
      totalActions++;
      const resolved = registry.resolve(domain, action);
      const contract = getToolContract(domain, action);

      matrix.push({
        tool: `${domain}.${action}`,
        domain,
        action,
        mutating: contract.mutation,
        async: contract.async,
        cachePolicy: contract.cachePolicy,
        requires: contract.requires,
        produces: contract.produces,
        verificationRequirements: contract.verification,
        signature: signatures[action] || "{}",
        description: resolved?.unit?.description || `${domain} domain action`,
      });
    }
  }

  return {
    totalDomains: domainNames.length,
    totalActions,
    domainSummary,
    matrix,
  };
}
