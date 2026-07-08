// src/lib/webrtc.js

/**
 * Creates a native RTCPeerConnection.
 * Intentionally SYNCHRONOUS — RTCPeerConnection constructor is not async.
 * Making it async caused a timing gap where ontrack/onicecandidate
 * could be set up too late.
 */
export const createPeerConnection = (config = {}) => {
  const iceServers = config.iceServers || [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // Free TURN servers for cross-network calls (replace with your own in prod)
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

/**
 * Safely attaches a MediaStream to a <video> HTMLElement.
 * Handles duplicate assignment, unmounted refs, and autoplay policy.
 *
 * @param {React.RefObject|HTMLVideoElement} target - ref or direct element
 * @param {MediaStream|null} stream
 * @param {{ muted?: boolean }} options
 */
export const attachStreamToVideo = async (target, stream, { muted = false } = {}) => {
  // Accept both a React ref and a raw element
  const el = target?.current ?? target

  if (!el) return

  if (!stream) {
    el.srcObject = null
    return
  }

  // Avoid reassigning the same stream — causes black flash
  if (el.srcObject === stream) {
    if (el.paused) {
      try { await el.play() } catch {}
    }
    return
  }

  el.srcObject = stream
  el.muted = muted

  try {
    await el.play()
  } catch (err) {
    // AbortError is fine — browser will play on next user gesture
    if (err.name !== 'AbortError') {
      console.warn('[attachStreamToVideo] play() error:', err.name, err.message)
    }
  }
}