import { createApp } from "./app.js";

const PORT = Number(process.env.API_PORT ?? 3000);

createApp().listen(PORT, () => {
  console.log(`api listening on http://0.0.0.0:${PORT}`);
});
