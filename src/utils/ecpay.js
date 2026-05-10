const crypto = require('crypto');

function getEcpayBaseUrl() {
  return process.env.ECPAY_ENV === 'production'
    ? 'https://payment.ecpay.com.tw'
    : 'https://payment-stage.ecpay.com.tw';
}

function ecpayUrlEncode(source) {
  let encoded = encodeURIComponent(source)
    .replace(/%20/g, '+')
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/~/g, '%7E');

  encoded = encoded.toLowerCase();

  const restores = { '%2d': '-', '%5f': '_', '%2e': '.', '%21': '!', '%2a': '*', '%28': '(', '%29': ')' };
  for (const [from, to] of Object.entries(restores)) {
    encoded = encoded.split(from).join(to);
  }
  return encoded;
}

function generateCheckMacValue(params) {
  const hashKey = process.env.ECPAY_HASH_KEY;
  const hashIV = process.env.ECPAY_HASH_IV;

  const filtered = Object.fromEntries(
    Object.entries(params).filter(([k]) => k !== 'CheckMacValue')
  );

  const sorted = Object.keys(filtered)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(k => `${k}=${filtered[k]}`);

  const raw = `HashKey=${hashKey}&${sorted.join('&')}&HashIV=${hashIV}`;
  const encoded = ecpayUrlEncode(raw);
  return crypto.createHash('sha256').update(encoded, 'utf8').digest('hex').toUpperCase();
}

function verifyCheckMacValue(params) {
  const received = params.CheckMacValue || '';
  const calculated = generateCheckMacValue(params);
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(calculated));
}

function generateMerchantTradeNo(orderId) {
  return orderId.replace(/-/g, '').slice(0, 20);
}

function formatTradeDate(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function buildPaymentParams(order, items) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
  const merchantTradeNo = generateMerchantTradeNo(order.id);

  const itemName = items
    .map(i => `${i.product_name} x${i.quantity}`)
    .join('#')
    .slice(0, 200);

  const params = {
    MerchantID: process.env.ECPAY_MERCHANT_ID,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: formatTradeDate(new Date()),
    PaymentType: 'aio',
    TotalAmount: order.total_amount,
    TradeDesc: '花店商品購買',
    ItemName: itemName,
    ReturnURL: `${baseUrl}/api/payments/ecpay/notify`,
    OrderResultURL: `${baseUrl}/api/payments/ecpay/result`,
    ClientBackURL: `${baseUrl}/orders/${order.id}?payment=cancel`,
    ChoosePayment: 'Credit',
    EncryptType: 1,
  };

  params.CheckMacValue = generateCheckMacValue(params);
  return params;
}

async function queryTradeInfo(merchantTradeNo) {
  const params = {
    MerchantID: process.env.ECPAY_MERCHANT_ID,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp: Math.floor(Date.now() / 1000),
  };
  params.CheckMacValue = generateCheckMacValue(params);

  const url = `${getEcpayBaseUrl()}/Cashier/QueryTradeInfo/V5`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

  const text = await response.text();
  const result = {};
  for (const pair of text.split('&')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const k = decodeURIComponent(pair.slice(0, eqIdx));
    const v = decodeURIComponent(pair.slice(eqIdx + 1));
    result[k] = v;
  }
  return result;
}

module.exports = {
  getEcpayBaseUrl,
  generateCheckMacValue,
  verifyCheckMacValue,
  generateMerchantTradeNo,
  buildPaymentParams,
  queryTradeInfo,
};
