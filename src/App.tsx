import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut, Upload, Eye, EyeOff, FileAudio, FileVideo, FileText, Download, Subtitles, Github, Plus, Trash2 } from 'lucide-react'

type MediaType = 'audio' | 'video'

interface MediaFile {
  id: string
  name: string
  type: MediaType
  duration?: number
  url: string
  size?: number
}

interface RTTMFile {
  id: string
  name: string
  url: string
  matched: boolean
}

interface SRTFile {
  id: string
  name: string
  url: string
  subtitles: Subtitle[]
}

interface Subtitle {
  id: number
  start: number
  end: number
  text: string
}

interface Segment {
  id: string
  speakerId: string
  start: number
  end: number
}

interface Speaker {
  id: string
  name: string
  color: string
  visible: boolean
}

function formatTime(sec:number){
  const m = Math.floor(sec/60)
  const s = Math.floor(sec%60).toString().padStart(2,'0')
  return `${m}:${s}`
}

function formatHMSms(seconds: number){
  const sign = seconds < 0 ? '-' : ''
  const t = Math.abs(seconds)
  const hours = Math.floor(t/3600)
  const minutes = Math.floor((t%3600)/60)
  const secs = Math.floor(t%60)
  const ms = Math.round((t - Math.floor(t)) * 1000)
  return `${sign}${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}.${ms.toString().padStart(3,'0')}`
}

function parseSRT(text: string): Subtitle[] {
  const subtitles: Subtitle[] = []
  const blocks = text.trim().split(/\r?\n\r?\n/)
  
  for (const block of blocks) {
    const lines = block.split(/\r?\n/)
    if (lines.length < 3) continue
    
    const id = parseInt(lines[0])
    if (isNaN(id)) continue
    
    const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/)
    if (!timeMatch) continue
    
    const start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000
    const end = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000
    
    const text = lines.slice(2).join('\n').trim()
    
    subtitles.push({ id, start, end, text })
  }
  
  return subtitles.sort((a, b) => a.start - b.start)
}

function parseRTTM(text:string): {segments:Segment[], speakers:Speaker[]} {
  const segs: Segment[] = []
  const speakerIndex = new Map<string, Speaker>()
  const colorPalette = [
    '#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6','#06B6D4','#84CC16','#EC4899'
  ]
  let colorPtr = 0
  for(const raw of text.split(/\r?\n/)){
    const l = raw.trim()
    if(!l || l.startsWith(';')) continue
    const f = l.split(/\s+/)
    if(f[0] !== 'SPEAKER') continue
    const start = parseFloat(f[3])
    const dur = parseFloat(f[4])
    const spk = f[7] || 'spk'
    const end = start + dur
    const id = `${spk}_${start.toFixed(3)}_${end.toFixed(3)}`
    segs.push({id, speakerId: spk, start, end})
    if(!speakerIndex.has(spk)){
      const color = colorPalette[colorPtr % colorPalette.length]; colorPtr++
      speakerIndex.set(spk, { id: spk, name: spk, color, visible: true })
    }
  }
  const speakers = Array.from(speakerIndex.values())
  segs.sort((a,b)=>a.start-b.start)
  return {segments: segs, speakers}
}

const sampleVideo = "https://videos.pexels.com/video-files/30333849/13003128_2560_1440_25fps.mp4"

// Load local defaults from exp/ using Vite glob imports
// RTTM as raw text; media as URLs
const defaultRttmFiles = import.meta.glob('/exp/rttm/*.rttm', { eager: true, as: 'raw' }) as Record<string, string>
const defaultMediaFiles = import.meta.glob('/exp/raw/*.{mp4,webm,mp3,wav,m4a}', { eager: true, as: 'url' }) as Record<string, string>

export default function App(){
  const [title] = useState('RTTM Visualizer') // 1) Title updated
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [media, setMedia] = useState<MediaFile|null>({ id:'sample', name:'sample.mp4', type:'video', url: sampleVideo })
  const [rttm, setRTTM] = useState<RTTMFile|null>(null)
  const [srt, setSRT] = useState<SRTFile|null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const centerRef = useRef<HTMLDivElement>(null)
  const [videoAreaHeight, setVideoAreaHeight] = useState<number>(400)
  const resizeStateRef = useRef<{startY:number; startH:number} | null>(null)
  const isScrubbingRef = useRef(false)
  const defaultLoadedRef = useRef(false)
  const [selectedSegId, setSelectedSegId] = useState<string|null>(null)
  const dragRef = useRef<{ type: 'start'|'end'|'move'|'create'; speakerId: string; segId?: string; anchorTime?: number } | null>(null)
  const [dragTip, setDragTip] = useState<{x:number;y:number;text:string}|null>(null)
  const segmentsRef = useRef<Segment[]>([])
  useEffect(()=>{ segmentsRef.current = segments }, [segments])
  const [ctxMenu, setCtxMenu] = useState<{x:number; y:number; segId: string} | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{open: boolean; segId: string} | null>(null)
  const lastDeletedRef = useRef<Segment | null>(null)
  const [toast, setToast] = useState<{message: string; actionLabel?: string; onAction?: ()=>void} | null>(null)

  useEffect(()=>{
    const closeMenu = () => setCtxMenu(null)
    const onKey = (e: KeyboardEvent) => { if(e.key==='Escape'){ setCtxMenu(null); setConfirmDelete(null) } }
    window.addEventListener('click', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // drag-n-drop upload (global)
  const [dragOver, setDragOver] = useState(false)
  // per-section upload inputs
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const rttmInputRef = useRef<HTMLInputElement>(null)
  const srtInputRef = useRef<HTMLInputElement>(null)
  const onDrop = useCallback((e: React.DragEvent)=>{
    e.preventDefault(); setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  },[])
  function handleFiles(files: File[]){
    for(const f of files){
      if(f.name.toLowerCase().endsWith('.rttm')){
        const url = URL.createObjectURL(f)
        const reader = new FileReader()
        reader.onload = () => {
          const {segments, speakers} = parseRTTM(String(reader.result))
          setSegments(segments); setSpeakers(speakers)
          setRTTM({ id: crypto.randomUUID(), name:f.name, url, matched: true })
        }
        reader.readAsText(f)
      } else if(f.name.toLowerCase().endsWith('.srt')){
        const url = URL.createObjectURL(f)
        const reader = new FileReader()
        reader.onload = () => {
          const subtitles = parseSRT(String(reader.result))
          setSRT({ id: crypto.randomUUID(), name: f.name, url, subtitles })
        }
        reader.readAsText(f)
      } else if(/\.(mp4|webm|mp3|wav|m4a)$/i.test(f.name)){
        const url = URL.createObjectURL(f)
        const type: MediaType = /\.(mp4|webm)$/i.test(f.name) ? 'video' : 'audio'
        setMedia({ id: crypto.randomUUID(), name: f.name, type, url, size: f.size })
      }
    }
  }

  // Get current subtitle based on current time
  const currentSubtitle = useMemo(() => {
    if (!srt?.subtitles) return null
    return srt.subtitles.find(sub => currentTime >= sub.start && currentTime < sub.end) || null
  }, [srt, currentTime])

  // Get next subtitle for preview
  const nextSubtitle = useMemo(() => {
    if (!srt?.subtitles) return null
    return srt.subtitles.find(sub => sub.start > currentTime) || null
  }, [srt, currentTime])

  // Index of current subtitle and a window around it
  const currentSubtitleIndex = useMemo(() => {
    if (!srt?.subtitles) return -1
    const list = srt.subtitles
    for (let i = 0; i < list.length; i++) {
      const sub = list[i]
      if (currentTime >= sub.start && currentTime < sub.end) return i
      if (currentTime < sub.start) return i - 1
    }
    return list.length - 1
  }, [srt, currentTime])

  const aroundSubtitles = useMemo(() => {
    if (!srt?.subtitles) return [] as Array<{sub: Subtitle; isCurrent: boolean}>
    const startIdx = Math.max(0, currentSubtitleIndex - 3)
    const endIdx = Math.min(srt.subtitles.length, currentSubtitleIndex + 7)
    return srt.subtitles.slice(startIdx, endIdx).map((sub) => ({ sub, isCurrent: currentSubtitle?.id === sub.id }))
  }, [srt, currentSubtitleIndex, currentSubtitle])

  const aroundListRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = aroundListRef.current
    if (!el) return
    const currentEl = el.querySelector('.sub-item.current') as HTMLElement | null
    if (currentEl) currentEl.scrollIntoView({ block: 'center' })
  }, [currentSubtitle?.id])

  // Default tracks when no RTTM is loaded
  const defaultTracks = useMemo(() => {
    if (speakers.length > 0) return []
    const palette = ['#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6','#06B6D4','#84CC16','#EC4899','#14B8A6','#F472B6']
    return Array.from({length: 10}).map((_, i) => ({
      id: `default-${i+1}`,
      name: `Track ${i+1}`,
      color: palette[i % palette.length],
      visible: true,
    }))
  }, [speakers.length])

  // All tracks (RTTM speakers + default tracks)
  const allTracks = useMemo(() => {
    if (speakers.length > 0) return speakers
    return defaultTracks
  }, [speakers, defaultTracks])

  // search query for subtitles
  const [subtitleQuery, setSubtitleQuery] = useState('')
  const allSubtitles = useMemo(() => {
    return srt?.subtitles ?? []
  }, [srt])
  const visibleSubtitles = useMemo(() => {
    const q = subtitleQuery.trim().toLowerCase()
    if (!q) return allSubtitles
    return allSubtitles.filter(s => s.text.toLowerCase().includes(q))
  }, [allSubtitles, subtitleQuery])

  // right panel auto collapse/expand logic based on data presence
  const hasRTTM = useMemo(()=> (!!rttm) || speakers.length>0, [rttm, speakers.length])
  const hasSRT = useMemo(()=> !!srt, [srt])
  useEffect(()=>{
    if(!hasRTTM && !hasSRT) setRightCollapsed(true)
    else setRightCollapsed(false)
  }, [hasRTTM, hasSRT])

  // playback controls below video (requirement 2)
  const togglePlay = () => {
    const el = videoRef.current
    if(!el) return
    if(el.paused){ el.play(); setIsPlaying(true) } else { el.pause(); setIsPlaying(false) }
  }
  const seek = (t:number) => {
    const el = videoRef.current; if(!el) return
    el.currentTime = Math.max(0, Math.min(t, duration||el.duration||0))
  }
  const onTimeUpdate = () => {
    const el = videoRef.current; if(!el) return
    setCurrentTime(el.currentTime)
    if(el.duration && el.duration !== duration) setDuration(el.duration)
  }
  const onLoadedMetadata = () => {
    const el = videoRef.current; if(!el) return
    setDuration(el.duration || 0)
  }

  // Load default media and RTTM from exp/ folders on first mount
  useEffect(()=>{
    if(defaultLoadedRef.current) return
    defaultLoadedRef.current = true
    try {
      const mediaKeys = Object.keys(defaultMediaFiles).sort()
      if(mediaKeys.length > 0){
        const mp4First = mediaKeys.find(k=>/\.mp4$/i.test(k)) || mediaKeys[0]
        const url = defaultMediaFiles[mp4First]
        const name = mp4First.split('/').pop() || 'media'
        const type: MediaType = /\.(mp4|webm)$/i.test(name) ? 'video' : 'audio'
        setMedia({ id: 'default-media', name, type, url })
      }
      const rttmKeys = Object.keys(defaultRttmFiles).sort()
      if(rttmKeys.length > 0){
        const firstPath = rttmKeys[0]
        const content = defaultRttmFiles[firstPath]
        const name = firstPath.split('/').pop() || 'segments.rttm'
        const parsed = parseRTTM(content)
        setSegments(parsed.segments)
        setSpeakers(parsed.speakers)
        const blob = new Blob([content], {type:'text/plain'})
        const url = URL.createObjectURL(blob)
        setRTTM({ id: 'default-rttm', name, url, matched: true })
      }
    } catch (e) {
      // ignore
    }
  }, [])

  // smoother UI updates while playing
  useEffect(()=>{
    let rafId: number | null = null
    const tick = () => {
      const el = videoRef.current
      if(el){ setCurrentTime(el.currentTime) }
      rafId = requestAnimationFrame(tick)
    }
    if(isPlaying){ rafId = requestAnimationFrame(tick) }
    return ()=> { if(rafId!==null) cancelAnimationFrame(rafId) }
  }, [isPlaying])

  // prev/next segment buttons logic
  const visibleSegments = useMemo(()=>{
    const visibleSpk = new Set(speakers.filter(s=>s.visible).map(s=>s.id))
    return segments.filter(s=>visibleSpk.has(s.speakerId))
  }, [segments, speakers])
  const jumpPrev = () => {
    const before = visibleSegments.filter(s => s.start < currentTime - 0.05)
    if(before.length === 0) { seek(0); return }
    const target = before[before.length-1]
    seek(target.start)
  }
  const jumpNext = () => {
    const after = visibleSegments.filter(s => s.start > currentTime + 0.05)
    if(after.length === 0) { seek(duration); return }
    const target = after[0]
    seek(target.start)
  }

  // zoom buttons
  const zoomOut = ()=> setZoom(z => Math.max(0.25, +(z-0.25).toFixed(2)))
  const zoomIn = ()=> setZoom(z => Math.min(10, +(z+0.25).toFixed(2)))

  // keyboard
  useEffect(()=>{
    const onKey = (e: KeyboardEvent) => {
      if(e.code === 'Space'){ e.preventDefault(); togglePlay() }
      if(e.key === 'ArrowLeft') seek(currentTime - 1)
      if(e.key === 'ArrowRight') seek(currentTime + 1)
      if((e.ctrlKey||e.metaKey) && (e.key==='=' || e.key==='+')) zoomIn()
      if((e.ctrlKey||e.metaKey) && e.key==='-') zoomOut()
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [currentTime, duration])

  // timeline dims
  const pxPerSec = 80 * zoom
  const timelineWidth = Math.max(600, Math.ceil((duration||120) * pxPerSec))
  
  // Calculate optimal time division based on zoom level
  const timeDivision = useMemo(() => {
    if (zoom >= 8) return 1/60 // ~frame-level at 60fps
    if (zoom >= 6) return 1/30 // frame-level at 30fps
    if (zoom >= 4) return 0.1  // 100ms
    if (zoom >= 2) return 0.5  // 500ms
    if (zoom >= 1) return 1    // 1s
    if (zoom >= 0.5) return 2  // 2s
    return 5                   // 5s
  }, [zoom])

  const trackCount = speakers.length>0 ? speakers.length : 10
  const timelineMinHeight = 24 + trackCount * 28

  // click timeline seek
  const waveRef = useRef<HTMLDivElement>(null)
  const onClickTimeline = (e: React.MouseEvent) => {
    const el = waveRef.current; if(!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left + el.scrollLeft
    const t = x / pxPerSec
    seek(t)
  }

  // Pointer-based scrubbing (press-and-hold to move playhead)
  const scrubAtClient = (clientX: number) => {
    const el = waveRef.current; if(!el) return
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left + el.scrollLeft
    const t = x / pxPerSec
    seek(t)
  }
  const onTimelinePointerDown = (e: React.PointerEvent) => {
    isScrubbingRef.current = true
    try { (e.target as Element).setPointerCapture?.(e.pointerId) } catch {}
    scrubAtClient(e.clientX)
    e.preventDefault()
  }
  const onTimelinePointerMove = (e: React.PointerEvent) => {
    if(!isScrubbingRef.current) return
    scrubAtClient(e.clientX)
  }
  const onTimelinePointerUp = (e: React.PointerEvent) => {
    isScrubbingRef.current = false
    try { (e.target as Element).releasePointerCapture?.(e.pointerId) } catch {}
  }

  // Helpers for drag/creation logic
  const MIN_DUR = 0.01 // 10ms
  const toTimeFromClientX = (clientX: number) => {
    const el = waveRef.current; if(!el) return 0
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left + el.scrollLeft
    return Math.max(0, Math.min((duration||0), x / pxPerSec))
  }

  const getSpeakerNeighborBounds = (speakerId: string, segId?: string) => {
    const list = segments.filter(s=>s.speakerId===speakerId).sort((a,b)=>a.start-b.start)
    let prevEnd = 0
    let nextStart = duration || Number.POSITIVE_INFINITY
    for(let i=0;i<list.length;i++){
      const s = list[i]
      if(segId && s.id===segId){
        if(i>0) prevEnd = list[i-1].end
        if(i<list.length-1) nextStart = list[i+1].start
        break
      }
    }
    if(!segId && list.length>0){
      // For creation we just use full bounds (no overlap across existing segments)
      // We will clamp later against nearest neighbors based on the new time
    }
    return {prevEnd, nextStart}
  }

  const updateSegmentTime = (segId: string, nextStart: number, nextEnd: number) => {
    setSegments(prev => {
      const target = prev.find(s=>s.id===segId)
      if(!target) return prev
      const {prevEnd, nextStart: ns} = getSpeakerNeighborBounds(target.speakerId, segId)
      const clampedStart = Math.max(prevEnd, Math.min(nextStart, ns - MIN_DUR))
      const clampedEnd = Math.max(clampedStart + MIN_DUR, Math.min(nextEnd, ns))
      return prev.map(s=> s.id===segId? {...s, start: clampedStart, end: clampedEnd}: s)
    })
  }

  const createSegmentAt = (speakerId: string, atTime: number) => {
    const id = crypto.randomUUID()
    const baseStart = atTime
    const baseEnd = Math.min((duration||atTime+1), atTime + 0.2)
    const newSeg: Segment = { id, speakerId, start: baseStart, end: baseEnd }
    setSegments(prev => {
      // Prevent overlap on insert by shrinking into nearest gap
      const list = prev.filter(s=>s.speakerId===speakerId).sort((a,b)=>a.start-b.start)
      let leftBound = 0
      let rightBound = duration || Number.POSITIVE_INFINITY
      for(let i=0;i<list.length;i++){
        const s = list[i]
        if(s.end <= atTime){ leftBound = Math.max(leftBound, s.end) }
        if(s.start >= atTime && rightBound=== (duration||Number.POSITIVE_INFINITY)){ rightBound = s.start }
      }
      const start = Math.max(leftBound, Math.min(baseStart, rightBound - MIN_DUR))
      const end = Math.max(start + MIN_DUR, Math.min(baseEnd, rightBound))
      const adjusted = {...newSeg, start, end}
      return [...prev, adjusted].sort((a,b)=> a.start-b.start)
    })
    setSelectedSegId(id)
    return id
  }

  // Remove segment with optional undo
  const removeTimeSegment = (segId: string) => {
    const seg = segmentsRef.current.find(s=>s.id===segId) || null
    if(!seg) return
    lastDeletedRef.current = seg
    setSegments(prev => prev.filter(s=> s.id!==segId))
    setSelectedSegId(v => v===segId ? null : v)
    const undo = () => {
      const snap = lastDeletedRef.current
      if(!snap) return
      setSegments(prev => [...prev, snap].sort((a,b)=> a.start-b.start))
      lastDeletedRef.current = null
      setToast(null)
    }
    setToast({ message: '已删除一个时间段', actionLabel: '撤销', onAction: undo })
    window.setTimeout(()=>{ setToast(null) }, 5000)
  }

  // auto-scroll timeline to keep playhead in view (throttled, no repeated smooth to avoid jitter)
  const autoScrollStateRef = useRef<{ lastTs: number; lastLeft: number }>({ lastTs: 0, lastLeft: 0 })
  useEffect(()=>{
    const el = waveRef.current; if(!el) return
    const playheadX = currentTime * pxPerSec
    const viewLeft = el.scrollLeft
    const viewRight = viewLeft + el.clientWidth
    const margin = Math.max(60, el.clientWidth * 0.2)

    // Only scroll when the playhead is getting too close to the edges
    const isNearEdge = playheadX < viewLeft + margin || playheadX > viewRight - margin
    if(!isNearEdge) return

    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const { lastTs } = autoScrollStateRef.current
    if(now - lastTs < 80) return // throttle ~12.5 fps

    const targetLeft = Math.max(0, playheadX - el.clientWidth / 2)
    if(Math.abs(targetLeft - viewLeft) < 4) return // tiny changes ignored

    el.scrollLeft = targetLeft // immediate jump to avoid interrupting smooth scroll repeatedly
    autoScrollStateRef.current.lastTs = now
    autoScrollStateRef.current.lastLeft = targetLeft
  }, [currentTime, pxPerSec])

  // Vertical resize of video area
  const onResizeMouseDown = (e: React.MouseEvent) => {
    resizeStateRef.current = { startY: e.clientY, startH: videoAreaHeight }
    const onMove = (ev: MouseEvent) => {
      const start = resizeStateRef.current; if(!start) return
      const centerH = centerRef.current?.clientHeight || 600
      const minH = 140
      const maxH = Math.max(minH, centerH - 140)
      const next = Math.max(minH, Math.min(maxH, start.startH + (ev.clientY - start.startY)))
      setVideoAreaHeight(next)
    }
    const onUp = () => {
      resizeStateRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    e.preventDefault()
  }

  // tooltip on hover segment
  const [tooltip, setTooltip] = useState<{x:number;y:number;text:string}|null>(null)

  // export project (segments + speakers) JSON
  const exportJSON = () => {
    const data = { media, rttm, speakers, segments }
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'rttm-project.json'; a.click()
    URL.revokeObjectURL(url)
  }

  const exportRTTM = () => {
    const fileId = media?.name ? media.name.replace(/\.[^/.]+$/, '') : 'unknown'
    const lines = segments
      .slice()
      .sort((a,b)=> a.start-b.start)
      .map(seg => {
        const dur = Math.max(MIN_DUR, seg.end - seg.start)
        // SPEAKER <file_id> <chnl> <tbeg> <tdur> <ortho> <stype> <name> <conf>
        return `SPEAKER ${fileId} 1 ${seg.start.toFixed(3)} ${dur.toFixed(3)} <NA> <NA> ${seg.speakerId} <NA>`
      })
      .join('\n')
    const blob = new Blob([lines+'\n'], {type:'text/plain'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${fileId || 'segments'}.rttm`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
      {/* App Bar */}
      <div className="appbar">
        <div className="logo">
          <a
            className="badge github"
            href="https://github.com/DURUII/rttm-visualizer"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open GitHub repository"
            title="GitHub"
          >
            <Github size={18} />
          </a>
          <div className="title">{title}</div>
        </div>
        <div className="row">
          <button className="btn" onClick={exportRTTM}><Download className="file-icon" />导出RTTM</button>
          <button className="btn" onClick={exportJSON}><Download className="file-icon" />导出工程JSON</button>
          <button className="btn" onClick={()=> setLeftCollapsed(v=>!v)}>{leftCollapsed? 'Show Left' : 'Hide Left'}</button>
          <button className="btn" onClick={()=> setRightCollapsed(v=>!v)}>{rightCollapsed? 'Show Right' : 'Hide Right'}</button>
        </div>
      </div>

      <div className="layout">
        {/* Left panel: uploads and files */}
        <div className={"panel section" + (leftCollapsed ? ' collapsed' : '')}
          onDragOver={(e)=>{e.preventDefault(); setDragOver(true)}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={onDrop}
        >
          {!leftCollapsed && null}

          <div className="section">
            <div className="card">
              <div className="row" style={{justifyContent:'space-between', marginBottom:8}}>
                <div style={{fontWeight:700}}>Media</div>
                <button className="btn" onClick={()=> mediaInputRef.current?.click()}><Upload className="file-icon"/>Upload</button>
                <input ref={mediaInputRef} type="file" style={{display:'none'}} accept=".mp4,.webm,.mp3,.wav,.m4a"
                  onChange={e=> e.target.files && handleFiles(Array.from(e.target.files))} />
              </div>
              {media ? (
                <div className="file-list-item">
                  {media.type==='video' ? <FileVideo className="file-icon"/> : <FileAudio className="file-icon"/>}
                  <div style={{overflow:'hidden'}}>
                    <div style={{fontSize:14, whiteSpace:'nowrap', textOverflow:'ellipsis', overflow:'hidden'}}>{media.name}</div>
                    <div className="badge-sm">{duration? formatTime(duration): '--:--'}</div>
                  </div>
                </div>
              ) : <div className="badge-sm">No media selected</div>}
            </div>
          </div>

          <div className="section">
            <div className="card">
              <div className="row" style={{justifyContent:'space-between', marginBottom:8}}>
                <div style={{fontWeight:700}}>RTTM</div>
                <button className="btn" onClick={()=> rttmInputRef.current?.click()}><Upload className="file-icon"/>Upload</button>
                <input ref={rttmInputRef} type="file" style={{display:'none'}} accept=".rttm"
                  onChange={e=> e.target.files && handleFiles(Array.from(e.target.files))} />
              </div>
              {rttm ? (
                <div className="file-list-item">
                  <FileText className="file-icon"/>
                  <div style={{overflow:'hidden'}}>
                    <div style={{fontSize:14, whiteSpace:'nowrap', textOverflow:'ellipsis', overflow:'hidden'}}>{rttm.name}</div>
                    <div className="badge-sm">Segments: {segments.length}</div>
                  </div>
                </div>
              ) : <div className="badge-sm">Drop an .rttm file</div>}
            </div>
          </div>

          <div className="section">
            <div className="card">
              <div className="row" style={{justifyContent:'space-between', marginBottom:8}}>
                <div style={{fontWeight:700}}>SRT</div>
                <button className="btn" onClick={()=> srtInputRef.current?.click()}><Upload className="file-icon"/>Upload</button>
                <input ref={srtInputRef} type="file" style={{display:'none'}} accept=".srt"
                  onChange={e=> e.target.files && handleFiles(Array.from(e.target.files))} />
              </div>
              {srt ? (
                <div className="file-list-item">
                  <Subtitles className="file-icon"/>
                  <div style={{overflow:'hidden'}}>
                    <div style={{fontSize:14, whiteSpace:'nowrap', textOverflow:'ellipsis', overflow:'hidden'}}>{srt.name}</div>
                    <div className="badge-sm">Subtitles: {srt.subtitles.length}</div>
                  </div>
                </div>
              ) : <div className="badge-sm">Drop an .srt file</div>}
            </div>
          </div>
        </div>

        {/* Center content: video + controls + timeline (resizable video area, scrollable tracks) */}
        <div className="center" ref={centerRef}>
          {/* Video area */}
          <div className="section" style={{paddingBottom: 0}}>
            <div style={{height: videoAreaHeight}}>
              {media?.type === 'video' ? (
                <video ref={videoRef} src={media.url} onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata}
                  style={{width:'100%', height:'100%', objectFit:'contain'}} onClick={togglePlay} controls={false} />
              ) : (
                <audio ref={videoRef} src={media?.url} onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata} controls={false} />
              )}
            </div>
          </div>
          {/* Resizer between video and the rest */}
          <div className="resizer" onMouseDown={onResizeMouseDown} />
          {/* Controls bar (fixed height) */}
          <div className="controls-bar">
            <button className="btn icon" title="Previous segment" onClick={jumpPrev}><SkipBack size={16}/></button>
            <button className="btn icon" title="Play/Pause" onClick={togglePlay}>{isPlaying? <Pause size={16}/> : <Play size={16}/>}</button>
            <button className="btn icon" title="Next segment" onClick={jumpNext}><SkipForward size={16}/></button>
            <div className="space" />
            <button className="btn icon" title="Zoom Out" onClick={zoomOut}><ZoomOut size={16}/></button>
            <input type="range" min={0.25} max={10} step={0.05} value={zoom} onChange={e=>setZoom(+e.target.value)} />
            <button className="btn icon" title="Zoom In" onClick={zoomIn}><ZoomIn size={16}/></button>
            <div style={{width:64, textAlign:'right'}} className="badge-sm">{zoom.toFixed(2)}x</div>
          </div>

          {/* Timeline area with fixed default height to avoid large empty space */}
          <div className="timeline-wrap" style={{height: timelineMinHeight, flex: '0 0 auto', display:'flex', flexDirection:'column', justifyContent:'flex-end', padding: '0 12px'}}>
            <div className="timeline" style={{height: timelineMinHeight}} ref={waveRef} onClick={onClickTimeline}
              onPointerDown={onTimelinePointerDown}
              onPointerMove={onTimelinePointerMove}
              onPointerUp={onTimelinePointerUp}
            >
              {/* RULER */}
              <div className="ruler" style={{width: timelineWidth}}>
                {Array.from({length: Math.ceil((duration||0)/timeDivision)+1}).map((_,i)=>{
                  const left = i * timeDivision * pxPerSec
                  const major = i % 5 === 0
                  return (
                    <div key={`major-${i}`}>
                      <div className="tick" style={{left, height: '100%', opacity: 1}}></div>
                      {major && <div className="label" style={{left}}>{formatHMSms(i * timeDivision)}</div>}
                    </div>
                  )
                })}
                {(()=>{
                  const minorDiv = timeDivision/5
                  if (minorDiv <= 0) return null
                  const arr = Array.from({length: Math.ceil((duration||0)/minorDiv)+1})
                  return arr.map((_,i)=>{
                    const left = i * minorDiv * pxPerSec
                    const isMajorAligned = Math.abs((i*minorDiv) % timeDivision) < 1e-6
                    if (isMajorAligned) return null
                    return (
                      <div key={`minor-${i}`} className="tick" style={{left, height: '40%', opacity: 0.4}}></div>
                    )
                  })
                })()}
              </div>

              {/* Tracks container fills remaining height */}
              <div className="tracks" style={{width: timelineWidth}}>
                <div className="playhead-long" style={{left: `${currentTime * pxPerSec}px`}}/>
                {/* SPEAKER TRACKS (vertically scrollable) */}
                {allTracks.map(spk=>{
                  const hidden = speakers.length > 0 ? !spk.visible : false
                  return (
                    <div key={spk.id} className="track" style={{width: timelineWidth, opacity: hidden?0.3:1}}
                      onPointerDown={(e)=>{
                        // create new seg in empty area
                        if((e.target as HTMLElement).closest('.seg')) return
                        e.stopPropagation()
                        if(speakers.length===0) return
                        const t = toTimeFromClientX(e.clientX)
                        const newId = createSegmentAt(spk.id, t)
                        dragRef.current = { type: 'create', speakerId: spk.id, segId: newId, anchorTime: t }
                        setDragTip({x: e.clientX, y: e.clientY-28, text: `${spk.name}  ${formatHMSms(t)}`})
                        const onMove = (ev: PointerEvent) => {
                          const time = toTimeFromClientX(ev.clientX)
                          setDragTip({x: ev.clientX, y: ev.clientY-28, text: `${spk.name}  ${formatHMSms(Math.min(time, t))} – ${formatHMSms(Math.max(time, t))}`})
                          setSegments(prev => prev.map(s=> s.id===newId ? ({...s, start: Math.min(time, t), end: Math.max(time, t)}) : s))
                        }
                        const onUp = () => {
                          const state = dragRef.current; if(!state) return
                          const segId = state.segId!
                          const finalSeg = segmentsRef.current.find(s=>s.id===segId)
                          const cur = finalSeg || null
                          if(cur){ updateSegmentTime(segId, cur.start, cur.end) }
                          dragRef.current = null
                          setDragTip(null)
                          window.removeEventListener('pointermove', onMove)
                          window.removeEventListener('pointerup', onUp)
                        }
                        window.addEventListener('pointermove', onMove)
                        window.addEventListener('pointerup', onUp)
                      }}
                    >
                      {speakers.length > 0 ? 
                        segments.filter(s=>s.speakerId===spk.id).map(seg=>{
                          const left = seg.start * pxPerSec
                          const w = (seg.end - seg.start) * pxPerSec
                          const isActive = currentTime >= seg.start && currentTime < seg.end
                          return (
                            <div key={seg.id} className={`seg${isActive? ' active':''}${selectedSegId===seg.id?' selected':''}`}
                              style={{left, width:w, background: spk.color}}
                              onMouseEnter={(e)=>{
                                setTooltip({x: e.clientX, y: e.clientY-30, text: `${spk.name}  ${formatHMSms(seg.start)}–${formatHMSms(seg.end)} (${formatHMSms(seg.end-seg.start)})`})
                              }}
                              onMouseLeave={()=>setTooltip(null)}
                              onClick={(e)=>{ e.stopPropagation(); setSelectedSegId(seg.id); seek(seg.start) }}
                              onContextMenu={(e)=>{ e.preventDefault(); e.stopPropagation(); setSelectedSegId(seg.id); setCtxMenu({x: e.clientX, y: e.clientY, segId: seg.id}) }}
                            >
                              <div className="handle left" onPointerDown={(e)=>{
                                e.stopPropagation()
                                dragRef.current = { type: 'start', speakerId: spk.id, segId: seg.id }
                                try { (e.target as Element).setPointerCapture?.(e.pointerId) } catch {}
                                const onMove = (ev: PointerEvent) => {
                                  const t = toTimeFromClientX(ev.clientX)
                                  setDragTip({x: ev.clientX, y: ev.clientY-28, text: `${formatHMSms(t)} →`})
                                  updateSegmentTime(seg.id, Math.min(t, seg.end - MIN_DUR), seg.end)
                                }
                                const onUp = (ev: PointerEvent) => {
                                  try { (e.target as Element).releasePointerCapture?.((ev as any).pointerId) } catch {}
                                  dragRef.current = null; setDragTip(null)
                                  window.removeEventListener('pointermove', onMove)
                                  window.removeEventListener('pointerup', onUp)
                                }
                                window.addEventListener('pointermove', onMove)
                                window.addEventListener('pointerup', onUp)
                              }} />
                              <div className="handle right" onPointerDown={(e)=>{
                                e.stopPropagation()
                                dragRef.current = { type: 'end', speakerId: spk.id, segId: seg.id }
                                try { (e.target as Element).setPointerCapture?.(e.pointerId) } catch {}
                                const onMove = (ev: PointerEvent) => {
                                  const t = toTimeFromClientX(ev.clientX)
                                  setDragTip({x: ev.clientX, y: ev.clientY-28, text: `← ${formatHMSms(t)}`})
                                  updateSegmentTime(seg.id, seg.start, Math.max(t, seg.start + MIN_DUR))
                                }
                                const onUp = (ev: PointerEvent) => {
                                  try { (e.target as Element).releasePointerCapture?.((ev as any).pointerId) } catch {}
                                  dragRef.current = null; setDragTip(null)
                                  window.removeEventListener('pointermove', onMove)
                                  window.removeEventListener('pointerup', onUp)
                                }
                                window.addEventListener('pointermove', onMove)
                                window.addEventListener('pointerup', onUp)
                              }} />
                            </div>
                          )
                        }) : 
                        // Show empty track when no RTTM
                        <div style={{
                          position: 'absolute',
                          left: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: '#6B7280',
                          fontSize: '12px'
                        }}>
                          Empty track
                        </div>
                      }
                    </div>
                  )
                })}
              </div>
            </div>
            {tooltip && (
              <div style={{position:'fixed', left: tooltip.x, top: tooltip.y, background:'#111827', border:'1px solid #374151', padding:'6px 8px', borderRadius:6, fontSize:12, pointerEvents:'none'}}>
                {tooltip.text}
              </div>
            )}
            {dragTip && (
              <div style={{position:'fixed', left: dragTip.x, top: dragTip.y, background:'#0b1220', border:'1px solid #2a3040', padding:'6px 8px', borderRadius:6, fontSize:12, pointerEvents:'none'}}>
                {dragTip.text}
              </div>
            )}
            {ctxMenu && (
              <div className="context-menu" style={{left: ctxMenu.x, top: ctxMenu.y}} onClick={(e)=> e.stopPropagation()}>
                <button className="menu-item" onClick={()=>{ setConfirmDelete({open:true, segId: ctxMenu.segId}); setCtxMenu(null) }}>删除</button>
                <button className="menu-item" onClick={()=> setCtxMenu(null)}>取消</button>
              </div>
            )}
          </div>
        </div>

        {/* Right panel: legend and subtitles (collapsible) */}
        <div className={"panel right section" + (rightCollapsed ? ' collapsed' : '')}>
          {!rightCollapsed && (
            <div style={{display:'grid', gridTemplateRows: (hasRTTM && hasSRT) ? '4fr 6fr' : '1fr', gap:16, height:'100%'}}>
              {hasRTTM && (
                <div className="card fade-in" style={{minHeight:0, overflow:'auto'}}>
                  <div className="row" style={{justifyContent:'space-between', marginBottom:8}}>
                    <div style={{fontWeight:700}}>Speakers</div>
                    <button className="btn" onClick={()=>{
                      const idx = speakers.length+1
                      const palette = ['#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6','#06B6D4','#84CC16','#EC4899','#14B8A6','#F472B6']
                      const color = palette[(idx-1)%palette.length]
                      const id = `speaker${idx}`
                      setSpeakers(prev => [...prev, {id, name: id, color, visible: true}])
                    }}><Plus size={14}/>添加</button>
                  </div>
                  <div className="grid" >
                    {speakers.length===0 && <div className="badge-sm">No RTTM loaded</div>}
                    {speakers.map(spk=> (
                      <div key={spk.id} className={'legend-item ' + (spk.visible? '' : 'hidden')}>
                        <input type="color" value={spk.color} onChange={e=> setSpeakers(speakers.map(s=> s.id===spk.id? {...s, color: e.target.value}: s))} style={{width:24, height:24, border:'none', background:'transparent', padding:0}}/>
                        <input value={spk.name} onChange={e=> setSpeakers(speakers.map(s=> s.id===spk.id? {...s, name: e.target.value}: s))}
                          style={{flex:1, background:'#0f141b', border:'1px solid var(--border)', color:'var(--text)', borderRadius:6, padding:'6px 8px'}} />
                        <button className="btn icon" title={spk.visible? '隐藏' : '显示'} onClick={()=> setSpeakers(speakers.map(s=> s.id===spk.id? {...s, visible: !s.visible}: s))}>
                          {spk.visible ? <Eye size={14}/> : <EyeOff size={14}/>}
                        </button>
                        <button className="btn icon" title="删除" onClick={()=>{
                          setSpeakers(prev => prev.filter(s=> s.id!==spk.id))
                          setSegments(prev => prev.filter(seg=> seg.speakerId!==spk.id))
                        }}><Trash2 size={14}/></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Subtitles Preview */}
              {hasSRT && (
              <div className="card fade-in" style={{minHeight:0, display:'flex', flexDirection:'column'}}>
                <div className="row" style={{justifyContent:'space-between', marginBottom:8}}>
                  <div style={{fontWeight:700}}>Subtitles</div>
                  {srt && (
                    <input
                      value={subtitleQuery}
                      onChange={e=>setSubtitleQuery(e.target.value)}
                      placeholder="Search subtitles..."
                      style={{
                        flex:1,
                        marginLeft:8,
                        background:'#0f141b',
                        border:'1px solid var(--border)',
                        color:'var(--text)',
                        borderRadius:8,
                        padding:'6px 8px',
                        minWidth:0
                      }}
                    />
                  )}
                </div>
                {!srt ? (
                  <div className="badge-sm">No .srt loaded</div>
                ) : (
                  <div ref={aroundListRef} style={{flex:1, minHeight:0, overflow:'auto', display:'grid', gap:10}}>
                    {visibleSubtitles.map((sub) => {
                      const isCurrent = currentSubtitle?.id === sub.id
                      return (
                        <div key={sub.id} className={`sub-item${isCurrent ? ' current' : ''}`} style={{
                          background: isCurrent ? '#1F2937' : '#111827',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          opacity: isCurrent ? 1 : 0.85,
                          cursor: 'pointer'
                        }} onClick={()=>seek(sub.start)} title={`${formatTime(sub.start)} - ${formatTime(sub.end)}`}>
                          <div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 6}}>
                            {formatTime(sub.start)} - {formatTime(sub.end)}
                          </div>
                          <div style={{whiteSpace:'pre-wrap', fontSize: 14, lineHeight: 1.4}}>{sub.text}</div>
                        </div>
                      )
                    })}
                    {visibleSubtitles.length === 0 && (
                      <div style={{color: '#6B7280', fontSize: 14, textAlign: 'center', padding: '20px 0'}}>
                        No subtitles
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Delete confirmation modal */}
      {confirmDelete?.open && (
        <div className="modal-backdrop" onClick={()=> setConfirmDelete(null)}>
          <div className="modal" onClick={(e)=> e.stopPropagation()}>
            <div style={{fontWeight:700, marginBottom:8}}>确认删除</div>
            <div className="badge-sm" style={{marginBottom:12}}>删除后该时间段将被移除（可撤销）。</div>
            <div className="row" style={{justifyContent:'flex-end', gap:8}}>
              <button className="btn" onClick={()=> setConfirmDelete(null)}>取消</button>
              <button className="btn primary" onClick={()=>{ if(confirmDelete) removeTimeSegment(confirmDelete.segId); setConfirmDelete(null) }}>删除</button>
            </div>
          </div>
        </div>
      )}
      {/* Undo toast */}
      {toast && (
        <div className="toast">
          <span>{toast.message}</span>
          {toast.onAction && (
            <button className="link" onClick={toast.onAction}>{toast.actionLabel || '操作'}</button>
          )}
        </div>
      )}
    </div>
  )
}
