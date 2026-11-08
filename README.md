# literacy · 绘本识字

识别绘本图片中的文字。仓库采用 pnpm monorepo 管理，包含 uni-app x 客户端与 Python OCR 服务。

## 目录结构

```
literacy/
├── apps/
│   └── uni-app/              # uni-app x 客户端（由 HBuilderX 编译）
│       ├── pages/            # index / literacy / game
│       ├── static/
│       ├── manifest.json
│       └── package.json      # @literacy/uni-app
├── services/
│   └── ocr-lab/              # FastAPI + RapidOCR 识别服务
│       ├── app.py
│       ├── test_ocr.py
│       └── requirements.txt
├── packages/
│   └── shared-config/        # 客户端与服务共享的 OCR 配置
│       ├── config.example.js # 配置模板（入库）
│       └── config.js         # 本地真实配置（不入库）
├── package.json              # 工作区根入口与统一脚本
├── pnpm-workspace.yaml
└── README.md
```

## 环境要求

- Node.js 22+、pnpm 12+
- HBuilderX（编译运行 `apps/uni-app`）
- Python（推荐使用已有的 conda 环境 `ocr-lab`）

## 初始化

```bash
# 1. 安装 JS 工作区依赖
pnpm install

# 2. 生成本地配置（首次或换环境时）
cp packages/shared-config/config.example.js packages/shared-config/config.js
# 编辑 packages/shared-config/config.js，填入 BASE_URL 与 API_KEY

# 3. 安装 OCR 服务依赖（或在 conda 环境中安装）
pnpm ocr:install
```

> `packages/shared-config/config.js` 含密钥，已被 `.gitignore` 忽略，不要提交。

## 开发

OCR 服务（先激活已有的 conda 环境）：

```bash
conda activate ocr-lab
pnpm ocr:dev    # 启动 FastAPI，监听 0.0.0.0:8000
pnpm ocr:test   # 用 test.jpg 跑一次本地识别
```

客户端：

1. 在 HBuilderX 中导入 `apps/uni-app` 目录（目录已从 `uni-app/` 迁移，需重新导入）。
2. 运行到微信小程序或 App，识别请求地址取自
   [literacy.uvue](apps/uni-app/pages/literacy/literacy.uvue) 中引用的 `packages/shared-config/config.js`。

公网调试（可选）：

```bash
cpolar http 8000
```

将生成的公网地址填入 `config.js` 的 `BASE_URL`。
