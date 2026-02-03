import { cn } from '../../lib/utils';

interface RackStripProps {
  uTotal: number;
  rfidData: Array<{ sensorIndex: number; tagId: string; isAlarm: boolean }>;
  className?: string;
}

export function RackStrip({ uTotal, rfidData, className }: RackStripProps) {
  // Create an array of slots from uTotal down to 1
  const slots = Array.from({ length: uTotal }, (_, i) => uTotal - i);

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {slots.map((u) => {
        const occupiedSlot = rfidData.find((slot) => slot.sensorIndex === u);
        const isOccupied = !!occupiedSlot;
        const isAlarm = occupiedSlot?.isAlarm;

        return (
          <div
            key={u}
            className={cn(
              'h-8 rounded border flex items-center justify-center text-sm font-medium transition-all',
              {
                'bg-gray-100 border-gray-200 text-gray-400': !isOccupied,
                'bg-blue-500 border-blue-600 text-white': isOccupied && !isAlarm,
                'bg-red-500 border-red-600 text-white animate-pulse': isOccupied && isAlarm,
              }
            )}
          >
            {isOccupied ? (
              <span className="truncate px-2">
                {occupiedSlot.tagId}
              </span>
            ) : (
              <span className="text-xs text-gray-400">U{u}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
