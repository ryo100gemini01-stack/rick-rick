const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

router.get('/suggest', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json([]);

  try {
    const response = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`
    );

    const data = await response.json();

    const suggestions = data[1];
    res.json(suggestions);
  } catch (err) {
    console.error('Suggest fetch error:', err);
    res.status(500).json([]);
  }
});

module.exports = router;
