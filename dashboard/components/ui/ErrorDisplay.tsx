import React from "react";
import { AlertTriangle, WifiOff, RefreshCw, ServerCrash } from "lucide-react";

interface ErrorDisplayProps {
  title: string;
  message?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  title,
  message,
  icon,
  action,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 ${className}`}
    >
      {icon || <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />}
      <h2 className="text-xl font-bold text-slate-300 mb-2">{title}</h2>
      {message && <p className="text-slate-500 mb-6 max-w-md">{message}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md transition-colors flex items-center gap-2"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

export const ConnectionError: React.FC<{
  onRetry?: () => void;
  message?: string;
}> = ({ onRetry, message = "Unable to connect to the middleware" }) => {
  return (
    <ErrorDisplay
      title="Connection Error"
      message={message}
      icon={<WifiOff className="w-12 h-12 text-red-500 mb-4" />}
      action={onRetry ? { label: "Retry", onClick: onRetry } : undefined}
    />
  );
};

export const DataError: React.FC<{
  onRetry?: () => void;
  message?: string;
}> = ({ onRetry, message = "Failed to load data" }) => {
  return (
    <ErrorDisplay
      title="Data Error"
      message={message}
      icon={<ServerCrash className="w-12 h-12 text-red-500 mb-4" />}
      action={onRetry ? { label: "Retry", onClick: onRetry } : undefined}
    />
  );
};

export const OfflineMode: React.FC<{
  onReconnect?: () => void;
  lastSync?: string;
}> = ({ onReconnect, lastSync }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8">
      <WifiOff className="w-12 h-12 text-yellow-500 mb-4" />
      <h2 className="text-xl font-bold text-slate-300 mb-2">Offline Mode</h2>
      <p className="text-slate-500 mb-6 max-w-md">
        You're currently offline. Some features may not be available.
        {lastSync && ` Last sync: ${lastSync}`}
      </p>
      {onReconnect && (
        <button
          onClick={onReconnect}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Reconnect
        </button>
      )}
    </div>
  );
};

export const StaleDataWarning: React.FC<{
  lastUpdate: string;
  onRefresh?: () => void;
}> = ({ lastUpdate, onRefresh }) => {
  return (
    <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-md p-4 mb-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-yellow-400 font-medium mb-1">
            Data May Be Stale
          </h3>
          <p className="text-yellow-200 text-sm mb-3">
            Last updated: {new Date(lastUpdate).toLocaleString()}
          </p>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-3 py-1 bg-yellow-700 hover:bg-yellow-600 text-white rounded text-sm transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
