# HET PODIUM // DJ LAB

## DJ LAB 0.3.0 PRO

Professional workflow prototype inspired by common interaction patterns in modern DJ software such as stacked waveforms, multi-mode performance pads, Prepare/History workflows and provider-aware music sources. The visual design is original to Ordinis Software and does not copy a vendor interface pixel-for-pixel.

### New in 0.3.0
- Stacked scrolling Deck A/B waveforms on a shared eight-second output-time scale, with beat lines after manual grid alignment
- 8 performance pads per deck
- Pad modes: Hot Cue, Beat Loop, Beat Jump and Pad FX
- 8 Hot Cues (A-H) per deck
- Quantize toggle per deck (off by default; requires BPM and a manually aligned first beat)
- Beat Jump -32/-16/-8/-4/+4/+8/+16/+32
- Beat Loop 1/2, 1, 2, 4, 8, 16, 32 and 64 beats
- Hold-style Pad FX including Echo, Reverb, LP/HP filter, EQ cuts and Wash
- Library tabs: Collection, Prepare and History
- Music-source demonstration buttons for Local, Spotify, Apple Music, Beatport, SoundCloud and TIDAL; no provider adapters yet
- Spotify direct mixing remains disabled until official provider/partner access is available


Browser-based DJ console developed by **Ordinis Software** for the HET PODIUM concept.

## DJ LAB 0.2.0

### Mixing
- 2 independent local audio decks
- Crossfader for Deck A/B
- Per-deck gain, 3-band EQ and channel volume
- Filter, echo/delay and reverb
- Pitch control and approximate BPM sync
- 4/8/16 beat loops
- Waveform and jog/seek

### Cue & performance
- DJ-style CUE hold/release behaviour
- CUE + PLAY takeover
- 4 Hot Cues per deck (A/B/C/D)
- Shift-click a Hot Cue to clear it
- 4 sampler banks: JINGLES, VOCALS, FX and DRUMS
- 8 pads per bank
- Keyboard 1–8 triggers the active sampler bank

### 4-channel performance mixer
- Deck A
- Deck B
- Sampler
- Microphone
- Gain, EQ and channel faders
- Master output
- PFL/CUE markers prepared for later separate headphone routing

### Microphone & radio workflow
- Browser microphone input
- Mic gain, 3-band EQ and channel fader
- Compressor
- Mute
- Automatic Talkover/ducking based on real microphone level
- Adjustable Talkover depth and sensitivity

### Recording
- RECORD SET records the complete master:
  - Deck A
  - Deck B
  - Sampler
  - Microphone
- Download the recorded mix from the browser when recording stops

### Library
- Local MP3/WAV/M4A/AAC/OGG import (depending on browser support)
- Session playlists
- Approximate BPM analysis
- Drag tracks to decks or sampler pads

## Streaming services
Spotify is intended only for future playlist/reference/discovery integration, not as direct mix audio. Future research can focus on DJ-compatible streaming providers.

## Run locally

```bash
npm install
npm start
```

Open:

```
http://localhost:4173
```

## Build

```bash
npm run build
```

The static production files are copied to `public/` for Vercel.

## Validation

```bash
npm run check
npm test
npm run build
```

The dependency-free Node tests cover pitch-independent loop lengths, wrapped playback position, loop release without quantized jumps, grid offsets, combined Pad FX, pointer/keyboard cleanup, CUE takeover, track-load races and session Hot Cues. GitHub Actions runs these checks and the Chromium integration test on pull requests and branch pushes.

For browser integration checks, install Playwright locally without changing the application dependencies:

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:browser
```

The browser test starts its own local server and generates WAV fixtures. It checks real Web Audio output from both decks, loops/pitch, CUE pointer capture/takeover, pads, a synthetic microphone, talkover/mute, sampler, a decoded non-silent recording and Prepare/History. Test inspection hooks are injected only into the test browser response. Optional `CHROMIUM_PATH` selects an existing browser; `SCREENSHOT_PATH` saves a screenshot.

## Beatgrid and performance behavior

1. Load local audio and analyze or enter its BPM. BPM analysis is approximate.
2. Seek to a known first beat, then click **SET BEAT**, or enter its timestamp in **EERSTE BEAT (s)**.
3. Enable **Q** only after checking the beat lines against the audio. Beat lines do not indicate automatic phase sync.

Loops retain their original boundaries when pitch changes or playback is paused. Switching a loop off preserves the audible position. A seek/Beat Jump outside the loop exits the loop; a loop that would run beyond the track end is rejected. Hold FX compose with the slider settings; releasing one preserves other held pads. Opposing filter pads use a deterministic priority (Wash, then HP, then LP). Pad mode changes, window blur and hidden tabs release held FX.

History records started playback, rather than loading or CUE preview alone. Prepare, History, beat offsets and Hot Cues are held for the current session. Selecting a new track does not replace the playing track until decoding succeeds; the latest load request wins.

## Current limitations
- Local audio must be selected again after a browser refresh.
- BPM analysis is approximate. Beatgrid alignment is manual; automatic grid detection and phase sync are not implemented. Constant-BPM grids do not cover tempo-changing tracks.
- PFL buttons are disabled and marked planned; separate physical headphone-output routing is not implemented.
- Hot Cues and loaded samples are session-based.
- Recording format depends on browser MediaRecorder support.
- Streaming buttons are demonstrations only; all mix audio is local.
- Browser integration tests use generated audio and a synthetic microphone. Physical headphones/microphones, real music, long live sets and Safari still require manual validation before release.

---

**HET PODIUM // DJ LAB**  
Developed by **Ordinis Software**
