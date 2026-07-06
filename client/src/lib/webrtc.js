export const createPeerConnection = async ({ iceServers }) => {
  const pc = new RTCPeerConnection({
    iceServers: iceServers || [{ urls: "stun:stun.l.google.com:19302" }],
  });

  return pc;
};

export const setVideoStream = (videoEl, stream) => {
  if (!videoEl) return;
  videoEl.srcObject = stream;
};

