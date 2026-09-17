# 微信小程序：本地开发与上线配置清单

适用于本仓库 `apps/miniapp`（Taro 4 + React 18）。按阶段勾选即可。

---

## 一、本地开发（先做这些就能跑）

### 1.1 本机工具

| 工具 | 用途 | 检查 |
|---|---|---|
| Bun 1.3+ | 安装依赖 / 启动 API | `bun --version` |
| 微信开发者工具 | 导入 `apps/miniapp`、预览/真机/上传 | 应用里应有 `wechatwebdevtools`（不是普通微信） |

安装微信开发者工具：

- 官网下载：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
- macOS 安装到 `/Applications/wechatwebdevtools.app`
- 首次打开用微信扫码登录

### 1.2 本地后端

```bash
cd apps/api
bun run migrate:local    # 首次；已有本地库可跳过
bun run dev              # http://127.0.0.1:8787
```

本地已开 `OCR_MOCK=1`（`wrangler.dev.toml`），OCR 走假数据，不依赖外部 key。

### 1.3 小程序构建

```bash
cd apps/miniapp
cp .env.development.example .env.development   # 若尚无该文件
# 编辑 .env.development：真机调试填电脑局域网 IP
bun run dev:weapp                               # watch 产出 dist/
```

`.env.development` 示例：

```
TARO_APP_API=http://192.168.x.x:8787
```

- 模拟器可用 `http://127.0.0.1:8787`
- **真机预览必须用局域网 IP**（`ipconfig getifaddr en0`），且手机与电脑同一 Wi-Fi

### 1.4 导入微信开发者工具

1. 打开微信开发者工具 → 导入项目
2. 目录选 **`apps/miniapp`**（不是仓库根目录；`project.config.json` 的 `miniprogramRoot` 已指向 `dist/`）
3. AppID：本地调试可先选「测试号」/ 保持 `touristappid`；有正式 AppID 后再替换
4. 「详情 → 本地设置」勾选：
   - [x] 不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书
5. 首次进入小程序会引导创建老板账号

### 1.5 可选：灌演示数据

API 已启动时另开终端：

```bash
cd apps/api
bun run seed:demo    # admin/admin123
```

---

## 二、正式 AppID（真机预览 / 上传 / 微信登录）

本仓库当前 AppID：`wxfba378cc2a6f590a`（已写入 `apps/miniapp/project.config.json`）。

若需更换：

1. 在 [微信公众平台](https://mp.weixin.qq.com)「开发管理 → 开发设置」复制 **AppID**
2. 填入 `apps/miniapp/project.config.json` 的 `appid` 字段
3. 重新 `bun run build:weapp`，开发者工具里确认项目 AppID

> AppSecret（AppSecret / 生成密钥）**不要写进仓库**，只配置为 Worker secret `WX_SECRET`。

---

## 三、上线前公众平台配置

线上入口：`https://wj.160847.xyz`（Worker 自定义域名，已部署）。

### 3.1 服务器域名（提审硬性要求）

「开发管理 → 开发设置 → 服务器域名」把下列域名加入 **request / uploadFile / downloadFile** 合法域名：

```
https://wj.160847.xyz
```

前置条件：域名 `160847.xyz` 必须已完成 **ICP 备案**，否则无法保存合法域名、无法提审。

### 3.2 隐私保护指引

「设置 → 服务内容声明 → 用户隐私保护指引」声明使用：

| 能力 | 用途 |
|---|---|
| 相册 / 摄像头 | 商品图、单据、回款凭证、送货水印 |
| 地理位置 | 送货水印 GPS（可选，不声明则无坐标） |
| 手机号 | 仅当小程序端通过微信官方组件/接口收集手机号时才声明；本应用客户电话为手填业务字段，可不声明 |

### 3.3 地理位置接口（送货水印）

「开发管理 → 接口设置」申请开通：

- **获取当前的地理位置、速度**（`wx.getLocation`）

未开通时水印只显示时间与订单地址，功能降级可用。

### 3.4 业务类目

自用工具类小程序一般选「工具 → 效率」或「商家自营」相关类目；以后台可选项和审核反馈为准。涉及线下零售经营的，按平台要求补充资质。

### 3.5 生产接口地址

`apps/miniapp/.env.production`（已提交）：

```
TARO_APP_API=https://wj.160847.xyz
```

上传前务必用生产地址构建：

```bash
cd apps/miniapp
bun run build:weapp
```

---

## 四、Worker Secrets（后端，按需）

在 `apps/api` 下：

```bash
bunx wrangler login

# 微信一键登录（必配才出「微信登录」按钮）
bunx wrangler secret put WX_APPID
bunx wrangler secret put WX_SECRET

# 收货单 OCR（必配才可真实识别；本地已有 OCR_MOCK）
bunx wrangler secret put ZHIPU_API_KEY

# 条码补全（可选，免费注册可提高额度）
bunx wrangler secret put APIZERO_KEY
```

| Secret | 作用 | 缺省行为 | 状态 |
|---|---|---|---|
| `WX_APPID` / `WX_SECRET` | code2session 换 openid，绑定账号 | 登录页无微信一键登录 | **已配置**（`wx_login_enabled: true`） |
| `ZHIPU_API_KEY` | 智谱 glm-ocr 识别收货单 | 本地 mock 可用；线上 OCR 失败 | 待配 |
| `APIZERO_KEY` | 极数本源条码查询 | 匿名 20 次/天，仍可用 | 可选 |

AppID/Secret 来源：微信公众平台「开发管理 → 开发设置」。

---

## 五、上传与提审

1. 微信开发者工具确认：
   - AppID 正确
   - 使用 `.env.production` 构建产物
   - 预览/真机走一遍：登录 → 查商品 → 开单 → 回款 → 送货拍照
2. 工具右上角「上传」→ 填版本号与备注
3. 公众平台「版本管理」提交审核 → 审核通过后发布
4. 首次发布后，可把体验版二维码给店员安装

---

## 六、常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 真机所有请求失败 | 用了 `127.0.0.1`；改 `.env.development` 为局域网 IP 并重新构建；或未勾选「不校验合法域名」 |
| 提审被拒：域名未备案 | 完成 `160847.xyz` ICP 备案后再配合法域名 |
| 没有微信登录按钮 | Worker 未配 `WX_APPID`/`WX_SECRET`，或未重新部署 |
| 水印没有 GPS | 未申请地理位置接口，或用户拒绝授权 |
| 开发者工具打开空项目 | 导入了仓库根目录；应导入 `apps/miniapp` |
| 摄像头/相册异常 | 隐私保护指引未声明对应能力 |

---

## 七、本地启动速查

```bash
# 终端 1 — API
cd apps/api && bun run migrate:local && bun run dev

# 终端 2 — 小程序 watch
cd apps/miniapp && bun run dev:weapp

# 开发者工具导入 apps/miniapp，勾选不校验合法域名
```
