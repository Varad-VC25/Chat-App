// src/components/VideoCall.jsx
import React, { useEffect, useRef, useCallback, useContext } from 'react'
import { AuthContext } from '../../context/AuthContext'

const VideoCall = ({
  myVideo,
  userVideo,
  callAccepted,
  hasRemoteStream,
  endCall,
  callerName,
}) => {
  const { authUser } = useContext(AuthContext)

  const localPlayAttempts = useRef(0)
  const remotePlayAttempts = useRef(0)
  const localRetryTimer = useRef(null)
  const remoteRetryTimer = useRef(null)
  const isMounted = useRef(true)

  // ── Universal play helper ─────────────────────────────────────────────
  const tryPlay = useCallback(async (ref, label, maxAttempts = 15) => {
    if (!isMounted.current) return
    const el = ref?.current
    if (!el?.srcObject) return
    const tracks = el.srcObject.getTracks?.() ?? []
    if (!tracks.some((t) => t.readyState === 'live')) return
    if (!el.paused) return

    try {
      await el.play()
    } catch (err) {
      if (err.name === 'AbortError') {
        const attempts = label === 'local' ? localPlayAttempts : remotePlayAttempts
        const timer = label === 'local' ? localRetryTimer : remoteRetryTimer
        if (attempts.current < maxAttempts) {
          attempts.current += 1
          timer.current = setTimeout(() => tryPlay(ref, label, maxAttempts), 300)
        }
      }
    }
  }, [])

  useEffect(() => {
    if (!isMounted.current) return
    localPlayAttempts.current = 0
    remotePlayAttempts.current = 0

    const timers = [
      setTimeout(() => tryPlay(myVideo, 'local'), 100),
      setTimeout(() => tryPlay(myVideo, 'local'), 500),
      setTimeout(() => tryPlay(myVideo, 'local'), 1000),
      setTimeout(() => tryPlay(userVideo, 'remote'), 200),
      setTimeout(() => tryPlay(userVideo, 'remote'), 600),
      setTimeout(() => tryPlay(userVideo, 'remote'), 1200),
    ]

    return () => timers.forEach(clearTimeout)
  }, [callAccepted, hasRemoteStream, myVideo, userVideo, tryPlay])

  const handleScreenTap = useCallback(() => {
    tryPlay(myVideo, 'local')
    tryPlay(userVideo, 'remote')
  }, [myVideo, userVideo, tryPlay])

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      clearTimeout(localRetryTimer.current)
      clearTimeout(remoteRetryTimer.current)
    }
  }, [])

  const myName = authUser?.fullName || 'You'
  const remoteName = callerName || 'Remote User'

  return (
    <div
      className='fixed inset-0 z-[90] flex flex-col bg-gray-950'
      onClick={handleScreenTap}
      style={{ touchAction: 'manipulation' }}
    >
      {/* ── Top bar with call status ─────────────────────────────────── */}
      <div className='flex-shrink-0 py-3 px-4 bg-black/40 backdrop-blur-sm border-b border-white/10'>
        <p className='text-white text-center text-sm font-medium'>
          {callAccepted ? '🟢 Connected' : `📞 Calling ${remoteName}...`}
        </p>
      </div>

      {/* ── Video boxes container ─────────────────────────────────────── */}
      <div className='flex-1 flex items-center justify-center p-4 overflow-hidden'>
        <div className='w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-4 h-full max-h-[70vh]'>

          {/* ── LOCAL VIDEO BOX (You) ────────────────────────────────── */}
          <div className='relative rounded-2xl overflow-hidden bg-gray-900 border-2 border-violet-500/50 shadow-2xl flex items-center justify-center'>
            <video
              ref={myVideo}
              autoPlay
              playsInline
              muted
              className='w-full h-full object-cover'
              style={{
                transform: 'scaleX(-1)',
                WebkitTransform: 'scaleX(-1)',
                maxHeight: '100%',
              }}
              onLoadedMetadata={(e) => e.target.play().catch(() => {})}
              onCanPlay={(e) => { if (e.target.paused) e.target.play().catch(() => {}) }}
            />

            <div className='absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full flex items-center gap-1.5'>
              <span className='w-2 h-2 bg-violet-400 rounded-full' />
              <p className='text-white text-xs font-medium'>{myName} (You)</p>
            </div>

            <div className='absolute top-3 right-3 bg-black/40 backdrop-blur-sm px-2 py-1 rounded-full'>
              <span className='text-xs'>📹</span>
            </div>
          </div>

          {/* ── REMOTE VIDEO BOX (Other user) ────────────────────────── */}
          <div className='relative rounded-2xl overflow-hidden bg-gray-900 border-2 border-green-500/50 shadow-2xl flex items-center justify-center'>
            <video
              ref={userVideo}
              autoPlay
              playsInline
              className={`w-full h-full object-cover transition-opacity duration-500 ${
                hasRemoteStream && callAccepted ? 'opacity-100' : 'opacity-0'
              }`}
              style={{
                transform: 'translateZ(0)',
                WebkitTransform: 'translateZ(0)',
                maxHeight: '100%',
              }}
              onLoadedMetadata={(e) => e.target.play().catch(() => {})}
              onCanPlay={(e) => { if (e.target.paused) e.target.play().catch(() => {}) }}
            />

            {(!hasRemoteStream || !callAccepted) && (
              <div className='absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900'>
                <div className='w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center'>
                  <span className='text-3xl'>👤</span>
                </div>
                <p className='text-white text-sm font-medium'>
                  {callAccepted ? 'Connecting...' : 'Ringing...'}
                </p>
                <div className='flex gap-1'>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className='w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce'
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className='absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full flex items-center gap-1.5'>
              <span className={`w-2 h-2 rounded-full ${hasRemoteStream && callAccepted ? 'bg-green-400' : 'bg-yellow-400'}`} />
              <p className='text-white text-xs font-medium'>{remoteName}</p>
            </div>

            {hasRemoteStream && callAccepted && (
              <div className='absolute top-3 right-3 bg-red-500/80 px-2 py-1 rounded-full flex items-center gap-1'>
                <span className='w-1.5 h-1.5 bg-white rounded-full animate-pulse' />
                <span className='text-white text-[10px] font-bold'>LIVE</span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Bottom controls ──────────────────────────────────────────── */}
      <div className='flex-shrink-0 py-6 px-4 bg-black/40 backdrop-blur-sm border-t border-white/10'>
        <div className='flex items-center justify-center gap-4'>
          <button
            onClick={(e) => { e.stopPropagation(); endCall() }}
            className='flex flex-col items-center gap-2 group'
            style={{ touchAction: 'manipulation' }}
          >
            <span className='w-14 h-14 md:w-16 md:h-16 rounded-full bg-red-500 group-hover:bg-red-600 group-active:bg-red-700 active:scale-90 flex items-center justify-center text-2xl md:text-3xl shadow-xl transition-all'>
              📵
            </span>
            <span className='text-white text-xs font-medium'>End Call</span>
          </button>
        </div>

        <p className='text-center text-gray-500 text-[11px] mt-3'>
          Tap screen if video does not appear
        </p>
      </div>
    </div>
  )
}

export default VideoCall