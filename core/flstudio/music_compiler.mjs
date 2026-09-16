/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🎹 FLUXER XZ (V4.0 Architecture) — core/flstudio/music_compiler.mjs
 * Token-Efficient Autonomous Music Compiler.
 * Translates high-level musical intent (genre, scale, root, chords, rhythm)
 * into structured FL Studio channel, pattern, note, and step commands.
 * ══════════════════════════════════════════════════════════════════════════════
 */

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const NOTE_TO_SEMITONE = {
  "C": 0, "B#": 0, "C#": 1, "DB": 1, "D": 2, "D#": 3, "EB": 3, "E": 4, "FB": 4,
  "F": 5, "E#": 5, "F#": 6, "GB": 6, "G": 7, "G#": 8, "AB": 8, "A": 9, "A#": 10,
  "BB": 10, "B": 11, "CB": 11,
};

export const SCALES = {
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
};

export const CHORD_INTERVALS = {
  "": [0, 4, 7],
  "maj": [0, 4, 7],
  "m": [0, 3, 7],
  "min": [0, 3, 7],
  "dim": [0, 3, 6],
  "aug": [0, 4, 8],
  "sus2": [0, 2, 7],
  "sus4": [0, 5, 7],
  "7": [0, 4, 7, 10],
  "maj7": [0, 4, 7, 11],
  "m7": [0, 3, 7, 10],
  "min7": [0, 3, 7, 10],
  "dim7": [0, 3, 6, 9],
  "m7b5": [0, 3, 6, 10],
  "9": [0, 4, 7, 10, 14],
  "maj9": [0, 4, 7, 11, 14],
  "min9": [0, 3, 7, 10, 14],
  "add9": [0, 4, 7, 14],
  "5": [0, 7],
  "power": [0, 7],
};

export const GENRE_PRESETS = {
  trap: {
    name: "Trap / Dark Trap",
    defaultBpm: 140,
    defaultScale: "harmonic_minor",
    defaultRoot: "C#",
    defaultChords: ["C#m", "A", "F#m", "G#"],
    drumPatterns: {
      kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1],
      openhat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    },
  },
  lofi: {
    name: "Lo-Fi Hip-Hop / Chillhop",
    defaultBpm: 82,
    defaultScale: "dorian",
    defaultRoot: "D",
    defaultChords: ["Dm7", "G7", "Cmaj7", "A7"],
    drumPatterns: {
      kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      openhat: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    },
  },
  synthwave: {
    name: "Synthwave / Retrowave",
    defaultBpm: 115,
    defaultScale: "minor",
    defaultRoot: "A",
    defaultChords: ["Am", "F", "C", "G"],
    drumPatterns: {
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      openhat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    },
  },
  drill: {
    name: "UK / NY Drill",
    defaultBpm: 142,
    defaultScale: "phrygian",
    defaultRoot: "F",
    defaultChords: ["Fm", "Gb", "Bbm", "C7"],
    drumPatterns: {
      kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
      hihat: [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1],
      openhat: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
    },
  },
  edm_house: {
    name: "EDM / House",
    defaultBpm: 126,
    defaultScale: "minor",
    defaultRoot: "F",
    defaultChords: ["Fm", "Db", "Ab", "Eb"],
    drumPatterns: {
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      openhat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    },
  },
  reggaeton: {
    name: "Reggaeton / Latin Urban",
    defaultBpm: 94,
    defaultScale: "minor",
    defaultRoot: "G",
    defaultChords: ["Gm", "Eb", "Bb", "F"],
    drumPatterns: {
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0], // Dembow
      hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      openhat: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    },
  },
};

/**
 * Parses note name to MIDI number (e.g. "C#4" -> 61, "A4" -> 69)
 */
export function noteToMidi(noteStr, defaultOctave = 4) {
  if (typeof noteStr === "number") return Math.min(127, Math.max(0, Math.round(noteStr)));
  const match = String(noteStr).trim().match(/^([A-Ga-g][#b]?)(-?\d+)?$/);
  if (!match) return 60;
  const pitchName = match[1].toUpperCase();
  const octave = match[2] !== undefined ? parseInt(match[2], 10) : defaultOctave;
  const semi = NOTE_TO_SEMITONE[pitchName] ?? 0;
  return Math.min(127, Math.max(0, (octave + 1) * 12 + semi));
}

/**
 * Converts MIDI number to note name (e.g. 60 -> "C4")
 */
export function midiToNote(midiNum) {
  const note = Math.min(127, Math.max(0, Math.round(midiNum)));
  const octave = Math.floor(note / 12) - 1;
  const name = NOTE_NAMES[note % 12];
  return `${name}${octave}`;
}

/**
 * Parses chord symbol (e.g. "C#m7", "Bbmaj", "F#") into MIDI notes
 */
export function parseChord(chordStr, defaultOctave = 4) {
  const clean = String(chordStr).trim();
  const match = clean.match(/^([A-Ga-g][#b]?)(.*)$/);
  if (!match) return [60, 64, 67];

  const rootName = match[1].toUpperCase();
  const quality = match[2].toLowerCase();

  const rootMidi = noteToMidi(rootName, defaultOctave);
  const intervals = CHORD_INTERVALS[quality] || CHORD_INTERVALS[""] || [0, 4, 7];

  return intervals.map((semi) => rootMidi + semi);
}

/**
 * Compiles a high-level music specification into complete FL Studio bridge payload
 */
export function compileMusicIntent(intent = {}) {
  const style = String(intent.style || intent.genre || "trap").toLowerCase();
  const preset = GENRE_PRESETS[style] || GENRE_PRESETS.trap;

  const bpm = Number(intent.bpm) || preset.defaultBpm;
  const root = String(intent.root || preset.defaultRoot).toUpperCase();
  const scale = String(intent.scale || preset.defaultScale).toLowerCase();
  const chordsInput = Array.isArray(intent.chords) && intent.chords.length > 0 ? intent.chords : preset.defaultChords;
  const autoPlay = intent.autoPlay !== undefined ? Boolean(intent.autoPlay) : true;
  const targetPattern = Number(intent.pattern || intent.patternNumber) || 1;

  // Build chord objects with note names and pitches
  const parsedChords = chordsInput.map((chordName) => {
    const pitches = parseChord(chordName, 4);
    return {
      name: chordName,
      pitches,
      notes: pitches.map(midiToNote),
    };
  });

  // Build drum channels
  const drumDefs = preset.drumPatterns;
  const channelSteps = [
    { index: 0, name: "Kick", steps: drumDefs.kick.map((bit, idx) => (bit ? idx + 1 : null)).filter(Boolean) },
    { index: 1, name: "Clap/Snare", steps: drumDefs.snare.map((bit, idx) => (bit ? idx + 1 : null)).filter(Boolean) },
    { index: 2, name: "HiHat", steps: drumDefs.hihat.map((bit, idx) => (bit ? idx + 1 : null)).filter(Boolean) },
    { index: 3, name: "OpenHat", steps: drumDefs.openhat.map((bit, idx) => (bit ? idx + 1 : null)).filter(Boolean) },
  ];

  // Commands to send to FL Studio Bridge
  const bridgePayload = {
    action: "program_beat",
    bpm,
    pattern: targetPattern,
    clear: true,
    auto_play: autoPlay,
    channels: channelSteps,
  };

  const summary = `Compiled ${preset.name} in ${root} ${scale} @ ${bpm} BPM (${parsedChords.map((c) => c.name).join(" - ")}). ${channelSteps.length} drum tracks programmed.`;

  return {
    ok: true,
    style: preset.name,
    bpm,
    root,
    scale,
    chords: parsedChords,
    drumChannels: channelSteps,
    autoPlay,
    pattern: targetPattern,
    bridgePayload,
    summary,
  };
}
