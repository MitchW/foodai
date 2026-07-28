/* Shared scanning engine for Scan Lab.
 *
 * Both pages load this file, so the prompts and the parsing can never drift
 * apart — the accuracy the lab measures is the accuracy the app delivers.
 *
 *   index.html   accuracy test bench (provider config, raw responses, CSV)
 *   app/         phone-first scanner
 *
 * Exposed as window.Scan. Plain script on purpose: no bundler, no modules,
 * works over file:// as well as over HTTPS.
 */
(function (global) {
"use strict";

const SHAPE = '{"name":"...","calories":0,"protein":0.0,"carbs":0.0,"fat":0.0,"serving_size_grams":0.0,"sugar":0.0,"added_sugar":0.0,"fiber":0.0,"saturated_fat":0.0,"monounsaturated_fat":0.0,"polyunsaturated_fat":0.0,"trans_fat":0.0,"cholesterol":0.0,"sodium":0.0,"potassium":0.0,"calcium":0.0,"iron":0.0,"magnesium":0.0,"zinc":0.0,"vitamin_a":0.0,"vitamin_c":0.0,"vitamin_d":0.0,"vitamin_b12":0.0,"vitamin_e":0.0,"vitamin_k":0.0,"folate":0.0,"omega_3":0.0,"unit_options":[]}';

const UNITS = "Calories are integers. Protein/carbs/fat are decimal gram values when needed. serving_size_grams is the estimated weight in grams. Nutrients are numbers: sugar/fiber/fats/omega_3 in grams; cholesterol/sodium/potassium/calcium/iron/magnesium/zinc/vitamin_c/vitamin_e in milligrams; vitamin_a/vitamin_d/vitamin_b12/vitamin_k/folate in micrograms.";

const UNIT_OPTS_FOOD = 'unit_options is required for obvious non-gram units visible in the food. Use slice/piece for pizza, cake, bread, cookies, fruit pieces, etc.; use ml/cup/fl oz for drinks, milk, soup, smoothies, sauces, etc.; use tbsp/tsp for spooned foods; use can/packet when packaged. Its quantity must describe the whole analyzed amount, not always 1. For a whole or mostly-whole divisible food like cake, pie, or pizza, count the visible pieces/slices and derive grams_per_unit from serving_size_grams / quantity. If N slices are visible, return quantity N. Use quantity 1 only when a single piece/slice is actually the analyzed portion. Use [] only when no non-gram unit is apparent. Do not include g/grams in unit_options.';

const PROMPTS = {
  food: [
    "Analyze this food image. Identify the food and estimate its nutritional content.",
    "",
    "Respond ONLY with a JSON object in this exact format, no other text:",
    SHAPE,
    "",
    UNITS,
    "The [] in unit_options above is only a JSON shape placeholder; replace it with options when a non-gram unit is obvious.",
    UNIT_OPTS_FOOD,
    "Give your best estimate for the visible food amount shown in the image. For whole/mostly-whole cakes, pizzas, pies, loaves, or similar foods, estimate the total visible item/remaining item weight rather than defaulting to one slice. Use null for any nutrient you cannot estimate."
  ].join("\n"),

  auto: [
    "Analyze this image. It could be either a photo of food OR a nutrition facts label.",
    "",
    "If it's a food photo: identify the food and estimate nutritional content for the serving shown.",
    "If it's a nutrition label: read the values and calculate for one serving size as listed on the label.",
    "",
    "Respond ONLY with JSON:",
    SHAPE,
    UNITS,
    "The [] in unit_options above is only a JSON shape placeholder; replace it with options when a non-gram unit is obvious.",
    UNIT_OPTS_FOOD.replace("visible in the food.", "visible in the image or label."),
    "Use null for any nutrient you cannot estimate."
  ].join("\n")
};

/* ---------------------------------------------------------------------------
   Menu and fridge prompts. These are NOT in the shipped app — they are the two
   features a paid competitor gates behind a subscription, rebuilt here on the
   same BYOK plumbing. Written in the repo's house style: JSON only, explicit
   units, explicit instructions not to invent what isn't visible.
   --------------------------------------------------------------------------- */

const MENU_PROMPT = [
  "Analyze this photo of a restaurant menu. Read every dish that is legible and estimate the nutrition of each dish as a restaurant would actually serve it.",
  "",
  "Respond ONLY with a JSON object in this exact format, no other text:",
  '{"venue":"...","items":[{"name":"...","section":"...","price":"...","calories":0,"protein":0.0,"carbs":0.0,"fat":0.0,"serving_size_grams":0.0,"confidence":"high","note":"..."}]}',
  "",
  "Calories are integers. Protein/carbs/fat are decimal gram values. serving_size_grams is the estimated served weight in grams.",
  "Read only dishes that are actually legible in the image. Do not invent menu items, prices, or sections that you cannot see. If the venue name is not visible, use null for venue. If a price is not visible, use null for price; otherwise copy it exactly as printed, including its currency symbol.",
  'confidence must be "high", "medium", or "low". Use "low" when the dish name is partly cut off, blurred, or when the dish could vary enormously depending on preparation.',
  "section is the menu heading the dish sits under, such as Starters, Mains, Sides, or Desserts. Use null when there is no visible heading.",
  "Estimate restaurant portions, not home cooking: restaurant servings are typically larger and cooked with substantially more oil, butter, and salt. Where the menu describes the dish, use that description to inform the estimate.",
  "note is a short phrase, at most 12 words, naming the main thing driving the calorie count — for example \"deep fried, heavy batter\" or \"cream sauce\". Use null when nothing stands out.",
  "Return every legible dish, even if the list is long. Use null for any value you cannot estimate."
].join("\n");

const FRIDGE_PROMPT = [
  "Analyze this photo of food storage — a fridge, freezer, pantry, or cupboard. First inventory what food is visibly present, then suggest meals that could be made from it.",
  "",
  "Respond ONLY with a JSON object in this exact format, no other text:",
  '{"items":[{"name":"...","approx_quantity":"...","confidence":"high"}],"meals":[{"name":"...","uses":["..."],"missing":["..."],"calories":0,"protein":0.0,"carbs":0.0,"fat":0.0,"serving_size_grams":0.0,"steps":"..."}]}',
  "",
  "Calories are integers. Protein/carbs/fat are decimal gram values. serving_size_grams is the estimated weight in grams of one serving of the finished meal.",
  "List only food you can actually see. Do not guess the contents of opaque or closed containers. If a container is opaque but clearly labelled, use the label; otherwise omit it.",
  'confidence must be "high", "medium", or "low". Use "low" for anything behind glass, partly hidden, blurred, or cut off at the edge of the frame.',
  "approx_quantity is a short human phrase such as \"about 6\", \"half a block\", \"most of a carton\". Use null when quantity is not judgeable.",
  "Suggest between 3 and 5 meals, one serving each. Prefer meals that need nothing beyond the visible items plus basic staples — salt, pepper, cooking oil, and water — which you may assume are available and must not list as missing.",
  "uses lists the visible items each meal consumes. missing lists anything else the meal needs that is not visible and is not a basic staple. Keep missing as short as possible; a meal needing nothing extra has an empty missing array.",
  "steps is a single sentence of at most 25 words describing how to make it.",
  "Use null for any value you cannot estimate."
].join("\n");

const SCAN_MODES = {
  meal:   { hint: "Runs the shipped app's own prompt. Everything below — the nutrient panel, the comparison log, the range checklist — applies to this mode." },
  menu:   { hint: "Photograph the menu straight on and get close enough that the dish names are sharp. Small text is the main failure mode; scan one section at a time if the whole board won't read." },
  fridge: { hint: "Open the door wide and get everything in frame. It can only reason about what it can see — opaque tubs and anything behind the milk are invisible to it." }
};

const DEFAULT_MODELS = {
  gemini: "gemini-3.5-flash-lite",
  anthropic: "claude-sonnet-5",
  openai: "gpt-5.4-mini"
};

const NUTRIENTS = [
  ["sugar","g"],["added_sugar","g"],["fiber","g"],["saturated_fat","g"],
  ["monounsaturated_fat","g"],["polyunsaturated_fat","g"],["trans_fat","g"],
  ["cholesterol","mg"],["sodium","mg"],["potassium","mg"],["calcium","mg"],
  ["iron","mg"],["magnesium","mg"],["zinc","mg"],["vitamin_c","mg"],["vitamin_e","mg"],
  ["vitamin_a","µg"],["vitamin_d","µg"],["vitamin_b12","µg"],["vitamin_k","µg"],
  ["folate","µg"],["omega_3","g"]
];

/* --------------------------- user context --------------------------- */
// Verbatim from analyzeFood(image:description:) in the shipped app. A photo
// cannot show what is inside an opaque shaker, how much oil went in the pan,
// or whether a shake was mixed with milk or water — this is how the user
// supplies what the camera could not see.
function withContext(prompt, description) {
  const d = String(description || "").trim();
  if (!d) return prompt;
  return prompt +
    "\n\nAdditional context from the user about this meal: " + d +
    "\nUse this context to improve accuracy of identification, portion size, and nutrition estimates.";
}

/* --------------------------- storage --------------------------- */
// Both pages share one origin, so they share one diary and one API key.
const DEFAULT_GOAL_KCAL = 1500;   // kcal, not kJ

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

const KEY_PLACEHOLDER = { gemini: "AIza...", anthropic: "sk-ant-...", openai: "sk-..." };

// An optional, git-ignored local-config.js may predefine a key so a local
// checkout works with no typing. It is never committed and never deployed.
function seededKey(provider) {
  const seed = global.SCANLAB_LOCAL_CONFIG;
  if (!seed) return "";
  if (typeof seed.key === "string" && (seed.provider || "gemini") === provider) return seed.key;
  return "";
}

function getConfig(provider) {
  const cfg = LS.get("scanlab.cfg", {})[provider] || {};
  return {
    model: cfg.model || DEFAULT_MODELS[provider],
    key: cfg.key || seededKey(provider)
  };
}

function setConfig(provider, model, key) {
  const cfg = LS.get("scanlab.cfg", {});
  cfg[provider] = { model: String(model || "").trim(), key: String(key || "").trim() };
  LS.set("scanlab.cfg", cfg);
}

function getProvider() {
  const seed = global.SCANLAB_LOCAL_CONFIG;
  return LS.get("scanlab.provider", (seed && seed.provider) || "gemini");
}
function setProvider(p) { LS.set("scanlab.provider", p); }

// Defaults to 1500 kcal so a fresh install is usable immediately and nobody
// has to retype a goal for the "fits your remaining calories" logic to work.
function getGoal() {
  const g = Number(LS.get("scanlab.goal", DEFAULT_GOAL_KCAL));
  return Number.isFinite(g) && g > 0 ? g : DEFAULT_GOAL_KCAL;
}
function setGoal(v) {
  const n = Number(v);
  LS.set("scanlab.goal", Number.isFinite(n) && n > 0 ? n : DEFAULT_GOAL_KCAL);
}

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const dayEntries = () => (LS.get("scanlab.day", {})[todayKey()] || []);

function dayTotals() {
  return dayEntries().reduce((t, e) => ({
    kcal: t.kcal + (Number(e.calories) || 0),
    p: t.p + (Number(e.protein) || 0),
    c: t.c + (Number(e.carbs) || 0),
    f: t.f + (Number(e.fat) || 0),
    n: t.n + 1
  }), { kcal: 0, p: 0, c: 0, f: 0, n: 0 });
}

function remainingKcal() { return getGoal() - dayTotals().kcal; }

function logEntry(src, source) {
  const d = LS.get("scanlab.day", {});
  const k = todayKey();
  d[k] = (d[k] || []).concat([{
    name: src.name,
    emoji: src.emoji || null,
    calories: Number(src.calories) || 0,
    protein: Number(src.protein) || 0,
    carbs: Number(src.carbs) || 0,
    fat: Number(src.fat) || 0,
    source,
    at: new Date().toISOString()
  }]);
  LS.set("scanlab.day", d);
}

function updateEntry(idx, patch) {
  const d = LS.get("scanlab.day", {});
  const k = todayKey();
  if (!d[k] || !d[k][idx]) return;
  Object.assign(d[k][idx], patch);
  LS.set("scanlab.day", d);
}

function removeEntry(idx) {
  const d = LS.get("scanlab.day", {});
  const k = todayKey();
  if (!d[k]) return;
  d[k].splice(idx, 1);
  LS.set("scanlab.day", d);
}

/* --------------------------- image --------------------------- */
// Mirrors GeminiService.encodedJPEGData(for:maxDimension:) — 1600px cap, q0.8.
function encodeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode that image."));
      img.onload = () => {
        const MAX = 1600;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        resolve({ dataUrl, b64: dataUrl.split(",")[1], w, h });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* --------------------------- providers --------------------------- */
async function callGemini(model, key, prompt, b64) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `HTTP ${res.status}`);
  const parts = json.candidates?.[0]?.content?.parts || [];
  const text = parts.map(p => p.text || "").join("");
  if (!text) throw new Error("Empty response (finishReason: " + (json.candidates?.[0]?.finishReason || "unknown") + ")");
  return text;
}

async function callAnthropic(model, key, prompt, b64) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model, max_tokens: 2048,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
        { type: "text", text: prompt }
      ]}]
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `HTTP ${res.status}`);
  return (json.content || []).map(c => c.text || "").join("");
}

async function callOpenAI(model, key, prompt, b64) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model, max_completion_tokens: 2048,
      messages: [{ role: "user", content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }
      ]}]
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `HTTP ${res.status}`);
  return json.choices?.[0]?.message?.content || "";
}

/* --------------------------- parsing --------------------------- */
// Mirrors GeminiService.extractJSON / parseFoodAnalysis leniency: strip code
// fences, then take the outermost brace pair.
function extractJSON(text) {
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = t.indexOf("{"), end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("No JSON object in response");
  return t.slice(start, end + 1);
}

function parseAnalysis(text) {
  const json = JSON.parse(extractJSON(text));
  // The app hard-requires these five; anything else missing degrades gracefully.
  const need = ["name", "calories", "protein", "carbs", "fat"];
  for (const k of need) {
    if (json[k] === undefined || json[k] === null) {
      throw new Error(`Missing required field "${k}" — the shipped app rejects this response as invalidResponse`);
    }
  }
  if (json.serving_size_grams === undefined || json.serving_size_grams === null) {
    json.serving_size_grams = 100; // app's documented fallback
  }
  return json;
}

function call(provider, model, key, prompt, b64) {
  const fn = { gemini: callGemini, anthropic: callAnthropic, openai: callOpenAI }[provider];
  if (!fn) throw new Error("Unknown provider: " + provider);
  return fn(model, key, prompt, b64);
}

/* --------------------------- menu & fridge --------------------------- */
function parseMenu(text) {
  const json = JSON.parse(extractJSON(text));
  const items = (Array.isArray(json.items) ? json.items : [])
    .filter(it => it && it.name && Number.isFinite(Number(it.calories)));
  if (!items.length) throw new Error("No legible dishes came back — try a closer or sharper photo, or scan one section at a time");
  return { venue: json.venue || null, items };
}

function parseFridge(text) {
  const json = JSON.parse(extractJSON(text));
  const items = (Array.isArray(json.items) ? json.items : []).filter(i => i && i.name);
  const meals = (Array.isArray(json.meals) ? json.meals : [])
    .filter(m => m && m.name && Number.isFinite(Number(m.calories)));
  if (!items.length && !meals.length) throw new Error("Nothing recognisable came back — try a wider shot with the door fully open");
  return { items, meals };
}

// Protein density (g per kcal) rather than raw protein: otherwise the biggest,
// richest dish always wins simply for being big. When nothing fits the day's
// remaining calories the order flips to least overshoot.
function proteinDensity(x) {
  const kcal = Number(x.calories) || 0;
  const protein = Number(x.protein) || 0;
  return kcal > 0 ? protein / kcal : 0;
}

function rankByFit(list, remaining) {
  const fits = x => remaining == null || Number(x.calories) <= remaining;
  const anyFits = list.some(fits);
  return list.slice().sort((a, b) => {
    if (fits(a) !== fits(b)) return fits(a) ? -1 : 1;
    if (!anyFits) return (Number(a.calories) || 0) - (Number(b.calories) || 0);
    const da = proteinDensity(a), db = proteinDensity(b);
    if (db !== da) return db - da;
    return (Number(a.calories) || 0) - (Number(b.calories) || 0);
  });
}

/* --------------------------- formatting --------------------------- */
const fmt = n => (n === null || n === undefined || isNaN(n)) ? "—"
  : (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10);

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

global.Scan = {
  DEFAULT_GOAL_KCAL, PROMPTS, MENU_PROMPT, FRIDGE_PROMPT, SCAN_MODES,
  DEFAULT_MODELS, NUTRIENTS, KEY_PLACEHOLDER, LS,
  getConfig, setConfig, getProvider, setProvider, getGoal, setGoal,
  todayKey, dayEntries, dayTotals, remainingKcal, logEntry, updateEntry, removeEntry,
  encodeImage, call, withContext, extractJSON, parseAnalysis, parseMenu, parseFridge,
  proteinDensity, rankByFit, fmt, esc
};

})(window);
