# Chrome 拡張機能

## 状態管理

- **Sidepanel** = コントローラー（ガイドデータ、再生位置、生成ステータスを管理）。`?tabId=` URL パラメーターでタブごとにバインド。
- **Content Script** = 純粋なビュー（ステートレスなオーバーレイレンダラー）。`show_overlay` / `hide_overlay` メッセージに応答。
- **Background** = CDP リレークライアント + サイドパネルライフサイクル管理。

## 通信

```
Sidepanel → Content Script:  browser.tabs.sendMessage(tabId, msg)
Content Script → Sidepanel:  browser.runtime.sendMessage(msg)
Background ↔ Hono Server:   WebSocket (RPC protocol)
```

Content Script からのオーバーレイ操作メッセージ（`overlay_next`/`overlay_previous`/`overlay_stop`）は Background Script を経由してサイドパネルにルーティングされます。

## クロスページナビゲーション

1. ユーザーがナビゲーションをトリガーする要素をクリック
2. Content Script が破棄され、サイドパネルは存続
3. サイドパネルが `chrome.tabs.onUpdated` 経由で URL の変更を検知
4. 新しい URL をガイドページの `urlPattern` と照合（`picomatch` を使用）
5. 一致するページに自動切り替え、ステップ 0 にリセット
6. 新しい Content Script が `content_ready` を送信 → サイドパネルが 1 秒の遅延後にオーバーレイコマンドを送信（ページの DOM 安定化を待つため）

## 再生ナビゲーション

- 次へ/戻る: サブステップ、次にステップを進める/戻る
- クロスページ: ユーザーのブラウザ操作 + URL 検知により自然に発生
- `triggersNavigation: true`: URL が変更されるとサイドパネルが自動的に進む
