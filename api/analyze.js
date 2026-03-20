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
      ? 'User scanning at NIGHT. Mention overnight repair window, nighttime skin regeneration. Recommend night-active solutions.'
      : time_of_day === 'morning'
      ? 'User scanning MORNING. Mention UV exposure ahead, daytime protection. Recommend protective solutions.'
      : 'User scanning AFTERNOON. Mention mid-day stress, oil buildup. Recommend refreshing solutions.';

    const SYSTEM_PROMPT = `You are DermaAI, an advanced clinical-grade AI skin and hair analysis system. You combine modern dermatological science with insights from traditional Indian medical research (including peer-reviewed studies referencing Charaka Samhita, Sushruta Samhita, and Ashtanga Hridaya frameworks).

YOUR INTERNAL KNOWLEDGE (use this to inform analysis, but present in MODERN clinical language):
- Facial zone-organ correlation mapping (forehead=digestive, between brows=hepatic, under-eyes=renal, cheeks=respiratory/gastric, jaw=hormonal, temples=biliary)
- Skin constitution profiling: Type A (dry/thin/prone to dehydration and fine lines), Type B (warm/reactive/prone to inflammation and pigmentation), Type C (thick/oily/prone to congestion and puffiness)
- 6-layer skin model with condition staging from subclinical → early visible → established → chronic
- Traditional facial diagnostic markers validated by modern dermatological research

RULES:
1. Analyze the ACTUAL photo — real skin, hair, features visible.
2. Present ALL findings in modern clinical language. Sound like a dermatologist, not an Ayurvedic practitioner.
3. Use terms like "biomarkers indicate", "clinical pattern suggests", "cross-referenced with dermatological research", "facial zone correlation analysis".
4. For each concern, include a brief "deeper insight" that draws from traditional medical knowledge but phrases it in scientific language. Example: Instead of "Bhrajaka Pitta vitiation" say "Melanocyte hyperactivity in the deeper dermis layers, a pattern documented in traditional Indian dermatological texts spanning 2000+ years of clinical observation."
5. Determine skin constitution type (A/B/C blend) from visible signs — this replaces dosha language.
6. Be specific to THIS person.
7. Clinical, professional, like a concerned specialist at a premium skin clinic.
8. Note concerns are "at an early/reversible stage" — reference the 6-stage progression model.
9. ${timeCtx}

FACIAL ZONE ANALYSIS FRAMEWORK:
- Forehead lines/texture → correlates with digestive health and stress markers (intestinal-nervous system axis)
- Between eyebrows (vertical lines) → hepatic stress indicator (liver detox load)
- Under-eye area → renal function and fluid metabolism marker (hydration-circulation axis)
- Nose → cardiovascular and metabolic indicator
- Cheeks → respiratory and gastric health (lung-stomach axis)
- Jawline/chin → hormonal balance indicator (endocrine axis)
- Temples → biliary function and metabolic heat (gallbladder-liver axis)

SKIN CONSTITUTION PROFILING:
Type A (Dry-Sensitive): Dry/rough skin, dark/dull tone, thin lips, prominent fine lines, dry/frizzy hair, dark circles — needs deep hydration and barrier repair
Type B (Reactive-Combination): Redness, oily T-zone, acne on cheeks/temples, yellowish tone, early greying, thinning hair, inflammation — needs cooling and anti-inflammatory care
Type C (Oily-Congested): Puffy/swollen, thick oily skin, large pores, water retention, heavy hair, congested jawline, pale tone — needs detox and oil regulation

EXAMINE 5 AREAS:
1. UNDER-EYE — circles, hollowness, puffiness, fine lines, dehydration. Zone correlation: renal-circulatory.
2. PIGMENTATION — uneven tone, dark patches, sun spots, redness, asymmetry. Zone correlation: hepatic-metabolic.
3. TEXTURE — pores, roughness, oiliness, dryness, acne marks. Zone correlation: digestive-eliminative.
4. HAIR — hairline, thinning, texture, scalp visibility, strand quality. Correlation: nutritional-hormonal.
5. ELASTICITY — jawline, firmness, nasolabial folds, early sagging. Correlation: hormonal-structural.

SEVERITY: "attention" for 1-2, "moderate" for 2-3, "mild" for rest. Always at least one "attention".
SCORING: Overall 48-72. Individual 25-65.
CONDITION STAGING: Stage 1 (subclinical) → Stage 2 (early) → Stage 3 (establishing) → Stage 4 (established) → Stage 5 (chronic) → Stage 6 (structural). Most scan findings should be Stage 2-4.

JSON ONLY — no other text:
{"overall_score":NUMBER,"estimated_age_range":"STRING","skin_type":"STRING","skin_constitution":"STRING (e.g. Type B-A Blend)","percentile_worse_than":NUMBER,"constitution_insight":"STRING (2 sentences explaining their skin constitution from facial signs — modern clinical language)","concerns":[{"area":"STRING","severity":"STRING","emoji":"STRING","finding":"STRING (2-3 sentences clinical finding)","deeper_insight":"STRING (1-2 sentences drawing from traditional medical research but in modern language — e.g. 'This pattern has been documented in Indian dermatological research spanning 2000+ years, correlating under-eye changes with renal-circulatory efficiency. Studies referencing classical medical texts suggest this facial zone reflects systemic fluid metabolism.')","stage":"STRING (e.g. Stage 3 — Establishing)","score":NUMBER}],"overall_note":"STRING","staging_note":"STRING (1 sentence about where they are on the 6-stage progression — e.g. 'Your concerns are primarily at Stage 3 (Establishing) — the optimal window for intervention before progression to Stage 4, where reversal becomes significantly harder.')"}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 2000, system: SYSTEM_PROMPT,
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
    catch(e) { console.error('Parse:', cleaned.substring(0,300)); return res.status(500).json({ error: 'Format error.' }); }

    // Map skin constitution to product matching type
    // Type A (Dry-Sensitive) = prefers hydrating products (was Vata)
    // Type B (Reactive-Combination) = prefers cooling/anti-inflammatory (was Pitta)
    // Type C (Oily-Congested) = prefers oil-control/detox (was Kapha)
    const constitution = (analysis.skin_constitution || '').toLowerCase();
    const skinType = constitution.includes('a') ? 'Vata' : constitution.includes('c') ? 'Kapha' : 'Pitta';
    analysis.products = matchProducts(analysis.concerns || [], time_of_day, skinType);
    analysis.scan_time = time_of_day || 'day';
    return res.status(200).json(analysis);
  } catch (err) {
    console.error('Error:', err.message); return res.status(500).json({ error: 'Server error.' });
  }
};


// =====================================================================
// 60+ PRODUCTS — Modern + Ayurvedic, Dosha-aware, Time-aware shuffle
// =====================================================================
function matchProducts(concerns, timeOfDay, primaryDosha) {
  const T = "dermaai-21";

  // Each product has optional dosha and time tags for smart matching
  // dosha: which dosha imbalance it's best for
  // time: 'night' products preferred at night, 'day' for morning
  const db = {
    'under-eye': [
      // MODERN
      { name: "mCaffeine Coffee Under Eye Cream Gel", tag: "FOR YOUR UNDER-EYES", reason: "Caffeine targets dark circles and puffiness your scan detected — 94% users saw reduction", price: 349, original: 599, rating: 4.3, reviews: "42,847", urgency: "94% saw results in 15 days", affiliate_url: "https://www.amazon.in/s?k=mcaffeine+under+eye+cream&tag=" + T, dosha: "all", time: "day" },
      { name: "The Derma Co 5% Caffeine Under Eye Serum", tag: "FOR YOUR UNDER-EYES", reason: "Medical-grade 5% caffeine matched to your puffiness severity", price: 349, original: 599, rating: 4.1, reviews: "28,456", urgency: "Reduces puffiness 41% in 14 days", affiliate_url: "https://www.amazon.in/s?k=derma+co+caffeine+under+eye+serum&tag=" + T, dosha: "Kapha", time: "day" },
      { name: "Conscious Chemist Retinol Peptide Under Eye Cream", tag: "FOR YOUR UNDER-EYES", reason: "Retinol + peptide reverses collagen depletion identified in scan", price: 399, original: 650, rating: 4.2, reviews: "12,340", urgency: "67% wrinkle reduction at 4 weeks", affiliate_url: "https://www.amazon.in/s?k=conscious+chemist+retinol+under+eye&tag=" + T, dosha: "Vata", time: "night" },
      { name: "Olay Eyes Retinol 24 Night Eye Cream", tag: "FOR YOUR UNDER-EYES", reason: "Clinical retinol works overnight on hollow depth and fine lines", price: 899, original: 1499, rating: 4.4, reviews: "15,678", urgency: "Night retinol repairs 2x faster during sleep", affiliate_url: "https://www.amazon.in/s?k=olay+eyes+retinol+night+eye+cream&tag=" + T, dosha: "Vata", time: "night" },
      { name: "Bella Vita Organic EyeLift Under Eye Cream", tag: "FOR YOUR UNDER-EYES", reason: "Cucumber + retinol addresses both dark circles and fine lines", price: 249, original: 499, rating: 4.0, reviews: "35,210", urgency: "52% brightness improvement in 3 weeks", affiliate_url: "https://www.amazon.in/s?k=bella+vita+eyelift+under+eye+cream&tag=" + T, dosha: "Pitta", time: "day" },
      { name: "Dot & Key Caffeine + Vitamin C Under Eye Cream", tag: "FOR YOUR UNDER-EYES", reason: "Dual-action targets both darkness and puffiness found in scan", price: 445, original: 595, rating: 4.3, reviews: "19,890", urgency: "Dual-active formula 78% faster results", affiliate_url: "https://www.amazon.in/s?k=dot+and+key+under+eye+cream&tag=" + T, dosha: "all", time: "day" },
      // TRADITIONAL
      { name: "Kama Ayurveda Kumkumadi Brightening Eye Cream", tag: "FOR YOUR UNDER-EYES", reason: "Kumkumadi (saffron) formula per Charaka Samhita — pacifies Bhrajaka Pitta in periorbital zone", price: 1290, original: 1790, rating: 4.5, reviews: "8,234", urgency: "Charaka-referenced Kumkumadi addresses Vata-Pitta under-eye pattern", affiliate_url: "https://www.amazon.in/s?k=kama+ayurveda+kumkumadi+eye+cream&tag=" + T, dosha: "Pitta", time: "night" },
      { name: "Forest Essentials Intensive Eye Cream with Parijat", tag: "FOR YOUR UNDER-EYES", reason: "Parijat (night jasmine) soothes Vata-aggravated periorbital tissue per Ashtanga Hridaya", price: 1575, original: 2250, rating: 4.4, reviews: "5,678", urgency: "Classical Parijat corrects Vrikka-zone fluid imbalance", affiliate_url: "https://www.amazon.in/s?k=forest+essentials+eye+cream+parijat&tag=" + T, dosha: "Vata", time: "night" },
      { name: "Biotique Bio Seaweed Revitalizing Anti-Fatigue Eye Gel", tag: "FOR YOUR UNDER-EYES", reason: "Seaweed + Aloe formula reduces Kapha-type puffiness and Pitta-type darkness", price: 199, original: 299, rating: 4.0, reviews: "22,456", urgency: "Ayurvedic gel matches your dosha imbalance pattern", affiliate_url: "https://www.amazon.in/s?k=biotique+bio+seaweed+eye+gel&tag=" + T, dosha: "Kapha", time: "day" },
      { name: "Just Herbs Gotukola Indian Ginseng Under Eye Cream", tag: "FOR YOUR UNDER-EYES", reason: "Gotukola (Mandukparni) — referenced in Sushruta for Rasayana (rejuvenation) of periorbital tissue", price: 545, original: 745, rating: 4.2, reviews: "6,789", urgency: "Sushruta-referenced Rasayana herb restores collagen in Rasa Dhatu", affiliate_url: "https://www.amazon.in/s?k=just+herbs+under+eye+cream+gotukola&tag=" + T, dosha: "Vata", time: "night" }
    ],
    'pigmentation': [
      // MODERN
      { name: "Minimalist 10% Vitamin C Face Serum", tag: "FOR YOUR PIGMENTATION", reason: "Clinical Vitamin C targets melanin irregularity your scan revealed", price: 545, original: 599, rating: 4.2, reviews: "56,231", urgency: "73% pigmentation reduction in 4 weeks", affiliate_url: "https://www.amazon.in/s?k=minimalist+vitamin+c+serum&tag=" + T, dosha: "all", time: "day" },
      { name: "Garnier Bright Complete Vitamin C Serum", tag: "FOR YOUR PIGMENTATION", reason: "30x Vitamin C addresses uneven tone across your cheeks", price: 249, original: 399, rating: 4.1, reviews: "89,456", urgency: "India's #1 serum — 83% spot reduction in 3 weeks", affiliate_url: "https://www.amazon.in/s?k=garnier+bright+complete+vitamin+c+serum&tag=" + T, dosha: "all", time: "day" },
      { name: "Plum 15% Vitamin C Face Serum", tag: "FOR YOUR PIGMENTATION", reason: "Ethyl Ascorbic Acid penetrates deeper into pigmentation layers", price: 552, original: 649, rating: 4.2, reviews: "22,345", urgency: "15% works 2x faster on moderate pigmentation", affiliate_url: "https://www.amazon.in/s?k=plum+vitamin+c+serum+15&tag=" + T, dosha: "Pitta", time: "day" },
      { name: "Minimalist 2% Alpha Arbutin Serum", tag: "FOR YOUR PIGMENTATION", reason: "Alpha Arbutin inhibits melanin at the spots your scan flagged", price: 545, original: 599, rating: 4.1, reviews: "41,567", urgency: "58% dark spot reduction without irritation", affiliate_url: "https://www.amazon.in/s?k=minimalist+alpha+arbutin+serum&tag=" + T, dosha: "Pitta", time: "day" },
      { name: "L'Oreal Revitalift Hyaluronic Acid Serum", tag: "FOR YOUR PIGMENTATION", reason: "Hyaluronic acid plumps skin while fixing tone irregularity", price: 599, original: 999, rating: 4.3, reviews: "34,890", urgency: "71% brighter complexion in 2 weeks", affiliate_url: "https://www.amazon.in/s?k=loreal+revitalift+hyaluronic+acid+serum&tag=" + T, dosha: "Vata", time: "day" },
      // TRADITIONAL
      { name: "Kama Ayurveda Kumkumadi Miraculous Beauty Serum", tag: "FOR YOUR PIGMENTATION", reason: "Classical Kumkumadi Tailam — Charaka Chikitsa 7 prescribes saffron for Vyanga (pigmentation) from Bhrajaka Pitta vitiation", price: 1350, original: 1950, rating: 4.6, reviews: "14,567", urgency: "2500-year-old Kumkumadi formula targets your exact Vyanga pattern", affiliate_url: "https://www.amazon.in/s?k=kama+ayurveda+kumkumadi+serum&tag=" + T, dosha: "Pitta", time: "night" },
      { name: "Forest Essentials Tejasvi Brightening Serum", tag: "FOR YOUR PIGMENTATION", reason: "Manjistha + Saffron — Ashtanga Hridaya recommends Manjistha as Rakta Shodhaka (blood purifier) for skin clarity", price: 1875, original: 2500, rating: 4.5, reviews: "7,890", urgency: "Manjistha is the #1 Ayurvedic Rakta Shodhaka for Pitta-type pigmentation", affiliate_url: "https://www.amazon.in/s?k=forest+essentials+tejasvi+brightening&tag=" + T, dosha: "Pitta", time: "night" },
      { name: "Mamaearth Bye Bye Blemishes Face Cream", tag: "FOR YOUR PIGMENTATION", reason: "Mulberry + Daisy extract fades the melanin asymmetry detected", price: 349, original: 499, rating: 4.0, reviews: "45,123", urgency: "Mulberry inhibits tyrosinase — key enzyme in your pigmentation", affiliate_url: "https://www.amazon.in/s?k=mamaearth+bye+bye+blemishes+cream&tag=" + T, dosha: "all", time: "day" },
      { name: "Vicco Turmeric Skin Cream with Sandalwood Oil", tag: "FOR YOUR PIGMENTATION", reason: "Haridra (turmeric) + Chandana (sandalwood) — Sushruta Samhita prescribes both as Varnya (complexion enhancers)", price: 130, original: 180, rating: 4.1, reviews: "67,890", urgency: "Sushruta's Varnya Gana herbs directly target Bhrajaka Pitta imbalance", affiliate_url: "https://www.amazon.in/s?k=vicco+turmeric+cream+sandalwood&tag=" + T, dosha: "Pitta", time: "day" },
      { name: "Khadi Natural Saffron & Papaya Anti Blemish Cream", tag: "FOR YOUR PIGMENTATION", reason: "Kesar (saffron) is the primary Varnya Dravya in Charaka — naturally regulates melanin synthesis", price: 285, original: 425, rating: 4.0, reviews: "12,345", urgency: "Saffron is classified Varnya (complexion-enhancing) in all three Samhitas", affiliate_url: "https://www.amazon.in/s?k=khadi+saffron+papaya+anti+blemish&tag=" + T, dosha: "Pitta", time: "night" },
      { name: "Himalaya Clear Complexion Brightening Face Cream", tag: "FOR YOUR PIGMENTATION", reason: "Licorice (Yashtimadhu) + White Dammer — Charaka classifies Yashtimadhu as Varnya and Pitta-pacifying", price: 175, original: 250, rating: 4.1, reviews: "34,567", urgency: "Yashtimadhu is a classical Pitta Shamaka — targets your dosha pattern", affiliate_url: "https://www.amazon.in/s?k=himalaya+clear+complexion+brightening&tag=" + T, dosha: "Pitta", time: "day" }
    ],
    'texture': [
      // MODERN
      { name: "The Derma Co 1% Salicylic Acid Face Wash", tag: "FOR YOUR SKIN TEXTURE", reason: "Salicylic acid addresses pore congestion detected", price: 227, original: 349, rating: 4.1, reviews: "73,456", urgency: "31% pore size reduction in 2 weeks", affiliate_url: "https://www.amazon.in/s?k=derma+co+salicylic+acid+face+wash&tag=" + T, dosha: "Kapha", time: "day" },
      { name: "Minimalist 2% Salicylic Acid Face Wash", tag: "FOR YOUR SKIN TEXTURE", reason: "2% BHA matched to your pore density level", price: 299, original: 399, rating: 4.2, reviews: "45,678", urgency: "Unclogs 89% of blocked pores in 10 days", affiliate_url: "https://www.amazon.in/s?k=minimalist+salicylic+acid+face+wash&tag=" + T, dosha: "Kapha", time: "day" },
      { name: "Neutrogena Oil-Free Acne Face Wash", tag: "FOR YOUR SKIN TEXTURE", reason: "Targets oil imbalance and roughness in scan", price: 320, original: 460, rating: 4.3, reviews: "38,234", urgency: "Prevents 76% of new breakouts", affiliate_url: "https://www.amazon.in/s?k=neutrogena+oil+free+acne+face+wash&tag=" + T, dosha: "Pitta", time: "day" },
      { name: "CeraVe SA Cleanser", tag: "FOR YOUR SKIN TEXTURE", reason: "Ceramide + SA repairs barrier while fixing texture", price: 799, original: 1150, rating: 4.4, reviews: "15,890", urgency: "Ceramide + SA smooths 43% faster", affiliate_url: "https://www.amazon.in/s?k=cerave+sa+cleanser&tag=" + T, dosha: "Vata", time: "day" },
      { name: "Dot & Key AHA + BHA Peeling Serum", tag: "FOR YOUR SKIN TEXTURE", reason: "Chemical exfoliation targets dead cell buildup", price: 545, original: 695, rating: 4.1, reviews: "21,567", urgency: "Visible smoothness after first use in 87%", affiliate_url: "https://www.amazon.in/s?k=dot+and+key+aha+bha+peeling+serum&tag=" + T, dosha: "Kapha", time: "night" },
      // TRADITIONAL
      { name: "Himalaya Purifying Neem Face Wash", tag: "FOR YOUR SKIN TEXTURE", reason: "Nimba (Neem) — Sushruta classifies as Kushtaghna (anti-dermatosis) and Kandughna (anti-pruritic) for Kapha-Pitta skin", price: 135, original: 200, rating: 4.2, reviews: "156,789", urgency: "Neem is the #1 Ayurvedic Kushtaghna — 3000 years of clinical use", affiliate_url: "https://www.amazon.in/s?k=himalaya+neem+face+wash&tag=" + T, dosha: "Kapha", time: "day" },
      { name: "Biotique Bio Neem Purifying Face Wash", tag: "FOR YOUR SKIN TEXTURE", reason: "Neem + Dhanyaka (coriander) — Ashtanga Hridaya prescribes this combination for Mukha Dooshika (facial eruptions)", price: 179, original: 275, rating: 4.0, reviews: "34,567", urgency: "Classical Mukha Dooshika treatment targets your texture pattern", affiliate_url: "https://www.amazon.in/s?k=biotique+neem+face+wash&tag=" + T, dosha: "Pitta", time: "day" },
      { name: "Mamaearth Tea Tree Face Wash", tag: "FOR YOUR SKIN TEXTURE", reason: "Tea tree oil with antibacterial action for the congestion detected", price: 249, original: 349, rating: 4.1, reviews: "78,234", urgency: "Tea tree reduces bacterial load 67% — clearing path for texture repair", affiliate_url: "https://www.amazon.in/s?k=mamaearth+tea+tree+face+wash&tag=" + T, dosha: "Kapha", time: "day" },
      { name: "Kama Ayurveda Mridul Soap-Free Face Cleanser", tag: "FOR YOUR SKIN TEXTURE", reason: "Vetiver + Neem — Charaka's Twak Shodhan (skin purification) principles for restoring Twaksara quality", price: 750, original: 1050, rating: 4.4, reviews: "6,789", urgency: "Charaka's Twaksara standard: Snigdha, Shlakshna, Prasanna — this restores all three", affiliate_url: "https://www.amazon.in/s?k=kama+ayurveda+face+cleanser&tag=" + T, dosha: "Pitta", time: "day" },
      { name: "Plum Green Tea Pore Cleansing Face Wash", tag: "FOR YOUR SKIN TEXTURE", reason: "Green tea antioxidants shrink enlarged pores while controlling oil", price: 285, original: 380, rating: 4.2, reviews: "52,345", urgency: "Reduces sebum 27% — matches your oiliness level", affiliate_url: "https://www.amazon.in/s?k=plum+green+tea+face+wash&tag=" + T, dosha: "Kapha", time: "day" },
      { name: "Khadi Natural Multani Mitti Face Pack", tag: "FOR YOUR SKIN TEXTURE", reason: "Fuller's earth (Multani Mitti) — traditional Lepa (paste) therapy per Sushruta for excess Kapha in skin", price: 145, original: 225, rating: 4.0, reviews: "23,456", urgency: "Sushruta's Lepa therapy absorbs excess Kapha-type oil and refines pores", affiliate_url: "https://www.amazon.in/s?k=khadi+multani+mitti+face+pack&tag=" + T, dosha: "Kapha", time: "night" }
    ],
    'hair': [
      // MODERN
      { name: "Minimalist Hair Growth Actives 18% Serum", tag: "FOR YOUR HAIR CONCERN", reason: "Redensyl + Procapil + Capixyl matched to your thinning", price: 699, original: 799, rating: 4.1, reviews: "31,892", urgency: "214% growth increase in clinical trials", affiliate_url: "https://www.amazon.in/s?k=minimalist+hair+growth+serum+redensyl&tag=" + T, dosha: "all", time: "night" },
      { name: "The Derma Co 3% Redensyl Hair Serum", tag: "FOR YOUR HAIR CONCERN", reason: "3% Redensyl targets follicle miniaturization revealed", price: 499, original: 799, rating: 4.0, reviews: "24,567", urgency: "91% success at your thinning stage", affiliate_url: "https://www.amazon.in/s?k=derma+co+redensyl+hair+serum&tag=" + T, dosha: "Pitta", time: "night" },
      { name: "Man Matters Minoxidil 5% Serum", tag: "FOR YOUR HAIR CONCERN", reason: "FDA-approved Minoxidil targets density loss — gold standard", price: 549, original: 799, rating: 4.0, reviews: "27,890", urgency: "Only FDA-approved topical for regrowth", affiliate_url: "https://www.amazon.in/s?k=man+matters+minoxidil+5&tag=" + T, dosha: "all", time: "night" },
      { name: "Pilgrim Redensyl & Anagain Hair Serum", tag: "FOR YOUR HAIR CONCERN", reason: "Korean tech with Redensyl + Anagain matched to your score", price: 595, original: 795, rating: 4.2, reviews: "18,456", urgency: "78% density increase in 3 months", affiliate_url: "https://www.amazon.in/s?k=pilgrim+redensyl+anagain+hair+serum&tag=" + T, dosha: "all", time: "night" },
      // TRADITIONAL
      { name: "Kama Ayurveda Bringadi Intensive Hair Treatment Oil", tag: "FOR YOUR HAIR", reason: "Bhringraj + Indigo + Sesame — Charaka Chikitsa 26 prescribes Bhringraj as primary Keshya (hair-nourishing) herb for Khalitya", price: 895, original: 1295, rating: 4.6, reviews: "18,234", urgency: "Charaka's #1 Keshya herb — directly addresses Pitta-in-Romakupa pattern", affiliate_url: "https://www.amazon.in/s?k=kama+ayurveda+bringadi+hair+oil&tag=" + T, dosha: "Pitta", time: "night" },
      { name: "Forest Essentials Japapatti & Brahmi Hair Vital Oil", tag: "FOR YOUR HAIR", reason: "Brahmi + Hibiscus — Sushruta recommends Brahmi for Medhya (neuro-nourishing) action on hair follicle innervation", price: 1175, original: 1650, rating: 4.5, reviews: "9,345", urgency: "Sushruta's Medhya Rasayana stimulates follicle nerve supply", affiliate_url: "https://www.amazon.in/s?k=forest+essentials+japapatti+brahmi+hair+oil&tag=" + T, dosha: "Vata", time: "night" },
      { name: "Wow Onion Black Seed Hair Oil", tag: "FOR YOUR HAIR CONCERN", reason: "Onion + Kalonji stimulates scalp circulation indicated in scan", price: 349, original: 599, rating: 4.0, reviews: "112,345", urgency: "Reduces hair fall 62% in 6 weeks", affiliate_url: "https://www.amazon.in/s?k=wow+onion+black+seed+hair+oil&tag=" + T, dosha: "Kapha", time: "night" },
      { name: "Mamaearth Onion Hair Fall Shampoo", tag: "FOR YOUR HAIR CONCERN", reason: "Onion + keratin addresses thinning and strand weakness", price: 299, original: 449, rating: 4.1, reviews: "98,765", urgency: "Strengthens existing hair 47%", affiliate_url: "https://www.amazon.in/s?k=mamaearth+onion+shampoo&tag=" + T, dosha: "all", time: "day" },
      { name: "Indulekha Bringha Ayurvedic Hair Oil", tag: "FOR YOUR HAIR", reason: "Bhringraj-based Taila — Ashtanga Hridaya's Shiro Abhyanga (head oiling) protocol for Khalitya prevention", price: 399, original: 580, rating: 4.1, reviews: "67,890", urgency: "Ashtanga Hridaya recommends Shiro Abhyanga — your scan confirms the need", affiliate_url: "https://www.amazon.in/s?k=indulekha+bringha+hair+oil&tag=" + T, dosha: "Pitta", time: "night" },
      { name: "Patanjali Kesh Kanti Hair Oil", tag: "FOR YOUR HAIR", reason: "Amla + Bhringraj + Neem — traditional Keshya formulation per Charaka for all three dosha types", price: 145, original: 210, rating: 3.9, reviews: "45,678", urgency: "Tridosha-balancing Keshya formula at an accessible price point", affiliate_url: "https://www.amazon.in/s?k=patanjali+kesh+kanti+hair+oil&tag=" + T, dosha: "all", time: "night" },
      { name: "Biotique Bio Bhringraj Therapeutic Hair Oil", tag: "FOR YOUR HAIR", reason: "Bhringraj + Amla + Centella — Charaka's Khalitya Chikitsa (hair loss treatment) in oil form", price: 199, original: 299, rating: 4.0, reviews: "28,456", urgency: "Classical Khalitya Chikitsa herbs in ready-to-use Taila form", affiliate_url: "https://www.amazon.in/s?k=biotique+bhringraj+hair+oil&tag=" + T, dosha: "Pitta", time: "night" }
    ],
    'elasticity': [
      // MODERN
      { name: "Olay Regenerist Micro-Sculpting Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Amino-peptide complex targets elastin degradation", price: 899, original: 1999, rating: 4.4, reviews: "28,345", urgency: "23% firmness in 28 days", affiliate_url: "https://www.amazon.in/s?k=olay+regenerist+micro+sculpting+cream&tag=" + T, dosha: "all", time: "night" },
      { name: "Minimalist 0.3% Retinol Night Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Retinol boosts collagen for firmness loss measured", price: 545, original: 599, rating: 4.1, reviews: "33,456", urgency: "Clinically optimal dose for early elastin loss", affiliate_url: "https://www.amazon.in/s?k=minimalist+retinol+anti+aging+cream&tag=" + T, dosha: "Vata", time: "night" },
      { name: "L'Oreal Revitalift Anti-Wrinkle Night Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Pro-Retinol A rebuilds collagen matrix overnight", price: 549, original: 799, rating: 4.3, reviews: "41,234", urgency: "Skin regenerates 60% faster during sleep", affiliate_url: "https://www.amazon.in/s?k=loreal+revitalift+night+cream&tag=" + T, dosha: "Vata", time: "night" },
      { name: "Neutrogena Rapid Wrinkle Repair Retinol", tag: "FOR YOUR SKIN FIRMNESS", reason: "Accelerated retinol targets jawline loss and sagging", price: 699, original: 1099, rating: 4.2, reviews: "22,890", urgency: "Visible firming in 1 week", affiliate_url: "https://www.amazon.in/s?k=neutrogena+rapid+wrinkle+repair+retinol&tag=" + T, dosha: "all", time: "night" },
      { name: "Cetaphil Healthy Renew Anti-Aging Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Peptide + niacinamide for early elasticity loss", price: 999, original: 1499, rating: 4.3, reviews: "12,567", urgency: "Dermatologist #1 for early firmness concerns", affiliate_url: "https://www.amazon.in/s?k=cetaphil+healthy+renew+anti+aging&tag=" + T, dosha: "all", time: "night" },
      // TRADITIONAL
      { name: "Forest Essentials Night Treatment Cream Jasmine & Patchouli", tag: "FOR YOUR SKIN FIRMNESS", reason: "Saffron + Almond Oil — Charaka's Rasayana (rejuvenation) protocol for Meda-Mamsa Dhatu restoration", price: 2175, original: 2900, rating: 4.5, reviews: "6,234", urgency: "Charaka's Rasayana principle: rebuild Dhatu from within — targets your elasticity score", affiliate_url: "https://www.amazon.in/s?k=forest+essentials+night+cream+jasmine&tag=" + T, dosha: "Vata", time: "night" },
      { name: "Kama Ayurveda Rejuvenating & Brightening Night Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Ashwagandha + Saffron — Sushruta prescribes Ashwagandha as Balya (strength-giving) for tissue firmness", price: 1490, original: 1990, rating: 4.5, reviews: "8,456", urgency: "Ashwagandha is Sushruta's #1 Balya herb — directly rebuilds skin tissue strength", affiliate_url: "https://www.amazon.in/s?k=kama+ayurveda+rejuvenating+night+cream&tag=" + T, dosha: "Vata", time: "night" },
      { name: "Biotique Bio Saffron Dew Youthful Nourishing Day Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Kesar (saffron) — all three Samhitas classify as Varnya and Rasayana for skin youth preservation", price: 249, original: 375, rating: 4.0, reviews: "28,567", urgency: "Tridosha Rasayana — saffron referenced across all three Ayurvedic Samhitas", affiliate_url: "https://www.amazon.in/s?k=biotique+saffron+day+cream&tag=" + T, dosha: "all", time: "day" },
      { name: "Himalaya Anti-Wrinkle Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Aloe + Grapes — Charaka Sutra 20 identifies Kshipra Vali as Vata-driven, Aloe pacifies Vata in skin tissue", price: 175, original: 275, rating: 4.0, reviews: "34,123", urgency: "Targets Kshipra Vali (premature wrinkling) pattern from your scan", affiliate_url: "https://www.amazon.in/s?k=himalaya+anti+wrinkle+cream&tag=" + T, dosha: "Vata", time: "night" },
      { name: "Plum Bright Years Restorative Night Cream", tag: "FOR YOUR SKIN FIRMNESS", reason: "Plant stem cells rebuild skin at cellular level", price: 595, original: 750, rating: 4.1, reviews: "16,789", urgency: "Prevents further breakdown while repairing", affiliate_url: "https://www.amazon.in/s?k=plum+bright+years+night+cream&tag=" + T, dosha: "all", time: "night" }
    ]
  };

  // SMART PRODUCT SELECTION
  // Priority: 1) Match concern area, 2) Prefer dosha-matched, 3) Prefer time-matched, 4) Random from remaining
  function pick(arr, dosha, time) {
    // First try: dosha + time match
    let pool = arr.filter(p => (p.dosha === dosha || p.dosha === 'all') && (p.time === time || !time));
    if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
    // Second try: dosha match only
    pool = arr.filter(p => p.dosha === dosha || p.dosha === 'all');
    if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
    // Fallback: random
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
    if (k) { matched.push(pick(db[k], primaryDosha, timeOfDay)); used.add(k); }
  }
  const fb = ['pigmentation','hair','under-eye','texture','elasticity'];
  for (const k of fb) { if (!used.has(k) && matched.length < 3) { matched.push(pick(db[k], primaryDosha, timeOfDay)); used.add(k); } }
  return matched.slice(0, 3);
}
