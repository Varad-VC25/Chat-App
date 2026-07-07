import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import assets from '../assets/assets'
import { formatMessageTime } from '../lib/utils'
import { ChatContext } from '../../context/ChatContext'
import { AuthContext } from '../../context/AuthContext'
import toast from 'react-hot-toast'

import VideoCall from './VideoCall'
import CallPopup from './CallPopup'
import { createPeerConnection } from '../lib/webrtc'

const ChatContainer = () => {
  const { messages, selectedUser, sendMessage, getMessages } = useContext(ChatContext)
  const { authUser, onlineUsers, socket } = useContext(AuthContext)

  const scrollEnd = useRef(null)

  const [input, setInput] = useState('')

  // UI state
  const [receivingCall, setReceivingCall] = useState(false)
  const [caller, setCaller] = useState('')
  const [callerName, setCallerName] = useState('')
  const [callerSignal, setCallerSignal] = useState(null)
  const [callAccepted, setCallAccepted] = useState(false)
  const [callStarted, setCallStarted] = useState(false)

  // Video elements
  const myVideo = useRef(null)
  const userVideo = useRef(null)

  // WebRTC refs (StrictMode-safe, no re-renders)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)

  // Remote stream state only for rendering guards (minimal)
  const [remoteStream, setRemoteStream] = useState(null)

  // Call lifecycle guards
  const activeCallIdRef = useRef(null)
  const phaseRef = useRef('idle') // idle | calling | ringing | connected | ending
  const isStartInFlightRef = useRef(false)
  const pendingAcceptedSignalRef = useRef(null)

  // WebRTC robustness refs
  const pendingIceCandidatesRef = useRef([])
  const activePeerIdRef = useRef(null)



  const prepareStream = async () => {
    // reuse existing local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => {
        t.enabled = true
      })

      if (myVideo.current) myVideo.current.srcObject = localStreamRef.current
      return localStreamRef.current
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })

      localStreamRef.current = mediaStream

console.log("Local stream ready");

console.log(mediaStream.getTracks());

if (myVideo.current) {
    myVideo.current.srcObject = mediaStream;
}

      return mediaStream
    } catch (e) {
      console.log(e)
      toast.error('Camera/Microphone permission denied')
      return null
    }
  }


const cleanupCall = () => {
    // stop local tracks
    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks().forEach((t) => t.stop())
      } catch {}
      localStreamRef.current = null
    }

    // close peer connection
    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null
        pcRef.current.onicecandidate = null
        pcRef.current.onconnectionstatechange = null
        pcRef.current.close()
      } catch {}
      pcRef.current = null
    }

    // detach streams from video elements
    if (myVideo.current) myVideo.current.srcObject = null
    if (userVideo.current) userVideo.current.srcObject = null

    remoteStreamRef.current = null
    setRemoteStream(null)

    pendingAcceptedSignalRef.current = null
    activeCallIdRef.current = null
    phaseRef.current = 'idle'

    setCallAccepted(false)
    setCallStarted(false)
    setReceivingCall(false)

    setCaller('')
    setCallerSignal(null)
  }

  useEffect(() => {
  if (callStarted && myVideo.current && localStreamRef.current) {
    console.log("Attaching local stream");

    myVideo.current.srcObject = localStreamRef.current;

    requestAnimationFrame(() => {
    myVideo.current?.play().catch(console.error);
});
  }
}, [callStarted]);

  useEffect(() => {
    if (selectedUser) getMessages(selectedUser._id)
  }, [selectedUser, getMessages])

  useEffect(() => {
    if (scrollEnd.current && messages) {
      scrollEnd.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  useEffect(() => {
    if (!socket) return

    const handleEndCall = () => {
      cleanupCall()
      toast.success('Call ended')
    }

    const flushPendingIceCandidates = async () => {
      const pc = pcRef.current
      if (!pc) return
      if (!pc.remoteDescription) return

      const queue = pendingIceCandidatesRef.current
      if (!queue.length) return

      pendingIceCandidatesRef.current = []
      for (const cand of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand))
        } catch (e) {
          console.warn('[WebRTC] addIceCandidate flush error', e)
        }
      }
    }

    const handleIceCandidate = async ({ candidate }) => {
      try {
        if (!candidate) return
        const pc = pcRef.current

        // Buffer until PC exists and remoteDescription is set.
        if (!pc || !pc.remoteDescription) {
          pendingIceCandidatesRef.current.push(candidate)
          return
        }

        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.log('ICE candidate error', err)
      }
    }



    const handleIncomingCall = ({ from, offer, callerName }) => {
      const senderName = callerName?.trim() || 'Unknown User'

      setReceivingCall(true)
      setCaller(from)
      setCallerName(senderName)
      setCallerSignal(offer)
      activePeerIdRef.current = from


      toast.success(`Incoming call from ${senderName}..!!`)
    }

    const handleCallAccepted = async ({ answer }) => {
      if (!answer) {
        toast.error('Call accepted but missing answer.')
        return
      }

      if (!pcRef.current) {
        pendingAcceptedSignalRef.current = answer
        return
      }

      // StrictMode-safe: ignore if call already ended/changed.
      // If we haven't set activeCallIdRef yet (first accept after incoming-call),
      // allow it to proceed.
      if (activeCallIdRef.current === null) {
        activeCallIdRef.current = `${socket.id}`
      }


      setCallAccepted(true)
      setCallStarted(true)
      setReceivingCall(false)

      try {
        await pcRef.current.setRemoteDescription(answer)
        // flush ICE candidates that may have arrived before remoteDescription
        await flushPendingIceCandidates()
      } catch (e) {
        console.warn('Failed to set remote description from buffered answer', e)
      }


    }

    const handleCallError = (data) => {
      toast.error(data?.message || 'Call failed.')
    }

    const handleConnectError = (error) => {
      console.error('Socket connect error', error)
      toast.error('Socket connection failed for call.')
    }

    socket.on('end-call', handleEndCall)
    socket.on('ice-candidate', handleIceCandidate)
    socket.on('incoming-call', handleIncomingCall)
    socket.on('call-accepted', handleCallAccepted)
    socket.on('call-error', handleCallError)
    socket.on('connect_error', handleConnectError)

    return () => {
      socket.off('end-call', handleEndCall)
      socket.off('ice-candidate', handleIceCandidate)
      socket.off('incoming-call', handleIncomingCall)
      socket.off('call-accepted', handleCallAccepted)
      socket.off('call-error', handleCallError)
      socket.off('connect_error', handleConnectError)
    }
  }, [socket])

  // bind remote stream to video element after it mounts.
  // NOTE: we intentionally do NOT call play() here.
  // VideoCall.jsx owns autoplay attempts to avoid duplicate play() calls.
  


  const emitWhenConnected = (event, payload) => {
    if (!socket) return

    if (socket.connected) {
      socket.emit(event, payload)
      return
    }

    const handleConnect = () => {
      socket.emit(event, payload)
      socket.off('connect', handleConnect)
    }

    socket.on('connect', handleConnect)
    socket.connect()
  }

  const startCall = async (id) => {
    console.log('[Call] startCall invoked', {
      id,
      callStarted,
      selectedUserId: selectedUser?._id,
      authUserId: authUser?._id,
      socketConnected: socket?.connected,
    })

    if (!socket) {
      toast.error('Connecting to call server. Please wait a moment.')
      return
    }

    if (callStarted) return
    if (!selectedUser?._id) return toast.error('Missing selected user.')
    if (!authUser?._id) return toast.error('Missing auth user.')

    const currentStream = await prepareStream()
    console.log('[Call] local stream ready', {
      hasStream: !!currentStream,
      tracks: currentStream?.getTracks?.().map((t) => `${t.kind}:${t.readyState}`),
    })
    if (!currentStream) {
      toast.error('Failed to access camera/microphone')
      return
    }


    if (pcRef.current) {
      try {
        pcRef.current.close()
      } catch {}
      pcRef.current = null
    }


    const pc = await createPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })

    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      socket.emit('ice-candidate', {
        to: id,
        from: authUser._id,
        candidate: event.candidate,
      })
    }

    pc.ontrack = (event) => {
      const [nextRemoteStream] = event.streams
      console.log('[WebRTC][caller] ontrack', {
        kind: event.track?.kind,
        remoteStreamExists: !!nextRemoteStream,
        streamsLen: event.streams?.length,
        trackEnabled: event.track?.enabled,
        pcState: pc.connectionState,
        iceState: pc.iceConnectionState,
      })

     if (nextRemoteStream) {
    remoteStreamRef.current = nextRemoteStream;

    setRemoteStream(nextRemoteStream);

    if (userVideo.current) {
        userVideo.current.srcObject = nextRemoteStream;

        userVideo.current.play().catch(console.error);
    }
}
    }


    currentStream.getTracks().forEach((track) => pc.addTrack(track, currentStream))



    pcRef.current = pc

    setReceivingCall(false)

    setCallStarted(true)
    setCallAccepted(false)

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    emitWhenConnected('call-user', {
      userToCall: id,
      from: authUser._id,
      callerName: authUser.fullName,
      offer: pc.localDescription,
    })

    if (pendingAcceptedSignalRef.current) {
      const bufferedAnswer = pendingAcceptedSignalRef.current
      pendingAcceptedSignalRef.current = null
      try {
        await pc.setRemoteDescription(bufferedAnswer)
      } catch (e) {
        console.warn('Failed to apply buffered answer', e)
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') toast.error('Call connection failed')
    }
  }

  const declineCall = () => {
    try {
      if (socket) {
    const target = activePeerIdRef.current || caller || selectedUser?._id

        if (target) socket.emit('end-call', { to: target })
      }
    } catch {}

    cleanupCall()
    toast.success('Call declined')
  }


  const answerCall = async () => {
    if (!socket)
      return toast.error('Connecting to call server. Please wait a moment.')
    if (!caller) return toast.error('Caller missing. Cannot accept call.')
    if (!callerSignal)
      return toast.error('Caller offer not received yet. Please wait.')

    console.log('[WebRTC] answerCall start', {
      caller,
      hasCallerSignal: !!callerSignal,
    })

    const currentStream = await prepareStream()
    if (!currentStream) return toast.error('Failed to access camera/microphone')

    setCallStarted(true)
    setReceivingCall(false)
    setCallAccepted(true)

    if (pcRef.current) {
      try {
        pcRef.current.close?.()
      } catch {}
      pcRef.current = null
    }


    const pc = await createPeerConnection({
      // Keep it production-safe: default to STUN. Add TURN via real config/env in your deployment.
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })


    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] callee connectionState:', pc.connectionState)
      if (pc.connectionState === 'failed') toast.error('Call connection failed')
    }

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] callee iceConnectionState:', pc.iceConnectionState)
    }

    pc.onicegatheringstatechange = () => {
      console.log('[WebRTC] callee iceGatheringState:', pc.iceGatheringState)
    }


    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      socket.emit('ice-candidate', {
        to: caller,
        from: authUser._id,
        candidate: event.candidate,
      })
    }

    pc.ontrack = (event) => {
  console.log("Receiver got remote stream");

  const stream = event.streams[0];

  if (!stream) return;

  remoteStreamRef.current = stream;

  setRemoteStream(stream);

  if (userVideo.current) {
    if (userVideo.current.srcObject !== stream) {
    userVideo.current.srcObject = stream;
}

requestAnimationFrame(() => {
    userVideo.current?.play().catch(console.error);
});
  }
}

    currentStream.getTracks().forEach((track) => pc.addTrack(track, currentStream))

    pcRef.current = pc


    await pc.setRemoteDescription(callerSignal)

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    socket.emit('answer-call', {
      to: caller,
      answer: pc.localDescription,
    })
  }

  const endCall = () => {
    if (socket) {
      const target = caller || selectedUser?._id
      if (target) socket.emit('end-call', { to: target })
    }

    cleanupCall()
  }

  const handleSendMessage = async (e) => {
    e?.preventDefault?.()
    if (input.trim() === '') return
    await sendMessage({ text: input.trim() })
    setInput('')
  }

  const handleSendImage = async (e) => {
    const file = e.target.files[0]
    if (!file || !file.type.startsWith('image/')) {
      toast.error('Select an image file')
      return
    }

    const reader = new FileReader()
    reader.onloadend = async () => {
      await sendMessage({ image: reader.result })
      e.target.value = ''
    }
    reader.readAsDataURL(file)
  }

  return selectedUser ? (
    <div className='h-full overflow-hidden relative backdrop-blur-lg'>
      <div className='flex items-center gap-3 py-3 mx-4 border-b border-stone-500'>
        <img
          src={selectedUser.profilePic || assets.avatar_icon}
          alt='profile'
          className='w-8 rounded-full'
        />
        <p className='flex-1 text-lg text-white flex items-center gap-2'>
          {selectedUser.fullName}
          {onlineUsers.includes(String(selectedUser._id)) && (
            <span className='w-2 h-2 rounded-full bg-green-500'></span>
          )}
        </p>
        <img
          onClick={() => setSelectedUser(null)}
          src={assets.arrow_icon}
          alt=''
          className='md:hidden w-7'
        />
        <button
          onClick={() => startCall(selectedUser._id)}
          disabled={callStarted}
          className={`px-4 py-2 rounded-full text-white text-sm ${
            callStarted
              ? 'bg-gray-500 cursor-not-allowed'
              : 'bg-green-500 hover:bg-green-600'
          }`}
        >
          Call
        </button>
        <img src={assets.help_icon} alt='' className='max-md:hidden w-5' />
      </div>

      <div className='flex flex-col h-[calc(100%-120px)] overflow-y-scroll p-3 pb-24'>
        {messages.map((msg, index) => {
          const isOwnMessage = msg.senderId === authUser._id
          return (
            <div
              key={index}
              className={`flex items-end gap-2 ${
                isOwnMessage ? 'justify-end' : 'justify-start'
              }`}
            >
              {!isOwnMessage && (
                <img
                  src={selectedUser?.profilePic || assets.avatar_icon}
                  alt=''
                  className='w-7 rounded-full'
                />
              )}
              {msg.image ? (
                <img
                  src={msg.image}
                  alt=''
                  className='max-w-[230px] border border-gray-700 rounded-lg overflow-hidden mb-8'
                />
              ) : (
                <p
                  className={`p-3 rounded-xl max-w-[200px] md:text-sm font-light mb-8 break-all ${
                    isOwnMessage
                      ? 'bg-violet-500/70 text-white rounded-br-none'
                      : 'bg-white/10 text-gray-100 rounded-bl-none'
                  }`}
                >
                  {msg.text}
                </p>
              )}
              {isOwnMessage && (
                <img
                  src={authUser?.profilePic || assets.avatar_icon}
                  alt=''
                  className='w-7 rounded-full'
                />
              )}
              <div className='text-center text-[10px] text-gray-400'>
                <p>{formatMessageTime(msg.createdAt)}</p>
              </div>
            </div>
          )
        })}
        <div ref={scrollEnd}></div>
      </div>

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

      <CallPopup
        receivingCall={receivingCall}
        callAccepted={callAccepted}
        answerCall={answerCall}
        declineCall={declineCall}
        callerName={callerName}
      />

      <div className='absolute bottom-0 left-0 right-0 flex items-center gap-3 p-3'>
        <div className='flex-1 flex items-center bg-gray-100/12 px-3 rounded-full'>
          <input
            onChange={(e) => setInput(e.target.value)}
            value={input}
            onKeyDown={(e) => (e.key === 'Enter' ? handleSendMessage(e) : null)}
            type='text'
            placeholder='Send a message'
            className='flex-1 text-sm p-3 border-none rounded-lg outline-none text-white placeholder-gray-400'
          />
          <input
            onChange={handleSendImage}
            type='file'
            id='image'
            accept='image/png, image/jpeg'
            hidden
          />
          <label htmlFor='image'>
            <img
              src={assets.gallery_icon}
              alt=''
              className='w-5 mr-2 cursor-pointer'
            />
          </label>
        </div>
        <img onClick={handleSendMessage} src={assets.send_button} alt='' className='w-7 cursor-pointer' />
      </div>
    </div>
  ) : (
    <div className='flex flex-col justify-center items-center gap-2 text-gray-500 bg-white/10 max-md:hidden'>
      <img src={assets.logo_icon} alt='' className='max-w-16' />
      <p className='text-white font-medium text-lg'>Chat anytime, anywhere</p>
    </div>
  )
}

export default ChatContainer

