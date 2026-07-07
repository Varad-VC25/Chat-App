export const createPeerConnection = async ({ iceServers }) => {
  const pc = new RTCPeerConnection({
    iceServers: iceServers || [{ urls: "stun:stun.l.google.com:19302" }],
  });

  return pc;
};

const transceivers = pc.getTransceivers();

transceivers.forEach((transceiver) => {
  if (
    transceiver.sender &&
    transceiver.sender.track &&
    transceiver.sender.track.kind === "video"
  ) {
    const capabilities =
      RTCRtpSender.getCapabilities("video");

    if (!capabilities) return;

    const vp8Codec = capabilities.codecs.find(
      (c) => c.mimeType === "video/VP8"
    );

    if (vp8Codec) {
      transceiver.setCodecPreferences([vp8Codec]);
    }
  }
});

export const setVideoStream = (videoEl, stream) => {
  if (!videoEl) return;
  videoEl.srcObject = stream;
};

