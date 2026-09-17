# 店铺管家（单店管理系统）

面向单店自用的进销存 + 开单 + 赊账管理系统，微信小程序端，部署在 Cloudflare 免费套餐上。

## 功能

- **商品管理**：扫码录入、拍照/条码补全、多 SKU（同码不同版本）、多优惠、整箱↔单件关联商品、规格归档、缺货标记、商品图片、价格历史与趋势、入库记录、彻底删除
- **入库**：供货商/日期/清单、入库价与上次不同时提示是否同步零售价、拍照 OCR 识别收货单（原图对照、人工校对后入库）
- **开单**：扫码/搜索加购、客户选择、送货上门（地址/时间）、现结或赊账、多次回款（微信/支付宝/现金/商品抵扣/其他抵扣）、商品抵扣自动重新入库
- **送货**：拍照自动打时间 + 地址 + GPS + 送货人水印
- **客户与欠款**：按客户查看未结订单与回款记录
- **账号**：老板/店员账号密码登录、微信一键登录（需配置）、老板可管理店员
- **数据**：首页统计、一键导出 JSON、每日自动备份到 R2

## 架构

```
微信小程序（Taro + React + TS）
   │  https://wj.160847.xyz（已备案后接入 ESA）
   ▼
阿里云 ESA（CDN + 备案接入）
   ├── /api/*    回源 Cloudflare Worker（不缓存）
   ├── /files/*  回源 Cloudflare Worker → R2（ESA 缓存图片）
   └── 其他路径   回源 Worker 托管的 Web 版静态资源
   ▼
Cloudflare Worker（Hono + Kysely）
   ├── D1        业务数据（SQLite，免费 5GB）
   ├── R2        图片/单据/水印照（免费 10GB，出口免费）
   ├── Workers AI  收货单 OCR（免费 10k neurons/天）
   ├── Static Assets  Web 版（Taro H5 构建产物）
   └── Cron      每日导出备份到 R2
```

Web 版与 API 同域（`wj.160847.xyz`）：根路径打开 Web 版，`/status` 查看服务状态，`/api/*` 为接口。

## 目录

```
apps/api         Cloudflare Worker 后端（Hono + Kysely）
apps/miniapp     Taro 微信小程序
packages/shared  前后端共用类型与校验（zod）
```

## 本地开发

要求：Bun 1.3+、微信开发者工具。

```bash
bun install

# 后端
cd apps/api
cp .dev.vars.example .dev.vars        # 或手动创建，内容 JWT_SECRET=xxx
bun run migrate:local                 # 初始化本地 D1
bun run dev                           # http://127.0.0.1:8787（本地模式，不含 AI binding）

# 小程序（另开终端）
cd apps/miniapp
bun run dev:weapp                     # 生成 dist/，微信开发者工具导入本目录
```

首次启动小程序会引导创建老板账号。微信开发者工具需在「详情 → 本地设置」勾选“不校验合法域名”。真机预览时后端地址不能用 127.0.0.1，在 `apps/miniapp` 下建 `.env.development`：

```
TARO_APP_API=http://192.168.x.x:8787
```

本地测试 OCR 需要 Workers AI，用已登录的 Cloudflare 账号跑 `bun run dev:remote`（会使用 `wrangler.toml` 的 AI binding）。

## 部署

### 1. Cloudflare 资源

一键脚本（推荐，自动完成下面第 1-5 步）：

```bash
cd apps/api
bun run setup:cloudflare
```

或手动执行：

```bash
cd apps/api
bunx wrangler login
bunx wrangler d1 create store-manager-db      # 将输出的 database_id 填入 wrangler.toml
bunx wrangler r2 bucket create store-manager-files
bunx wrangler secret put JWT_SECRET
# 可选：微信登录
bunx wrangler secret put WX_APPID
bunx wrangler secret put WX_SECRET
# 可选：条码补全（极数本源免费版国内覆盖好，匿名即可用；配 key 额度更高）
bunx wrangler secret put APIZERO_KEY
bunx wrangler secret put ALI_MARKET_BARCODE_URL
bunx wrangler secret put ALI_MARKET_APPCODE
bunx wrangler secret put BARCODESPIDER_TOKEN
# 可选：覆盖 OCR 模型
bunx wrangler secret put OCR_MODEL

bun run migrate:remote
bun run deploy          # 会先构建 Web 版再部署（deploy:api-only 可跳过 Web 构建）
```

Worker 绑定一个自定义域名（例如 `origin.example.com`），供 ESA 回源。

### 2. 域名备案 + 阿里云 ESA

当前域名规划：

| 域名 | 用途 |
|---|---|
| `wj.160847.xyz` | 小程序/网页版访问入口，接入 ESA 加速 |
| `origin.160847.xyz` | Cloudflare Worker 源站，ESA 回源用（不对外） |

1. 在阿里云完成 `160847.xyz` 的 ICP 备案（需购买可提供备案服务码的轻量服务器等，约 ¥100/年）
2. Cloudflare 上 `wj` 和 `origin` 已由 `wrangler.toml` 的 `routes` 绑定为 Worker 自定义域名；接入 ESA 时，从 `routes` 中移除 `wj.160847.xyz` 并重新部署，只保留 `origin.160847.xyz`
3. 在 Cloudflare DNS 把 `wj.160847.xyz` 改为指向 ESA 提供的 CNAME 目标（DNS only，灰云）
4. ESA 控制台新增站点 `160847.xyz`（CNAME 接入），添加加速域名 `wj.160847.xyz`，源站填 `origin.160847.xyz`（HTTPS 回源）
5. 缓存规则：`/files/*` 缓存（图片），`/api/*` 不缓存（动态接口）

### 3. 微信小程序

1. 微信公众平台创建小程序，拿到 AppID，填入 `apps/miniapp/project.config.json`
2. 「开发管理 → 服务器域名」把 `https://wj.160847.xyz` 加入 request/uploadFile/downloadFile 合法域名
3. 「设置 → 用户隐私保护指引」声明：手机号（可选）、位置信息、相册/摄像头
4. 「开发管理 → 接口设置」申请开通「获取当前的地理位置、速度」（用于送货水印，需符合类目要求）
5. 代码上传：微信开发者工具「上传」，然后在小程序后台提交审核
6. 微信登录：把 AppID/Secret 配置为 Worker secrets 后，登录页会出现“微信一键登录”，首次使用需绑定已有账号

小程序生产接口地址在 `apps/miniapp/.env.production`（当前为 `https://wj.160847.xyz`）。

### 4. 上线检查

- 首页统计、扫码、开单、回款、送货拍照逐项真机验证
- Workers AI 免费额度：控制台查看 neurons 使用量；超出可换更小模型或升级 Workers Paid（$5/月）
- 备份：每天自动写入 R2 `backups/`；D1 自带 Time Travel（30 天内任意时间点恢复）

## 常见问题

- **本地 `wrangler dev` 报 AI binding 错误**：本地默认配置 `wrangler.dev.toml` 不含 AI；需要 OCR 时用 `bun run dev:remote`（需 `wrangler login`）
- **微信内 iOS 摄像头/扫码**：微信小程序原生能力不受浏览器限制；若后续增加 H5 版，iOS 需用 ZXing-WASM 方案
- **条码补全查不到**：查询链为 淘宝（需企业认证）→ 阿里云云市场条码API（个人可）→ **极数本源免费版（无需 key 每天 20 次，登录后额度更高，国内商品覆盖 >95%）** → Open Food Facts → Open Products Facts → UPCitemdb → Barcode Spider，都查不到时手动录入即可；查到的结果会缓存到本地条码库，全店复用
- **OCR 识别不准**：识别结果提供了原图对照与可编辑表格，人工校对后入库；纯手工录入入口始终可用
- **地理水印没有坐标**：需先在小程序后台开通地理位置接口；未开通时水印仅显示时间与订单地址

## 费用

| 项目 | 费用 |
|---|---|
| Cloudflare Workers / D1 / R2 / Workers AI | 免费额度内 ¥0 |
| 域名 | 约 ¥30–70/年 |
| 阿里云轻量（备案服务码） | 约 ¥100/年 |
| 阿里云 ESA 免费版 | ¥0 |

## 技术取舍

- 未引入 UI 组件库，使用 Taro 原生组件 + 少量样式，降低包体积和维护成本
- 小程序端仅复用 `@sm/shared` 的 TypeScript 类型；少量格式化工具在小程序内重复实现，避免跨包构建配置
- 后端数据库访问统一走 `DatabaseBundle`（Kysely + D1），文件访问走 `StorageAdapter`，OCR 走 `AiAdapter`，未来迁移平台只需替换适配层
