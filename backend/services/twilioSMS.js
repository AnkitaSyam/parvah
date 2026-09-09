import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Single-purpose service to dispatch SMS alerts via Twilio.
 *
 * @param {string} recipientPhone - Target phone number (+91...)
 * @param {string} messageText - SMS message content
 * @returns {Promise<Object>} Status object with success flag and message Sid
 */
export async function sendSmsAlert(recipientPhone, messageText) {
  if (!recipientPhone || !messageText) {
    throw new Error('sendSmsAlert error: Recipient phone number and message text are required.');
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

  // Fallback for demo/dev mode when credentials are missing or placeholder
  if (!accountSid || accountSid.includes('AC_your_twilio') || !authToken || !twilioNumber) {
    console.warn(`💬 Twilio credentials missing. Simulating SMS dispatch to ${recipientPhone}:`);
    console.warn(`   MESSAGE CONTENT: "${messageText}"`);
    return {
      success: true,
      simulated: true,
      sid: 'SIM_' + Math.random().toString(36).substring(2, 11),
      recipient: recipientPhone,
      message: messageText
    };
  }

  try {
    const client = twilio(accountSid, authToken);

    const message = await client.messages.create({
      body: messageText,
      from: twilioNumber,
      to: recipientPhone
    });

    console.log(`✅ SMS successfully dispatched via Twilio. SID: ${message.sid}`);
    return {
      success: true,
      simulated: false,
      sid: message.sid,
      recipient: recipientPhone,
      status: message.status
    };
  } catch (error) {
    console.error(`❌ Twilio SMS dispatch failed for ${recipientPhone}:`, error.message);
    throw new Error(`Failed to send Twilio SMS alert: ${error.message}`);
  }
}
