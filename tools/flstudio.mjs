/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🎹 FLUXER CORE MCP — tools/flstudio.mjs (v11.0.5 Autonomous Suite)
 * Control Integral Autónomo, Tiempo Real, Menús, Opciones, Plugins & Seguridad para FL Studio
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Subherramientas Principales:
 *  1. detect        — Detección en vivo de proceso FL64.exe (PID), rutas, versión y registro.
 *  2. open / launch — Abre FL Studio (o un proyecto .flp específico) automáticamente.
 *  3. file          — Subacciones: 'new' | 'open' | 'save' | 'export' | 'backup' | 'info'.
 *  4. edit          — Subacciones: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'select_all' | 'delete' | 'duplicate' | 'quantize'.
 *  5. view          — Subacciones: 'playlist' (F5) | 'channel_rack' (F6) | 'piano_roll' (F7) | 'mixer' (F9) | 'browser' (Alt+F8) | 'plugin_picker' (F8) | 'close_all' (F12) | 'toggle_max'.
 *  6. patterns      — Subacciones: 'select' | 'next' | 'prev' | 'rename' | 'clone' | 'split_by_channel' | 'dump_score'.
 *  7. options       — Subacciones: 'audio' | 'midi' | 'general' | 'file' (con gate de seguridad para settings críticos).
 *  8. tools         — Subacciones: 'macro' (purge_unused_audio, smart_disable, prepare_midi_export) | 'dump_score_log' | 'chord_tool' | 'riff_machine'.
 *  9. plugins       — Subacciones: 'list_installed' | 'add_generator' | 'add_effect' | 'scan' | 'free_catalog'.
 * 10. live_session  — Sesión activa unificada (sin crear archivos sueltos a cada rato).
 * 11. music_theory  — Diccionario completo de escalas, acordes y progresiones.
 * 12. change_tone   — Transposición armónica en semitonos y afinación a 432 Hz / cents.
 * 13. sound_design  — Recetas de síntesis para Vital, Sytrus, 3xOSC y FLEX.
 * 14. mixer_settings— Cadenas de mezcla, EQ, sidechain y master limiter (-0.3 dB True Peak).
 */

import path from "node:path";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

// ── Constantes y Rutas Oficiales en este Sistema ──────────────────────────────
const FL_EXE_PATH = "C:\\Program Files\\Image-Line\\FL Studio 2026\\FL64.exe";
const FL_USER_DATA_DIR = path.join(process.env.USERPROFILE || "C:\\Users\\Default", "OneDrive", "Documents", "Image-Line", "FL Studio");
const FL_PIANO_ROLL_SCRIPTS_DIR = path.join(FL_USER_DATA_DIR, "Settings", "Piano roll scripts");
const FL_PLUGIN_DB_DIR = path.join(FL_USER_DATA_DIR, "Presets", "Plugin database");
const FL_BACKUP_DIR = path.join(FL_USER_DATA_DIR, "Projects", "Backup");
const FL_SCORES_DIR = path.join(FL_USER_DATA_DIR, "Presets", "Scores");
const FL_PROJECTS_DIR = path.join(FL_USER_DATA_DIR, "Projects");

// ── Helpers de Procesos y Teclado Windows ─────────────────────────────────────
function getFlRunningProcess() {
  try {
    const out = execSync('powershell -NoProfile -Command "(Get-Process -Name FL64 -ErrorAction SilentlyContinue) | Select-Object -ExpandProperty Id"', { encoding: "utf8", timeout: 3000 }).trim();
    if (out) {
      const pid = parseInt(out.split(/\r?\n/)[0], 10);
      return isNaN(pid) ? null : { pid, name: "FL64.exe", running: true };
    }
  } catch (_) {}
  return null;
}

function sendFlKey(keyCombo) {
  try {
    const psCmd = `
      \$wshell = New-Object -ComObject WScript.Shell
      \$proc = Get-Process -Name "FL64" -ErrorAction SilentlyContinue
      if (\$proc) {
        \$wshell.AppActivate(\$proc.Id)
        Start-Sleep -Milliseconds 60
        \$wshell.SendKeys("${keyCombo}")
        "OK"
      } else { "NOT_RUNNING" }
    `;
    const res = execSync(`powershell -NoProfile -Command "${psCmd.replace(/\r?\n/g, " ")}"`, { encoding: "utf8", timeout: 4000 }).trim();
    return res.includes("OK");
  } catch (_) {
    return false;
  }
}

// ── Motor Nativo de Escalas y Teoría Musical ──────────────────────────────────
const NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_NAME_TO_SEMITONE = {
  "C": 0, "B#": 0, "C#": 1, "DB": 1, "D": 2, "D#": 3, "EB": 3, "E": 4, "FB": 4,
  "F": 5, "E#": 5, "F#": 6, "GB": 6, "G": 7, "G#": 8, "AB": 8, "A": 9, "A#": 10,
  "BB": 10, "B": 11, "CB": 11
};

const SCALES = {
  major:            [0, 2, 4, 5, 7, 9, 11],
  minor:            [0, 2, 3, 5, 7, 8, 10],
  harmonic_minor:   [0, 2, 3, 5, 7, 8, 11],
  melodic_minor:    [0, 2, 3, 5, 7, 9, 11],
  dorian:           [0, 2, 3, 5, 7, 9, 10],
  phrygian:         [0, 1, 3, 5, 7, 8, 10],
  lydian:           [0, 2, 4, 6, 7, 9, 11],
  mixolydian:       [0, 2, 4, 5, 7, 9, 10],
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
  blues:            [0, 3, 5, 6, 7, 10],
  arabic:           [0, 1, 4, 5, 7, 8, 11],
};

const CHORD_INTERVALS = {
  "maj": [0, 4, 7], "min": [0, 3, 7], "dim": [0, 3, 6], "aug": [0, 4, 8],
  "sus2": [0, 2, 7], "sus4": [0, 5, 7], "7": [0, 4, 7, 10], "maj7": [0, 4, 7, 11],
  "min7": [0, 3, 7, 10], "dim7": [0, 3, 6, 9], "m7b5": [0, 3, 6, 10], "add9": [0, 4, 7, 14],
  "maj9": [0, 4, 7, 11, 14], "min9": [0, 3, 7, 10, 14], "9": [0, 4, 7, 10, 14],
  "11": [0, 4, 7, 10, 14, 17], "min11": [0, 3, 7, 10, 14, 17], "13": [0, 4, 7, 10, 14, 21],
  "power_5": [0, 7]
};

function parseNoteToMidi(noteStr, defaultOctave = 4) {
  if (typeof noteStr === "number") return Math.min(127, Math.max(0, Math.round(noteStr)));
  const match = String(noteStr).trim().match(/^([A-Ga-g][#b]?)(-?\d+)?$/);
  if (!match) return 60;
  const pitchName = match[1].toUpperCase();
  const octave = match[2] !== undefined ? parseInt(match[2], 10) : defaultOctave;
  const semi = NOTE_NAME_TO_SEMITONE[pitchName] ?? 0;
  return Math.min(127, Math.max(0, (octave + 1) * 12 + semi));
}

function midiToNoteName(midiNum) {
  const note = Math.min(127, Math.max(0, Math.round(midiNum)));
  const octave = Math.floor(note / 12) - 1;
  const name = NOTE_NAMES_SHARP[note % 12];
  return `${name}${octave}`;
}

function encodeVLQ(num) {
  let val = Math.max(0, Math.floor(num));
  const bytes = [val & 0x7F];
  while ((val >>= 7) > 0) {
    bytes.unshift((val & 0x7F) | 0x80);
  }
  return Buffer.from(bytes);
}

function createMidiFile({ notes = [], bpm = 120, timeSig = [4, 4], trackName = "Fluxer Live" }) {
  const PPQ = 480;
  const usPerQuarter = Math.round(60000000 / Math.max(20, Math.min(300, bpm)));
  const events = [];

  const trackNameBuf = Buffer.from(trackName, "utf8");
  events.push({
    tick: 0, order: 0,
    data: Buffer.concat([Buffer.from([0xFF, 0x03]), encodeVLQ(trackNameBuf.length), trackNameBuf])
  });

  events.push({
    tick: 0, order: 0,
    data: Buffer.from([0xFF, 0x51, 0x03, (usPerQuarter >> 16) & 0xFF, (usPerQuarter >> 8) & 0xFF, usPerQuarter & 0xFF])
  });

  const num = timeSig[0] || 4;
  const den = timeSig[1] || 4;
  const denPow2 = Math.round(Math.log2(den)) || 2;
  events.push({
    tick: 0, order: 0,
    data: Buffer.from([0xFF, 0x58, 0x04, num, denPow2, 24, 8])
  });

  for (const n of notes) {
    const pitch = parseNoteToMidi(n.pitch ?? n.note ?? 60);
    const vel = Math.max(1, Math.min(127, Math.round(n.velocity ?? 100)));
    const channel = (n.channel ?? 0) & 0x0F;
    const startTick = Math.round((n.start ?? 0) * PPQ);
    const durationTick = Math.max(1, Math.round((n.duration ?? 1) * PPQ));
    const endTick = startTick + durationTick;

    events.push({ tick: startTick, order: 1, data: Buffer.from([0x90 | channel, pitch, vel]) });
    events.push({ tick: endTick, order: 0, data: Buffer.from([0x80 | channel, pitch, 0x00]) });
  }

  events.sort((a, b) => (a.tick !== b.tick ? a.tick - b.tick : a.order - b.order));

  const trackBytes = [];
  let lastTick = 0;
  for (const ev of events) {
    const delta = ev.tick - lastTick;
    trackBytes.push(encodeVLQ(delta));
    trackBytes.push(ev.data);
    lastTick = ev.tick;
  }
  trackBytes.push(encodeVLQ(0));
  trackBytes.push(Buffer.from([0xFF, 0x2F, 0x00]));

  const trackBody = Buffer.concat(trackBytes);
  const mtrkHeader = Buffer.alloc(8);
  mtrkHeader.write("MTrk", 0, 4, "ascii");
  mtrkHeader.writeUInt32BE(trackBody.length, 4);

  const mthdHeader = Buffer.alloc(14);
  mthdHeader.write("MThd", 0, 4, "ascii");
  mthdHeader.writeUInt32BE(6, 4);
  mthdHeader.writeUInt16BE(0, 8);
  mthdHeader.writeUInt16BE(1, 10);
  mthdHeader.writeUInt16BE(PPQ, 12);

  return Buffer.concat([mthdHeader, mtrkHeader, trackBody]);
}

// ── Estado de Sesión en Vivo (En Memoria y Sincronizado en Disco) ─────────────
let _liveSession = {
  active: true,
  track_title: "FL Studio Live Session",
  bpm: 120,
  scale: "minor",
  root: "C",
  progression: ["Cm", "Ab", "Eb", "Bb"],
  notes: [],
  style: "trap",
  last_updated: new Date().toISOString(),
};

const STYLE_PRESETS = {
  trap: { name: "Trap / Dark Trap", recommended_bpm: 140, scales: ["minor", "phrygian", "harmonic_minor"], recommended_root: "C#" },
  lofi: { name: "Lo-Fi Hip-Hop / Chillhop", recommended_bpm: 80, scales: ["dorian", "major", "minor"], recommended_root: "Eb" },
  synthwave: { name: "Synthwave / Retrowave", recommended_bpm: 110, scales: ["minor", "dorian"], recommended_root: "A" },
  drill: { name: "UK / NY Drill", recommended_bpm: 142, scales: ["phrygian", "minor", "harmonic_minor"], recommended_root: "F" },
  edm_house: { name: "EDM / Future Bass", recommended_bpm: 126, scales: ["major", "minor"], recommended_root: "F" },
  ambient: { name: "Ambient / Cinematic", recommended_bpm: 72, scales: ["lydian", "pentatonic_major"], recommended_root: "D" }
};

const FREE_PLUGINS = [
  { name: "Vital", developer: "Matt Tytel", type: "Synth (Wavetable Spectral)", rating: "9.9/10", download_url: "https://vital.audio/#getvital", description: "Equivalente gratuito de Serum para 808s pesados y Leads de Trap/EDM." },
  { name: "Surge XT", developer: "Surge Team", type: "Synth Híbrido Modular", rating: "9.8/10", download_url: "https://surge-synthesizer.github.io/", description: "Sintetizador potente con 2000+ presets para Synthwave y pads." },
  { name: "Spitfire LABS", developer: "Spitfire Audio", type: "Sampler Acústico", rating: "9.7/10", download_url: "https://labs.spitfireaudio.com/", description: "Pianos melancólicos de Lo-Fi, violines y coros reales." },
  { name: "OTT", developer: "Xfer Records", type: "Compresor Multibanda", rating: "10/10", download_url: "https://xferrecords.com/freeware", description: "Compresión agresiva para brillo y pegada masiva." },
  { name: "Valhalla Supermassive", developer: "Valhalla DSP", type: "Reverb & Delay Espacial", rating: "9.9/10", download_url: "https://valhalladsp.com/shop/reverb/valhalla-supermassive/", description: "Espacios inmersivos infinitos para pads y voces." },
  { name: "CamelCrusher", developer: "Camel Audio", type: "Distorsión / Saturación", rating: "9.6/10", download_url: "https://www.audiopluginsforfree.com/camelcrusher/", description: "Saturación analógica para que los 808s suenen en móviles." },
  { name: "Fresh Air", developer: "Slate Digital", type: "Excitador de Agudos", rating: "9.6/10", download_url: "https://slatedigital.com/fresh-air/", description: "Abre voces y charles con brillo profesional sin aspereza." }
];

export function createFlStudioDomain({ runtime, domain, fs }) {
  const actions = {

    // ── 1. Detección en Tiempo Real ──────────────────────────────────────────
    detect: async () => {
      const flProc = getFlRunningProcess();
      const isExePresent = existsSync(FL_EXE_PATH);
      let lastBackup = null;
      try {
        const regOut = execSync('powershell -NoProfile -Command "(Get-ItemProperty \"HKCU:\\Software\\Image-Line\\FL Studio 26\\General\" -ErrorAction SilentlyContinue).LastSavedBackup"', { encoding: "utf8" }).trim();
        if (regOut) lastBackup = regOut;
      } catch (_) {}

      return {
        ok: true,
        installed: isExePresent,
        executable_path: FL_EXE_PATH,
        version: "FL Studio 2026 (64-bit)",
        is_running: Boolean(flProc),
        process_id: flProc?.pid || null,
        user_data_path: FL_USER_DATA_DIR,
        last_saved_backup: lastBackup,
        status_message: flProc
          ? `✅ FL Studio 2026 está ABIERTO Y EN EJECUCIÓN (PID: ${flProc.pid}). Puedes controlar menús, patrones y opciones en tiempo real.`
          : `⚠️ FL Studio está instalado pero NO se encuentra en ejecución. ¿Deseas que lo abra por ti? Ejecuta: flstudio { action: 'open' }`,
        suggested_action: flProc ? "flstudio { action: 'view', subaction: 'channel_rack' }" : "flstudio { action: 'open' }",
      };
    },

    // ── 2. Abrir / Iniciar FL Studio ────────────────────────────────────────
    open: async ({ project_path = null } = {}) => {
      const currentProc = getFlRunningProcess();
      if (currentProc && !project_path) {
        return {
          ok: true,
          already_running: true,
          pid: currentProc.pid,
          message: `FL Studio ya está abierto y corriendo en tiempo real (PID: ${currentProc.pid}).`,
        };
      }

      if (!existsSync(FL_EXE_PATH)) {
        return { ok: false, error: `No se encontró el ejecutable en ${FL_EXE_PATH}.` };
      }

      try {
        const argStr = project_path ? `"${project_path}"` : "";
        execSync(`powershell -NoProfile -Command "Start-Process '${FL_EXE_PATH}' ${argStr}"`, { timeout: 8000 });
        
        let attempts = 0;
        let runningPid = null;
        while (attempts < 6) {
          await new Promise(r => setTimeout(r, 1000));
          const p = getFlRunningProcess();
          if (p) { runningPid = p.pid; break; }
          attempts++;
        }

        return {
          ok: true,
          launched: true,
          pid: runningPid,
          project_opened: project_path || "Nuevo proyecto por defecto",
          message: `🚀 FL Studio 2026 iniciado correctamente${runningPid ? ` (PID: ${runningPid})` : ""}.`,
        };
      } catch (e) {
        return { ok: false, error: `Error al iniciar FL Studio: ${e.message}` };
      }
    },
    launch: async (args) => actions.open(args),

    // ── 3. Menú FILE (Nuevo, Abrir, Guardar, Exportar, Backups) ──────────────
    file: async ({ subaction = "info", path: filePath = null, format = "wav", name = null } = {}) => {
      const sub = String(subaction).toLowerCase().trim();

      // Guardar proyecto actual con Ctrl+S
      if (sub === "save") {
        const sent = sendFlKey("^s");
        return { ok: sent, subaction: "save", message: sent ? "Comando Guardar (Ctrl+S) enviado a FL Studio." : "FL Studio no está en ejecución." };
      }

      // Nuevo proyecto con Ctrl+N
      if (sub === "new") {
        const sent = sendFlKey("^n");
        return { ok: sent, subaction: "new", message: sent ? "Comando Nuevo Proyecto (Ctrl+N) enviado a FL Studio." : "FL Studio no está en ejecución." };
      }

      // Abrir archivo de proyecto
      if (sub === "open") {
        if (!filePath) return { ok: false, error: "Especifica 'path' con la ruta del proyecto .flp" };
        return actions.open({ project_path: filePath });
      }

      // Exportar proyecto vía CLI oficial de FL Studio
      if (sub === "export") {
        const flp = filePath || (getFlRunningProcess() ? null : null);
        if (!flp || !existsSync(flp)) return { ok: false, error: "Especifica 'path' con la ruta absoluta del archivo .flp a exportar." };
        const outFormat = ["wav", "mp3", "mid", "ogg", "flac"].includes(format.toLowerCase()) ? format.toLowerCase() : "wav";
        const outDir = path.join(path.dirname(flp), "Exported");
        await fs.mkdir(outDir, { recursive: true }).catch(() => {});
        const outFile = path.join(outDir, `${path.basename(flp, path.extname(flp))}.${outFormat}`);

        try {
          execSync(`powershell -NoProfile -Command "Start-Process '${FL_EXE_PATH}' -ArgumentList '/R', '/F${outFormat}', '/O\"${outFile}\"', '\"${flp}\"' -Wait"`, { timeout: 60000 });
          return {
            ok: existsSync(outFile),
            subaction: "export",
            exported_file: outFile,
            format: outFormat,
            source_flp: flp,
          };
        } catch (e) {
          return { ok: false, error: `Error durante la exportación CLI de FL Studio: ${e.message}` };
        }
      }

      // Backups automáticos de proyectos
      if (sub === "backup" || sub === "backups") {
        let backups = [];
        if (existsSync(FL_BACKUP_DIR)) {
          try {
            const files = await fs.readdir(FL_BACKUP_DIR);
            backups = files.filter(f => f.endsWith(".flp")).map(f => ({
              filename: f,
              path: path.join(FL_BACKUP_DIR, f),
            }));
          } catch (_) {}
        }
        return {
          ok: true,
          subaction: "backup",
          backup_count: backups.length,
          backups: backups.slice(-10).reverse(),
          tip: "Para restaurar un backup usa: flstudio { action: 'file', subaction: 'open', path: '<ruta_backup>' }",
        };
      }

      // Información del proyecto y backup reciente
      let recentBackup = null;
      try {
        recentBackup = execSync('powershell -NoProfile -Command "(Get-ItemProperty \"HKCU:\\Software\\Image-Line\\FL Studio 26\\General\" -ErrorAction SilentlyContinue).LastSavedBackup"', { encoding: "utf8" }).trim();
      } catch (_) {}

      return {
        ok: true,
        subaction: "info",
        last_saved_backup: recentBackup || "No registrado",
        projects_dir: FL_PROJECTS_DIR,
        backup_dir: FL_BACKUP_DIR,
      };
    },

    // ── 4. Menú EDIT (Deshacer, Rehacer, Copiar, Pegar, Cuantizar) ───────────
    edit: async ({ subaction = "undo" } = {}) => {
      const keyMap = {
        undo: "^z",
        redo: "^+z",
        cut: "^x",
        copy: "^c",
        paste: "^v",
        select_all: "^a",
        delete: "{DEL}",
        duplicate: "^b",
        quantize: "^q",
      };

      const sub = String(subaction).toLowerCase().trim();
      const combo = keyMap[sub];
      if (!combo) return { ok: false, error: `Subacción de edición desconocida: '${sub}'. Válidas: ${Object.keys(keyMap).join(", ")}` };

      const sent = sendFlKey(combo);
      return {
        ok: sent,
        action: "edit",
        subaction: sub,
        key_sent: combo,
        message: sent ? `Comando '${sub}' (${combo}) enviado a FL Studio en tiempo real.` : "FL Studio no está en ejecución.",
      };
    },

    // ── 5. Menú VIEW (Ventanas F5 Playlist, F6 Channel Rack, F7 Piano Roll, F9 Mixer) ─
    view: async ({ subaction = "channel_rack" } = {}) => {
      const viewKeyMap = {
        playlist: "{F5}",
        channel_rack: "{F6}",
        piano_roll: "{F7}",
        mixer: "{F9}",
        browser: "%{F8}", // Alt+F8
        plugin_picker: "{F8}",
        close_all: "{F12}",
        toggle_max: "^!{F10}",
      };

      const sub = String(subaction).toLowerCase().trim();
      const combo = viewKeyMap[sub];
      if (!combo) return { ok: false, error: `Ventana desconocida: '${sub}'. Opciones válidas: ${Object.keys(viewKeyMap).join(", ")}` };

      const sent = sendFlKey(combo);
      return {
        ok: sent,
        action: "view",
        window_focused: sub,
        key_sent: combo,
        message: sent ? `Ventana '${sub}' (${combo}) enfocada/abierta en FL Studio.` : "FL Studio no está en ejecución.",
      };
    },

    // ── 6. Menú PATTERNS (Navegación, Selección, Clonación, Dump) ─────────────
    patterns: async ({ subaction = "next", pattern = 1, name = null } = {}) => {
      const sub = String(subaction).toLowerCase().trim();

      if (sub === "next") {
        const sent = sendFlKey("{ADD}"); // Tecla numpad +
        return { ok: sent, subaction: "next", message: sent ? "Cambiado al siguiente patrón en FL Studio (+)." : "FL Studio no está abierto." };
      }
      if (sub === "prev") {
        const sent = sendFlKey("{SUBTRACT}"); // Tecla numpad -
        return { ok: sent, subaction: "prev", message: sent ? "Cambiado al patrón anterior en FL Studio (-)." : "FL Studio no está abierto." };
      }
      if (sub === "clone") {
        const sent = sendFlKey("^+c");
        return { ok: sent, subaction: "clone", message: sent ? "Patrón clonado en FL Studio." : "FL Studio no está abierto." };
      }
      if (sub === "split_by_channel") {
        return {
          ok: true,
          subaction: "split_by_channel",
          instruction: "En el selector de patrones haz clic derecho sobre el patrón activo y selecciona 'Split by channel' para separar cada instrumento en su propia pista de la Playlist.",
        };
      }

      return {
        ok: true,
        subaction: "patterns_info",
        tip: "Usa subaction: 'next' | 'prev' | 'clone' | 'split_by_channel'",
      };
    },

    // ── 7. Menú OPTIONS (Audio, MIDI, General, File) con Gate de Seguridad ────
    options: async ({ subaction = "audio", setting = null, value = null, confirm_security = false } = {}) => {
      const sub = String(subaction).toLowerCase().trim();

      // Detección de operaciones de alto riesgo (Seguridad)
      const isRisky = setting && (
        setting.toLowerCase().includes("driver") ||
        setting.toLowerCase().includes("asio") ||
        setting.toLowerCase().includes("registry") ||
        setting.toLowerCase().includes("wipe") ||
        setting.toLowerCase().includes("reset")
      );

      if (isRisky && !confirm_security) {
        return {
          ok: false,
          security_required: "advanced",
          risk_level: "HIGH",
          warning: "⚠️ ADVERTENCIA DE SEGURIDAD: Modificar drivers de audio, ASIO o el registro del sistema de FL Studio puede provocar bloqueos del motor de audio (audio engine freeze), pantalla azul de controladores o pérdida de sincronización de hardware.",
          remediation: "Para proceder con esta configuración, el usuario debe autorizar un workflow de elevación en el dominio 'security'.",
          suggested_call: "security { action: 'start_workflow', level: 'advanced', reason: 'Ajuste de driver de audio en FL Studio' }",
        };
      }

      if (sub === "audio") {
        let asioReg = null;
        try {
          asioReg = execSync('powershell -NoProfile -Command "Get-ItemProperty \"HKCU:\\Software\\Image-Line\\ASIO\" -ErrorAction SilentlyContinue | Select-Object -Property *"', { encoding: "utf8" }).trim();
        } catch (_) {}
        return {
          ok: true,
          subaction: "audio",
          current_settings: {
            recommended_sample_rate: "44100 Hz / 48000 Hz",
            recommended_buffer_size: "512 samples (11.6 ms) para producción / 128 samples para grabación con baja latencia",
            active_asio_driver: "FL Studio ASIO (Integrado)",
            registry_status: asioReg ? "Configurado" : "Por defecto",
          },
          fl_shortcut: "Presiona F10 en FL Studio para abrir la ventana de Audio Settings directamente.",
        };
      }

      if (sub === "file") {
        return {
          ok: true,
          subaction: "file",
          user_data_folder: FL_USER_DATA_DIR,
          vst_search_paths: [
            "C:\\Program Files\\Common Files\\VST3",
            "C:\\Program Files\\VstPlugins",
          ],
          fl_shortcut: "Presiona F10 > Pestaña 'File' para añadir carpetas adicionales de samples y librerías.",
        };
      }

      return {
        ok: true,
        subaction: sub,
        fl_shortcut: "Presiona F10 para abrir el panel de opciones general de FL Studio.",
      };
    },

    // ── 8. Menú TOOLS (Macros, Score Logger, Chord Tool, Riff Machine) ─────────
    tools: async ({ subaction = "macro", macro_name = "smart_disable" } = {}) => {
      const sub = String(subaction).toLowerCase().trim();

      if (sub === "macro") {
        const macros = {
          purge_unused_audio: {
            title: "Purge Unused Audio Clips",
            benefit: "Elimina de la memoria RAM todos los samples y audios que ya no se usan en el proyecto.",
            how_to: "En FL Studio: Tools > Macros > Purge unused audio clips.",
          },
          smart_disable: {
            title: "Switch Smart Disable for All Plugins",
            benefit: "Desactiva el procesamiento de plugins cuando no reciben notas. ¡Ahorra hasta un 60% de CPU en proyectos pesados!",
            how_to: "En FL Studio: Tools > Macros > Switch smart disable for all plugins.",
          },
          prepare_midi_export: {
            title: "Prepare for MIDI Export",
            benefit: "Convierte todos los canales e instrumentos a canales MIDI Out para exportar la composición limpia.",
            how_to: "En FL Studio: Tools > Macros > Prepare for MIDI export.",
          },
        };

        const chosen = macros[macro_name] || macros.smart_disable;
        return {
          ok: true,
          subaction: "macro",
          macro: chosen,
          available_macros: Object.keys(macros),
        };
      }

      if (sub === "dump_score_log") {
        return {
          ok: true,
          subaction: "dump_score_log",
          title: "Dump Score Log to Selected Pattern",
          description: "FL Studio graba en segundo plano todas las notas tocadas en los últimos 2 a 30 minutos (incluso si no estabas grabando).",
          how_to: "Ve a: Tools > Dump score log to selected pattern > Últimos 2 min / 5 min / 10 min.",
        };
      }

      return {
        ok: true,
        subaction: sub,
        tip: "Usa subaction: 'macro' (purge_unused_audio, smart_disable, prepare_midi_export) | 'dump_score_log'",
      };
    },

    // ── 9. Menú PLUGINS (Catálogo Real Instalado, Favoritos, Escaneo) ─────────
    plugins: async ({ subaction = "list_installed", type = "generators" } = {}) => {
      const sub = String(subaction).toLowerCase().trim();

      if (sub === "list_installed") {
        const targetDir = type === "effects"
          ? path.join(FL_PLUGIN_DB_DIR, "Effects")
          : path.join(FL_PLUGIN_DB_DIR, "Generators");

        let foundPlugins = [];
        if (existsSync(targetDir)) {
          try {
            const scanRecursive = (dir) => {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const e of entries) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) scanRecursive(full);
                else if (e.name.endsWith(".fst")) {
                  foundPlugins.push(e.name.replace(".fst", ""));
                }
              }
            };
            scanRecursive(targetDir);
          } catch (_) {}
        }

        return {
          ok: true,
          subaction: "list_installed",
          category: type,
          total_plugins_found: foundPlugins.length,
          plugins: foundPlugins,
        };
      }

      if (sub === "free_catalog") {
        return {
          ok: true,
          subaction: "free_catalog",
          plugins: FREE_PLUGINS,
          instructions: "Instala los plugins en 'C:\\Program Files\\Common Files\\VST3'. En FL Studio ve a: Options > Manage Plugins > Find installed plugins.",
        };
      }

      if (sub === "scan") {
        return {
          ok: true,
          subaction: "scan",
          instruction: "Para escanear nuevos plugins: Abre FL Studio > Options > Manage Plugins > Haz clic en el botón amarillo 'Find installed plugins'.",
        };
      }

      return { ok: true, subaction: sub };
    },

    // ── 10. Sesión Viva Unificada (live_session) ───────────────────────────────
    live_session: async ({
      mode = "get",
      bpm = null,
      scale = null,
      root = null,
      progression = null,
      notes = null,
      style = null,
    } = {}) => {
      const sessionDir = path.join(runtime.root || process.cwd(), "storage", "fl_session");
      await fs.mkdir(sessionDir, { recursive: true }).catch(() => {});
      const sessionJsonPath = path.join(sessionDir, "live_session.json");
      const sessionMidPath = path.join(sessionDir, "live_workspace.mid");

      if (existsSync(sessionJsonPath)) {
        try {
          const raw = await fs.readFile(sessionJsonPath, "utf8");
          _liveSession = { ..._liveSession, ...JSON.parse(raw) };
        } catch (_) {}
      }

      const m = String(mode).toLowerCase().trim();

      if (m === "clear") {
        _liveSession.notes = [];
        _liveSession.last_updated = new Date().toISOString();
        await fs.writeFile(sessionJsonPath, JSON.stringify(_liveSession, null, 2), "utf8");
        return { ok: true, mode: "clear", message: "Sesión activa reseteada." };
      }

      if (m === "set_chords" || progression) {
        const chordList = Array.isArray(progression) ? progression : String(progression).split(/[\s,-]+/);
        _liveSession.progression = chordList;
        const newNotes = [];
        let curStart = 0;
        const dur = 2.0;

        for (const ch of chordList) {
          const match = String(ch).trim().match(/^([A-Ga-g][#b]?)(.*)$/);
          if (match) {
            const chRoot = match[1];
            const chType = (match[2] || "maj").toLowerCase().replace(/[^a-z0-9]/g, "");
            const base = parseNoteToMidi(`${chRoot}4`);
            const intervals = CHORD_INTERVALS[chType] || CHORD_INTERVALS["maj"];
            for (const semi of intervals) {
              newNotes.push({ pitch: base + semi, start: curStart, duration: dur - 0.05, velocity: 96 });
            }
            curStart += dur;
          }
        }
        _liveSession.notes = newNotes;
      }

      if (m === "add_notes" && Array.isArray(notes)) {
        const resolved = notes.map((n, i) => ({
          pitch: parseNoteToMidi(n.pitch ?? n.note ?? n),
          start: n.start ?? (i * 0.5),
          duration: n.duration ?? 0.45,
          velocity: n.velocity ?? 100,
        }));
        _liveSession.notes = [..._liveSession.notes, ...resolved];
      }

      if (bpm) _liveSession.bpm = Number(bpm);
      if (scale) _liveSession.scale = String(scale);
      if (root) _liveSession.root = String(root);
      if (style) _liveSession.style = String(style);
      _liveSession.last_updated = new Date().toISOString();

      await fs.writeFile(sessionJsonPath, JSON.stringify(_liveSession, null, 2), "utf8");

      if (_liveSession.notes.length > 0) {
        const midiBuf = createMidiFile({
          notes: _liveSession.notes,
          bpm: _liveSession.bpm,
          trackName: _liveSession.track_title,
        });
        await fs.writeFile(sessionMidPath, midiBuf);
      }

      const flProc = getFlRunningProcess();

      return {
        ok: true,
        mode: m,
        fl_studio_running: Boolean(flProc),
        fl_studio_pid: flProc?.pid || null,
        session: {
          bpm: _liveSession.bpm,
          root: _liveSession.root,
          scale: _liveSession.scale,
          style: _liveSession.style,
          progression: _liveSession.progression,
          notes_count: _liveSession.notes.length,
          last_updated: _liveSession.last_updated,
        },
        live_file: sessionMidPath,
        live_json: sessionJsonPath,
      };
    },

    // ── 11. Teoría Musical y Armonía ──────────────────────────────────────────
    music_theory: async ({ mode = "scale", scale = "minor", root = "C", chord = "maj7" } = {}) => {
      const rootSemi = parseNoteToMidi(`${root}4`);
      if (mode === "scale" || mode === "scales") {
        const intervals = SCALES[scale.toLowerCase()] || SCALES.minor;
        const notesInScale = intervals.map(i => ({
          note: midiToNoteName(rootSemi + i),
          pitch_class: NOTE_NAMES_SHARP[(rootSemi + i) % 12],
          offset: i,
        }));
        return {
          ok: true,
          mode: "scale",
          scale,
          root,
          notes: notesInScale.map(n => n.pitch_class),
          full_details: notesInScale,
        };
      }
      if (mode === "chord" || mode === "chords") {
        const intervals = CHORD_INTERVALS[chord.toLowerCase()] || CHORD_INTERVALS.maj;
        const cNotes = intervals.map(i => ({
          note: midiToNoteName(rootSemi + i),
          pitch_class: NOTE_NAMES_SHARP[(rootSemi + i) % 12],
          midi: rootSemi + i,
        }));
        return {
          ok: true,
          mode: "chord",
          chord: `${root}${chord}`,
          root,
          notes: cNotes.map(n => n.pitch_class),
          midi_notes: cNotes.map(n => n.midi),
        };
      }
      return {
        ok: true,
        mode: "progressions",
        popular: {
          trap: ["i", "VI", "v", "i"],
          lofi_jazz: ["ii7", "V7", "Imaj7", "VI7"],
          synthwave: ["i", "bVII", "bVI", "bVII"],
          pop_hits: ["I", "V", "vi", "IV"],
        },
      };
    },

    // ── 12. Cambio de Tono y Afinación ────────────────────────────────────────
    change_tone: async ({ notes = [], semitones = 0, tuning_hz = 440 } = {}) => {
      const shift = Number(semitones) || 0;
      const transposed = notes.map(n => {
        if (typeof n === "string") return midiToNoteName(parseNoteToMidi(n) + shift);
        if (typeof n === "number") return Math.min(127, Math.max(0, n + shift));
        if (typeof n === "object") {
          const oldP = parseNoteToMidi(n.pitch ?? n.note ?? 60);
          const newP = Math.min(127, Math.max(0, oldP + shift));
          return { ...n, pitch: newP, note: midiToNoteName(newP) };
        }
        return n;
      });
      const centsShift = Math.round(1200 * Math.log2(tuning_hz / 440));
      return {
        ok: true,
        semitones_shifted: shift,
        transposed_notes: transposed,
        tuning: { tuning_hz, cents_offset: centsShift },
      };
    },

    // ── 13. Presets por Estilo ────────────────────────────────────────────────
    style_presets: async ({ style = "all" } = {}) => {
      const s = String(style).toLowerCase().trim();
      if (s !== "all" && STYLE_PRESETS[s]) return { ok: true, style: s, preset: STYLE_PRESETS[s] };
      return { ok: true, available_styles: Object.keys(STYLE_PRESETS), presets: STYLE_PRESETS };
    },

    // ── 14. Diseño de Sonido ──────────────────────────────────────────────────
    sound_design: async ({ type = "bass_808" } = {}) => {
      const recipes = {
        bass_808: { name: "Sub 808 Saturado", wave: "Sine + Triangle", cutoff: "180 Hz", distortion: "Fruity Soft Clipper / Tube", decay: "800ms" },
        synth_lead: { name: "Lead Brillante", wave: "Sawtooth (5 unisons, 18 cents)", filter: "Low-Pass 4.5 kHz", fx: "OTT + Delay 3/16" },
        ambient_pad: { name: "Pad Evolutivo", wave: "Wavetable + Saw", attack: "1500ms", release: "2500ms", fx: "Valhalla Supermassive" },
        trap_bell_pluck: { name: "Campanas Trap", wave: "Sine FM", attack: "0ms", decay: "350ms", fx: "Gross Beat (Half-Speed)" },
      };
      return { ok: true, type, recipe: recipes[type.toLowerCase()] || recipes.bass_808 };
    },

    // ── 15. Cadenas de Mezcla ─────────────────────────────────────────────────
    mixer_settings: async ({ track_type = "master" } = {}) => {
      const chains = {
        master: { track: "Master (0)", fx: ["Parametric EQ 2 (Corte 30 Hz)", "Maximus (Compresión 3 bandas)", "Stereo Enhancer (Mono < 120 Hz)", "Fruity Limiter / Soft Clipper (-0.3 dB True Peak)"], target_lufs: "-14 LUFS (streaming) / -9 LUFS (club)" },
        vocal: { track: "Lead Vocal", fx: ["Pitcher / NewTone", "EQ 2 (Corte 100 Hz)", "Fruity Compressor", "De-Esser (6-8 kHz)", "Delay 3 + Reverb 2 (Send)"] },
        drum_bus: { track: "Drum Bus", fx: ["Transient Processor (+2dB attack)", "Soft Clipper", "Blood Overdrive (Saturación sutil)"] }
      };
      return { ok: true, track_type, settings: chains[track_type.toLowerCase()] || chains.master };
    },
  };

  const permissions = {
    detect: "standard", open: "advanced", launch: "advanced", file: "standard",
    edit: "standard", view: "standard", patterns: "standard", options: "advanced",
    tools: "standard", plugins: "standard", live_session: "standard",
    music_theory: "standard", change_tone: "standard", style_presets: "standard",
    sound_design: "standard", mixer_settings: "standard"
  };

  return domain(
    "flstudio",
    "FL Studio Autonomous Suite v11.0.5. Acciones: detect | open { project_path? } | file { subaction: 'new'|'open'|'save'|'export'|'backup'|'info', path?, format? } | edit { subaction: 'undo'|'redo'|'cut'|'copy'|'paste'|'select_all'|'delete'|'duplicate'|'quantize' } | view { subaction: 'playlist'|'channel_rack'|'piano_roll'|'mixer'|'browser'|'plugin_picker'|'close_all' } | patterns { subaction: 'select'|'next'|'prev'|'rename'|'clone'|'split_by_channel' } | options { subaction: 'audio'|'midi'|'general'|'file', confirm_security? } | tools { subaction: 'macro'|'dump_score_log'|'chord_tool' } | plugins { subaction: 'list_installed'|'free_catalog'|'scan' } | live_session { mode: 'get'|'set_chords'|'add_notes'|'clear', progression, bpm, root, scale } | music_theory | change_tone | style_presets | sound_design | mixer_settings",
    actions,
    permissions
  );
}
