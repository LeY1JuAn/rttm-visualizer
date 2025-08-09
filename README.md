# RTTM Visualizer

A modern, browser-based **speaker diarization visualizer**. Upload an audio/video file and an **RTTM** file to see a timeline with a waveform and color-coded speaker segments, in an editor-like UI.

## Features
- Drag-and-drop upload for media and `.rttm`
- Video/Audio playback (spacebar to play/pause)
- Timeline with playhead, ruler, and **speaker segments**
- **Prev/Next segment** buttons
- **Zoom** controls placed **below the video and above the timeline**
- Click timeline or segments to seek
- Show/Hide speakers in a legend
- Export current project (media metadata + segments + speakers) as JSON

## Install & Run
```bash
# 1) Install deps
npm install

# 2) Start dev server
npm run dev

# 3) Build for production
npm run build
npm run preview
```

## Usage
1. Drag & drop a media file (`.mp4`, `.webm`, `.mp3`, `.wav`, `.m4a`) into the left panel, or click to browse.
2. Drag & drop an RTTM file. The app parses lines like
   ```
   SPEAKER file 1 12.34 3.21 <NA> <NA> spk1 <NA>
   ```
   generating segments for each speaker.
3. Use the controls below the video: **Prev/Play/Next**, **Zoom Out/Slider/Zoom In**.
4. Click on the timeline or a colored segment to seek. Use **Space** to play/pause.
5. Toggle speaker visibility from the right-side legend.
6. Use **Export** in the top bar to save a JSON snapshot.

## Notes
- Waveform is simulated in the MVP. For a real waveform, integrate `ffmpeg.wasm` to precompute peaks or consume server-side peak data.
- For very long media, consider virtualized rendering and peak downsampling.
- The app accepts video *or* audio; for audio-only, the player will use an `<audio>` element.

## License
MIT
