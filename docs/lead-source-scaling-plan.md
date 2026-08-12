# Lead Source Scaling Plan

Design rationale for expanding beyond a single content shape ("a Facebook Groups
post has a body") into the several shapes a real multi-source pipeline needs —
consolidated here because five separate places in the codebase point at this
file for "the fuller design rationale" and it had gone missing. Every problem
below is **solved and shipped**; this documents *why* the fix looks the way it
does, for whoever next adds a genuinely new record shape.

## Problem 1 — one content shape doesn't cover what a "lead" can be

The original pipeline assumed every scraped item was a post with a body:
someone's own words, phrase-matchable for buy/sell/agent intent. A "Post
Likers" scrape (or a comment-mining actor) produces a different kind of
record entirely — a person's *reaction* to someone else's post, with no body
of their own. Treating that as a content post with an empty body silently
produced `intent="other", score=0`, indistinguishable from genuinely
irrelevant noise (problem 2c, below).

**Fix:** `recordKind` (`content_post | engagement_like | engagement_comment`)
became its own axis on `mapping_profiles`, carried onto `lead_appearances` —
deliberately independent of `sources.kind` (transport) and `platform`
(facebook/instagram/other, needed for `facebookId`/`instagramId` identity
resolution). A mapping profile declares its `recordKind` explicitly; nothing
downstream infers it from an empty body. See `docs/architecture.md`'s "Record
kind is a content-shape axis" and `docs/domain.md`'s "Per-appearance axes:
intent vs. quality vs. reach."

## Problem 2 — three specific bugs an engagement-shaped record exposed

**2b — the near-duplicate dedup gate assumed a body existed.**
`findCanonicalDuplicate`'s repost/re-scrape detection required
`body.length >= 40` before even checking for a duplicate — correct for a
content post, but an engagement record's body is *always* empty, so every
re-sync of the same like produced a second, undeduped appearance. Fixed by
routing `recordKind !== "content_post"` through identity-based dedup
(`authorExternalId` + `targetPostExternalId`) instead of the body-length gate
— see `application/leads/process-records.ts` and its integration test
("collapses a re-scraped like on the same post into one appearance").

**2c — scoring a bare like needs signal from what it engaged with, not from
text that doesn't exist.** `classifyWithRules`'s engagement branch
(`domain/scoring/rules-classifier.ts::classifyEngagement`) scores from the
*target post's* price/location/property-type and how many distinct listings
this person engaged with recently (`repeatEngagementCount`), not from
phrase-matching a body that isn't there. Investor/broker framing scores stay
`0` for engagement records rather than guessing — there's no text to
phrase-match against, and a guess here would be indistinguishable from a real
signal downstream.

**2a-adjacent — an indexed lookup for engagement dedup.** The
`authorExternalId`/`targetPostExternalId` identity check above needed its own
index (`lead_appearances_engagement_author_idx`, scoped to
`recordKind != 'content_post'`) rather than reusing the trigram scan
content-post dedup uses — cheaper, and not scoped to `datasetId` for the same
cross-mirror reason the content-post dedup window isn't either (a repost
mirrored into a second dataset is still the same repost). See
`docs/tech-debt.md`.

## Problem 3 — nested payload fields broke naive stringification

Passing-through an unmapped field for the `attributes` jsonb catch-all used to
call bare `String()` on whatever the raw payload held — safe for a primitive,
silently wrong for a nested object or array (Facebook's own
`attachments[].photo_image` shape, for instance, stringified to
`"[object Object]"`). Replaced with `formatAttributeValue` — arrays join,
objects `JSON.stringify`, primitives `String()` — see `docs/tech-debt.md`.

## What this means for the next new source

Adding a fourth `recordKind` (or a new `platform`) is a data change — a new
mapping profile, matched by `matchPaths`, declaring its shape — not a code
change to the classifier or dedup logic, *provided* the new shape's identity
and content story fits the same two questions every existing one already
answers: **what proves this is the same appearance if re-scraped** (dedup),
and **where does the intent signal come from if there's no body text**
(scoring). If a new source's answer to either doesn't fit the existing
content-post/engagement split, that's a fourth problem for a future version
of this document, not a reason to force-fit it into `recordKind`'s existing
two shapes.
