import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings, AppEnv } from './env'
import { createDb } from './db'
import { ApiError } from './lib/errors'
import { shanghaiDateString } from './lib/ids'
import { authMiddleware } from './middleware/auth'
import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import productRoutes from './routes/products'
import skuRoutes from './routes/skus'
import barcodeRoutes from './routes/barcodes'
import purchaseRoutes from './routes/purchases'
import ocrRoutes from './routes/ocr'
import fileRoutes, { serveStoredFile } from './routes/files'
import customerRoutes from './routes/customers'
import orderRoutes from './routes/orders'
import paymentRoutes from './routes/payments'
import reportRoutes from './routes/reports'
import categoryRoutes from './routes/categories'
import { exportAll } from './services/backup'

const PUBLIC_PATHS = new Set([
  '/api/auth/setup-status',
  '/api/auth/setup',
  '/api/auth/login',
  '/api/auth/wx-login',
  '/api/auth/wx-bind',
])

const app = new Hono<AppEnv>()

app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
)

app.get('/health', (c) =>
  c.json({ ok: true, data: { status: 'up', time: new Date().toISOString() } }),
)

app.get('/status', async (c) => {
  let userCount = 0
  try {
    const { db } = createDb(c.env.DB)
    const row = await db
      .selectFrom('users')
      .select((eb) => eb.fn.count('users.id').as('count'))
      .executeTakeFirst()
    userCount = Number(row?.count ?? 0)
  } catch {
    userCount = 0
  }
  const ready = userCount > 0
  const badge = ready
    ? '<span style="background:#e8f7ee;color:#1a9e55;padding:4px 12px;border-radius:999px;font-size:13px">已初始化</span>'
    : '<span style="background:#fff1e6;color:#e8730c;padding:4px 12px;border-radius:999px;font-size:13px">待初始化</span>'
  const hint = ready
    ? '账号已就绪，请在店铺管家小程序或网页版中登录。'
    : '系统尚未初始化，请打开店铺管家小程序或网页版创建老板账号。'
  return c.html(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>店铺管家 API</title>
  </head>
  <body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;background:#f4f5f7;color:#1f2329">
    <div style="max-width:520px;margin:80px auto;padding:0 20px">
      <div style="background:#fff;border-radius:16px;padding:28px;box-shadow:0 2px 8px rgba(31,35,41,.06)">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <h1 style="margin:0;font-size:22px">店铺管家 API</h1>
          ${badge}
        </div>
        <p style="color:#5c6470;font-size:14px;line-height:1.7;margin:16px 0">${hint}</p>
        <div style="background:#f5f6f8;border-radius:12px;padding:16px;font-size:13px;color:#5c6470;line-height:1.9">
          <div>接口地址：<code>https://wj.160847.xyz/api</code></div>
          <div>健康检查：<a href="/health" style="color:#2f6bff">/health</a></div>
          <div>初始化状态：<a href="/api/auth/setup-status" style="color:#2f6bff">/api/auth/setup-status</a></div>
        </div>
        <p style="color:#a5abb5;font-size:12px;margin:16px 0 0">服务运行时间：${new Date().toISOString()}</p>
      </div>
    </div>
  </body>
</html>`)
})

app.use('/api/*', async (c, next) => {
  c.set('database', createDb(c.env.DB))
  await next()
})

app.use('/api/*', async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) return next()
  return authMiddleware(c, next)
})

app.route('/api/auth', authRoutes)
app.route('/api/users', userRoutes)
app.route('/api/products', productRoutes)
app.route('/api/skus', skuRoutes)
app.route('/api/barcodes', barcodeRoutes)
app.route('/api/purchases', purchaseRoutes)
app.route('/api/ocr', ocrRoutes)
app.route('/api/files', fileRoutes)
app.route('/api/customers', customerRoutes)
app.route('/api/orders', orderRoutes)
app.route('/api/payments', paymentRoutes)
app.route('/api/reports', reportRoutes)
app.route('/api/categories', categoryRoutes)

app.get('/files/*', serveStoredFile)

app.get('*', async (c) => {
  if (!c.env.ASSETS) return c.notFound()
  const response = await c.env.ASSETS.fetch(c.req.raw)
  if (response.status !== 404) return response
  const url = new URL(c.req.url)
  url.pathname = '/index.html'
  return c.env.ASSETS.fetch(new Request(url.toString(), { headers: c.req.raw.headers }))
})

app.notFound((c) =>
  c.json({ ok: false, error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404),
)

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json(
      { ok: false, error: { code: err.code, message: err.message, detail: err.detail } },
      err.status,
    )
  }
  console.error(err)
  return c.json({ ok: false, error: { code: 'INTERNAL', message: '服务器内部错误' } }, 500)
})

async function backupToR2(env: Bindings): Promise<void> {
  const { db } = createDb(env.DB)
  const data = await exportAll(db)
  const key = `backups/${shanghaiDateString()}.json`
  await env.BUCKET.put(key, JSON.stringify(data), {
    httpMetadata: { contentType: 'application/json' },
  })
}

export default {
  fetch: app.fetch,
  async scheduled(
    _controller: ScheduledController,
    env: Bindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(backupToR2(env))
  },
}
