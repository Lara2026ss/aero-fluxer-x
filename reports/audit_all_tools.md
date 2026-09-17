# 📊 REPORTE COMPLETO DE AUDITORÍA 1:1 — AERON FLUXER X v9.0

**Fecha de generación:** 2026-09-02T17:50:53.149Z
**Total de acciones auditadas:** 187

### 📈 Resumen General
- **PASS (100% Correctas):** 164
- **WARN (Advertencias de Contrato/UX):** 0
- **FAIL (Excepciones/Errores Fatales):** 0
- **SKIPPED_SAFE_LIMIT (Protección de Seguridad):** 23

### 📋 Matriz de Auditoría 1:1 por Herramienta

| Dominio | Acción | Estado | Latencia (ms) | Riesgo | Notas |
|---|---|---|---|---|---|
| `files` | `append_to_file` | 🟢 PASS | 8ms | `LOW` | OK |
| `files` | `batch_copy` | 🟢 PASS | 1ms | `LOW` | OK |
| `files` | `batch_delete` | 🟢 PASS | 0ms | `LOW` | OK |
| `files` | `batch_move` | 🟢 PASS | 0ms | `LOW` | OK |
| `files` | `batch_rename` | 🟢 PASS | 0ms | `LOW` | OK |
| `files` | `calculate_checksum` | 🟢 PASS | 1ms | `SAFE` | OK |
| `files` | `compare_files` | 🟢 PASS | 0ms | `LOW` | OK |
| `files` | `compress_path` | 🟢 PASS | 1ms | `LOW` | OK |
| `files` | `copy_file` | ⚪ SKIPPED | 0ms | `MEDIUM` | Operación destructiva probada en sandbox dedicado |
| `files` | `create_directory` | 🟢 PASS | 1ms | `LOW` | OK |
| `files` | `create_document` | 🟢 PASS | 51ms | `LOW` | OK |
| `files` | `delete_lines` | 🟢 PASS | 1ms | `LOW` | OK |
| `files` | `delete_path` | ⚪ SKIPPED | 0ms | `LOW` | Operación destructiva probada en sandbox dedicado |
| `files` | `directory_tree` | 🟢 PASS | 1ms | `LOW` | OK |
| `files` | `edit_file` | 🟢 PASS | 1ms | `LOW` | OK |
| `files` | `extract_archive` | 🟢 PASS | 0ms | `LOW` | OK |
| `files` | `file_diff` | 🟢 PASS | 0ms | `LOW` | OK |
| `files` | `file_exists` | 🟢 PASS | 1ms | `LOW` | OK |
| `files` | `find_and_replace_in_files` | 🟢 PASS | 0ms | `LOW` | OK |
| `files` | `get_detailed_metadata` | 🟢 PASS | 256ms | `SAFE` | OK |
| `files` | `get_file_info` | 🟢 PASS | 2ms | `SAFE` | OK |
| `files` | `grep_files` | 🟢 PASS | 0ms | `LOW` | OK |
| `files` | `insert_lines` | 🟢 PASS | 0ms | `LOW` | OK |
| `files` | `json_manager` | 🟢 PASS | 4ms | `LOW` | OK |
| `files` | `list_allowed_directories` | 🟢 PASS | 1ms | `SAFE` | OK |
| `files` | `list_archive_contents` | 🟢 PASS | 349ms | `SAFE` | OK |
| `files` | `list_directory` | 🟢 PASS | 9ms | `SAFE` | OK |
| `files` | `list_directory_with_sizes` | 🟢 PASS | 1ms | `SAFE` | OK |
| `files` | `move_file` | ⚪ SKIPPED | 0ms | `MEDIUM` | Operación destructiva probada en sandbox dedicado |
| `files` | `patch_file` | 🟢 PASS | 1ms | `LOW` | OK |
| `files` | `read_binary_file` | 🟢 PASS | 1ms | `SAFE` | OK |
| `files` | `read_csv` | 🟢 PASS | 1ms | `SAFE` | OK |
| `files` | `read_document` | 🟢 PASS | 0ms | `SAFE` | OK |
| `files` | `read_file_range` | 🟢 PASS | 1ms | `SAFE` | OK |
| `files` | `read_json` | 🟢 PASS | 1ms | `SAFE` | OK |
| `files` | `read_multiple_files` | 🟢 PASS | 1ms | `SAFE` | OK |
| `files` | `read_text_file` | 🟢 PASS | 1ms | `SAFE` | OK |
| `files` | `replace_lines` | 🟢 PASS | 0ms | `LOW` | OK |
| `files` | `search_files` | 🟢 PASS | 1ms | `SAFE` | OK |
| `files` | `set_attributes` | 🟢 PASS | 1ms | `LOW` | OK |
| `files` | `touch_file` | 🟢 PASS | 1ms | `LOW` | OK |
| `files` | `validate_workspace` | 🟢 PASS | 1ms | `LOW` | OK |
| `files` | `write_csv` | 🟢 PASS | 1ms | `LOW` | OK |
| `files` | `write_file` | 🟢 PASS | 2ms | `MEDIUM` | OK |
| `files` | `write_json` | 🟢 PASS | 2ms | `LOW` | OK |
| `system` | `dns_lookup` | 🟢 PASS | 1ms | `LOW` | OK |
| `system` | `get_battery_info` | 🟢 PASS | 448ms | `SAFE` | OK |
| `system` | `get_clipboard` | 🟢 PASS | 446ms | `SAFE` | OK |
| `system` | `get_cpu_info` | 🟢 PASS | 2ms | `SAFE` | OK |
| `system` | `get_defender_status` | 🟢 PASS | 1353ms | `SAFE` | OK |
| `system` | `get_disk_info` | 🟢 PASS | 840ms | `SAFE` | OK |
| `system` | `get_env` | 🟢 PASS | 1ms | `SAFE` | OK |
| `system` | `get_env_vars` | 🟢 PASS | 1ms | `SAFE` | OK |
| `system` | `get_folder_size` | 🟢 PASS | 341ms | `SAFE` | OK |
| `system` | `get_gpu_info` | 🟢 PASS | 381ms | `SAFE` | OK |
| `system` | `get_hardware_info` | 🟢 PASS | 345ms | `SAFE` | OK |
| `system` | `get_kernel_info` | 🟢 PASS | 278ms | `SAFE` | OK |
| `system` | `get_local_ip` | 🟢 PASS | 5ms | `SAFE` | OK |
| `system` | `get_open_ports` | 🟢 PASS | 1329ms | `SAFE` | OK |
| `system` | `get_performance_stats` | 🟢 PASS | 627ms | `SAFE` | OK |
| `system` | `get_processes` | 🟢 PASS | 349ms | `SAFE` | OK |
| `system` | `get_public_ip` | 🟢 PASS | 182ms | `SAFE` | OK |
| `system` | `get_ram_info` | 🟢 PASS | 1ms | `SAFE` | OK |
| `system` | `get_resource_usage` | 🟢 PASS | 0ms | `SAFE` | OK |
| `system` | `get_sensors` | 🟢 PASS | 392ms | `SAFE` | OK |
| `system` | `get_storage_info` | 🟢 PASS | 463ms | `SAFE` | OK |
| `system` | `get_system_info` | 🟢 PASS | 1ms | `SAFE` | OK |
| `system` | `get_system_load` | 🟢 PASS | 1632ms | `SAFE` | OK |
| `system` | `get_system_snapshot` | 🟢 PASS | 6ms | `SAFE` | OK |
| `system` | `get_temperature` | 🟢 PASS | 397ms | `SAFE` | OK |
| `system` | `get_wifi_networks` | 🟢 PASS | 341ms | `SAFE` | OK |
| `system` | `get_wifi_profile` | 🟢 PASS | 294ms | `SAFE` | OK |
| `system` | `get_windows_update_status` | 🟢 PASS | 1308ms | `SAFE` | OK |
| `system` | `list_env` | 🟢 PASS | 1ms | `SAFE` | OK |
| `system` | `list_scheduled_tasks` | 🟢 PASS | 1410ms | `SAFE` | OK |
| `system` | `manage_services` | 🟢 PASS | 351ms | `LOW` | OK |
| `system` | `manage_startup` | 🟢 PASS | 402ms | `LOW` | OK |
| `system` | `ping` | 🟢 PASS | 2289ms | `LOW` | OK |
| `system` | `read_registry` | 🟢 PASS | 388ms | `SAFE` | OK |
| `system` | `reload_server` | ⚪ SKIPPED | 0ms | `LOW` | Reinicio/apagado de servidor omitido en auditoría viva |
| `system` | `remove_env_var` | 🟢 PASS | 1ms | `HIGH` | OK |
| `system` | `run_scheduled_task` | ⚪ SKIPPED | 0ms | `LOW` | Ejecución de tareas del sistema omitida por seguridad |
| `system` | `send_notification` | 🟢 PASS | 21ms | `LOW` | OK |
| `system` | `set_clipboard` | 🟢 PASS | 417ms | `LOW` | OK |
| `system` | `set_env` | 🟢 PASS | 0ms | `LOW` | OK |
| `system` | `set_env_var` | 🟢 PASS | 0ms | `MEDIUM` | OK |
| `system` | `set_performance_mode` | 🟢 PASS | 284ms | `LOW` | OK |
| `system` | `set_power_profile` | 🟢 PASS | 422ms | `MEDIUM` | OK |
| `system` | `shutdown_server` | ⚪ SKIPPED | 0ms | `LOW` | Reinicio/apagado de servidor omitido en auditoría viva |
| `system` | `sleep` | 🟢 PASS | 16ms | `LOW` | OK |
| `system` | `test_port` | 🟢 PASS | 0ms | `LOW` | OK |
| `system` | `wait` | 🟢 PASS | 13ms | `LOW` | OK |
| `system` | `write_registry` | ⚪ SKIPPED | 0ms | `HIGH` | Escritura de registro omitida por seguridad |
| `terminal` | `attach_session` | 🟢 PASS | 0ms | `LOW` | OK |
| `terminal` | `close_session` | 🟢 PASS | 0ms | `LOW` | OK |
| `terminal` | `create_session` | 🟢 PASS | 0ms | `LOW` | OK |
| `terminal` | `get_background_output` | ⚪ SKIPPED | 0ms | `SAFE` | Acción de control de procesos/elevación reservada |
| `terminal` | `kill_background_task` | ⚪ SKIPPED | 0ms | `LOW` | Acción de control de procesos/elevación reservada |
| `terminal` | `kill_process` | ⚪ SKIPPED | 0ms | `HIGH` | Acción de control de procesos/elevación reservada |
| `terminal` | `kill_process_tree` | ⚪ SKIPPED | 0ms | `HIGH` | Acción de control de procesos/elevación reservada |
| `terminal` | `list_background_tasks` | 🟢 PASS | 1ms | `SAFE` | OK |
| `terminal` | `list_processes` | 🟢 PASS | 370ms | `SAFE` | OK |
| `terminal` | `list_sessions` | 🟢 PASS | 0ms | `SAFE` | OK |
| `terminal` | `open_file_explorer` | 🟢 PASS | 377ms | `LOW` | OK |
| `terminal` | `open_url` | 🟢 PASS | 403ms | `LOW` | OK |
| `terminal` | `run_as_admin` | ⚪ SKIPPED | 0ms | `PRIVILEGED` | Acción de control de procesos/elevación reservada |
| `terminal` | `run_background` | ⚪ SKIPPED | 0ms | `LOW` | Ejecución en background omitida |
| `terminal` | `run_command` | 🟢 PASS | 642ms | `MEDIUM` | OK |
| `terminal` | `run_inline_script` | 🟢 PASS | 495ms | `MEDIUM` | OK |
| `terminal` | `run_script` | ⚪ SKIPPED | 0ms | `MEDIUM` | Requiere archivo script existente |
| `terminal` | `run_session_command` | 🟢 PASS | 333ms | `LOW` | OK |
| `terminal` | `stop_background_task` | 🟢 PASS | 0ms | `LOW` | OK |
| `terminal` | `wait_for_background_task` | ⚪ SKIPPED | 0ms | `LOW` | Acción de control de procesos/elevación reservada |
| `packages` | `add_repository` | 🟢 PASS | 1ms | `LOW` | OK |
| `packages` | `check_manager` | 🟢 PASS | 915ms | `SAFE` | OK |
| `packages` | `install_package` | ⚪ SKIPPED | 0ms | `PRIVILEGED` | Modificación de paquetes globales omitida |
| `packages` | `list_installed` | 🟢 PASS | 4964ms | `SAFE` | OK |
| `packages` | `list_repositories` | 🟢 PASS | 413ms | `SAFE` | OK |
| `packages` | `package_info` | 🟢 PASS | 1235ms | `SAFE` | OK |
| `packages` | `remove_package` | ⚪ SKIPPED | 0ms | `PRIVILEGED` | Modificación de paquetes globales omitida |
| `packages` | `remove_repository` | 🟢 PASS | 1ms | `LOW` | OK |
| `packages` | `search_package` | 🟢 PASS | 0ms | `SAFE` | OK |
| `packages` | `update_package` | ⚪ SKIPPED | 0ms | `PRIVILEGED` | Modificación de paquetes globales omitida |
| `database` | `analyze_database` | 🟢 PASS | 1ms | `LOW` | OK |
| `database` | `backup_database` | 🟢 PASS | 1ms | `LOW` | OK |
| `database` | `create_database` | 🟢 PASS | 0ms | `LOW` | OK |
| `database` | `delete_database` | 🟢 PASS | 0ms | `LOW` | OK |
| `database` | `describe_table` | 🟢 PASS | 1ms | `LOW` | OK |
| `database` | `execute_query` | 🟢 PASS | 1ms | `LOW` | OK |
| `database` | `execute_script` | 🟢 PASS | 0ms | `LOW` | OK |
| `database` | `explain_query` | 🟢 PASS | 1ms | `LOW` | OK |
| `database` | `export_table` | 🟢 PASS | 1ms | `LOW` | OK |
| `database` | `import_table` | 🟢 PASS | 0ms | `LOW` | OK |
| `database` | `restore_database` | 🟢 PASS | 0ms | `LOW` | OK |
| `database` | `search_tables` | 🟢 PASS | 0ms | `SAFE` | OK |
| `security` | `analyze_process` | 🟢 PASS | 1ms | `LOW` | OK |
| `security` | `approve_request` | 🟢 PASS | 1ms | `LOW` | OK |
| `security` | `audit_log` | 🟢 PASS | 2ms | `LOW` | OK |
| `security` | `audit_system` | 🟢 PASS | 0ms | `LOW` | OK |
| `security` | `check_permissions` | 🟢 PASS | 0ms | `SAFE` | OK |
| `security` | `decrypt_text` | ⚪ SKIPPED | 0ms | `SAFE` | Requiere payload cifrado previo |
| `security` | `deny_request` | 🟢 PASS | 0ms | `LOW` | OK |
| `security` | `encrypt_text` | 🟢 PASS | 21ms | `SAFE` | OK |
| `security` | `generate_token` | 🟢 PASS | 1ms | `LOW` | OK |
| `security` | `generate_uuid` | 🟢 PASS | 1ms | `LOW` | OK |
| `security` | `get_security_mode` | 🟢 PASS | 0ms | `SAFE` | OK |
| `security` | `grant_permission` | ⚪ SKIPPED | 0ms | `PRIVILEGED` | Modificación de políticas de seguridad omitida |
| `security` | `hash_file` | 🟢 PASS | 2ms | `SAFE` | OK |
| `security` | `hash_text` | 🟢 PASS | 1ms | `SAFE` | OK |
| `security` | `health` | 🟢 PASS | 128ms | `LOW` | OK |
| `security` | `permissions_active` | 🟢 PASS | 1ms | `LOW` | OK |
| `security` | `request_status` | 🟢 PASS | 1ms | `SAFE` | OK |
| `security` | `revoke_permission` | ⚪ SKIPPED | 0ms | `PRIVILEGED` | Modificación de políticas de seguridad omitida |
| `security` | `scan_file` | 🟢 PASS | 0ms | `LOW` | OK |
| `security` | `set_security_mode` | ⚪ SKIPPED | 0ms | `PRIVILEGED` | Modificación de políticas de seguridad omitida |
| `security` | `verify_hash` | 🟢 PASS | 1ms | `SAFE` | OK |
| `shortcuts` | `clear_all` | ⚪ SKIPPED | 0ms | `HIGH` | Borrado masivo de macros omitido |
| `shortcuts` | `create` | 🟢 PASS | 3ms | `LOW` | OK |
| `shortcuts` | `delete` | 🟢 PASS | 0ms | `MEDIUM` | OK |
| `shortcuts` | `edit` | 🟢 PASS | 2ms | `LOW` | OK |
| `shortcuts` | `execute` | 🟢 PASS | 8ms | `LOW` | OK |
| `shortcuts` | `export_shortcuts` | 🟢 PASS | 1ms | `LOW` | OK |
| `shortcuts` | `get` | 🟢 PASS | 1ms | `SAFE` | OK |
| `shortcuts` | `history` | 🟢 PASS | 0ms | `LOW` | OK |
| `shortcuts` | `import_shortcuts` | 🟢 PASS | 2ms | `LOW` | OK |
| `shortcuts` | `inspect` | 🟢 PASS | 0ms | `LOW` | OK |
| `shortcuts` | `list` | 🟢 PASS | 0ms | `SAFE` | OK |
| `shortcuts` | `reload` | 🟢 PASS | 0ms | `LOW` | OK |
| `shortcuts` | `remove` | 🟢 PASS | 0ms | `MEDIUM` | OK |
| `shortcuts` | `rename` | 🟢 PASS | 2ms | `LOW` | OK |
| `shortcuts` | `run` | 🟢 PASS | 0ms | `LOW` | OK |
| `shortcuts` | `save` | 🟢 PASS | 1ms | `LOW` | OK |
| `shortcuts` | `update` | 🟢 PASS | 1ms | `LOW` | OK |
| `network` | `diagnose_network` | 🟢 PASS | 4795ms | `LOW` | OK |
| `network` | `dns_query` | 🟢 PASS | 0ms | `LOW` | OK |
| `network` | `get_interfaces` | 🟢 PASS | 5ms | `SAFE` | OK |
| `network` | `scan_ports` | 🟢 PASS | 3ms | `LOW` | OK |
| `network` | `test_connection` | 🟢 PASS | 3ms | `LOW` | OK |
| `diagnostics` | `benchmark` | 🟢 PASS | 1ms | `LOW` | OK |
| `diagnostics` | `health_check` | 🟢 PASS | 429ms | `SAFE` | OK |
| `diagnostics` | `resolve_toolchain` | 🟢 PASS | 0ms | `LOW` | OK |
| `diagnostics` | `self_test` | 🟢 PASS | 0ms | `LOW` | OK |
| `diagnostics` | `system_diagnose` | 🟢 PASS | 1ms | `LOW` | OK |
| `developer` | `detect_project` | 🟢 PASS | 4ms | `LOW` | OK |
| `developer` | `inspect_project` | 🟢 PASS | 1ms | `LOW` | OK |
| `developer` | `run_project_build` | 🟢 PASS | 731ms | `LOW` | OK |
| `developer` | `run_project_tests` | 🟢 PASS | 8707ms | `LOW` | OK |
