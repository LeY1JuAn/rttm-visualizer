import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut, Upload, Eye, EyeOff, FileAudio, FileVideo, FileText, Download, Subtitles, Github } from 'lucide-react'

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
// RTTM as raw text; media as URLs (new options: query/import)
const defaultRttmFiles = import.meta.glob('/exp/rttm/*.rttm', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
const defaultMediaFiles = import.meta.glob('/exp/raw/*.{mp4,webm,mp3,wav,m4a}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

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
  const [videoAreaHeight, setVideoAreaHeight] = useState<number>(320)
  const resizeStateRef = useRef<{startY:number; startH:number} | null>(null)
  const isScrubbingRef = useRef(false)
  const defaultLoadedRef = useRef(false)

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

  const allSubtitles = useMemo(() => {
    return srt?.subtitles ?? []
  }, [srt])

  // search query for subtitles
  const [subtitleQuery, setSubtitleQuery] = useState('')
  const visibleSubtitles = useMemo(() => {
    const q = subtitleQuery.trim().toLowerCase()
    if (!q) return allSubtitles
    return allSubtitles.filter(s => s.text.toLowerCase().includes(q))
  }, [allSubtitles, subtitleQuery])

  // right panel auto collapse/expand logic based on data presence
  const hasRTTM = useMemo(()=> !!rttm && speakers.length>0, [rttm, speakers])
  const hasSRT = useMemo(()=> !!srt, [srt])
  useEffect(()=>{
    if(!hasRTTM && !hasSRT) setRightCollapsed(true)
    else setRightCollapsed(false)
  }, [hasRTTM, hasSRT])

  const aroundListRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = aroundListRef.current
    if (!el) return
    const currentEl = el.querySelector('.sub-item.current') as HTMLElement | null
    if (currentEl) currentEl.scrollIntoView({ block: 'center' })
  }, [currentSubtitle?.id])

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
  const zoomIn = ()=> setZoom(z => Math.min(5, +(z+0.25).toFixed(2)))

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
          <button className="btn" onClick={exportJSON}><Download className="file-icon" />Export</button>
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
            <div className="video-wrap" style={{height: videoAreaHeight}}>
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
            <input type="range" min={0.25} max={5} step={0.05} value={zoom} onChange={e=>setZoom(+e.target.value)} />
            <button className="btn icon" title="Zoom In" onClick={zoomIn}><ZoomIn size={16}/></button>
            <div style={{width:64, textAlign:'right'}} className="badge-sm">{zoom.toFixed(2)}x</div>
          </div>

          {/* Timeline area fills to bottom */}
          <div className="timeline-wrap" style={{flex: 1, minHeight: 0}}>
            <div className="timeline" ref={waveRef} onClick={onClickTimeline}
              onPointerDown={onTimelinePointerDown}
              onPointerMove={onTimelinePointerMove}
              onPointerUp={onTimelinePointerUp}
            >
              {/* RULER */}
              <div className="ruler" style={{width: timelineWidth}}>
                {Array.from({length: Math.ceil((duration||0)/1)+1}).map((_,i)=>{
                  const left = i * pxPerSec
                  const major = i % 5 === 0
                  return (
                    <div key={i}>
                      <div className="tick" style={{left, height: major? '100%':'40%', opacity: major?1:0.4}}></div>
                      {major && <div className="label" style={{left}}>{formatTime(i)}</div>}
                    </div>
                  )
                })}
              </div>

              {/* Tracks container fills remaining height */}
              <div className="tracks" style={{width: timelineWidth}}>
                <div className="playhead-long" style={{left: `${currentTime * pxPerSec}px`}}/>
                {/* SPEAKER TRACKS (vertically scrollable) */}
                {speakers.map(spk=>{
                  const hidden = !spk.visible
                  return (
                    <div key={spk.id} className="track" style={{width: timelineWidth, opacity: hidden?0.3:1}}>
                      {segments.filter(s=>s.speakerId===spk.id).map(seg=>{
                        const left = seg.start * pxPerSec
                        const w = (seg.end - seg.start) * pxPerSec
                        const isActive = currentTime >= seg.start && currentTime < seg.end
                        return (
                          <div key={seg.id} className={`seg${isActive? ' active':''}`} style={{left, width:w, background: spk.color}}
                            onMouseEnter={(e)=>{
                              setTooltip({x: e.clientX, y: e.clientY-30, text: `${spk.name}  ${formatTime(seg.start)}–${formatTime(seg.end)} (${formatTime(seg.end-seg.start)})`})
                            }}
                            onMouseLeave={()=>setTooltip(null)}
                            onClick={(e)=>{ e.stopPropagation(); seek(seg.start) }}
                          />
                        )
                      })}
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
          </div>
        </div>

        {/* Right panel: legend and subtitles (collapsible) */}
        <div className={"panel right section" + (rightCollapsed ? ' collapsed' : '')}>
          {!rightCollapsed && (
            <div style={{display:'grid', gridTemplateRows: (hasRTTM && hasSRT) ? '4fr 6fr' : '1fr', gap:16, height:'100%'}}>
              {hasRTTM && (
                <div className="card fade-in" style={{minHeight:0, overflow:'auto'}}>
                  <div style={{fontWeight:700, marginBottom:8}}>Speakers</div>
                  <div className="grid" >
                    {speakers.length===0 && <div className="badge-sm">No RTTM loaded</div>}
                    {speakers.map(spk=> (
                      <div key={spk.id} className={'legend-item ' + (spk.visible? '' : 'hidden')}>
                        <div className="color-dot" style={{background: spk.color}}/>
                        <div style={{flex:1}}>{spk.name}</div>
                        <button className="btn icon" onClick={()=> setSpeakers(speakers.map(s=> s.id===spk.id? {...s, visible: !s.visible}: s))}>
                          {spk.visible ? <Eye size={14}/> : <EyeOff size={14}/>}
                        </button>
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
    </div>
  )
}
