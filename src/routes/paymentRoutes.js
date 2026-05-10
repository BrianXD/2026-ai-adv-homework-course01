const express = require('express');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');
const {
  getEcpayBaseUrl,
  verifyCheckMacValue,
  generateMerchantTradeNo,
  buildPaymentParams,
  queryTradeInfo,
} = require('../utils/ecpay');

const router = express.Router();

// ReturnURL — server-to-server callback from ECPay (won't reach localhost, kept for completeness)
router.post('/ecpay/notify', (req, res) => {
  const params = req.body;

  try {
    if (!verifyCheckMacValue(params)) {
      return res.send('0|Error');
    }
  } catch {
    return res.send('0|Error');
  }

  const { MerchantTradeNo, RtnCode } = params;
  const order = db.prepare('SELECT * FROM orders WHERE ecpay_trade_no = ?').get(MerchantTradeNo);

  if (order && order.status === 'pending') {
    const newStatus = RtnCode === '1' ? 'paid' : 'failed';
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(newStatus, order.id);
  }

  res.send('1|OK');
});

// OrderResultURL — browser redirect POST from ECPay after payment
router.post('/ecpay/result', async (req, res) => {
  const { MerchantTradeNo, RtnCode } = req.body;

  const order = db.prepare('SELECT * FROM orders WHERE ecpay_trade_no = ?').get(MerchantTradeNo);
  if (!order) {
    return res.redirect('/orders?payment=error');
  }

  let newStatus;
  let paymentResult;

  try {
    const tradeInfo = await queryTradeInfo(MerchantTradeNo);
    if (tradeInfo.TradeStatus === '1') {
      newStatus = 'paid';
      paymentResult = 'success';
    } else {
      newStatus = 'failed';
      paymentResult = 'failed';
    }
  } catch (err) {
    console.error('[ECPay] QueryTradeInfo failed, falling back to RtnCode:', err.message);
    newStatus = RtnCode === '1' ? 'paid' : 'failed';
    paymentResult = RtnCode === '1' ? 'success' : 'failed';
  }

  if (order.status === 'pending') {
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(newStatus, order.id);
  }

  res.redirect(`/orders/${order.id}?payment=${paymentResult}`);
});

// Generate ECPay payment form params — called by frontend before redirecting to ECPay
router.post('/ecpay/:orderId', authMiddleware, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(req.params.orderId, req.user.userId);

  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }
  if (order.status !== 'pending') {
    return res.status(400).json({ data: null, error: 'INVALID_STATUS', message: '訂單狀態不是 pending，無法付款' });
  }

  const merchantTradeNo = generateMerchantTradeNo(order.id);
  db.prepare('UPDATE orders SET ecpay_trade_no = ? WHERE id = ?').run(merchantTradeNo, order.id);

  const items = db.prepare('SELECT product_name, quantity FROM order_items WHERE order_id = ?').all(order.id);
  const params = buildPaymentParams(order, items);

  const actionUrl = `${getEcpayBaseUrl()}/Cashier/AioCheckOut/V5`;

  res.json({ data: { actionUrl, params }, error: null, message: '付款表單已生成' });
});

module.exports = router;
