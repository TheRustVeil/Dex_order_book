'use client'

// CSS-only animated 3D orb with rotating hex rings — fits in the header pill

export function HexOrb() {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden" aria-hidden="true">
      {/* Background glow */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(0,212,255,0.08) 0%, transparent 70%)',
        }}
      />

      {/* Outer rotating hex ring */}
      <div
        style={{
          width: 38,
          height: 38,
          position: 'relative',
          animation: 'hexSpin 8s linear infinite',
        }}
      >
        <svg viewBox="0 0 38 38" fill="none" className="absolute inset-0 w-full h-full">
          <polygon
            points="19,2 34,10.5 34,27.5 19,36 4,27.5 4,10.5"
            stroke="rgba(0,212,255,0.5)"
            strokeWidth="1"
            fill="none"
          />
        </svg>

        {/* Inner counter-rotating hex */}
        <div
          style={{
            position: 'absolute',
            inset: 6,
            animation: 'hexSpinRev 5s linear infinite',
          }}
        >
          <svg viewBox="0 0 26 26" fill="none" className="w-full h-full">
            <polygon
              points="13,1.5 23.5,7.5 23.5,18.5 13,24.5 2.5,18.5 2.5,7.5"
              stroke="rgba(79,142,247,0.7)"
              strokeWidth="1"
              fill="none"
            />
          </svg>
        </div>

        {/* Center orb */}
        <div
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 10, height: 10,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,212,255,0.9) 0%, rgba(79,142,247,0.5) 60%, transparent 100%)',
            boxShadow: '0 0 10px rgba(0,212,255,0.8), 0 0 20px rgba(79,142,247,0.4)',
            animation: 'orbPulse 2s ease-in-out infinite',
          }}
        />

        {/* Orbiting dot 1 */}
        <div style={{ position: 'absolute', inset: 0, animation: 'orbitDot1 3s linear infinite' }}>
          <div style={{
            position: 'absolute', top: 0, left: '50%',
            transform: 'translateX(-50%)',
            width: 3, height: 3, borderRadius: '50%',
            background: 'rgba(0,212,255,0.9)',
            boxShadow: '0 0 4px rgba(0,212,255,0.8)',
          }} />
        </div>

        {/* Orbiting dot 2 */}
        <div style={{ position: 'absolute', inset: 0, animation: 'orbitDot2 4s linear infinite' }}>
          <div style={{
            position: 'absolute', bottom: 0, left: '50%',
            transform: 'translateX(-50%)',
            width: 2, height: 2, borderRadius: '50%',
            background: 'rgba(168,85,247,0.9)',
            boxShadow: '0 0 4px rgba(168,85,247,0.8)',
          }} />
        </div>
      </div>

      <style>{`
        @keyframes hexSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes hexSpinRev { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        @keyframes orbPulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          50% { transform: translate(-50%, -50%) scale(1.3); opacity: 0.7; }
        }
        @keyframes orbitDot1 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes orbitDot2 { from { transform: rotate(180deg); } to { transform: rotate(540deg); } }
      `}</style>
    </div>
  )
}
