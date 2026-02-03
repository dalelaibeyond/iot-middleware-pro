import { Thermometer, Droplets, Volume2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface EnvListProps {
  tempHumData: Array<{ sensorIndex: number; temp: number; hum: number }>;
  noiseData: Array<{ sensorIndex: number; noise: number }>;
  className?: string;
}

function getTempColor(temp: number): string {
  if (temp > 35) return 'text-orange-600 bg-orange-50';
  if (temp > 30) return 'text-yellow-600 bg-yellow-50';
  return 'text-green-600 bg-green-50';
}

export function EnvList({ tempHumData, noiseData, className }: EnvListProps) {
  // Combine and sort by sensor index
  const combinedData = [
    ...tempHumData.map(item => ({ ...item, type: 'temp-hum' as const })),
    ...noiseData.map(item => ({ ...item, type: 'noise' as const })),
  ].sort((a, b) => a.sensorIndex - b.sensorIndex);

  return (
    <div className={cn('flex flex-col gap-2 overflow-y-auto', className)}>
      {combinedData.length === 0 && (
        <div className="text-center text-gray-400 py-8">
          No environment data available
        </div>
      )}
      {combinedData.map((item) => {
        if (item.type === 'temp-hum') {
          return (
            <div
              key={`temp-hum-${item.sensorIndex}`}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border',
                getTempColor(item.temp)
              )}
            >
              <div className="flex items-center gap-2">
                <Thermometer size={18} />
                <span className="text-sm font-medium">#{item.sensorIndex}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-semibold">{item.temp.toFixed(1)}°C</span>
              </div>
              <div className="flex items-center gap-1 text-gray-600">
                <Droplets size={16} />
                <span className="text-sm">{item.hum.toFixed(0)}%</span>
              </div>
            </div>
          );
        }

        if (item.type === 'noise') {
          return (
            <div
              key={`noise-${item.sensorIndex}`}
              className="flex items-center gap-3 p-3 rounded-lg border bg-purple-50 text-purple-700"
            >
              <div className="flex items-center gap-2">
                <Volume2 size={18} />
                <span className="text-sm font-medium">#{item.sensorIndex}</span>
              </div>
              <div className="font-semibold">
                {item.noise.toFixed(1)} dB
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
