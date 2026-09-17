/**
 * AI FLUXER — tools/github.mjs
 * Dominio modular oficial de GitHub con soporte para hasta 2 cuentas (Lara2026ss y Agy-Leo),
 * almacenamiento cifrado de PAT, commits, ramas, PRs, issues, releases, status checks y push de actualizaciones.
 */
import * as githubDomain from "../../GitHub MCP/tools/github/index.mjs";

export function createGithubDomain({ runtime, domain }) {
  return domain(
    "github",
    githubDomain.meta.description,
    githubDomain.actions,
    githubDomain.permissions
  );
}
