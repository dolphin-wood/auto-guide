# ガイド生成

## 概要

1回の Agent SDK `query()` セッションで両フェーズを処理します。エージェントは MCP ブラウザツールを使用してジャーニーを実行し、記録されたアクションログからガイドを構成します。

## フェーズ 1: 実行と記録

- エージェントは実際のブラウザ上でユーザージャーニーの完了に集中
- すべての MCP ツール呼び出し（`page_click`、`page_fill`、`page_select`）は自動的に生の `ActionRecord` をキャプチャ
- CSS セレクターはアクションの**前**（pre-action）に `computeSelector` で計算される。これによりアクション前の DOM 状態（=再生時にユーザーが見る状態）に一致するセレクターが取得される
- アクション実行後にも `postSelector` を計算し、DOM の変化による要素の変更をキャプチャ（例：入力をクリックするとコンボボックスが開く）
- `guide_target_ref` が指定されている場合、アクション後に `guideTargetSelector`（ポップアップコンテナ等のセレクター）を計算
- エージェントは `_snapshotForAI()` を使用して ref 付きのアクセシビリティツリーを取得し、さらにスクリーンショット（JPEG、quality=50）で視覚的に把握
- 不可逆なアクション（決済ボタン、送信ボタン等）の場合、エージェントは `compute_selector` ツールを使用してクリックせずに要素のセレクターのみを記録（アクションタイプ `compute`）

## フェーズ 2: サニタイズと構成

- エージェントが `get_action_log` を呼び出して記録されたすべてのアクションを取得
- ガイド JSON を構成：
  - アクションを URL ごとにページにグループ化
  - 関連するアクションを明確な指示付きのステップにグループ化
  - 各アクションは1つのサブステップに対応（1:1 のマッピング、click+fill のマージなし）
  - 利用可能な場合は `guideTargetSelector` を使用し、そうでなければ `computedSelector` + `postSelector` から `targetSelector` 配列を構築
  - ノイズを除去（リトライ、探索的な操作）
- 最終ガイド JSON で `submit_guide` を呼び出し

## MCP ブラウザツール

サーバープロセス内の `createBrowserMcpTools()` で定義。エージェントはスナップショットから取得した a11y ref を入力として使用します。

| Tool               | Params                                             | 説明                                                                                |
| ------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `page_snapshot`    | —                                                  | `_snapshotForAI` 経由で a11y ツリーを取得 + JPEG スクリーンショット（常に含まれる） |
| `page_click`       | `ref`, `description`, `guide_target_ref?`          | 要素をクリック、pre/post セレクターを記録                                           |
| `page_fill`        | `ref`, `value`, `description`, `guide_target_ref?` | 入力欄に入力、pre/post セレクターを記録                                             |
| `page_select`      | `ref`, `value`, `description`, `guide_target_ref?` | オプションを選択、pre/post セレクターを記録                                         |
| `compute_selector` | `ref`, `description`                               | アクションを実行せずにセレクターを計算（アクションタイプ `compute` で記録）         |
| `get_action_log`   | —                                                  | 記録されたアクションログ JSON を返却                                                |
| `submit_guide`     | `guide` (JSON string)                              | 最終ガイドを検証して送信                                                            |

エージェントは MCP ツールに加えて、Agent SDK の組み込みツール（`Read`、`Grep`、`Glob`）も使用します。スナップショットファイルの検索に `Grep` を使用し、ファイルの読み取りに `Read` を使用します。

## guide_target_ref

ウィジェット内をクリックする場合、`guide_target_ref` にはクリックされる特定のオプションではなく、ユーザーが注目すべきコンテナを設定します。アクション後に `guideTargetSelector` として CSS セレクターが計算されます。

- **ウィジェットを開く場合**（ドロップダウントリガー、日付入力）: `guide_target_ref` を省略 — トリガー自体をハイライト
- **開いたポップアップ内で選択する場合**（ドロップダウンメニュー、カレンダー、オートコンプリート）: `guide_target_ref` = ポップアップ/リストコンテナの ref
- **独立した要素**（ボタン、リンク、入力欄）: `guide_target_ref` を省略

## セレクター計算

各 `page_click`/`page_fill`/`page_select` は2つのセレクターを計算します：

- `computedSelector`（pre-action）: アクション実行**前に** `computeSelector()` を呼び出し計算。再生時にユーザーが見る状態に一致するセレクターを取得
- `postSelector`（post-action）: アクション実行**後に**計算。`preSelector` と異なる場合のみ記録（同一の場合は `undefined`）

CSS セレクターは `@medv/finder` を使用して計算され、`page.addInitScript()` 経由で IIFE としてページに注入されます。初回注入時は `addInitScript` と `page.evaluate` の両方で注入し、現在のページと将来のナビゲーション先の両方で利用可能にします。

## DOM 変更検知

各 `page_click`/`page_fill`/`page_select` の実行時、以下のフローで DOM 変更を検知します：

1. アクション実行前に `MutationObserver` を `document.body` に設定（`childList: true, subtree: true`）
2. `addedNodes` と `removedNodes` の合計をカウント
3. アクション実行後、500ms 待機して DOM を安定化
4. オブザーバーを切断し、変更カウントを収集

検知結果に基づくヒント：

- **URL 変更**が検知された場合: 「Page navigated to a new URL. Call page_snapshot to see the new page.」
- **DOM 変更**が検知された場合（3 を超えるノードの追加/削除）: 「Significant DOM changes detected. Consider calling page_snapshot.」

これにより、エージェントはページの状態に関する理解をいつリフレッシュすべきかを判断できます。動的な UI（モーダルの表示、ドロップダウンの展開、ページ遷移など）でのアクション後に特に重要です。

## CDP リレー

CDP リレーの実装は [playwriter](https://github.com/remorses/playwriter) を参考にしています。

Playwright と Chrome 拡張機能間の TypeScript WebSocket リレー。

### Extension → Server RPC プロトコル

```typescript
interface RPCRequest {
  id: number
  method: string
  params?: Record<string, unknown>
}
interface RPCResponse {
  id: number
  result?: unknown
  error?: string
}
interface RPCEvent {
  method: string
  params: Record<string, unknown>
}
```

主要な RPC メソッド: `forwardCDPCommand`, `createInitialTab`, `getTabs`, `ping`

### Playwright → Server

標準的な CDP JSON メッセージ。サーバーは `Target.*` と `Browser.*` コマンドをインターセプトし、残りは `forwardCDPCommand` RPC 経由で拡張機能に転送します。
