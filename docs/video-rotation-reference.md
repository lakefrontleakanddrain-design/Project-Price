# Project-Price Video Rotation Reference

This document defines a rotating-reference system so short videos stay clear, creative, and non-repetitive.

## Why rotation works

- An 8-second clip should deliver one message, not the entire funnel.
- A sequence of focused clips can educate faster and with higher retention.
- Rotation prevents repetitive creative while preserving brand consistency.

## Rotation unit

Each video run should choose one value per slot:

- Slot A (Scenario): inspection surprise, time-pressure offer, first-time buyer confusion, budget cap, hidden defect.
- Slot B (Repair focus): roof, foundation, plumbing, electrical, HVAC, kitchen, bath, exterior.
- Slot C (Decision type): offer reduction, seller credit, seller repairs, phased post-close plan.
- Slot D (Emotion): anxious, skeptical, overwhelmed, strategic, relieved.
- Slot E (POV): buyer POV, realtor POV, split POV, narrated recap.

## Six-clip narrative loop

Run this loop repeatedly with different slot values:

1. Risk detected during showing.
2. Project Price gives immediate range.
3. Tier comparison changes scope understanding.
4. Negotiation decision is selected.
5. Buyer/realtor execute decision language.
6. Outcome and next step confirmed.

## Two-week example rotation

Week 1:

- Day 1: inspection surprise + roof + seller credit + anxious + split POV.
- Day 2: first-time buyer confusion + plumbing + offer reduction + overwhelmed + realtor POV.
- Day 3: budget cap + kitchen + phased plan + skeptical + buyer POV.
- Day 4: hidden defect + electrical + seller repairs + strategic + narrated recap.
- Day 5: time-pressure offer + HVAC + offer reduction + anxious + split POV.
- Day 6: inspection surprise + foundation + seller credit + skeptical + realtor POV.

Week 2:

- Day 1: first-time buyer confusion + bath + phased plan + overwhelmed + buyer POV.
- Day 2: budget cap + roof + offer reduction + strategic + narrated recap.
- Day 3: hidden defect + plumbing + seller repairs + anxious + split POV.
- Day 4: time-pressure offer + exterior + seller credit + skeptical + realtor POV.
- Day 5: inspection surprise + electrical + phased plan + relieved + buyer POV.
- Day 6: first-time buyer confusion + foundation + offer reduction + strategic + narrated recap.

## Guardrails

- Keep residential home-buying context only.
- Keep Project Price visible as immediate estimate support.
- Do not promise exact final contractor bids.
- Keep CTA practical: ask agent, adjust offer, request credit, verify with contractor.

## Stateful run-to-run loop (for Veo 8-second limit)

Use the built-in selector to rotate one topic per run and loop forever:

- Topics file: infra/video/topic-rotation.json
- State file: infra/video/topic-rotation-state.json
- Selector script: infra/scripts/video-topic-rotation.mjs

Command:

```bash
npm run video:next-topic
```

Behavior:

- Reads nextIndex from state.
- Selects that topic and outputs a ready prompt.
- Emits topic_output capped at 300 characters (configurable by maxTopicChars).
- Advances nextIndex by 1.
- Wraps to 0 after the last topic.

Workflow integration note:

- In GitHub Actions, run the selector before generation.
- Use the emitted topic_prompt output as the generation prompt.
- Commit the updated state file so the next scheduled run advances to the next topic.

## Social size processing (Instagram/TikTok/YouTube)

Use ffmpeg processing after generation to normalize platform-ready outputs:

```bash
npm run video:process-social -- --input=path/to/generated.mp4
```

Outputs are written to infra/video/output with these targets:

- instagram-reels-1080x1920.mp4
- tiktok-1080x1920.mp4
- youtube-shorts-1080x1920.mp4

Processing defaults:

- Resolution: 1080x1920 (9:16)
- FPS: 30
- Max duration: 8 seconds (override with --max-seconds)
- Codec: H.264 + AAC, faststart enabled

## Publish to webpage and RSS

After generation and social processing, publish one new item to the site page and feed:

```bash
npm run video:publish -- --source=infra/video/output/youtube-shorts-1080x1920.mp4 --title="${TOPIC_OUTPUT}" --topic="${TOPIC_OUTPUT}" --site-base-url=https://project-price-app.netlify.app
```

Outputs created/updated:

- web/public/live-video/index.html
- web/public/live-video/{slug}.html
- web/public/live-video-feed.xml
- web/public/metricool-live-video.xml
- infra/video/feed-items.json

Metricool RSS URL:

- https://project-price-app.netlify.app/metricool-live-video.xml

Initial rebuild-only command (no new video item):

```bash
npm run video:publish-rebuild
```
