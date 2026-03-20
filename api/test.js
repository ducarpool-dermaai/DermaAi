module.exports = function handler(req, res) {
  res.status(200).json({ status: "ok", hasKey: !!process.env.ANTHROPIC_API_KEY, keyPrefix: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.substring(0,10) + "..." : "NOT SET" });
};
