# Auto Guide

AI を使って、自然言語の操作説明から Web アプリケーションのインタラクティブなオンボーディングガイドを自動生成するシステムです。

[Demo Video](https://youtu.be/wosJ6tOr6L8)

## 仕組み

1. **ガイド生成**: ユーザーが操作手順を自然言語で入力 → AI エージェントが実際のブラウザ上で操作を実行・記録 → 構造化されたガイドを生成
2. **ガイド再生**: 対象 Web サイト上でガイドを読み込み → オーバーレイが各ステップをハイライト表示 → ユーザーがガイドに沿って操作

## アーキテクチャ

```
                          Hono Server
                    ┌──────────────────────────┐
 Sidepanel (React)  │  Orchestrator (per-tab)  │  Extension Background
     │              │     │                    │         │
     │  generate    │     ▼                    │         │
     │ ── WS ─────>│  Claude Agent SDK        │         │
     │              │     query()              │         │
     │  streaming   │     │                    │         │
     │ <── WS ─────│     ▼                    │         │
     │              │  MCP Browser Tools       │         │
     │              │     │                    │         │
     │              │     ▼                    │         │
     │              │  Playwright              │         │
     │              │     │                    │         │
     │              │     ▼                    │         │
     │              │  CDP Relay ── WS ──────────────> │
     │              │  /cdp/:tabId             │         │
     │              └──────────────────────────┘         │
     │                                            chrome.debugger
     │                                            (per-tab attach)
     │                                                   │
     │                                                   ▼
     │                                              対象ページ
     │  show_overlay                                     │
     │ ──────── tabs.sendMessage ──────────────> Content Script
     │ <─── overlay_next/previous/stop ────────  (オーバーレイ)
```

- **Server**: Hono + Claude Agent SDK + Playwright（タブごとに独立したセッション管理）
- **CDP Relay**: Extension の `chrome.debugger` API と Playwright 間の WebSocket ブリッジ（[playwriter](https://github.com/remorses/playwriter) ベース）。`/cdp/:tabId` エンドポイントでタブごとに独立した Playwright 接続を管理
- **Extension**: WXT (Chrome MV3) + React + shadcn/ui（タブバインド型サイドパネル + スポットライトオーバーレイ）
- **Shared**: TypeScript 型定義（Guide, ActionRecord 等）

## セットアップ

### 前提条件

- Node.js 20+
- pnpm 10+
- Google Chrome

### インストール

```bash
git clone git@github.com:dolphin-wood/auto-guide.git
cd auto-guide
pnpm install
```

### 環境変数

```bash
cp .env.example .env
```

`.env` に以下を設定：

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 起動

ターミナルを 2 つ開いて：

```bash
# Terminal 1: サーバー起動
pnpm --filter server dev

# Terminal 2: 拡張機能（開発モード — Chrome が自動起動し拡張機能がインストールされます）
pnpm --filter extension dev
```

## 使い方

### ガイド生成

1. 対象の Web サイトを Chrome で開く
2. 拡張機能アイコンをクリックしてサイドパネルを開く
3. チャット欄に操作手順を入力（例: 「鹿児島から札幌への片道フライトを予約する」）
4. AI エージェントがブラウザ上で操作を実行し、ガイドを自動生成

### ガイド再生

1. サイドパネルの「Guides」タブから保存済みガイドを選択
2. 対象ページでオーバーレイが表示され、各ステップをハイライト
3. Next / Back ボタンまたはオーバーレイ内のボタンで操作を進める
4. ページ遷移時は自動的に次のページのステップに切り替わる

## プロジェクト構成

```
auto-guide/
├── packages/
│   ├── server/           # Hono サーバー + Agent SDK + CDP relay
│   │   └── src/
│   │       ├── agent/    # オーケストレーター, MCP ツール, プロンプト
│   │       │   ├── action-recorder.ts  # アクション記録
│   │       │   └── guide-validation.ts # ガイド検証
│   │       ├── relay/    # CDP relay (Extension ↔ Playwright)
│   │       └── ws/       # WebSocket ハンドラー
│   ├── extension/        # Chrome 拡張機能 (WXT + React)
│   │   ├── entrypoints/
│   │   │   ├── background.ts       # CDP relay クライアント
│   │   │   ├── sidepanel/          # サイドパネル UI
│   │   │   ├── content.ts          # コンテンツスクリプト
│   │   │   └── content/overlay/    # オーバーレイ実装
│   │   └── lib/                    # ユーティリティ・共通ロジック
│   └── shared/           # 共通型定義
```

## 技術スタック

| コンポーネント        | 技術                                              |
| --------------------- | ------------------------------------------------- |
| AI モデル             | Claude Opus 4.6 (`claude-opus-4-6`)               |
| AI エージェント       | Claude Agent SDK + MCP Tools                      |
| ブラウザ制御          | Playwright (`connectOverCDP`) + `chrome.debugger` |
| A11y スナップショット | Playwright `_snapshotForAI()`                     |
| サーバー              | Hono + WebSocket                                  |
| 拡張機能              | WXT (Chrome MV3)                                  |
| UI                    | React + shadcn/ui + Tailwind CSS v4               |
| ストリーミング        | Streamdown (streaming markdown)                   |
| CSS セレクター        | `@medv/finder`                                    |

## ドキュメント

詳細な設計ドキュメントは [docs/](docs/) を参照してください。
