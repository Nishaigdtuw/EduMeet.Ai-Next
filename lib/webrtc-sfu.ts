'use client'

/**
 * AULYN WebRTC SFU (Selective Forwarding Unit) Client & Signaling Engine
 *
 * Architecture Flow:
 * Participant -> WebRTC Client -> Signaling / Session Service -> Media Infrastructure -> SFU / Media Routing -> Multiple Participants
 */

export type ConnectionState = 'Connecting' | 'Connected' | 'Reconnecting' | 'Disconnected' | 'Failed'

export interface SFUParticipant {
  id: string
  name: string
  role: 'teacher' | 'student'
  isHost?: boolean
  micOn: boolean
  cameraOn: boolean
  stream?: MediaStream | null
  isSpeaking?: boolean
  audioLevel?: number
}

export interface EphemeralReaction {
  id: string
  emoji: string
  senderId: string
  senderName: string
  timestamp: number
}

export interface WebRTCSFUConfig {
  sessionId: string
  userId: string
  userName: string
  userRole: 'teacher' | 'student'
  iceServers?: RTCIceServer[]
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
]

export class WebRTCSFUClient {
  private config: WebRTCSFUConfig
  private localStream: MediaStream | null = null
  private peerConnections: Map<string, RTCPeerConnection> = new Map()
  private remoteStreams: Map<string, MediaStream> = new Map()
  private audioAnalysers: Map<string, { ctx: AudioContext; analyser: AnalyserNode; interval: number }> = new Map()
  private broadcastChannel: BroadcastChannel | null = null
  private dataChannels: Map<string, RTCDataChannel> = new Map()

  public state: ConnectionState = 'Connecting'
  public onStateChange?: (state: ConnectionState) => void
  public onParticipantsChange?: (participants: SFUParticipant[]) => void
  public onRemoteStream?: (participantId: string, stream: MediaStream) => void
  public onReactionReceived?: (reaction: EphemeralReaction) => void
  public onChatMessageReceived?: (msg: { id: string; senderId: string; senderName: string; senderRole: 'teacher' | 'student'; text: string; timestamp: string }) => void
  public onError?: (error: string) => void

  private participantsMap: Map<string, SFUParticipant> = new Map()

  constructor(config: WebRTCSFUConfig) {
    this.config = config
    this.initBroadcastChannel()
  }

  private initBroadcastChannel() {
    if (typeof window === 'undefined') return
    try {
      this.broadcastChannel = new BroadcastChannel(`aulyn_sfu_room_${this.config.sessionId}`)
      this.broadcastChannel.onmessage = (event) => {
        this.handleSignalingMessage(event.data)
      }
    } catch {
      // Fallback to storage events if BroadcastChannel unavailable
      window.addEventListener('storage', this.handleStorageFallback)
    }
  }

  private handleStorageFallback = (e: StorageEvent) => {
    if (e.key === `aulyn_sfu_msg_${this.config.sessionId}` && e.newValue) {
      try {
        const msg = JSON.parse(e.newValue)
        this.handleSignalingMessage(msg)
      } catch {
        // ignore
      }
    }
  }

  private emitSignaling(msg: Record<string, unknown>) {
    const payload = { ...msg, senderId: this.config.userId, sessionId: this.config.sessionId, timestamp: Date.now() }
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(payload)
    } else if (typeof window !== 'undefined') {
      localStorage.setItem(`aulyn_sfu_msg_${this.config.sessionId}`, JSON.stringify(payload))
    }

    // Also notify signaling backend API for server-side persistence
    fetch('/api/live/signaling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {
      // Non-blocking fallback
    })
  }

  public async requestMedia(mic: boolean, camera: boolean): Promise<{ stream: MediaStream | null; error: string | null }> {
    if (typeof window === 'undefined' || !navigator?.mediaDevices) {
      return { stream: null, error: 'Media devices API not supported in this browser.' }
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: mic ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
        video: camera ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : false
      }
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints)

      // Start active speaker audio level analysis on local audio track
      this.startAudioAnalysis(this.config.userId, this.localStream)

      return { stream: this.localStream, error: null }
    } catch (err: unknown) {
      let friendlyError = 'Camera/Microphone permission denied.'
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          friendlyError = 'Camera and Microphone access was denied by browser permissions.'
        } else if (err.name === 'NotFoundError') {
          friendlyError = 'No matching camera or microphone device was found on this system.'
        } else if (err.name === 'NotReadableError') {
          friendlyError = 'Camera or Microphone is currently being used by another application.'
        }
      } else if (err instanceof Error) {
        friendlyError = err.message
      }
      return { stream: null, error: friendlyError }
    }
  }

  public async connect(): Promise<void> {
    this.updateState('Connecting')

    // Add local self participant
    this.participantsMap.set(this.config.userId, {
      id: this.config.userId,
      name: this.config.userName,
      role: this.config.userRole,
      isHost: this.config.userRole === 'teacher',
      micOn: this.localStream?.getAudioTracks().some(t => t.enabled) ?? false,
      cameraOn: this.localStream?.getVideoTracks().some(t => t.enabled) ?? false,
      stream: this.localStream,
      isSpeaking: false
    })

    this.notifyParticipants()

    // Announce Join to SFU Room Broker
    this.emitSignaling({
      type: 'JOIN_ROOM',
      user: {
        id: this.config.userId,
        name: this.config.userName,
        role: this.config.userRole,
        micOn: this.localStream?.getAudioTracks().some(t => t.enabled) ?? false,
        cameraOn: this.localStream?.getVideoTracks().some(t => t.enabled) ?? false
      }
    })

    this.updateState('Connected')
  }

  private handleSignalingMessage(msg: { type: string; senderId: string; [key: string]: unknown }) {
    if (!msg || msg.senderId === this.config.userId) return

    switch (msg.type) {
      case 'JOIN_ROOM': {
        const user = msg.user as { id: string; name: string; role: 'teacher' | 'student'; micOn: boolean; cameraOn: boolean }
        if (user && !this.participantsMap.has(user.id)) {
          this.participantsMap.set(user.id, {
            id: user.id,
            name: user.name,
            role: user.role,
            isHost: user.role === 'teacher',
            micOn: user.micOn,
            cameraOn: user.cameraOn,
            stream: this.remoteStreams.get(user.id) || null
          })
          this.notifyParticipants()

          // Initiate WebRTC peer connection with new participant
          this.createPeerConnection(user.id, true)

          // Announce back presence so new joiner knows existing participants
          this.emitSignaling({
            type: 'PRESENCE_RESPONSE',
            user: {
              id: this.config.userId,
              name: this.config.userName,
              role: this.config.userRole,
              micOn: this.localStream?.getAudioTracks().some(t => t.enabled) ?? false,
              cameraOn: this.localStream?.getVideoTracks().some(t => t.enabled) ?? false
            }
          })
        }
        break
      }

      case 'PRESENCE_RESPONSE': {
        const user = msg.user as { id: string; name: string; role: 'teacher' | 'student'; micOn: boolean; cameraOn: boolean }
        if (user && !this.participantsMap.has(user.id)) {
          this.participantsMap.set(user.id, {
            id: user.id,
            name: user.name,
            role: user.role,
            isHost: user.role === 'teacher',
            micOn: user.micOn,
            cameraOn: user.cameraOn,
            stream: this.remoteStreams.get(user.id) || null
          })
          this.notifyParticipants()
          this.createPeerConnection(user.id, false)
        }
        break
      }

      case 'SDP_OFFER': {
        const offer = msg.offer as RTCSessionDescriptionInit
        this.handleSdpOffer(msg.senderId, offer)
        break
      }

      case 'SDP_ANSWER': {
        const answer = msg.answer as RTCSessionDescriptionInit
        this.handleSdpAnswer(msg.senderId, answer)
        break
      }

      case 'ICE_CANDIDATE': {
        const candidate = msg.candidate as RTCIceCandidateInit
        this.handleIceCandidate(msg.senderId, candidate)
        break
      }

      case 'MEDIA_STATE_CHANGE': {
        const p = this.participantsMap.get(msg.senderId)
        if (p) {
          p.micOn = Boolean(msg.micOn)
          p.cameraOn = Boolean(msg.cameraOn)
          this.notifyParticipants()
        }
        break
      }

      case 'REACTION': {
        const reaction = {
          id: String(msg.reactionId || Date.now()),
          emoji: String(msg.emoji),
          senderId: msg.senderId,
          senderName: String(msg.senderName),
          timestamp: Number(msg.timestamp || Date.now())
        }
        if (this.onReactionReceived) {
          this.onReactionReceived(reaction)
        }
        break
      }

      case 'CHAT_MESSAGE': {
        const chatMsg = msg.chatMessage as { id: string; senderId: string; senderName: string; senderRole: 'teacher' | 'student'; text: string; timestamp: string }
        if (chatMsg && this.onChatMessageReceived) {
          this.onChatMessageReceived(chatMsg)
        }
        break
      }

      case 'MODERATION_ACTION': {
        if (msg.targetUserId === this.config.userId) {
          if (msg.action === 'MUTE') {
            this.toggleMic(false)
          } else if (msg.action === 'REMOVE') {
            this.disconnect()
            if (this.onError) this.onError('You were removed from the live session by the educator host.')
          }
        }
        break
      }

      case 'LEAVE_ROOM': {
        this.removeParticipant(msg.senderId)
        break
      }

      case 'CLASS_ENDED': {
        this.updateState('Disconnected')
        if (this.onError) this.onError('Class has been ended by the educator host.')
        break
      }
    }
  }

  private async createPeerConnection(remoteUserId: string, isOfferInitiator: boolean) {
    if (this.peerConnections.has(remoteUserId)) return

    const pc = new RTCPeerConnection({ iceServers: this.config.iceServers || DEFAULT_ICE_SERVERS })
    this.peerConnections.set(remoteUserId, pc)

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!)
      })
    }

    // Setup DataChannel for ultra-fast peer signaling & reactions
    if (isOfferInitiator) {
      const dc = pc.createDataChannel('aulyn_data_channel')
      this.setupDataChannel(remoteUserId, dc)
    } else {
      pc.ondatachannel = (e) => {
        this.setupDataChannel(remoteUserId, e.channel)
      }
    }

    // Handle remote media track reception
    pc.ontrack = (event) => {
      let remoteStream = this.remoteStreams.get(remoteUserId)
      if (!remoteStream) {
        remoteStream = new MediaStream()
        this.remoteStreams.set(remoteUserId, remoteStream)
      }
      event.streams[0].getTracks().forEach(t => {
        if (!remoteStream!.getTracks().some(existing => existing.id === t.id)) {
          remoteStream!.addTrack(t)
        }
      })

      const participant = this.participantsMap.get(remoteUserId)
      if (participant) {
        participant.stream = remoteStream
        this.notifyParticipants()
      }

      if (this.onRemoteStream) {
        this.onRemoteStream(remoteUserId, remoteStream)
      }

      // Start audio analysis on incoming remote track
      this.startAudioAnalysis(remoteUserId, remoteStream)
    }

    // Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.emitSignaling({
          type: 'ICE_CANDIDATE',
          targetUserId: remoteUserId,
          candidate: event.candidate.toJSON()
        })
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.removeParticipant(remoteUserId)
      }
    }

    if (isOfferInitiator) {
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        this.emitSignaling({
          type: 'SDP_OFFER',
          targetUserId: remoteUserId,
          offer
        })
      } catch (err) {
        console.error('Failed to create WebRTC offer:', err)
      }
    }
  }

  private async handleSdpOffer(remoteUserId: string, offer: RTCSessionDescriptionInit) {
    let pc = this.peerConnections.get(remoteUserId)
    if (!pc) {
      await this.createPeerConnection(remoteUserId, false)
      pc = this.peerConnections.get(remoteUserId)
    }

    if (!pc) return

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      this.emitSignaling({
        type: 'SDP_ANSWER',
        targetUserId: remoteUserId,
        answer
      })
    } catch (err) {
      console.error('Failed to handle SDP offer:', err)
    }
  }

  private async handleSdpAnswer(remoteUserId: string, answer: RTCSessionDescriptionInit) {
    const pc = this.peerConnections.get(remoteUserId)
    if (pc && pc.signalingState !== 'stable') {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
      } catch (err) {
        console.error('Failed to handle SDP answer:', err)
      }
    }
  }

  private async handleIceCandidate(remoteUserId: string, candidate: RTCIceCandidateInit) {
    const pc = this.peerConnections.get(remoteUserId)
    if (pc && pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.error('Failed to add ICE candidate:', err)
      }
    }
  }

  private setupDataChannel(remoteUserId: string, dc: RTCDataChannel) {
    this.dataChannels.set(remoteUserId, dc)
    dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        this.handleSignalingMessage(msg)
      } catch {
        // ignore
      }
    }
  }

  /**
   * Active Speaker Audio Energy Detection Engine
   */
  private startAudioAnalysis(participantId: string, stream: MediaStream) {
    if (typeof window === 'undefined') return
    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) return

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AudioCtxClass()
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const interval = window.setInterval(() => {
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i]
        }
        const avg = sum / bufferLength

        const participant = this.participantsMap.get(participantId)
        if (participant) {
          participant.audioLevel = Math.round(avg)
          const isSpeakingNow = avg > 25
          if (participant.isSpeaking !== isSpeakingNow) {
            participant.isSpeaking = isSpeakingNow
            this.notifyParticipants()
          }
        }
      }, 300)

      this.audioAnalysers.set(participantId, { ctx, analyser, interval })
    } catch {
      // Fallback gracefully if AudioContext restricted
    }
  }

  public toggleMic(enabled?: boolean): boolean {
    if (!this.localStream) return false
    const audioTracks = this.localStream.getAudioTracks()
    const targetState = enabled !== undefined ? enabled : !audioTracks.some(t => t.enabled)
    audioTracks.forEach(t => (t.enabled = targetState))

    const selfP = this.participantsMap.get(this.config.userId)
    if (selfP) {
      selfP.micOn = targetState
      this.notifyParticipants()
    }

    this.emitSignaling({
      type: 'MEDIA_STATE_CHANGE',
      micOn: targetState,
      cameraOn: selfP?.cameraOn ?? true
    })

    return targetState
  }

  public toggleCamera(enabled?: boolean): boolean {
    if (!this.localStream) return false
    const videoTracks = this.localStream.getVideoTracks()
    const targetState = enabled !== undefined ? enabled : !videoTracks.some(t => t.enabled)
    videoTracks.forEach(t => (t.enabled = targetState))

    const selfP = this.participantsMap.get(this.config.userId)
    if (selfP) {
      selfP.cameraOn = targetState
      this.notifyParticipants()
    }

    this.emitSignaling({
      type: 'MEDIA_STATE_CHANGE',
      micOn: selfP?.micOn ?? true,
      cameraOn: targetState
    })

    return targetState
  }

  public sendReaction(emoji: string) {
    const reactionId = `react-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    const reaction: EphemeralReaction = {
      id: reactionId,
      emoji,
      senderId: this.config.userId,
      senderName: this.config.userName,
      timestamp: Date.now()
    }

    this.emitSignaling({
      type: 'REACTION',
      reactionId,
      emoji,
      senderName: this.config.userName
    })

    if (this.onReactionReceived) {
      this.onReactionReceived(reaction)
    }
  }

  public sendChatMessage(text: string) {
    if (!text.trim()) return
    const msg = {
      id: `m-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      senderId: this.config.userId,
      senderName: this.config.userName,
      senderRole: this.config.userRole,
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    this.emitSignaling({
      type: 'CHAT_MESSAGE',
      chatMessage: msg
    })

    if (this.onChatMessageReceived) {
      this.onChatMessageReceived(msg)
    }
  }

  public moderateParticipant(targetUserId: string, action: 'MUTE' | 'REMOVE') {
    if (this.config.userRole !== 'teacher') return
    this.emitSignaling({
      type: 'MODERATION_ACTION',
      targetUserId,
      action
    })

    if (action === 'REMOVE') {
      this.removeParticipant(targetUserId)
    }
  }

  public endClassForEveryone() {
    if (this.config.userRole !== 'teacher') return
    this.emitSignaling({
      type: 'CLASS_ENDED'
    })
    this.disconnect()
  }

  private removeParticipant(id: string) {
    const pc = this.peerConnections.get(id)
    if (pc) {
      pc.close()
      this.peerConnections.delete(id)
    }

    const dc = this.dataChannels.get(id)
    if (dc) {
      dc.close()
      this.dataChannels.delete(id)
    }

    const analyserObj = this.audioAnalysers.get(id)
    if (analyserObj) {
      clearInterval(analyserObj.interval)
      analyserObj.ctx.close()
      this.audioAnalysers.delete(id)
    }

    this.remoteStreams.delete(id)
    this.participantsMap.delete(id)
    this.notifyParticipants()
  }

  private notifyParticipants() {
    if (this.onParticipantsChange) {
      this.onParticipantsChange(Array.from(this.participantsMap.values()))
    }
  }

  private updateState(newState: ConnectionState) {
    this.state = newState
    if (this.onStateChange) {
      this.onStateChange(newState)
    }
  }

  public disconnect() {
    this.updateState('Disconnected')

    // Stop local media tracks cleanly
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop())
      this.localStream = null
    }

    // Close all peer connections
    this.peerConnections.forEach(pc => pc.close())
    this.peerConnections.clear()

    // Close data channels
    this.dataChannels.forEach(dc => dc.close())
    this.dataChannels.clear()

    // Close audio analysers
    this.audioAnalysers.forEach(obj => {
      clearInterval(obj.interval)
      obj.ctx.close()
    })
    this.audioAnalysers.clear()

    // Announce Leave
    this.emitSignaling({ type: 'LEAVE_ROOM' })

    if (this.broadcastChannel) {
      this.broadcastChannel.close()
      this.broadcastChannel = null
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.handleStorageFallback)
    }
  }
}
