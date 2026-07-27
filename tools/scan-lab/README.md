# Scan Lab — image-only accuracy harness

A single self-contained HTML page that runs **this repo's exact food-image prompt and
pipeline** against a photo, so you can measure image-only scan accuracy without
building the iOS or Android app.

It exists because the interesting question — *given no context, just an image of food or
drink, how accurate is this and what can it actually scan?* — is answerable from the
prompt layer alone. That layer is the whole product: the app has no food database and no
custom vision model for photo analysis.

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

Not reproduced: multi-image analysis, barcode → Open Food Facts lookup, the on-device
Apple Intelligence fallback, provider fallback chains, retry/backoff, and the review
sheet's serving-unit rescaling. Those affect the app experience but not the image-only
accuracy question this harness is scoped to.
