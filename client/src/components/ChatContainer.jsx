import React, { useContext, useEffect, useRef, useState } from 'react'
import assets from '../assets/assets'
import { formatMessageTime } from '../lib/utils'
import { ChatContext } from '../../context/ChatContext'
import { AuthContext } from '../../context/AuthContext'
import toast from 'react-hot-toast'

import VideoCall from './VideoCall';
import CallPopup from './CallPopup';
import { createPeerConnection, setVideoStream } from '../lib/webrtc';





const ChatContainer = () => {

    const { messages, selectedUser, setSelectedUser, sendMessage, getMessages } = useContext(ChatContext)

    const { authUser, onlineUsers, socket } = useContext(AuthContext)
  
    const scrollEnd = useRef()

    const [input, setInput] = useState('');

    const [stream, setStream] = useState(null);
    const [socketConnected, setSocketConnected] = useState(false);
    const [receivingCall, setReceivingCall] = useState(false);

    const [caller, setCaller] = useState("");
    const [callerName, setCallerName] = useState("");
    const [callerSignal, setCallerSignal] = useState();
    const [callAccepted, setCallAccepted] = useState(false);
    const [callStarted, setCallStarted] = useState(false);


    const myVideo = useRef();
    const userVideo = useRef();
    const connectionRef = useRef(null);

    // Buffer accepted signal in case it arrives before we create the peer instance.
    const pendingAcceptedSignalRef = useRef(null);


    // Handle sending a message
  const handleSendMessage = async (e)=>{
      e?.preventDefault?.();
      if(input.trim() === "") return null;

      await sendMessage({text: input.trim()});
      setInput("")
    }

    // Handle sending an image
    const handleSendImage = async (e)=>{
      const file = e.target.files[0];
      if(!file || !file.type.startsWith("image/")){
        toast.error("Select an image file")
        return;
      }
      const reader = new FileReader();

      reader.onloadend = async ()=>{
        await sendMessage({image: reader.result})
        e.target.value = ""
      }
      reader.readAsDataURL(file)
    }

    useEffect(()=>{
      if(selectedUser){
        getMessages(selectedUser._id)
      }
    },[selectedUser])
  
    useEffect(() => {  
        if(scrollEnd.current && messages) {
            scrollEnd.current.scrollIntoView({ behavior: 'smooth' })
        }
    },[messages])

   
const prepareStream = async () => {

  // already exists
  if (stream) {

  stream.getTracks().forEach((track) => {
    track.enabled = true;
  });

  if (myVideo.current) {
    myVideo.current.srcObject = stream;
  }

  return stream;
}
  try {

    const mediaStream =
      await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

    setStream(mediaStream);

    if (myVideo.current) {
      myVideo.current.srcObject = mediaStream;
    }

    return mediaStream;

  } catch (error) {

    console.log(error);

    toast.error(
      "Camera/Microphone permission denied"
    );

    return null;
  }
};

 useEffect(() => {
  if (!socket) return;

  // =========================
  // Call End
  // =========================
  const handleEndCall = () => {
    cleanupCall();
    toast.success("Call ended");
  };

  // =========================
  // ICE Candidate
  // =========================
  const handleIceCandidate = async ({ candidate }) => {
    try {
      if (candidate && connectionRef.current) {
        await connectionRef.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      }
    } catch (err) {
      console.log("ICE candidate error", err);
    }
  };

  // =========================
  // Socket Connection
  // =========================
  setSocketConnected(socket.connected);

  const handleConnect = () => setSocketConnected(true);

  const handleDisconnect = () => {
    setSocketConnected(false);
  };

  // =========================
  // Incoming Call
  // =========================
  const handleIncomingCall = ({
  from,
  offer,
  to,
  callerName,
}) => {

  console.log("incoming-call", from, offer, to);

  const senderName =
    callerName?.trim() || "Unknown User";

  setReceivingCall(true);
  setCaller(from);
  setCallerName(senderName);
  setCallerSignal(offer);

  toast.success(`Incoming call from ${senderName}..!!`);
};


  // =========================
  // Call Accepted
  // =========================
  const handleCallAccepted = async ({ answer }) => {
    console.log("call-accepted", answer);

    if (!answer) {
      toast.error("Call accepted but missing answer.");
      return;
    }

    // Peer not ready yet
    if (!connectionRef.current) {
      console.warn(
        "call-accepted received but peer is not ready yet; buffering answer"
      );

      pendingAcceptedSignalRef.current = answer;
      return;
    }

    setCallAccepted(true);
    setCallStarted(true);
    setReceivingCall(false);

    try {
      await connectionRef.current.setRemoteDescription(answer);
    } catch (e) {
      console.warn(
        "Failed to set remote description from buffered answer",
        e
      );
    }
  };

  // =========================
  // Errors
  // =========================
  const handleCallError = (data) => {
    toast.error(data?.message || "Call failed.");
  };

  const handleConnectError = (error) => {
    console.error("Socket connect error", error);
    toast.error("Socket connection failed for call.");
  };

  // =========================
  // Register Events
  // =========================
  socket.on("end-call", handleEndCall);
  socket.on("ice-candidate", handleIceCandidate);

  socket.on("connect", handleConnect);
  socket.on("disconnect", handleDisconnect);

  socket.on("incoming-call", handleIncomingCall);
  socket.on("call-accepted", handleCallAccepted);

  socket.on("call-error", handleCallError);
  socket.on("connect_error", handleConnectError);

  // =========================
  // Cleanup
  // =========================
  return () => {
    socket.off("end-call", handleEndCall);
    socket.off("ice-candidate", handleIceCandidate);

    socket.off("connect", handleConnect);
    socket.off("disconnect", handleDisconnect);

    socket.off("incoming-call", handleIncomingCall);
    socket.off("call-accepted", handleCallAccepted);

    socket.off("call-error", handleCallError);
    socket.off("connect_error", handleConnectError);
  };
}, [socket]);

    const emitWhenConnected = (event, payload) => {
      if (!socket) return;
      if (socket.connected) {
        socket.emit(event, payload);
        return;
      }

      const handleConnect = () => {
        socket.emit(event, payload);
        socket.off("connect", handleConnect);
      };

      socket.on("connect", handleConnect);
      socket.connect();
    };

      const startCall = async (id) => {
      if (!socket) {
        toast.error("Connecting to call server. Please wait a moment.");
        return;
      }

      // prevent repeated clicks while permission prompt / setup is in progress
      if (callStarted) return;

      if (!selectedUser?._id) {
        toast.error("Missing selected user.");
        return;
      }

      if (!authUser?._id) {
        toast.error("Missing auth user.");
        return;
      }

      let currentStream = stream;
    
try {

  currentStream = await prepareStream();

  if (!currentStream) {
    toast.error("Failed to access camera/microphone");
    return;
  }

} catch (error) {

  console.log(error);

  toast.error("Could not start media stream");

  return;
}

      if (connectionRef.current) {
        connectionRef.current.close();
        connectionRef.current = null;
      }

      const pc = await createPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        socket.emit('ice-candidate', {
          userToCall: id,
          to: id,
          from: authUser._id,
          candidate: event.candidate,
        });
      };

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (userVideo.current && remoteStream) setVideoStream(userVideo.current, remoteStream);
      };

      // add local tracks
      currentStream.getTracks().forEach((track) => pc.addTrack(track, currentStream));

      connectionRef.current = pc;


      setReceivingCall(false);
      setCallStarted(true);
      setCallAccepted(false);

      // create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      emitWhenConnected('call-user', {
        userToCall: id,
        from: authUser._id,
        callerName: authUser.fullName,
        offer: pc.localDescription,
      });

      // If we already got an answer early, apply it now
      if (pendingAcceptedSignalRef.current) {
        const bufferedAnswer = pendingAcceptedSignalRef.current;
        pendingAcceptedSignalRef.current = null;
        try {
          await pc.setRemoteDescription(bufferedAnswer);
        } catch (e) {
          console.warn('Failed to apply buffered answer', e);
        }
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          toast.error('Call connection failed');
        }
      };
  };


    const declineCall = () => {
      // Notify other user and cleanup UI/streams
      try {
        if (socket) {
          const target = caller || selectedUser?._id;
          if (target) socket.emit("end-call", { to: target });
        }
      } catch {}
      cleanupCall();
      toast.success("Call declined");
    };

    const answerCall = async () => {
      if (!socket) {
        toast.error("Connecting to call server. Please wait a moment.");
        return;
      }


      if (!caller) {
        toast.error("Caller missing. Cannot accept call.");
        return;
      }

      // Race-condition guard: sometimes the popup renders before the offer SDP arrives.
      if (!callerSignal) {
        toast.error("Caller offer not received yet. Please wait.");
        return;
      }

      let currentStream = stream;

     
try {

  currentStream = await prepareStream();

  if (!currentStream) {
    toast.error("Failed to access camera/microphone");
    return;
  }

} catch (error) {

  console.log(error);

  toast.error("Could not start media stream");

  return;
}

      // Only flip UI state after we successfully apply the remote offer.
      // This prevents rendering the remote <video> when tracks never arrive.
      setCallStarted(true);
      setReceivingCall(false);

      if (connectionRef.current) {
        try {
          connectionRef.current.close?.();
        } catch {}
        connectionRef.current = null;
      }


      const pc = await createPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      // Relay ICE candidates to caller
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        socket.emit('ice-candidate', {
          userToCall: caller,
          to: caller,
          from: authUser._id,
          candidate: event.candidate,
        });
      };

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (userVideo.current && remoteStream) setVideoStream(userVideo.current, remoteStream);
      };

      // Add local tracks
      currentStream.getTracks().forEach((track) => pc.addTrack(track, currentStream));

      connectionRef.current = pc;

      // callerSignal is the offer we received via socket.
      // Wait until it exists (avoids “Caller offer missing” race condition).
      if (!callerSignal) {
        toast.error("Caller offer not received yet.");
        return;
      }
      await pc.setRemoteDescription(callerSignal);

      // Now that the remote offer is applied, the connection should be able to receive tracks.
      setCallAccepted(true);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);


      socket.emit("answer-call", {
        to: caller,
        answer: pc.localDescription,
      });
    };


const cleanupCall = () => {

  // stop local tracks
  if (stream) {
    stream.getTracks().forEach((track) => track.enabled = false);
  }

  // close peer connection
  if (connectionRef.current) {
    connectionRef.current.ontrack = null;
    connectionRef.current.onicecandidate = null;

    connectionRef.current.close();

    connectionRef.current = null;
  }

  // clear video elements
  if (myVideo.current) {
    myVideo.current.srcObject = null;
  }

  if (userVideo.current) {
    userVideo.current.srcObject = null;
  }

  setStream(null);

  setCallAccepted(false);
  setCallStarted(false);
  setReceivingCall(false);

  setCaller("");
  setCallerSignal(null);
};

 const endCall = () => {

  if (socket) {

    const target =
      caller || selectedUser?._id;

    if (target) {
      socket.emit("end-call", {
        to: target,
      });
    }
  }

  cleanupCall();
};

  return selectedUser ? (
    <div className='h-full overflow-hidden relative backdrop-blur-lg'>
      {/* ----- Header ----- */}  
      <div className= 'flex items-center gap-3 py-3 mx-4 border-b border-stone-500'>
        <img src={selectedUser.profilePic || assets.avatar_icon} alt="profile" className='w-8 rounded-full'/>
          <p className='flex-1 text-lg text-white flex items-center gap-2'>
              {selectedUser.fullName}
              {onlineUsers.includes(String(selectedUser._id)) && <span className='w-2 h-2 rounded-full bg-green-500'></span>}
          </p>
          <img onClick={()=> setSelectedUser(null)} src={assets.arrow_icon} alt="" className='md:hidden w-7'/>
          <button
  onClick={() => startCall(selectedUser._id)}
  disabled={callStarted}
  className={`px-4 py-2 rounded-full text-white text-sm
  ${callStarted
    ? "bg-gray-500 cursor-not-allowed"
    : "bg-green-500 hover:bg-green-600"
  }`}
>
  Call
</button>


          <img src={assets.help_icon} alt="" className='max-md:hidden w-5'/>
        </div>
        {/* ----- Chat Area ----- */}
        <div className='flex flex-col h-[calc(100%-120px)] overflow-y-scroll p-3 pb-24'>
          {messages.map((msg, index) => {
            const isOwnMessage = msg.senderId === authUser._id;
            return (
              <div key={index} className={`flex items-end gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                {!isOwnMessage && (
                  <img src={selectedUser?.profilePic || assets.avatar_icon} alt="" className='w-7 rounded-full'/>
                )}
                {msg.image ? (
                  <img src={msg.image} alt="" className='max-w-[230px] border border-gray-700 rounded-lg overflow-hidden mb-8'/>
                ) : (
                  <p className={`p-3 rounded-xl max-w-[200px] md:text-sm font-light mb-8 break-all ${isOwnMessage ? 'bg-violet-500/70 text-white rounded-br-none' : 'bg-white/10 text-gray-100 rounded-bl-none'}`}>
                    {msg.text}
                  </p>
                )}
                {isOwnMessage && (
                  <img src={authUser?.profilePic || assets.avatar_icon} alt="" className='w-7 rounded-full'/>
                )}
                <div className="text-center text-[10px] text-gray-400">
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
    receivingCall={receivingCall}
    endCall={endCall}
  />
)}

    <CallPopup
      receivingCall={receivingCall}
      callAccepted={callAccepted}
      answerCall={answerCall}
      declineCall={declineCall}
      callerName={callerName}
    />



{/* ----- Bottom Area ----- */}
    <div className='absolute bottom-0 left-0 right-0 flex items-center gap-3 p-3'>
        <div className='flex-1 flex items-center bg-gray-100/12 px-3 rounded-full'>
            <input onChange={(e)=> setInput(e.target.value)} value={input} onKeyDown={(e)=> e.key === "Enter" ? handleSendMessage(e) : null} type="text" placeholder="Send a message" 
            className='flex-1 text-sm p-3 border-none rounded-lg outline-none text-white placeholder-gray-400'/>
            <input onChange={handleSendImage} type="file" id='image' accept='image/png, image/jpeg' hidden/>
            <label htmlFor="image">
                <img src={assets.gallery_icon} alt="" className="w-5 mr-2 cursor-pointer"/>
            </label>
        </div>
        <img onClick={handleSendMessage} src={assets.send_button} alt="" className='w-7 cursor-pointer'/>
    </div>

    </div>
  ) : (
    <div className='flex flex-col justify-center items-center gap-2 text-gray-500 bg-white/10 max-md:hidden'>
      <img src={assets.logo_icon} alt="" className='max-w-16'/>
      <p className='text-white font-medium text-lg'>Chat anytime, anywhere</p>
    </div>
  )
}

export default ChatContainer
