'use client'

import React, { useState, useEffect } from "react"
import { Video, BookOpen, Plus, Copy, Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ClassroomData, LiveSessionData, getLiveSession } from "@/lib/data-store"
import { getAuthenticatedUser } from "@/lib/auth-guard"

interface LiveSessionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  classroom: ClassroomData
  userRole: 'student' | 'teacher'
  studentName?: string
}

export function LiveSessionModal({
  open,
  onOpenChange,
  classroom,
  userRole
}: LiveSessionModalProps) {
  const router = useRouter()
  const [session, setSession] = useState<LiveSessionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [copiedId, setCopiedId] = useState(false)

  // Teacher Create Session Form State
  const [sessionTitle, setSessionTitle] = useState("")
  const [sessionTopic, setSessionTopic] = useState("")
  const [sessionDesc, setSessionDesc] = useState("")

  // Student Join By Meeting ID State
  const [inputMeetingId, setInputMeetingId] = useState("")

  useEffect(() => {
    if (classroom && open) {
      const active = getLiveSession(classroom.classId)
      if (active && active.status === 'Live') {
        setSession(active)
        if (active.meetingId) {
          setInputMeetingId(active.meetingId)
        }
      } else {
        setSession(null)
        setInputMeetingId("")
        setSessionTitle(`${classroom.className} Lecture`)
        setSessionTopic("Course Algorithms & Concepts")
        setSessionDesc("Live real-time lecture session.")
      }
    }
  }, [classroom, open])

  const handleCopyMeetingId = (meetingId: string) => {
    navigator.clipboard.writeText(meetingId)
    setCopiedId(true)
    toast.success("Meeting ID copied to clipboard!")
    setTimeout(() => setCopiedId(false), 2000)
  }

  const handleStartNewLiveClass = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionTitle.trim() || !sessionTopic.trim()) {
      toast.error("Please provide both a session title and a topic.")
      return
    }

    setLoading(true)
    const user = getAuthenticatedUser()
    const teacherId = user?.userId || 'teacher-demo'
    const teacherName = user?.name || 'Prof. Sarah Jenkins'

    try {
      const res = await fetch('/api/live/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: classroom.classId,
          className: classroom.className,
          title: sessionTitle.trim(),
          topic: sessionTopic.trim(),
          description: sessionDesc.trim(),
          teacherId,
          teacherName
        })
      })

      const data = await res.json()
      if (data.success && data.sessionId) {
        toast.success(`Live session created! Meeting ID: ${data.meetingId}`)
        onOpenChange(false)
        router.push(`/live/${data.sessionId}`)
      } else {
        toast.error(data.error || "Failed to create live session.")
      }
    } catch {
      toast.error("Network error creating live session.")
    } finally {
      setLoading(false)
    }
  }

  const handleJoinByMeetingId = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const targetId = inputMeetingId.trim().toUpperCase()

    if (!targetId) {
      toast.error("Please enter a valid Meeting ID.")
      return
    }

    setLoading(true)
    const user = getAuthenticatedUser()

    try {
      const res = await fetch(`/api/live/session?meetingId=${encodeURIComponent(targetId)}&userId=${user?.userId || 'student-demo'}&role=${userRole}`)
      const data = await res.json()

      if (data.success && data.sessionId) {
        onOpenChange(false)
        router.push(`/live/${data.sessionId}`)
      } else {
        toast.error(data.error || "Invalid Meeting ID.")
      }
    } catch {
      toast.error("Unable to join live meeting.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[#FFF9F1] border border-[#E5DCD0] shadow-2xl rounded-2xl p-6 text-[#292724] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-3 border-b border-[#E5DCD0]">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className={`w-3 h-3 rounded-full ${session ? 'bg-red-500 animate-ping' : 'bg-amber-500'}`} />
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${
                session ? 'bg-red-100 text-red-600 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200'
              }`}>
                {session ? 'Live Session Active' : 'Live Classroom Studio'}
              </span>
              {session && <span className="text-xs font-bold text-[#77716A]">{session.startedAt}</span>}
            </div>
          </div>

          <DialogTitle className="text-xl font-serif font-black text-[#292724] mt-2">
            {classroom?.className} — {session ? session.topic : 'Live Classroom Studio'}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#77716A]">
            {userRole === 'teacher'
              ? 'Educator control panel for starting live sessions, retrieving Meeting IDs, and monitoring real-time lecture notes.'
              : 'Join live class using Meeting ID and view real-time lecture notes as the lecture progresses.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* ACTIVE SESSION VIEW FOR TEACHER OR ENROLLED STUDENT */}
          {session ? (
            <div className="p-4 bg-gradient-to-r from-red-50 to-amber-50 border-2 border-red-300 rounded-2xl shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-red-600 text-white rounded-xl flex items-center justify-center font-bold shrink-0 shadow-2xs">
                    <Video className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-serif font-bold text-red-900 uppercase tracking-wider">Virtual Class Meeting Room Active</h4>
                    <p className="text-xs text-[#292724] font-semibold mt-0.5">
                      Topic: <strong>{session.topic}</strong> • Instructor: {session.teacherName || 'Prof. Sarah Jenkins'}
                    </p>
                  </div>
                </div>

                <Button
                  onClick={() => {
                    onOpenChange(false)
                    router.push(`/live/${session.sessionId}`)
                  }}
                  disabled={loading}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-2 px-5 rounded-xl shadow-2xs cursor-pointer shrink-0"
                >
                  Enter Meeting Room
                </Button>
              </div>

              {/* Display Meeting ID with Copy Button */}
              {session.meetingId && (
                <div className="p-2.5 bg-white/90 border border-red-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-[#77716A] uppercase text-[10px]">Meeting ID:</span>
                    <span className="font-mono font-bold text-[#292724] tracking-wider text-sm bg-red-50 px-2 py-0.5 rounded border border-red-200">
                      {session.meetingId}
                    </span>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => session.meetingId && handleCopyMeetingId(session.meetingId)}
                    className="h-7 text-xs font-bold border-[#E5DCD0] text-[#292724] hover:bg-[#FFF9F1] rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#E76F51]" />}
                    {copiedId ? "Copied!" : "Copy ID"}
                  </Button>
                </div>
              )}
            </div>
          ) : userRole === 'teacher' ? (
            /* TEACHER CREATE LIVE CLASS FORM */
            <form onSubmit={handleStartNewLiveClass} className="bg-white border border-[#E5DCD0] rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center space-x-2 text-[#E76F51]">
                <Plus className="w-5 h-5" />
                <h3 className="text-sm font-serif font-bold text-[#292724]">Start a New Live Class Session</h3>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#292724]">Session Title</Label>
                <Input
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  placeholder="e.g. CS201 Live Lecture 14"
                  className="bg-[#FFF9F1] border-[#E5DCD0] text-xs font-semibold rounded-xl"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#292724]">Lecture Topic</Label>
                <Input
                  value={sessionTopic}
                  onChange={(e) => setSessionTopic(e.target.value)}
                  placeholder="e.g. Algorithms & Space Complexity"
                  className="bg-[#FFF9F1] border-[#E5DCD0] text-xs font-semibold rounded-xl"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#292724]">Description / Agenda (Optional)</Label>
                <Input
                  value={sessionDesc}
                  onChange={(e) => setSessionDesc(e.target.value)}
                  placeholder="Brief summary of concepts..."
                  className="bg-[#FFF9F1] border-[#E5DCD0] text-xs font-semibold rounded-xl"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-[#E76F51] hover:bg-[#d55e42] text-white font-bold text-xs py-2.5 px-6 rounded-xl shadow-md cursor-pointer flex items-center gap-2"
                >
                  <Video className="w-4 h-4" />
                  {loading ? 'Creating Session...' : 'Create & Launch Live Class'}
                </Button>
              </div>
            </form>
          ) : null}

          {/* STUDENT JOIN BY MEETING ID FORM */}
          {userRole === 'student' && (
            <form onSubmit={handleJoinByMeetingId} className="bg-white border border-[#E5DCD0] rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center space-x-2 text-[#8B7EC8]">
                <Video className="w-5 h-5" />
                <h3 className="text-sm font-serif font-bold text-[#292724]">Join Live Class using Meeting ID</h3>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#292724]">Enter Meeting ID</Label>
                <div className="flex gap-2">
                  <Input
                    value={inputMeetingId}
                    onChange={(e) => setInputMeetingId(e.target.value)}
                    placeholder="e.g. AULYN-7KQ9-X2M4"
                    className="bg-[#FFF9F1] border-[#E5DCD0] text-xs font-mono font-bold uppercase tracking-wider rounded-xl"
                    required
                  />
                  <Button
                    type="submit"
                    disabled={loading || !inputMeetingId.trim()}
                    className="bg-[#E76F51] hover:bg-[#d55e42] text-white font-bold text-xs px-6 rounded-xl shadow-md cursor-pointer shrink-0"
                  >
                    {loading ? "Joining..." : "Join Class"}
                  </Button>
                </div>
                <p className="text-[11px] text-[#77716A]">Ask your educator for the unique AULYN Meeting ID to enter the live session.</p>
              </div>
            </form>
          )}

          <Card className="bg-white border border-[#E5DCD0] shadow-2xs rounded-2xl p-5 space-y-3">
            <div className="flex items-center space-x-2 text-[#8B7EC8]">
              <BookOpen className="w-5 h-5" />
              <h3 className="text-sm font-serif font-bold text-[#292724]">Live Notes Grounded in Lecture Speech</h3>
            </div>
            <p className="text-xs text-[#77716A] font-semibold leading-relaxed">
              Live Notes start completely <strong>empty</strong> and populate dynamically only as the educator speaks content during the lecture. Stale sample data is never displayed.
            </p>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
