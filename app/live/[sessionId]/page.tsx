'use client'

import React, { useState, useEffect, useRef } from "react"
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Users, MessageSquare, BookOpen,
  AlertCircle, Send, CheckCircle2, ArrowLeft, X, Sparkles, Smile, Play, Pause,
  RefreshCw, Volume2, ShieldAlert, UserX, Copy, Check
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { useRouter, useParams } from "next/navigation"
import { getAuthenticatedUser } from "@/lib/auth-guard"
import {
  WebRTCSFUClient,
  SFUParticipant,
  EphemeralReaction,
  ConnectionState
} from "@/lib/webrtc-sfu"
import { LiveMeetingSession, getStoredMeeting } from "@/lib/webrtc-meeting"
import { FinalLectureSummary, saveLectureSummary } from "@/lib/data-store"
import { TeacherLectureSummaryModal } from "@/components/teacher-lecture-summary-modal"

// Structure for truthful speech-grounded live notes
interface GroundedLiveNote {
  currentTopic?: string
  keyPoints?: string[]
  importantDefinition?: string
  example?: string
  codeOrFormula?: string
  lastUpdated?: string
}

export default function LiveMeetingRoomPage() {
  const router = useRouter()
  const params = useParams()
  const sessionId = (params?.sessionId as string) || "sess-dsa-1"

  const [self, setSelf] = useState<{ userId: string; name: string; role: 'student' | 'teacher' }>({
    userId: 'student-demo',
    name: 'Alex Rivera',
    role: 'student'
  })

  const [session, setSession] = useState<LiveMeetingSession>(() => getStoredMeeting(sessionId))
  const [sfuClient, setSfuClient] = useState<WebRTCSFUClient | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('Connecting')
  const [copiedMeetingId, setCopiedMeetingId] = useState(false)

  // Pre-join & Media Stream State
  const [joined, setJoined] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const preJoinVideoRef = useRef<HTMLVideoElement | null>(null)

  // Real-time SFU Participants & Active Speaker State
  const [participants, setParticipants] = useState<SFUParticipant[]>([])
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null)

  // In-Meeting Panels State ('none' | 'chat' | 'participants' | 'notes')
  const [activePanel, setActivePanel] = useState<'none' | 'chat' | 'participants' | 'notes'>('notes')
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; senderId: string; senderName: string; senderRole: 'teacher' | 'student'; text: string; timestamp: string }>>([])
  const [chatInput, setChatInput] = useState("")

  // Live Speech Recognition & Grounded Notes Engine State
  const [transcript, setTranscript] = useState<string>("")
  const [isNotesPaused, setIsNotesPaused] = useState(false)
  const [notesStatus, setNotesStatus] = useState<'EMPTY' | 'PROCESSING' | 'READY' | 'ERROR'>('EMPTY')
  const [groundedNotes, setGroundedNotes] = useState<GroundedLiveNote | null>(null)
  const speechRecognitionRef = useRef<unknown | null>(null)

  // Ephemeral Reactions State
  const [activeReactions, setActiveReactions] = useState<EphemeralReaction[]>([])
  const [showReactionsMenu, setShowReactionsMenu] = useState(false)

  // End Class Dialog & Teacher Lecture Summary Review Modal State
  const [showEndClassConfirm, setShowEndClassConfirm] = useState(false)
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false)
  const [generatedSummary, setGeneratedSummary] = useState<FinalLectureSummary | null>(null)
  const [summaryErrorNotice, setSummaryErrorNotice] = useState<string | null>(null)

  // Initialize Session Identity & Authorization
  useEffect(() => {
    const user = getAuthenticatedUser()
    let currentSelf = { userId: 'student-demo', name: 'Alex Rivera', role: 'student' as 'student' | 'teacher' }

    if (user) {
      currentSelf = { userId: user.userId, name: user.name, role: user.role as 'student' | 'teacher' }
      setSelf(currentSelf)
    }

    // Reset notes state for new session ID boundary
    setTranscript("")
    setGroundedNotes(null)
    setNotesStatus('EMPTY')

    fetch(`/api/live/session?sessionId=${sessionId}&userId=${currentSelf.userId}&role=${currentSelf.role}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.session) {
          setSession(data.session)
          if (data.session.chatMessages) {
            setChatMessages(data.session.chatMessages)
          }
          if (data.session.lectureTranscript) {
            setTranscript(data.session.lectureTranscript)
          }
        } else {
          toast.error(data.error || "Failed to load live session.")
          const s = getStoredMeeting(sessionId)
          setSession(s)
        }
      })
      .catch(() => {
        const s = getStoredMeeting(sessionId)
        setSession(s)
      })
  }, [sessionId])

  // Real-Time Web Speech Recognition Engine for Live Lecture Transcript
  useEffect(() => {
    if (!joined || isNotesPaused || typeof window === 'undefined') return

    // Initialize Web Speech API if supported
    const SpeechRecognitionClass = (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ||
                                   (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).webkitSpeechRecognition

    if (SpeechRecognitionClass) {
      try {
        const recognition = new (SpeechRecognitionClass as new () => {
          continuous: boolean
          interimResults: boolean
          lang: string
          onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void
          onerror: () => void
          onend: () => void
          start: () => void
          stop: () => void
        })()

        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'

        recognition.onresult = (event) => {
          let currentSpoken = ''
          for (let i = 0; i < event.results.length; i++) {
            currentSpoken += event.results[i][0].transcript + ' '
          }
          if (currentSpoken.trim()) {
            setTranscript(currentSpoken.trim())
          }
        }

        recognition.onerror = () => {
          // Keep video session intact even if speech recognition fails
        }

        recognition.onend = () => {
          // Restart recognition continuous loop if not paused
          if (!isNotesPaused && joined) {
            try { recognition.start() } catch {}
          }
        }

        recognition.start()
        speechRecognitionRef.current = recognition
      } catch {
        // Fallback gracefully
      }
    }

    return () => {
      if (speechRecognitionRef.current) {
        try {
          (speechRecognitionRef.current as { stop: () => void }).stop()
        } catch {}
      }
    }
  }, [joined, isNotesPaused])

  // Summarize Spoken Transcript when Word Count Threshold (>= 15 words) is Met
  const processTranscriptToNotes = (spokenText: string) => {
    const words = spokenText.trim().split(/\s+/).filter(Boolean)

    // Threshold Check: Minimum 15 spoken words required before generating first note
    if (words.length < 15) {
      setNotesStatus('EMPTY')
      setGroundedNotes(null)
      return
    }

    setNotesStatus('PROCESSING')

    setTimeout(() => {
      const lower = spokenText.toLowerCase()

      // Grounded extraction based strictly on spoken transcript content
      const extracted: GroundedLiveNote = {
        lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }

      // Infer current topic from spoken sentences
      const sentences = spokenText.split(/[.!?]+/).map(s => s.trim()).filter(Boolean)
      if (sentences.length > 0) {
        extracted.currentTopic = sentences[0].substring(0, 80)
      }

      // Extract key points strictly from spoken sentences
      if (sentences.length > 1) {
        extracted.keyPoints = sentences.slice(1, 4)
      } else {
        extracted.keyPoints = [spokenText.substring(0, 100)]
      }

      // Extract definition only if explicit keyword ("is", "means", "defined") was spoken
      if (lower.includes("is defined as") || lower.includes("means") || lower.includes("referred to as")) {
        const defSentence = sentences.find(s =>
          s.toLowerCase().includes("defined") || s.toLowerCase().includes("means")
        )
        if (defSentence) {
          extracted.importantDefinition = defSentence
        }
      }

      // Extract example only if spoken keyword ("for example", "e.g.", "such as", "for instance") exists
      if (lower.includes("example") || lower.includes("instance") || lower.includes("such as")) {
        const egSentence = sentences.find(s =>
          s.toLowerCase().includes("example") || s.toLowerCase().includes("instance") || s.toLowerCase().includes("such as")
        )
        if (egSentence) {
          extracted.example = egSentence
        }
      }

      setGroundedNotes(extracted)
      setNotesStatus('READY')
    }, 600)
  }

  // Periodic Live Note Update (Every 45 seconds if transcript threshold is met)
  useEffect(() => {
    if (!joined || isNotesPaused || !transcript) return

    processTranscriptToNotes(transcript)

    const interval = setInterval(() => {
      if (transcript) {
        processTranscriptToNotes(transcript)
      }
    }, 45000)

    return () => clearInterval(interval)
  }, [transcript, joined, isNotesPaused])

  // Request Local Media Stream for Pre-Join
  const initLocalMedia = async () => {
    setMediaError(null)
    if (typeof window === "undefined" || !navigator?.mediaDevices) {
      setMediaError("Media devices API is not supported in this browser.")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micOn ? { echoCancellation: true, noiseSuppression: true } : false,
        video: cameraOn ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
      })
      setLocalStream(stream)
    } catch (err: unknown) {
      let msg = "Microphone and camera access failed."
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          msg = "Camera and Microphone permissions were denied."
        } else if (err.name === 'NotFoundError') {
          msg = "No compatible camera or microphone device was found."
        } else if (err.name === 'NotReadableError') {
          msg = "Camera or Microphone is currently occupied by another application."
        }
      }
      setMediaError(msg)
    }
  }

  useEffect(() => {
    initLocalMedia()
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop())
      }
    }
  }, [micOn, cameraOn])

  useEffect(() => {
    if (preJoinVideoRef.current && localStream) {
      preJoinVideoRef.current.srcObject = localStream
    }
  }, [localStream, joined])

  // Join Live Class & Instantiate WebRTC SFU Client
  const handleJoinMeeting = async () => {
    const client = new WebRTCSFUClient({
      sessionId,
      userId: self.userId,
      userName: self.name,
      userRole: self.role
    })

    client.onStateChange = (st) => setConnectionState(st)

    client.onParticipantsChange = (updatedList) => {
      setParticipants(updatedList)
      const speaker = updatedList.find(p => p.isSpeaking)
      if (speaker) {
        setActiveSpeakerId(speaker.id)
      }
    }

    client.onReactionReceived = (rx) => {
      setActiveReactions((prev) => [...prev, rx])
      setTimeout(() => {
        setActiveReactions((prev) => prev.filter(r => r.id !== rx.id))
      }, 2500)
    }

    client.onChatMessageReceived = (msg) => {
      setChatMessages((prev) => [...prev, msg])
    }

    client.onError = (errText) => {
      toast.error(errText)
      if (errText.includes('ended') || errText.includes('removed')) {
        handleLeaveMeeting()
      }
    }

    await client.requestMedia(micOn, cameraOn)
    await client.connect()

    setSfuClient(client)
    setJoined(true)
    toast.success("Connected to Live Class via WebRTC SFU Media Router!")
  }

  const handleToggleMic = () => {
    const nextState = !micOn
    setMicOn(nextState)
    if (sfuClient) {
      sfuClient.toggleMic(nextState)
    } else if (localStream) {
      localStream.getAudioTracks().forEach(t => (t.enabled = nextState))
    }
  }

  const handleToggleCamera = () => {
    const nextState = !cameraOn
    setCameraOn(nextState)
    if (sfuClient) {
      sfuClient.toggleCamera(nextState)
    } else if (localStream) {
      localStream.getVideoTracks().forEach(t => (t.enabled = nextState))
    }
  }

  const handleSendChatMessage = () => {
    if (!chatInput.trim()) return
    if (sfuClient) {
      sfuClient.sendChatMessage(chatInput.trim())
    } else {
      const msg = {
        id: `m-${Date.now()}`,
        senderId: self.userId,
        senderName: self.name,
        senderRole: self.role,
        text: chatInput.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
      setChatMessages(prev => [...prev, msg])
    }
    setChatInput("")
  }

  const handleSendReaction = (emoji: string) => {
    if (sfuClient) {
      sfuClient.sendReaction(emoji)
    } else {
      const rx: EphemeralReaction = {
        id: `rx-${Date.now()}`,
        emoji,
        senderId: self.userId,
        senderName: self.name,
        timestamp: Date.now()
      }
      setActiveReactions(prev => [...prev, rx])
      setTimeout(() => setActiveReactions(prev => prev.filter(r => r.id !== rx.id)), 2500)
    }
    setShowReactionsMenu(false)
  }

  const handleCopyMeetingId = () => {
    if (!session?.meetingId) return
    navigator.clipboard.writeText(session.meetingId)
    setCopiedMeetingId(true)
    toast.success("Meeting ID copied to clipboard!")
    setTimeout(() => setCopiedMeetingId(false), 2000)
  }

  const handleLeaveMeeting = () => {
    if (sfuClient) {
      sfuClient.disconnect()
    }
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop())
    }
    toast.info("Disconnected from live classroom.")
    router.push(self.role === 'teacher' ? '/teacher' : '/student')
  }

  // Teacher Manual Refresh Notes Engine
  const handleManualRefreshNotes = () => {
    if (!transcript || transcript.trim().split(/\s+/).filter(Boolean).length < 15) {
      setNotesStatus('EMPTY')
      setGroundedNotes(null)
      toast.info("Notes remain empty: Not enough lecture speech has been recorded yet.")
      return
    }

    processTranscriptToNotes(transcript)
    toast.success("Refreshed live notes from current lecture transcript!")
  }

  // Teacher End Class Execution
  const handleConfirmEndClass = async () => {
    setShowEndClassConfirm(false)
    const spokenWords = transcript.trim().split(/\s+/).filter(Boolean)

    if (spokenWords.length < 15) {
      setSummaryErrorNotice("No lecture summary was generated because there was not enough lecture content spoken during this session.")
      setGeneratedSummary(null)
    } else {
      try {
        const res = await fetch('/api/live/end-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, teacherId: self.userId })
        })
        const data = await res.json()
        if (data.success && data.summary) {
          setGeneratedSummary(data.summary)
          saveLectureSummary(data.summary)
        }
      } catch {
        // ignore
      }
    }

    if (sfuClient) {
      sfuClient.endClassForEveryone()
    }

    toast.success("Class has been ended.")
    setIsSummaryModalOpen(true)
  }

  if (!session) return null

  // -----------------------------------------------------------
  // 1. PRE-JOIN SCREEN UI
  // -----------------------------------------------------------
  if (!joined) {
    return (
      <div className="min-h-screen bg-[#292724] text-white flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-xl bg-[#1E1C1A] border-[#3E3A35] text-white rounded-3xl p-6 shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-[#3E3A35] pb-4">
            <div>
              <span className="text-[10px] font-bold text-[#E76F51] bg-[#E76F51]/20 px-2.5 py-0.5 rounded-full border border-[#E76F51]/30 uppercase tracking-wider">
                WebRTC SFU Classroom Pre-Join
              </span>
              <h2 className="text-xl font-serif font-black text-white mt-1">{session.className}</h2>
              <p className="text-xs text-[#A19A91] font-semibold">{session.topic} • Instructor: {session.teacherName}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-[#A19A91] hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-1" /> Exit
            </Button>
          </div>

          {/* Meeting ID Banner */}
          {session.meetingId && (
            <div className="p-3 bg-[#242220] border border-[#3E3A35] rounded-2xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2">
                <span className="text-[#A19A91] font-bold uppercase text-[10px]">Meeting ID:</span>
                <span className="font-mono font-bold text-[#E9B949] tracking-wider text-sm bg-[#1E1C1A] px-2.5 py-1 rounded-lg border border-[#3E3A35]">
                  {session.meetingId}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyMeetingId}
                className="h-7 text-xs font-bold border-[#3E3A35] text-white hover:bg-[#3E3A35] rounded-lg flex items-center gap-1 cursor-pointer"
              >
                {copiedMeetingId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#E76F51]" />}
                {copiedMeetingId ? "Copied!" : "Copy ID"}
              </Button>
            </div>
          )}

          {/* Camera Preview Tile */}
          <div className="relative aspect-video bg-[#292724] rounded-2xl overflow-hidden border border-[#3E3A35] flex items-center justify-center">
            {cameraOn && !mediaError ? (
              <video ref={preJoinVideoRef} autoPlay playsInline muted className="w-full h-full object-cover transform -scale-x-100" />
            ) : (
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-[#E76F51] text-white font-serif font-black text-2xl rounded-full flex items-center justify-center mx-auto shadow-md">
                  {self.name.charAt(0)}
                </div>
                <p className="text-xs text-[#A19A91] font-semibold">{cameraOn ? "Initializing Camera..." : "Camera Turned Off"}</p>
              </div>
            )}

            {/* Media Permission Error Banner */}
            {mediaError && (
              <div className="absolute bottom-16 left-3 right-3 bg-amber-950/90 text-amber-200 text-[11px] p-2.5 rounded-xl border border-amber-500/50 flex items-center justify-between gap-2 shadow-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>{mediaError}</span>
                </div>
                <Button size="sm" variant="outline" onClick={initLocalMedia} className="h-6 text-[10px] border-amber-500 text-amber-300 hover:bg-amber-900 rounded-lg shrink-0">
                  <RefreshCw className="w-3 h-3 mr-1" /> Retry
                </Button>
              </div>
            )}

            {/* Media Toggles overlay */}
            <div className="absolute bottom-4 flex items-center justify-center space-x-3 left-0 right-0">
              <button
                onClick={handleToggleMic}
                className={`p-3 rounded-full shadow-md transition-all cursor-pointer ${
                  micOn ? "bg-[#3E3A35] text-white hover:bg-[#4E4943]" : "bg-red-600 text-white"
                }`}
              >
                {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
              <button
                onClick={handleToggleCamera}
                className={`p-3 rounded-full shadow-md transition-all cursor-pointer ${
                  cameraOn ? "bg-[#3E3A35] text-white hover:bg-[#4E4943]" : "bg-red-600 text-white"
                }`}
              >
                {cameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
            <div>
              <p className="text-xs text-[#A19A91]">Joining as:</p>
              <p className="text-sm font-bold text-white">{self.name} ({self.role === 'teacher' ? 'Educator Host' : 'Student'})</p>
            </div>

            <Button
              onClick={handleJoinMeeting}
              className="bg-[#E76F51] hover:bg-[#d55e42] text-white font-bold py-3 px-8 text-sm rounded-xl shadow-lg cursor-pointer"
            >
              Join Virtual Class Meeting
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // -----------------------------------------------------------
  // 2. IN-MEETING ROOM STAGE & CONTROLS UI
  // -----------------------------------------------------------
  const totalCount = Math.max(participants.length, 1)
  const gridColsClass = totalCount === 1 ? 'grid-cols-1' : totalCount <= 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'

  return (
    <div className="min-h-screen bg-[#181716] text-white flex flex-col justify-between overflow-hidden relative">
      {/* Top Meeting Header */}
      <header className="px-4 py-3 bg-[#1E1C1A] border-b border-[#3E3A35] flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <span className="w-3 h-3 bg-red-500 rounded-full animate-ping" />
          <div>
            <h1 className="text-sm sm:text-base font-serif font-black text-white flex items-center gap-2">
              {session.className}
              {session.meetingId && (
                <span className="font-mono text-xs font-bold text-[#E9B949] bg-[#242220] px-2 py-0.5 rounded border border-[#3E3A35]">
                  ID: {session.meetingId}
                </span>
              )}
            </h1>
            <p className="text-[10px] text-[#A19A91] font-semibold">{session.topic} • Started {session.startedAt}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Connection State Badge */}
          <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
            connectionState === 'Connected' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
            connectionState === 'Connecting' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
            'bg-red-500/20 text-red-300 border-red-500/40'
          }`}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>SFU: {connectionState}</span>
          </div>

          <Button
            variant="destructive"
            size="sm"
            onClick={handleLeaveMeeting}
            className="text-xs font-bold rounded-xl cursor-pointer"
          >
            <PhoneOff className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Leave</span>
          </Button>
        </div>
      </header>

      {/* Main Video Stage & Side Panel */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3 relative">
        {/* Floating Ephemeral Reactions Layer */}
        <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
          {activeReactions.map((r, idx) => (
            <div
              key={r.id}
              className="absolute bottom-20 flex items-center space-x-2 bg-[#1E1C1A]/95 text-white px-3 py-1.5 rounded-full border border-[#E9B949]/50 shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-300"
              style={{
                left: `${(idx * 25 + 20) % 70}%`,
                animationDuration: '2.5s'
              }}
            >
              <span className="text-2xl animate-bounce">{r.emoji}</span>
              <span className="text-xs font-bold text-[#E9B949]">{r.senderName}</span>
            </div>
          ))}
        </div>

        {/* Responsive Video Stage Grid */}
        <div className={`flex-1 grid ${gridColsClass} gap-3 overflow-y-auto pr-1`}>
          {participants.map((p) => {
            const isSelfTile = p.id === self.userId
            const isSpeaking = p.isSpeaking || activeSpeakerId === p.id

            return (
              <div
                key={p.id}
                className={`relative bg-[#242220] rounded-2xl overflow-hidden flex items-center justify-center group shadow-md min-h-[220px] transition-all duration-200 border-2 ${
                  isSpeaking ? 'border-[#E76F51] ring-2 ring-[#E76F51]/50 shadow-lg shadow-[#E76F51]/20' : 'border-[#3E3A35]'
                }`}
              >
                {/* Media Stream Video Render */}
                {p.cameraOn ? (
                  <video
                    ref={(el) => {
                      if (el && p.stream) {
                        el.srcObject = p.stream
                      }
                    }}
                    autoPlay
                    playsInline
                    muted={isSelfTile}
                    className={`w-full h-full object-cover ${isSelfTile ? 'transform -scale-x-100' : ''}`}
                  />
                ) : (
                  <div className="text-center space-y-2">
                    <div className={`w-16 h-16 text-white font-serif font-black text-2xl rounded-full flex items-center justify-center mx-auto shadow-md ${
                      p.role === 'teacher' ? 'bg-[#8B7EC8]' : 'bg-[#E76F51]'
                    }`}>
                      {p.name.charAt(0)}
                    </div>
                    <p className="text-xs text-[#A19A91] font-semibold">{p.name} {isSelfTile ? '(You)' : ''}</p>
                  </div>
                )}

                {/* Active Speaker Badge */}
                {isSpeaking && (
                  <div className="absolute top-3 left-3 bg-[#E76F51] text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-md animate-pulse">
                    <Volume2 className="w-3 h-3" /> Speaking
                  </div>
                )}

                {/* Teacher Moderation Controls on Remote Tile */}
                {self.role === 'teacher' && !isSelfTile && (
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-[#1E1C1A]/90 p-1 rounded-xl flex items-center gap-1 border border-[#3E3A35]">
                    <button
                      onClick={() => sfuClient?.moderateParticipant(p.id, 'MUTE')}
                      className="p-1 text-amber-400 hover:bg-amber-950 rounded-lg text-[10px] font-bold cursor-pointer"
                      title="Mute Participant"
                    >
                      <MicOff className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => sfuClient?.moderateParticipant(p.id, 'REMOVE')}
                      className="p-1 text-red-400 hover:bg-red-950 rounded-lg text-[10px] font-bold cursor-pointer"
                      title="Remove Participant"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Tile Label */}
                <div className="absolute bottom-3 left-3 bg-[#1E1C1A]/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-2 border border-[#3E3A35]">
                  <span>{p.name} {isSelfTile ? '(You)' : `(${p.role === 'teacher' ? 'Host' : 'Student'})`}</span>
                  {p.micOn ? <Mic className="w-3.5 h-3.5 text-emerald-400" /> : <MicOff className="w-3.5 h-3.5 text-red-400" />}
                </div>
              </div>
            )
          })}
        </div>

        {/* Side Panels (Chat, Participants, Notes So Far) */}
        {activePanel !== 'none' && (
          <div className="w-80 sm:w-96 bg-[#1E1C1A] border border-[#3E3A35] rounded-2xl flex flex-col overflow-hidden shadow-2xl shrink-0">
            <div className="p-3 border-b border-[#3E3A35] flex items-center justify-between">
              <h3 className="text-xs font-serif font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                {activePanel === 'chat' && 'In-Meeting Live Chat'}
                {activePanel === 'participants' && `Class Roster (${participants.length})`}
                {activePanel === 'notes' && (
                  <>
                    <BookOpen className="w-4 h-4 text-[#8B7EC8]" /> Notes So Far
                  </>
                )}
              </h3>
              <Button variant="ghost" size="icon" onClick={() => setActivePanel('none')} className="text-[#A19A91] hover:text-white h-7 w-7">
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* CHAT PANEL */}
            {activePanel === 'chat' && (
              <div className="flex-1 flex flex-col justify-between p-3 overflow-hidden">
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                  {chatMessages.map((m) => (
                    <div key={m.id} className="p-2.5 bg-[#242220] border border-[#3E3A35] rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span className={m.senderRole === 'teacher' ? 'text-[#8B7EC8]' : 'text-[#E76F51]'}>
                          {m.senderName} ({m.senderRole === 'teacher' ? 'Instructor' : 'Student'})
                        </span>
                        <span className="text-[10px] text-[#A19A91]">{m.timestamp}</span>
                      </div>
                      <p className="text-white font-medium">{m.text}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-2 border-t border-[#3E3A35]">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendChatMessage()}
                    placeholder="Send a temporary message..."
                    className="bg-[#242220] border-[#3E3A35] text-xs font-medium text-white rounded-xl"
                  />
                  <Button onClick={handleSendChatMessage} className="bg-[#E76F51] hover:bg-[#d55e42] text-white font-bold text-xs rounded-xl cursor-pointer">
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* PARTICIPANTS PANEL */}
            {activePanel === 'participants' && (
              <div className="p-3 space-y-2 overflow-y-auto flex-1">
                {participants.map((p) => (
                  <div key={p.id} className="p-2.5 bg-[#242220] border border-[#3E3A35] rounded-xl flex items-center justify-between text-xs font-bold">
                    <div className="flex items-center space-x-2">
                      <span className="text-white">{p.name}</span>
                      <span className="text-[10px] text-[#A19A91]">({p.role})</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {p.micOn ? <Mic className="w-3.5 h-3.5 text-emerald-400" /> : <MicOff className="w-3.5 h-3.5 text-red-400" />}
                      {p.cameraOn ? <Video className="w-3.5 h-3.5 text-emerald-400" /> : <VideoOff className="w-3.5 h-3.5 text-red-400" />}

                      {self.role === 'teacher' && p.id !== self.userId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => sfuClient?.moderateParticipant(p.id, 'REMOVE')}
                          className="h-6 w-6 p-0 text-red-400 hover:bg-red-950 rounded-md"
                          title="Remove Participant"
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* REAL-TIME GROUNDED "NOTES SO FAR" PANEL */}
            {activePanel === 'notes' && (
              <div className="p-3 space-y-3 overflow-y-auto flex-1 text-xs">
                {/* Clean Educator Controls */}
                {self.role === 'teacher' && (
                  <div className="p-2.5 bg-[#242220] border border-[#3E3A35] rounded-xl flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#A19A91] uppercase">Teacher Controls:</span>
                    <div className="flex items-center space-x-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setIsNotesPaused(!isNotesPaused)
                          toast.info(isNotesPaused ? "Resumed live notes generation" : "Paused live notes generation")
                        }}
                        className="text-[10px] font-bold h-6 px-2 border-[#3E3A35] text-white hover:bg-[#3E3A35] rounded-lg cursor-pointer flex items-center gap-1"
                      >
                        {isNotesPaused ? <Play className="w-3 h-3 text-emerald-400" /> : <Pause className="w-3 h-3 text-amber-400" />}
                        {isNotesPaused ? "Resume Notes" : "Pause Notes"}
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleManualRefreshNotes}
                        className="text-[10px] font-bold h-6 px-2 border-[#3E3A35] text-[#8B7EC8] hover:bg-[#3E3A35] rounded-lg cursor-pointer flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Refresh Notes
                      </Button>
                    </div>
                  </div>
                )}

                <div className="p-3.5 bg-[#242220] border border-[#3E3A35] rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-[#3E3A35] pb-2">
                    <span className="text-[10px] font-mono text-[#8B7EC8] font-bold uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#E9B949]" /> Notes So Far
                    </span>
                    <span className="text-[10px] text-[#A19A91] font-mono">
                      {notesStatus === 'PROCESSING' ? 'Updating notes...' : groundedNotes?.lastUpdated ? `Last updated: ${groundedNotes.lastUpdated}` : 'State: Empty'}
                    </span>
                  </div>

                  {/* EMPTY STATE */}
                  {notesStatus === 'EMPTY' && (
                    <div className="py-8 text-center space-y-2">
                      <BookOpen className="w-8 h-8 text-[#A19A91]/40 mx-auto" />
                      <p className="text-xs text-[#A19A91] font-semibold italic">
                        Live notes will appear as the lecture progresses.
                      </p>
                    </div>
                  )}

                  {/* PROCESSING STATE */}
                  {notesStatus === 'PROCESSING' && (
                    <div className="py-6 text-center space-y-2">
                      <RefreshCw className="w-6 h-6 text-[#8B7EC8] animate-spin mx-auto" />
                      <p className="text-xs text-[#8B7EC8] font-bold">Updating notes...</p>
                    </div>
                  )}

                  {/* ERROR STATE */}
                  {notesStatus === 'ERROR' && (
                    <div className="py-6 text-center space-y-2">
                      <AlertCircle className="w-6 h-6 text-red-400 mx-auto" />
                      <p className="text-xs text-red-400 font-bold">Live notes could not be updated right now.</p>
                    </div>
                  )}

                  {/* READY STATE: GROUNDED IN ACTUAL SPOKEN LECTURE SPEECH */}
                  {notesStatus === 'READY' && groundedNotes && (
                    <div className="space-y-3">
                      {/* Current Topic (only render if available) */}
                      {groundedNotes.currentTopic && (
                        <div>
                          <h4 className="font-bold text-[#E76F51] text-[11px] uppercase tracking-wide">Current Topic</h4>
                          <p className="text-white font-serif font-bold text-xs mt-0.5">{groundedNotes.currentTopic}</p>
                        </div>
                      )}

                      {/* Key Points (only render if available) */}
                      {groundedNotes.keyPoints && groundedNotes.keyPoints.length > 0 && (
                        <div>
                          <h4 className="font-bold text-[#8B7EC8] text-[11px] uppercase tracking-wide">Key Points</h4>
                          <ul className="list-disc list-inside mt-1 space-y-1 text-[#A19A91] font-medium leading-relaxed">
                            {groundedNotes.keyPoints.map((pt, i) => (
                              <li key={i}>{pt}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Important Definition (only render if spoken) */}
                      {groundedNotes.importantDefinition && (
                        <div>
                          <h4 className="font-bold text-[#75B798] text-[11px] uppercase tracking-wide">Important Definition</h4>
                          <p className="text-white font-medium bg-[#1E1C1A] p-2 rounded-lg border border-[#3E3A35] mt-1 text-[11px]">
                            {groundedNotes.importantDefinition}
                          </p>
                        </div>
                      )}

                      {/* Example (only render if spoken) */}
                      {groundedNotes.example && (
                        <div>
                          <h4 className="font-bold text-[#E9B949] text-[11px] uppercase tracking-wide">Example</h4>
                          <p className="text-[#A19A91] font-medium mt-0.5 text-[11px]">
                            {groundedNotes.example}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <footer className="px-4 py-3 bg-[#1E1C1A] border-t border-[#3E3A35] flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleToggleMic}
            className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              micOn ? "bg-[#242220] text-white hover:bg-[#3E3A35]" : "bg-red-600 text-white"
            }`}
          >
            {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            <span className="hidden sm:inline">{micOn ? "Mute" : "Unmute"}</span>
          </button>

          <button
            onClick={handleToggleCamera}
            className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              cameraOn ? "bg-[#242220] text-white hover:bg-[#3E3A35]" : "bg-red-600 text-white"
            }`}
          >
            {cameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            <span className="hidden sm:inline">{cameraOn ? "Stop Video" : "Start Video"}</span>
          </button>

          {/* Live Meeting Reactions Menu */}
          <div className="relative">
            <button
              onClick={() => setShowReactionsMenu(!showReactionsMenu)}
              className="p-2.5 bg-[#242220] hover:bg-[#3E3A35] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-[#3E3A35]"
            >
              <Smile className="w-4 h-4 text-[#E9B949]" />
              <span className="hidden sm:inline">Reactions</span>
            </button>

            {showReactionsMenu && (
              <div className="absolute bottom-12 left-0 bg-[#1E1C1A] border border-[#3E3A35] rounded-xl p-2 shadow-2xl flex items-center space-x-2 z-50 animate-in fade-in slide-in-from-bottom-2">
                <button
                  onClick={() => handleSendReaction("👍")}
                  className="text-xl p-1.5 hover:bg-[#242220] rounded-lg transition-transform hover:scale-125 cursor-pointer"
                  title="Thumbs Up"
                >
                  👍
                </button>
                <button
                  onClick={() => handleSendReaction("❤️")}
                  className="text-xl p-1.5 hover:bg-[#242220] rounded-lg transition-transform hover:scale-125 cursor-pointer"
                  title="Heart"
                >
                  ❤️
                </button>
                <button
                  onClick={() => handleSendReaction("👏")}
                  className="text-xl p-1.5 hover:bg-[#242220] rounded-lg transition-transform hover:scale-125 cursor-pointer"
                  title="Clap"
                >
                  👏
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Center Actions (Teacher End Class Button) */}
        <div className="flex items-center space-x-2">
          {self.role === 'teacher' && (
            <Button
              onClick={() => setShowEndClassConfirm(true)}
              variant="destructive"
              className="font-bold text-xs py-2.5 px-5 rounded-xl cursor-pointer shadow-md"
            >
              End Class for Everyone
            </Button>
          )}
        </div>

        {/* Side Panel Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActivePanel(activePanel === 'chat' ? 'none' : 'chat')}
            className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activePanel === 'chat' ? "bg-[#E76F51] text-white" : "bg-[#242220] text-white hover:bg-[#3E3A35]"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Chat</span>
          </button>

          <button
            onClick={() => setActivePanel(activePanel === 'participants' ? 'none' : 'participants')}
            className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activePanel === 'participants' ? "bg-[#8B7EC8] text-white" : "bg-[#242220] text-white hover:bg-[#3E3A35]"
            }`}
          >
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">People ({participants.length})</span>
          </button>

          <button
            onClick={() => setActivePanel(activePanel === 'notes' ? 'none' : 'notes')}
            className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activePanel === 'notes' ? "bg-[#75B798] text-white" : "bg-[#242220] text-white hover:bg-[#3E3A35]"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Notes So Far</span>
          </button>
        </div>
      </footer>

      {/* Teacher End Class Confirmation Dialog */}
      <Dialog open={showEndClassConfirm} onOpenChange={setShowEndClassConfirm}>
        <DialogContent className="bg-[#1E1C1A] border-[#3E3A35] text-white rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-serif font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-500" /> End Class for Everyone?
            </DialogTitle>
            <DialogDescription className="text-xs text-[#A19A91]">
              This will disconnect all live participants, close the WebRTC media session, and finish the live lecture session.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setShowEndClassConfirm(false)} className="text-xs text-[#A19A91] hover:text-white rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleConfirmEndClass} variant="destructive" className="text-xs font-bold rounded-xl">
              End Class Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Teacher Lecture Summary Review Modal */}
      <TeacherLectureSummaryModal
        open={isSummaryModalOpen}
        onOpenChange={setIsSummaryModalOpen}
        summary={generatedSummary}
        errorNotice={summaryErrorNotice}
        onPublished={() => {
          router.push('/teacher')
        }}
      />
    </div>
  )
}
