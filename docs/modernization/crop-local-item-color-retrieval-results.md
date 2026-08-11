# Crop-Local Item-Color Retrieval Results

Status: internal 500-reference retrieval gate passed; mechanics measured through 2,000 generated
references; production scale remains unproven

## Decision

Keep the indexed retrieval path as benchmark-only evidence for `crop-local-item-color-v0`. The
frozen descriptor-token ranker recovered 735 of the 745 crop queries accepted by the unchanged
directional verifier within a fixed top-50 candidate set, so it passed the predeclared 98%
candidate-recall gate. This establishes that candidate generation can precede the verifier on this
locked 500-reference corpus. It does not establish a production index design or a public API.

The retained report is
[`item-color-retrieval-holdout-node22-2026-08-10.json`](../../benchmarks/crop-local/item-color-retrieval-holdout-node22-2026-08-10.json).
The local-only manifest is identified by SHA-256 in that report; pixels and generated crops remain
outside the repository.

## Frozen Path

The index uses the `idf-stop20-16` profile selected by the earlier 50-reference development study:

- split every 256-bit local descriptor into 16 positional 16-bit tokens;
- deduplicate tokens within each reference and query;
- omit tokens present in more than 20% of references;
- score candidates with `ln((N + 1) / (df + 1)) + 1` inverse-document-frequency weights;
- sort equal scores by stable source ID and pass at most 50 sources to the existing directional
  item-color verifier.

Neither the token profile, top-50 bound, item-color thresholds, nor local-verifier thresholds were
changed after inspecting the holdout result. The top-50 bound was fixed as a conservative margin
over the development study's 100% verifier-accepted recall@20.

## Locked Holdout Evidence

The source-disjoint style-4 holdout contains 500 references and 1,500 deterministic crop queries.
The unchanged verifier accepted the true source for 745 queries.

| Metric | Result |
| --- | ---: |
| All-positive recall@1 / @10 / @50 | 52.8% / 68.5% / 83.5% |
| Verifier-accepted recall@1 / @10 / @50 | 76.6% / 91.3% / 98.66% |
| Verifier-accepted sources missed at 50 | 10 / 745 |
| Correct first verified candidate | 732 / 1,500 |
| Unrelated first verified candidate | 3 / 1,500 |
| No verified candidate | 765 / 1,500 |
| True-source matches anywhere in top 50 | 735 |
| Unrelated matches anywhere in top 50 | 12 |

The first-match result is intentionally stricter than candidate recall. Three queries had an
unrelated candidate accepted before the true source. The retained rows are concentrated in the
same alternate-scan and shared studio-card families already discussed in the independent verifier
report. A verifier match remains directional visual consistency, not proof of item identity.

Domain evidence is uneven. Verifier-accepted recall@50 was 100% for portraits, 99.1% for
photographs, 98.7% for documents, 95.9% for screenshots, and 95.6% for card layouts. The aggregate
gate therefore must not be read as a per-domain guarantee.

## Resource Evidence

The deterministic JSON index contained 233,674 retained tokens and 720,274 posting entries. It was
5,900,264 bytes (11,800.5 bytes/reference), built in 739.1 ms, serialized in 204.7 ms, and loaded in
127.0 ms on Node 22.22.1 on arm64 macOS. That is index-only storage and excludes the enriched
reference fingerprints required by the verifier.

Retrieval query latency was 1.42 ms p50 and 4.10 ms p95 after fingerprints were available. The
rank-ordered retrieval-plus-verification path, stopping at the first verifier match, was 59.1 ms
p50 and 106.8 ms p95. Query fingerprint generation remained a separate 116.1 ms p50 and 297.2 ms
p95 cost. The stop-at-first path required 40,798 comparisons across 1,500 queries; evaluating all
top-50 candidates required 75,000.

This index is a ranker with a bounded output, not yet a selective production index. A query had
evidence from 499 references at p50 and 500 at p95, and traversed 17,322 posting entries at p50.
The top-50 cap bounds expensive verifier work but does not prevent the scoring stage from touching
nearly the entire 500-reference corpus.

## Generated Mechanical Scaling

A deterministic generated-descriptor study measured the unchanged index at 500, 1,000, and 2,000
references. It deliberately combines broad, sub-threshold posting lists with distinctive evidence
and contains no source pixels. It is reproducible mechanics evidence only: its 100% synthetic
source recall is an integrity assertion, not retrieval-quality evidence.

| References | JSON size | Build heap growth | Load heap growth | Query p50 / p95 | Evidence coverage p50 | Postings visited p50 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 8.36 MB | 101.5 MB | 79.8 MB | 1.21 / 2.16 ms | 100% | 16,843 |
| 1,000 | 14.71 MB | 157.0 MB | 136.1 MB | 1.86 / 3.69 ms | 100% | 32,627 |
| 2,000 | 25.59 MB | 168.8 MB | 182.5 MB | 3.18 / 6.71 ms | 100% | 64,240 |

The 2,000-reference run traversed about 32.1 posting entries per reference at p50 and accumulated
evidence for every reference. This confirms the existing concern with a measured larger input:
the top-50 output does not make candidate formation selective, and both posting traversal and
scored-reference work grow approximately linearly for this corpus.

An exact bounded top-50 heap was also compared with the retained full sort. It preserved the
candidate-ranking SHA-256 and index statistics at every scale, but changed p50 query time by +7.1%,
+2.5%, and +36.3% at 500, 1,000, and 2,000 references, respectively. It was rejected. Posting
accumulation dominates at these sizes, and heap maintenance does not solve the underlying
selectivity problem.

The retained evidence is
[`item-color-retrieval-scaling-full-sort-baseline-node22-2026-08-10.json`](../../benchmarks/crop-local/item-color-retrieval-scaling-full-sort-baseline-node22-2026-08-10.json)
and
[`item-color-retrieval-top-k-candidate-node22-2026-08-10.json`](../../benchmarks/crop-local/item-color-retrieval-top-k-candidate-node22-2026-08-10.json).

## What 500 References Establish

The holdout establishes reproducibility, source-disjoint candidate recall at the measured size,
bounded verifier fan-out, deterministic serialized size, and measured build/load/query costs for
one corpus composition. It also exposes real failure modes: ten accepted true sources fall outside
the top 50, synthetic UI/card domains underperform the aggregate, and false verified candidates
can outrank the true source.

It cannot establish ranking recall, rebuild strategy, incremental updates, sharding, concurrency,
or latency at 10,000 to 1,000,000 references. The generated scaling study now measures posting-list
growth and process memory through 2,000 references, but no larger provenance-safe quality corpus
was available, so no quality or query-latency extrapolation is reported.

For storage planning only, linear arithmetic at the observed 11,800.5 bytes/reference gives about
118 MB at 10,000 references, 1.18 GB at 100,000, and 11.8 GB at 1,000,000. These are not benchmark
measurements: vocabulary growth, token document frequency, ordinal encoding, and JSON overhead can
all change the slope. A fixed `K=50` would reduce verifier comparisons relative to exhaustive
comparison by 99.5%, 99.95%, and 99.995% at those reference counts, respectively, but says nothing
about the cost or recall of producing those 50 candidates.

## Next Gates

Before considering a public or production retrieval contract:

1. Replace the research JSON representation with a compact measured posting encoding and record
   resident-memory as well as serialized-size budgets.
2. Replace all-reference evidence accumulation with genuinely selective candidate formation, then
   demonstrate sublinear scoring on a larger provenance-safe, source-disjoint corpus and report
   recall and latency by domain without retuning the verifier.
3. Define update, deletion, versioning, and rebuild semantics separately from the fingerprint and
   directional comparison contracts.
4. Decide how callers handle multiple verified matches rather than treating the first match as
   item identity.
