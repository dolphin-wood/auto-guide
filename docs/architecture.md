# アーキテクチャ

## 概要

Auto Guide は AI を活用して、自然言語の説明からインタラクティブなユーザーオンボーディングガイドを自動生成します。システムには2つのコアフローがあります：

1. **生成**: ユーザーがジャーニーを記述 → AI エージェントが実際のブラウザ上で実行 → アクションを記録 → 構造化されたガイドを生成
2. **再生**: ユーザーが対象の Web サイトにアクセス → 拡張機能がガイドを読み込み → オーバーレイが各ステップをハイライト → ユーザーがガイドに従う

## システムアーキテクチャ

単一の Hono サーバープロセスで構成：

- CDP リレー（Playwright と Chrome 拡張機能間の WebSocket ブリッジ、マルチタブ対応）
- Claude Agent SDK と組み込み MCP ツール（Playwright 経由のブラウザ操作）
- サイドパネル WebSocket ハンドラー（タブごとのセッション管理 + AI 出力ストリーミング）

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

3つの WebSocket 接続が共存：

- `Extension Background ↔ Hono /extension/ws` — CDP コマンドリレー（共有、マルチタブ対応）
- `Sidepanel ↔ Hono /sidepanel/ws` — AI 出力のストリーミング + ガイド管理（タブごとにバインド）
- `Playwright ↔ Hono /cdp/:tabId` — CDP プロトコルブリッジ（タブごとに独立した接続）

## CDP Relay

CDP Relay は [playwriter](https://github.com/remorses/playwriter) プロジェクトの実装をベースに、Auto Guide 向けに適用・拡張しています。

Playwright は通常 Chrome をサブプロセスとして起動しますが、既に開いているユーザーのブラウザを操作するため、Chrome 拡張機能の `chrome.debugger` API を経由して CDP（Chrome DevTools Protocol）コマンドをリレーします。

### マルチタブ対応

CDP Relay はタブごとに独立したチャネル（`RelayChannel`）を管理します：

```typescript
interface RelayChannel {
  tabId: number
  playwrightWs: WSContext | null
  connectedTargets: Map<string, ConnectedTarget>
  targetsSentToPlaywright: Set<string>
}
```

- **ルーティング**: `/cdp/:tabId` エンドポイントで各 Playwright 接続をタブにバインド
- **セッション解決**: `sessionToTab: Map<string, number>` で CDP sessionId → tabId を逆引き
- **イベント配信**: Extension からの CDP イベントは sessionId でルーティングし、正しい Playwright 接続にのみ転送
- **同時実行**: 複数タブで同時にエージェントを実行可能

### コマンドフロー

```
Playwright → /cdp/:tabId → CDPRelay.routeCdpCommand(channel, ...)
  → sendToExtension('forwardCDPCommand', { sessionId, method, params })
  → Extension → chrome.debugger.sendCommand(debuggee, method, params)
  → chrome.debugger.onEvent → Extension → forwardCDPEvent
  → CDPRelay → sessionToTab lookup → sendToPlaywright(tabId, event)
```

## マルチセッション管理

サーバーはタブごとに独立したセッションを管理します：

```
Map<tabId, AgentOrchestrator> — タブごとのエージェントセッション
Map<tabId, WSContext>         — タブごとのサイドパネル WebSocket
Map<string, number>           — CDP sessionId → tabId の逆引き
```

各 `AgentOrchestrator` は独立した Playwright 接続、ActionRecorder、Agent SDK セッションを持ちます。

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
