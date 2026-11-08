import React from 'react';
import { WifiOff, Database } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="bg-amber-500/20 border-b border-amber-500/30 px-3 py-1.5 flex items-center justify-between text-xs text-amber-200 z-30 shrink-0 animate-fade-in select-none">
      <div className="flex items-center gap-2">
        <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span>
          <strong>Modo sin conexión:</strong> Puedes consultar tu historial y frases guardadas localmente. La traducción en vivo se reanudará al recuperar la conexión.
        </span>
      </div>
      <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-amber-300/80 bg-amber-500/20 px-2 py-0.5 rounded-md">
        <Database className="w-3 h-3" />
        <span>Datos locales</span>
      </div>
    </div>
  );
};
