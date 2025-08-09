import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut, Upload, Eye, EyeOff, FileAudio, FileVideo, FileText, Download } from 'lucide-react'

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

export default function App(){
  const [title] = useState('RTTM Visualizer') // 1) Title updated
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [media, setMedia] = useState<MediaFile|null>({ id:'sample', name:'sample.mp4', type:'video', url: sampleVideo })
  const [rttm, setRTTM] = useState<RTTMFile|null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [leftCollapsed, setLeftCollapsed] = useState(false)

  // drag-n-drop upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
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
      } else if(/\.(mp4|webm|mp3|wav|m4a)$/i.test(f.name)){
        const url = URL.createObjectURL(f)
        const type: MediaType = /\.(mp4|webm)$/i.test(f.name) ? 'video' : 'audio'
        setMedia({ id: crypto.randomUUID(), name: f.name, type, url, size: f.size })
      }
    }
  }

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

  // auto-scroll timeline to keep playhead in view
  useEffect(()=>{
    const el = waveRef.current; if(!el) return
    const playheadX = currentTime * pxPerSec
    const viewLeft = el.scrollLeft
    const viewRight = viewLeft + el.clientWidth
    const margin = Math.max(60, el.clientWidth * 0.25)
    if(playheadX < viewLeft + margin || playheadX > viewRight - margin){
      const targetLeft = Math.max(0, playheadX - el.clientWidth / 2)
      el.scrollTo({ left: targetLeft, behavior: 'smooth' })
    }
  }, [currentTime, pxPerSec])

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
          <div className="badge">RV</div>
          <div className="title">{title}</div>
        </div>
        <div className="row">
          <button className="btn" onClick={exportJSON}><Download className="file-icon" />Export</button>
          <button className="btn" onClick={()=> setLeftCollapsed(v=>!v)}>{leftCollapsed? 'Show Left' : 'Hide Left'}</button>
        </div>
      </div>

      <div className="layout">
        {/* Left panel: uploads and files */}
        <div className={"panel section" + (leftCollapsed ? ' collapsed' : '')}
          onDragOver={(e)=>{e.preventDefault(); setDragOver(true)}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={onDrop}
        >
          {!leftCollapsed && (
            <div className={ 'uploader' + (dragOver? ' drag':'' ) } onClick={()=>fileInputRef.current?.click()}>
              <Upload className="file-icon" />
              <div>Drag & Drop media (.mp4/.webm/.mp3/.wav) and .rttm here<br/>or click to browse</div>
              <input ref={fileInputRef} type="file" multiple style={{display:'none'}}
                accept=".mp4,.webm,.mp3,.wav,.m4a,.rttm"
                onChange={e=> e.target.files && handleFiles(Array.from(e.target.files))}
              />
            </div>
          )}

          <div className="section">
            <div className="card">
              <div style={{fontWeight:700, marginBottom:8}}>Media</div>
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
              <div style={{fontWeight:700, marginBottom:8}}>RTTM</div>
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
        </div>

        {/* Center content: video + controls + timeline */}
        <div className="center">
          <div className="section">
            <div className="video-wrap">
              {media?.type === 'video' ? (
                <video ref={videoRef} src={media.url} onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata}
                  style={{width:'100%', height:'auto'}} onClick={togglePlay} controls={false} />
              ) : (
                <audio ref={videoRef} src={media?.url} onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata} controls={false} />
              )}
              {/* Controls moved here (2) */}
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
            </div>
          </div>

          <div className="timeline-wrap">
            <div className="timeline" ref={waveRef} onClick={onClickTimeline}>
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

              {/* Waveform temporarily removed */}
              <div className="playhead-long" style={{left: `${currentTime * pxPerSec}px`}}/>

              {/* SPEAKER TRACKS */}
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
                            setTooltip({x: e.clientX, y: e.clientY-30, text: `${spk.name}  ${formatTime(seg.start)}–${formatTime(seg.end-seg.start)}`})
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
            {tooltip && (
              <div style={{position:'fixed', left: tooltip.x, top: tooltip.y, background:'#111827', border:'1px solid #374151', padding:'6px 8px', borderRadius:6, fontSize:12, pointerEvents:'none'}}>
                {tooltip.text}
              </div>
            )}
          </div>
        </div>

        {/* Right panel: legend */}
        <div className="panel right section">
          <div className="card">
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
        </div>
      </div>
    </div>
  )
}
