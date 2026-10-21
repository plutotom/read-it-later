# Web audio usage and costs

The web app meters authenticated streaming and whole-file synthesis. iOS does not change.
Application allowances remain separate: streaming admits 500,000 original UTF-16 characters/month (or the configured limit); recordings admit 4,000,000 standard-equivalent units/month using existing voice multipliers. These are product entitlements, **not USD rates or a free provider allowance for each user**. Periods use UTC.

## Accounting contract

The web database is authoritative for admission, fenced generation jobs, physical provider-call attempts, immutable lifecycle events, historical coverage, and billing imports. Speech cache storage can use its existing separate database. This is not a distributed transaction: after acquiring a speech-cache fence, the web DB atomically claims a job and reserves quota. No upstream call can start without a committed attempt. If that commit is ambiguous the request fails closed. The next playback never assumes it was free.

`metering.ts` prepares and fingerprints the submitted input, counts units, and selects versioned rates. Google streaming submits the same prepared string that was measured. Native adapters share the Speechify escaping helper. Recordings prepare their chunks before reserving allowance, and each actual SDK call has its own attempt. SDK retries are disabled; HTTP adapters do not retry provider calls. Adding a provider requires a prepared payload, explicit billing unit/measurement, usage-report adapter, and rate configuration. Token/seconds billing must supply real provider units; never estimate tokens from words.

Google input code points are **estimates**, including spaces/markup. Google synthesis does not return settled billable characters. Inworld HTTP counts UTF-16 and reports full input usage on the first message followed by zeroes, so the adapter accumulates reports. Speechify uses `speech.done.billable_characters_count`. Explicit zero remains zero; missing reports remain input estimates. Partial reported usage is checkpointed before more audio arrives. Duration is measured from PCM bytes for streaming, not used to infer billed usage.

Attempts retain requested units, provider-reported units when available, measurement source, provider account, environment, model, voice, payload hash, rate version, estimated USD, bytes, and outcome. They contain no article text, URLs, tokens, or credentials. Deleted account/article references become null while numeric records remain. Lifecycle event IDs make settlement/replay deduplication safe. Monthly reports aggregate these records instead of incrementing a second monetary counter. Cache deliveries are metrics, not billing authority; listened seconds are not billed characters.

A timeout, disconnect after dispatch, crash, or lost response may be billable. Such attempts remain `unknown` or visibly unresolved `dispatched`; a stale job cannot silently start another provider call. Reservation settlement is atomic with job closure. On the next attempt for an expired job, or through the owner-only recovery action, workers are fenced before releasing only proven undispatched chunks. Explicit regeneration allows a new fenced attempt. A failed pre-dispatch streaming attempt releases its quota; recording failures release only demonstrably undispatched chunks. Quota reservations after a worker crash are conservatively retained; do not automatically refund ambiguous provider calls. A disconnected subscriber does not cancel admitted streaming work.

## Cache preservation

New cache identities include owner, environment, provider account, prepared payload/model/voice and PCM output version. Playback speed and price changes are excluded. The old owner-scoped identity is checked as a read fallback, preserving already-paid audio. Stored audio has no automatic expiry. Cache hits precede admission and work after quota exhaustion.

Audio EOF and archive acknowledgement are separate. Saving retries the same bytes at the same fenced path; retrying an already-published cache write succeeds without orphaning it. If persistence ultimately fails, the player/report surfaces that result and later playback requires an explicit paid regeneration. Bytes that never reached durable storage cannot survive a worker exit; the system does not promise otherwise. A stored blob that becomes unavailable returns an error rather than quietly resynthesizing.

Maintenance defaults to dry-run. `pnpm speech:maintenance --apply` deletes only explicit orphan-queue records older than 24 hours, after checking that no stored row references them. It never scans a shared store and treats absence from one database as proof of orphanhood. Unregistered blobs remain protected for manual investigation. Do not reintroduce global sweeping without an authoritative registry for every referencing database.

## Pricing and access

Default Google gross USD rates were verified on 2026-10-21: Chirp 3 HD 30, Neural2 16, Studio 160, Standard/WaveNet 4 per million characters. Source: https://cloud.google.com/text-to-speech/pricing . Nine rate decimals plus six unit decimals are retained with BigInt/Postgres numeric arithmetic; display rounding does not affect totals. Historical attempts retain their rate snapshot. No rate is assumed for other providers or non-default accounts.

Set `AUDIO_USAGE_PROVIDER_ACCOUNT` to a stable, non-secret billing project/account label. Its default `default` supports existing installs. `AUDIO_USAGE_RATE_CARDS` accepts a JSON array, for example:

```json
[{"provider":"inworld","model":"inworld-tts-2-flash","unit":"utf16_characters","account":"my-project","effectiveFrom":"2026-10-21T00:00:00.000Z","version":"contract-2026-10","usdPerMillion":"15"}]
```

Use the actual contract, not the example's rate. Models/units/account must match. Null rates remain unknown and are prominently excluded from cost completeness claims. Provider credits, subscription fees, volume adjustments, and Vercel storage/transfer/compute are separate from gross generation estimates. Infrastructure is not attributed to users using invented token conversions.

Users can query only their own report. `AUDIO_USAGE_ADMIN_IDS` is a server-only comma-separated allowlist of exact Better Auth user IDs. Empty means no aggregate administrators. Aggregate authorization is enforced in both the authenticated tRPC router and reporting service. Never accept account IDs or admin status from the browser. Set the owner's ID as a deployment configuration step; no production allowlist is modified by this branch.

## Billing reconciliation

`pnpm audio:billing:import /private/path/export.json` validates a normalized export without writing. Add `--apply` with the intended `DATABASE_URL` to import. Every row is a **complete aggregate slice**, not an increment: provider/account/environment/usage month/invoice month/SKU/model/currency. Reimporting an updated slice replaces its amounts transactionally and retains an immutable import snapshot. Reimport overlapping usage windows to handle delayed billing/adjustments. Do not mix the same charges under `shared` and an environment-specific slice.

```json
{"source":"google-billing-export","rows":[{"provider":"google","providerAccount":"default","environment":"shared","period":"2026-10","invoiceMonth":"2026-11","sku":"F977-2280-6F1B","model":"chirp3-hd","currency":"USD","gross":"1.25","credits":"-0.25","net":"1.00"}]}
```

Credits are signed; gross + credits must equal net exactly. Preserve adjustments, currencies, and invoice months. Provider totals may include tests, native applications, historical calls, or external callers. The owner view compares matched gross amounts with tracked estimates and exposes the residual. Non-USD or unknown-price comparisons stay unavailable. Month totals before the coverage date are incomplete, not evidence of missing charges. Provider invoices cannot establish exact per-user bills; never relabel an allocated estimate as an invoice.

Google's standard Cloud Billing BigQuery export can supply these aggregates with a read-only billing identity. Filter to the intended project and Text-to-Speech SKUs; group by usage month, `invoice.month`, `sku.id`, and currency, summing `cost` and nested signed `credits.amount`. Map SKU to the exact model, convert YYYYMM invoice months to YYYY-MM, and use decimal strings (not float-converted JSON numbers). https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery

No provider billing-export credentials or external recurring job are provisioned by the application. Run the importer from the existing trusted billing pipeline once export access is configured. CSV/invoice exports from other providers should be normalized to the same validated envelope; they must not be sent to a user-facing endpoint.

## Upgrade, validation, and rollback

1. Keep production untouched until review. Provision an isolated preview database and preview OAuth configuration. The existing shared preview `DATABASE_URL` is not suitable for migrations or synthetic test fixtures.
2. Apply `pnpm db:migrate` through `0014_audio_usage` to that isolated web DB. The migration is additive, snapshots existing legacy counts and **monthly only** streaming counts, and records the coverage timestamp. It never rewrites article/audio/progress records or invents historical USD. Old counters remain authoritative for entitlements; no dual increment or double charging is introduced. Reports compare counters with the migration snapshot plus reservations and flag differences from old application instances or manual adjustments as incomplete coverage.
3. Configure the provider account/rates and owner allowlist for preview. Use separate credentials for preview; scope Blob access appropriately. Verify Discord returns to the preview host, and verify authenticated reads/writes use preview data.
4. Verify first generation, saved replay after reload, failure before dispatch, partial failure, persistence retry, duplicate requests, and own/admin authorization. Run the full repository gate plus isolated local integration tests (`LISTENING_TEST_DATABASE_URL`; never a production URL).
5. Before production promotion apply the additive migration to the intended production web DB, configure the owner allowlist/rates, and verify a cold/warm replay. Do not deploy this code against a web DB lacking 0014. Merge/deploy only after explicit release approval.

For rollback retain all new tables, counters, and paid blobs. Disable `WEB_SPEECH_ENABLED` while switching application versions so an older player cannot silently bypass the new ambiguous-attempt guard. Existing recording rows remain compatible. Re-enable streaming with a version that understands the ledger and scoped/legacy cache lookup; do not drop counters or rebuild paid audio as a rollback step.
