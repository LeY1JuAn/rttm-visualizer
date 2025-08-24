/**
 * DER (Diarization Error Rate) Computation Utilities
 * 
 * Based on the NIST RT evaluation methodology and adapted from:
 * - https://github.com/alibaba-damo-academy/3D-Speaker
 * - https://github.com/nryant/dscore
 * 
 * Computes Missed Speaker (MS), False Alarm (FA), Speaker Error Rate (SER),
 * and Diarization Error Rate (DER) metrics.
 */

export interface Segment {
  id: string
  speakerId: string
  start: number
  end: number
}

export type ErrorType = 'OK' | 'MS' | 'FA' | 'SER'

export interface ErrorInterval {
  start: number
  end: number
  type: ErrorType
  ref: Set<string>
  sys: Set<string>
}

export interface DERMetrics {
  MS: number      // Missed Speech percentage
  FA: number      // False Alarm percentage  
  SER: number     // Speaker Error Rate percentage
  DER: number     // Overall DER percentage (MS + FA + SER)
  scored: number  // Total scored speech time in seconds
}

export interface DERResult {
  intervals: ErrorInterval[]
  metrics: DERMetrics
}

/**
 * Compute DER metrics comparing reference and system RTTM segments
 * 
 * Algorithm:
 * 1. Create timeline boundaries from all segment start/end times
 * 2. For each time interval, determine which speakers are active in ref/sys
 * 3. Build greedy speaker mapping based on maximum overlap duration
 * 4. Classify each interval as OK, MS (missed speech), FA (false alarm), or SER (speaker error)
 * 5. Calculate percentages relative to total scored speech time
 * 
 * @param refSegments Reference (ground truth) segments
 * @param sysSegments System (hypothesis) segments  
 * @param collar Optional forgiveness collar in seconds (default: 0)
 * @returns DER computation result with intervals and metrics
 */
export function computeDER(
  refSegments: Segment[], 
  sysSegments: Segment[],
  collar: number = 0
): DERResult {
  // Sort segments by start time
  const ref = refSegments.slice().sort((a, b) => a.start - b.start)
  const sys = sysSegments.slice().sort((a, b) => a.start - b.start)
  
  // Apply collar adjustment if specified
  const adjustedRef = collar > 0 ? applyCollar(ref, collar) : ref
  const adjustedSys = collar > 0 ? applyCollar(sys, collar) : sys
  
  // Create timeline boundaries from all segment boundaries
  const boundaries = new Set<number>()
  for (const s of adjustedRef) { 
    boundaries.add(s.start)
    boundaries.add(s.end) 
  }
  for (const s of adjustedSys) { 
    boundaries.add(s.start)
    boundaries.add(s.end) 
  }
  
  const times = Array.from(boundaries)
    .filter(n => !Number.isNaN(n) && Number.isFinite(n))
    .sort((a, b) => a - b)
  
  // Initialize sweep line state
  let refPointer = 0, sysPointer = 0
  let refActive: Segment[] = []
  let sysActive: Segment[] = []
  const intervals: ErrorInterval[] = []
  
  // Track speaker overlaps for building optimal mapping
  const overlapTotals = new Map<string, Map<string, number>>() // ref -> (sys -> duration)
  
  function addOverlap(refSpk: string, sysSpk: string, duration: number) {
    if (!overlapTotals.has(refSpk)) {
      overlapTotals.set(refSpk, new Map())
    }
    const sysMap = overlapTotals.get(refSpk)!
    sysMap.set(sysSpk, (sysMap.get(sysSpk) || 0) + duration)
  }
  
  function getSpeakerSet(segments: Segment[]): Set<string> {
    const speakers = new Set<string>()
    for (const s of segments) {
      speakers.add(s.speakerId)
    }
    return speakers
  }
  
  let scoredSpeechTime = 0
  
  // Process each time interval using sweep line algorithm
  for (let i = 0; i < times.length - 1; i++) {
    const t0 = times[i]
    const t1 = times[i + 1]
    const duration = Math.max(0, t1 - t0)
    
    // Update active segments for current time
    while (refPointer < adjustedRef.length && adjustedRef[refPointer].start <= t0) {
      refActive.push(adjustedRef[refPointer])
      refPointer++
    }
    refActive = refActive.filter(s => s.end > t0)
    
    while (sysPointer < adjustedSys.length && adjustedSys[sysPointer].start <= t0) {
      sysActive.push(adjustedSys[sysPointer])
      sysPointer++
    }
    sysActive = sysActive.filter(s => s.end > t0)
    
    const refSpeakers = getSpeakerSet(refActive)
    const sysSpeakers = getSpeakerSet(sysActive)
    
    // Accumulate scored speech time (any time with reference speech)
    if (refSpeakers.size > 0) {
      scoredSpeechTime += duration
    }
    
    // Track speaker overlaps for mapping computation
    if (refSpeakers.size > 0 && sysSpeakers.size > 0) {
      for (const refSpk of refSpeakers) {
        for (const sysSpk of sysSpeakers) {
          addOverlap(refSpk, sysSpk, duration)
        }
      }
    }
    
    intervals.push({ 
      start: t0, 
      end: t1, 
      type: 'OK', 
      ref: refSpeakers, 
      sys: sysSpeakers 
    })
  }
  
  // Build greedy speaker mapping to maximize total overlap
  const mappingPairs: Array<{ref: string; sys: string; duration: number}> = []
  for (const [refSpk, sysMap] of overlapTotals) {
    for (const [sysSpk, duration] of sysMap) {
      mappingPairs.push({ ref: refSpk, sys: sysSpk, duration })
    }
  }
  
  // Sort by duration descending for greedy assignment
  mappingPairs.sort((a, b) => b.duration - a.duration)
  
  const usedRefSpeakers = new Set<string>()
  const usedSysSpeakers = new Set<string>()
  const sysToRefMapping = new Map<string, string>()
  
  for (const pair of mappingPairs) {
    if (pair.duration <= 0) continue
    if (usedRefSpeakers.has(pair.ref) || usedSysSpeakers.has(pair.sys)) continue
    
    usedRefSpeakers.add(pair.ref)
    usedSysSpeakers.add(pair.sys)
    sysToRefMapping.set(pair.sys, pair.ref)
  }
  
  // Classify each interval and accumulate error times
  let missedSpeechTime = 0
  let falseAlarmTime = 0  
  let speakerErrorTime = 0
  
  for (const interval of intervals) {
    const duration = Math.max(0, interval.end - interval.start)
    
    if (interval.ref.size > 0 && interval.sys.size === 0) {
      // Missed Speech: reference has speech, system has none
      interval.type = 'MS'
      missedSpeechTime += duration
    } else if (interval.ref.size === 0 && interval.sys.size > 0) {
      // False Alarm: system has speech, reference has none
      interval.type = 'FA'
      falseAlarmTime += duration
    } else if (interval.ref.size > 0 && interval.sys.size > 0) {
      // Both have speech - check if mapping is correct
      let hasCorrectMapping = false
      for (const sysSpk of interval.sys) {
        const mappedRefSpk = sysToRefMapping.get(sysSpk)
        if (mappedRefSpk && interval.ref.has(mappedRefSpk)) {
          hasCorrectMapping = true
          break
        }
      }
      
      if (!hasCorrectMapping) {
        // Speaker Error: speech present but wrong speaker assignment  
        interval.type = 'SER'
        speakerErrorTime += duration
      } else {
        // Correct assignment
        interval.type = 'OK'
      }
    }
    // else: no speech in either, remains 'OK'
  }
  
  // Calculate percentages relative to scored speech time
  const MS_percent = scoredSpeechTime > 0 ? (missedSpeechTime / scoredSpeechTime) * 100 : 0
  const FA_percent = scoredSpeechTime > 0 ? (falseAlarmTime / scoredSpeechTime) * 100 : 0  
  const SER_percent = scoredSpeechTime > 0 ? (speakerErrorTime / scoredSpeechTime) * 100 : 0
  const DER_percent = MS_percent + FA_percent + SER_percent
  
  return {
    intervals,
    metrics: {
      MS: MS_percent,
      FA: FA_percent, 
      SER: SER_percent,
      DER: DER_percent,
      scored: scoredSpeechTime
    }
  }
}

/**
 * Apply forgiveness collar to segments
 * Collar extends segment boundaries to provide forgiveness for small timing errors
 */
function applyCollar(segments: Segment[], collar: number): Segment[] {
  return segments.map(seg => ({
    ...seg,
    start: Math.max(0, seg.start - collar),
    end: seg.end + collar
  }))
}

/**
 * Utility function to convert segments to RTTM format string
 */
export function segmentsToRTTM(segments: Segment[], fileId: string = 'unknown'): string {
  return segments
    .slice()
    .sort((a, b) => a.start - b.start)
    .map(seg => {
      const duration = Math.max(0.01, seg.end - seg.start)
      // RTTM format: SPEAKER <file> <chnl> <tbeg> <tdur> <ortho> <stype> <name> <conf>
      return `SPEAKER ${fileId} 1 ${seg.start.toFixed(3)} ${duration.toFixed(3)} <NA> <NA> ${seg.speakerId} <NA>`
    })
    .join('\n') + '\n'
}

/**
 * Parse RTTM format text into segments
 */
export function parseRTTMToSegments(rttmText: string): Segment[] {
  const segments: Segment[] = []
  
  for (const line of rttmText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith(';')) continue
    
    const fields = trimmed.split(/\s+/)
    if (fields[0] !== 'SPEAKER') continue
    
    const start = parseFloat(fields[3])
    const duration = parseFloat(fields[4])
    const speakerId = fields[7] || 'unknown'
    const end = start + duration
    
    if (!isNaN(start) && !isNaN(duration) && duration > 0) {
      segments.push({
        id: `${speakerId}_${start.toFixed(3)}_${end.toFixed(3)}`,
        speakerId,
        start,
        end
      })
    }
  }
  
  return segments.sort((a, b) => a.start - b.start)
}
