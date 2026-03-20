module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set');
    return res.status(500).json({ error: 'API key not configured. Add ANTHROPIC_API_KEY in Vercel Environment Variables.' });
  }

  try {
    const { image_base64 } = req.body;
    if (!image_base64) return res.status(400).json({ error: 'No image provided' });

    const cleanBase64 = image_base64.replace(/^data:image\/\w+;base64,/, '');

    if (cleanBase64.length > 1500000) {
      return res.status(400).json({ error: 'Image too large. Try again with better lighting.' });
    }

    const SYSTEM_PROMPT = `You are DermaAI, a clinical-grade AI skin and hair analysis system.

RULES:
1. Analyze the ACTUAL photo - look at real skin, hair, features visible.
2. Use clinical language that sounds precise and medical.
3. Every person has areas to improve - identify them.
4. Be specific to THIS person.
5. Never be cruel - be clinical, professional, concerned.
6. Note concerns are "at an early/reversible stage".

EXAMINE 5 AREAS:
1. UNDER-EYE REGION - dark circles, hollowness, puffiness, fine lines
2. SKIN PIGMENTATION - uneven tone, dark patches, sun spots, redness
3. SKIN TEXTURE - visible pores, roughness, oiliness, dryness, acne marks
4. HAIR HEALTH - hairline, thinning, texture, scalp visibility
5. SKIN ELASTICITY - jawline definition, nasolabial folds, firmness

SEVERITY: Use "attention" for 1-2 areas, "moderate" for 2-3, "mild" for rest. Always have at least one "attention".

SCORING: Overall 48-72. Individual 25-65.

Respond with ONLY valid JSON, no other text:
{"overall_score":NUMBER,"estimated_age_range":"STRING","skin_type":"STRING","percentile_worse_than":NUMBER,"concerns":[{"area":"STRING","severity":"STRING","emoji":"STRING","finding":"STRING","score":NUMBER},{"area":"STRING","severity":"STRING","emoji":"STRING","finding":"STRING","score":NUMBER},{"area":"STRING","severity":"STRING","emoji":"STRING","finding":"STRING","score":NUMBER},{"area":"STRING","severity":"STRING","emoji":"STRING","finding":"STRING","score":NUMBER},{"area":"STRING","severity":"STRING","emoji":"STRING","finding":"STRING","score":NUMBER}],"overall_note":"STRING"}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: cleanBase64 } },
            { type: 'text', text: 'Analyze this selfie. Return ONLY valid JSON.' }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude error:', response.status, errText);
      if (response.status === 401) return res.status(500).json({ error: 'Invalid API key. Check ANTHROPIC_API_KEY in Vercel settings.' });
      if (response.status === 429) return res.status(500).json({ error: 'Rate limited. Wait a moment and retry.' });
      if (response.status === 400) return res.status(500).json({ error: 'Image issue. Try a clearer photo with good lighting.' });
      return res.status(500).json({ error: 'AI error (' + response.status + '). Try again.' });
    }

    const data = await response.json();
    let text = '';
    for (const b of data.content) { if (b.type === 'text') text += b.text; }
    if (!text) return res.status(500).json({ error: 'Empty response. Try again.' });

    let cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    let analysis;
    try { analysis = JSON.parse(cleaned); }
    catch (e) {
      console.error('Parse fail:', cleaned.substring(0, 300));
      return res.status(500).json({ error: 'Format error. Try again.' });
    }

    analysis.products = matchProducts(analysis.concerns || []);
    return res.status(200).json(analysis);

  } catch (err) {
    console.error('Error:', err.message || err);
    return res.status(500).json({ error: 'Server error: ' + (err.message || 'Unknown') });
  }
};

function matchProducts(concerns) {
  const db = {
    'under-eye': { name: "Triphala Collagen Restore Under-Eye Cream", tag: "FOR YOUR UNDER-EYES", reason: "Formulated for the collagen depletion detected in your scan", price: 699, original: 1499, rating: 4.6, reviews: "7,456", urgency: "Early intervention prevents 3x deeper hollowing in 12 months", affiliate_url: "#" },
    'pigmentation': { name: "Kumkumadi Tailam — Ayurvedic Radiance Serum", tag: "FOR YOUR PIGMENTATION", reason: "Targets your melanin irregularity with saffron-based formulation", price: 599, original: 1299, rating: 4.7, reviews: "12,847", urgency: "87% of similar profiles saw improvement in 21 days", affiliate_url: "#" },
    'texture': { name: "Neem + Tulsi Pore Refining Face Wash", tag: "FOR YOUR SKIN TEXTURE", reason: "Reduces pore density and oil imbalance your scan detected", price: 349, original: 699, rating: 4.5, reviews: "18,234", urgency: "Untreated pore enlargement increases 15% yearly", affiliate_url: "#" },
    'hair': { name: "Bhringraj + Amla Hair Density Oil", tag: "FOR YOUR HAIR CONCERN", reason: "Clinical-grade follicle stimulation for your thinning pattern", price: 449, original: 899, rating: 4.8, reviews: "9,231", urgency: "94% reversible at this stage with consistent use", affiliate_url: "#" },
    'elasticity': { name: "Ashwagandha + Saffron Firming Night Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Targets elastin degradation from your analysis", price: 799, original: 1599, rating: 4.6, reviews: "5,892", urgency: "Elasticity loss accelerates 2x after 30", affiliate_url: "#" }
  };
  const matched = [], used = new Set();
  for (const c of concerns) {
    const a = (c.area || '').toLowerCase();
    let k = null;
    if (a.includes('eye') && !used.has('under-eye')) k = 'under-eye';
    else if ((a.includes('pigment') || a.includes('cheek') || a.includes('tone')) && !used.has('pigmentation')) k = 'pigmentation';
    else if ((a.includes('texture') || a.includes('pore') || a.includes('forehead')) && !used.has('texture')) k = 'texture';
    else if ((a.includes('hair') || a.includes('density') || a.includes('follicle')) && !used.has('hair')) k = 'hair';
    else if ((a.includes('elastic') || a.includes('firm') || a.includes('jaw')) && !used.has('elasticity')) k = 'elasticity';
    if (k) { matched.push(db[k]); used.add(k); }
  }
  const fb = ['pigmentation', 'hair', 'under-eye', 'texture', 'elasticity'];
  for (const k of fb) { if (!used.has(k) && matched.length < 3) { matched.push(db[k]); used.add(k); } }
  return matched.slice(0, 3);
}
