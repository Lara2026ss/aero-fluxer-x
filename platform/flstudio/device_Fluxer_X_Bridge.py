# name=Fluxer X Bridge
# url=https://github.com/fluxer-x

"""
Fluxer X — FL Studio Hardware Controller Script (Thin Bridge)
Exposes low-cost, real-time FL Studio automation to Fluxer X MCP.
Dual Transport:
  1. Primary: Local TCP socket server on 127.0.0.1:9876 (bundled Python 3.12+ in FL Studio 2025/2026)
  2. Fallback: Virtual MIDI SysEx message transport (loopMIDI / IAC)
All FL Studio API calls are executed strictly on the main thread inside OnIdle().
"""

import sys
import os
import json
import time
import threading
import queue

# FL Studio API imports (available when loaded by FL Studio)
try:
    import transport
    import mixer
    import channels
    import patterns
    import general
    import ui
    import device
except ImportError:
    transport = None
    mixer = None
    channels = None
    patterns = None
    general = None
    ui = None
    device = None

# Check socket capability
HAS_SOCKET = False
try:
    import _socket
    import socket
    HAS_SOCKET = True
except Exception:
    HAS_SOCKET = False

DEFAULT_PORT = 9876
HOST = "127.0.0.1"

class BridgeController:
    def __init__(self):
        self.running = False
        self.server_socket = None
        self.server_thread = None
        self.active_clients = []
        self.clients_lock = threading.Lock()
        self.command_queue = queue.Queue()
        self.pending_responses = {}
        self.response_lock = threading.Lock()
        self.transport_type = "tcp" if HAS_SOCKET else "midi"
        self.midi_sysex_buffer = bytearray()
        self.initialized = False

    def log(self, msg):
        print(f"[FluxerX Bridge] {msg}")

    def initialize(self):
        if self.initialized:
            return
        self.running = True
        self.log(f"Initializing Fluxer X Bridge (Python {sys.version.split()[0]}, Socket: {HAS_SOCKET})")

        if HAS_SOCKET:
            self._start_socket_server()
        else:
            self.transport_type = "midi"
            self.log("Socket unavailable; running in Virtual MIDI transport mode.")

        self.initialized = True

    def _start_socket_server(self):
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind((HOST, DEFAULT_PORT))
            self.server_socket.listen(5)
            self.server_socket.settimeout(1.0)
            self.transport_type = "tcp"
            self.server_thread = threading.Thread(target=self._socket_accept_loop, daemon=True)
            self.server_thread.start()
            self.log(f"TCP server listening on {HOST}:{DEFAULT_PORT}")
        except Exception as e:
            self.log(f"Failed to start TCP server ({e}). Falling back to MIDI transport.")
            self.transport_type = "midi"
            if self.server_socket:
                try:
                    self.server_socket.close()
                except Exception:
                    pass
                self.server_socket = None

    def _socket_accept_loop(self):
        while self.running and self.server_socket:
            try:
                client_sock, addr = self.server_socket.accept()
                client_sock.settimeout(None)
                t = threading.Thread(target=self._client_handler, args=(client_sock, addr), daemon=True)
                with self.clients_lock:
                    self.active_clients.append(client_sock)
                t.start()
            except socket.timeout:
                continue
            except Exception:
                break

    def _client_handler(self, client_sock, addr):
        buffer = ""
        try:
            while self.running:
                chunk = client_sock.recv(4096)
                if not chunk:
                    break
                buffer += chunk.decode("utf-8", errors="replace")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        req = json.loads(line)
                        req_id = req.get("id", str(time.time()))
                        # Setup response event
                        resp_event = threading.Event()
                        with self.response_lock:
                            self.pending_responses[req_id] = {
                                "event": resp_event,
                                "result": None,
                                "client_sock": client_sock
                            }
                        self.command_queue.put(req)
                        # Wait for main thread to execute in OnIdle
                        if resp_event.wait(timeout=4.0):
                            with self.response_lock:
                                entry = self.pending_responses.pop(req_id, None)
                            if entry and entry["result"] is not None:
                                resp_data = json.dumps(entry["result"]) + "\n"
                                client_sock.sendall(resp_data.encode("utf-8"))
                        else:
                            with self.response_lock:
                                self.pending_responses.pop(req_id, None)
                            err_resp = json.dumps({"id": req_id, "ok": False, "error": "TIMEOUT_WAITING_ON_IDLE"}) + "\n"
                            client_sock.sendall(err_resp.encode("utf-8"))
                    except Exception as parse_err:
                        err_resp = json.dumps({"ok": False, "error": str(parse_err)}) + "\n"
                        client_sock.sendall(err_resp.encode("utf-8"))
        except Exception:
            pass
        finally:
            with self.clients_lock:
                if client_sock in self.active_clients:
                    self.active_clients.remove(client_sock)
            try:
                client_sock.close()
            except Exception:
                pass

    def shutdown(self):
        self.running = False
        self.initialized = False
        if self.server_socket:
            try:
                self.server_socket.close()
            except Exception:
                pass
            self.server_socket = None
        with self.clients_lock:
            for s in self.active_clients:
                try:
                    s.close()
                except Exception:
                    pass
            self.active_clients.clear()
        self.log("Bridge shut down successfully.")

    def on_idle(self):
        """Called repeatedly by FL Studio on its main thread."""
        while not self.command_queue.empty():
            try:
                req = self.command_queue.get_nowait()
            except queue.Empty:
                break

            req_id = req.get("id")
            action = req.get("action", "")
            args = req.get("args", {})
            result = self._dispatch_action(action, args)
            full_response = {"id": req_id, **result}

            # If response is expected by a socket thread
            with self.response_lock:
                if req_id in self.pending_responses:
                    self.pending_responses[req_id]["result"] = full_response
                    self.pending_responses[req_id]["event"].set()

            # If response is over MIDI SysEx
            if req.get("_via_midi") and device:
                self._send_midi_response(full_response)

    def _dispatch_action(self, action, args):
        """Executes FL Studio API functions strictly on the main thread."""
        try:
            # ── 1. Ping & Health ──────────────────────────────────────────────
            if action == "ping":
                fl_ver = general.getVersion() if general else "unknown"
                dev_name = device.getName() if device else "Fluxer X Bridge"
                port_num = device.getPortNumber() if device else 0
                return {
                    "ok": True,
                    "status": "connected",
                    "fl_version": fl_ver,
                    "python_version": sys.version.split()[0],
                    "device_name": dev_name,
                    "port_number": port_num,
                    "transport": self.transport_type,
                    "timestamp": time.time()
                }

            # ── 2. Context Query (for Piano Roll target checking) ─────────────
            if action == "context_query":
                active_pat = patterns.patternNumber() if patterns else 1
                pat_count = patterns.patternCount() if patterns else 1
                pat_name = patterns.getPatternName(active_pat) if patterns else ""
                sel_chan = channels.selectedChannel() if channels else 0
                chan_count = channels.channelCount() if channels else 0
                chan_name = channels.getChannelName(sel_chan) if channels else ""
                bpm = (general.getRecTempo() / 1000.0) if general else 120.0
                is_playing = transport.isPlaying() if transport else False
                return {
                    "ok": True,
                    "active_pattern": active_pat,
                    "pattern_count": pat_count,
                    "pattern_name": pat_name,
                    "selected_channel": sel_chan,
                    "channel_count": chan_count,
                    "channel_name": chan_name,
                    "bpm": round(bpm, 2),
                    "is_playing": bool(is_playing)
                }

            # ── 3. Transport Actions ──────────────────────────────────────────
            if action == "transport.get_info":
                if not transport or not general:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                return {
                    "ok": True,
                    "is_playing": bool(transport.isPlaying()),
                    "is_recording": bool(transport.isRecording()),
                    "bpm": round(general.getRecTempo() / 1000.0, 2),
                    "song_pos_beats": round(transport.getSongPos(0), 3),
                    "song_length_beats": round(transport.getSongLength(0), 3),
                    "loop_mode": bool(transport.getLoopMode())
                }

            if action in ("transport.start", "transport.play"):
                if not transport:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                transport.start()
                return {"ok": True, "playing": bool(transport.isPlaying())}

            if action in ("transport.stop"):
                if not transport:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                transport.stop()
                return {"ok": True, "playing": bool(transport.isPlaying())}

            if action in ("transport.pause"):
                if not transport:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                # Toggle play/pause
                transport.start()
                return {"ok": True, "playing": bool(transport.isPlaying())}

            if action in ("transport.record"):
                if not transport:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                transport.record()
                return {"ok": True, "recording": bool(transport.isRecording())}

            if action == "transport.set_tempo":
                if not general:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                target_bpm = float(args.get("bpm", 120.0))
                prev_bpm = round(general.getRecTempo() / 1000.0, 2)
                general.setRecTempo(int(round(target_bpm * 1000.0)))
                readback_bpm = round(general.getRecTempo() / 1000.0, 2)
                return {
                    "ok": True,
                    "previous_bpm": prev_bpm,
                    "readback_bpm": readback_bpm,
                    "target_bpm": target_bpm,
                    "confirmed": abs(readback_bpm - target_bpm) < 0.2
                }

            if action == "transport.set_song_pos":
                if not transport:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                pos = float(args.get("pos", 0.0))
                mode = int(args.get("mode", 0))
                transport.setSongPos(pos, mode)
                readback = round(transport.getSongPos(mode), 3)
                return {"ok": True, "readback_pos": readback}

            # ── 4. Mixer Actions ──────────────────────────────────────────────
            if action == "mixer.get_tracks":
                if not mixer:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                start = max(0, int(args.get("start", 0)))
                count = min(30, max(1, int(args.get("count", 10))))
                total = mixer.trackCount()
                tracks = []
                for i in range(start, min(total, start + count)):
                    tracks.append({
                        "index": i,
                        "name": mixer.getTrackName(i),
                        "volume": round(mixer.getTrackVolume(i), 3),
                        "pan": round(mixer.getTrackPan(i), 3),
                        "is_muted": bool(mixer.isTrackMuted(i)),
                        "is_solo": bool(mixer.isTrackSolo(i))
                    })
                return {"ok": True, "total_tracks": total, "start": start, "count": len(tracks), "tracks": tracks}

            if action == "mixer.set_volume":
                if not mixer:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                track = int(args.get("track", 0))
                vol = max(0.0, min(1.0, float(args.get("volume", 0.8))))
                prev = round(mixer.getTrackVolume(track), 3)
                mixer.setTrackVolume(track, vol)
                readback = round(mixer.getTrackVolume(track), 3)
                return {
                    "ok": True,
                    "track": track,
                    "previous": prev,
                    "readback": readback,
                    "target": vol,
                    "confirmed": abs(readback - vol) < 0.05
                }

            if action == "mixer.set_pan":
                if not mixer:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                track = int(args.get("track", 0))
                pan = max(-1.0, min(1.0, float(args.get("pan", 0.0))))
                prev = round(mixer.getTrackPan(track), 3)
                mixer.setTrackPan(track, pan)
                readback = round(mixer.getTrackPan(track), 3)
                return {
                    "ok": True,
                    "track": track,
                    "previous": prev,
                    "readback": readback,
                    "target": pan,
                    "confirmed": abs(readback - pan) < 0.05
                }

            if action == "mixer.set_mute":
                if not mixer:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                track = int(args.get("track", 0))
                muted = args.get("muted")
                prev = bool(mixer.isTrackMuted(track))
                if muted is None or bool(muted) != prev:
                    mixer.muteTrack(track)
                readback = bool(mixer.isTrackMuted(track))
                return {
                    "ok": True,
                    "track": track,
                    "previous": prev,
                    "readback": readback,
                    "confirmed": readback == bool(muted) if muted is not None else True
                }

            if action == "mixer.set_solo":
                if not mixer:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                track = int(args.get("track", 0))
                prev = bool(mixer.isTrackSolo(track))
                mixer.soloTrack(track)
                readback = bool(mixer.isTrackSolo(track))
                return {"ok": True, "track": track, "previous": prev, "readback": readback}

            if action == "mixer.set_name":
                if not mixer:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                track = int(args.get("track", 0))
                name = str(args.get("name", ""))
                prev = mixer.getTrackName(track)
                mixer.setTrackName(track, name)
                readback = mixer.getTrackName(track)
                return {"ok": True, "track": track, "previous": prev, "readback": readback, "confirmed": readback == name}

            # ── 5. Channel Rack Actions ───────────────────────────────────────
            if action == "channels.list":
                if not channels:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                start = max(0, int(args.get("start", 0)))
                count = min(30, max(1, int(args.get("count", 10))))
                total = channels.channelCount()
                chans = []
                for i in range(start, min(total, start + count)):
                    chans.append({
                        "index": i,
                        "name": channels.getChannelName(i),
                        "is_muted": bool(channels.isChannelMuted(i)),
                        "is_solo": bool(channels.isChannelSolo(i)),
                        "volume": round(channels.getChannelVolume(i), 3),
                        "pan": round(channels.getChannelPan(i), 3)
                    })
                return {"ok": True, "total_channels": total, "start": start, "count": len(chans), "channels": chans}

            if action == "channels.select":
                if not channels:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                idx = int(args.get("index", 0))
                channels.selectChannel(idx, 1)
                readback = channels.selectedChannel()
                return {"ok": True, "selected_channel": readback, "confirmed": readback == idx}

            if action == "channels.set_mute":
                if not channels:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                idx = int(args.get("index", 0))
                prev = bool(channels.isChannelMuted(idx))
                channels.muteChannel(idx)
                readback = bool(channels.isChannelMuted(idx))
                return {"ok": True, "index": idx, "previous": prev, "readback": readback}

            if action == "channels.rename":
                if not channels:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                idx = int(args.get("index", 0))
                name = str(args.get("name", ""))
                prev = channels.getChannelName(idx)
                channels.setChannelName(idx, name)
                readback = channels.getChannelName(idx)
                return {"ok": True, "index": idx, "previous": prev, "readback": readback, "confirmed": readback == name}

            # ── 6. Patterns Actions ───────────────────────────────────────────
            if action == "patterns.get_info":
                if not patterns:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                cur = patterns.patternNumber()
                return {
                    "ok": True,
                    "current_pattern": cur,
                    "pattern_count": patterns.patternCount(),
                    "pattern_name": patterns.getPatternName(cur)
                }

            if action == "patterns.select":
                if not patterns:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                idx = int(args.get("index", 1))
                prev = patterns.patternNumber()
                patterns.jumpToPattern(idx)
                readback = patterns.patternNumber()
                return {"ok": True, "previous": prev, "readback": readback, "confirmed": readback == idx}

            # ── 7. UI Focus Actions ───────────────────────────────────────────
            if action == "ui.focus":
                if not ui:
                    return {"ok": False, "error": "FL_API_UNAVAILABLE"}
                window_map = {"mixer": 0, "channel_rack": 1, "playlist": 2, "piano_roll": 3, "browser": 4}
                w = args.get("window", "channel_rack")
                w_idx = window_map.get(w, 1)
                ui.showWindow(w_idx)
                ui.setFocused(w_idx)
                return {"ok": True, "window": w, "window_id": w_idx}

            return {"ok": False, "error": f"UNKNOWN_ACTION: {action}"}

        except Exception as ex:
            return {"ok": False, "error": str(ex), "action": action}

    # ── MIDI Fallback Handling ────────────────────────────────────────────────
    def on_midi_msg(self, event):
        """Processes MIDI SysEx messages when TCP socket is unavailable."""
        if not event or not hasattr(event, "status"):
            return

        # SysEx message handling
        if event.status == 0xF0:
            self.midi_sysex_buffer = bytearray(event.sysex) if hasattr(event, "sysex") else bytearray()
            # If terminated in same packet
            if self.midi_sysex_buffer.endswith(b'\xF7'):
                self._process_sysex_command(self.midi_sysex_buffer)
                self.midi_sysex_buffer.clear()
            event.handled = True
        elif len(self.midi_sysex_buffer) > 0:
            if hasattr(event, "sysex"):
                self.midi_sysex_buffer.extend(event.sysex)
                if self.midi_sysex_buffer.endswith(b'\xF7'):
                    self._process_sysex_command(self.midi_sysex_buffer)
                    self.midi_sysex_buffer.clear()
            event.handled = True

    def _process_sysex_command(self, raw_sysex):
        try:
            # Strip 0xF0 header and 0xF7 tail
            data = raw_sysex[1:-1] if raw_sysex.startswith(b'\xF0') and raw_sysex.endswith(b'\xF7') else raw_sysex
            # Decode 7-bit to 8-bit text
            text = bytes(b & 0x7F for b in data).decode("utf-8", errors="replace")
            req = json.loads(text)
            req["_via_midi"] = True
            self.command_queue.put(req)
        except Exception as e:
            self.log(f"SysEx parse error: {e}")

    def _send_midi_response(self, response_dict):
        try:
            payload = json.dumps(response_dict).encode("utf-8")
            # 7-bit SysEx wrapping
            sysex = bytearray([0xF0]) + bytearray(b & 0x7F for b in payload) + bytearray([0xF7])
            if hasattr(device, "midiOutSysex"):
                device.midiOutSysex(bytes(sysex))
        except Exception as e:
            self.log(f"SysEx send error: {e}")


# Global controller singleton
bridge = BridgeController()

def OnInit():
    bridge.initialize()

def OnDeInit():
    bridge.shutdown()

def OnIdle():
    bridge.on_idle()

def OnMidiMsg(event):
    bridge.on_midi_msg(event)

def OnRefresh(flags):
    pass
