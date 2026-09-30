---
name: studio-cartoon-review
description: Review Needle shot drafts against cartoon briefs.
---
# Studio cartoon review

Use the available `extract_cartoon_shot` tool for one short shot request. Pass the original request verbatim; do not silently rewrite it into an easier benchmark.

Needle is a CPU extraction specialist. It can confidently mix up names, locations and actions. Compare every returned field with the original request. Check that duration is an integer from 1 to 3600 and equals the requested duration. Never accept confidence as proof of correctness. If a fact is missing, ask for that fact instead of inventing it.

Preserve character abilities, costumes and dialogue restrictions. Report mismatches with the smallest supported correction. Clearly distinguish the raw Needle suggestion from the reviewed result. A corrected JSON draft is not rendered footage or an applied project edit.

For trailer review, check shot durations add up, the action can be staged with the supplied cast and set, and the ending leaves room for a title beat. Never claim to have watched video through this text-only tool.
