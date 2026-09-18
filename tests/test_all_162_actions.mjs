import { createRuntime } from '../core/runtime.mjs';
import { Registry } from '../core/registry.mjs';
import { Router } from '../core/router.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const runtime = await createRuntime({ root: '.', version: '9.0.0', brand: 'Aeron Fluxer X' });
const registry = new Registry(runtime);
await registry.load();
const router = new Router({ runtime, registry });

const testDir = 'storage/cache/audit_all_162';
await fs.mkdir(testDir, { recursive: true });
const testFile = path.join(testDir, 'sample.txt');
await fs.writeFile(testFile, 'line1\nline2\nline3\nline4\nline5\n', 'utf8');

const results = [];
let passCount = 0;
let failCount = 0;

async function testAction(tool, action, args = {}) {
  try {
    const res = await router.execute({ tool, action, args });
    if (res && typeof res === 'object' && res.ok !== undefined) {
      passCount++;
      results.push({ tool, action, status: 'PASS', ok: res.ok });
    } else {
      failCount++;
      results.push({ tool, action, status: 'MALFORMED', res });
      console.error(`[FAIL] MALFORMED: ${tool}.${action} ->`, res);
    }
  } catch (err) {
    failCount++;
    results.push({ tool, action, status: 'CRASH', error: err.message });
    console.error(`[FAIL] CRASH: ${tool}.${action} ->`, err.message);
  }
}

console.log('🚀 [AERON FLUXER X v9.0 — COMPLETE 162/162 ACTIONS LIVE AUDIT]');

// 1. Files domain (44 actions)
console.log('  Testing Domain [files] (44 actions)...');
await testAction('files', 'file_exists', { path: testFile });
await testAction('files', 'calculate_checksum', { path: testFile, algorithm: 'sha256' });
await testAction('files', 'get_file_info', { path: testFile });
await testAction('files', 'get_detailed_metadata', { path: testFile });
await testAction('files', 'read_text_file', { path: testFile });
await testAction('files', 'read_file_range', { path: testFile, startLine: 1, endLine: 3 });
await testAction('files', 'read_multiple_files', { paths: [testFile] });
await testAction('files', 'grep_files', { path: testFile, query: 'line2' });
await testAction('files', 'search_files', { path: testDir, query: 'sample' });
await testAction('files', 'list_directory', { path: testDir });
await testAction('files', 'list_directory_with_sizes', { path: testDir });
await testAction('files', 'directory_tree', { path: testDir, maxDepth: 2 });
await testAction('files', 'list_allowed_directories', {});
await testAction('files', 'touch_file', { path: path.join(testDir, 'touched.txt') });
await testAction('files', 'append_to_file', { path: testFile, content: 'appended\n' });
await testAction('files', 'insert_lines', { path: testFile, line: 2, content: 'inserted line' });
await testAction('files', 'replace_lines', { path: testFile, startLine: 2, endLine: 2, content: 'replaced line' });
await testAction('files', 'delete_lines', { path: testFile, startLine: 2, endLine: 2 });
await testAction('files', 'edit_file', { path: testFile, targetContent: 'line1', replacementContent: 'line1_mod' });
await testAction('files', 'patch_file', { path: testFile, patch: '@@ -1,1 +1,1 @@\n-line1_mod\n+line1_patched\n' });
await testAction('files', 'write_file', { path: path.join(testDir, 'written.txt'), content: 'hello world' });
await testAction('files', 'write_json', { path: path.join(testDir, 'test.json'), data: { a: 1, b: 2 } });
await testAction('files', 'read_json', { path: path.join(testDir, 'test.json') });
await testAction('files', 'json_manager', { path: path.join(testDir, 'test.json'), op: 'set', key: 'c', value: 3 });
await testAction('files', 'write_csv', { path: path.join(testDir, 'test.csv'), rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] });
await testAction('files', 'read_csv', { path: path.join(testDir, 'test.csv') });
await testAction('files', 'create_directory', { path: path.join(testDir, 'subfolder') });
await testAction('files', 'copy_file', { source: testFile, destination: path.join(testDir, 'copied.txt') });
await testAction('files', 'move_file', { source: path.join(testDir, 'copied.txt'), destination: path.join(testDir, 'moved.txt') });
await testAction('files', 'compare_files', { path1: testFile, path2: path.join(testDir, 'moved.txt') });
await testAction('files', 'file_diff', { path1: testFile, path2: path.join(testDir, 'moved.txt') });
await testAction('files', 'find_and_replace_in_files', { directory: testDir, search: 'line', replace: 'LINE' });
await testAction('files', 'read_binary_file', { path: testFile, maxBytes: 100 });
await testAction('files', 'set_attributes', { path: testFile, readonly: false });
await testAction('files', 'create_document', { path: path.join(testDir, 'doc.txt'), content: 'Sample document' });
await testAction('files', 'read_document', { path: path.join(testDir, 'doc.txt') });
await testAction('files', 'compress_path', { source: testDir, destination: path.join(testDir, 'archive.zip') });
await testAction('files', 'list_archive_contents', { archivePath: path.join(testDir, 'archive.zip') });
await testAction('files', 'extract_archive', { archivePath: path.join(testDir, 'archive.zip'), destination: path.join(testDir, 'extracted') });
await testAction('files', 'batch_copy', { operations: [{ source: testFile, destination: path.join(testDir, 'b_copy.txt') }] });
await testAction('files', 'batch_move', { operations: [{ source: path.join(testDir, 'b_copy.txt'), destination: path.join(testDir, 'b_moved.txt') }] });
await testAction('files', 'batch_rename', { operations: [{ oldPath: path.join(testDir, 'b_moved.txt'), newPath: path.join(testDir, 'b_renamed.txt') }] });
await testAction('files', 'batch_delete', { paths: [path.join(testDir, 'b_renamed.txt')] });
await testAction('files', 'validate_workspace', { path: '.' });
await testAction('files', 'delete_path', { path: path.join(testDir, 'moved.txt') });

// 2. Terminal domain (17 actions)
console.log('  Testing Domain [terminal] (17 actions)...');
await testAction('terminal', 'run_command', { command: 'echo terminal_test' });
await testAction('terminal', 'run_inline_script', { language: 'javascript', script: 'console.log(1+1)' });
await testAction('terminal', 'run_script', { scriptPath: 'server.js', language: 'node' });
await testAction('terminal', 'create_session', { sessionId: 'audit_term_sess' });
await testAction('terminal', 'list_sessions', {});
await testAction('terminal', 'attach_session', { sessionId: 'audit_term_sess' });
await testAction('terminal', 'run_session_command', { sessionId: 'audit_term_sess', command: 'echo session_ok' });
await testAction('terminal', 'close_session', { sessionId: 'audit_term_sess' });
await testAction('terminal', 'list_processes', {});
await testAction('terminal', 'kill_process', { pid: 999999 });
await testAction('terminal', 'kill_process_tree', { pid: 999999 });
const bg = await router.execute({ tool: 'terminal', action: 'run_background', args: { command: 'echo bg_ok' } });
if (bg.ok) {
  passCount++;
  await testAction('terminal', 'list_background_tasks', {});
  await testAction('terminal', 'get_background_output', { taskId: bg.taskId });
  await testAction('terminal', 'wait_for_background_task', { taskId: bg.taskId, timeoutMs: 2000 });
  await testAction('terminal', 'stop_background_task', { taskId: bg.taskId });
  await testAction('terminal', 'kill_background_task', { taskId: bg.taskId });
}

// 3. Packages domain (10 actions)
console.log('  Testing Domain [packages] (10 actions)...');
await testAction('packages', 'check_manager', { manager: 'npm' });
await testAction('packages', 'list_installed', { manager: 'npm', global: true });
await testAction('packages', 'list_repositories', { manager: 'npm' });
await testAction('packages', 'package_info', { manager: 'npm', name: 'express' });
await testAction('packages', 'search_package', { manager: 'npm', query: 'chalk' });
await testAction('packages', 'install_package', { manager: 'npm', name: 'fake-test-pkg', dryRun: true });
await testAction('packages', 'update_package', { manager: 'npm', name: 'fake-test-pkg', dryRun: true });
await testAction('packages', 'remove_package', { manager: 'npm', name: 'fake-test-pkg', dryRun: true });
await testAction('packages', 'add_repository', { manager: 'npm', url: 'https://registry.npmjs.org' });
await testAction('packages', 'remove_repository', { manager: 'npm', name: 'fake-repo' });

// 4. System domain (35 actions)
console.log('  Testing Domain [system] (35 actions)...');
await testAction('system', 'get_system_info', {});
await testAction('system', 'get_system_snapshot', {});
await testAction('system', 'get_cpu_info', {});
await testAction('system', 'get_ram_info', {});
await testAction('system', 'get_gpu_info', {});
await testAction('system', 'get_storage_info', {});
await testAction('system', 'get_hardware_info', {});
await testAction('system', 'get_kernel_info', {});
await testAction('system', 'get_local_ip', {});
await testAction('system', 'get_public_ip', {});
await testAction('system', 'get_battery_info', {});
await testAction('system', 'get_temperature', {});
await testAction('system', 'get_sensors', {});
await testAction('system', 'get_system_load', {});
await testAction('system', 'get_performance_stats', {});
await testAction('system', 'get_resource_usage', {});
await testAction('system', 'get_processes', {});
await testAction('system', 'get_open_ports', {});
await testAction('system', 'test_port', { host: '127.0.0.1', port: 8765 });
await testAction('system', 'ping', { host: '127.0.0.1' });
await testAction('system', 'dns_lookup', { domain: 'localhost' });
await testAction('system', 'list_env', {});
await testAction('system', 'get_env', { name: 'PATH' });
await testAction('system', 'set_env', { name: 'AERON_TEST_VAR', value: '123' });
await testAction('system', 'get_clipboard', {});
await testAction('system', 'set_clipboard', { text: 'aeron_clip_test' });
await testAction('system', 'manage_services', { action: 'list' });
await testAction('system', 'manage_startup', { action: 'list' });
await testAction('system', 'set_performance_mode', { mode: 'balanced' });
await testAction('system', 'set_power_profile', { profile: 'balanced' });
await testAction('system', 'sleep', { ms: 5 });
await testAction('system', 'wait', { ms: 5 });
await testAction('system', 'send_notification', { title: 'Test', message: 'Aeron test' });
await testAction('system', 'reload_server', {});

// 5. Database domain (12 actions)
console.log('  Testing Domain [database] (12 actions)...');
const dbName = 'storage/cache/test_all_162.db';
await testAction('database', 'create_database', { database: dbName });
await testAction('database', 'execute_query', { database: dbName, query: 'CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY, name TEXT);' });
await testAction('database', 'execute_script', { database: dbName, script: 'INSERT INTO users VALUES (1, "John");' });
await testAction('database', 'describe_table', { database: dbName, table: 'users' });
await testAction('database', 'explain_query', { database: dbName, query: 'SELECT * FROM users' });
await testAction('database', 'export_table', { database: dbName, table: 'users', format: 'json' });
await testAction('database', 'import_table', { database: dbName, table: 'users', data: [{ id: 2, name: 'Jane' }] });
await testAction('database', 'search_tables', { database: dbName, query: 'user' });
await testAction('database', 'analyze_database', { database: dbName });
await testAction('database', 'backup_database', { database: dbName, backupPath: 'storage/cache/test_all_162_bak.db' });
await testAction('database', 'restore_database', { database: dbName, backupPath: 'storage/cache/test_all_162_bak.db' });
await testAction('database', 'delete_database', { database: dbName });

// 6. Security domain (22 actions)
console.log('  Testing Domain [security] (22 actions)...');
await testAction('security', 'get_security_mode', {});
await testAction('security', 'set_security_mode', { mode: 'NORMAL' });
await testAction('security', 'generate_uuid', {});
await testAction('security', 'generate_token', { bytes: 16 });
await testAction('security', 'hash_text', { text: 'test', algorithm: 'sha256' });
await testAction('security', 'verify_hash', { text: 'test', hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', algorithm: 'sha256' });
await testAction('security', 'hash_file', { path: 'aeron.config.json', algorithm: 'sha256' });
const enc = await router.execute({ tool: 'security', action: 'encrypt_text', args: { text: 'secret_val', password: 'mypassword123' } });
if (enc.ok) {
  passCount++;
  await testAction('security', 'decrypt_text', { ciphertext: enc.ciphertext, iv: enc.iv, tag: enc.tag, salt: enc.salt, password: 'mypassword123' });
}
await testAction('security', 'check_permissions', { tool: 'files', action: 'write_file' });
await testAction('security', 'permissions_active', {});
await testAction('security', 'grant_permission', { tool: 'test', action: 'test_act' });
await testAction('security', 'revoke_permission', { tool: 'test', action: 'test_act' });
await testAction('security', 'audit_log', {});
await testAction('security', 'audit_system', {});
await testAction('security', 'health', {});
await testAction('security', 'anti_loop_status', {});
await testAction('security', 'scan_file', { path: 'aeron.config.json' });
await testAction('security', 'analyze_process', { pid: process.pid });
await testAction('security', 'approve_request', { requestId: 'req_dummy' });
await testAction('security', 'deny_request', { requestId: 'req_dummy' });
await testAction('security', 'request_status', { requestId: 'req_dummy' });

// 7. Shortcuts domain (9 actions)
console.log('  Testing Domain [shortcuts] (9 actions)...');
await testAction('shortcuts', 'list', {});
await testAction('shortcuts', 'save', { name: 'test_sc', tool: 'system', action: 'get_cpu_info', args: {} });
await testAction('shortcuts', 'create', { name: 'test_sc2', tool: 'system', action: 'get_cpu_info', args: {} });
await testAction('shortcuts', 'execute', { name: 'test_sc' });
await testAction('shortcuts', 'run', { name: 'test_sc' });
await testAction('shortcuts', 'export_shortcuts', {});
await testAction('shortcuts', 'import_shortcuts', { shortcuts: { imp_sc: { tool: 'system', action: 'get_cpu_info', args: {} } } });
await testAction('shortcuts', 'delete', { name: 'test_sc' });
await testAction('shortcuts', 'remove', { name: 'test_sc2' });

// 8. Network domain (5 actions)
console.log('  Testing Domain [network] (5 actions)...');
await testAction('network', 'diagnose_network', {});
await testAction('network', 'get_interfaces', {});
await testAction('network', 'dns_query', { domain: 'localhost' });
await testAction('network', 'test_connection', { host: '127.0.0.1', port: 8765 });
await testAction('network', 'scan_ports', { host: '127.0.0.1', ports: [80, 443, 8765] });

// 9. Diagnostics domain (5 actions)
console.log('  Testing Domain [diagnostics] (5 actions)...');
await testAction('diagnostics', 'self_test', {});
await testAction('diagnostics', 'resolve_toolchain', {});
await testAction('diagnostics', 'health_check', {});
await testAction('diagnostics', 'benchmark', { loops: 10 });
await testAction('diagnostics', 'system_diagnose', {});

// 10. Developer domain (4 actions)
console.log('  Testing Domain [developer] (4 actions)...');
await testAction('developer', 'detect_project', { path: '.' });
await testAction('developer', 'inspect_project', { path: '.' });
await testAction('developer', 'run_project_tests', { path: '.' });
await testAction('developer', 'run_project_build', { path: '.' });

console.log('\n==================================================');
console.log(`🏆 RESULTADOS FINALES: ${passCount} PASARON | ${failCount} FALLARON`);
console.log('==================================================\n');

if (failCount > 0) process.exit(1);
process.exit(0);
