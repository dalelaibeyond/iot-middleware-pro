import { DoorOpen, DoorClosed } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DoorPanelProps {
  doorState?: number | null;
  door1State?: number | null;
  door2State?: number | null;
  className?: string;
}

function DoorIcon({ isOpen, label }: { isOpen: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={cn(
          'p-4 rounded-lg border-2 transition-all',
          {
            'bg-red-100 border-red-500 text-red-600 animate-pulse': isOpen,
            'bg-green-100 border-green-500 text-green-600': !isOpen,
          }
        )}
      >
        {isOpen ? <DoorOpen size={48} /> : <DoorClosed size={48} />}
      </div>
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <span
        className={cn('text-xs font-semibold', {
          'text-red-600': isOpen,
          'text-green-600': !isOpen,
        })}
      >
        {isOpen ? 'OPEN' : 'CLOSED'}
      </span>
    </div>
  );
}

export function DoorPanel({ doorState, door1State, door2State, className }: DoorPanelProps) {
  // Determine if we have V6800 (two doors) or V5008 (one door)
  const hasTwoDoors = door1State !== null || door2State !== null;

  if (hasTwoDoors) {
    return (
      <div className={cn('flex gap-4 justify-center', className)}>
        <DoorIcon isOpen={door1State === 1} label="Front Door" />
        <DoorIcon isOpen={door2State === 1} label="Rear Door" />
      </div>
    );
  }

  // Single door for V5008
  return (
    <div className={cn('flex justify-center', className)}>
      <DoorIcon isOpen={doorState === 1} label="Door" />
    </div>
  );
}
