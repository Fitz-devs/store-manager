# 店铺管家 · UI 交互升级设计

## 风格锚点

对标「成熟单店 SaaS 移动端」——微信生态内高频操作工具的克制感：
像「有赞微商城商家端 / 美团开店宝」的信息密度与操作效率，
再叠加轻量卡片与可点按反馈。不追插画风，不做大圆角卡通化。

## 色板（CSS Variables）

| Token | 值 | 用途 |
|---|---|---|
| `--sm-bg` | `#f3f4f6` | 页面底 |
| `--sm-surface` | `#ffffff` | 卡片/底栏 |
| `--sm-ink` | `#111827` | 主文字 |
| `--sm-ink-2` | `#6b7280` | 次文字 |
| `--sm-ink-3` | `#9ca3af` | 弱提示/空态 |
| `--sm-line` | `#e5e7eb` | 分割线 |
| `--sm-primary` | `#2563eb` | 主操作/选中 |
| `--sm-primary-soft` | `#eff6ff` | 选中底 |
| `--sm-primary-deep` | `#1d4ed8` | 渐变深端/按压 |
| `--sm-success` | `#059669` / soft `#ecfdf5` | 已结清/在售 |
| `--sm-warn` | `#d97706` / soft `#fffbeb` | 待收款/待送货 |
| `--sm-danger` | `#dc2626` / soft `#fef2f2` | 金额/缺货/危险 |
| `--sm-radius-card` | `16px` | 卡片 |
| `--sm-radius-ctl` | `12px` | 输入/按钮 |
| `--sm-radius-pill` | `999px` | 胶囊 |
| `--sm-shadow-card` | `0 1px 2px rgba(17,24,39,.04), 0 4px 12px rgba(17,24,39,.04)` | 卡片轻阴影 |
| `--sm-shadow-float` | `0 8px 24px rgba(37,99,235,.35)` | 扫码 FAB |

主视觉仍是蓝色系操作色；红只用于金额与危险状态，绿/橙只用于状态标签。

## 字体与字号

- 字体：`-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif`
- 小程序 rpx 对齐现状：正文 28、次要 26、弱提示 24、标题 30–36、金额强调 32–36
- 金额一律 `font-weight: 600` + `--sm-danger`（列表总额）或 ink（表单输入）
- 单号/主标题 600；辅助说明 400

## 布局系统

- 水平边距 20rpx；卡片间距 16–20rpx
- 卡片内边距 24rpx；列表行分隔 1px `--sm-line`
- 列表页统一 sticky 头：搜索框 88 高 + 筛选 chips 横向滚动
- Tab 页底栏统一走 `TAB_PAGE_FOOTER_STYLE`（H5 避开 tabBar）
- 安全区：底栏 `env(safe-area-inset-bottom)`

## 组件约定

1. **SearchBox**：统一类名 `.sm-search`（图标 + 输入 + 清除），产品/订单/入库复用
2. **FilterChip**：`.sm-chip` / `.sm-chip-active`
3. **ListCard**：`.sm-list-card`（订单/入库/商品行统一阴影与按压）
4. **EmptyState**：`.sm-empty`（标题 + 副文案 + 可选操作按钮）
5. **StatusTag**：`.tag` + `-success|-warn|-danger|-muted`
6. **QtyStepper**：圆形 ±，按压缩放
7. **ScanFab / ScanHero**：保留现有，token 化颜色
8. **SectionTitle**：左对齐灰字，卡片外独立一行

## 动效

- 按压：`scale(0.96–0.98)`，`160ms ease-out`
- 不做入场动画；列表滚动保持原生

## 各页改造要点

### 查价（products）
- 搜索/chip 走统一 token；商品卡信息层级：名称 → 元数据 → 价格+快捷开单
- 空态已有引导，补强加载骨架感（首屏文字加载）

### 开单（order-new）
- 三步条保留；步骤摘要卡更紧凑
- 购物车：价格输入与数量步进分两行，避免挤在一行
- 底栏合计与主按钮权重更清晰
- 收款方式 2×2 网格保留，选中态边框更明显

### 订单/入库列表
- 统一 list-card；状态标签右上
- 待收款金额单独一行用 warn 色
- 空态补操作（入库页可「去入库」）

### 商品详情
- 头图更大比例；价格网格 2 列
- 入库价趋势改为纵向迷你条 + 日期 + 金额，变更高亮
- 敏感价小眼睛更可点

### 我的
- 头部渐变保留；统计卡三等分对齐
- 菜单行统一 chevron 与分隔

### 登录
- 表单卡保留；主按钮全宽；字段间距统一

## 端侧约束

- 小程序 + H5 同一套 class；不用 Taro Picker 直接写新选择器
- H5 底栏用 `TAB_PAGE_FOOTER_STYLE`
- 不引入 UI 组件库

## 下一期（本轮 Out of Scope）

- Capacitor/PWA 手机壳
- 本地 OCR / 可扩展 on-device AI 适配层
