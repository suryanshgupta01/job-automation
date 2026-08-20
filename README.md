# Job Auto-Apply

Automatically applies to matching jobs on **Indeed**, **Wellfound** (ex-AngelList Talent), and **Naukri**.
A Playwright runner opens Chrome with your saved session, injects the platform-specific apply
script, and the script:

- picks jobs whose **title matches your keywords** (and skips a blocklist),
- fills forms, **cover letters**, and extra questions from a built-in Q&A bank (optionally falls back to **Gemini** for unknown questions),
- handles dropdowns, radios, checkboxes, and location prompts,
- submits, logs every application to `applications.csv`, and respects a **daily cap per site**.

It starts in **DRY RUN** mode by default — it fills everything but never presses Send —
so you can watch it work before going live.

## Supported Platforms

| Platform | Daily Cap | Script | Search Style |
|----------|-----------|--------|--------------|
| [Indeed](https://in.indeed.com) | 50 | `indeed-auto-apply.js` | Paginated search, Easy Apply multi-step wizard |
| [Wellfound](https://wellfound.com) | 50 | `wellfound-auto-apply.js` | Infinite scroll feed, SPA overlay apply panel |
| [Naukri](https://www.naukri.com) | 20 | `naukri-auto-apply.js` | Paginated search, popup-based apply with chatbot Q&A |

## Requirements

- [Node.js](https://nodejs.org/) 18+
- Google Chrome
- An account on each platform with your profile + resume completed

## Setup

**1. Clone and install:**

```bash
git clone <your-repo-url>
cd job-automation
npm install
```

**2. Create your `.env`:**

```bash
cp .env.example .env
```

Open `.env` and fill in your details — name, contact, skills, highlights, salary
expectations, links, etc. Every application answer and cover letter is built from
these values; **nothing personal is hard-coded in the scripts**. `.env` is
git-ignored, so your data never gets pushed.

Optional: set `GEMINI_KEY` to a free Google Gemini API key — any application
question the built-in answer bank can't match gets answered by Gemini using your CV.

**3. Log in (one time per platform, visible browser):**

```bash
node auto-apply-runner.js indeed login
node auto-apply-runner.js wellfound login
node auto-apply-runner.js naukri login
```

A Chrome window opens — log in to the site, then close the window.
The session is saved and reused by every later run.

**4. Dry run (watch it, nothing is submitted):**

```bash
node auto-apply-runner.js indeed
node auto-apply-runner.js wellfound
node auto-apply-runner.js naukri
```

**5. Go live:**

```bash
node auto-apply-runner.js indeed --live
node auto-apply-runner.js wellfound --live
node auto-apply-runner.js naukri --live
```

Each application is appended to `applications.csv` and counted toward the daily cap.

## npm scripts (shortcuts)

```bash
npm run indeed:login      # one-time login
npm run indeed            # dry run
npm run indeed:live       # apply for real

npm run wellfound:login
npm run wellfound
npm run wellfound:live

npm run naukri:login
npm run naukri
npm run naukri:live
```

## Customizing which jobs it applies to

Edit the `CONFIG` block at the top of each platform's script (`indeed-auto-apply.js`, `wellfound-auto-apply.js`, `naukri-auto-apply.js`):

| Setting | What it does |
|---|---|
| `TITLE_KEYWORDS` | Apply only when the job title contains one of these (case-insensitive) |
| `TITLE_BLOCKLIST` | Skip when the title contains any of these (senior, manager, .net, ...) |
| `MAX_APPLICATIONS` | Per-run cap (the runner overrides it with the daily cap remaining) |
| `MIN_DELAY_MS` / `MAX_DELAY_MS` | Wait between applications (human-pace delays to avoid bot detection) |

## Platform-specific notes

### Indeed

- Targets `in.indeed.com` (India). Edit the `searches` array in `auto-apply-runner.js` for other regions.
- Only applies to **Easy Apply** jobs (Indeed-hosted forms). External "Apply on company site" links are skipped.
- Handles the multi-step wizard: contact info, resume, questions, review, submit.
- Navigates pages via Indeed's pagination.

### Wellfound

- Scrolls the infinite `/jobs` feed and opens each job's SPA overlay.
- Fills the cover letter (personalized per company/role) plus any extra questions.
- Handles location prompts ("I can relocate to...") and all form field types.
- Jobs posted more than 14 days ago are skipped.
- Going faster than 60s between apps trips Wellfound's DataDome bot-check.

### Naukri

- Opens each job in a **popup window**, applies inside it, then closes it.
- Handles Naukri's chatbot-style questionnaire (questions asked one at a time).
- Supports both 1-click apply and multi-step question forms.
- Default daily cap is 20 (lower than other sites to stay under Naukri's radar).

## Run it automatically every day

### macOS / Linux (cron)

```bash
# Edit crontab
crontab -e

# Add (runs each platform at staggered times):
30 10 * * * cd /path/to/job-automation && node auto-apply-runner.js indeed --live >> auto-apply-indeed.log 2>&1
30 12 * * * cd /path/to/job-automation && node auto-apply-runner.js wellfound --live >> auto-apply-wellfound.log 2>&1
30 14 * * * cd /path/to/job-automation && node auto-apply-runner.js naukri --live >> auto-apply-naukri.log 2>&1
```

### Windows (Task Scheduler)

```powershell
$repo = "C:\path\to\job-automation"

# Indeed
$action  = New-ScheduledTaskAction -Execute "node.exe" -Argument "`"$repo\auto-apply-runner.js`" indeed --live" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At 10:30
Register-ScheduledTask -TaskName "IndeedAutoApply" -Action $action -Trigger $trigger -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable)

# Wellfound
$action  = New-ScheduledTaskAction -Execute "node.exe" -Argument "`"$repo\auto-apply-runner.js`" wellfound --live" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At 12:30
Register-ScheduledTask -TaskName "WellfoundAutoApply" -Action $action -Trigger $trigger -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable)

# Naukri
$action  = New-ScheduledTaskAction -Execute "node.exe" -Argument "`"$repo\auto-apply-runner.js`" naukri --live" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At 14:30
Register-ScheduledTask -TaskName "NaukriAutoApply" -Action $action -Trigger $trigger -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable)
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `0 job cards found` on every page | Bot-check or captcha. Run `node auto-apply-runner.js <site> login`, solve any captcha manually, close the window, re-run. |
| Session logged out | Delete the site's Chrome profile directory (e.g. `.indeed-chrome-profile/`) and repeat the `login` step. |
| Wellfound `no apply modal found` | That job opened as a full page instead of the apply panel -- skipped safely. |
| Indeed `external apply -- skipping` | The job uses the company's own site, not Indeed Easy Apply. Normal, not an error. |
| Naukri `popup blocked` | Ensure nothing overrides the runner's `--disable-popup-blocking` flag. |
| `no Continue/Submit button found` | The site changed its UI. Check `blocked-step-<site>.png` for a screenshot of what's on screen. |
| Want today's counter reset | Delete `apply-state-<site>.json`. |

## Files

| File | Purpose |
|---|---|
| `auto-apply-runner.js` | Playwright wrapper: opens Chrome, injects the site script, logs to CSV, enforces the daily cap |
| `indeed-auto-apply.js` | Indeed Easy Apply logic (also pasteable into DevTools console) |
| `wellfound-auto-apply.js` | Wellfound apply logic (also pasteable into DevTools console) |
| `naukri-auto-apply.js` | Naukri apply logic (also pasteable into DevTools console) |
| `config.js` | Tiny no-dependency `.env` loader |
| `.env.example` | Template -- copy to `.env` and fill in |
| `applications.csv` | Every submitted application (git-ignored) |
| `apply-state-<site>.json` | Today's application count per site (git-ignored) |
| `.<site>-chrome-profile/` | Saved Chrome sessions (git-ignored) |

## Disclaimer

Auto-applying may violate each platform's Terms of Service and can get an
account rate-limited or banned. The delays are deliberately human-like and everything
runs on your own machine with your own account -- use at your own risk, and review
the dry run before going live.
