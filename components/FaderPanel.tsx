import React, { useState, useEffect, useRef } from 'react';
import { SystemState, SystemType } from '../types';
import { AlertCircle, GripHorizontal } from 'lucide-react';

interface FaderPanelProps {
  systems: Record<SystemType, SystemState>;
  onFaderChange: (id: SystemType, value: number) => void;
  onSelectSystem: (id: SystemType) => void;
  selectedSystem: SystemType;
  mobile?: boolean;
}

export const FaderPanel: React.FC<FaderPanelProps> = ({
  systems,
  onFaderChange,
  onSelectSystem,
  selectedSystem,
  mobile = false
}) => {
  const [draggingId, setDraggingId] = useState<SystemType | null>(null);
  const trackRefs = useRef<Record<SystemType, HTMLDivElement | null>>({
    [SystemType.SOUND]: null,
    [SystemType.LIGHTS]: null,
    [SystemType.VIDEO]: null,
    [SystemType.STAGE]: null
  });

  const updateValueFromPointer = (id: SystemType, clientY: number) => {
    const track = trackRefs.current[id];
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const ratio = (rect.bottom - clientY) / rect.height;
    const nextValue = Math.min(100, Math.max(0, ratio * 100));
    onFaderChange(id, nextValue);
  };

  // Keyboard control for the fader. Without this the core mechanic of the game
  // is reachable by pointer only. Steps follow the WAI-ARIA slider pattern.
  //
  // The value comes from the current render's props, which is the freshest
  // source available: several key events dispatched before React re-renders all
  // read the same value and collapse into one step. Browsers space key repeats
  // further apart than a frame, so this only shows up in synthetic bursts.
  const handleFaderKeyDown = (id: SystemType, event: React.KeyboardEvent) => {
    const STEP = 2;
    const LARGE_STEP = 10;
    const currentValue = systems[id].faderValue;

    let nextValue: number | null = null;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        nextValue = currentValue + STEP;
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        nextValue = currentValue - STEP;
        break;
      case 'PageUp':
        nextValue = currentValue + LARGE_STEP;
        break;
      case 'PageDown':
        nextValue = currentValue - LARGE_STEP;
        break;
      case 'Home':
        nextValue = 0;
        break;
      case 'End':
        nextValue = 100;
        break;
      default:
        return;
    }

    event.preventDefault();
    onSelectSystem(id);
    onFaderChange(id, Math.min(100, Math.max(0, nextValue)));
  };

  const handlePointerDown = (id: SystemType, event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingId(id);
    onSelectSystem(id);
    updateValueFromPointer(id, event.clientY);
  };

  useEffect(() => {
    const handlePointerUp = () => setDraggingId(null);
    const handlePointerMove = (e: PointerEvent) => {
      if (!draggingId) return;
      updateValueFromPointer(draggingId, e.clientY);
    };

    if (draggingId) {
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointermove', handlePointerMove, { passive: true });
    }

    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [draggingId, onFaderChange]);

  const panelClass = mobile
    ? 'aaa-panel aaa-panel-soft p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl relative z-[120] select-none'
    : 'aaa-panel aaa-panel-soft p-3 md:p-4 shadow-2xl relative z-40 select-none';
  const layoutClass = mobile
    ? 'flex justify-between items-center h-36 max-w-none mx-auto gap-1'
    : 'flex justify-between items-center h-40 md:h-48 max-w-5xl mx-auto gap-2 md:gap-4';

  return (
    <div className={panelClass}>
      {!mobile && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.05),transparent_26%,transparent_76%,rgba(34,211,238,0.06))] pointer-events-none rounded-[14px]"
        />
      )}

      {/* Screw Heads */}
      {!mobile && (
        <>
          <div
            aria-hidden="true"
            className="absolute top-2 left-2 w-3 h-3 rounded-full bg-slate-600/80 flex items-center justify-center"
          >
            <div className="w-full h-[1px] bg-slate-900/80 rotate-45"></div>
          </div>
          <div
            aria-hidden="true"
            className="absolute top-2 right-2 w-3 h-3 rounded-full bg-slate-600/80 flex items-center justify-center"
          >
            <div className="w-full h-[1px] bg-slate-900/80 rotate-45"></div>
          </div>
        </>
      )}

      <div className={layoutClass} role="group" aria-label="Consola de faders">
        {(Object.values(systems) as SystemState[]).map((sys) => {
          const isSafe = sys.faderValue >= 40 && sys.faderValue <= 60;
          const isCritical = sys.faderValue < 20 || sys.faderValue > 80;
          const color = isCritical
            ? 'bg-red-500 shadow-[0_0_15px_red]'
            : isSafe
              ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]'
              : 'bg-amber-500';
          const capSizeClass = mobile ? 'w-10 h-14' : 'w-8 h-12 md:w-10 md:h-16';

          return (
            <div
              key={sys.id}
              className={`flex-1 h-full rounded-lg border border-slate-700/70 bg-[linear-gradient(180deg,rgba(7,14,27,0.92),rgba(4,10,20,0.9))] ${mobile ? 'p-1.5' : 'p-2'} flex flex-col items-center relative group shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`}
            >
              {/* Label & Status */}
              <button
                type="button"
                onClick={() => onSelectSystem(sys.id)}
                aria-pressed={selectedSystem === sys.id}
                aria-label={`Seleccionar sistema ${sys.name}${isCritical ? ' (en estado crítico)' : ''}`}
                className={`w-full text-center mb-2 font-mono ${mobile ? 'text-[9px]' : 'text-[10px]'} font-bold uppercase py-1 rounded cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400
                      ${selectedSystem === sys.id ? 'bg-cyan-900/45 text-cyan-100 border border-cyan-500/40' : 'bg-slate-900/80 text-slate-500 hover:text-slate-300 border border-slate-700/60'}
                    `}
              >
                {sys.name}
                {isCritical && (
                  <AlertCircle
                    aria-hidden="true"
                    className="w-3 h-3 absolute top-2 right-2 text-red-500 animate-pulse"
                  />
                )}
              </button>

              {/* Fader Track */}
              <div
                ref={(el) => {
                  trackRefs.current[sys.id] = el;
                }}
                className={`relative flex-1 ${mobile ? 'w-3' : 'w-2'} bg-slate-950/90 rounded-full mb-2 border border-slate-700/70 shadow-inner touch-none`}
              >
                {/* Safe Zone Marker */}
                <div
                  aria-hidden="true"
                  className="absolute top-[40%] bottom-[40%] left-0 right-0 bg-emerald-500/8 border-y border-emerald-300/10"
                ></div>

                {/* Center Line */}
                <div
                  aria-hidden="true"
                  className="absolute top-1/2 left-[-4px] right-[-4px] h-[1px] bg-cyan-400/30"
                ></div>

                {/* The Fader Cap */}
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label={`Fader de ${sys.name}`}
                  aria-orientation="vertical"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(sys.faderValue)}
                  aria-valuetext={`${Math.round(sys.faderValue)} por ciento, ${
                    isCritical ? 'zona crítica' : isSafe ? 'zona segura' : 'fuera de la zona segura'
                  }`}
                  onPointerDown={(event) => handlePointerDown(sys.id, event)}
                  onKeyDown={(event) => handleFaderKeyDown(sys.id, event)}
                  className={`absolute left-1/2 -translate-x-1/2 ${capSizeClass} rounded shadow-xl cursor-ns-resize flex items-center justify-center transition-transform active:scale-95 touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400
                           bg-gradient-to-b from-slate-500 to-slate-800 border-t border-slate-300/50 border-b border-black/60
                        `}
                  style={{
                    bottom: `${sys.faderValue}%`,
                    transform: 'translateX(-50%) translateY(50%)'
                  }}
                >
                  <div aria-hidden="true" className={`w-full h-[2px] ${color}`}></div>
                  <GripHorizontal
                    aria-hidden="true"
                    className="w-4 h-4 text-slate-300 absolute opacity-55"
                  />
                </div>
              </div>

              {/* Value readout — already announced through the slider's aria-valuetext */}
              <div
                aria-hidden="true"
                className={`font-mono ${mobile ? 'text-[11px]' : 'text-xs'} ${isCritical ? 'text-red-400 font-bold animate-pulse' : 'text-slate-300'}`}
              >
                {Math.round(sys.faderValue)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
