
import React from 'react';
import { Shield, DoorClosed, DoorOpen } from 'lucide-react';
import { cn } from '../../utils/cn';

interface DoorPanelProps {
  doorState: number | null;
  door1State: number | null;
  door2State: number | null;
}

const DoorIcon: React.FC<{ isOpen: boolean, label: string }> = ({ isOpen, label }) => (
  <div className={cn(
    "flex flex-col items-center gap-4 p-6 flex-1 relative overflow-hidden group hardware-card",
    isOpen && "border-rose-500/50"
  )}>
    <div className={cn(
      "absolute inset-0 transition-opacity duration-1000",
      isOpen ? "opacity-10 animate-pulse-red bg-rose-500" : "opacity-0"
    )} />
    
    <div className={cn(
      "relative z-10 p-4 rounded-full transition-all duration-500",
      isOpen ? "bg-rose-500/20 text-rose-500 ring-4 ring-rose-500/10" : "bg-emerald-500/10 text-emerald-500"
    )}>
      {isOpen ? <DoorOpen className="w-12 h-12" /> : <DoorClosed className="w-12 h-12" />}
    </div>

    <div className="relative z-10 text-center">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">{label}</p>
      <div className={cn(
        "text-lg font-bold uppercase tracking-tighter",
        isOpen ? "text-rose-400" : "text-emerald-400"
      )}>
        {isOpen ? 'ACCESS OPEN' : 'SECURED'}
      </div>
    </div>

    <div className={cn(
      "absolute bottom-0 left-0 right-0 h-1",
      isOpen ? "bg-rose-500" : "bg-emerald-500"
    )} />
  </div>
);

export const DoorPanel: React.FC<DoorPanelProps> = ({ doorState, door1State, door2State }) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-4 h-4 text-sky-400" />
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-tight">Access Control</h3>
      </div>

      <div className="flex flex-col gap-4">
        {door1State !== null && (
          <DoorIcon label="Front Door" isOpen={door1State === 1} />
        )}
        {door2State !== null && (
          <DoorIcon label="Rear Door" isOpen={door2State === 1} />
        )}
        {doorState !== null && door1State === null && (
          <DoorIcon label="Device Door" isOpen={doorState === 1} />
        )}
      </div>

      <div className="mt-4 p-3 bg-slate-900/50 border border-slate-800 rounded-lg text-[10px] text-slate-500 leading-relaxed italic">
        * System uses magnetic latch sensors. Any unauthorized opening triggers immediate rack alarm.
      </div>
    </div>
  );
};
