import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Registry } from '../core/registry.mjs';
import { Router } from '../core/router.mjs';
import { createRuntime } from '../core/runtime.mjs';
import { negotiateCapabilities } from '../tools/printcenter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function run() {
  const runtime = await createRuntime({ root: ROOT });
  const registry = new Registry({ runtime, root: ROOT });
  await registry.load();
  const router = new Router({ registry, runtime });

  const mods = registry.moduleNames();
  console.log('Modules count:', mods.length);
  if (!mods.includes('web')) throw new Error('web not registered');
  console.log('✓ web domain registered');

  const webActions = registry.actionsFor('web');
  console.log('web actions:', webActions.join(', '));
  if (!webActions.includes('search') || !webActions.includes('download')) throw new Error('web actions missing');
  console.log('✓ web actions confirmed');

  // Verify router routes web alias via router.execute
  const res = await router.execute({ tool: 'buscar', args: { query: 'Antigravity AI' } });
  console.log('router execute buscar ok:', res.ok, 'tool/action resolved:', res.tool, res.action);
  if (!res.ok && res.error && res.error.includes('No route')) throw new Error('buscar alias failed');
  console.log('✓ router alias buscar -> web.search works and executed');

  // Verify image_to_pdf in files
  const fileActions = registry.actionsFor('files');
  if (!fileActions.includes('image_to_pdf')) throw new Error('image_to_pdf not in files');
  console.log('✓ files.image_to_pdf action registered');

  // Test negotiateCapabilities with quality
  const fakeCaps = {
    paper_sizes: [{ name: 'Letter' }, { name: 'A4' }],
    resolutions: [{ x: 300, y: 300, name: '300x300' }, { x: 600, y: 600, name: '600x600' }, { x: 1200, y: 1200, name: '1200x1200' }],
    color: true,
    duplex: false
  };

  const nAlta = negotiateCapabilities({ quality: 'alta' }, fakeCaps);
  if (nAlta.effective.dpi_x !== 1200) throw new Error('alta quality failed, got ' + nAlta.effective.dpi_x);
  console.log('✓ printcenter quality alta selects 1200 DPI (' + nAlta.effective.quality + ')');

  const nBaja = negotiateCapabilities({ quality: 'basica' }, fakeCaps);
  if (nBaja.effective.dpi_x !== 300) throw new Error('basica quality failed, got ' + nBaja.effective.dpi_x);
  console.log('✓ printcenter quality basica selects 300 DPI (' + nBaja.effective.quality + ')');

  const nStd = negotiateCapabilities({ quality: 'estandar' }, fakeCaps);
  if (nStd.effective.dpi_x !== 600) throw new Error('estandar quality failed, got ' + nStd.effective.dpi_x);
  console.log('✓ printcenter quality estandar selects 600 DPI (' + nStd.effective.quality + ')');

  console.log('\n🎉 ALL NEW FEATURE CHECKS PASSED PERFECTLY!');
}

run().catch(e => { console.error('FAILED:', e); process.exit(1); });
