import { useEffect, useRef } from 'react';
import { useIoTStore } from '../store/useIoTStore';
import type { UnifiedSensorObject } from '../types/schema';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';

export const useSocket = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const mergeUpdate = useIoTStore((state) => state.mergeUpdate);
  const setConnected = useIoTStore((state) => state.setConnected);

  useEffect(() => {
    const connect = () => {
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected');
          setConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data: UnifiedSensorObject = JSON.parse(event.data);
            mergeUpdate(data);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          setConnected(false);
          // Attempt to reconnect after 5 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('Attempting to reconnect...');
            connect();
          }, 5000);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };
      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
      }
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [mergeUpdate, setConnected]);
};

export default useSocket;
