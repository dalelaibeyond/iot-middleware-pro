import React from "react";
import { Loader2 } from "lucide-react";

interface LoadingIndicatorProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  size = "md",
  text,
  className = "",
}) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Loader2 className={`animate-spin text-sky-500 ${sizeClasses[size]}`} />
      {text && <span className="text-slate-400">{text}</span>}
    </div>
  );
};

export const FullPageLoader: React.FC<{ text?: string }> = ({
  text = "Loading...",
}) => {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-slate-400 font-sans">
      <Loader2 className="w-10 h-10 animate-spin text-sky-500 mb-4" />
      <div className="text-lg font-bold tracking-tighter text-slate-100 uppercase italic">
        {text}
      </div>
    </div>
  );
};

export const ConnectionStatus: React.FC<{
  connected: boolean;
  connecting?: boolean;
  className?: string;
}> = ({ connected, connecting = false, className = "" }) => {
  if (connecting) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Loader2 className="w-3 h-3 animate-spin text-yellow-500" />
        <span className="text-xs text-yellow-500">Connecting...</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"}`}
      />
      <span
        className={`text-xs ${connected ? "text-emerald-500" : "text-red-500"}`}
      >
        {connected ? "Connected" : "Disconnected"}
      </span>
    </div>
  );
};
