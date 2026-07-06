import React from "react";

const CallPopup = ({
  receivingCall,
  callAccepted,
  answerCall,
  declineCall,
  callerName
}) => {

  if (!receivingCall || callAccepted) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">

      <div className="bg-[#1f1f1f] p-6 rounded-2xl flex flex-col items-center gap-4 w-[320px] text-white shadow-lg">

        <img
          src="/call.svg"
          alt=""
          className="w-16"
        />

        <h2 className="text-xl font-semibold">
          Incoming Video Call
        </h2>

        <p className="text-sm text-gray-300">
          {callerName ? `${callerName} is calling you...!!` : "Someone is calling you...!!"}
        </p>

        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={answerCall}
            className="bg-green-500 hover:bg-green-600 px-6 py-2 rounded-full transition-all"
          >
            Accept
          </button>

          <button
            onClick={declineCall}
            className="bg-red-500 hover:bg-red-600 px-6 py-2 rounded-full transition-all"
          >
            Decline
          </button>
        </div>

      </div>

    </div>
  );
};

export default CallPopup;

