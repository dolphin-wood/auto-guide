# オーバーレイ実装

## Content Script の構造

- **Shadow DOM ホスト**: `<auto-guide-overlay>` カスタム要素がビューポート全体を覆う（`position: fixed`、`100vw × 100vh`、`z-index: 2147483646`）。ホスト要素の `pointerEvents: none` でページ操作を妨げない
- **Shadow Root**: `closed` モードの shadow root 内にすべてのオーバーレイ要素を配置し、ページのスタイルとの競合を防止
- **スポットライト**: `box-shadow: 0 0 0 9999px rgba(0,0,0,0.5)` でページ全体を暗くするマスクを作成し、対象要素を「穴」として表示。`pointerEvents: none` でクリックを透過
- **ツールチップ**: ヒントテキスト、ステップの進捗状況、Back/Next/Stop ボタンを含むフローティング指示バブル。`pointerEvents: auto` でボタン操作を可能にする
- **要素ファインダー**: `waitForElement()` は MutationObserver を使用して、対象要素が DOM に出現するまで最大 5 秒間リトライ（動的なページに対応）

## `waitForElement` の仕組み

1. まず `findTargetElement()` で即座に DOM を検索
2. 見つからない場合、`MutationObserver` を `document.body` に設定（`childList: true, subtree: true`）
3. DOM 変更が発生するたびにセレクターを再試行
4. 要素が見つかるか、5 秒のタイムアウトに達するまで監視を継続
5. `targetSelector` が配列の場合、各セレクターを順番に試行し最初にマッチしたものを返却

## ツールチップの配置

右 → 左 → 上 → 下の順に試行し、ビューポートに収まる最初の配置を選択します。

- **右/左配置**: 対象要素に対して**垂直方向に中央揃え**（`targetRect.top + height/2 - tooltipHeight/2`）
- **上/下配置**: 対象要素に対して**水平方向に中央揃え**（`targetRect.left + width/2 - tooltipWidth/2`）
- すべての配置で 8px のギャップとビューポート端からの 8px マージンを確保
- ビューポートに収まらない場合はクランプ処理で画面内に収める

## 位置追跡

オーバーレイ表示中、対象要素の位置変化を以下の3つの仕組みで追跡します。

- **ResizeObserver**: 対象要素と `document.documentElement` の両方を監視し、サイズ・レイアウト変更を検知
- **MutationObserver**: `document.body` の子要素変更を監視（`childList: true, subtree: true`）し、DOM 操作による位置ずれを検知
- **scroll リスナー**: `window` の `scroll` イベントをキャプチャフェーズで監視（`passive: true`）

すべてのオブザーバーは 50ms のデバウンス処理を共有し、スポットライトとツールチップの位置を同時に更新します。

## lastValidRect

`lastValidRect` フィールドは最後に有効だった要素の矩形情報を保持します。`getElementRect()` の結果が有効（`width > 0 && height > 0`）な場合のみ更新されます。これにより、ドロップダウンが閉じるなどの要素消失時にオーバーレイが突然消えることを防ぎます。

## クロスページオーバーレイ

ページ遷移時にオーバーレイが途切れないようにするため、以下のフローで処理します。

1. ページ遷移により Content Script が破棄される
2. 新しいページで Content Script がロードされ、`content_ready` メッセージを `runtime.sendMessage` で送信
3. サイドパネルの `runtime.onMessage` リスナーが `content_ready` を受信
4. 1 秒の遅延後（ページの DOM 安定化のため）、現在の再生位置のオーバーレイコマンドを新しい Content Script に送信

## 要素マッチング

再生時、`targetSelector` は文字列または文字列の配列のいずれかです。要素ファインダーは各セレクターを順番に試行し、最初に一致したものを返します。これにより DOM の状態差異に対応できます（例：コンボボックスの開閉前後）。
