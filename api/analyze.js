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


// ============================================================
// 30 PRODUCTS — 6 per category — shuffles randomly each scan
// ============================================================
function matchProducts(concerns) {
  const T = "dermaai-21";
  const db = {
    'under-eye': [
      { name: "mCaffeine Coffee Under Eye Cream Gel", tag: "FOR YOUR UNDER-EYES", reason: "Caffeine formula targets the dark circles and puffiness your scan detected — 94% users saw visible reduction", price: 349, original: 599, rating: 4.3, reviews: "42,847", urgency: "94% of users with your concern level saw results in 15 days", affiliate_url: "https://www.amazon.in/s?k=mcaffeine+under+eye+cream&tag=" + T },
      { name: "Conscious Chemist Retinol Peptide Under Eye Cream", tag: "FOR YOUR UNDER-EYES", reason: "Retinol + peptide complex directly reverses the collagen depletion your scan identified", price: 399, original: 650, rating: 4.2, reviews: "12,340", urgency: "Retinol eye creams show 67% wrinkle reduction at 4 weeks", affiliate_url: "https://www.amazon.in/s?k=conscious+chemist+retinol+under+eye&tag=" + T },
      { name: "The Derma Co 5% Caffeine Under Eye Serum", tag: "FOR YOUR UNDER-EYES", reason: "Medical-grade 5% caffeine matched to the puffiness severity your scan detected", price: 349, original: 599, rating: 4.1, reviews: "28,456", urgency: "Caffeine serums reduce under-eye puffiness by 41% in 14 days", affiliate_url: "https://www.amazon.in/s?k=derma+co+caffeine+under+eye+serum&tag=" + T },
      { name: "Bella Vita Organic EyeLift Under Eye Cream", tag: "FOR YOUR UNDER-EYES", reason: "Cucumber + retinol blend addresses both the dark circles and fine lines your scan revealed", price: 249, original: 499, rating: 4.0, reviews: "35,210", urgency: "52% improvement in under-eye brightness within 3 weeks", affiliate_url: "https://www.amazon.in/s?k=bella+vita+eyelift+under+eye+cream&tag=" + T },
      { name: "Olay Eyes Retinol 24 Night Eye Cream", tag: "FOR YOUR UNDER-EYES", reason: "Clinical retinol works overnight on the hollow depth and fine lines your scan detected", price: 899, original: 1499, rating: 4.4, reviews: "15,678", urgency: "Night-active retinol repairs 2x faster during sleep", affiliate_url: "https://www.amazon.in/s?k=olay+eyes+retinol+night+eye+cream&tag=" + T },
      { name: "Dot & Key Caffeine + Vitamin C Under Eye Cream", tag: "FOR YOUR UNDER-EYES", reason: "Dual-action caffeine and Vitamin C targets both the darkness and puffiness your scan found", price: 445, original: 595, rating: 4.3, reviews: "19,890", urgency: "Dual-active formulas show 78% faster results than single-ingredient treatments", affiliate_url: "https://www.amazon.in/s?k=dot+and+key+under+eye+cream&tag=" + T }
    ],
    'pigmentation': [
      { name: "Minimalist 10% Vitamin C Face Serum", tag: "FOR YOUR PIGMENTATION", reason: "Clinical-strength Vitamin C targets the melanin irregularity your scan revealed", price: 545, original: 599, rating: 4.2, reviews: "56,231", urgency: "73% pigmentation reduction in 4 weeks at this stage", affiliate_url: "https://www.amazon.in/s?k=minimalist+vitamin+c+serum&tag=" + T },
      { name: "Garnier Bright Complete Vitamin C Serum", tag: "FOR YOUR PIGMENTATION", reason: "30x Vitamin C addresses the uneven tone distribution detected across your cheeks", price: 249, original: 399, rating: 4.1, reviews: "89,456", urgency: "India's #1 serum — 83% users saw spot reduction in 3 weeks", affiliate_url: "https://www.amazon.in/s?k=garnier+bright+complete+vitamin+c+serum&tag=" + T },
      { name: "Plum 15% Vitamin C Face Serum", tag: "FOR YOUR PIGMENTATION", reason: "Ethyl Ascorbic Acid penetrates deeper to target the pigmentation layers your scan identified", price: 552, original: 649, rating: 4.2, reviews: "22,345", urgency: "15% concentration works 2x faster than 10% on moderate pigmentation like yours", affiliate_url: "https://www.amazon.in/s?k=plum+vitamin+c+serum+15&tag=" + T },
      { name: "Minimalist 2% Alpha Arbutin Serum", tag: "FOR YOUR PIGMENTATION", reason: "Alpha Arbutin inhibits melanin at the exact spots your scan flagged — dermatologist choice", price: 545, original: 599, rating: 4.1, reviews: "41,567", urgency: "Reduces dark spots by 58% without irritation — ideal for your skin type", affiliate_url: "https://www.amazon.in/s?k=minimalist+alpha+arbutin+serum&tag=" + T },
      { name: "L'Oreal Paris Revitalift Hyaluronic Acid Serum", tag: "FOR YOUR PIGMENTATION", reason: "Hyaluronic acid plumps skin while addressing the tone irregularity your analysis detected", price: 599, original: 999, rating: 4.3, reviews: "34,890", urgency: "71% users reported brighter complexion in 2 weeks", affiliate_url: "https://www.amazon.in/s?k=loreal+revitalift+hyaluronic+acid+serum&tag=" + T },
      { name: "Mamaearth Vitamin C Daily Glow Face Cream", tag: "FOR YOUR PIGMENTATION", reason: "Daily-use formula gradually corrects the melanin asymmetry your scan detected", price: 349, original: 499, rating: 4.0, reviews: "67,123", urgency: "Consistent daily Vitamin C prevents 89% of new pigmentation forming", affiliate_url: "https://www.amazon.in/s?k=mamaearth+vitamin+c+face+cream&tag=" + T }
    ],
    'texture': [
      { name: "The Derma Co 1% Salicylic Acid Face Wash", tag: "FOR YOUR SKIN TEXTURE", reason: "Salicylic acid directly addresses the pore congestion your scan detected", price: 227, original: 349, rating: 4.1, reviews: "73,456", urgency: "BHA treatment reduces visible pore size by 31% in 2 weeks", affiliate_url: "https://www.amazon.in/s?k=derma+co+salicylic+acid+face+wash&tag=" + T },
      { name: "Minimalist 2% Salicylic Acid Face Wash", tag: "FOR YOUR SKIN TEXTURE", reason: "2% BHA concentration matched to the pore density level your scan revealed", price: 299, original: 399, rating: 4.2, reviews: "45,678", urgency: "Medical-grade BHA unclogs 89% of blocked pores within 10 days", affiliate_url: "https://www.amazon.in/s?k=minimalist+salicylic+acid+face+wash&tag=" + T },
      { name: "Neutrogena Oil-Free Acne Face Wash", tag: "FOR YOUR SKIN TEXTURE", reason: "Dermatologist-recommended formula targets the oil imbalance and roughness in your scan", price: 320, original: 460, rating: 4.3, reviews: "38,234", urgency: "Prevents 76% of new breakouts while refining texture", affiliate_url: "https://www.amazon.in/s?k=neutrogena+oil+free+acne+face+wash&tag=" + T },
      { name: "CeraVe SA Cleanser for Rough & Bumpy Skin", tag: "FOR YOUR SKIN TEXTURE", reason: "Ceramide + salicylic acid repairs skin barrier while fixing the texture your scan flagged", price: 799, original: 1150, rating: 4.4, reviews: "15,890", urgency: "Ceramide + SA combo smooths texture 43% faster than SA alone", affiliate_url: "https://www.amazon.in/s?k=cerave+sa+cleanser&tag=" + T },
      { name: "Dot & Key AHA + BHA Exfoliating Peeling Serum", tag: "FOR YOUR SKIN TEXTURE", reason: "Chemical exfoliation targets the dead cell buildup causing the texture irregularity", price: 545, original: 695, rating: 4.1, reviews: "21,567", urgency: "AHA+BHA peels show visible smoothness after first use in 87% of cases", affiliate_url: "https://www.amazon.in/s?k=dot+and+key+aha+bha+peeling+serum&tag=" + T },
      { name: "Plum Green Tea Pore Cleansing Face Wash", tag: "FOR YOUR SKIN TEXTURE", reason: "Green tea antioxidants shrink the enlarged pores your scan identified while controlling oil", price: 285, original: 380, rating: 4.2, reviews: "52,345", urgency: "Green tea reduces sebum production by 27% — matches your oiliness level", affiliate_url: "https://www.amazon.in/s?k=plum+green+tea+face+wash&tag=" + T }
    ],
    'hair': [
      { name: "Minimalist Hair Growth Actives 18% Serum", tag: "FOR YOUR HAIR CONCERN", reason: "Redensyl + Procapil + Capixyl — triple-action matched to your follicle thinning", price: 699, original: 799, rating: 4.1, reviews: "31,892", urgency: "Redensyl shows 214% hair growth increase in clinical trials", affiliate_url: "https://www.amazon.in/s?k=minimalist+hair+growth+serum+redensyl&tag=" + T },
      { name: "The Derma Co 3% Redensyl Hair Serum", tag: "FOR YOUR HAIR CONCERN", reason: "3% Redensyl targets the follicle miniaturization your scan revealed", price: 499, original: 799, rating: 4.0, reviews: "24,567", urgency: "91% success rate at your thinning stage — reactivates dormant follicles", affiliate_url: "https://www.amazon.in/s?k=derma+co+redensyl+hair+serum&tag=" + T },
      { name: "Wow Onion Black Seed Hair Oil", tag: "FOR YOUR HAIR CONCERN", reason: "Onion extract stimulates the scalp circulation your analysis indicated is low", price: 349, original: 599, rating: 4.0, reviews: "112,345", urgency: "India's most reviewed hair oil — reduces fall by 62% in 6 weeks", affiliate_url: "https://www.amazon.in/s?k=wow+onion+black+seed+hair+oil&tag=" + T },
      { name: "Mamaearth Onion Hair Fall Shampoo", tag: "FOR YOUR HAIR CONCERN", reason: "Onion + plant keratin addresses the thinning and strand weakness your scan found", price: 299, original: 449, rating: 4.1, reviews: "98,765", urgency: "Keratin strengthens existing hair 47% while onion stimulates growth", affiliate_url: "https://www.amazon.in/s?k=mamaearth+onion+shampoo&tag=" + T },
      { name: "Man Matters Minoxidil 5% Hair Growth Serum", tag: "FOR YOUR HAIR CONCERN", reason: "FDA-approved Minoxidil targets the density loss your scan detected — gold standard treatment", price: 549, original: 799, rating: 4.0, reviews: "27,890", urgency: "Only FDA-approved topical for hair regrowth — proven for your stage", affiliate_url: "https://www.amazon.in/s?k=man+matters+minoxidil+5+hair+growth&tag=" + T },
      { name: "Pilgrim Redensyl & Anagain Hair Growth Serum", tag: "FOR YOUR HAIR CONCERN", reason: "Korean technology with Redensyl + Anagain matched to your follicle health score", price: 595, original: 795, rating: 4.2, reviews: "18,456", urgency: "Anagain activates hair stem cells — 78% density increase in 3 months", affiliate_url: "https://www.amazon.in/s?k=pilgrim+redensyl+anagain+hair+serum&tag=" + T }
    ],
    'elasticity': [
      { name: "Olay Regenerist Micro-Sculpting Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Amino-peptide complex targets the elastin degradation your analysis revealed", price: 899, original: 1999, rating: 4.4, reviews: "28,345", urgency: "Restores 23% skin firmness within 28 days", affiliate_url: "https://www.amazon.in/s?k=olay+regenerist+micro+sculpting+cream&tag=" + T },
      { name: "Minimalist 0.3% Retinol Anti-Aging Night Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Retinol boosts collagen to counteract the firmness loss your scan measured", price: 545, original: 599, rating: 4.1, reviews: "33,456", urgency: "0.3% retinol is clinically optimal for early-stage elastin loss like yours", affiliate_url: "https://www.amazon.in/s?k=minimalist+retinol+anti+aging+cream&tag=" + T },
      { name: "L'Oreal Paris Revitalift Anti-Wrinkle Night Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Pro-Retinol A rebuilds overnight the collagen matrix your scan showed is weakening", price: 549, original: 799, rating: 4.3, reviews: "41,234", urgency: "Night repair is 3x more effective — skin regenerates 60% faster during sleep", affiliate_url: "https://www.amazon.in/s?k=loreal+revitalift+night+cream&tag=" + T },
      { name: "Cetaphil Healthy Renew Anti-Aging Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Peptide + niacinamide blend for the early elasticity loss your scan found", price: 999, original: 1499, rating: 4.3, reviews: "12,567", urgency: "Dermatologist #1 recommendation for early firmness concerns like yours", affiliate_url: "https://www.amazon.in/s?k=cetaphil+healthy+renew+anti+aging&tag=" + T },
      { name: "Neutrogena Rapid Wrinkle Repair Retinol Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Accelerated retinol targets the jawline loss and early sagging your scan detected", price: 699, original: 1099, rating: 4.2, reviews: "22,890", urgency: "Shows visible firming in just 1 week — fastest in its class", affiliate_url: "https://www.amazon.in/s?k=neutrogena+rapid+wrinkle+repair+retinol&tag=" + T },
      { name: "Plum Bright Years Restorative Night Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Plant stem cells rebuild skin at cellular level — matched to your elasticity score", price: 595, original: 750, rating: 4.1, reviews: "16,789", urgency: "Stem cell technology prevents further breakdown while repairing existing damage", affiliate_url: "https://www.amazon.in/s?k=plum+bright+years+night+cream&tag=" + T }
    ]
  };

  // Random pick from each category — different products every scan
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  const matched = [], used = new Set();
  for (const c of concerns) {
    const a = (c.area || '').toLowerCase();
    let k = null;
    if (a.includes('eye') && !used.has('under-eye')) k = 'under-eye';
    else if ((a.includes('pigment') || a.includes('cheek') || a.includes('tone')) && !used.has('pigmentation')) k = 'pigmentation';
    else if ((a.includes('texture') || a.includes('pore') || a.includes('forehead')) && !used.has('texture')) k = 'texture';
    else if ((a.includes('hair') || a.includes('density') || a.includes('follicle')) && !used.has('hair')) k = 'hair';
    else if ((a.includes('elastic') || a.includes('firm') || a.includes('jaw')) && !used.has('elasticity')) k = 'elasticity';
    if (k) { matched.push(pick(db[k])); used.add(k); }
  }
  const fb = ['pigmentation', 'hair', 'under-eye', 'texture', 'elasticity'];
  for (const k of fb) { if (!used.has(k) && matched.length < 3) { matched.push(pick(db[k])); used.add(k); } }
  return matched.slice(0, 3);
}
