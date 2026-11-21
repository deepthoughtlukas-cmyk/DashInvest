import { createApp } from './app.ts';

const app = createApp();
const port = Number(process.env.PORT || 3001);

app.listen(port, () => {
  console.log(`[dashinvest-api] listening on http://localhost:${port}`);
});
