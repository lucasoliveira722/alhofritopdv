import { useEffect, useRef } from 'react';

export function useSSE(url, onMessage, onReconnect) {
  const onMessageRef = useRef(onMessage);
  const onReconnectRef = useRef(onReconnect);

  useEffect(() => { onMessageRef.current = onMessage; });
  useEffect(() => { onReconnectRef.current = onReconnect; });

  useEffect(() => {
    const es = new EventSource(url);

    es.addEventListener('order:new', (e) => {
      try {
        onMessageRef.current('order:new', JSON.parse(e.data));
      } catch (err) {
        console.error('[useSSE] Failed to parse order:new event data', err);
      }
    });

    es.addEventListener('order:updated', (e) => {
      try {
        onMessageRef.current('order:updated', JSON.parse(e.data));
      } catch (err) {
        console.error('[useSSE] Failed to parse order:updated event data', err);
      }
    });

    es.onerror = () => {
      if (onReconnectRef.current) onReconnectRef.current();
    };

    return () => es.close();
  }, [url]);
}
