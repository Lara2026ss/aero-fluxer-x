/**
 * 🪟 AERON FLUXER X — core/cache-policy.mjs
 * Motor de Políticas e Integridad de Caché.
 */

export class CachePolicyEngine {
  constructor({ runtime }) {
    this.runtime = runtime;
    this.invalidatedKeys = new Set();
    this.bypassedResources = new Set();
  }

  invalidateService(serviceId) {
    if (!serviceId) return;
    this.invalidatedKeys.add(`service:${serviceId}`);
    this.runtime?.logger?.info?.("cache_invalidated", { resource: `service:${serviceId}` });
  }

  invalidateDeploy(deployId) {
    if (!deployId) return;
    this.invalidatedKeys.add(`deploy:${deployId}`);
    this.runtime?.logger?.info?.("cache_invalidated", { resource: `deploy:${deployId}` });
  }

  invalidateProject(projectId) {
    if (!projectId) return;
    this.invalidatedKeys.add(`project:${projectId}`);
    this.runtime?.logger?.info?.("cache_invalidated", { resource: `project:${projectId}` });
  }

  invalidateEnvironment(environmentId) {
    if (!environmentId) return;
    this.invalidatedKeys.add(`env:${environmentId}`);
    this.runtime?.logger?.info?.("cache_invalidated", { resource: `env:${environmentId}` });
  }

  bypassCache(resourceKey) {
    if (!resourceKey) return;
    this.bypassedResources.add(resourceKey);
  }

  shouldBypass(resourceKey, isMutationPostRead = false) {
    if (isMutationPostRead) return true;
    if (!resourceKey) return false;
    return this.invalidatedKeys.has(resourceKey) || this.bypassedResources.has(resourceKey);
  }

  clearBypass(resourceKey) {
    if (resourceKey) {
      this.invalidatedKeys.delete(resourceKey);
      this.bypassedResources.delete(resourceKey);
    }
  }
}
