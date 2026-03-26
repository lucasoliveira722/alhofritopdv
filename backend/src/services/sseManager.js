const clients = new Set();

export const sseManager = {
  add(res) {
    clients.add(res);
  },
  remove(res) {
    clients.delete(res);
  },
  push(event, data) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      res.write(message);
    }
  },
};
