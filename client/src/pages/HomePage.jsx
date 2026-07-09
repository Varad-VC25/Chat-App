import React, { useContext, useState, useCallback, useRef, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import ChatContainer from '../components/ChatContainer'
import RightSidebar from '../components/RightSidebar'
import VideoCall from '../components/VideoCall'
import CallPopup from '../components/CallPopup'
import { ChatContext } from '../../context/ChatContext'

const HomePage = () => {
  const { selectedUser } = useContext(ChatContext)

  // ── Call state lives HERE so VideoCall + CallPopup
  //    render at page level, NOT inside the chat grid ──────────────────────
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

  // Video refs created here — passed to both ChatContainer and VideoCall
  const myVideo = useRef(null)
  const userVideo = useRef(null)

  // Call handler refs — ChatContainer sets these so HomePage can call them
  const callHandlersRef = useRef({
    endCall: () => {},
    answerCall: () => {},
    declineCall: () => {},
  })

  const registerCallHandlers = useCallback((handlers) => {
    callHandlersRef.current = handlers
  }, [])

  const { callStarted, callAccepted, receivingCall } = callState
  const { callerName } = callerInfo

  return (
    <>
      {/* ── Main layout ─────────────────────────────────────────────────── */}
      <div className='w-full h-screen overflow-hidden sm:px-[15%] sm:py-[5%]'>
        <div
          className={`
            h-full backdrop-blur-xl border-2 border-gray-600
            rounded-2xl overflow-hidden grid grid-cols-1 relative
            ${
              selectedUser
                ? 'md:grid-cols-[1fr_1.5fr_1fr] xl:grid-cols-[1fr_2fr_1fr]'
                : 'md:grid-cols-2'
            }
          `}
        >
          <Sidebar />
          <ChatContainer
            // Pass refs down so ChatContainer can attach streams
            myVideo={myVideo}
            userVideo={userVideo}
            // Pass state setters down so ChatContainer can update HomePage state
            setCallState={setCallState}
            setCallerInfo={setCallerInfo}
            setRemoteStream={setRemoteStream}
            callState={callState}
            callerInfo={callerInfo}
            remoteStream={remoteStream}
            // Register handlers so HomePage buttons can trigger them
            registerCallHandlers={registerCallHandlers}
          />
          <RightSidebar />
        </div>
      </div>

      {/*
        ── Overlays rendered at PAGE level ───────────────────────────────
        fixed = full screen, outside the grid, works on any device
        z-[90] VideoCall sits below z-[100] CallPopup
      */}

      {/* Video call full screen overlay */}
      {(callStarted || receivingCall) && (
        <VideoCall
          myVideo={myVideo}
          userVideo={userVideo}
          callAccepted={callAccepted}
          hasRemoteStream={!!remoteStream}
          endCall={() => callHandlersRef.current.endCall()}
          callerName={callerName}
        />
      )}

      {/* Incoming call popup — shows regardless of which chat is open */}
      <CallPopup
        receivingCall={receivingCall}
        callAccepted={callAccepted}
        answerCall={() => callHandlersRef.current.answerCall()}
        declineCall={() => callHandlersRef.current.declineCall()}
        callerName={callerName}
      />
    </>
  )
}

export default HomePage