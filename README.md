# RTTM Visualizer

> If you find this project useful, please consider giving it a star. Thank you very much! ⭐

A lightweight, browser-based speaker diarization visualizer. Load media and RTTM to quickly inspect who speaks when.

![UI](docs/ui.gif)

## RTTM format

[RTTM (Rich Transcription Time Marked)](https://stackoverflow.com/a/74358577) is a time-stamped annotation format widely used in speaker diarization. Example line (start time, duration, speaker id):
```
SPEAKER file 1 12.34 3.21 <NA> <NA> spk1 <NA>
```

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

## Built w/ AI

This repo was partly built with AI tools, including [21st.dev](https://21st.dev/), [GPT-5](https://chat.openai.com/chat), and [Cursor](https://cursor.com/en/home). In the “code is cheap” era, I also share my AI-assisted development workflow on my Bilibili channel (CN): [安如衫](https://www.bilibili.com/video/BV1BXbPzeEoL/).

## Related

Here are some awesome speaker diarization repos to explore.

- [modelscope/3D-Speaker](https://github.com/modelscope/3D-Speaker) — a state-of-the-art, comprehensive toolkit for speaker verification, recognition, and diarization. 
