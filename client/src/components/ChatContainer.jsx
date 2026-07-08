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
import VideoCall from './VideoCall'
import CallPopup from './CallPopup'
import { attachStreamToVideo, createPeerConnection } from '../lib/webrtc'

// ─── Constants ───────────────────────────────────────────────────────────────
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

const MEDIA_CONSTRAINTS = {
  video: {
    facingMode: 'user',
    width: { min: 320, ideal: 1280, max: 1920 },
    height: { min: 240, ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 60 },
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 44100,
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

const ChatContainer = () => {
  const {
    messages,
    selectedUser,
    setSelectedUser,
    sendMessage,
    getMessages,
  } = useContext(ChatContext)
  const { authUser, onlineUsers, socket } = useContext(AuthContext)

  // ── DOM Refs ──────────────────────────────────────────────────────────────
  const scrollContainerRef = useRef(null)
  const scrollEnd = useRef(null)
  const myVideo = useRef(null)
  const userVideo = useRef(null)

  // ── WebRTC Refs ───────────────────────────────────────────────────────────
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const pendingIceCandidatesRef = useRef([])
  const pendingAnswerRef = useRef(null)
  const activePeerIdRef = useRef(null)
  const isMountedRef = useRef(true)
  const isAnsweringRef = useRef(false)

  // ── Scroll tracking refs ──────────────────────────────────────────────────
  const isLoadingMessagesRef = useRef(false)
  const scrollTimeoutRef = useRef(null)
  const prevSelectedUserIdRef = useRef(null)

  // ── State ─────────────────────────────────────────────────────────────────
  const [input, setInput] = useState('')
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [callState, setCallState] = useState({
    callStarted: false,
    callAccepted: false,
    receivingCall: false,
  })
  const [callerInfo, setCallerInfo] = useState({
    caller: '',
    callerName: '',
    callerSignal: null,
  })
  const [remoteStream, setRemoteStream] = useState(null)

  const { callStarted, callAccepted, receivingCall } = callState
  const { caller, callerName, callerSignal } = callerInfo

  // ══════════════════════════════════════════════════════════════════════════
  // SCROLL HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Instantly jumps to the bottom of the message list.
   * Uses scrollTop directly — no animation, no jank.
   * Called when: switching users, initial load.
   */
  const jumpToBottom = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    // Force synchronous scroll — no requestAnimationFrame needed
    container.scrollTop = container.scrollHeight
  }, [])

  /**
   * Smoothly scrolls to bottom.
   * Only called when: new message arrives and user is near bottom,
   * or after sending own message.
   */
  const smoothScrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    })
  }, [])

  /**
   * Returns true if scroll position is within 100px of the bottom.
   * Used to decide whether to auto-scroll on new incoming messages.
   */
  const isNearBottom = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return true
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight
      <= 100
    )
  }, [])

  // ══════════════════════════════════════════════════════════════════════════
  // MEDIA
  // ══════════════════════════════════════════════════════════════════════════

  const prepareStream = useCallback(async () => {
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks()
      const allLive = tracks.every((t) => t.readyState === 'live')
      if (allLive) {
        tracks.forEach((t) => (t.enabled = true))
        await attachStreamToVideo(myVideo, localStreamRef.current, {
          muted: true,
        })
        return localStreamRef.current
      }
      tracks.forEach((t) => t.stop())
      localStreamRef.current = null
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS)
      localStreamRef.current = stream
      await attachStreamToVideo(myVideo, stream, { muted: true })
      return stream
    } catch (err) {
      console.warn('[Media] Ideal constraints failed:', err.name)
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        MEDIA_CONSTRAINTS_FALLBACK
      )
      localStreamRef.current = stream
      await attachStreamToVideo(myVideo, stream, { muted: true })
      toast('Using lower quality video', { icon: '📹' })
      return stream
    } catch (err) {
      console.warn('[Media] Fallback constraints failed:', err.name)
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: MEDIA_CONSTRAINTS.audio,
      })
      localStreamRef.current = stream
      toast('No camera — audio only call', { icon: '🎤' })
      return stream
    } catch (err) {
      console.error('[Media] All getUserMedia attempts failed:', err)
      toast.error('Camera/Microphone permission denied')
      return null
    }
  }, [])

  // ══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ══════════════════════════════════════════════════════════════════════════

  const cleanupCall = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null

    if (pcRef.current) {
      const pc = pcRef.current
      pc.ontrack = null
      pc.onicecandidate = null
      pc.onconnectionstatechange = null
      pc.oniceconnectionstatechange = null
      pc.onicegatheringstatechange = null
      try {
        pc.close()
      } catch {}
      pcRef.current = null
    }

    if (myVideo.current) myVideo.current.srcObject = null
    if (userVideo.current) userVideo.current.srcObject = null

    remoteStreamRef.current = null
    pendingIceCandidatesRef.current = []
    pendingAnswerRef.current = null
    activePeerIdRef.current = null
    isAnsweringRef.current = false

    if (isMountedRef.current) {
      setRemoteStream(null)
      setCallState({
        callStarted: false,
        callAccepted: false,
        receivingCall: false,
      })
      setCallerInfo({ caller: '', callerName: '', callerSignal: null })
    }
  }, [])

  // ══════════════════════════════════════════════════════════════════════════
  // ICE
  // ══════════════════════════════════════════════════════════════════════════

  const flushPendingIceCandidates = useCallback(async () => {
    const pc = pcRef.current
    if (!pc?.remoteDescription) return
    const queue = pendingIceCandidatesRef.current.splice(0)
    if (!queue.length) return
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.warn('[ICE] flush error:', err.message)
      }
    }
  }, [])

  // ══════════════════════════════════════════════════════════════════════════
  // PEER CONNECTION FACTORY
  // ══════════════════════════════════════════════════════════════════════════

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

      // ── ontrack: fires per track (audio + video separately) ────────────
      // We MUST handle this correctly or one side gets black screen.
      // Strategy:
      //   1. Grab the stream from event.streams[0]
      //   2. Poll until ALL tracks on that stream are 'live'
      //   3. Only then attach to video element and update state
      pc.ontrack = ({ streams, track }) => {
        console.log('[WebRTC] ontrack fired:', {
          kind: track.kind,
          readyState: track.readyState,
          streamsLength: streams?.length,
        })

        // streams[0] is the unified MediaStream containing all tracks
        const stream = streams?.[0]
        if (!stream) {
          console.warn('[WebRTC] ontrack — no stream in event.streams[0]')
          return
        }

        // Poll until all tracks on this stream are live
        // Needed because ontrack fires before tracks are fully active
        const attachWhenReady = (attempts = 0) => {
          if (!isMountedRef.current) return

          // After 3s force-attach regardless — some devices never go 'live'
          // until the stream is actually attached to a video element
          if (attempts > 30) {
            console.warn('[WebRTC] Force-attaching stream after 3s timeout')
            remoteStreamRef.current = stream
            if (isMountedRef.current) setRemoteStream(stream)
            attachStreamToVideo(userVideo, stream, { muted: false })
            return
          }

          const allTracks = stream.getTracks()
          const allLive =
            allTracks.length > 0 &&
            allTracks.every((t) => t.readyState === 'live')

          if (allLive) {
            console.log('[WebRTC] All tracks live — attaching remote stream')
            remoteStreamRef.current = stream
            if (isMountedRef.current) setRemoteStream(stream)
            // Attach directly to video element as well (belt-and-suspenders)
            attachStreamToVideo(userVideo, stream, { muted: false })
          } else {
            setTimeout(() => attachWhenReady(attempts + 1), 100)
          }
        }

        attachWhenReady()
      }

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        console.log('[WebRTC] connectionState:', state)
        if (state === 'failed') {
          toast.error('Call connection failed. Please try again.')
          cleanupCall()
        }
        if (state === 'disconnected') {
          setTimeout(() => {
            if (
              pcRef.current &&
              pcRef.current.connectionState === 'disconnected'
            ) {
              toast.error('Call disconnected.')
              cleanupCall()
            }
          }, 5000)
        }
      }

      pc.oniceconnectionstatechange = () => {
        console.log('[WebRTC] iceConnectionState:', pc.iceConnectionState)
      }

      pc.onicegatheringstatechange = () => {
        console.log('[WebRTC] iceGatheringState:', pc.iceGatheringState)
      }

      return pc
    },
    [socket, authUser, cleanupCall]
  )

  // ══════════════════════════════════════════════════════════════════════════
  // CALL ACTIONS
  // ══════════════════════════════════════════════════════════════════════════

  const startCall = useCallback(
    async (targetUserId) => {
      if (!socket?.connected) return toast.error('Not connected. Please wait.')
      if (callStarted) return
      if (!selectedUser?._id) return toast.error('No user selected.')
      if (!authUser?._id) return toast.error('Not authenticated.')

      const stream = await prepareStream()
      if (!stream) return

      if (pcRef.current) {
        try {
          pcRef.current.close()
        } catch {}
        pcRef.current = null
      }

      const pc = buildPeerConnection(targetUserId)
      pcRef.current = pc
      activePeerIdRef.current = targetUserId

      // Add ALL local tracks — both audio and video
      stream.getTracks().forEach((track) => {
        console.log('[WebRTC] Adding local track:', track.kind)
        pc.addTrack(track, stream)
      })

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      })
      await pc.setLocalDescription(offer)

      setCallState({
        callStarted: true,
        callAccepted: false,
        receivingCall: false,
      })

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
          await pc.setRemoteDescription(buffered)
          await flushPendingIceCandidates()
        } catch (err) {
          console.warn('[WebRTC] Buffered answer failed:', err)
        }
      }
    },
    [
      socket,
      callStarted,
      selectedUser,
      authUser,
      prepareStream,
      buildPeerConnection,
      flushPendingIceCandidates,
    ]
  )

  const answerCall = useCallback(async () => {
    if (!socket?.connected) return toast.error('Not connected. Please wait.')
    if (!caller) return toast.error('Caller ID missing.')
    if (!callerSignal) return toast.error('Offer not received yet.')
    if (isAnsweringRef.current) return
    isAnsweringRef.current = true

    const stream = await prepareStream()
    if (!stream) {
      isAnsweringRef.current = false
      return
    }

    if (pcRef.current) {
      try {
        pcRef.current.close()
      } catch {}
      pcRef.current = null
    }

    const pc = buildPeerConnection(caller)
    pcRef.current = pc

    // Add ALL local tracks
    stream.getTracks().forEach((track) => {
      console.log('[WebRTC] Callee adding track:', track.kind)
      pc.addTrack(track, stream)
    })

    await pc.setRemoteDescription(new RTCSessionDescription(callerSignal))
    await flushPendingIceCandidates()

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    setCallState({
      callStarted: true,
      callAccepted: true,
      receivingCall: false,
    })

    socket.emit('answer-call', {
      to: caller,
      answer: pc.localDescription,
    })
  }, [
    socket,
    caller,
    callerSignal,
    prepareStream,
    buildPeerConnection,
    flushPendingIceCandidates,
  ])

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
    toast.success('Call declined')
  }, [socket, caller, selectedUser, cleanupCall])

  // ══════════════════════════════════════════════════════════════════════════
  // VIDEO ATTACHMENT EFFECTS
  // ══════════════════════════════════════════════════════════════════════════

  // Local video — attach when call UI becomes visible
  useEffect(() => {
    if (!callStarted && !receivingCall) return
    const t = setTimeout(() => {
      if (localStreamRef.current) {
        attachStreamToVideo(myVideo, localStreamRef.current, { muted: true })
      }
    }, 150)
    return () => clearTimeout(t)
  }, [callStarted, receivingCall])

  // Remote video — attach whenever stream reference changes
  useEffect(() => {
    if (!remoteStream) return
    // Two attempts — one immediate, one delayed
    // Handles race between state update and DOM render
    attachStreamToVideo(userVideo, remoteStream, { muted: false })
    const t = setTimeout(() => {
      attachStreamToVideo(userVideo, remoteStream, { muted: false })
    }, 300)
    return () => clearTimeout(t)
  }, [remoteStream])

  // ══════════════════════════════════════════════════════════════════════════
  // SOCKET EVENTS
  // ══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!socket) return

    const handleIncomingCall = ({ from, offer, callerName: name }) => {
      if (!isMountedRef.current) return
      const senderName = name?.trim() || 'Unknown User'
      setCallerInfo({ caller: from, callerName: senderName, callerSignal: offer })
      setCallState((prev) => ({ ...prev, receivingCall: true }))
      activePeerIdRef.current = from
      toast.success(`📞 Incoming call from ${senderName}`)
    }

    const handleCallAccepted = async ({ answer }) => {
      if (!answer) return toast.error('Answer missing.')
      if (!pcRef.current) {
        pendingAnswerRef.current = answer
        return
      }
      if (pcRef.current.remoteDescription) return
      try {
        await pcRef.current.setRemoteDescription(
          new RTCSessionDescription(answer)
        )
        await flushPendingIceCandidates()
        if (isMountedRef.current) {
          setCallState((prev) => ({ ...prev, callAccepted: true }))
        }
      } catch (err) {
        console.warn('[WebRTC] setRemoteDescription (answer) failed:', err)
      }
    }

    const handleIceCandidate = async ({ candidate }) => {
      if (!candidate) return
      const pc = pcRef.current
      if (!pc || !pc.remoteDescription) {
        pendingIceCandidatesRef.current.push(candidate)
        return
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.warn('[ICE] addIceCandidate error:', err.message)
      }
    }

    const handleEndCall = () => {
      cleanupCall()
      toast.success('Call ended')
    }

    const handleCallError = ({ message } = {}) => {
      toast.error(message || 'Call failed.')
      cleanupCall()
    }

    socket.on('incoming-call', handleIncomingCall)
    socket.on('call-accepted', handleCallAccepted)
    socket.on('ice-candidate', handleIceCandidate)
    socket.on('end-call', handleEndCall)
    socket.on('call-error', handleCallError)

    return () => {
      socket.off('incoming-call', handleIncomingCall)
      socket.off('call-accepted', handleCallAccepted)
      socket.off('ice-candidate', handleIceCandidate)
      socket.off('end-call', handleEndCall)
      socket.off('call-error', handleCallError)
    }
  }, [socket, cleanupCall, flushPendingIceCandidates])

  // ══════════════════════════════════════════════════════════════════════════
  // CHAT EFFECTS — MESSAGE LOADING + SCROLL
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * When user clicks a different contact:
   * 1. Show loading state instantly
   * 2. Fetch messages
   * 3. Jump to bottom AFTER messages render
   *
   * Key fix: we use a 2-step process:
   *   Step 1 — set loading = true (clears old messages from view)
   *   Step 2 — after fetch, jumpToBottom via useLayoutEffect timing trick
   */
  useEffect(() => {
    if (!selectedUser?._id) return

    const userId = selectedUser._id

    // Detect if this is actually a different user
    const isNewUser = prevSelectedUserIdRef.current !== userId
    prevSelectedUserIdRef.current = userId

    if (isNewUser) {
      // Show loading state so old messages don't flash
      setMessagesLoading(true)
      isLoadingMessagesRef.current = true
    }

    getMessages(userId).finally(() => {
      // Clear loading after fetch completes
      setMessagesLoading(false)
      isLoadingMessagesRef.current = false
    })
  }, [selectedUser?._id])  // only re-run when the actual ID changes

  /**
   * After messages load or change — handle scroll position.
   *
   * Two cases:
   *   A) Just switched user → jump instantly to bottom (no animation)
   *   B) New message arrived → smooth scroll IF near bottom
   */
  useEffect(() => {
    if (!Array.isArray(messages) || messages.length === 0) return
    if (messagesLoading) return

    if (isLoadingMessagesRef.current) return

    // Small timeout to let React finish painting the new messages into DOM
    // Without this, scrollHeight is measured before new messages are rendered
    const t = setTimeout(() => {
      const container = scrollContainerRef.current
      if (!container) return

      // Always jump instantly when switching users
      if (prevSelectedUserIdRef.current !== null) {
        jumpToBottom()
        return
      }

      // For incoming messages: only scroll if near bottom
      if (isNearBottom()) {
        smoothScrollToBottom()
      }
    }, 50)

    return () => clearTimeout(t)
  }, [messages, messagesLoading, jumpToBottom, smoothScrollToBottom, isNearBottom])

  /**
   * Jump to bottom immediately when loading finishes.
   * This is the KEY fix for "shows first message instead of last".
   */
  useEffect(() => {
    if (messagesLoading) return
    if (!Array.isArray(messages) || messages.length === 0) return

    // Use double RAF to ensure DOM has fully painted before measuring
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        jumpToBottom()
      })
    })

    return () => cancelAnimationFrame(rafId)
  }, [messagesLoading]) // Only fires when loading state changes to false

  // ══════════════════════════════════════════════════════════════════════════
  // UNMOUNT CLEANUP
  // ══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      clearTimeout(scrollTimeoutRef.current)
      cleanupCall()
    }
  }, [cleanupCall])

  // ══════════════════════════════════════════════════════════════════════════
  // MESSAGE HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  const handleSendMessage = useCallback(
    async (e) => {
      e?.preventDefault?.()
      const text = input.trim()
      if (!text) return
      await sendMessage({ text })
      setInput('')
      // Always jump to bottom after sending
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          jumpToBottom()
        })
      })
    },
    [input, sendMessage, jumpToBottom]
  )

  const handleSendImage = useCallback(
    (e) => {
      const file = e.target.files?.[0]
      if (!file?.type.startsWith('image/')) {
        return toast.error('Please select an image file')
      }
      const reader = new FileReader()
      reader.onloadend = async () => {
        await sendMessage({ image: reader.result })
        e.target.value = ''
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            jumpToBottom()
          })
        })
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
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
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
          className={`
            flex-shrink-0 px-3 py-1.5 rounded-full text-white text-xs
            font-medium transition-all duration-200 whitespace-nowrap
            ${
              callStarted
                ? 'bg-gray-500 cursor-not-allowed opacity-50'
                : 'bg-green-500 hover:bg-green-600 active:scale-95'
            }
          `}
        >
          📞 Call
        </button>
        <img
          src={assets.help_icon}
          alt=''
          className='max-md:hidden w-5 flex-shrink-0'
        />
      </div>

      {/* ── Messages ───────────────────────────────────────────────────────── */}
      {/*
        scrollContainerRef — this element is what we scroll programmatically.
        minHeight: 0 — CRITICAL for flex children to scroll on all browsers.
        WebkitOverflowScrolling: touch — iOS momentum scroll.
        scrollbarWidth: none — hides scrollbar on Firefox without CSS class.
      */}
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
        {/* Loading skeleton */}
        {messagesLoading && (
          <div className='flex flex-col gap-3'>
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className={`flex items-end gap-2 ${
                  i % 2 === 0 ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div className='w-6 h-6 rounded-full bg-white/10 flex-shrink-0' />
                <div
                  className='h-8 rounded-2xl bg-white/10 animate-pulse'
                  style={{ width: `${40 + (i * 15) % 30}%` }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Messages */}
        {!messagesLoading && (
          <div className='flex flex-col gap-2'>
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
                const isOwn = msg.senderId === authUser?._id

                return (
                  <div
                    key={msg._id ?? index}
                    className={`flex items-end gap-2 w-full ${
                      isOwn ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    {/* Avatar */}
                    <img
                      src={
                        isOwn
                          ? authUser?.profilePic || assets.avatar_icon
                          : selectedUser?.profilePic || assets.avatar_icon
                      }
                      alt=''
                      className='w-6 h-6 rounded-full object-cover flex-shrink-0 self-end mb-4'
                    />

                    {/* Bubble + timestamp */}
                    <div
                      className={`flex flex-col gap-0.5 ${
                        isOwn ? 'items-end' : 'items-start'
                      }`}
                      style={{ maxWidth: '70%' }}
                    >
                      {msg.image ? (
                        <img
                          src={msg.image}
                          alt='Shared'
                          className='rounded-2xl object-cover border border-white/10'
                          style={{ maxWidth: '100%' }}
                        />
                      ) : (
                        <p
                          className={`
                            px-3 py-2 rounded-2xl text-sm leading-relaxed break-words
                            ${
                              isOwn
                                ? 'bg-violet-500/80 text-white rounded-br-sm'
                                : 'bg-white/10 text-gray-100 rounded-bl-sm'
                            }
                          `}
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

            {/* Bottom anchor */}
            <div ref={scrollEnd} />
          </div>
        )}
      </div>

      {/* ── Input Bar ──────────────────────────────────────────────────────── */}
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
          />
          <input
            onChange={handleSendImage}
            type='file'
            id='image'
            accept='image/png, image/jpeg'
            hidden
          />
          <label htmlFor='image' className='cursor-pointer flex-shrink-0'>
            <img
              src={assets.gallery_icon}
              alt='Attach'
              className='w-5 h-5 opacity-60 hover:opacity-100 transition-opacity'
            />
          </label>
        </div>
        <button
          onClick={handleSendMessage}
          className='flex-shrink-0 w-9 h-9 flex items-center justify-center active:scale-90 transition-transform'
        >
          <img src={assets.send_button} alt='Send' className='w-8 h-8' />
        </button>
      </div>

      {/* ── Video Call Overlay ─────────────────────────────────────────────── */}
      {(callStarted || receivingCall) && (
        <VideoCall
          myVideo={myVideo}
          userVideo={userVideo}
          callAccepted={callAccepted}
          hasRemoteStream={!!remoteStream}
          endCall={endCall}
          callerName={callerName}
        />
      )}

      {/* ── Incoming Call Popup ────────────────────────────────────────────── */}
      <CallPopup
        receivingCall={receivingCall}
        callAccepted={callAccepted}
        answerCall={answerCall}
        declineCall={declineCall}
        callerName={callerName}
      />
    </div>
  )
}

export default ChatContainer