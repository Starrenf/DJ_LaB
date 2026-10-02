# HET PODIUM // DJ LAB

Alpha MVP of a browser-based DJ console for HET PODIUM.

## Current features
- 2 local audio decks (MP3/WAV/M4A/AAC/OGG supported by the browser)
- Local drag/drop library
- Session playlists + persistent playlist names
- Waveform + click-to-seek
- Play/pause, cue point, pitch ±10%
- Approximate BPM analysis and BPM sync
- 4/8/16 beat loops
- 3-band EQ, gain, channel volume
- DJ filter, echo/delay, generated reverb
- Constant-power or linear crossfader
- Jogwheel seek
- Three UI themes

## Run locally
Any static web server works. For example:

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173.

## Important alpha limitations
- Audio files stay local and are not uploaded.
- Browsers do not allow arbitrary local files to be reopened after refresh without permission, so audio must be reselected after refresh.
- BPM detection is approximate. True beatgrid/phase sync is planned for a later iteration.
- 4-deck mode, recording, microphone routing, MIDI controllers and live streaming are not yet enabled.

## Alpha 0.1.3
- CUE herbouwd: cuepunt zetten na seek/jog, terug naar cue tijdens afspelen, en hold-to-preview vanaf cue.
- CUE-marker zichtbaar in de waveform.
- 8-pad samplerbank toegevoegd voor jingles, drops, stingers en one-shots.
- Samples lokaal laden of vanuit de track-library naar een pad slepen.
- Keyboard 1–8 triggert de samplerpads; STOP ALL stopt alle samples.
- Sampler heeft eigen volume en loopt buiten de crossfader rechtstreeks naar master.
