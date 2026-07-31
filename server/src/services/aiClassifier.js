import Groq from 'groq-sdk';
import config from '../config/env.js';

const groq = new Groq({ apiKey: config.groqApiKey });

/** Category → Department mapping */
const CATEGORY_DEPT_MAP = {
  pothole:    'GVMC General',
  road:       'GVMC General',
  garbage:    'GVMC General',
  waste:      'GVMC General',
  water:      'Health & Emergency',
  drainage:   'Health & Emergency',
  electrical: 'Electrical',
  medical:    'Health & Emergency',
  crime:      'Police/Security',
  security:   'Police/Security',
  streetlight:'Electrical',
  electricity:'Electrical',
  animal:     'Health & Emergency',
};

const VALID_CATEGORIES = ['pothole', 'road', 'garbage', 'waste', 'water', 'drainage', 'electrical', 'medical', 'crime', 'security'];

/**
 * Keyword-based classifier — ALWAYS runs as primary or fallback.
 * This guarantees "chain snatching" → crime/Police, "pothole" → Roads, etc.
 */
function classifyByKeywords(description) {
  const text = (description || '').toLowerCase();

  const KEYWORD_RULES = [
    { keywords: ['snatch', 'chain snatch', 'theft', 'rob', 'steal', 'stole', 'murder', 'assault', 'attack', 'fight', 'vandal', 'break-in', 'burglary', 'suspicious', 'weapon', 'knife', 'gun', 'threat', 'harass', 'eve teas'], category: 'crime', urgency: 'critical' },
    { keywords: ['accident', 'crash', 'collision', 'injured', 'blood', 'ambulance', 'unconscious', 'dead body', 'heart attack', 'poison', 'contamina', 'epidemic', 'disease'], category: 'medical', urgency: 'critical' },
    { keywords: ['fire', 'electrocution', 'shock', 'electric', 'transformer', 'power cut', 'power outage', 'streetlight', 'street light', 'exposed wire', 'broken pole', 'sparking', 'current', 'voltage'], category: 'electrical', urgency: 'high' },
    { keywords: ['flood', 'waterlog', 'water log', 'sewage', 'sewer', 'drain', 'drainage', 'overflow', 'clog', 'block', 'manhole', 'gutter'], category: 'drainage', urgency: 'high' },
    { keywords: ['water leak', 'pipe burst', 'no water', 'water supply', 'dirty water', 'water pipe', 'bore', 'tanker', 'tap', 'water tank'], category: 'water', urgency: 'medium' },
    { keywords: ['pothole', 'pot hole', 'road damage', 'broken road', 'crack', 'road cave', 'road block', 'speed bump', 'barricade', 'road obstruct'], category: 'pothole', urgency: 'medium' },
    { keywords: ['road', 'tar', 'asphalt', 'footpath', 'sidewalk', 'divider', 'median', 'traffic signal', 'signal', 'sign board'], category: 'road', urgency: 'medium' },
    { keywords: ['garbage', 'trash', 'waste', 'dump', 'litter', 'dustbin', 'bin overflow', 'rubbish', 'stink', 'smell', 'dirty', 'unclean', 'sweeping', 'sanitation'], category: 'garbage', urgency: 'low' },
  ];

  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        return {
          category: rule.category,
          department: CATEGORY_DEPT_MAP[rule.category],
          urgency: rule.urgency,
          confidence: 0.85,
          aiFailed: false,
          method: 'keyword',
        };
      }
    }
  }

  return null; // No keyword match
}

/**
 * Classify a civic issue using:
 * 1. First: keyword matching (instant, reliable, never fails)
 * 2. Then: Groq AI for ambiguous cases
 * 3. Fallback: GVMC General only if BOTH fail
 */
export async function classifyIssue(photoUrl, description) {
  // ── Step 1: Try keyword classification first (instant + reliable) ──
  const keywordResult = classifyByKeywords(description);
  if (keywordResult) {
    console.log(`✅ AI classified via keywords: ${keywordResult.category} → ${keywordResult.department}`);
    return keywordResult;
  }

  // ── Step 2: Try Groq AI for ambiguous descriptions ──
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const prompt = `You are a civic issue classifier for a City Operations Center in Visakhapatnam, India.
Classify this citizen complaint into the correct category.

Citizen's complaint: "${description}"

Respond ONLY in this exact JSON format, no other text, no thinking, no explanation:
{"category":"<one of: pothole, road, garbage, water, drainage, electrical, medical, crime>","urgency":"<one of: low, medium, high, critical>","confidence":<0.0 to 1.0>}

Categories:
- pothole/road: road damage, potholes, broken roads, road obstructions
- garbage/waste: garbage dumps, waste overflow, uncleared waste
- water/drainage: water leaks, pipe bursts, waterlogging, sewage, drainage blocks
- electrical: broken streetlights, exposed wires, transformer issues
- medical: health hazards, dead animals, contamination, accidents
- crime/security: vandalism, theft, chain snatching, suspicious activity, assault`;

    const completion = await groq.chat.completions.create({
      model: 'qwen/qwen3-32b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 100,
    }, { signal: controller.signal });

    clearTimeout(timeout);

    const raw = completion.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = raw.match(/\{[^}]+\}/);
    if (!jsonMatch) throw new Error('No JSON in AI response');

    const parsed = JSON.parse(jsonMatch[0]);
    const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : null;
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
    const urgency = ['low', 'medium', 'high', 'critical'].includes(parsed.urgency)
      ? parsed.urgency : 'medium';

    if (category && confidence >= 0.4) {
      console.log(`✅ AI classified via Groq: ${category} → ${CATEGORY_DEPT_MAP[category]} (conf: ${confidence})`);
      return {
        category,
        department: CATEGORY_DEPT_MAP[category] || 'GVMC General',
        urgency,
        confidence,
        aiFailed: false,
        method: 'groq',
      };
    }
  } catch (err) {
    console.warn('⚠️ Groq AI failed, using fallback:', err.message);
  }

  // ── Step 3: Final fallback — GVMC General ──
  console.warn('⚠️ No classification match — defaulting to GVMC General');
  return {
    category: null,
    department: 'GVMC General',
    urgency: 'medium',
    confidence: 0,
    aiFailed: true,
    method: 'fallback',
  };
}

export { CATEGORY_DEPT_MAP };
