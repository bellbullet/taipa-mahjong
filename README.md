# タイパ麻雀 🀄

筒・萬・索の 1〜3 だけを使った 1対1 のスピード麻雀。AI 対戦＋オンライン対戦（Firebase）。

## 機能

- **AI 対戦**: テンパイ自動リーチ宣言する戦略的 AI
- **オンライン対戦**: 4文字ルームコードで友達と対戦（Firebase Realtime DB、遅延〜100ms）
- **マッチ制**: 先取 1/3/5 本を選択可能
- **得点システム**: 連番+2 / 同数+1 / リーチ+1 / ドラ+1/枚 / 早上がり+1

-----

## 🚀 セットアップ手順

### 1. Firebase プロジェクト作成

1. [Firebase Console](https://console.firebase.google.com/) で「プロジェクトを追加」
1. プロジェクト名を入力（例: `taipa-mahjong`）→ Google Analytics は無効でOK → 作成
1. 左メニュー「**構築** → **Realtime Database**」→「データベースを作成」
- ロケーション: `asia-southeast1`（シンガポール、東京近い）または `us-central1`
- セキュリティルール: **「テストモードで開始」**を選択（後で変更）
1. 左メニュー「**プロジェクト設定**（歯車）」→ 一番下「**マイアプリ**」→ **`</>`（Web）**を選択
1. アプリ名（例: `taipa-mahjong-web`）入力 → Firebase Hosting は不要 → 登録
1. 表示される `firebaseConfig` の値をコピー（後で使う）

### 2. セキュリティルール設定（推奨）

Realtime Database → ルール タブ で以下に置き換える:

```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": true,
        ".write": true,
        ".validate": "$code.matches(/^[A-Z2-9]{4}$/)"
      }
    }
  }
}
```

→ **「公開」**ボタンで反映。

### 3. ローカルセットアップ

```bash
# 依存関係インストール
npm install

# 環境変数ファイル作成
cp .env.example .env

# .env を編集して、Firebase Console でコピーした firebaseConfig の値を貼り付け
# 例:
# VITE_FIREBASE_API_KEY=AIzaSyA...
# VITE_FIREBASE_DATABASE_URL=https://taipa-mahjong-default-rtdb.asia-southeast1.firebasedatabase.app

# 開発サーバー起動
npm run dev
```

ブラウザで <http://localhost:5173> を開いて動作確認。

### 4. GitHub にプッシュ

```bash
git init
git add .
git commit -m "Initial commit"

# GitHub で新規リポジトリを作成（Private 推奨、READMEなしで）
git remote add origin git@github.com:あなたのID/taipa-mahjong.git
git branch -M main
git push -u origin main
```

> ⚠️ **重要**: `.env` は `.gitignore` で除外済み。誤って push しないこと。

### 5. Vercel デプロイ

1. [Vercel](https://vercel.com/) にログイン（GitHub アカウントで）
1. 「**Add New Project**」→ 先ほどの GitHub リポジトリを **Import**
1. **Framework Preset**: `Vite` が自動選択される
1. 「**Environment Variables**」セクションを開いて、`.env` の中身を**全部**追加:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MSG_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
1. 「**Deploy**」ボタン

数十秒で `https://taipa-mahjong-xxx.vercel.app` 形式のURLが発行される。完了。

-----

## 🛠 開発コマンド

```bash
npm run dev      # 開発サーバー（http://localhost:5173）
npm run build    # 本番ビルド（dist/ に出力）
npm run preview  # ビルド結果のプレビュー
```

## 📂 ディレクトリ構成

```
taipa-mahjong/
├── index.html              # エントリーHTML
├── package.json
├── vite.config.js
├── .env.example            # 環境変数テンプレート
├── .env                    # 実際の値（Git管理外）
└── src/
    ├── main.jsx            # React エントリー
    ├── App.jsx             # ゲーム本体
    ├── firebase.js         # Firebase 設定とラッパー
    └── index.css           # グローバルCSS
```

## 💰 コストの目安

Firebase Realtime Database **Spark プラン（無料）**:

- 同時接続: 100
- ストレージ: 1 GB
- ダウンロード: 10 GB/月

→ **個人＋友人数人で遊ぶ範囲なら一生無料圏内**。万一を超えたら Blaze プラン（従量課金）に切り替えるだけ。

Vercel **Hobby プラン（無料）**:

- 帯域: 100 GB/月
- ビルド: 6000分/月

→ 同様に無料圏内。

## 🔧 トラブルシューティング

**Q. デプロイ後にオンライン対戦で「接続エラー」が出る**

- Vercel の Environment Variables が全部設定されているか確認
- Firebase の Realtime Database セキュリティルールが「公開」されているか確認
- Vercel で **Redeploy** が必要（環境変数変更後）

**Q. ローカルで動くがビルドで失敗する**

- `.env` の値が全部入っているか確認
- 改行や余分なスペースが入っていないか確認

**Q. 古いルームが残っている**

- 起動時に1時間以上経過したルームは自動削除
- 手動で消すなら Firebase Console から `rooms/` ノードを削除

## 📝 ライセンス

個人利用は自由。

-----

🎉 楽しんでください！
