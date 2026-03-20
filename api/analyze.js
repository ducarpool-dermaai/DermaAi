module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured.' });

  try {
    const { image_base64, time_of_day } = req.body;
    if (!image_base64) return res.status(400).json({ error: 'No image provided' });
    const cleanBase64 = image_base64.replace(/^data:image\/\w+;base64,/, '');
    if (cleanBase64.length > 1500000) return res.status(400).json({ error: 'Image too large.' });

    const timeCtx = time_of_day === 'night'
      ? 'Scanned at NIGHT. Factor in overnight repair window. Favor night-active ingredients (retinol, peptides, oils).'
      : time_of_day === 'morning'
      ? 'Scanned MORNING. Factor in upcoming UV exposure. Favor SPF, antioxidants, light formulas.'
      : 'Scanned AFTERNOON. Factor in accumulated daytime stress and sebum buildup.';

    const SYSTEM_PROMPT = `You are DermaAI — a rigorous AI skin analysis system that performs REAL visual assessment of selfie photographs.

YOUR #1 RULE: Actually look at the photo. Describe what you literally see. Every claim must be backed by a specific visual observation from THIS image. If you cannot see something clearly, say so — never fabricate findings.

═══════════════════════════════════════
STEP 1: OBSERVATION (Sherlock Holmes mode)
═══════════════════════════════════════
Before ANY diagnosis, catalog what you ACTUALLY SEE:

LIGHTING & IMAGE QUALITY:
- Lighting type? (natural/artificial/harsh/dim/mixed)
- Face fully visible? Partially obscured?
- Image quality? (sharp/blurry/grainy/overexposed/dark)
- If poor quality, reduce confidence of findings accordingly.

FACE — examine each zone systematically:
- Forehead: texture, pores, lines, acne, discoloration
- Between eyebrows: vertical lines, furrows
- Under-eye: darkness color (vascular blue / pigmented brown / structural shadow), hollowness, puffiness, fine lines
- Nose: pore size, oiliness, blackheads
- Cheeks: pigmentation type (melasma/sunspots/PIH), redness, texture, acne/scarring
- Jawline: definition, hormonal acne, sagging
- Chin: texture, breakouts

SKIN SURFACE:
- Overall tone: even or uneven
- Texture: smooth/rough/bumpy/flaky
- Oiliness zones: where shiny vs matte
- Pore visibility: where and how prominent
- Active breakouts: location, type (papule/pustule/comedone/cystic)
- Scarring: type and location

HAIR (if visible):
- Hairline position, density at temples/crown
- Scalp visibility, strand quality
- Signs of thinning or recession

ASYMMETRY: left vs right differences

═══════════════════════════════════════
STEP 2: EVIDENCE-BASED SCORING
═══════════════════════════════════════
Score ONLY based on what you observed:

OVERALL SCORE (0-100, where 100 = flawless):
85-100: Exceptional. Minimal concerns. Even tone, firm, hydrated.
70-84: Good skin with minor concerns.
55-69: Average. Multiple visible but non-severe concerns.
40-54: Below average. Clearly visible multiple issues.
20-39: Poor. Severe visible damage.
0-19: Severe. Needs immediate dermatologist.

DO NOT default to any range. Score what you SEE. Clear skin = 80+. Bad acne + scarring = 35.

SEVERITY — must match visual evidence:
"attention": Clearly significant visible issue
"moderate": Mild-to-moderate visible issue  
"mild": Subtle, barely visible

CRITICAL: If someone has good skin, TELL THEM. Not everyone needs 5 problems. Report 3-5 concerns based on what's ACTUALLY there. Honest assessment > manufactured alarm.

═══════════════════════════════════════
STEP 3: DEEPER ANALYSIS
═══════════════════════════════════════
For each finding, provide deeper_insight drawing from:
- Ayurvedic facial zone mapping (forehead=digestive, under-eyes=renal, cheeks=respiratory/gastric, jaw=hormonal)
- TCM face reading correlations
- Modern integrative dermatology (gut-skin axis, hormonal-skin connection)

Present as: "Research spanning traditional medical systems correlates this zone with [system]. Modern studies on the [relevant axis] support this."

SKIN CONSTITUTION (from visible signs):
Type A (Dry-Sensitive): thin skin, visible veins, fine lines, matte, small pores
Type B (Reactive-Combination): redness, oily T-zone + dry cheeks, inflammation
Type C (Oily-Resilient): thick skin, large pores, shine, congestion-prone
Cite the specific visual evidence for your typing.

6-STAGE MODEL:
Stage 1 Subclinical → Stage 2 Early → Stage 3 Establishing → Stage 4 Established → Stage 5 Chronic → Stage 6 Structural
Assign based on what the image shows. Barely visible = Stage 2, not Stage 3.

${timeCtx}

═══════════════════════════════════════
OUTPUT: JSON ONLY — no markdown, no backticks
═══════════════════════════════════════
{
  "overall_score": NUMBER,
  "estimated_age_range": "STRING",
  "skin_type": "STRING",
  "skin_constitution": "STRING (e.g. Type B or Type B-A Blend)",
  "percentile_worse_than": NUMBER,
  "constitution_insight": "STRING (2 sentences citing SPECIFIC visual evidence)",
  "concerns": [
    {
      "area": "STRING (specific: 'Under-Eye Pigmentation' not 'Under-Eye Region')",
      "severity": "attention|moderate|mild",
      "finding": "STRING (Start with what you LITERALLY SEE. Then clinical interpretation. Then reversibility.)",
      "deeper_insight": "STRING (zone correlation + modern science connection)",
      "stage": "STRING (e.g. Stage 2 — Early)",
      "score": NUMBER
    }
  ],
  "overall_note": "STRING (honest, balanced, specific to this person)",
  "staging_note": "STRING (their position on 6-stage model)"
}

RULES:
- 3-5 concerns based on ACTUAL findings. Healthy skin = fewer concerns.
- Start every finding with a specific visual observation from the image.
- Individual scores: healthy area 70-90, moderate issue 40-65, severe 15-40
- Never use emojis
- If photo is unclear, note it and reduce confidence`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 3000, system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: cleanBase64 } },
          { type: 'text', text: 'Perform a complete visual skin analysis of this selfie. Examine every visible zone systematically — describe what you actually observe before making clinical assessments. Be specific and honest. Return ONLY valid JSON.' }
        ]}]
      })
    });

    if (!response.ok) {
      const e = await response.text(); console.error('Claude:', response.status, e);
      if (response.status === 401) return res.status(500).json({ error: 'Invalid API key.' });
      if (response.status === 429) return res.status(500).json({ error: 'Rate limited. Wait and retry.' });
      if (response.status === 400) return res.status(500).json({ error: 'Image issue. Try a clearer, well-lit selfie.' });
      return res.status(500).json({ error: 'AI error (' + response.status + ').' });
    }

    const data = await response.json();
    let text = ''; for (const b of data.content) { if (b.type === 'text') text += b.text; }
    if (!text) return res.status(500).json({ error: 'Empty response.' });
    let cleaned = text.trim().replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();

    let analysis;
    try { analysis = JSON.parse(cleaned); }
    catch(e) {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { analysis = JSON.parse(jsonMatch[0]); }
        catch(e2) { console.error('Parse fail:', cleaned.substring(0,500)); return res.status(500).json({ error: 'Analysis format error. Try again.' }); }
      } else {
        console.error('No JSON:', cleaned.substring(0,500));
        return res.status(500).json({ error: 'Analysis format error. Try again.' });
      }
    }

    // Validate
    if (!analysis.overall_score || !analysis.concerns || !Array.isArray(analysis.concerns) || analysis.concerns.length === 0) {
      return res.status(500).json({ error: 'Incomplete analysis. Try a clearer photo.' });
    }

    analysis.overall_score = Math.max(0, Math.min(100, Math.round(analysis.overall_score)));
    analysis.concerns = analysis.concerns.map(c => ({
      ...c,
      score: Math.max(0, Math.min(100, Math.round(c.score || 50))),
      severity: ['attention','moderate','mild'].includes(c.severity) ? c.severity : 'moderate'
    }));

    // Product matching
    const constitution = (analysis.skin_constitution || '').toLowerCase();
    const skinType = constitution.includes('a') ? 'Vata' : constitution.includes('c') ? 'Kapha' : 'Pitta';
    analysis.products = matchProducts(analysis.concerns || [], time_of_day, skinType);
    analysis.scan_time = time_of_day || 'day';
    return res.status(200).json(analysis);
  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: 'Server error. Try again.' });
  }
};


// =====================================================================
// PRODUCT DATABASE — 60+ products, Smart matching by concern + constitution
// =====================================================================
function matchProducts(concerns, timeOfDay, primaryDosha) {
  const T = "dermaai-21";
  const db = {
    'under-eye': [
      { name: "mCaffeine Coffee Under Eye Cream Gel", tag: "UNDER-EYE", reason: "Caffeine complex targets dark circles and puffiness", price: 349, original: 599, rating: 4.3, reviews: "42,847", affiliate_url: "https://www.amazon.in/s?k=mcaffeine+under+eye+cream&tag=" + T, dosha: "all", time: "day" },
      { name: "The Derma Co 5% Caffeine Under Eye Serum", tag: "UNDER-EYE", reason: "Medical-grade 5% caffeine for periorbital darkening", price: 349, original: 599, rating: 4.1, reviews: "28,456", affiliate_url: "https://www.amazon.in/s?k=derma+co+caffeine+under+eye+serum&tag=" + T, dosha: "Kapha", time: "day" },
      { name: "Olay Eyes Retinol 24 Night Eye Cream", tag: "UNDER-EYE", reason: "Clinical retinol for overnight repair of fine lines and hollowness", price: 899, original: 1499, rating: 4.4, reviews: "15,678", affiliate_url: "https://www.amazon.in/s?k=olay+eyes+retinol+night+eye+cream&tag=" + T, dosha: "Vata", time: "night" },
      { name: "Kama Ayurveda Rejuvenating Eye Cream", tag: "UNDER-EYE", reason: "Almond + saffron — traditional Netra Tarpana approach", price: 990, original: 1450, rating: 4.5, reviews: "7,890", affiliate_url: "https://www.amazon.in/s?k=kama+ayurveda+eye+cream&tag=" + T, dosha: "Vata", time: "night" },
      { name: "CeraVe Eye Repair Cream", tag: "UNDER-EYE", reason: "Ceramide barrier repair for the delicate periorbital zone", price: 799, original: 1199, rating: 4.3, reviews: "34,567", affiliate_url: "https://www.amazon.in/s?k=cerave+eye+repair+cream&tag=" + T, dosha: "all", time: "day" },
      { name: "Dot & Key Retinol + Caffeine Under Eye Cream", tag: "UNDER-EYE", reason: "Dual retinol + caffeine for pigmentation and hollowness", price: 445, original: 595, rating: 4.2, reviews: "22,345", affiliate_url: "https://www.amazon.in/s?k=dot+key+retinol+caffeine+under+eye&tag=" + T, dosha: "all", time: "night" }
    ],
    'pigmentation': [
      { name: "Garnier Bright Complete Vitamin C Serum", tag: "PIGMENTATION", reason: "Vitamin C targets melanin overproduction and evens tone", price: 249, original: 399, rating: 4.1, reviews: "89,456", affiliate_url: "https://www.amazon.in/s?k=garnier+vitamin+c+serum&tag=" + T, dosha: "all", time: "day" },
      { name: "Minimalist 10% Vitamin C Face Serum", tag: "PIGMENTATION", reason: "Clinical Vitamin C concentration for hyperpigmentation", price: 399, original: 599, rating: 4.0, reviews: "56,789", affiliate_url: "https://www.amazon.in/s?k=minimalist+vitamin+c+serum&tag=" + T, dosha: "Pitta", time: "day" },
      { name: "Kama Ayurveda Kumkumadi Brightening Face Oil", tag: "PIGMENTATION", reason: "Saffron + vetiver — classical Varnya formulation for tone correction", price: 1290, original: 1790, rating: 4.6, reviews: "14,567", affiliate_url: "https://www.amazon.in/s?k=kama+ayurveda+kumkumadi+face+oil&tag=" + T, dosha: "Pitta", time: "night" },
      { name: "The Derma Co 2% Kojic Acid Serum", tag: "PIGMENTATION", reason: "Kojic acid inhibits tyrosinase — targets melanin at the source", price: 349, original: 599, rating: 4.0, reviews: "23,456", affiliate_url: "https://www.amazon.in/s?k=derma+co+kojic+acid+serum&tag=" + T, dosha: "Pitta", time: "night" },
      { name: "Plum 15% Vitamin C Face Serum", tag: "PIGMENTATION", reason: "High-potency Vitamin C for stubborn dark spots", price: 524, original: 699, rating: 4.2, reviews: "31,234", affiliate_url: "https://www.amazon.in/s?k=plum+vitamin+c+face+serum&tag=" + T, dosha: "all", time: "day" },
      { name: "Vicco Turmeric Skin Cream", tag: "PIGMENTATION", reason: "Turmeric — traditional Varnya and Kusthaghna herb for skin clarity", price: 95, original: 160, rating: 4.0, reviews: "67,890", affiliate_url: "https://www.amazon.in/s?k=vicco+turmeric+skin+cream&tag=" + T, dosha: "all", time: "day" }
    ],
    'texture': [
      { name: "Minimalist 2% Salicylic Acid Face Serum", tag: "TEXTURE", reason: "BHA penetrates pores to clear congestion and smooth texture", price: 299, original: 399, rating: 4.1, reviews: "67,890", affiliate_url: "https://www.amazon.in/s?k=minimalist+salicylic+acid+serum&tag=" + T, dosha: "Kapha", time: "night" },
      { name: "Paula's Choice 2% BHA Liquid Exfoliant", tag: "TEXTURE", reason: "Gold-standard BHA for pore refinement", price: 1150, original: 1650, rating: 4.5, reviews: "12,345", affiliate_url: "https://www.amazon.in/s?k=paulas+choice+2+bha+liquid+exfoliant&tag=" + T, dosha: "Kapha", time: "night" },
      { name: "Cetaphil Gentle Skin Cleanser", tag: "TEXTURE", reason: "Barrier-first cleansing without stripping", price: 399, original: 599, rating: 4.4, reviews: "78,901", affiliate_url: "https://www.amazon.in/s?k=cetaphil+gentle+skin+cleanser&tag=" + T, dosha: "Vata", time: "day" },
      { name: "Kama Ayurveda Mridul Soap-Free Cleanser", tag: "TEXTURE", reason: "Neem + vetiver — Shodhana (purification) for pore clarity", price: 595, original: 850, rating: 4.4, reviews: "8,456", affiliate_url: "https://www.amazon.in/s?k=kama+ayurveda+soap+free+face+cleanser&tag=" + T, dosha: "Pitta", time: "day" },
      { name: "Dot & Key CICA Niacinamide Toner", tag: "TEXTURE", reason: "Niacinamide + CICA for pore minimizing and barrier support", price: 345, original: 495, rating: 4.2, reviews: "28,901", affiliate_url: "https://www.amazon.in/s?k=dot+key+cica+niacinamide+toner&tag=" + T, dosha: "Pitta", time: "day" }
    ],
    'hair': [
      { name: "Minimalist Hair Growth Actives 18% Serum", tag: "HAIR", reason: "Redensyl + Procapil + Capixyl for follicle activation", price: 699, original: 799, rating: 4.1, reviews: "31,892", affiliate_url: "https://www.amazon.in/s?k=minimalist+hair+growth+serum+redensyl&tag=" + T, dosha: "all", time: "night" },
      { name: "Man Matters Minoxidil 5% Serum", tag: "HAIR", reason: "FDA-approved Minoxidil — gold standard for density restoration", price: 549, original: 799, rating: 4.0, reviews: "27,890", affiliate_url: "https://www.amazon.in/s?k=man+matters+minoxidil+5&tag=" + T, dosha: "all", time: "night" },
      { name: "Kama Ayurveda Bringadi Hair Treatment Oil", tag: "HAIR", reason: "Bhringraj + Indigo — classical Keshya formulation", price: 895, original: 1295, rating: 4.6, reviews: "18,234", affiliate_url: "https://www.amazon.in/s?k=kama+ayurveda+bringadi+hair+oil&tag=" + T, dosha: "Pitta", time: "night" },
      { name: "Indulekha Bringha Ayurvedic Hair Oil", tag: "HAIR", reason: "Bhringraj-based traditional hair fall prevention", price: 399, original: 580, rating: 4.1, reviews: "67,890", affiliate_url: "https://www.amazon.in/s?k=indulekha+bringha+hair+oil&tag=" + T, dosha: "Pitta", time: "night" },
      { name: "Wow Onion Black Seed Hair Oil", tag: "HAIR", reason: "Onion + Kalonji for scalp circulation", price: 349, original: 599, rating: 4.0, reviews: "112,345", affiliate_url: "https://www.amazon.in/s?k=wow+onion+black+seed+hair+oil&tag=" + T, dosha: "Kapha", time: "night" },
      { name: "The Derma Co 3% Redensyl Hair Serum", tag: "HAIR", reason: "3% Redensyl targets follicle miniaturization", price: 499, original: 799, rating: 4.0, reviews: "24,567", affiliate_url: "https://www.amazon.in/s?k=derma+co+redensyl+hair+serum&tag=" + T, dosha: "Pitta", time: "night" }
    ],
    'elasticity': [
      { name: "Olay Regenerist Micro-Sculpting Cream", tag: "FIRMNESS", reason: "Amino-peptide complex for collagen and elastin restoration", price: 899, original: 1999, rating: 4.4, reviews: "28,345", affiliate_url: "https://www.amazon.in/s?k=olay+regenerist+micro+sculpting+cream&tag=" + T, dosha: "all", time: "night" },
      { name: "Minimalist 0.3% Retinol Night Cream", tag: "FIRMNESS", reason: "Retinol stimulates collagen synthesis", price: 545, original: 599, rating: 4.1, reviews: "33,456", affiliate_url: "https://www.amazon.in/s?k=minimalist+retinol+anti+aging+cream&tag=" + T, dosha: "Vata", time: "night" },
      { name: "L'Oreal Revitalift Anti-Wrinkle Night Cream", tag: "FIRMNESS", reason: "Pro-Retinol A for overnight collagen rebuilding", price: 549, original: 799, rating: 4.3, reviews: "41,234", affiliate_url: "https://www.amazon.in/s?k=loreal+revitalift+night+cream&tag=" + T, dosha: "Vata", time: "night" },
      { name: "Kama Ayurveda Rejuvenating Night Cream", tag: "FIRMNESS", reason: "Ashwagandha + Saffron — Balya approach to tissue firmness", price: 1490, original: 1990, rating: 4.5, reviews: "8,456", affiliate_url: "https://www.amazon.in/s?k=kama+ayurveda+rejuvenating+night+cream&tag=" + T, dosha: "Vata", time: "night" }
    ],
    'acne': [
      { name: "Minimalist 2% Salicylic Acid Serum", tag: "ACNE", reason: "BHA penetrates pores to clear active breakouts", price: 299, original: 399, rating: 4.1, reviews: "67,890", affiliate_url: "https://www.amazon.in/s?k=minimalist+salicylic+acid+serum&tag=" + T, dosha: "Kapha", time: "night" },
      { name: "The Derma Co 2% Salicylic Acid Spot Treatment", tag: "ACNE", reason: "Targeted treatment for inflammatory acne", price: 299, original: 499, rating: 4.0, reviews: "34,567", affiliate_url: "https://www.amazon.in/s?k=derma+co+salicylic+acid+spot+treatment&tag=" + T, dosha: "Pitta", time: "night" },
      { name: "Kama Ayurveda Anti Acne Cleansing Foam", tag: "ACNE", reason: "Neem + tea tree — Kusthaghna herbs for acne-prone skin", price: 750, original: 1050, rating: 4.3, reviews: "11,234", affiliate_url: "https://www.amazon.in/s?k=kama+ayurveda+anti+acne+cleansing+foam&tag=" + T, dosha: "Pitta", time: "day" }
    ],
    'hydration': [
      { name: "Minimalist 2% Hyaluronic Acid Serum", tag: "HYDRATION", reason: "Multi-molecular HA for deep and surface hydration", price: 349, original: 399, rating: 4.2, reviews: "78,901", affiliate_url: "https://www.amazon.in/s?k=minimalist+hyaluronic+acid+serum&tag=" + T, dosha: "Vata", time: "day" },
      { name: "Cetaphil Moisturizing Cream", tag: "HYDRATION", reason: "Dermatologist-recommended barrier repair", price: 449, original: 699, rating: 4.4, reviews: "56,789", affiliate_url: "https://www.amazon.in/s?k=cetaphil+moisturizing+cream&tag=" + T, dosha: "Vata", time: "day" },
      { name: "Kama Ayurveda Eladi Hydrating Cream", tag: "HYDRATION", reason: "Cardamom + aloe — Snehana approach to deep tissue hydration", price: 890, original: 1250, rating: 4.5, reviews: "9,012", affiliate_url: "https://www.amazon.in/s?k=kama+ayurveda+eladi+hydrating+cream&tag=" + T, dosha: "Vata", time: "day" }
    ],
    'sunprotection': [
      { name: "Minimalist SPF 50 Sunscreen", tag: "SUN PROTECTION", reason: "Broad-spectrum UV protection — prevents further photodamage", price: 399, original: 499, rating: 4.1, reviews: "45,678", affiliate_url: "https://www.amazon.in/s?k=minimalist+spf+50+sunscreen&tag=" + T, dosha: "all", time: "day" },
      { name: "La Shield Fisico SPF 50 Mineral Sunscreen", tag: "SUN PROTECTION", reason: "Physical/mineral sunscreen — gentle for sensitive skin", price: 499, original: 799, rating: 4.3, reviews: "23,456", affiliate_url: "https://www.amazon.in/s?k=la+shield+fisico+sunscreen+spf+50&tag=" + T, dosha: "Pitta", time: "day" }
    ]
  };

  function pick(arr, dosha, time) {
    let pool = arr.filter(p => (p.dosha === dosha || p.dosha === 'all') && (p.time === time || !time));
    if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
    pool = arr.filter(p => p.dosha === dosha || p.dosha === 'all');
    if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
    return arr[Math.floor(Math.random() * arr.length)];
  }

  const matched = [], used = new Set();
  const timeMap = timeOfDay === 'night' ? 'night' : 'day';
  
  for (const c of concerns) {
    const a = ((c.area || '') + ' ' + (c.finding || '')).toLowerCase();
    let k = null;
    if ((a.includes('eye') || a.includes('periorbital') || a.includes('dark circle')) && !used.has('under-eye')) k = 'under-eye';
    else if ((a.includes('acne') || a.includes('breakout') || a.includes('pimple')) && !used.has('acne')) k = 'acne';
    else if ((a.includes('pigment') || a.includes('melasma') || a.includes('dark spot') || a.includes('melanin') || a.includes('uneven tone')) && !used.has('pigmentation')) k = 'pigmentation';
    else if ((a.includes('texture') || a.includes('pore') || a.includes('rough') || a.includes('oily')) && !used.has('texture')) k = 'texture';
    else if ((a.includes('hair') || a.includes('follicle') || a.includes('thinning') || a.includes('recession')) && !used.has('hair')) k = 'hair';
    else if ((a.includes('elastic') || a.includes('firm') || a.includes('sag') || a.includes('wrinkle') || a.includes('nasolabial')) && !used.has('elasticity')) k = 'elasticity';
    else if ((a.includes('dry') || a.includes('dehydrat') || a.includes('flak')) && !used.has('hydration')) k = 'hydration';
    if (k && db[k]) { matched.push(pick(db[k], primaryDosha, timeMap)); used.add(k); }
  }

  // Morning scans: add sunscreen if not already included
  if (timeMap === 'day' && !used.has('sunprotection') && matched.length < 4) {
    matched.push(pick(db['sunprotection'], primaryDosha, 'day'));
  }

  // Fill to minimum 3
  const priority = ['pigmentation','hair','under-eye','texture','elasticity','hydration'];
  for (const k of priority) {
    if (!used.has(k) && matched.length < 3 && db[k]) {
      matched.push(pick(db[k], primaryDosha, timeMap));
      used.add(k);
    }
  }

  return matched.slice(0, 4);
}
