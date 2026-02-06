import { useEffect, useRef, useCallback } from "react";
import { useIoTStore } from "../store/useIoTStore";
import { SUOUpdate } from "../types/schema";
import { validateWebSocketMessage } from "../src/utils/validation";

export const useSocket = () => {
  const { mergeUpdate, setSocketConnected } = useIoTStore();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 2000; // Start with 2 seconds

  const connect = useCallback(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:3001";

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("WebSocket connected");
        setSocketConnected(true);
        reconnectAttemptsRef.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        const data = validateWebSocketMessage(event.data);
        if (data) {
          console.log("[useSocket.ts]Received SUO message from middleware:", data);
          mergeUpdate(data);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log("WebSocket disconnected:", event.code, event.reason);
        setSocketConnected(false);

        // Attempt to reconnect if not explicitly closed
        if (
          event.code !== 1000 &&
          reconnectAttemptsRef.current < maxReconnectAttempts
        ) {
          const delay =
            reconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
          console.log(
            `Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`,
          );

          reconnectTimeoutRef.current = window.setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          console.error("Max reconnection attempts reached");
        }
      };

      wsRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        setSocketConnected(false);
      };
    } catch (error) {
      console.error("Error creating WebSocket connection:", error);
      setSocketConnected(false);
    }
  }, [mergeUpdate, setSocketConnected]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, "Disconnected by user");
      wsRef.current = null;
    }

    setSocketConnected(false);
  }, [setSocketConnected]);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Expose disconnect function for manual control
  return { disconnect };
};
