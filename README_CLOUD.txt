HIRO's トレンドインサイト（AI連携版）クラウド対応パック

このフォルダは「そのままクラウドに載せられる」形にしてあります。
UIは index.html をそのまま使用し、AI連携は server.js が担当します。

最短で公開URLにする（おすすめ：Render）
1) GitHubにこのフォルダをpush
2) Renderで New → Web Service → リポジトリ選択
3) Build: npm install / Start: npm start
4) Environmentに OPENAI_API_KEY を登録
5) Deploy → 発行されたURLでアクセス

Railwayで公開（次点）
1) GitHubにpush
2) Railwayで Deploy from GitHub
3) Variablesに OPENAI_API_KEY を登録
4) デプロイ完了後のURLでアクセス

Dockerで動かす（任意）
docker build -t hiro-trend-insight-ai .
docker run -p 3000:3000 -e OPENAI_API_KEY=xxxx hiro-trend-insight-ai

重要
・APIキーは必ず環境変数で管理（.envやコードに直書きしない）
