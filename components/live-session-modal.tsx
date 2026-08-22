'use client'

import React, { useState, useEffect } from "react"
import { Video, BookOpen, Plus, ShieldAlert } from "lucide-react"

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

  // Teacher Create Session Form State
  const [sessionTitle, setSessionTitle] = useState("")
  const [sessionTopic, setSessionTopic] = useState("")
  const [sessionDesc, setSessionDesc] = useState("")

  useEffect(() => {
    if (classroom && open) {
      const active = getLiveSession(classroom.classId)
      if (active && active.status === 'Live') {
        setSession(active)
      } else {
        setSession(null)
        // Pre-fill defaults for teacher creation
        setSessionTitle(`${classroom.className} Lecture`)
        setSessionTopic("Trees & Tree Traversal (DFS & BFS)")
        setSessionDesc("Live real-time lecture covering binary tree invariants, recursive call stack analysis, and queue-based BFS level-order traversal.")
      }
    }
  }, [classroom, open])

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
        toast.success(`Live session created: ${sessionTitle}`)
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

  const handleJoinVirtualMeeting = async () => {
    const user = getAuthenticatedUser()
    const targetSessionId = session?.sessionId || `sess-${classroom.classId}-1`

    setLoading(true)
    try {
      const res = await fetch(`/api/live/session?sessionId=${targetSessionId}&userId=${user?.userId || 'student-demo'}&role=${userRole}`)
      const data = await res.json()

      if (data.success) {
        onOpenChange(false)
        router.push(`/live/${targetSessionId}`)
      } else {
        toast.error(data.error || "Unable to join live meeting.")
      }
    } catch {
      // Fallback navigate
      onOpenChange(false)
      router.push(`/live/${targetSessionId}`)
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

            {session && (
              <Button
                onClick={handleJoinVirtualMeeting}
                disabled={loading}
                className="bg-[#E76F51] hover:bg-[#d55e42] text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                <Video className="w-4 h-4" /> Open Meeting Room
              </Button>
            )}
          </div>

          <DialogTitle className="text-xl font-serif font-black text-[#292724] mt-2">
            {classroom?.className} — {session ? session.topic : 'Live Classroom Studio'}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#77716A]">
            {userRole === 'teacher'
              ? 'Educator control panel for starting live virtual classroom sessions with WebRTC SFU media routing and AI Live Notes.'
              : 'Join the live virtual meeting room with real-time video, audio, and Live Notes So Far.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* ACTIVE SESSION VIEW */}
          {session ? (
            <div className="p-4 bg-gradient-to-r from-red-50 to-amber-50 border-2 border-red-300 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                onClick={handleJoinVirtualMeeting}
                disabled={loading}
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-2 px-5 rounded-xl shadow-2xs cursor-pointer shrink-0"
              >
                {loading ? 'Verifying...' : 'Enter Meeting Room'}
              </Button>
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
                  placeholder="e.g. Binary Search Trees & Recursive Traversals"
                  className="bg-[#FFF9F1] border-[#E5DCD0] text-xs font-semibold rounded-xl"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#292724]">Description / Agenda (Optional)</Label>
                <Input
                  value={sessionDesc}
                  onChange={(e) => setSessionDesc(e.target.value)}
                  placeholder="Brief summary of concepts to be covered..."
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
          ) : (
            /* STUDENT NO ACTIVE CLASS NOTICE */
            <Card className="bg-white border border-[#E5DCD0] shadow-2xs rounded-2xl p-6 text-center space-y-3">
              <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="text-base font-serif font-bold text-[#292724]">No Live Class Currently Active</h3>
              <p className="text-xs text-[#77716A] max-w-md mx-auto leading-relaxed font-semibold">
                Your instructor has not started a live lecture session for <strong>{classroom?.className}</strong> yet. You will be notified automatically when the session begins.
              </p>
            </Card>
          )}

          <Card className="bg-white border border-[#E5DCD0] shadow-2xs rounded-2xl p-5 space-y-3">
            <div className="flex items-center space-x-2 text-[#8B7EC8]">
              <BookOpen className="w-5 h-5" />
              <h3 className="text-sm font-serif font-bold text-[#292724]">Live Class Notes Architecture</h3>
            </div>
            <p className="text-xs text-[#77716A] font-semibold leading-relaxed">
              Notes are generated continuously on a separate AI pipeline parallel to WebRTC audio/video routing. Enter the meeting room to view the real-time <strong>Notes So Far</strong> panel.
            </p>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
