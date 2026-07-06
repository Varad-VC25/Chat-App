import Peer from "simple-peer";

// simple-peer depends on Node core modules in some builds.
// Vite can externalize them, so we ensure the browser-compatible aliases
// exist via vite.config. This file centralizes the Peer creation
// so calling code stays clean.

export const createPeerInitiator = ({ stream }) =>
  new Peer({
    initiator: true,
    trickle: false,
    stream,
  });

export const createPeerAnswerer = ({ stream }) =>
  new Peer({
    initiator: false,
    trickle: false,
    stream,
  });

