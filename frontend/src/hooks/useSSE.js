import { useEffect } from 'react';

export function useSSE(url, onMessage, onReconnect) {
  useEffect(() => {
    const es = new EventSource(url);

    es.addEventListener('order:new', (e) => {
      onMessage('order:new', JSON.parse(e.data));
    });

    es.addEventListener('order:updated', (e) => {
      onMessage('order:updated', JSON.parse(e.data));
    });

    es.onerror = () => {
      // EventSource reconnects automatically — we call onReconnect to resync state
      if (onReconnect) onReconnect();
    };

    return () => es.close();
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
}
