const axios = require('axios');
const Setting = require('../models/Setting');

const sendOrderNotification = async (orderData, pkgData) => {
  try {
    const configSetting = await Setting.findOne({ key: 'TELEGRAM_CONFIG' });
    if (!configSetting || !configSetting.value.isEnabled) return;

    const { botToken, chatId } = configSetting.value;
    if (!botToken || !chatId) return;

    const caption = `
🔔 <b>New MLBB Order Alert!</b>
━━━━━━━━━━━━━━━━━━
🆔 <b>Order ID:</b> <code>${orderData.orderId}</code>
👤 <b>Player ID:</b> <code>${orderData.playerId} (${orderData.zoneId})</code>
💎 <b>Package:</b> ${pkgData.title}
💰 <b>Amount:</b> <b>${orderData.totalAmount.toLocaleString()} MMK</b>
💳 <b>Payment:</b> ${orderData.paymentMethod}
━━━━━━━━━━━━━━━━━━
    `;

    await axios.post(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      chat_id: chatId,
      photo: orderData.slipImageUrl,
      caption: caption,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('Telegram Service Error:', error.message);
  }
};

module.exports = { sendOrderNotification };

