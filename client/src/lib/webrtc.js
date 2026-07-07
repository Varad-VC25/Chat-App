export const createPeerConnection = async ({ iceServers }) => {
  const pc = new RTCPeerConnection({
    iceServers: iceServers || [{ urls: "stun:stun.l.google.com:19302" }],
  });

  // Help codec compatibility by preferring VP8 once transceivers exist.
  // Transceivers are not guaranteed immediately after pc creation, so we apply
  // preferences lazily and idempotently.
  const applyVideoCodecPreferences = () => {
    try {
      const transceivers = pc.getTransceivers?.() || [];
      const capabilities = RTCRtpSender.getCapabilities?.("video");
      if (!capabilities) return;

      const vp8Codec = capabilities.codecs?.find(
        (c) => c.mimeType === "video/VP8"
      );
      if (!vp8Codec) return;

      transceivers.forEach((transceiver) => {
        if (
          transceiver?.sender?.track?.kind === "video" &&
          transceiver.setCodecPreferences
        ) {
          transceiver.setCodecPreferences([vp8Codec]);
        }
      });
    } catch {}
  };

  // Apply right away, and again shortly after setup.
  applyVideoCodecPreferences();
  setTimeout(applyVideoCodecPreferences, 0);

  return pc;
};

export const setVideoStream = (videoEl, stream) => {
  if (!videoEl) return;
  videoEl.srcObject = stream;
};



