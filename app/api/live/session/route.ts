import { NextResponse } from 'next/server'
import { getStoredMeeting, getSessionByMeetingId, LiveMeetingSession } from '@/lib/webrtc-meeting'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionIdParam = searchParams.get('sessionId')
    const meetingIdParam = searchParams.get('meetingId')
    const userId = searchParams.get('userId')
    const userRole = searchParams.get('role')

    if (!sessionIdParam && !meetingIdParam) {
      return NextResponse.json({ error: 'Please provide either a sessionId or Meeting ID.' }, { status: 400 })
    }

    let session: LiveMeetingSession | null = null

    if (meetingIdParam) {
      session = getSessionByMeetingId(meetingIdParam) || getStoredMeeting(meetingIdParam)
      if (!session) {
        return NextResponse.json({ error: 'Invalid Meeting ID.' }, { status: 404 })
      }
    } else if (sessionIdParam) {
      session = getStoredMeeting(sessionIdParam) || getSessionByMeetingId(sessionIdParam)
      if (!session) {
        return NextResponse.json({ error: 'Live meeting session not found.' }, { status: 404 })
      }
    }

    if (!session) {
      return NextResponse.json({ error: 'Invalid Meeting ID.' }, { status: 404 })
    }

    // Check if session has ended
    if (session.status === 'Ended') {
      return NextResponse.json({ error: 'This live class has already ended.' }, { status: 410 })
    }

    // Enrollment Authorization Verification
    if (userId && session.classId && userRole !== 'teacher') {
      let isEnrolled = false
      try {
        const enrollment = await prisma.enrolled.findFirst({
          where: {
            studId: userId,
            classId: session.classId
          }
        })
        if (enrollment) {
          isEnrolled = true
        }
      } catch {
        // Fallback demo student check
        isEnrolled = true
      }

      if (!isEnrolled) {
        return NextResponse.json({
          error: 'You are not enrolled in the classroom for this live session.'
        }, { status: 403 })
      }
    }

    const sfuToken = `sfu_token_${session.sessionId}_${userId || 'guest'}_${Date.now()}`

    return NextResponse.json({
      success: true,
      sessionId: session.sessionId,
      meetingId: session.meetingId,
      session,
      token: sfuToken,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to retrieve live session'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
