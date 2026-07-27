# Scan Lab — meal, menu, and fridge scanning on your own API key

A single self-contained HTML page with three scan modes:

| Mode | What it does | Where it comes from |
| --- | --- | --- |
| 🍽️ **Meal** | Calories, macros, and 22 detailed nutrients from a food photo | This repo's shipped prompt, verbatim |
| 📋 **Menu** | Reads a restaurant menu and picks the best dish for your remaining calories | New — rebuilt here |
| 🧊 **Fridge** | Inventories what's in your fridge and suggests meals from it | New — rebuilt here |

Menu and fridge scanning are the two features a well-known competitor puts behind a
$15/month subscription. There is no moat in either — both are one vision call and some
ranking logic — so they're implemented here on the same bring-your-own-key plumbing the
app already uses. You pay your provider's per-image rate, which is fractions of a cent.

The meal mode doubles as an accuracy harness. The interesting question — *given no
context, just an image of food or drink, how accurate is this and what can it actually
scan?* — is answerable from the prompt layer alone, because that layer is the whole
product: the app has no food database and no custom vision model for photo analysis.

## What it reproduces faithfully

| Behaviour | Source |
| --- | --- |
| `analyzeFood(image:)` prompt, verbatim | `ios/calorietracker/Services/GeminiService.swift` |
| `autoAnalyze(image:)` prompt (food photo *or* nutrition label), verbatim | same |
| 1600px longest side, JPEG quality 0.8 | `GeminiService.encodedJPEGData(for:maxDimension:)` |
| Lenient JSON extraction (strips ```` ```json ```` fences, takes outermost braces) | `GeminiService.extractJSON` |
| Hard-required fields `name`/`calories`/`protein`/`carbs`/`fat`; missing → rejected | `GeminiService.parseFoodAnalysis` |
| `serving_size_grams` defaults to 100 when absent | same |
| Same provider wire formats for Gemini / Anthropic / OpenAI-compatible | `dispatch(provider:…)` |

Swap the model and re-scan the same photo to see how much of "accuracy" is just model
choice — the app's own default is `gemini-3.5-flash-lite`, the cheapest tier.

## Menu and fridge modes

Both are new prompts written in the repo's house style — JSON only, explicit units, and
explicit instructions not to invent anything that isn't visible. Each returns structured
data that the page ranks locally.

**Menu.** Reads every legible dish, estimates each as a restaurant would actually serve it
(bigger portions, more oil and butter than home cooking), and flags partly-legible dishes
as low confidence rather than guessing. Small text is the main failure mode — scan one
section at a time if a whole board won't read.

**Fridge.** Inventories only what's actually visible, refuses to guess the contents of
opaque containers, and suggests 3–5 meals. Basic staples — salt, pepper, oil, water — are
assumed present; anything else a meal needs is listed as missing.

**Ranking is done client-side**, not by the model: instant, free, and inspectable.
Anything fitting your remaining calories outranks anything that doesn't. Within a group,
items sort by **protein density (g per kcal)**, not raw protein — otherwise the largest,
richest dish always wins just for being large, which is the opposite of useful advice.
When nothing fits your remaining budget, the ranking flips to least overshoot, because
the only sensible suggestion against a blown budget is the smallest thing available.

Set a daily calorie goal in the Today card to drive all of this. Anything you log from a
menu or fridge result lands in the same day total as your meal scans.

## Running it

Any static server works; it has no build step and no dependencies.

```sh
cd tools/scan-lab
npx http-server -p 8899        # then open http://localhost:8899
```

Opening `index.html` straight off disk also works for Gemini. To snap photos with a phone
camera, serve it over HTTPS or `localhost` — browsers gate camera capture on a secure
context. The `📷 Take photo` button opens the rear camera on iOS Safari and Android Chrome.

### API keys

Bring your own key; it is kept in `localStorage` and posted directly to the provider.
Nothing is proxied. **Use a throwaway or spend-limited key** — this is a local test
harness, and any key in a browser page is exposed to that page.

Gemini is the most reliable provider from a browser. Anthropic needs the
`anthropic-dangerous-direct-browser-access` header (already sent). OpenAI may be refused
by CORS depending on your account and network.

## What it gives you

- Full nutrient panel exactly as returned, with blanks where the model declined to
  estimate — the honest picture of how much of the 28-field schema actually gets filled.
- Latency and raw response per scan.
- A field to record **Bitebro's answer** and the **true value** for the same photo, with
  automatic error %, plus CSV export of the whole comparison.
- A range checklist of the 20 cases that actually separate photo-calorie apps — opaque
  drinks, tossed dressing, whole cake vs one slice, half-eaten plates, non-Western
  dishes, and a not-food control to test hallucination.

## Deliberate limitations

Not reproduced from the app: multi-image analysis, barcode → Open Food Facts lookup, the
on-device Apple Intelligence fallback, provider fallback chains, retry/backoff, and the
review sheet's serving-unit rescaling. Those affect the app experience but not the
image-only accuracy question the meal mode is scoped to.

Menu and fridge results are estimates from a *name* or a *glimpse*, not from seeing a
plated portion — good for "which of these is the better choice", not for exact logging.
For anything packaged, the app's barcode and nutrition-label paths read real numbers and
will always beat all three of these modes.

## Tests

There is no test runner wired up; the page was verified end to end in headless Chromium
with a mocked provider, covering prompt fidelity for all three modes, the 1600px/0.8
encoding, fenced-JSON parsing, null nutrient handling, required-field rejection, both
ranking branches, logging and removal, and `localStorage` persistence.
