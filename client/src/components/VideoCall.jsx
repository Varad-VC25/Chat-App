
import React from "react";

const VideoCall = ({
  myVideo,
  userVideo,
  callAccepted,
  endCall,
}) => {

  return (

    <div className="absolute inset-0 bg-black/90 z-40 flex flex-col items-center justify-center p-6">

      {/* VIDEOS */}
      {/* Pre-call: show only local video centered. After accepted: show both side-by-side. */}
      <div
        className={`items-center justify-center gap-6 ${callAccepted ? 'grid grid-cols-2' : 'flex flex-col'}`}
      >

        {/* MY VIDEO */}
        <div className="flex flex-col items-center">


          <video
            playsInline
            muted
            ref={myVideo}
            autoPlay
            className="w-[320px] h-[240px] rounded-2xl bg-black object-cover border border-gray-700"
          />

          <p className="text-white mt-2">
            You
          </p>

        </div>

        {/* REMOTE VIDEO */}
        {callAccepted && (

          <div className="flex flex-col items-center">

            <video

              playsInline
              ref={userVideo}
              autoPlay
              className="w-[320px] h-[240px] rounded-2xl bg-black object-cover border border-gray-700"
            />

            <p className="text-white mt-2">
              Remote User
            </p>

          </div>
        )}

      </div>

      {/* HANGUP BUTTON */}
      <button
        onClick={endCall}
        className="mt-8 bg-red-500 hover:bg-red-600 text-white px-8 py-3 rounded-full text-sm font-medium shadow-lg"
      >
        Hang Up
      </button>

    </div>
  );
};

export default VideoCall;
