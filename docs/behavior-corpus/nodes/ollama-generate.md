---
name: ollama-generate
description: "ローカル LLM を叩く HTTP 契約そのもの（メッセージ形式・パラメータ・接続失敗時のメッセージ）を知りたい瞬間"
metadata:
  node_type: library
  type: behavior
  provenance: "ailine.py:49-50,87-100"
---

## ①何をするか

```python
OLLAMA = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
DEFAULT_MODEL = os.environ.get("AILINE_MODEL", "qwen2.5-coder:7b")

def ollama_generate(model: str, messages: list, temperature: float = 0.2) -> str:
    body = json.dumps({
        "model": model, "messages": messages, "stream": False,
        "options": {"temperature": temperature, "num_predict": 1600, "num_ctx": 8192},
    }).encode()
    req = urllib.request.Request(f"{OLLAMA}/api/chat", data=body,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            d = json.load(r)
    except urllib.error.URLError as e:
        sys.exit(f"ollama に繋がらない ({OLLAMA}): {e}\n"
                 "★ `ollama serve` が動いているか確認。外部送信はしない設計。")
    return d.get("message", {}).get("content", "")
```

Ollama の `/api/chat` エンドポイントに `stream: false` で叩き、`message.content` の文字列を1つだけ取り出す（会話履歴はチャット形式の `messages` 配列で持ち回す ── [[repair-loop]] が失敗ごとに `assistant`/`user` を追記する）。

固定パラメータ: `num_predict=1600`（出力上限トークン）、`num_ctx=8192`（コンテキスト長。CONTRACT + few-shot + ヘルパカタログ + タスク文がこの中に収まる必要がある ── [[prompt-assembly]] 参照）、タイムアウト `300` 秒。

## ②なぜそうなっているか

- `OLLAMA_HOST`/`AILINE_MODEL` を環境変数で外出しにしているのは、モデルを差し替えて天井を測る実験（README の「モデル非依存」設計思想）をコード変更無しで行うため。実測: 7B で苦手層 0%→67%（few-shot 追加後）、より大きいモデルへの載せ替えは `--model` 一発で可能（推測: 環境変数はスクリプト経由の自動化用、`--model` は対話用の使い分け）。
- **外部にデータを送らない**が ailine 全体の設計上の柱の1つ（README・docstring 両方に明記）。`OLLAMA_HOST` の既定が `localhost` であること自体がこの柱の実装。
- 接続失敗時のメッセージに「外部送信はしない設計」と明記しているのは、`OLLAMA_HOST` を変えて外部 API に向けた場合に利用者が誤解しないための注意書き（この設計は「ローカル完結」を前提にしており、外部向け利用は想定外）。

## ③境界条件・エラー時挙動

- 接続エラー（`URLError`）はプロセスを即終了させる（`sys.exit`）。[[repair-loop]] のリトライ対象には**含まれない** ── 接続断はリトライしても直らないという判断（LLM が変な出力をする場合とは性質が違う）。
- レスポンスの `message.content` が無い場合は空文字列を返す（例外にしない）。空文字列は下流の [[extract-bas]]/[[valid-signature]] が「署名が無い」として自然に拾い、[[repair-loop]] の修復サイクルに乗る。
- タイムアウト（300秒超）は素の `urllib` の例外として送出される。`URLError` の派生かどうかは Python バージョン依存（未検証・TS 移植時は明示的に握ること）。

## ④他単位への依存

- [[prompt-assembly]] が組み立てた `messages` を渡す唯一の呼び出し元（[[repair-loop]] 経由）。
- 消費するプロンプト内容そのもの（CONTRACT・few-shot・ヘルパカタログ）は言語非依存の資産 ── `ASSETS.md` を参照。
