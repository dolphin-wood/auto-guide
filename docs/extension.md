# Chrome 拡張機能

## 状態管理

- **Sidepanel** = コントローラー（ガイドデータ、再生位置、生成ステータスを管理）。`?tabId=` URL クエリパラメーターでタブごとにバインド。
- **Content Script** = 純粋なビュー（ステートレスなオーバーレイレンダラー）。`show_overlay` / `hide_overlay` メッセージに応答。
- **Background** = CDP リレークライアント + サイドパネルライフサイクル管理。

## タブごとのサイドパネル

サイドパネルはタブごとに独立して管理されます。

- `action.onClicked` リスナーでアイコンクリック時にタブ固有のサイドパネルを開く
- `sidePanel.setOptions({ tabId, path: "sidepanel.html?tabId=..." })` でタブごとに異なるパスを設定
- `sidePanel.open({ tabId })` で対象タブにサイドパネルを表示
- サイドパネルは URL クエリパラメーターから `boundTabId` を取得し、以降すべてのメッセージ送受信にこの `tabId` を使用

### `build:manifestGenerated` フック

WXT の `build:manifestGenerated` フックで、ビルド時にマニフェストから `side_panel` キーを削除します。これはサイドパネルのデフォルトパスがマニフェストに含まれないようにするためです（タブごとに動的にパスを設定するため）。

```typescript
hooks: {
  'build:manifestGenerated': (_wxt, manifest) => {
    delete (manifest as Record<string, unknown>).side_panel
  },
},
```

## マルチタブサポート

各サイドパネルインスタンスは独自の WebSocket 接続をサーバーに確立します。サーバー側（`sidepanel-handler.ts`）では `tabId` をキーとしてセッションを管理します。

- `tabWs`: `Map<number, WSContext>` — タブ ID から WebSocket への対応
- `wsTab`: `Map<WSContext, number>` — WebSocket からタブ ID への対応
- `sessions`: `Map<number, AgentOrchestrator>` — タブ ID ごとに独立した `AgentOrchestrator` を管理

最初のメッセージ受信時に WebSocket がタブにバインドされ、以降そのタブ専用の Orchestrator にルーティングされます。

## 通信

```
Sidepanel → Content Script:  browser.tabs.sendMessage(tabId, msg)
Content Script → Sidepanel:  browser.runtime.sendMessage(msg)
Background ↔ Hono Server:   WebSocket (RPC protocol)
Sidepanel ↔ Hono Server:    WebSocket (ws://localhost:3100/sidepanel/ws)
```

Content Script からのオーバーレイ操作メッセージ（`overlay_next`/`overlay_previous`/`overlay_stop`）は `runtime.sendMessage` で送信され、サイドパネルの `runtime.onMessage` リスナーで受信されます。

## クロスページナビゲーション

1. ユーザーがナビゲーションをトリガーする要素をクリック
2. Content Script が破棄され、サイドパネルは存続
3. サイドパネルが `chrome.tabs.onUpdated` 経由で URL の変更を検知
4. 新しい URL をガイドページの `urlPattern` と照合（`picomatch` を使用）
5. 一致するページに自動切り替え、ステップ 0 にリセット
6. 新しい Content Script が `content_ready` を送信 → サイドパネルが 1 秒の遅延後にオーバーレイコマンドを送信（ページの DOM 安定化を待つため）

Background Script も `tabs.onUpdated` を監視し、URL 変更を `url_changed` メッセージとしてブロードキャストします。

## 再生ナビゲーション

- 次へ/戻る: サブステップ、次にステップを進める/戻る
- クロスページ: ユーザーのブラウザ操作 + URL 検知により自然に発生
- `triggersNavigation: true`: URL が変更されるとサイドパネルが自動的に進む
