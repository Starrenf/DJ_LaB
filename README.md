# HET PODIUM // DJ LAB

## DJ LAB 0.3.0 PRO

Professional workflow prototype inspired by common interaction patterns in modern DJ software such as stacked waveforms, multi-mode performance pads, Prepare/History workflows and provider-aware music sources. The visual design is original to Ordinis Software and does not copy a vendor interface pixel-for-pixel.

### New in 0.3.0
- Stacked scrolling Deck A/B waveforms with beat-line overlays when BPM is known
- 8 performance pads per deck
- Pad modes: Hot Cue, Beat Loop, Beat Jump and Pad FX
- 8 Hot Cues (A-H) per deck
- Quantize toggle per deck
- Beat Jump -32/-16/-8/-4/+4/+8/+16/+32
- Beat Loop 1/2, 1, 2, 4, 8, 16, 32 and 64 beats
- Hold-style Pad FX including Echo, Reverb, LP/HP filter, EQ cuts and Wash
- Library tabs: Collection, Prepare and History
- Music-source architecture UI for Local, Spotify, Apple Music, Beatport, SoundCloud and TIDAL
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

## Current limitations
- Local audio must be selected again after a browser refresh.
- BPM analysis is approximate; beatgrid/phase sync is not yet implemented.
- PFL buttons currently mark monitoring intent; separate physical headphone-output routing is planned.
- Hot Cues and loaded samples are session-based.
- Recording format depends on browser MediaRecorder support.

---

**HET PODIUM // DJ LAB**  
Developed by **Ordinis Software**
