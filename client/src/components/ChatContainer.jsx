// src/components/ChatContainer.jsx
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import assets from '../assets/assets'
import { formatMessageTime } from '../lib/utils'
import { ChatContext } from '../../context/ChatContext'
import { AuthContext } from '../../context/AuthContext'
import toast from 'react-hot-toast'
import { attachStreamToVideo, createPeerConnection } from '../lib/webrtc'

// ─── Constants ───────────────────────────────────────────────────────────────
const ICE_SERVERS = [
  // ✅ Google STUN
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },

  // ✅ Cloudflare STUN
  { urls: 'stun:stun.cloudflare.com:3478' },

  // ✅ Twilio STUN
  { urls: 'stun:global.stun.twilio.com:3478' },

  // ✅ TURN — freestun
  {
    urls: [
      'turn:freestun.net:3478',
      'turns:freestun.net:5349',
    ],
    username: 'free',
    credential: 'free',
  },

  // ✅ TURN — openrelay
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:80?transport=tcp',
      'turns:openrelay.metered.ca:443',
      'turns:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },

  // ✅ TURN — numb.viagenie
  {
    urls: 'turn:numb.viagenie.ca',
    username: 'webrtc@live.com',
    credential: 'muazkh',
  },

  // ✅ TURN — relay.metered.ca
  {
    urls: [
      'turn:relay.metered.ca:80',
      'turn:relay.metered.ca:80?transport=tcp',
      'turns:relay.metered.ca:443',
      'turns:relay.metered.ca:443?transport=tcp',
    ],
    username: 'e8dd65f92a544de596c8c0d3',
    credential: 'uWUPJkZLkiMsmMDt',
  },
]

const MEDIA_CONSTRAINTS = {
  video: {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
}

const MEDIA_CONSTRAINTS_FALLBACK = {
  video: {
    facingMode: 'user',
    width: { ideal: 640 },
    height: { ideal: 480 },
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
  },
}

// ─── Safe attach with polling ─────────────────────────────────────────────────
const safeAttach = (videoRef, getStream, options = {}, maxMs = 5000) => {
  const start = Date.now()
  let timer = null

  const attempt = async () => {
    if (Date.now() - start > maxMs) {
      console.warn('[safeAttach] ⏰ TIMED OUT after', maxMs, 'ms')
      return
    }

    const el = videoRef?.current
    const stream = typeof getStream === 'function' ? getStream() : getStream

    if (!el || !stream) {
      timer = setTimeout(attempt, 100)
      return
    }

    await attachStreamToVideo(videoRef, stream, options)
  }

  attempt()
  return () => { if (timer) clearTimeout(timer) }
}

// ─── Image viewer ─────────────────────────────────────────────────────────────
const ImageViewer = ({ src, onClose }) => {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className='fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/95 p-4'
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className='absolute top-4 right-4 text-white text-2xl bg-white/10 hover:bg-white/20 rounded-full w-10 h-10 flex items-center justify-center transition-all z-10'
      >
        ✕
      </button>
      <img
        src={src}
        alt='Full view'
        className='max-w-[92vw] max-h-[80vh] object-contain rounded-xl shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      />
      <a
        href={src}
        download
        target='_blank'
        rel='noreferrer'
        onClick={(e) => e.stopPropagation()}
        className='mt-5 flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-2.5 rounded-full text-sm font-medium transition-all'
      >
        ⬇ Download
      </a>
    </div>
  )
}

// ─── PDF bubble ───────────────────────────────────────────────────────────────
const PdfBubble = ({ fileUrl, fileName, isOwn }) => {
  const displayName = fileName || 'Document.pdf'

  const handleView = () => {
    if (!fileUrl) return toast.error('File URL missing')
    window.open(fileUrl, '_blank', 'noreferrer')
  }

  const handleDownload = () => {
    if (!fileUrl) return toast.error('File URL missing')
    const a = document.createElement('a')
    a.href = fileUrl
    a.download = displayName
    a.target = '_blank'
    a.rel = 'noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div
      className={`flex flex-col gap-2 p-3 rounded-2xl ${
        isOwn ? 'bg-violet-500/80 rounded-br-sm' : 'bg-white/10 rounded-bl-sm'
      }`}
      style={{ minWidth: '200px', maxWidth: '250px' }}
    >
      <div className='flex items-center gap-2.5'>
        <div className='w-10 h-10 rounded-lg bg-red-500/25 flex items-center justify-center flex-shrink-0'>
          <span className='text-xl'>📄</span>
        </div>
        <div className='flex flex-col min-w-0 flex-1'>
          <span
            className='text-white text-xs font-semibold leading-tight break-all'
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {displayName}
          </span>
          <span className='text-white/60 text-[10px] mt-0.5'>PDF Document</span>
        </div>
      </div>
      <div className='flex gap-1.5'>
        <button
          onClick={handleView}
          className='flex-1 flex items-center justify-center gap-1 bg-white/20 hover:bg-white/30 active:scale-95 text-white text-[11px] font-medium py-1.5 rounded-lg transition-all'
        >
          <span>👁</span><span>View</span>
        </button>
        <button
          onClick={handleDownload}
          className='flex-1 flex items-center justify-center gap-1 bg-white/20 hover:bg-white/30 active:scale-95 text-white text-[11px] font-medium py-1.5 rounded-lg transition-all'
        >
          <span>⬇</span><span>Download</span>
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
const ChatContainer = ({
  myVideo,
  userVideo,
  setCallState,
  setCallerInfo,
  setRemoteStream,
  callState,
  callerInfo,
  remoteStream,
  registerCallHandlers,
}) => {
  const {
    messages,
    selectedUser,
    setSelectedUser,
    sendMessage,
    getMessages,
  } = useContext(ChatContext)
  const { authUser, onlineUsers, socket } = useContext(AuthContext)

  // ── Refs ──────────────────────────────────────────────────────────────────
  const scrollContainerRef = useRef(null)
  const scrollEnd = useRef(null)
  const fileInputRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const pendingIceCandidatesRef = useRef([])
  const pendingAnswerRef = useRef(null)
  const activePeerIdRef = useRef(null)
  const isMountedRef = useRef(true)
  const isAnsweringRef = useRef(false)
  const prevSelectedUserIdRef = useRef(null)
  const cancelLocalAttachRef = useRef(null)
  const cancelRemoteAttachRef = useRef(null)
  // ✅ Track ICE restart attempts
  const iceRestartAttemptsRef = useRef(0)
  const iceRestartTimerRef = useRef(null)

  // ── State ─────────────────────────────────────────────────────────────────
  const [input, setInput] = useState('')
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [viewingImage, setViewingImage] = useState(null)
  const [isSendingFile, setIsSendingFile] = useState(false)

  const { callStarted, callAccepted, receivingCall } = callState
  const { caller, callerName, callerSignal } = callerInfo

  // ── Scroll helpers ────────────────────────────────────────────────────────
  const jumpToBottom = useCallback(() => {
    const c = scrollContainerRef.current
    if (c) c.scrollTop = c.scrollHeight
  }, [])

  const smoothScrollToBottom = useCallback(() => {
    const c = scrollContainerRef.current
    if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' })
  }, [])

  const isNearBottom = useCallback(() => {
    const c = scrollContainerRef.current
    if (!c) return true
    return c.scrollHeight - c.scrollTop - c.clientHeight <= 100
  }, [])

  // ══════════════════════════════════════════════════════════════════════════
  // MEDIA
  // ══════════════════════════════════════════════════════════════════════════
  const getLocalStream = useCallback(async () => {
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks()
      if (tracks.length > 0 && tracks.every((t) => t.readyState === 'live')) {
        tracks.forEach((t) => (t.enabled = true))
        return localStreamRef.current
      }
      tracks.forEach((t) => t.stop())
      localStreamRef.current = null
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS)
      localStreamRef.current = stream
      return stream
    } catch (e) {
      console.warn('[getLocalStream] HD failed:', e.message)
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS_FALLBACK)
      localStreamRef.current = stream
      toast('Using lower quality video', { icon: '📹' })
      return stream
    } catch (e) {
      console.warn('[getLocalStream] SD failed:', e.message)
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: MEDIA_CONSTRAINTS.audio,
      })
      localStreamRef.current = stream
      toast('No camera — audio only call', { icon: '🎤' })
      return stream
    } catch (e) {
      console.error('[getLocalStream] ALL FAILED:', e.message)
      toast.error('Camera/Microphone permission denied')
      return null
    }
  }, [])

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const cleanupCall = useCallback(() => {
    // Cancel timers
    cancelLocalAttachRef.current?.()
    cancelRemoteAttachRef.current?.()
    cancelLocalAttachRef.current = null
    cancelRemoteAttachRef.current = null
    if (iceRestartTimerRef.current) {
      clearTimeout(iceRestartTimerRef.current)
      iceRestartTimerRef.current = null
    }
    iceRestartAttemptsRef.current = 0

    // Stop tracks
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null

    // Close PC
    if (pcRef.current) {
      const pc = pcRef.current
      pc.ontrack = null
      pc.onicecandidate = null
      pc.onconnectionstatechange = null
      pc.oniceconnectionstatechange = null
      pc.onicegatheringstatechange = null
      try { pc.close() } catch {}
      pcRef.current = null
    }

    // Clear video
    if (myVideo?.current) myVideo.current.srcObject = null
    if (userVideo?.current) userVideo.current.srcObject = null

    // Reset refs
    pendingIceCandidatesRef.current = []
    pendingAnswerRef.current = null
    activePeerIdRef.current = null
    isAnsweringRef.current = false

    if (isMountedRef.current) {
      setRemoteStream(null)
      setCallState({ callStarted: false, callAccepted: false, receivingCall: false })
      setCallerInfo({ caller: '', callerName: '', callerSignal: null })
    }
  }, [myVideo, userVideo, setRemoteStream, setCallState, setCallerInfo])

  // ── Flush ICE ─────────────────────────────────────────────────────────────
  const flushPendingIceCandidates = useCallback(async () => {
    const pc = pcRef.current
    if (!pc || !pc.remoteDescription) return
    const queue = pendingIceCandidatesRef.current.splice(0)
    console.log('[flushICE] Flushing', queue.length, 'candidates')
    for (const c of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
    }
  }, [])

  // ── Build PC ──────────────────────────────────────────────────────────────
  const buildPeerConnection = useCallback(
    (targetPeerId) => {
      const pc = createPeerConnection({ iceServers: ICE_SERVERS })

      pc.onicecandidate = ({ candidate }) => {
        if (!candidate || !socket) return
        socket.emit('ice-candidate', {
          to: targetPeerId,
          from: authUser._id,
          candidate,
        })
      }

      pc.ontrack = ({ streams, track }) => {
        console.log('[ontrack]', track.kind, track.readyState)
        const stream = streams?.[0]
        if (!stream) return

        const waitForLive = (attempts = 0) => {
          if (!isMountedRef.current) return
          const tracks = stream.getTracks()
          const hasLive = tracks.length > 0 && tracks.some((t) => t.readyState === 'live')

          if (hasLive || attempts >= 30) {
            if (isMountedRef.current) setRemoteStream(stream)
            cancelRemoteAttachRef.current?.()
            cancelRemoteAttachRef.current = safeAttach(
              userVideo, stream, { muted: false }, 8000
            )
          } else {
            setTimeout(() => waitForLive(attempts + 1), 100)
          }
        }
        waitForLive()
      }

      // ✅ Robust connection state handler with multiple restart attempts
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        console.log('[PC] connectionState:', state)

        if (state === 'connected') {
          console.log('[PC] ✅ CONNECTED!')
          // Reset restart attempts on success
          iceRestartAttemptsRef.current = 0
          if (iceRestartTimerRef.current) {
            clearTimeout(iceRestartTimerRef.current)
            iceRestartTimerRef.current = null
          }
        }

        if (state === 'failed') {
          console.warn('[PC] ❌ FAILED')
          // ✅ Try up to 3 ICE restarts before giving up
          if (iceRestartAttemptsRef.current < 3) {
            iceRestartAttemptsRef.current += 1
            console.log(`[PC] ICE restart attempt ${iceRestartAttemptsRef.current}/3`)
            toast(`Reconnecting... (${iceRestartAttemptsRef.current}/3)`, { icon: '🔄' })
            try {
              pc.restartIce()
            } catch (e) {
              console.warn('[PC] restartIce failed:', e.message)
            }
            // Check again after 10s
            iceRestartTimerRef.current = setTimeout(() => {
              if (pcRef.current?.connectionState === 'failed') {
                console.log('[PC] Still failed — trying next restart')
                pc.onconnectionstatechange?.()
              }
            }, 10000)
          } else {
            console.log('[PC] Max restarts reached — giving up')
            toast.error('Call failed — please try again')
            cleanupCall()
          }
        }

        if (state === 'disconnected') {
          console.log('[PC] Disconnected — waiting to see if it recovers...')
          iceRestartTimerRef.current = setTimeout(() => {
            const currentState = pcRef.current?.connectionState
            if (currentState === 'disconnected' || currentState === 'failed') {
              console.log('[PC] Did not recover from disconnected')
              toast.error('Call disconnected')
              cleanupCall()
            }
          }, 10000)
        }

        if (state === 'closed') {
          console.log('[PC] Connection closed')
        }
      }

      pc.oniceconnectionstatechange = () => {
        console.log('[PC] iceConnectionState:', pc.iceConnectionState)
        if (pc.iceConnectionState === 'failed') {
          try { pc.restartIce() } catch {}
        }
      }

      pc.onicegatheringstatechange = () => {
        console.log('[PC] iceGatheringState:', pc.iceGatheringState)
      }

      return pc
    },
    [socket, authUser, cleanupCall, userVideo, setRemoteStream]
  )

  // ══════════════════════════════════════════════════════════════════════════
  // CALL ACTIONS
  // ══════════════════════════════════════════════════════════════════════════

  const startCall = useCallback(
    async (targetUserId) => {
      console.log('[startCall] Starting to:', targetUserId)
      if (!socket?.connected) return toast.error('Not connected to server')
      if (callStarted) return
      if (!selectedUser?._id) return toast.error('No user selected')
      if (!authUser?._id) return toast.error('Not authenticated')

      const stream = await getLocalStream()
      if (!stream) return

      if (pcRef.current) { try { pcRef.current.close() } catch {} pcRef.current = null }

      const pc = buildPeerConnection(targetUserId)
      pcRef.current = pc
      activePeerIdRef.current = targetUserId
      iceRestartAttemptsRef.current = 0

      stream.getTracks().forEach((track) => pc.addTrack(track, stream))

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      })
      await pc.setLocalDescription(offer)

      setCallState({ callStarted: true, callAccepted: false, receivingCall: false })
      setCallerInfo({ caller: targetUserId, callerName: selectedUser.fullName, callerSignal: null })

      cancelLocalAttachRef.current?.()
      cancelLocalAttachRef.current = safeAttach(
        myVideo, () => localStreamRef.current, { muted: true }, 5000
      )

      socket.emit('call-user', {
        userToCall: targetUserId,
        from: authUser._id,
        callerName: authUser.fullName,
        offer: pc.localDescription,
      })

      if (pendingAnswerRef.current) {
        const buffered = pendingAnswerRef.current
        pendingAnswerRef.current = null
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(buffered))
          await flushPendingIceCandidates()
        } catch (e) {
          console.warn('[startCall] Buffered answer failed:', e.message)
        }
      }
    },
    [socket, callStarted, selectedUser, authUser, getLocalStream,
     buildPeerConnection, flushPendingIceCandidates, setCallState, setCallerInfo, myVideo]
  )

  const answerCall = useCallback(async () => {
    console.log('[answerCall] Answering from:', caller)
    if (!socket?.connected) return toast.error('Not connected to server')
    if (!caller) return toast.error('Caller ID missing')
    if (!callerSignal) return toast.error('Offer not received yet')
    if (isAnsweringRef.current) return
    isAnsweringRef.current = true

    const stream = await getLocalStream()
    if (!stream) { isAnsweringRef.current = false; return }

    if (pcRef.current) { try { pcRef.current.close() } catch {} pcRef.current = null }

    const pc = buildPeerConnection(caller)
    pcRef.current = pc
    iceRestartAttemptsRef.current = 0

    stream.getTracks().forEach((track) => pc.addTrack(track, stream))

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(callerSignal))
    } catch (e) {
      console.error('[answerCall] setRemoteDescription FAILED:', e.message)
      isAnsweringRef.current = false
      return
    }

    await flushPendingIceCandidates()

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    // ✅ State first — renders VideoCall
    setCallState({ callStarted: true, callAccepted: true, receivingCall: false })

    socket.emit('answer-call', { to: caller, answer: pc.localDescription })

    // ✅ Then attach local stream after VideoCall renders
    cancelLocalAttachRef.current?.()
    cancelLocalAttachRef.current = safeAttach(
      myVideo, () => localStreamRef.current, { muted: true }, 5000
    )
  }, [socket, caller, callerSignal, getLocalStream,
      buildPeerConnection, flushPendingIceCandidates, setCallState, myVideo])

  const endCall = useCallback(() => {
    if (socket?.connected) {
      const target = activePeerIdRef.current || caller || selectedUser?._id
      if (target) socket.emit('end-call', { to: target })
    }
    cleanupCall()
  }, [socket, caller, selectedUser, cleanupCall])

  const declineCall = useCallback(() => {
    if (socket?.connected) {
      const target = activePeerIdRef.current || caller || selectedUser?._id
      if (target) socket.emit('end-call', { to: target })
    }
    cleanupCall()
    toast('Call declined')
  }, [socket, caller, selectedUser, cleanupCall])

  useEffect(() => {
    registerCallHandlers({ endCall, answerCall, declineCall })
  }, [registerCallHandlers, endCall, answerCall, declineCall])

  // ── Local stream effect ───────────────────────────────────────────────────
  useEffect(() => {
    if (!callStarted && !receivingCall) return
    if (!localStreamRef.current) return

    cancelLocalAttachRef.current?.()
    cancelLocalAttachRef.current = safeAttach(
      myVideo, () => localStreamRef.current, { muted: true }, 5000
    )
    return () => { cancelLocalAttachRef.current?.() }
  }, [callStarted, receivingCall, myVideo])

  // ── Remote stream effect ──────────────────────────────────────────────────
  useEffect(() => {
    if (!remoteStream) return

    cancelRemoteAttachRef.current?.()
    cancelRemoteAttachRef.current = safeAttach(
      userVideo, remoteStream, { muted: false }, 8000
    )
    return () => { cancelRemoteAttachRef.current?.() }
  }, [remoteStream, userVideo])

  // ── Socket events ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return

    const onIncoming = ({ from, offer, callerName: name }) => {
      if (!isMountedRef.current) return
      console.log('[incoming] call from:', from)
      setCallerInfo({
        caller: from,
        callerName: name?.trim() || 'Unknown',
        callerSignal: offer,
      })
      setCallState((prev) => ({ ...prev, receivingCall: true }))
      activePeerIdRef.current = from
      toast.success(`📞 Incoming call from ${name?.trim() || 'Someone'}`)
    }

    const onAccepted = async ({ answer }) => {
      console.log('[accepted] answer:', answer ? 'EXISTS' : 'NULL')
      if (!answer) return
      if (!pcRef.current) {
        pendingAnswerRef.current = answer
        return
      }
      if (pcRef.current.remoteDescription) return

      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer))
        await flushPendingIceCandidates()
        if (isMountedRef.current) {
          setCallState((prev) => ({ ...prev, callAccepted: true }))
        }
      } catch (e) {
        console.error('[accepted] Error:', e.message)
      }
    }

    const onIce = async ({ candidate }) => {
      if (!candidate) return
      const pc = pcRef.current
      if (!pc || !pc.remoteDescription) {
        pendingIceCandidatesRef.current.push(candidate)
        return
      }
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)) } catch {}
    }

    const onEnd = () => {
      console.log('[socket] Call ended by peer')
      cleanupCall()
      toast.success('Call ended')
    }

    const onError = ({ message } = {}) => {
      toast.error(message || 'Call failed')
      cleanupCall()
    }

    socket.on('incoming-call', onIncoming)
    socket.on('call-accepted', onAccepted)
    socket.on('ice-candidate', onIce)
    socket.on('end-call', onEnd)
    socket.on('call-error', onError)

    return () => {
      socket.off('incoming-call', onIncoming)
      socket.off('call-accepted', onAccepted)
      socket.off('ice-candidate', onIce)
      socket.off('end-call', onEnd)
      socket.off('call-error', onError)
    }
  }, [socket, cleanupCall, flushPendingIceCandidates, setCallState, setCallerInfo])

  // ── Scroll effects ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedUser?._id) return
    const id = selectedUser._id
    const isNew = prevSelectedUserIdRef.current !== id
    prevSelectedUserIdRef.current = id
    if (isNew) setMessagesLoading(true)
    getMessages(id).finally(() => setMessagesLoading(false))
  }, [selectedUser?._id])

  useEffect(() => {
    if (messagesLoading) return
    if (!Array.isArray(messages) || !messages.length) return
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => jumpToBottom()))
    return () => cancelAnimationFrame(raf)
  }, [messagesLoading])

  useEffect(() => {
    if (messagesLoading || !Array.isArray(messages) || !messages.length) return
    const t = setTimeout(() => { if (isNearBottom()) smoothScrollToBottom() }, 50)
    return () => clearTimeout(t)
  }, [messages, messagesLoading, isNearBottom, smoothScrollToBottom])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      cleanupCall()
    }
  }, [cleanupCall])

  // ── Message handlers ──────────────────────────────────────────────────────
  const handleSendMessage = useCallback(
    async (e) => {
      e?.preventDefault?.()
      const text = input.trim()
      if (!text) return
      setInput('')
      await sendMessage({ text })
      requestAnimationFrame(() => requestAnimationFrame(() => jumpToBottom()))
    },
    [input, sendMessage, jumpToBottom]
  )

  const handleSendFile = useCallback(
    async (e) => {
      const file = e.target.files?.[0]
      if (!file) return

      const isImage = file.type.startsWith('image/')
      const isPdf = file.type === 'application/pdf'

      if (!isImage && !isPdf) {
        toast.error('Only images and PDF files are supported')
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }

      if (file.size > 10 * 1024 * 1024) {
        toast.error('File too large. Max 10MB')
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }

      setIsSendingFile(true)
      const loadingToast = toast.loading(isPdf ? 'Uploading PDF...' : 'Uploading image...')

      const reader = new FileReader()
      reader.onloadend = async () => {
        try {
          let result
          if (isImage) {
            result = await sendMessage({ image: reader.result })
          } else {
            result = await sendMessage({
              file: reader.result,
              fileName: file.name,
              fileType: 'pdf',
            })
          }
          toast.dismiss(loadingToast)
          if (result) toast.success(isPdf ? 'PDF sent!' : 'Image sent!')
          requestAnimationFrame(() => requestAnimationFrame(() => jumpToBottom()))
        } catch (err) {
          toast.dismiss(loadingToast)
          toast.error('Failed to send file')
          console.error(err)
        } finally {
          setIsSendingFile(false)
          if (fileInputRef.current) fileInputRef.current.value = ''
        }
      }
      reader.onerror = () => {
        toast.dismiss(loadingToast)
        toast.error('Failed to read file')
        setIsSendingFile(false)
      }
      reader.readAsDataURL(file)
    },
    [sendMessage, jumpToBottom]
  )

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  if (!selectedUser) {
    return (
      <div className='flex flex-col justify-center items-center gap-2 text-gray-500 bg-white/10 max-md:hidden'>
        <img src={assets.logo_icon} alt='' className='max-w-16' />
        <p className='text-white font-medium text-lg'>Chat anytime, anywhere</p>
      </div>
    )
  }

  if (!authUser) return null

  return (
    <>
      {viewingImage && (
        <ImageViewer src={viewingImage} onClose={() => setViewingImage(null)} />
      )}

      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{ flexShrink: 0 }}
          className='flex items-center gap-2 py-3 px-4 border-b border-stone-500 backdrop-blur-lg'
        >
          <img
            src={selectedUser.profilePic || assets.avatar_icon}
            alt='profile'
            className='w-8 h-8 rounded-full object-cover flex-shrink-0'
          />
          <div className='flex-1 flex items-center gap-2 min-w-0'>
            <span className='text-white text-base font-medium truncate'>
              {selectedUser.fullName}
            </span>
            {onlineUsers.includes(String(selectedUser._id)) && (
              <span className='w-2 h-2 rounded-full bg-green-500 flex-shrink-0' />
            )}
          </div>
          <img
            onClick={() => setSelectedUser(null)}
            src={assets.arrow_icon}
            alt='Back'
            className='md:hidden w-6 cursor-pointer flex-shrink-0'
          />
          <button
            onClick={() => startCall(selectedUser._id)}
            disabled={callStarted}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-white text-xs font-medium transition-all whitespace-nowrap ${
              callStarted
                ? 'bg-gray-500 cursor-not-allowed opacity-50'
                : 'bg-green-500 hover:bg-green-600 active:scale-95'
            }`}
          >
            📞 Call
          </button>
          <img
            src={assets.help_icon}
            alt=''
            className='max-md:hidden w-5 flex-shrink-0'
          />
        </div>

        {/* Messages */}
        <div
          ref={scrollContainerRef}
          style={{
            flex: '1 1 0%',
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
          className='px-4 py-3'
        >
          {messagesLoading ? (
            <div className='flex flex-col gap-3'>
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`flex items-end gap-2 ${i % 2 ? 'flex-row' : 'flex-row-reverse'}`}
                >
                  <div className='w-6 h-6 rounded-full bg-white/10 flex-shrink-0' />
                  <div
                    className='h-8 rounded-2xl bg-white/10 animate-pulse'
                    style={{ width: `${40 + (i * 15) % 30}%` }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className='flex flex-col gap-3'>
              {Array.isArray(messages) && messages.length === 0 && (
                <div className='flex items-center justify-center py-10'>
                  <p className='text-gray-500 text-sm'>
                    No messages yet. Say hello! 👋
                  </p>
                </div>
              )}

              {Array.isArray(messages) &&
                messages.map((msg, index) => {
                  if (!msg) return null
                  const isOwn = String(msg.senderId) === String(authUser?._id)
                  const hasText = msg.text && msg.text.trim().length > 0
                  const hasImage = msg.image && msg.image.length > 0
                  const hasPdf = msg.file && msg.fileType === 'pdf'
                  if (!hasText && !hasImage && !hasPdf) return null

                  return (
                    <div
                      key={msg._id ?? index}
                      className={`flex items-end gap-2 w-full ${
                        isOwn ? 'flex-row-reverse' : 'flex-row'
                      }`}
                    >
                      <img
                        src={
                          isOwn
                            ? authUser?.profilePic || assets.avatar_icon
                            : selectedUser?.profilePic || assets.avatar_icon
                        }
                        alt=''
                        className='w-7 h-7 rounded-full object-cover flex-shrink-0 self-end'
                      />
                      <div
                        className={`flex flex-col gap-1 ${
                          isOwn ? 'items-end' : 'items-start'
                        }`}
                        style={{ maxWidth: '75%' }}
                      >
                        {hasImage && (
                          <img
                            src={msg.image}
                            alt='Shared'
                            onClick={() => setViewingImage(msg.image)}
                            className='rounded-2xl object-cover border border-white/10 cursor-pointer hover:opacity-90 active:opacity-80 transition-opacity'
                            style={{ maxWidth: '250px', maxHeight: '250px' }}
                          />
                        )}
                        {hasPdf && (
                          <PdfBubble
                            fileUrl={msg.file}
                            fileName={msg.fileName}
                            isOwn={isOwn}
                          />
                        )}
                        {hasText && (
                          <p
                            className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                              isOwn
                                ? 'bg-violet-500/80 text-white rounded-br-sm'
                                : 'bg-white/10 text-gray-100 rounded-bl-sm'
                            }`}
                          >
                            {msg.text}
                          </p>
                        )}
                        <span className='text-[10px] text-gray-500 px-1'>
                          {formatMessageTime(msg.createdAt)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              <div ref={scrollEnd} />
            </div>
          )}
        </div>

        {/* Input */}
        <div
          style={{ flexShrink: 0 }}
          className='flex items-center gap-2 px-3 py-2 border-t border-stone-700/50 backdrop-blur-lg'
        >
          <div className='flex flex-1 items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 min-w-0'>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' && !e.shiftKey && handleSendMessage(e)
              }
              type='text'
              placeholder='Message...'
              className='flex-1 min-w-0 bg-transparent border-none outline-none text-white text-sm placeholder-gray-500'
              disabled={isSendingFile}
            />
            <input
              ref={fileInputRef}
              onChange={handleSendFile}
              type='file'
              id='fileInput'
              accept='image/png,image/jpeg,image/gif,image/webp,application/pdf'
              hidden
              disabled={isSendingFile}
            />
            <label
              htmlFor='fileInput'
              className={`cursor-pointer flex-shrink-0 ${
                isSendingFile ? 'opacity-50 pointer-events-none' : ''
              }`}
              title='Send image or PDF'
            >
              {isSendingFile ? (
                <div className='w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin' />
              ) : (
                <img
                  src={assets.gallery_icon}
                  alt='Attach'
                  className='w-5 h-5 opacity-60 hover:opacity-100 transition-opacity'
                />
              )}
            </label>
          </div>
          <button
            onClick={handleSendMessage}
            disabled={isSendingFile}
            className='flex-shrink-0 w-9 h-9 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50'
          >
            <img src={assets.send_button} alt='Send' className='w-8 h-8' />
          </button>
        </div>
      </div>
    </>
  )
}

export default ChatContainer