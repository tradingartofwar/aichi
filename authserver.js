import express from 'express';
import { handleOAuth2Callback } from './nodes/schedule.node.js'; // Adjust path if needed

const app = express();
const port = 5000;

app.get('/api/schedule/oauth2callback', async (req, res) => {
  const code = req.query.code;
  if (code) {
    try {
      await handleOAuth2Callback(code);
      res.send('Token generated successfully. You can close this window.');
    } catch (error) {
      res.status(500).send('Error generating token: ' + error.message);
    }
  } else {
    res.status(400).send('No authorization code received.');
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});