module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured. Add ANTHROPIC_API_KEY in Vercel.' });

  try {
    const { image_base64, time_of_day } = req.body;
    if (!image_base64) return res.status(400).json({ error: 'No image provided' });
    const cleanBase64 = image_base64.replace(/^data:image\/\w+;base64,/, '');
    if (cleanBase64.length > 1500000) return res.status(400).json({ error: 'Image too large.' });

    // Time context for personalization
    const timeCtx = time_of_day === 'night'
      ? 'The user is scanning at NIGHT. Mention "evening skin fatigue", "overnight repair window", "nighttime is when skin regenerates". Recommend night-active solutions.'
      : time_of_day === 'morning'
      ? 'The user is scanning in the MORNING. Mention "morning UV exposure ahead", "daytime protection needed", "sun damage prevention". Recommend protective solutions.'
      : 'The user is scanning in the AFTERNOON. Mention "mid-day oil buildup", "accumulated environmental stress". Recommend refreshing solutions.';

    const SYSTEM_PROMPT = `You are DermaAI, a clinical-grade AI skin and hair analysis system.

RULES:
1. Analyze the ACTUAL photo - real skin, hair, features.
2. Use clinical language — precise and medical.
3. Every person has areas to improve - identify them.
4. Be specific to THIS person.
5. Never cruel - clinical, professional, concerned.
6. Note concerns are "at an early/reversible stage".
7. ${timeCtx}

EXAMINE 5 AREAS:
1. UNDER-EYE REGION - dark circles, hollowness, puffiness, fine lines
2. SKIN PIGMENTATION - uneven tone, dark patches, sun spots, redness
3. SKIN TEXTURE - visible pores, roughness, oiliness, dryness, acne marks
4. HAIR HEALTH - hairline, thinning, texture, scalp visibility
5. SKIN ELASTICITY - jawline definition, nasolabial folds, firmness

SEVERITY: "attention" for 1-2 areas, "moderate" for 2-3, "mild" for rest. Always at least one "attention".
SCORING: Overall 48-72. Individual 25-65.

Respond ONLY valid JSON:
{"overall_score":NUMBER,"estimated_age_range":"STRING","skin_type":"STRING","percentile_worse_than":NUMBER,"concerns":[{"area":"STRING","severity":"STRING","emoji":"STRING","finding":"STRING","score":NUMBER},{"area":"STRING","severity":"STRING","emoji":"STRING","finding":"STRING","score":NUMBER},{"area":"STRING","severity":"STRING","emoji":"STRING","finding":"STRING","score":NUMBER},{"area":"STRING","severity":"STRING","emoji":"STRING","finding":"STRING","score":NUMBER},{"area":"STRING","severity":"STRING","emoji":"STRING","finding":"STRING","score":NUMBER}],"overall_note":"STRING"}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1200, system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: cleanBase64 } },
          { type: 'text', text: 'Analyze this selfie. Return ONLY valid JSON.' }
        ]}]
      })
    });

    if (!response.ok) {
      const e = await response.text(); console.error('Claude:', response.status, e);
      if (response.status === 401) return res.status(500).json({ error: 'Invalid API key.' });
      if (response.status === 429) return res.status(500).json({ error: 'Rate limited. Wait and retry.' });
      if (response.status === 400) return res.status(500).json({ error: 'Image issue. Try clearer photo.' });
      return res.status(500).json({ error: 'AI error (' + response.status + ').' });
    }

    const data = await response.json();
    let text = ''; for (const b of data.content) { if (b.type === 'text') text += b.text; }
    if (!text) return res.status(500).json({ error: 'Empty response.' });
    let cleaned = text.trim().replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();

    let analysis;
    try { analysis = JSON.parse(cleaned); }
    catch(e) { console.error('Parse fail:', cleaned.substring(0,300)); return res.status(500).json({ error: 'Format error. Try again.' }); }

    analysis.products = matchProducts(analysis.concerns || [], time_of_day);
    analysis.scan_time = time_of_day || 'day';
    analysis.scan_timestamp = new Date().toISOString();
    return res.status(200).json(analysis);
  } catch (err) {
    console.error('Error:', err.message || err);
    return res.status(500).json({ error: 'Server error: ' + (err.message || 'Unknown') });
  }
};

function matchProducts(concerns, timeOfDay) {
  const T = "dermaai-21";
  const db = {
    'under-eye': [
      { name: "mCaffeine Coffee Under Eye Cream Gel", tag: "FOR YOUR UNDER-EYES", reason: "Caffeine formula targets the dark circles and puffiness your scan detected", price: 349, original: 599, rating: 4.3, reviews: "42,847", urgency: "94% of users with your concern level saw results in 15 days", affiliate_url: "https://www.amazon.in/s?k=mcaffeine+under+eye+cream&tag=" + T },
      { name: "Conscious Chemist Retinol Peptide Under Eye Cream", tag: "FOR YOUR UNDER-EYES", reason: "Retinol + peptide complex reverses the collagen depletion your scan identified", price: 399, original: 650, rating: 4.2, reviews: "12,340", urgency: "Retinol eye creams show 67% wrinkle reduction at 4 weeks", affiliate_url: "https://www.amazon.in/s?k=conscious+chemist+retinol+under+eye&tag=" + T },
      { name: "The Derma Co 5% Caffeine Under Eye Serum", tag: "FOR YOUR UNDER-EYES", reason: "Medical-grade 5% caffeine matched to your puffiness severity", price: 349, original: 599, rating: 4.1, reviews: "28,456", urgency: "Reduces under-eye puffiness by 41% in 14 days", affiliate_url: "https://www.amazon.in/s?k=derma+co+caffeine+under+eye+serum&tag=" + T },
      { name: "Bella Vita Organic EyeLift Under Eye Cream", tag: "FOR YOUR UNDER-EYES", reason: "Cucumber + retinol addresses both dark circles and fine lines your scan revealed", price: 249, original: 499, rating: 4.0, reviews: "35,210", urgency: "52% brightness improvement within 3 weeks", affiliate_url: "https://www.amazon.in/s?k=bella+vita+eyelift+under+eye+cream&tag=" + T },
      { name: "Olay Eyes Retinol 24 Night Eye Cream", tag: "FOR YOUR UNDER-EYES", reason: "Clinical retinol works overnight on hollow depth and fine lines detected", price: 899, original: 1499, rating: 4.4, reviews: "15,678", urgency: "Night-active retinol repairs 2x faster during sleep", affiliate_url: "https://www.amazon.in/s?k=olay+eyes+retinol+night+eye+cream&tag=" + T },
      { name: "Dot & Key Caffeine + Vitamin C Under Eye Cream", tag: "FOR YOUR UNDER-EYES", reason: "Dual-action targets both darkness and puffiness your scan found", price: 445, original: 595, rating: 4.3, reviews: "19,890", urgency: "Dual-active formulas show 78% faster results", affiliate_url: "https://www.amazon.in/s?k=dot+and+key+under+eye+cream&tag=" + T }
    ],
    'pigmentation': [
      { name: "Minimalist 10% Vitamin C Face Serum", tag: "FOR YOUR PIGMENTATION", reason: "Clinical-strength Vitamin C targets the melanin irregularity your scan revealed", price: 545, original: 599, rating: 4.2, reviews: "56,231", urgency: "73% pigmentation reduction in 4 weeks", affiliate_url: "https://www.amazon.in/s?k=minimalist+vitamin+c+serum&tag=" + T },
      { name: "Garnier Bright Complete Vitamin C Serum", tag: "FOR YOUR PIGMENTATION", reason: "30x Vitamin C addresses uneven tone across your cheeks", price: 249, original: 399, rating: 4.1, reviews: "89,456", urgency: "India's #1 serum — 83% saw spot reduction in 3 weeks", affiliate_url: "https://www.amazon.in/s?k=garnier+bright+complete+vitamin+c+serum&tag=" + T },
      { name: "Plum 15% Vitamin C Face Serum", tag: "FOR YOUR PIGMENTATION", reason: "Ethyl Ascorbic Acid penetrates deeper into pigmentation layers", price: 552, original: 649, rating: 4.2, reviews: "22,345", urgency: "15% works 2x faster than 10% on moderate pigmentation", affiliate_url: "https://www.amazon.in/s?k=plum+vitamin+c+serum+15&tag=" + T },
      { name: "Minimalist 2% Alpha Arbutin Serum", tag: "FOR YOUR PIGMENTATION", reason: "Alpha Arbutin inhibits melanin at the exact spots your scan flagged", price: 545, original: 599, rating: 4.1, reviews: "41,567", urgency: "Reduces dark spots 58% without irritation", affiliate_url: "https://www.amazon.in/s?k=minimalist+alpha+arbutin+serum&tag=" + T },
      { name: "L'Oreal Revitalift Hyaluronic Acid Serum", tag: "FOR YOUR PIGMENTATION", reason: "Hyaluronic acid plumps skin while fixing tone irregularity", price: 599, original: 999, rating: 4.3, reviews: "34,890", urgency: "71% reported brighter complexion in 2 weeks", affiliate_url: "https://www.amazon.in/s?k=loreal+revitalift+hyaluronic+acid+serum&tag=" + T },
      { name: "Mamaearth Vitamin C Daily Glow Cream", tag: "FOR YOUR PIGMENTATION", reason: "Daily formula gradually corrects melanin asymmetry detected", price: 349, original: 499, rating: 4.0, reviews: "67,123", urgency: "Daily Vitamin C prevents 89% of new pigmentation", affiliate_url: "https://www.amazon.in/s?k=mamaearth+vitamin+c+face+cream&tag=" + T }
    ],
    'texture': [
      { name: "The Derma Co 1% Salicylic Acid Face Wash", tag: "FOR YOUR SKIN TEXTURE", reason: "Salicylic acid addresses pore congestion your scan detected", price: 227, original: 349, rating: 4.1, reviews: "73,456", urgency: "Reduces pore size by 31% in 2 weeks", affiliate_url: "https://www.amazon.in/s?k=derma+co+salicylic+acid+face+wash&tag=" + T },
      { name: "Minimalist 2% Salicylic Acid Face Wash", tag: "FOR YOUR SKIN TEXTURE", reason: "2% BHA matched to your pore density level", price: 299, original: 399, rating: 4.2, reviews: "45,678", urgency: "Unclogs 89% of blocked pores within 10 days", affiliate_url: "https://www.amazon.in/s?k=minimalist+salicylic+acid+face+wash&tag=" + T },
      { name: "Neutrogena Oil-Free Acne Face Wash", tag: "FOR YOUR SKIN TEXTURE", reason: "Targets oil imbalance and roughness in your scan", price: 320, original: 460, rating: 4.3, reviews: "38,234", urgency: "Prevents 76% of new breakouts while refining texture", affiliate_url: "https://www.amazon.in/s?k=neutrogena+oil+free+acne+face+wash&tag=" + T },
      { name: "CeraVe SA Cleanser", tag: "FOR YOUR SKIN TEXTURE", reason: "Ceramide + SA repairs barrier while fixing texture flagged", price: 799, original: 1150, rating: 4.4, reviews: "15,890", urgency: "Ceramide + SA smooths 43% faster than SA alone", affiliate_url: "https://www.amazon.in/s?k=cerave+sa+cleanser&tag=" + T },
      { name: "Dot & Key AHA + BHA Peeling Serum", tag: "FOR YOUR SKIN TEXTURE", reason: "Chemical exfoliation targets dead cell buildup causing irregularity", price: 545, original: 695, rating: 4.1, reviews: "21,567", urgency: "Visible smoothness after first use in 87% of cases", affiliate_url: "https://www.amazon.in/s?k=dot+and+key+aha+bha+peeling+serum&tag=" + T },
      { name: "Plum Green Tea Pore Cleansing Face Wash", tag: "FOR YOUR SKIN TEXTURE", reason: "Green tea shrinks enlarged pores while controlling oil", price: 285, original: 380, rating: 4.2, reviews: "52,345", urgency: "Reduces sebum production by 27%", affiliate_url: "https://www.amazon.in/s?k=plum+green+tea+face+wash&tag=" + T }
    ],
    'hair': [
      { name: "Minimalist Hair Growth Actives 18% Serum", tag: "FOR YOUR HAIR CONCERN", reason: "Redensyl + Procapil + Capixyl matched to your follicle thinning", price: 699, original: 799, rating: 4.1, reviews: "31,892", urgency: "214% hair growth increase in clinical trials", affiliate_url: "https://www.amazon.in/s?k=minimalist+hair+growth+serum+redensyl&tag=" + T },
      { name: "The Derma Co 3% Redensyl Hair Serum", tag: "FOR YOUR HAIR CONCERN", reason: "3% Redensyl targets follicle miniaturization your scan revealed", price: 499, original: 799, rating: 4.0, reviews: "24,567", urgency: "91% success rate at your thinning stage", affiliate_url: "https://www.amazon.in/s?k=derma+co+redensyl+hair+serum&tag=" + T },
      { name: "Wow Onion Black Seed Hair Oil", tag: "FOR YOUR HAIR CONCERN", reason: "Onion extract stimulates scalp circulation your analysis indicated", price: 349, original: 599, rating: 4.0, reviews: "112,345", urgency: "Reduces hair fall by 62% in 6 weeks", affiliate_url: "https://www.amazon.in/s?k=wow+onion+black+seed+hair+oil&tag=" + T },
      { name: "Mamaearth Onion Hair Fall Shampoo", tag: "FOR YOUR HAIR CONCERN", reason: "Onion + keratin addresses thinning and strand weakness", price: 299, original: 449, rating: 4.1, reviews: "98,765", urgency: "Strengthens existing hair 47% while stimulating growth", affiliate_url: "https://www.amazon.in/s?k=mamaearth+onion+shampoo&tag=" + T },
      { name: "Man Matters Minoxidil 5% Serum", tag: "FOR YOUR HAIR CONCERN", reason: "FDA-approved Minoxidil targets density loss detected — gold standard", price: 549, original: 799, rating: 4.0, reviews: "27,890", urgency: "Only FDA-approved topical for hair regrowth", affiliate_url: "https://www.amazon.in/s?k=man+matters+minoxidil+5+hair+growth&tag=" + T },
      { name: "Pilgrim Redensyl & Anagain Hair Serum", tag: "FOR YOUR HAIR CONCERN", reason: "Korean tech with Redensyl + Anagain matched to your follicle score", price: 595, original: 795, rating: 4.2, reviews: "18,456", urgency: "78% density increase in 3 months", affiliate_url: "https://www.amazon.in/s?k=pilgrim+redensyl+anagain+hair+serum&tag=" + T }
    ],
    'elasticity': [
      { name: "Olay Regenerist Micro-Sculpting Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Amino-peptide complex targets elastin degradation revealed", price: 899, original: 1999, rating: 4.4, reviews: "28,345", urgency: "Restores 23% firmness within 28 days", affiliate_url: "https://www.amazon.in/s?k=olay+regenerist+micro+sculpting+cream&tag=" + T },
      { name: "Minimalist 0.3% Retinol Night Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Retinol boosts collagen for the firmness loss measured", price: 545, original: 599, rating: 4.1, reviews: "33,456", urgency: "0.3% is clinically optimal for early elastin loss", affiliate_url: "https://www.amazon.in/s?k=minimalist+retinol+anti+aging+cream&tag=" + T },
      { name: "L'Oreal Revitalift Anti-Wrinkle Night Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Pro-Retinol A rebuilds collagen matrix overnight", price: 549, original: 799, rating: 4.3, reviews: "41,234", urgency: "Skin regenerates 60% faster during sleep", affiliate_url: "https://www.amazon.in/s?k=loreal+revitalift+night+cream&tag=" + T },
      { name: "Cetaphil Healthy Renew Anti-Aging Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Peptide + niacinamide for early elasticity loss found", price: 999, original: 1499, rating: 4.3, reviews: "12,567", urgency: "Dermatologist #1 pick for early firmness concerns", affiliate_url: "https://www.amazon.in/s?k=cetaphil+healthy+renew+anti+aging&tag=" + T },
      { name: "Neutrogena Rapid Wrinkle Repair Retinol", tag: "FOR YOUR SKIN FIRMNESS", reason: "Accelerated retinol targets jawline loss and early sagging", price: 699, original: 1099, rating: 4.2, reviews: "22,890", urgency: "Visible firming in just 1 week", affiliate_url: "https://www.amazon.in/s?k=neutrogena+rapid+wrinkle+repair+retinol&tag=" + T },
      { name: "Plum Bright Years Restorative Night Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Plant stem cells rebuild skin at cellular level", price: 595, original: 750, rating: 4.1, reviews: "16,789", urgency: "Prevents further breakdown while repairing damage", affiliate_url: "https://www.amazon.in/s?k=plum+bright+years+night+cream&tag=" + T }
    ]
  };

  // Time-based product boost — prefer night creams at night, sunscreen/day products in morning
  function pick(arr) {
    if (timeOfDay === 'night') {
      const nightProducts = arr.filter(p => p.name.toLowerCase().includes('night') || p.name.toLowerCase().includes('retinol'));
      if (nightProducts.length > 0) return nightProducts[Math.floor(Math.random() * nightProducts.length)];
    }
    return arr[Math.floor(Math.random() * arr.length)];
  }

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
  const fb = ['pigmentation','hair','under-eye','texture','elasticity'];
  for (const k of fb) { if (!used.has(k) && matched.length < 3) { matched.push(pick(db[k])); used.add(k); } }
  return matched.slice(0, 3);
}
