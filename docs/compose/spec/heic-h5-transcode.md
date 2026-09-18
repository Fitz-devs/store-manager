---
feature: heic-h5-transcode
status: delivered
updated: 2026-09-18
branch: fix/heic-h5-transcode
commits: 3df0340..3f67685
---

# H5 端上传图统一转 JPEG（WASM）

## Report

**What was built** — H5(Web)端上传图片现在统一经 WASM 管线转 JPEG：HEIC（ftyp 魔数嗅探命中）用
libheif-js（libheif-wasm 内联 bundle，实例跨上传复用）解码，其余格式用 createImageBitmap 原生解码并
直接绘制到目标尺寸 canvas 读取像素（规避 iOS WebKit 全尺寸画布面积上限）；统一降采样至最长边 1600px，
再由 @jsquash/jpeg（MozJPEG WASM，quality 80）编码为 `image/jpeg` 上传，入库产物永远是真 JPEG。
解码失败（老浏览器/异常 HEIC）一律报错拒绝上传，"原始 HEIC 字节进系统"的路径已全部封死。
小程序端逻辑零改动（chooseMedia 压缩档 + compressImage 双道压缩本就输出 JPEG），后端零改动。
随统一转码而来的有意行为变化：非图片文件不再透传（被拒绝）；PNG 透明通道转 JPEG 后丢失。

**Verification** —

- `bun x tsc --noEmit -p apps/miniapp/tsconfig.json`：11 个错误全部为 main 基线遗留（pages/*、utils/map.ts），media* 零错误 — PASS
- WASM 冒烟（sips 生成真实 HEIC 2000×1500，bun 运行、与生产同一浏览器入口 bundle）：嗅探命中 → libheif 解码 → 降采样 1600×1200 → MozJPEG 输出 FFD8 合法 JPEG — PASS
- `build:h5` — PASS：dist-h5/chunk/ 懒加载块含转码代码，2 个 wasm 资源按需产出，主包体积不变（339KB）
- `build:weapp` — PASS：dist/ 中 grep 无 libheif/mozjpeg/HeifDecoder、无 *.wasm，平台隔离确认
- 独立审查（general 子代理）：spec compliance 逐条满足、correctness 无 critical/major、codebase consistency 一致；3 个 minor 已修复并复验（WASM 实例复用 + HeifImage.free()、非 HEIC 直接绘制目标尺寸、空文件名兜底）

**Journey log** —

- libheif-js 浏览器端正确入口是子路径 `libheif-js/libheif-wasm/libheif-bundle.mjs`（wasm 内联工厂函数，`await factory()` 得到挂 HeifDecoder 的 Module）；主入口为 Node 版（fs 依赖），会让 h5 webpack 构建直接失败。
- 曾评估统一转 WebP 后放弃：GLM-OCR 官方仅支持 JPG/PNG 输入，且 weapp image 组件 webp 属性有兼容负担；全 JPEG 是全链路最稳的统一格式。
- Taro 平台后缀入口（media.ts / media.h5.ts）的签名漂移 tsc 抓不到（页面 import 恒解析到 media.ts），改一端必须人工比对另一端导出。
- H5 全尺寸 canvas 桥在 iOS WebKit 有 ~16.7M px² 面积上限，超大图会静默产出空白像素；解码桥应直接绘制到目标尺寸。
- bun remove 后 lock/manifest 干净，但本地 node_modules/.bun/ 残留旧包目录，核查依赖时勿以 node_modules 为准。

## [S1] Problem
Web(H5)端上传图片存在 HEIC 漏网路径：

- 文件 ≤1.2MB 时跳过压缩原样上传（原 `compressImageFile` 的体积门槛）；
- `createImageBitmap` 解码失败（老 Safari/部分浏览器解不了 HEIC）时 catch 后原样上传。

后端按声明 Content-Type 存为 `.jpg` 后缀，但字节仍是 HEIC，安卓端无法显示。小程序端经
`chooseMedia(compressed)` + `compressImage` 双道压缩天然输出 JPEG，无此问题（保持零改动）。

## [S2] Design
沿用项目平台后缀文件模式（同 `scan` / `watermark`），页面 import 路径 `utils/media` 不变：

- `media.ts`（小程序端入口）：`pickImages`（chooseMedia）+ `uploadLocalImage`
  （compressImage(quality 80) → uploadImage），逻辑保持现状。
- `media.h5.ts`（H5 端入口）：`pickImages`（DOM input）+ `uploadLocalImage` 统一转码管线：
  1. 解码 RGBA：HEIC（ftyp 魔数嗅探命中）→ `libheif-js/libheif-wasm/libheif-bundle.mjs`
     （WASM 内联，动态 import 懒加载，模块级 memoize 复用实例，decode 后 `HeifImage.free()`）；
     其余格式 → `createImageBitmap` 原生解码，DOM canvas 直接绘制到目标尺寸读取像素
     （canvas 仅作像素读取桥，不参与压缩编码）。
  2. 降采样至最长边 1600px：非 HEIC 在绘制时完成；HEIC 解码产物由 JS box-filter 完成
     （`downscaleImageData`，对已达标输入幂等）。
  3. `@jsquash/jpeg`（MozJPEG WASM，动态 import 懒加载）quality 80 编码为 `image/jpeg`，输出 File(.jpg)。
  4. 解码失败一律抛错拒绝上传（文案经调用方 toast 透出），绝不原样上传 HEIC 字节。
- `media-common.ts`：两端共享类型（UploadScope / LocalImage / PickSource）。
- libheif-js 无类型声明，在 `types/libheif-js.d.ts` 提供最小声明。
- WASM 依赖只出现在 `media.h5.ts` 依赖图，weapp 构建经平台文件机制天然不打包。

## [S3] Out of Scope
- 小程序端任何改动（用户明确要求不改；其链路已保证 JPEG 输出）。
- 后端 files.ts（image/jpeg → .jpg 命名已正确，无需魔数嗅探）。
- WebP 输出（经评估放弃：GLM-OCR 官方仅支持 JPG/PNG 输入；weapp image 组件 webp 属性存在兼容负担）。
- OCR / 水印链路（全 JPEG 输出对 glm-ocr 更友好；水印产物经 uploadLocalImage 自动走新管线）。

## Tasks
- [x] T1: media 平台文件拆分 + H5 WASM 统一转码管线 — acceptance: 本地冒烟脚本将 sips 生成的真实 HEIC 解码→降采样→MozJPEG 编码为合法 JPEG（FFD8 魔数），尺寸 ≤1600px (covers: S2)
- [x] T2: 双端构建与类型验证 — acceptance: tsc 零新增错误；build:h5 通过且 dist-h5 含 wasm 懒加载 chunk；build:weapp 通过且 dist 不含 libheif/jsquash 产物 (covers: S2; depends: T1)
