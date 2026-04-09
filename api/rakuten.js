/**
 * Vercel Serverless Function: 楽天商品検索API プロキシ
 *
 * 配置場所: api/rakuten.js （ec-checkリポジトリのapi/ディレクトリ直下）
 * URL: https://ec-check.vercel.app/api/rakuten
 *
 * GASから呼ばれ、Refererヘッダーを注入して楽天新APIにアクセス
 * （GASとCloudflare Workersは Refererヘッダーを送れないためプロキシが必要）
 *
 * 使い方:
 *   GET https://ec-check.vercel.app/api/rakuten?itemCode=shop:item&applicationId=uuid&accessKey=pk_...
 *
 * 環境変数（任意、Vercelダッシュボードで設定）:
 *   RAKUTEN_PROXY_TOKEN: 認証用シークレットトークン（X-Auth-Tokenヘッダー or ?token=クエリ）
 */

const RAKUTEN_API_URL = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601';
const REFERER_URL = 'https://script.google.com';

export default async function handler(req, res) {
  // CORS ヘッダーを常に設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 認証チェック（環境変数 RAKUTEN_PROXY_TOKEN が設定されている場合のみ）
  const expectedToken = process.env.RAKUTEN_PROXY_TOKEN;
  if (expectedToken) {
    const authToken = req.headers['x-auth-token'] || req.query.token || '';
    if (authToken !== expectedToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const { itemCode, applicationId, accessKey } = req.query;

  if (!itemCode || !applicationId || !accessKey) {
    return res.status(400).json({
      error: 'Missing parameters',
      required: ['itemCode', 'applicationId', 'accessKey'],
    });
  }

  // 楽天新APIにリクエスト（Node.jsのfetchはRefererヘッダーを自由に設定可能）
  const rakutenUrl = new URL(RAKUTEN_API_URL);
  rakutenUrl.searchParams.set('format', 'json');
  rakutenUrl.searchParams.set('itemCode', itemCode);
  rakutenUrl.searchParams.set('applicationId', applicationId);

  try {
    const response = await fetch(rakutenUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Referer': REFERER_URL,
        'User-Agent': 'Mozilla/5.0 rakuten-proxy-vercel',
        'accessKey': accessKey,
      },
    });

    const body = await response.text();

    // Rakutenレスポンスをそのまま返送
    res.status(response.status);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Upstream-Status', String(response.status));
    return res.send(body);
  } catch (err) {
    return res.status(502).json({
      error: 'Fetch failed',
      message: err.message,
    });
  }
}
