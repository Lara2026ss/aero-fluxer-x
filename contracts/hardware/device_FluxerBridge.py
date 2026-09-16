# name=Fluxer AI Bridge
# url=https://github.com/fluxer-mcp
# version=4.0.0 (Generation V4.0 FLUXER XZ)
import channels, patterns, transport, mixer, ui, os, json, time, socket

STORAGE_DIR = os.path.join(os.path.expandvars(r'%USERPROFILE%'), 'OneDrive', 'Documents', 'Systems', 'Flux-mcp-doc', 'Windows MCP', 'Fluxer X', 'storage', 'fl_session')
COMMANDS_FILE = os.path.join(STORAGE_DIR, 'live_commands.json')
RESULT_FILE = os.path.join(STORAGE_DIR, 'live_result.json')
IDLE_CHECK_EVERY = 10
_counter = [0]
_last_mtime = [0]
_server_sock = None

def _write_result(data):
    try:
        data['ts'] = time.time()
        with open(RESULT_FILE, 'w') as f:
            json.dump(data, f, indent=2)
    except:
        pass

def OnInit():
    global _server_sock
    os.makedirs(STORAGE_DIR, exist_ok=True)
    try:
        _server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        _server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        _server_sock.bind(('127.0.0.1', 49152))
        _server_sock.listen(1)
        _server_sock.setblocking(False)
        print('[FluxerBridge V4.0] TCP Socket listening on 127.0.0.1:49152')
    except Exception as e:
        print('[FluxerBridge V4.0] TCP Socket bind skipped: ' + str(e))
        _server_sock = None

    _write_result({'status': 'ready', 'msg': 'Fluxer Bridge V4.0 initialized', 'version': '30.0.0'})
    print('[FluxerBridge V4.0] Ready. Mailbox: ' + COMMANDS_FILE)

def OnDeInit():
    global _server_sock
    if _server_sock:
        try:
            _server_sock.close()
        except:
            pass
    _write_result({'status': 'offline'})

def OnIdle():
    global _server_sock
    # 1. Non-blocking Socket Poll
    if _server_sock:
        try:
            conn, addr = _server_sock.accept()
            conn.setblocking(True)
            data = conn.recv(65536).decode('utf-8')
            if data:
                cmd = json.loads(data.strip())
                res = _dispatch(cmd)
                conn.sendall((json.dumps(res) + '\n').encode('utf-8'))
            conn.close()
        except BlockingIOError:
            pass
        except Exception:
            pass

    # 2. Mailbox Poll
    _counter[0] += 1
    if _counter[0] < IDLE_CHECK_EVERY:
        return
    _counter[0] = 0
    if not os.path.exists(COMMANDS_FILE):
        return
    try:
        mtime = os.path.getmtime(COMMANDS_FILE)
        if mtime <= _last_mtime[0]:
            return
        _last_mtime[0] = mtime
        with open(COMMANDS_FILE, 'r') as f:
            cmd = json.load(f)
        _dispatch(cmd)
    except Exception as e:
        _write_result({'status': 'error', 'msg': str(e)})

def _dispatch(cmd):
    action = cmd.get('action', '').lower()
    res = {'status': 'ok', 'action': action}
    try:
        if action == 'program_beat':
            res = _program_beat(cmd)
        elif action == 'program_notes':
            res = _program_notes(cmd)
        elif action == 'play':
            transport.start()
            res['playing'] = True
        elif action == 'stop':
            transport.stop()
            res['playing'] = False
        elif action == 'set_bpm':
            bpm = float(cmd.get('bpm', 120))
            transport.setTempo(bpm)
            res['bpm'] = bpm
        elif action == 'status':
            res = {
                'status': 'ok',
                'action': 'status',
                'bridge': True,
                'version': '30.0.0',
                'playing': bool(transport.isPlaying()),
                'bpm': transport.getTempo(),
                'pattern': patterns.patternNumber(),
                'channels': channels.channelCount(),
                'ch_names': [channels.getChannelName(i) for i in range(min(channels.channelCount(), 16))]
            }
        elif action == 'clear_beat':
            for ci in range(channels.channelCount()):
                for s in range(32):
                    channels.setGridBit(ci, s, 0)
            res['cleared'] = True
        elif action == 'mixer':
            res = _handle_mixer(cmd)
        elif action == 'window':
            res = _handle_window(cmd)
    except Exception as e:
        res = {'status': 'error', 'action': action, 'msg': str(e)}

    _write_result(res)
    return res

def _program_beat(cmd):
    bpm = cmd.get('bpm')
    if bpm:
        transport.setTempo(float(bpm))
    pattern = cmd.get('pattern', 1)
    if pattern >= 1:
        patterns.jumpToPattern(int(pattern))
    ch_defs = cmd.get('channels', [])
    clear = cmd.get('clear', True)
    programmed = []
    for ch_def in ch_defs:
        ci = int(ch_def.get('index', 0))
        if ci >= channels.channelCount():
            continue
        steps = [int(s) - 1 for s in ch_def.get('steps', [])]
        vels = ch_def.get('velocities', {})
        if clear:
            for s in range(32):
                channels.setGridBit(ci, s, 0)
        for step in steps:
            if 0 <= step <= 31:
                channels.setGridBit(ci, step, 1)
                vel = int(vels.get(str(step + 1), 100))
                channels.setStepParameterByIndex(channels.getChannelIndex(ci), patterns.patternNumber(), step, 1, vel, 1)
        programmed.append({'ch': ci, 'name': ch_def.get('name', ''), 'steps': [s + 1 for s in steps]})
    if cmd.get('auto_play', True):
        transport.start()
    return {
        'status': 'ok',
        'action': 'program_beat',
        'programmed': programmed,
        'bpm': bpm,
        'playing': cmd.get('auto_play', True),
        'msg': 'Beat programmed live in FL Studio via Fluxer XZ V4.0 Bridge!'
    }

def _program_notes(cmd):
    ci = int(cmd.get('channel', channels.selectedChannel()))
    notes = cmd.get('notes', [])
    if 0 <= ci < channels.channelCount():
        channels.selectChannel(ci, 1)
    for note in notes:
        channels.midiNoteOn(ci, int(note.get('pitch', 60)), int(note.get('velocity', 100)))
    return {'status': 'ok', 'action': 'program_notes', 'channel': ci, 'notes': len(notes)}

def _handle_mixer(cmd):
    sub = cmd.get('subaction', 'status')
    track = int(cmd.get('track', 0))
    if sub == 'volume' and 'value' in cmd:
        val = float(cmd.get('value', 0.8))
        mixer.setTrackVolume(track, val)
        return {'status': 'ok', 'track': track, 'volume': val}
    elif sub == 'mute':
        mixer.muteTrack(track)
        return {'status': 'ok', 'track': track, 'muted': bool(mixer.isTrackMuted(track))}
    return {'status': 'ok', 'track': track, 'volume': mixer.getTrackVolume(track), 'muted': bool(mixer.isTrackMuted(track))}

def _handle_window(cmd):
    win = cmd.get('window', 'channel_rack').lower()
    win_map = {
        'channel_rack': 1,
        'piano_roll': 2,
        'playlist': 3,
        'mixer': 4,
        'browser': 5
    }
    win_id = win_map.get(win, 1)
    try:
        ui.showWindow(win_id)
        ui.setFocused(win_id)
        return {'status': 'ok', 'window': win, 'id': win_id}
    except:
        return {'status': 'ok', 'window': win}

def OnMidiIn(event):
    event.handled = False

def OnMidiMsg(event):
    event.handled = False
