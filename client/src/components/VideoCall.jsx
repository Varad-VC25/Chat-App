// src/components/VideoCall.jsx
import React, { useEffect, useRef, useCallback } from 'react'

const VideoCall = ({
  myVideo,
  userVideo,
  callAccepted,
  hasRemoteStream,
  endCall,
  callerName,
}) => {
  const localPlayAttempts = useRef(0)
  const remotePlayAttempts = useRef(0)
  const localRetryTimer = useRef(null)
  const remoteRetryTimer = useRef(null)
  const isMounted = useRef(true)

  // ── Universal play helper ───────────────────────────────────────────────
  // Handles autoplay policy on all browsers/devices:
  // - Chrome desktop: needs user gesture or muted autoplay
  // - Safari iOS: needs playsInline + muted for local, gesture for remote
  // - Firefox: needs explicit play() call
  // - Android Chrome: needs playsInline
  const tryPlay = useCallback(async (ref, label, maxAttempts = 15) => {
    if (!isMounted.current) return

    const el = ref?.current
    if (!el) return

    const stream = el.srcObject
    if (!stream) return

    // Check stream has at least one live track
    const tracks = stream.getTracks?.() ?? []
    if (!tracks.length) return

    const hasLiveTrack = tracks.some((t) => t.readyState === 'live')
    if (!hasLiveTrack) return

    // Already playing — nothing to do
    if (!el.paused) return

    try {
      await el.play()
      console.log(`[VideoCall] ${label} playing ✓`)
    } catch (err) {
      if (err.name === 'AbortError') {
        // Previous play() was interrupted — retry after a short delay
        const attempts =
          label === 'local' ? localPlayAttempts : remotePlayAttempts
        const timer =
          label === 'local' ? localRetryTimer : remoteRetryTimer

        if (attempts.current < maxAttempts) {
          attempts.current += 1
          timer.current = setTimeout(() => {
            tryPlay(ref, label, maxAttempts)
          }, 300)
        }
      } else if (err.name === 'NotAllowedError') {
        // Autoplay blocked — will play on next user interaction
        console.warn(`[VideoCall] ${label} autoplay blocked — waiting for gesture`)
      } else {
        console.warn(`[VideoCall] ${label} play() error:`, err.name, err.message)
      }
    }
  }, [])

  // ── Retry play on any call state change ────────────────────────────────
  useEffect(() => {
    if (!isMounted.current) return

    // Reset attempt counters on state change
    localPlayAttempts.current = 0
    remotePlayAttempts.current = 0

    // Staggered attempts — gives DOM time to mount video elements
    // and browser time to attach srcObject before calling play()
    const t1 = setTimeout(() => tryPlay(myVideo, 'local'), 100)
    const t2 = setTimeout(() => tryPlay(myVideo, 'local'), 500)
    const t3 = setTimeout(() => tryPlay(myVideo, 'local'), 1000)

    const t4 = setTimeout(() => tryPlay(userVideo, 'remote'), 200)
    const t5 = setTimeout(() => tryPlay(userVideo, 'remote'), 600)
    const t6 = setTimeout(() => tryPlay(userVideo, 'remote'), 1200)

    return () => {
      ;[t1, t2, t3, t4, t5, t6].forEach(clearTimeout)
    }
  }, [callAccepted, hasRemoteStream, myVideo, userVideo, tryPlay])

  // ── Handle user gesture to unblock autoplay ────────────────────────────
  // On iOS Safari and some Android browsers, video.play() throws
  // NotAllowedError until a user gesture has been made.
  // Tapping anywhere on the call screen counts as a gesture.
  const handleScreenTap = useCallback(() => {
    tryPlay(myVideo, 'local')
    tryPlay(userVideo, 'remote')
  }, [myVideo, userVideo, tryPlay])

  // ── Cleanup timers on unmount ───────────────────────────────────────────
  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      clearTimeout(localRetryTimer.current)
      clearTimeout(remoteRetryTimer.current)
    }
  }, [])

  return (
    /*
      Full screen overlay.
      onClick = unblocks autoplay on first tap (iOS Safari / Android)
    */
    <div
      className='absolute inset-0 z-50 flex flex-col bg-black'
      onClick={handleScreenTap}
      style={{ touchAction: 'manipulation' }} // Prevent 300ms tap delay on mobile
    >

      {/* ── Remote video (full screen background) ──────────────────────── */}
      {/*
        Always rendered — never conditionally mounted.
        Conditional mounting causes ref to be null when stream arrives,
        resulting in black screen. We show/hide with opacity instead.
      */}
      <div className='relative w-full h-full'>

        {/* Remote video — full screen */}
        <video
          ref={userVideo}
          autoPlay
          playsInline       // Required on iOS — without this video never plays
          // NO muted — remote audio must be heard
          className={`
            w-full h-full object-cover
            transition-opacity duration-500
            ${hasRemoteStream && callAccepted ? 'opacity-100' : 'opacity-0'}
          `}
          style={{
            // Force hardware acceleration — prevents black screen on some Android
            transform: 'translateZ(0)',
            WebkitTransform: 'translateZ(0)',
            // Prevent iOS from going fullscreen on double-tap
            WebkitUserSelect: 'none',
          }}
          // Fallback: if autoPlay doesn't trigger, play on loadedmetadata
          onLoadedMetadata={(e) => {
            e.target.play().catch(() => {})
          }}
          onCanPlay={(e) => {
            if (e.target.paused) e.target.play().catch(() => {})
          }}
        />

        {/* Waiting placeholder — shown while remote stream loads */}
        {(!hasRemoteStream || !callAccepted) && (
          <div className='absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-900'>
            <div className='w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center'>
              <span className='text-5xl'>👤</span>
            </div>
            <p className='text-white text-base font-medium'>
              {callAccepted
                ? 'Connecting video...'
                : `Calling ${callerName || 'user'}...`}
            </p>
            {/* Animated dots */}
            <div className='flex gap-2'>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className='w-2.5 h-2.5 bg-green-400 rounded-full animate-bounce'
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
            <p className='text-gray-500 text-xs mt-2'>
              Tap screen if video doesn't start
            </p>
          </div>
        )}

        {/* Remote user name label */}
        {hasRemoteStream && callAccepted && (
          <div className='absolute top-4 left-4 bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full'>
            <p className='text-white text-xs font-medium'>
              {callerName || 'Remote User'}
            </p>
          </div>
        )}

        {/* ── Local video (picture-in-picture) ─────────────────────────── */}
        {/*
          Always rendered — opacity trick used here too.
          draggable=false prevents accidental drag on desktop.
          transform: scaleX(-1) mirrors local camera (feels natural).
        */}
        <div
          className='absolute bottom-24 right-3 rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl bg-gray-800'
          style={{
            width: 'clamp(90px, 25vw, 140px)',   // Responsive: 90px min, 25% screen, 140px max
            aspectRatio: '4/3',                   // Consistent ratio on all devices
          }}
        >
          <video
            ref={myVideo}
            autoPlay
            playsInline    // Required on iOS
            muted          // Local MUST be muted — prevents audio echo
            className='w-full h-full object-cover'
            style={{
              transform: 'scaleX(-1)',            // Mirror effect
              WebkitTransform: 'scaleX(-1)',
            }}
            onLoadedMetadata={(e) => {
              e.target.play().catch(() => {})
            }}
            onCanPlay={(e) => {
              if (e.target.paused) e.target.play().catch(() => {})
            }}
          />
          <div className='absolute bottom-1 left-0 right-0 flex justify-center'>
            <span className='text-white text-[10px] bg-black/40 px-2 rounded-full'>
              You
            </span>
          </div>
        </div>

        {/* ── Controls ─────────────────────────────────────────────────── */}
        <div className='absolute bottom-6 left-0 right-0 flex items-center justify-center gap-6'>
          {/* End Call */}
          <button
            onClick={(e) => {
              e.stopPropagation() // Prevent triggering handleScreenTap
              endCall()
            }}
            className='flex flex-col items-center gap-1.5 group'
            style={{ touchAction: 'manipulation' }}
          >
            <span
              className='
                w-14 h-14 rounded-full
                bg-red-500 group-hover:bg-red-600 group-active:bg-red-700
                flex items-center justify-center
                text-2xl shadow-lg
                transition-all duration-200
                active:scale-90
              '
            >
              📵
            </span>
            <span className='text-white text-xs font-medium'>End Call</span>
          </button>
        </div>

      </div>
    </div>
  )
}

export default VideoCall