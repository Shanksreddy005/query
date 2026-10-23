# QueryMind UI & Analytics Review

An assessment of the current QueryMind setup based on six screenshots: the dark and light themes, the AI provider and dataset setup modals, and a worked query with its results. It is a polished first version. The weakest areas are results formatting and how much the "verified" labels claim.

## Scorecard

| Criterion | Score |
| --- | --- |
| Brand identity | 7/10 |
| Color palette & contrast | 7.5/10 |
| Results table | 6.5/10 |
| Layout & hierarchy | 7.5/10 |
| Analytical correctness | 7/10 (from limited evidence) |

## Brand identity: 7/10

**Working well**

- The two-weight wordmark (**Query**Mind) and the 2x2 grid logo with one purple tile are clean and recognizable.
- The tagline "Talk to your data. Get answers." is clear.
- The "DATA LOCAL" and "Local Engine Active" badges reinforce the privacy promise, so the brand and the product point the same way.

**Needs work**

- The name and logo are fairly generic. "Mind" names and grid icons are very common in AI tools, so nothing here is ownable yet.
- The purple accent is consistent, but nothing about the visuals says "data analysis" specifically.

## Color palette & contrast: 7.5/10

**Working well**

- The dark theme (near-black with a violet accent) is cohesive, and green is used sensibly for success and verification.
- There is a real light theme that holds together, not just an inverted one.

**Needs work**

- Small secondary text is low contrast, such as the STR/NUM type labels, the "Press ⌘+Enter" hint and the placeholder text. In light mode the suggestion chips are pale gray on pale gray.
- The disabled "Run Query" button is hard to read in both themes. It should look disabled, but it should still be legible.
- Check the tiny green text on dark-green chips against WCAG AA (4.5:1).

## Results table: 6.5/10

**Working well**

- Search, export, sortable headers and a "Showing 5 of 5 rows" indicator are all present.
- Monospace uppercase headers fit the data-tool feel.

**Needs work**

- Numbers are left-aligned. They should be right-aligned so digits line up.
- MRR shows as `11200`, not `$11,200`, with no thousands separators.
- Headers are raw column names (`COMPANY_NAME`, `SUPPORT_TICKETS`). Prettify them to "Company" and "Support Tickets".
- There is no visible row hover or zebra striping, and the last row sits tight against the card edge.
- The table is the actual answer, but it sits below the fold.

## Layout & hierarchy: 7.5/10

**Working well**

- The sidebar works well as a schema reference, and "click to add" columns is a nice touch.
- The single centered column is easy to follow: request, finding, table, SQL, trace.
- The trace is collapsible.
- The empty state is clean, with useful suggestion chips.

**Needs work**

- The "Executive Finding" block (headline plus three Signal cards) takes up the whole first screen, so the table needs scrolling. Show the table first, or compress the finding.
- The finding text mostly restates the query ("...are displayed"), and the Signal cards just list the filters. That is space spent on no new information.
- The same idea appears three times ("Verified Pipeline: 4 checks passed", "4 checks verified", "Verified Intent & Integrity Checks"). Pick one place for it.

## Analytical correctness: 7/10

The SQL for the demo query is correct. "0-3 tickets" became `support_tickets <= 3`, "over 200" became `> 200`, and the filters for Enterprise and Active are right. Every returned row satisfies them, and ordering by MRR descending is accurate. The `ORDER BY` was unrequested, but it is reasonable.

The concerns are about what the screen implies rather than this one query:

1. **The "verified" checks look like restatements, not tests.** "Enterprise filter verified" only confirms the SQL contains the filter that was asked for. That checks intent matching, not correctness. Real checks would confirm the filter values exist in the column (does `'Enterprise'` actually appear?), flag zero-row results, or re-run a second independent query. Calling this "Verified" overclaims, and the label will erode trust the first time a wrong answer carries it.
2. **The demo may not exercise the AI.** The key modal says preloaded datasets "support verified queries keyless", which suggests the suggestion chips may be cached or hardcoded. This screenshot may not show real LLM behavior. Test with messy free-form questions such as "customers who left recently" (ambiguous) or a misspelled column, on an uploaded CSV.
3. **Row-count inconsistency.** The dataset picker says "20 rows" for SaaS Customer MRR, while the header and the ready banner say 25 rows. It is a small bug, but in an analytics tool a mismatched count damages credibility.
4. **Unrequested advice is presented as verified.** "Recommended Action: Target these accounts for expansion" and "healthy champion accounts" are interpretation, not data. Label them as AI suggestions or make them optional.
5. **The trace looks templated.** Intent, grounding and blueprint appear to be fixed labels, not the model's real steps, so it may not show a retry or a self-correction when one happens.

## Top fixes, in order of impact

1. Put the results table above the finding, or shrink the finding.
2. Format numbers: right-align them, add currency and separators, and use friendly headers.
3. Replace the "verified" checks with real validations, or rename them to "Query matches your request".
4. Fix the 20 vs 25 row mismatch.
5. Raise the contrast on secondary text and the disabled button.
