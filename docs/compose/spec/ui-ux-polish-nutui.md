---
feature: ui-ux-polish-nutui
status: delivered
updated: 2026-09-15
branch: main
commits: 03ab7c8..HEAD
---

# UI/UX Polish + NutUI

## Report

**What was built** — 引入 `@nutui/nutui-react-taro@3.0.23-cpp` 并把品牌色映射到现有 `--sm-*` 蓝主色；NutUI 用于 Empty / Tag。新建共享组件 EmptyState、SearchBox、StatusTag、Stepper、ListLoading，列表页统一搜索防抖、加载态与空态。

交互修复覆盖 P0：列表搜索不再读陈旧 keyword；登录失败可重试；客户/入库/商品/订单详情失败显示重试而不是无限「加载中」；价格趋势改为 View 条形图（weapp 可渲染）；敏感价按 SKU 点击切换；条码先创建再删旧码；我的页缺货跳转商品列表；作废/下架有 try/catch；分页加载不整页闪 loading；电话/金额键盘；购物车减到 0 有移除提示。P1/P2：customer-select 防抖搜索、customers 页脚、token 化硬编码色、sm-list-card、加大点击区、分类空态、ScanFab H5 避开 tabBar、sticky chips、分类改 `/api/categories`、删除未用 `ui-copy.ts`。

**Verification**
- `cd apps/miniapp && bun run build:weapp` → PASS (EXIT 0)
- `cd apps/miniapp && bun run build:h5` → PASS (EXIT 0)
- 子代理 review：初版 1 critical（order-detail 错误态）已修；其余为非阻塞一致性项

**Journey log**
- NutUI 3.x 无 `Stepper`，数量步进最终用自研 `sm-stepper`，以便 − 到 0 可触发移除；Empty/Tag 用 NutUI
- NutUI brand 默认红，必须在 page/html/body 覆盖 `--nutui-color-primary` / `--nutui-brand-*`
- 列表 `loading` 且已有 items 时只显示 footer「加载中…」，不要替换整列表
- Taro H5 上 SVG 原生节点不可靠，趋势图改为 View 条

## [S1] Problem

上一轮已落地 design token 与共享列表 class，但审查仍发现约 30 处问题：

- 真交互 bug：订单搜索陈旧词、登录 API 失败卡死、详情页失败无限「加载中」、价格趋势 SVG 在 weapp 空白、敏感价仅 touch 无法用鼠标、我的页「缺货商品」跳错、电话字段无数字键盘、列表分页时整页闪「加载中」
- 一致性缺口：customer-select 无防抖搜索、customers 缺 list-footer、硬编码色散落、空态/加载态不统一
- 组件重复：搜索框/空态/步进器/状态标签各页手写
- 用户明确要求引入 NutUI-React，并做 P0+P1+P2 全量

## [S2] Design

### 组件库策略

- 引入 `@nutui/nutui-react-taro`（3.x），**按需使用**，不整页替换
- 主题映射：NutUI CSS 变量覆盖为现有 `--sm-*` 色板（蓝主色 `#2563eb`）
- 仍保留：平台选择器（H5 Picker hydration bug）、`Taro.showModal/Toast`（原生反馈更贴微信）、ScanFab/ScanHero 自定义视觉
- 新建共享 React 组件（薄封装 + 现有 class，必要时叠 NutUI）：
  - `components/empty-state` — 标题/副文案/操作
  - `components/search-box` — 图标+输入+清除+防抖
  - `components/status-tag` — success/warn/danger/muted
  - `components/stepper` — 数量 ±
  - `components/list-loading` — 首屏/分页加载态

### P0（必须修）

1. orders/customers/purchases 搜索：同步 `keywordRef`，防抖请求不读陈旧 state
2. login：setup-status 失败进入可重试错误态，不再卡 loading
3. customer-detail / purchase-detail / order-detail / product-detail：加载失败 → `sm-empty` + 重试；非法 id 显示不存在
4. price-line-chart：weapp 用 View 条形图，H5 可保留 SVG（或统一 View 条）
5. product-detail 敏感价：tap-toggle + click 兜底，按 sku 独立
6. product-edit 条码保存：先创建新码再删旧码；失败有 toast
7. me 缺货统计跳转 → `product-list?stock=1`
8. order-detail / product-detail 作废与归档补 try/catch
9. 列表分页：`loading` 且已有 items 时只显示 footer 加载文案，不整页替换
10. order-new 电话 `type=number` + maxlength；cart 减到 0 有「已移除」提示

### P1（一致性）

11. customer-select：sm-search + 350ms 防抖 + 清除
12. customers 补 list-footer
13. 手机号字段统一 `type="tel"`；金额/数量 `type="digit"`
14. customer-edit 地址/备注用 Textarea
15. 硬编码色 token 化（product-edit/detail、purchase-*、customer-*、login、order-new Switch）
16. customer-detail 订单列表改 `sm-list-card`
17. 小点击区（编辑/删除/设为默认）加大 hit area
18. categories 空态/加载态 + token
19. me 改密/加店员校验与登录 setup 对齐（用户名≥2、密码≥6）
20. ScanFab H5 底栏避开 tabBar
21. product-list filter chips 与 toolbar sticky 对齐
22. purchase-detail kind tag 与列表一致
23. home 统计 loading 占位
24. product-list 分类 chips 改用 `/api/categories`（含关联表分类）

### P2（抛光）

25. 删除死 SCSS/未用 Collapse/ui-copy 死文件或合并 placeholders
26. 可抽取的重复 JSX 收敛到共享组件（不强行大拆 GoodsTradeEditor）
27. 文案与按钮 loading 态统一

### 契约

- 不改业务 API/数据模型/路由结构
- 不引入 Capacitor/PWA
- 小程序 + H5 同一套组件 class；底栏继续 `TAB_PAGE_FOOTER_STYLE`
- NutUI 仅作能力补充，最终视觉仍以 `--sm-*` 为准

## [S3] Out of Scope

- Capacitor/PWA 手机壳、本地 OCR
- 后端 API 与迁移
- 微信登录配置/备案
- 整站改造成 NutUI 默认皮肤
- 图表库/动画库

## Tasks

- [x] T1: 安装 NutUI-React-Taro，app.scss 主题变量映射 — acceptance: weapp/h5 构建通过，主题变量生效 (covers: S2 组件库策略)
- [x] T2: 新建 empty-state/search-box/status-tag/stepper/list-loading 共享组件 — acceptance: 组件可在列表/详情页复用 (covers: S2)
- [x] T3: P0 bug 修复（搜索/登录/详情错误态/趋势图/敏感价/条码保存/me 跳转/作废 try-catch/分页 loading/电话键盘/cart 移除） — acceptance: 对应交互不再卡死或误导 (covers: S2 P0)
- [x] T4: P1 一致性改造（防抖搜索/footer/token/键盘/textarea/卡片/点击区/categories/me 校验/ScanFab/sticky chips/分类 API） — acceptance: 列表页观感与行为对齐 (covers: S2 P1)
- [x] T5: P2 死代码与文案收敛 — acceptance: 无未引用 ui-copy，死 class 删除 (covers: S2 P2)
- [x] T6: `build:weapp` + `build:h5` 回归 — acceptance: 双端 EXIT 0 (covers: 全部)
