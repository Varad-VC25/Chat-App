// src/components/CallPopup.jsx
import React from 'react'

const CallPopup = ({
  receivingCall,
  callAccepted,
  answerCall,
  declineCall,
  callerName,
}) => {
  if (!receivingCall || callAccepted) return null

  return (
    /*
      fixed inset-0 — renders at page level (HomePage), not inside chat.
      z-[100] — above VideoCall (z-[90]) and everything else.
    */
    <div
      className='fixed inset-0 z-[100] flex items-center justify-center'
      style={{
        backgroundColor: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <div className='bg-[#1a1a2e] border border-white/10 rounded-3xl p-8 flex flex-col items-center gap-5 shadow-2xl w-[90%] max-w-[340px]'>

        {/* Pulsing ring */}
        <div className='relative flex items-center justify-center'>
          <div className='absolute w-24 h-24 rounded-full bg-green-500/20 animate-ping' />
          <div className='w-20 h-20 rounded-full bg-green-500/30 flex items-center justify-center'>
            <span className='text-4xl'>📞</span>
          </div>
        </div>

        <h2 className='text-white text-xl font-semibold text-center'>
          Incoming Video Call
        </h2>

        <p className='text-gray-400 text-sm text-center'>
          {callerName
            ? `${callerName} is calling you...`
            : 'Someone is calling you...'}
        </p>

        <div className='flex items-center gap-4 w-full mt-2'>
          <button
            onClick={declineCall}
            className='flex-1 flex flex-col items-center gap-2 group'
          >
            <span className='w-14 h-14 rounded-full bg-red-500 group-hover:bg-red-600 active:scale-90 flex items-center justify-center text-2xl shadow-lg transition-all'>
              📵
            </span>
            <span className='text-gray-400 text-xs'>Decline</span>
          </button>

          <button
            onClick={answerCall}
            className='flex-1 flex flex-col items-center gap-2 group'
          >
            <span className='w-14 h-14 rounded-full bg-green-500 group-hover:bg-green-600 active:scale-90 flex items-center justify-center text-2xl shadow-lg transition-all'>
              📱
            </span>
            <span className='text-gray-400 text-xs'>Accept</span>
          </button>
        </div>

      </div>
    </div>
  )
}

export default CallPopup