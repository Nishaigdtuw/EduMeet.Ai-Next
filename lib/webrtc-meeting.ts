export interface MeetingParticipant {
  id: string
  name: string
  role: 'teacher' | 'student'
  isHost?: boolean
  micOn: boolean
  cameraOn: boolean
  stream?: MediaStream
  avatarUrl?: string
}

export interface MeetingChatMessage {
  id: string
  senderId: string
  senderName: string
  senderRole: 'teacher' | 'student'
  text: string
  timestamp: string
}

export interface LiveMeetingSession {
  sessionId: string
  meetingId: string
  classId: string
  className: string
  topic: string
  teacherName: string
  status: 'PreJoin' | 'Live' | 'Ended'
  startedAt: string
  endedAt?: string
  confusionSignalsCount: number
  lastSpikeTopic?: string
  participants: MeetingParticipant[]
  chatMessages: MeetingChatMessage[]
  lectureTranscript?: string
  publishedNotes?: string
}

const LIVE_MEETINGS_KEY = "aulyn_live_meetings"
const MEETING_ID_MAP_KEY = "aulyn_meeting_id_map"

/**
 * Generate a unique human-friendly Meeting ID (e.g. AULYN-7KQ9-X2M4)
 */
export function generateMeetingId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let part1 = ''
  let part2 = ''
  for (let i = 0; i < 4; i++) part1 += chars.charAt(Math.floor(Math.random() * chars.length))
  for (let i = 0; i < 4; i++) part2 += chars.charAt(Math.floor(Math.random() * chars.length))
  return `AULYN-${part1}-${part2}`
}

export async function requestMediaStream(audio: boolean, video: boolean): Promise<{ stream: MediaStream | null; error: string | null }> {
  if (typeof window === "undefined" || !navigator?.mediaDevices) {
    return { stream: null, error: "Media devices API not supported in this browser." }
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audio ? { echoCancellation: true, noiseSuppression: true } : false,
      video: video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
    })
    return { stream, error: null }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Camera/Microphone permission denied."
    return { stream: null, error: errorMsg }
  }
}

export function getStoredMeeting(sessionId: string): LiveMeetingSession {
  if (typeof window !== "undefined") {
    const str = localStorage.getItem(`${LIVE_MEETINGS_KEY}_${sessionId}`)
    if (str) {
      try {
        return JSON.parse(str)
      } catch {
        // Fallback
      }
    }

    // Check if mapping exists by meetingId
    const mapStr = localStorage.getItem(MEETING_ID_MAP_KEY)
    if (mapStr) {
      try {
        const map: Record<string, string> = JSON.parse(mapStr)
        const mappedSessionId = map[sessionId.toUpperCase()]
        if (mappedSessionId) {
          const mappedStr = localStorage.getItem(`${LIVE_MEETINGS_KEY}_${mappedSessionId}`)
          if (mappedStr) return JSON.parse(mappedStr)
        }
      } catch {
        // ignore
      }
    }
  }

  // Extract or generate meetingId from sessionId (e.g., sess-AULYN-CS-6V9Q-1787425295588 -> AULYN-CS-6V9Q)
  let extractedMeetingId = generateMeetingId()
  if (sessionId && sessionId.includes('AULYN')) {
    const parts = sessionId.split('-')
    const aulynIdx = parts.findIndex(p => p.toUpperCase() === 'AULYN')
    if (aulynIdx !== -1 && parts.length >= aulynIdx + 3) {
      extractedMeetingId = `${parts[aulynIdx]}-${parts[aulynIdx + 1]}-${parts[aulynIdx + 2]}`.toUpperCase()
    }
  }

  const fallbackSession: LiveMeetingSession = {
    sessionId: sessionId || `sess-${Date.now()}`,
    meetingId: extractedMeetingId,
    classId: "dsa-2026",
    className: "Data Structures & Algorithms",
    topic: "Live Lecture & WebRTC Interactive Session",
    teacherName: "Prof. Sarah Jenkins",
    status: "Live",
    startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    confusionSignalsCount: 0,
    participants: [
      { id: "teacher-demo", name: "Prof. Sarah Jenkins", role: "teacher", isHost: true, micOn: true, cameraOn: true }
    ],
    chatMessages: [
      { id: `m-init-${Date.now()}`, senderId: "teacher-demo", senderName: "Prof. Sarah Jenkins", senderRole: "teacher", text: "Welcome to the live session!", timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    ],
    lectureTranscript: '',
    publishedNotes: ''
  }

  return fallbackSession
}

export function getSessionByMeetingId(meetingId: string): LiveMeetingSession {
  if (typeof window !== "undefined" && meetingId) {
    const cleanId = meetingId.trim().toUpperCase()
    const mapStr = localStorage.getItem(MEETING_ID_MAP_KEY)
    if (mapStr) {
      try {
        const map: Record<string, string> = JSON.parse(mapStr)
        const targetSessionId = map[cleanId]
        if (targetSessionId) {
          return getStoredMeeting(targetSessionId)
        }
      } catch {
        // ignore
      }
    }
  }

  const cleanId = meetingId ? meetingId.trim().toUpperCase() : generateMeetingId()
  const fallbackSessionId = `sess-${cleanId.toLowerCase()}-${Date.now()}`

  return {
    sessionId: fallbackSessionId,
    meetingId: cleanId,
    classId: "dsa-2026",
    className: "Data Structures & Algorithms",
    topic: "Live Lecture & WebRTC Interactive Session",
    teacherName: "Prof. Sarah Jenkins",
    status: "Live",
    startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    confusionSignalsCount: 0,
    participants: [
      { id: "teacher-demo", name: "Prof. Sarah Jenkins", role: "teacher", isHost: true, micOn: true, cameraOn: true }
    ],
    chatMessages: [
      { id: `m-init-${Date.now()}`, senderId: "teacher-demo", senderName: "Prof. Sarah Jenkins", senderRole: "teacher", text: "Welcome to the live session!", timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    ],
    lectureTranscript: '',
    publishedNotes: ''
  }
}

export function saveStoredMeeting(session: LiveMeetingSession) {
  if (typeof window === "undefined") return
  localStorage.setItem(`${LIVE_MEETINGS_KEY}_${session.sessionId}`, JSON.stringify(session))

  if (session.meetingId) {
    try {
      const mapStr = localStorage.getItem(MEETING_ID_MAP_KEY)
      const map: Record<string, string> = mapStr ? JSON.parse(mapStr) : {}
      map[session.meetingId.toUpperCase()] = session.sessionId
      localStorage.setItem(MEETING_ID_MAP_KEY, JSON.stringify(map))
    } catch {
      // ignore
    }
  }

  window.dispatchEvent(new Event("aulyn-meeting-update"))
}
