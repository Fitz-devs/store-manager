#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT/apps/api"

DB_NAME="store-manager-db"
BUCKET_NAME="store-manager-files"

echo "== 1/6 检查 Cloudflare 登录 =="
WHOAMI=$(bunx wrangler whoami 2>&1 || true)
if printf '%s' "$WHOAMI" | grep -q "not authenticated"; then
  echo "尚未登录，正在打开浏览器进行授权..."
  if ! bunx wrangler login; then
    echo ""
    echo "登录失败。可以二选一后重试："
    echo "  1) 手动执行：bunx wrangler login"
    echo "  2) 在 Cloudflare 控制台创建 API Token 后：export CLOUDFLARE_API_TOKEN=你的令牌"
    exit 1
  fi
fi

echo "== 2/6 准备 D1 数据库 =="
DB_ID=""
LIST_JSON=$(bunx wrangler d1 list --json 2>/dev/null || true)
if [ -n "$LIST_JSON" ]; then
  DB_ID=$(node -e "
    try {
      const list = JSON.parse(process.argv[1] || '[]')
      const found = list.find((item) => item.name === '$DB_NAME')
      if (found) process.stdout.write(found.uuid || found.id || '')
    } catch {}
  " "$LIST_JSON")
fi
if [ -z "$DB_ID" ]; then
  echo "创建 D1 数据库 $DB_NAME ..."
  CREATE_OUT=$(bunx wrangler d1 create "$DB_NAME" 2>&1 || true)
  DB_ID=$(printf '%s' "$CREATE_OUT" | grep -o 'database_id *= *"[^"]*"' | head -1 | cut -d'"' -f2)
  if [ -z "$DB_ID" ]; then
    DB_ID=$(printf '%s' "$CREATE_OUT" | grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  fi
  if [ -z "$DB_ID" ]; then
    echo "创建失败或无法解析输出，原始信息："
    printf '%s\n' "$CREATE_OUT" | tail -10
    exit 1
  fi
fi
node -e "
  const fs = require('fs')
  const file = 'wrangler.toml'
  const text = fs.readFileSync(file, 'utf8')
  fs.writeFileSync(file, text.replace(/database_id = \"[^\"]*\"/, 'database_id = \"' + process.argv[1] + '\"'))
" "$DB_ID"
echo "database_id 已写入 wrangler.toml：$DB_ID"

echo "== 3/6 准备 R2 存储桶 =="
bunx wrangler r2 bucket create "$BUCKET_NAME" > /dev/null 2>&1 && echo "已创建 $BUCKET_NAME" || echo "$BUCKET_NAME 已存在，跳过"

echo "== 4/6 配置 JWT_SECRET =="
if printf '%s' "${JWT_SECRET:-}" | grep -q .; then
  SECRET="$JWT_SECRET"
else
  SECRET=$(openssl rand -base64 32)
fi
printf '%s' "$SECRET" | bunx wrangler secret put JWT_SECRET > /dev/null
echo "JWT_SECRET 已配置（保存在 Cloudflare，不回显）"

echo "== 5/6 应用线上数据库迁移 =="
bunx wrangler d1 migrations apply "$DB_NAME" --remote

echo "== 6/6 部署 Worker =="
bunx wrangler deploy

echo
echo "完成。还需要手动做的事："
echo "1. 给 Worker 绑定自定义域名（Cloudflare 控制台 → Workers → 设置 → 域名与路由）"
echo "2. 可选：配置微信登录 secrets：bunx wrangler secret put WX_APPID / WX_SECRET"
echo "3. 可选：条码补全：bunx wrangler secret put ALI_MARKET_BARCODE_URL / ALI_MARKET_APPCODE / BARCODESPIDER_TOKEN"
echo "4. 可选：覆盖 OCR 模型：bunx wrangler secret put OCR_MODEL"
echo "5. 域名备案后接入阿里云 ESA，回源上面绑定的 Worker 自定义域名"
