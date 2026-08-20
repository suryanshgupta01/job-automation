/**
 * Indeed Auto-Apply — personal data loaded from .env
 * =====================================
 * HOW TO USE:
 * 1. Log in to in.indeed.com, open a search like
 *    https://in.indeed.com/jobs?q=full+stack+developer&sort=date&fromage=14
 * 2. Open DevTools console (F12 → Console), paste this whole file, press Enter.
 * 3. It runs in DRY_RUN mode first: it fills everything but does NOT press Submit.
 *    Watch one or two applications, then re-run with DRY_RUN = false to actually apply.
 *
 * NOTES:
 * - Indeed changes its HTML often; selector lookup is text-based where possible.
 * - Optional: put a Google Gemini API key in CONFIG.geminiKey and any question the
 *   built-in answer bank can't match gets answered by Gemini using your CV.
 * - Auto-applying may violate Indeed's ToS — use at your own risk.
 */
(async function indeedAutoApply() {
  'use strict';

  const __CFG = (typeof window !== 'undefined' && window.__APPLY_CONFIG) || {};

  // ======================= CONFIG =======================
  const CONFIG = {
    DRY_RUN: true,
    MAX_APPLICATIONS: 50,
    MIN_DELAY_MS: 45000,
    MAX_DELAY_MS: 120000,
    geminiKey: __CFG.geminiKey || '',

    TITLE_KEYWORDS: [
      'full stack', 'fullstack', 'full-stack', 'mern', 'backend', 'back end',
      'frontend', 'front end', 'software engineer', 'software developer',
      'web developer', 'ai engineer', 'ai developer', 'ml engineer',
      'react', 'node', 'javascript', 'typescript', 'python', 'mobile',
      'react native', 'sde', 'member of technical staff',
    ],
    TITLE_BLOCKLIST: [
      'senior', 'principal', 'director', 'manager', 'lead', 'devops',
      'data engineer', 'qa', 'test', 'intern', 'designer', 'sales', 'marketing',
      'teacher', 'trainer', 'tutor', 'instructor', 'coach',
      '.net', 'c#', 'php', 'ruby', 'golang', 'ios', 'android native', 'flutter',
    ],
  };

  // ======================= CV DATA =======================
  const CV = __CFG.CV || {
    name: '', email: '', phone: '', location: '', currentRole: '', company: '', education: '',
    yearsOfExperience: '', skills: '', highlights: ['', '', '', '', ''], noticePeriod: '',
    currentCTC: '', expectedCTC: '', currentSalary: '', expectedSalary: '', dob: '', gender: '',
    workAuth: '', github: '', linkedin: '', portfolio: '', links: '', remoteOk: '', relocate: '', startDate: '',
  };

  // ============== QUESTION → ANSWER BANK ==============
  const QA_BANK = [
    [/company name|current (company|employer)|organi[sz]ation/i, CV.company],
    [/years? of (work |professional )?experience|how (long|many years)/i,
      `${CV.yearsOfExperience}`],
    [/notice period|when can you (start|join)|start date|joining|availab/i,
      `${CV.startDate}`],
    [/current .{0,15}(ctc|salary|compensation)/i, CV.currentSalary],
    [/(expected|desired) .{0,15}(ctc|salary|compensation|pay)|salary expectation/i, CV.expectedSalary],
    [/remote|work from home|wfh/i, CV.remoteOk],
    [/reloc|move to|shift to|based out of|work from (our )?office|on-?site/i, CV.relocate],
    [/visa|sponsorship|work authorization|legally authorized|right to work|citizen/i, CV.workAuth],
    [/where are you (based|located)|current location|city/i, CV.location],
    [/linkedin/i, CV.linkedin],
    [/github/i, CV.github],
    [/portfolio|website|personal site/i, CV.portfolio],
    [/link|url/i, CV.links],
    [/why (do you want|are you interested|this role|this company|us|join)/i,
      `I ship production features end to end. ${CV.highlights[0] || ''}. This role matches my stack directly, and I want to keep building products with real ownership.`],
    [/tell (us|me) about yourself|introduce yourself|about you|summary|describe yourself/i,
      `I'm ${CV.name}, ${CV.currentRole}. ${CV.highlights[0] || ''}. Previously: ${CV.highlights[2] || ''}. ${CV.highlights[3] || ''}.`],
    [/(biggest|proudest|favorite) (project|achievement|accomplishment)|worked on/i,
      `${CV.highlights[0] || ''}. I owned it end to end, from architecture through deployment and CI/CD.`],
    [/cover letter/i,
      `I'm ${CV.name}, ${CV.currentRole}. ${CV.highlights[0] || ''}. ${CV.highlights[1] || ''}. I'd welcome the chance to discuss how my experience fits this role.`],
    [/education|degree|university|college|qualification/i, CV.education],
    [/phone|contact number|mobile/i, CV.phone],
    [/e-?mail/i, CV.email],
    [/your name|full name|\bname\b/i, CV.name],
    [/gender|sex\b/i, CV.gender || 'Prefer not to say'],
    [/date of birth|dob|birth date/i, CV.dob],
  ];

  const GENERIC_ANSWER =
    `I'm ${CV.name}, ${CV.currentRole}. Happy to elaborate in an interview — key highlights: ` +
    CV.highlights.slice(0, 2).join('; ') + '.';

  // ======================= HELPERS =======================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const humanDelay = () => sleep(CONFIG.MIN_DELAY_MS + Math.random() * (CONFIG.MAX_DELAY_MS - CONFIG.MIN_DELAY_MS));
  const log = (...a) => console.log('%c[auto-apply]', 'color:#0a84ff;font-weight:bold', ...a);

  function setValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
                : el.tagName === 'SELECT' ? HTMLSelectElement.prototype
                : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function labelTextOf(el) {
    return (
      el.closest('label')?.textContent ||
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ||
      el.closest('div')?.querySelector('label')?.textContent ||
      el.closest('div')?.previousElementSibling?.textContent ||
      el.parentElement?.textContent || ''
    ).trim();
  }

  function visible(el) {
    return el && el.getClientRects().length > 0 && !el.disabled;
  }

  function findButtonByText(root, regex) {
    return [...root.querySelectorAll('button, a[role="button"], [type="submit"], input[type="submit"]')]
      .find((b) => visible(b) && regex.test(b.textContent.trim()));
  }

  async function waitFor(fn, timeoutMs = 10000, pollMs = 400) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const res = fn();
      if (res) return res;
      await sleep(pollMs);
    }
    return null;
  }

  async function answerQuestion(questionText) {
    for (const [pattern, answer] of QA_BANK) {
      if (pattern.test(questionText)) return answer;
    }
    if (CONFIG.geminiKey) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${CONFIG.geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text:
                `You are answering a job application question on my behalf. Answer in first person, 2-4 sentences, professional, no markdown.\n\nMy CV:\n${JSON.stringify(CV)}\n\nQuestion: ${questionText}` }] }],
            }),
          }
        );
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      } catch (e) {
        log('Gemini call failed, using generic answer:', e.message);
      }
    }
    return GENERIC_ANSWER;
  }

  // ======================= PERSISTENCE =======================
  const STORE_KEY = 'autoApply';
  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
  }
  function saveState(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {}
  }
  let STATE = loadState();
  const today = new Date().toDateString();
  if (STATE.day !== today) { STATE = { day: today, submitted: 0, applied: 0, seen: (STATE.seen || []).slice(-2000) }; saveState(STATE); }
  const seen = new Set(STATE.seen || []);

  // ======================= INDEED-SPECIFIC SELECTORS =======================
  // Indeed uses data-jk as the unique job key on each card.
  // The UI has a split view: job cards on the left, detail pane on the right.
  // Clicking a card loads the detail in the right pane (or navigates in mobile view).

  function getJobCards() {
    const cards = [];
    // Indeed wraps each job in a container with data-jk (the job key)
    for (const el of document.querySelectorAll('[data-jk]')) {
      const jk = el.getAttribute('data-jk');
      if (!jk || seen.has(jk)) continue;

      // Title: look for the job title link/heading inside the card
      const titleEl =
        el.querySelector('h2.jobTitle a, h2.jobTitle span, a[data-jk] span[id^="jobTitle"]') ||
        el.querySelector('h2 a, h2 span, .jobTitle a, .jobTitle span') ||
        el.querySelector('a[data-jk]');
      const title = (titleEl?.textContent || '').replace(/\s+/g, ' ').trim();
      if (!title || title.length < 3) continue;

      // Company
      const companyEl =
        el.querySelector('[data-testid="company-name"]') ||
        el.querySelector('.companyName, .company_location .companyName, span[class*="company" i]');
      const company = (companyEl?.textContent || '').replace(/\s+/g, ' ').trim();

      // Salary (if shown on card)
      const salaryEl = el.querySelector('[class*="salary" i], .salary-snippet-container, [data-testid*="salary" i]');
      const salary = (salaryEl?.textContent || '').replace(/\s+/g, ' ').trim();

      // Link — the clickable element to open the job
      const linkEl = titleEl?.closest('a') || el.querySelector('a[data-jk], h2 a') || titleEl;

      // Already applied? Indeed shows a checkmark or "Applied" badge
      const applied = [...el.querySelectorAll('span, div')]
        .some((s) => /^applied$/i.test(s.textContent.trim()));
      if (applied) continue;

      cards.push({ jk, title, company, salary, linkEl, el });
    }
    return cards;
  }

  // ======================= APPLY TO ONE JOB =======================
  // Indeed Easy Apply flow: a multi-step form. Each step has a Continue button,
  // the last step has "Submit your application".
  // Some jobs use "Apply on company site" — those open an external link; skip them.

  async function applyToCurrentJob() {
    // Wait for the job detail pane to load on the right side
    await sleep(2000);

    // Check for "Apply now" button (Indeed Easy Apply)
    // Indeed renders either "Apply now" (easy apply) or "Apply on company site" (external)
    const applyBtn = await waitFor(() => {
      // Easy Apply button
      const easy =
        document.querySelector('#indeedApplyButton') ||
        document.querySelector('button[id*="indeedApply" i]') ||
        findButtonByText(document, /^apply now$/i) ||
        findButtonByText(document, /^apply$/i);
      if (easy && visible(easy)) return easy;
      return null;
    }, 8000);

    if (!applyBtn) {
      // Check if it's an external apply
      const externalBtn = findButtonByText(document, /apply on company site|apply externally|continue to apply/i);
      if (externalBtn) {
        log('  ⏭ external apply (company site) — skipping');
        return false;
      }
      log('  ⚠ no Apply button found — skipping');
      return false;
    }

    // Check if already applied
    const paneText = (document.querySelector('#jobDescriptionText')?.closest('[class]')?.parentElement?.textContent || '').slice(0, 3000);
    if (/you('ve| have) already applied|already submitted/i.test(paneText)) {
      log('  ⏭ already applied — skipping');
      return false;
    }

    log('  🖱 clicking Apply now');
    applyBtn.click();
    await sleep(3000);

    // Indeed may open the form in an overlay/iframe or navigate to a new page.
    // The form container is typically an iframe or a modal.
    // Try to find the form scope.
    let formScope = document;

    // Check for iframe-based application form (Indeed wraps Easy Apply in an iframe)
    const iframe = await waitFor(() => {
      const f = document.querySelector('iframe[id*="indeedapply" i], iframe[title*="apply" i], iframe[name*="apply" i]');
      if (f && visible(f)) return f;
      return null;
    }, 5000);

    if (iframe) {
      try {
        formScope = iframe.contentDocument || iframe.contentWindow.document;
        if (!formScope) throw new Error('cross-origin iframe');
      } catch {
        // Cross-origin iframe — can't access. Indeed sometimes opens the form
        // in a same-origin overlay instead. Wait for it.
        log('  ⚠ cross-origin iframe detected — waiting for overlay form');
        formScope = document;
      }
    }

    // Multi-step wizard: fill fields and click Continue until we reach Submit
    const MAX_STEPS = 10;
    for (let step = 0; step < MAX_STEPS; step++) {
      await sleep(1500);

      // Re-acquire form scope in case iframe changed
      if (iframe) {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          if (doc) formScope = doc;
        } catch {}
      }

      // Look for the current step's form content
      const scope = formScope;

      // Fill text inputs
      const textFields = [...scope.querySelectorAll('input[type="text"], input[type="tel"], input[type="email"], input[type="number"], input:not([type])')].filter(visible);
      for (const field of textFields) {
        if (field.value && field.value.trim().length > 0) continue; // already filled
        const label = labelTextOf(field);
        if (!label || /search|hidden/i.test(label)) continue;
        const answer = await answerQuestion(label);
        if (answer && answer !== GENERIC_ANSWER) {
          setValue(field, answer);
          log(`  ✍ filled: "${label.slice(0, 60)}"`);
        }
      }

      // Fill textareas
      const textareas = [...scope.querySelectorAll('textarea')].filter(visible);
      for (const ta of textareas) {
        if (ta.value && ta.value.trim().length > 0) continue;
        const label = labelTextOf(ta);
        if (!label) continue;
        const answer = await answerQuestion(label);
        setValue(ta, answer);
        log(`  ✍ answered: "${label.slice(0, 60)}"`);
      }

      // Handle select dropdowns
      const selects = [...scope.querySelectorAll('select')].filter(visible);
      for (const sel of selects) {
        if (sel.value && sel.selectedIndex > 0) continue; // already has a selection
        const label = labelTextOf(sel);
        const opts = [...sel.options].filter((o) => o.value && !/^$|select|choose|--|pick/i.test(o.text.trim()));
        if (!opts.length) continue;

        // Try to pick the best option based on the question
        const answer = await answerQuestion(label);
        const ansLower = (answer || '').toLowerCase();
        const pick =
          opts.find((o) => ansLower && o.text.toLowerCase().includes(ansLower.slice(0, 20))) ||
          opts.find((o) => /yes|agree|willing|authorize|open/i.test(o.text)) ||
          opts[0];
        setValue(sel, pick.value);
        log(`  ☑ selected "${pick.text.trim()}" for "${label.slice(0, 50)}"`);
      }

      // Handle radio buttons
      const radioGroups = {};
      for (const r of [...scope.querySelectorAll('input[type="radio"]')].filter(visible)) {
        (radioGroups[r.name || labelTextOf(r)] ||= []).push(r);
      }
      for (const group of Object.values(radioGroups)) {
        if (group.some((r) => r.checked)) continue; // already answered
        const groupCtx = (group[0].closest('fieldset')?.textContent || group.map((r) => labelTextOf(r)).join(' ')).slice(0, 200);
        const answer = await answerQuestion(groupCtx);
        const ansLower = (answer || '').toLowerCase();
        const YES = /yes|willing|open|agree|relocat|remote|immediat|i am able|i can|true|authorized/i;
        let pick = group.find((r) => ansLower && labelTextOf(r).toLowerCase().includes(ansLower.slice(0, 15)));
        pick = pick || group.find((r) => YES.test(labelTextOf(r))) || group[0];
        if (!pick.checked) pick.click();
        log(`  ☑ radio "${labelTextOf(pick).slice(0, 50)}"`);
      }

      // Handle checkboxes (terms, agreements)
      for (const cb of [...scope.querySelectorAll('input[type="checkbox"]')].filter(visible)) {
        const own = labelTextOf(cb);
        if (!cb.checked && /agree|confirm|authoriz|terms|acknowledge|certif|consent/i.test(own)) {
          cb.click();
          log(`  ☑ checked "${own.slice(0, 50)}"`);
        }
      }

      // Look for Continue or Submit button
      const submitBtn = findButtonByText(scope, /^submit your application$|^submit application$|^submit$/i);
      if (submitBtn) {
        if (CONFIG.DRY_RUN) {
          log('  🔍 DRY_RUN — would click: "Submit your application"');
          // Close the form / go back
          const closeBtn = findButtonByText(scope, /close|cancel|return|×|✕|dismiss/i) ||
                           scope.querySelector('[aria-label="Close" i], [aria-label="Dismiss" i]');
          if (closeBtn) closeBtn.click();
          return true;
        }
        submitBtn.click();
        log('  ✅ application submitted');
        await sleep(2000);
        // Close any confirmation overlay
        const doneBtn = findButtonByText(scope, /done|close|return to search|dismiss|continue/i);
        if (doneBtn) doneBtn.click();
        return true;
      }

      // Continue button to go to next step
      const continueBtn =
        findButtonByText(scope, /^continue$/i) ||
        findButtonByText(scope, /^next$/i) ||
        findButtonByText(scope, /^continue applying$/i);
      if (continueBtn) {
        log(`  ➡ clicking Continue (step ${step + 1})`);
        continueBtn.click();
        await sleep(2000);
        continue;
      }

      // No Continue or Submit found — might be a review page or error
      // Check for validation errors
      const errors = [...scope.querySelectorAll('[class*="error" i], [role="alert"]')].filter(visible);
      if (errors.length) {
        log(`  ⚠ form validation error: "${errors[0].textContent.trim().slice(0, 80)}" — skipping`);
        const closeBtn = findButtonByText(scope, /close|cancel|return|×|dismiss/i) ||
                         scope.querySelector('[aria-label="Close" i]');
        if (closeBtn) closeBtn.click();
        return false;
      }

      // Dead end — no button found
      if (step === MAX_STEPS - 1) {
        log('  ⚠ no Continue/Submit button found after max steps — skipping');
        return false;
      }

      // Wait a bit and retry (button might be rendering)
      await sleep(2000);
    }

    return false;
  }

  // ======================= MAIN LOOP =======================
  const titleOk = (t) => {
    const lower = t.toLowerCase();
    return CONFIG.TITLE_KEYWORDS.some((k) => lower.includes(k)) &&
           !CONFIG.TITLE_BLOCKLIST.some((k) => lower.includes(k));
  };

  let applied = 0;
  log(`Starting. DRY_RUN=${CONFIG.DRY_RUN}, max=${CONFIG.MAX_APPLICATIONS}`);
  log('Tip: keep this tab focused and do not navigate away.');
  await sleep(4000);

  while (applied < CONFIG.MAX_APPLICATIONS) {
    const allCards = getJobCards();
    const jobs = allCards.filter((j) => !seen.has(j.jk) && titleOk(j.title));

    if (!jobs.length) {
      log(`(this page: ${allCards.length} job cards found, 0 match filters` +
          (allCards.length ? ` — sample titles: ${allCards.slice(0, 3).map((j) => `"${j.title}"`).join(', ')}` : '') + ')');

      // Try pagination — Indeed has a "Next" link at the bottom
      const nextLink =
        document.querySelector('a[data-testid="pagination-page-next"]') ||
        document.querySelector('nav[role="navigation"] a[aria-label="Next Page"]') ||
        [...document.querySelectorAll('nav a, ul.pagination a')].find((a) => /^next$/i.test(a.textContent.trim()));
      if (nextLink && visible(nextLink)) {
        log('🌐 Moving to next page');
        nextLink.click();
        await sleep(5000);
        continue;
      }

      // Try scrolling (some Indeed views use infinite scroll)
      let grew = false;
      for (let s = 0; s < 3 && !grew; s++) {
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(3000);
        grew = getJobCards().some((j) => !seen.has(j.jk) && titleOk(j.title));
      }
      if (grew) continue;

      log('All jobs on this page exhausted. Done.');
      break;
    }

    const job = jobs[0];
    seen.add(job.jk);
    STATE.seen = [...seen].slice(-3000);
    saveState(STATE);

    log(`▶ Opening: ${job.title} @ ${job.company || '?'} | ${job.linkEl?.href || ''} | ${job.salary || ''}`);

    // Click the job card to load details in the right pane
    job.linkEl.scrollIntoView({ block: 'center' });
    await sleep(500);
    job.linkEl.click();
    await sleep(3000);

    const ok = await applyToCurrentJob();
    if (ok) {
      applied++;
      STATE.submitted = (STATE.submitted || 0) + 1;
      STATE.applied = (STATE.applied || 0) + 1;
      saveState(STATE);
      log(`  progress: ${applied}/${CONFIG.MAX_APPLICATIONS}`);
    }

    await humanDelay();
  }

  log(`Finished. ${CONFIG.DRY_RUN ? 'DRY RUN — nothing was actually sent. Set CONFIG.DRY_RUN = false and re-run to apply for real.' : `Applied to ${applied} jobs.`}`);
})();
