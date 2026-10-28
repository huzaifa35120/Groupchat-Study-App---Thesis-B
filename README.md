# Group Chat Study

Research platform for the COMP4093 thesis *Measuring how closely AI-generated messages match human communication in group chat*.

Participants consent and chat in timed group sessions under made-up names. The researcher can join any session as **Moderator**: those messages are stored but flagged and never masked, predicted, scored or counted. When a session ends, its conversation statistics are recorded automatically. Afterwards the researcher hides ~20% of messages, has **Claude Opus 5** (`claude-opus-5`) write a replacement for each gap from the surrounding conversation only, scores each replacement on the 0–3 rubric (plus an optional Opus 5 LLM judge as a second rater), and reads every figure and test on the **Results** page or exports it.

Stack: Next.js 16 (App Router) on Vercel for the frontend and API, Supabase Postgres (row-level security on every table) for data, Supabase Realtime for presence/typing pings, Anthropic API for prediction and judging.

## Study workflow

1. **Sessions → New group.** Creates the group and three 10-minute sessions with editable topic seeds. Copy the participant link (or the email template) from the group page.
2. Participants open the link, read the information statement, tick every consent box, optionally leave an email for the results summary (stored on a separate, unlinked list), pick a made-up name, and get a private access code. Their page shows a **Join** button when a session goes live.
3. **Open a session → Start.** The timer runs server-side; the chat closes itself at zero and the session record (message counts, length, style, turn-taking, reply latency, participation balance, per-minute activity) is written. Use the composer or quick messages to talk as Moderator; extend or end early if needed.
4. **Transcript & gaps tab** (after the session ends): pick gaps with a seeded random draw that follows the plan's rules (≈20%, never the first three, never two in a row, never the last). Toggle individual gaps or set message types by hand.
5. **AI runs → New run.** Choose sessions, model (default `claude-opus-5`), effort, context (both sides / preceding only / window), and prompt. Presets cover the main condition and ablations. Press **Run predictions**; gaps are processed a few at a time, so it is safe to stop and continue.
6. **Score gaps** (keys 0–3, Enter to save). Tag failures for scores 0–1. Optionally run the **LLM judge** and have your supervisor score too for inter-rater agreement.
7. **Results.** Pick a run and a score source. Includes score distribution with bootstrap CI; breakdowns by conversation, short-vs-longer (Mann–Whitney), message type and position (Kruskal–Wallis, Spearman); failure categories mapped to AI-detection cues; length/shape and style comparisons (Wilcoxon, exact McNemar); automatic metrics (token F1, BLEU, ROUGE-L, chrF, edit similarity) and their correlation with human scores; inter-rater κ; paired comparison between runs; token usage and cost; and auto-drafted Method/Results paragraphs. **Export** gives a Markdown report with numbered tables, CSVs (gaps, session records, P-labelled transcripts) and full JSON.

Participants can withdraw from their study page; a researcher can also withdraw someone from the group page. Withdrawal deletes every session that person posted in, in full, and writes an anonymous entry to the withdrawal log.

## Setup

### 1. Supabase

Either add Supabase from the Vercel Marketplace to the Vercel project (it injects the environment variables), or create a project at supabase.com and copy its URL, anon key, service-role key and the Postgres connection string into the variables in `.env.example`.

Then apply the schema:

```bash
npx vercel env pull .env.local
npm run migrate
```

### 2. Environment variables on Vercel

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase (set by the integration) |
| `ANTHROPIC_API_KEY` | Claude Opus 5 predictions and judging |
| `ADMIN_EMAILS` | Comma-separated researcher emails allowed to register and sign in |

### 3. First sign-in

Open `/admin/login`, choose **Create your account**, and register with an email listed in `ADMIN_EMAILS`.

### Local development

```bash
npm install
cp .env.example .env.local   # fill in
npm run migrate
npm run dev
```

## Methodological notes

- Each gap is predicted in its own request with the other gaps shown as written (configurable). The model never sees the original. The exact system prompt, user prompt, model ID returned by the API, token usage and latency are stored with every prediction.
- Opus 5 does not accept sampling parameters (temperature etc.); variation is controlled with `effort`. Adaptive thinking is on. Server-side refusal fallbacks are deliberately **not** enabled, so every stored prediction comes from the model named in the run; a refusal is recorded as an error.
- The LLM judge answers three yes/no questions (same meaning, similar style, fits context) that map deterministically onto the 0–3 rubric. Because the judge is the same model family as the predictor, report it as a secondary rater alongside human scores.
- Short reactions are messages of three words or fewer (`SHORT_MAX_WORDS` in `src/lib/constants.ts`).
- Statistics are implemented in `src/lib/analysis/stats.ts` and were checked against SciPy, scikit-learn and sacreBLEU.

## Privacy

Collected: made-up name, message text, timestamps, consent ticks, a hash of the access code. Not collected: real names, student numbers, IP addresses or device information (nothing of the kind is written to the database), demographics. Realtime carries only "new message" pings, typing and presence, never message text. Only message text and made-up names (or `Speaker 1/2/3`, if chosen) are sent to the Anthropic API.
