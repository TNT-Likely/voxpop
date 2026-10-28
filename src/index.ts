import { Hono } from 'hono';
import type { Env } from './types';
import { layout, notFoundBody } from './lib/html';
import { pages } from './routes/pages';
import { api } from './routes/api';
import { admin } from './routes/admin';

const app = new Hono<{ Bindings: Env }>();

app.route('/', pages);
app.route('/', api);
app.route('/', admin);

app.notFound((c) => c.html(layout({ title: '页面不存在 · 众声 VoxPop', body: notFoundBody() }), 404));

app.onError((err, c) => {
  console.error('voxpop error:', err);
  return c.text('internal error', 500);
});

export default app;
