import { createApp } from './app.ts';

const app = createApp();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';

app.listen(port, host, () => {
  console.log(`[dashinvest-api] listening on http://${host}:${port}`);
});
