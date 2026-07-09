// src/lib/webrtc.js

export const createPeerConnection = (config = {}) => {
  const iceServers = config.iceServers || [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
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
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ]

  const pc = new RTCPeerConnection({
    iceServers,
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  })

  return pc
}

export const attachStreamToVideo = async (target, stream, { muted = false } = {}) => {
  // ✅ Unwrap React ref
  const el = target?.current ?? target

  // ✅ CRITICAL — must be real HTMLVideoElement
  if (!el) {
    console.warn('[attachStreamToVideo] No element')
    return
  }

  // ✅ Check it has play() before calling it
  if (typeof el.play !== 'function') {
    console.warn('[attachStreamToVideo] Not a video element:', typeof el, el)
    return
  }

  if (!stream) {
    el.srcObject = null
    return
  }

  const tracks = stream.getTracks?.() ?? []
  const hasLiveTracks = tracks.length > 0 && tracks.some((t) => t.readyState === 'live')
  if (!hasLiveTracks) {
    console.warn('[attachStreamToVideo] No live tracks')
    return
  }

  if (el.srcObject === stream) {
    if (el.paused) {
      try { await el.play() } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('[attachStreamToVideo] play() error (same stream):', err.message)
        }
      }
    }
    return
  }

  el.muted = muted
  el.srcObject = stream

  if (el.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise((resolve) => {
      const onMeta = () => {
        el.removeEventListener('loadedmetadata', onMeta)
        resolve()
      }
      el.addEventListener('loadedmetadata', onMeta)
      setTimeout(resolve, 2000)
    })
  }

  try {
    await el.play()
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('[attachStreamToVideo] play() error:', err.name, err.message)
    }
  }
}