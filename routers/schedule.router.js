// routers/schedule.router.js

import express from 'express';
import {
  getAuthUrl,
  handleOAuth2Callback,
  handleScheduling
} from '../nodes/schedule.node.js';

const router = express.Router();

// 1) Start the OAuth Flow (User logs in to authorize Google Calendar)
router.get('/auth', (req, res) => {
  const authUrl = getAuthUrl();
  res.redirect(authUrl); // Redirects user to Google OAuth screen
});

// 2) Google OAuth2 Callback (Handles Google’s response)
router.get('/oauth2callback', async (req, res) => {
  try {
    const code = req.query.code;
    await handleOAuth2Callback(code);
    res.send('Google Calendar authorization complete! You can close this window.');
  } catch (error) {
    console.error('OAuth2 callback error:', error);
    res.status(500).send('Authorization failed.');
  }
});

// 3) Schedule an appointment (POST request from AI assistant)
router.post('/', async (req, res) => {
  try {
    const result = await handleScheduling(req.body.message);
    res.json(result);
  } catch (error) {
    console.error('Error scheduling:', error);
    res.status(500).json({ response: 'Failed to schedule event.' });
  }
});

export default router;
