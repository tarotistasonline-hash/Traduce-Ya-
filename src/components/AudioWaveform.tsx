import React from 'react';

interface AudioWaveformProps {
  isActive: boolean;
  audioLevel?: number; // 0 to 100
  color?: 'emerald' | 'blue' | 'purple' | 'amber';
  size?: 'sm' | 'md' | 'lg';
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  isActive,
  audioLevel = 0,
  color = 'blue',
  size = 'md',
}) => {
  const colorMap = {
    emerald: 'bg-emerald-400 shadow-emerald-500/50',
    blue: 'bg-cyan-400 shadow-cyan-500/50',
    purple: 'bg-purple-400 shadow-purple-500/50',
    amber: 'bg-amber-400 shadow-amber-500/50',
  };

  const activeColor = colorMap[color];
  const barCount = size === 'lg' ? 9 : size === 'md' ? 7 : 5;

  return (
    <div className="flex items-center justify-center gap-1.5 h-10 px-3">
      {Array.from({ length: barCount }).map((_, index) => {
        // Calculate dynamic height based on audio level and bar index
        const centerOffset = Math.abs(index - Math.floor(barCount / 2));
        const factor = Math.max(0.2, 1 - centerOffset * 0.18);
        const dynamicHeight = isActive
          ? Math.max(8, Math.min(36, (audioLevel * 0.35 * factor) + (Math.sin((index + 1) * 1.5) * 6 + 10)))
          : 4;

        return (
          <div
            key={index}
            className={`w-1.5 rounded-full transition-all duration-75 ${
              isActive
                ? `${activeColor} shadow-sm`
                : 'bg-slate-700/60'
            }`}
            style={{
              height: `${dynamicHeight}px`,
            }}
          />
        );
      })}
    </div>
  );
};
