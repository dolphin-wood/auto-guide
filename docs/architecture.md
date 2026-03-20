# アーキテクチャ

## 概要

Auto Guide は AI を活用して、自然言語の説明からインタラクティブなユーザーオンボーディングガイドを自動生成します。システムには2つのコアフローがあります：

1. **生成**: ユーザーがジャーニーを記述 → AI エージェントが実際のブラウザ上で実行 → アクションを記録 → 構造化されたガイドを生成
2. **再生**: ユーザーが対象の Web サイトにアクセス → 拡張機能がガイドを読み込み → オーバーレイが各ステップをハイライト → ユーザーがガイドに従う

## システムアーキテクチャ

単一の Hono サーバープロセスで構成：

- CDP リレー（Playwright と Chrome 拡張機能間の WebSocket ブリッジ）
- Claude Agent SDK と組み込み MCP ツール（Playwright 経由のブラウザ操作）
- サイドパネル WebSocket ハンドラー（サイドバー UI への AI 出力ストリーミング）

```
                          Hono Server
                    ┌──────────────────────┐
 Sidepanel (React)  │  Claude Agent SDK    │  Extension Background
     │              │     query()          │         │
     │  操作手順     │       │              │         │
     │ ── WS ─────>│       ▼              │         │
     │              │  MCP Browser Tools   │         │
     │  streaming   │       │              │         │
     │ <── WS ─────│       ▼              │         │
     │              │   Playwright         │         │
     │              │       │              │         │
     │              │       ▼              │         │
     │              │   CDP Relay ── WS ──────────> │
     │              └──────────────────────┘         │
     │                                        chrome.debugger
     │                                               │
     │                                               ▼
     │                                          対象ページ
     │  show_overlay                                 │
     │ ──────── tabs.sendMessage ──────────> Content Script
     │ <─── overlay_next/previous/stop ────  (オーバーレイ)
```

2つの WebSocket 接続が共存：

- `Extension Background ↔ Hono /extension/ws` — CDP コマンドリレー（生成フェーズ）
- `Sidepanel ↔ Hono /sidepanel/ws` — AI 出力のストリーミング + ガイド管理

## 主要技術

| コンポーネント  | 技術                                                  |
| --------------- | ----------------------------------------------------- |
| CDP Relay       | Hono WebSocket + Chrome DevTools Protocol             |
| Browser Control | Playwright `connectOverCDP()` + `chrome.debugger` API |
| A11y Snapshot   | Playwright `_snapshotForAI()` internal API            |
| AI Agent        | Claude Agent SDK (TypeScript) + embedded MCP tools    |
| Extension       | WXT framework (Chrome MV3)                            |
| UI              | React + shadcn/ui + Tailwind CSS v4                   |
| Streaming       | WebSocket + Streamdown (streaming markdown)           |
| CSS Selectors   | `@medv/finder` bundled as IIFE                        |
| URL Matching    | `picomatch` (glob patterns)                           |
| AI Model        | Claude Opus 4.6 (`claude-opus-4-6`)                   |
| Logging         | pino                                                  |

## データモデル

### ActionRecord（生の記録）

```typescript
type ActionType = 'click' | 'fill' | 'select' | 'compute'

interface ActionRecord {
  action: ActionType
  ref?: string
  description?: string
  computedSelector?: string // pre-action CSS selector
  postSelector?: string // post-action CSS selector (if different)
  guideTargetRef?: string // a11y ref of widget container
  guideTargetSelector?: string // CSS selector of widget container
  params?: Record<string, string>
  url: string
  timestamp: number
}
```

### Guide（最終出力）

```typescript
interface Guide {
  id: string
  title: string
  description: string
  pages: GuidePage[]
}

interface GuidePage {
  urlPattern: string // glob pattern for URL matching
  title: string
  steps: GuideStep[]
}

interface GuideStep {
  id: string
  instruction: string
  substeps: GuideSubstep[]
}

interface GuideSubstep {
  targetSelector: string | string[] // CSS selector(s), array for fallback
  hint: string
  triggersNavigation?: boolean
}
```

### PlaybackState（再生状態）

```typescript
interface PlaybackState {
  guideId: string
  currentPageIndex: number
  currentStepIndex: number
  currentSubstepIndex: number
  active: boolean
}
```

### WebSocket メッセージ

Server → Sidepanel:

- `agent_text_delta` — Claude からのストリーミングテキスト
- `agent_think_start` / `agent_think_progress` / `agent_think_finished` — 思考ブロック
- `agent_tool_use` — 呼び出されたツール（名前 + 入力）
- `agent_tool_result` — ツールの実行結果
- `guide_complete` — 最終ガイド JSON の準備完了
- `generation_finished` — エージェント実行の完了
- `error` — エラーメッセージ

Sidepanel → Server:

- `generate` — ジャーニーの説明 + startUrl + tabId でガイド生成を開始
- `user_follow_up` — フォローアップメッセージ（text + tabId）
- `stop` — 生成をキャンセル
