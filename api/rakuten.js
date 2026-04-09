/**
 * Vercel Serverless Function: 楽天商品検索API プロキシ
 *
 * 配置場所: api/rakuten.js
 * URL: https://rakuten-proxy-beta.vercel.app/api/rakuten
 *
 * GASから呼ばれ、Refererヘッダーを注入して楽天新APIにアクセス
 * （GAS/Cloudflare Workers/Node.js fetch は仕様上 Referer ヘッダー設定不可のため
 *  Node.js の https モジュールを直接使用する）
 *
 * 使い方:
 *   GET https://rakuten-proxy-beta.vercel.app/api/rakuten?itemCode=shop:item&applicationId=uuid&accessKey=pk_...
 */

const https = require('https');

const RAKUTEN_API_HOST = 'openapi.rakuten.co.jp';
const RAKUTEN_API_PATH = '/ichibams/api/IchibaItem/Search/20220601';
const REFERER_URL = 'https://script.google.com';

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 認証チェック
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

  // クエリパラメータを組み立て
  const params = new URLSearchParams();
  params.set('format', 'json');
  params.set('itemCode', itemCode);
  params.set('applicationId', applicationId);
  const queryString = params.toString();

  // Node.js の https.request を使用（fetch と違い forbidden header 制約なし）
  const options = {
    hostname: RAKUTEN_API_HOST,
    port: 443,
    path: RAKUTEN_API_PATH + '?' + queryString,
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Referer': REFERER_URL,
      'User-Agent': 'Mozilla/5.0 rakuten-proxy-vercel',
      'accessKey': accessKey,
    },
  };

  try {
    const { statusCode, body } = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          resolve({ statusCode: response.statusCode, body: data });
        });
      });
      request.on('error', reject);
      request.setTimeout(30000, () => {
        request.destroy(new Error('Request timeout'));
      });
      request.end();
    });

    res.status(statusCode);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Upstream-Status', String(statusCode));
    return res.send(body);
  } catch (err) {
    return res.status(502).json({
      error: 'Fetch failed',
      message: err.message,
    });
  }
};
