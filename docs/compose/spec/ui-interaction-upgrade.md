---
feature: ui-interaction-upgrade
status: delivered
updated: 2026-09-14
branch: main
commits: working tree (repo has no baseline commit yet)
---

# UI Interaction Upgrade

## Report

**What was built** — 小程序与 H5 共用一套 design token（`app.scss` 的 `--sm-*` 变量）与共享列表组件类（`.sm-search` / `.sm-chip` / `.sm-list-card` / `.sm-empty` / `.sm-list-footer`）。查价、订单、入库、客户列表统一 sticky 搜索头、筛选 chips、卡片阴影与操作型空态；开单购物车改为「上行品名+小计、下行单价+数量」两行，价格输入用 draft 字符串避免焦点丢失与中途小数被改写；商品详情入库价趋势显示相对涨跌与最新一笔高亮；订单作废状态统一走 `orderStatusTagClass`（红标）。同时补上此前遗漏的 `pages/customers/index` 路由注册。

手机端 Capacitor/PWA 壳与本地 OCR/AI 明确为下一期，本轮只在 DESIGN.md/spec 中预留。

**Verification**
- `cd apps/miniapp && bun run build:weapp` → PASS (EXIT 0)
- `cd apps/miniapp && bun run build:h5` → PASS (EXIT 0)
- 静态审查两轮：第一轮 4 critical + 若干 major 已修；复审确认全部关闭，最后一处 customer-detail 作废标签也已对齐

**Journey log**
- Taro 页面 SCSS 是 page-scoped：跨页复用 class 必须放进 `app.scss`，否则样式静默失效（商品详情关联商品曾踩坑）
- 购物车行 `key` 不要包含可编辑字段（如 price），否则 Input 每次击键 remount 丢焦点
- `price_history.old_value` 在 `source=init` 时为 null，任何“相对上一次”UI 需显式可比判断
- 作废订单 `remaining` 被强制为 0，不能用 remaining>0 推导标签色，必须用 status 分支
- 仓库尚无 commit，本轮改动全在工作树

## [S1] Problem

小程序/H5 主流程已可用，但视觉与交互未系统化：

- 颜色/圆角/阴影散落在各页 scss，无统一 token，页面间观感漂移
- 查价/订单/入库的搜索框、筛选 chip、列表卡片各自一套 class，维护成本高
- 空态文案简陋（「暂无订单」等），缺操作引导
- 开单购物车：价格输入与数量步进挤在一行，小屏易误触
- 商品详情价格趋势是简易横条，变更不可读
- 「我的」菜单行与统计卡层级松散
- 手机端（Capacitor/PWA）+ 本地 AI 为下一期，本轮只做设计预留说明

## [S2] Design

见仓库根 `DESIGN.md`（色板、字号、布局、组件、各页要点）。

契约摘要：

1. **Design tokens** 定义在 `apps/miniapp/src/app.scss` 的 `page` 级 CSS 变量；页面样式引用变量。
2. **共享列表头**：`.sm-search`、`.sm-chip`、`.sm-list-card`、`.sm-empty`、`.sm-list-footer` 全局提供；products / orders / purchases / customers 复用。
3. **开单购物车行**两行布局 + 稳定 `lineId` + price draft，保证可编辑体验。
4. **商品详情趋势**：日期、相对条、金额、相对上一次涨跌；不可比显示 `—`；最新 primary。
5. **空态**：标题 + 副文案 + 可选操作。
6. **状态标签**：成功=已结清/在售，警告=待收款/部分回款，危险=缺货/已作废（`orderStatusTagClass`）。
7. 不改业务逻辑、API、路由结构（仅补注册缺失的 customers 列表页）；不引入组件库。
8. H5 与小程序共用 class；底栏继续用 `TAB_PAGE_FOOTER_STYLE`。

## [S3] Out of Scope

- Capacitor/PWA 手机壳与本地 OCR/AI 适配层（下一期）
- 后端 API、数据模型、业务规则
- 微信登录/备案/ESA
- 新增页面或 Tab 结构
- 图表库、动画库、UI 组件库

## Tasks

- [x] T1: 在 `app.scss` 落地 design tokens 与共享列表/搜索/空态/chip 类，并全局引用 — acceptance: H5/weapp 构建通过；全局类可用 (covers: S2.1, S2.2)
- [x] T2: 重构 products / orders / purchases（及 customers）列表页样式与空态，去重 class — acceptance: 列表页视觉一致，空态含标题+副文案+操作 (covers: S2.2, S2.5, S2.6)
- [x] T3: 开单页购物车两行布局 + 付款/步骤摘要细节打磨 — acceptance: 购物车行不挤，底栏合计清晰 (covers: S2.3)
- [x] T4: 商品详情趋势图与价格区、我的页菜单/统计、登录页字段间距对齐 token — acceptance: 详情趋势可读，Me/Login 使用共享样式 (covers: S2.4, S2.7)
- [x] T5: 构建验证 weapp + h5 — acceptance: `taro build --type weapp` 与 `--type h5` 无错误 (covers: S2.8)
