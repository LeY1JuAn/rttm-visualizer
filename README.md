# RTTM Visualizer

A lightweight, browser-based speaker diarization visualizer. Load media and RTTM to quickly inspect who speaks when.

![UI](docs/ui.gif)

If you find this project useful, please consider giving it a star. Thank you! ⭐

## Features
- Drag-and-drop media and `.rttm`, or auto-load the first media from `exp/raw/` and the first RTTM from `exp/rttm/`
- Timeline with ruler, color-coded speaker tracks, and a long playhead
- Controls: Prev/Play/Next, Zoom Out/Slider/Zoom In; click timeline or segments to seek; press-and-hold to scrub
- Collapsible left/right panels; resizable video area

## Run
```bash
npm install
npm run dev
```

## RTTM format

> RTTM (Rich Transcription Time Marked) is a time-stamped annotation format widely used in speaker diarization.

Example line (start time, duration, speaker id):
```
SPEAKER file 1 12.34 3.21 <NA> <NA> spk1 <NA>
```
Hover tooltip in the UI shows “start–end (duration)” for clarity.

## Related
- [modelscope/3D-Speaker](https://github.com/modelscope/3D-Speaker) — a state-of-the-art, comprehensive toolkit for speaker verification, recognition, and diarization. 