# RTTM Visualizer

> If you find this project useful, please consider giving it a star. Thank you very much! ⭐

A lightweight, browser-based speaker diarization visualizer and editor. Load media and RTTM to quickly inspect and edit who speaks when.

![UI](docs/ui.gif)

## RTTM format
[RTTM (Rich Transcription Time Marked)](https://stackoverflow.com/a/74358577) is a time-stamped annotation format widely used in speaker diarization. Example line (start time, duration, speaker id):
```
SPEAKER file 1 12.34 3.21 <NA> <NA> spk1 <NA>
```

## Features
- Manual adjustment, create segments, and right-click to delete
- Drag-and-drop media and `.rttm`, or auto-load the first media from `exp/raw/` and the first RTTM from `exp/rttm/`
- Timeline with ruler, color-coded speaker tracks, and a long playhead
- Controls: Prev/Play/Next, Zoom Out/Slider/Zoom In; click timeline or segments to seek; press-and-hold to scrub
- Collapsible left/right panels; resizable video area

## Shortcuts
- Space: Play/Pause
- ← / →: Seek -1s / +1s
- Ctrl/Cmd + +/-: Zoom In/Out

## Run
```bash
npm install
npm run dev
```

## Acknowledgements
Based upon and inspired by: [DURUII/rttm-visualizer](https://github.com/DURUII/rttm-visualizer). This fork adds interactive editing features (creation, resize, right-click delete with confirmation and undo), speaker management, millisecond-level time formatting, and RTTM export, while keeping the lightweight and browser-based experience.
