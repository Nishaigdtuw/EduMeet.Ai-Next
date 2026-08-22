import { NextResponse } from 'next/server'
import { saveStoredMeeting, generateMeetingId, LiveMeetingSession } from '@/lib/webrtc-meeting'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { classId, className, title, topic, description, teacherId, teacherName, customMeetingId } = body

    if (!classId || !title || !topic) {
      return NextResponse.json({ error: 'Missing required session parameters: classId, title, topic' }, { status: 400 })
    }

    // Verify classroom existence in Database or Store
    let targetClassName = className
    try {
      const cls = await prisma.classroom.findUnique({
        where: { classId },
        select: { className: true, ownerId: true }
      })
      if (cls) {
        targetClassName = cls.className
      }
    } catch {
      // Database fallback
    }

    const sessionId = `sess-${classId}-${Date.now()}`
    const meetingId = customMeetingId && customMeetingId.trim()
      ? customMeetingId.trim().toUpperCase()
      : generateMeetingId()

    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const newSession: LiveMeetingSession = {
      sessionId,
      meetingId,
      classId,
      className: targetClassName || 'Classroom Session',
      topic: `${title} — ${topic}`,
      teacherName: teacherName || 'Prof. Sarah Jenkins',
      status: 'Live',
      startedAt: nowStr,
      confusionSignalsCount: 0,
      participants: [
        {
          id: teacherId || 'teacher-demo',
          name: teacherName || 'Prof. Sarah Jenkins',
          role: 'teacher',
          isHost: true,
          micOn: true,
          cameraOn: true
        }
      ],
      chatMessages: [
        {
          id: `m-init-${Date.now()}`,
          senderId: teacherId || 'teacher-demo',
          senderName: teacherName || 'Prof. Sarah Jenkins',
          senderRole: 'teacher',
          text: `Live class "${title}" has started (Meeting ID: ${meetingId}). Topic: ${topic}. Welcome everyone!`,
          timestamp: nowStr
        }
      ],
      lectureTranscript: '',
      publishedNotes: description || ''
    }

    // Save session in server-backed store
    saveStoredMeeting(newSession)

    return NextResponse.json({
      success: true,
      sessionId,
      meetingId,
      session: newSession
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create live class session'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
