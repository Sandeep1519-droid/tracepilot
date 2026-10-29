# Amazon India smoke test

A bounded, signed-out test was conducted against `https://www.amazon.in/` on 25 October 2026. The scope was homepage access, a search for “wireless mouse”, and product navigation. No account login, cart changes, or purchases were performed.

| Session | Observed result |
| --- | --- |
| Regular in-app browser, manually controlled | Homepage search worked, results retained the query, and an organic result opened the matching product page in a new tab. |
| Initial isolated TracePilot browser | An HTTP 202 AWS WAF challenge with a hidden body caused an observation timeout. |
| Follow-up TracePilot run using local qwen3:4b | Homepage returned HTTP 200. The AI filled the search field and submitted it; Amazon returned HTTP 503. The run stopped as inconclusive with a screenshot. |

The follow-up recorded three browser actions (initial navigation and two model-selected actions), zero completed assertions, and 7,341 input / 87 output model tokens. No paid API was used. A response from one isolated session does not establish a general Amazon outage or a confirmed product defect. The regular-browser observations are separate from the autonomous result.

## Fixes validated

- Explicit external page checks in the UI and API.
- Correct native submit/search control roles and observed HTML-ID locators.
- Full locator names retained independently of shortened display labels.
- AWS WAF challenge-header detection, including hidden-body responses.
- Screenshot capture even when DOM observation fails.
- HTTP unavailability classified as inconclusive before assertions.
- External exports preserve the actual origin, URL fragments, page paths, and expected values.

Controlled local tests verify these mechanics, including a generated regression that passes the baseline and fails an intentionally wrong response. Run `npm run test:external` with the local application running.

Raw external-page captures and session reports remain local under ignored `docs/amazon/` and `data/` directories. They are excluded from the public repository. No challenge was solved and no access protection was bypassed. Multi-tab flows and arbitrary business-rule inference remain unsupported.
