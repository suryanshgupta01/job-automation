/**
 * Naukri Auto-Apply — personal data loaded from .env
 * =====================================
 * HOW TO USE:
 * 1. Log in to naukri.com, open a search like
 *    https://www.naukri.com/full-stack-developer-jobs?experience=1
 * 2. Open DevTools console (F12 → Console), paste this whole file, press Enter.
 * 3. It runs in DRY_RUN mode first: it fills everything but does NOT press Apply.
 *    Watch one or two applications, then re-run with DRY_RUN = false to actually apply.
 *
 * NOTES:
 * - This script opens each job in a popup window, applies, then closes it.
 *   The runner disables popup blocking for this.
 * - Optional: put a Google Gemini API key in CONFIG.geminiKey and any question the
 *   built-in answer bank can't match gets answered by Gemini using your CV.
 * - Auto-applying may violate Naukri's ToS — use at your own risk.
 */
(async function naukriAutoApply() {
  'use strict';

  const __CFG = (typeof window !== 'undefined' && window.__APPLY_CONFIG) || {};

  // ======================= CONFIG =======================
  const CONFIG = {
    DRY_RUN: true,
    MAX_APPLICATIONS: 20,
    MIN_DELAY_MS: 30000,
    MAX_DELAY_MS: 90000,
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
    [/years? of (work |professional )?experience|how (long|many years)|total experience/i,
      `${CV.yearsOfExperience}`],
    [/notice period|when can you (start|join)|start date|joining|availab/i,
      CV.noticePeriod || CV.startDate],
    [/current .{0,15}(ctc|salary|compensation|package)/i, CV.currentCTC || CV.currentSalary],
    [/(expected|desired) .{0,15}(ctc|salary|compensation|package|pay)|salary expectation/i, CV.expectedCTC || CV.expectedSalary],
    [/remote|work from home|wfh/i, CV.remoteOk],
    [/reloc|move to|shift to|based out of|work from (our )?office|on-?site/i, CV.relocate],
    [/visa|sponsorship|work authorization|legally authorized|right to work|citizen/i, CV.workAuth],
    [/where are you (based|located)|current location|city|location/i, CV.location],
    [/linkedin/i, CV.linkedin],
    [/github/i, CV.github],
    [/portfolio|website|personal site/i, CV.portfolio],
    [/link|url/i, CV.links],
    [/why (do you want|are you interested|this role|this company|us|join)|motivation/i,
      `I ship production features end to end. ${CV.highlights[0] || ''}. This role matches my stack directly, and I want to keep building products with real ownership.`],
    [/tell (us|me) about yourself|introduce yourself|about you|summary|describe yourself/i,
      `I'm ${CV.name}, ${CV.currentRole}. ${CV.highlights[0] || ''}. Previously: ${CV.highlights[2] || ''}. ${CV.highlights[3] || ''}.`],
    [/(biggest|proudest|favorite) (project|achievement|accomplishment)|worked on/i,
      `${CV.highlights[0] || ''}. I owned it end to end, from architecture through deployment and CI/CD.`],
    [/education|degree|university|college|qualification/i, CV.education],
    [/phone|contact number|mobile/i, CV.phone],
    [/e-?mail/i, CV.email],
    [/your name|full name|\bname\b/i, CV.name],
    [/gender|sex\b/i, CV.gender || 'Male'],
    [/date of birth|dob|birth date/i, CV.dob],
  ];

  const GENERIC_ANSWER =
    `I'm ${CV.name}, ${CV.currentRole}. Happy to elaborate — key highlights: ` +
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
    return [...root.querySelectorAll('button, a[role="button"], [type="submit"], input[type="submit"], a.apply-btn')]
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
  const STORE_KEY = 'autoApplyNaukri';
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

  // ======================= NAUKRI-SPECIFIC LOGIC =======================

  // Extract job ID from a Naukri URL: /job-listing/...-jid-XXXXX or /job/...?jobId=XXXXX
  function jobIdFromUrl(url) {
    const m = url.match(/[-/]jid[-_]?(\d{5,})/i) || url.match(/jobId=(\d+)/i) || url.match(/\/(\d{10,})\?/);
    return m ? m[1] : url;
  }

  function getJobCards() {
    const cards = [];
    // Naukri uses article.jobTuple or div with srp-jobtuple-wrapper, or .cust-job-tuple
    const tuples = document.querySelectorAll(
      'article.jobTuple, .srp-jobtuple-wrapper, .cust-job-tuple, [data-job-id], .list > .srp-jobtuple-wrapper, .jobTupleHeader'
    );

    for (const el of tuples) {
      // Job link and title
      const titleLink =
        el.querySelector('a.title, a[class*="title" i], h2 a, .row1 a, .jobTupleHeader a, a[class*="jobTitle" i]') ||
        el.querySelector('a[href*="/job-listing/"], a[href*="/job/"]');
      if (!titleLink) continue;

      const href = titleLink.href || '';
      if (!href || !/naukri\.com/i.test(href)) continue;
      const jid = jobIdFromUrl(href);
      if (seen.has(jid)) continue;

      const title = (titleLink.textContent || '').replace(/\s+/g, ' ').trim();
      if (!title || title.length < 3) continue;

      // Company
      const companyEl =
        el.querySelector('.comp-name, a.subTitle, [class*="companyName" i], .row2 a, .comp-dtl-header a');
      const company = (companyEl?.textContent || '').replace(/\s+/g, ' ').trim();

      // Salary
      const salaryEl = el.querySelector('.sal, [class*="salary" i], .row3 .sal-wrap, .ni-job-tuple-icon-srp-rupee + span');
      const salary = (salaryEl?.textContent || '').replace(/\s+/g, ' ').trim();

      // Experience
      const expEl = el.querySelector('.exp, [class*="experience" i], .ni-job-tuple-icon-srp-experience + span');
      const exp = (expEl?.textContent || '').replace(/\s+/g, ' ').trim();

      // Already applied? Naukri shows "Applied" on cards
      if ([...el.querySelectorAll('span, div, em')].some((s) => /^applied$/i.test(s.textContent.trim()))) continue;

      cards.push({ jid, title, company, salary, exp, href, linkEl: titleLink, el });
    }
    return cards;
  }

  // Apply inside a popup window
  async function applyInPopup(popup) {
    // Wait for the page to load
    await sleep(4000);

    const doc = popup.document;
    if (!doc || !doc.body) {
      log('  ⚠ popup document not accessible — skipping');
      return false;
    }

    const bodyText = doc.body.innerText.slice(0, 5000);

    // Already applied check
    if (/already applied|you have applied/i.test(bodyText)) {
      log('  ⏭ already applied — skipping');
      return false;
    }

    // Look for Apply button on the job detail page
    const applyBtn = await waitFor(() => {
      // Naukri's apply button
      const btn =
        doc.querySelector('#apply-button') ||
        doc.querySelector('button#apply-button') ||
        doc.querySelector('button.apply-button') ||
        doc.querySelector('[id*="apply" i][class*="btn" i]') ||
        [...doc.querySelectorAll('button, a')].find((b) =>
          visible(b) && /^apply$/i.test(b.textContent.trim()) && !b.closest('nav')
        );
      if (btn && visible(btn)) return btn;
      return null;
    }, 8000);

    // Check for "Apply on company site" — skip external applies
    const externalApply = [...doc.querySelectorAll('button, a')].find((b) =>
      visible(b) && /apply on company|external apply/i.test(b.textContent.trim())
    );
    if (externalApply && !applyBtn) {
      log('  ⏭ external apply (company site) — skipping');
      return false;
    }

    if (!applyBtn) {
      // Maybe it's a quick-apply job that already has a chatbot/question form visible
      const chatbot = doc.querySelector('[class*="chatbot" i], [class*="questionnaire" i], [class*="apply-form" i]');
      if (!chatbot) {
        log('  ⚠ no Apply button found — skipping');
        return false;
      }
    } else {
      log('  🖱 clicking Apply');
      applyBtn.click();
      await sleep(3000);
    }

    // Naukri may show a chatbot-style questionnaire after clicking Apply.
    // It can also do a 1-click apply (no questions) — the success toast appears.

    // Check for immediate success (1-click apply)
    const quickSuccess = await waitFor(() =>
      /applied successfully|application (has been )?submitted|successfully applied/i.test(doc.body.innerText.slice(0, 3000)),
      3000
    );
    if (quickSuccess) {
      if (CONFIG.DRY_RUN) {
        log('  🔍 DRY_RUN — would click: "Apply" (1-click)');
        return true;
      }
      log('  ✅ applied (1-click)');
      return true;
    }

    // Handle chatbot / questionnaire form
    // Naukri's chatbot asks questions one at a time, each with a text input,
    // dropdown, or radio, plus a "Next" / "Submit" button.
    const MAX_Q = 15;
    for (let q = 0; q < MAX_Q; q++) {
      await sleep(1500);

      // Check if we're done (success message appeared)
      if (/applied successfully|application (has been )?submitted|successfully applied/i.test(doc.body.innerText.slice(0, 3000))) {
        if (CONFIG.DRY_RUN) {
          log('  🔍 DRY_RUN — would click: "Apply"');
          return true;
        }
        log('  ✅ applied');
        return true;
      }

      // Find the question container — chatbot-style or traditional form
      const scope = doc.querySelector('[class*="chatbot" i], [class*="questionnaire" i], [class*="apply-form" i], [class*="apply-dialog" i], [role="dialog"]') || doc;

      // Text inputs
      const textFields = [...scope.querySelectorAll('input[type="text"], input[type="tel"], input[type="email"], input[type="number"], input:not([type])')].filter(visible);
      for (const field of textFields) {
        if (field.value && field.value.trim().length > 0) continue;
        const label = labelTextOf(field);
        if (!label || /search|hidden/i.test(label)) continue;
        const answer = await answerQuestion(label);
        if (answer && answer !== GENERIC_ANSWER) {
          setValue(field, answer);
          log(`  ✍ filled: "${label.slice(0, 60)}"`);
        } else if (field.required || field.getAttribute('aria-required') === 'true') {
          setValue(field, answer);
          log(`  ✍ filled (generic, required): "${label.slice(0, 60)}"`);
        }
      }

      // Textareas
      const textareas = [...scope.querySelectorAll('textarea')].filter(visible);
      for (const ta of textareas) {
        if (ta.value && ta.value.trim().length > 0) continue;
        const label = labelTextOf(ta);
        if (!label) continue;
        const answer = await answerQuestion(label);
        setValue(ta, answer);
        log(`  ✍ answered: "${label.slice(0, 60)}"`);
      }

      // Dropdowns
      const selects = [...scope.querySelectorAll('select')].filter(visible);
      for (const sel of selects) {
        if (sel.value && sel.selectedIndex > 0) continue;
        const label = labelTextOf(sel);
        const opts = [...sel.options].filter((o) => o.value && !/^$|select|choose|--|pick/i.test(o.text.trim()));
        if (!opts.length) continue;
        const answer = await answerQuestion(label);
        const ansLower = (answer || '').toLowerCase();
        const pick =
          opts.find((o) => ansLower && o.text.toLowerCase().includes(ansLower.slice(0, 20))) ||
          opts.find((o) => /yes|agree|willing|open|immediate/i.test(o.text)) ||
          opts[0];
        setValue(sel, pick.value);
        log(`  ☑ selected "${pick.text.trim()}" for "${label.slice(0, 50)}"`);
      }

      // Naukri also uses custom dropdown components (not native <select>).
      // These typically have a clickable div that opens a list of options.
      const customDropdowns = [...scope.querySelectorAll('[class*="dropdown" i]:not(select), [class*="select-box" i], [class*="suggestor" i]')].filter(visible);
      for (const dd of customDropdowns) {
        // If already has a value, skip
        const current = dd.querySelector('[class*="selected" i], [class*="value" i], input')?.textContent?.trim() ||
                        dd.querySelector('input')?.value;
        if (current && current.length > 0 && !/select|choose/i.test(current)) continue;

        const label = labelTextOf(dd);
        const answer = await answerQuestion(label);
        // Click to open
        dd.click();
        await sleep(800);
        // Find options in the dropdown or in a portal
        const options = [...doc.querySelectorAll('[class*="option" i], [role="option"], li[class*="item" i]')].filter(visible);
        if (options.length) {
          const ansLower = (answer || '').toLowerCase();
          const pick = options.find((o) => ansLower && o.textContent.toLowerCase().includes(ansLower.slice(0, 15))) ||
                       options.find((o) => /yes|willing|open|immediate/i.test(o.textContent)) ||
                       options[0];
          pick.click();
          log(`  ☑ custom dropdown: "${pick.textContent.trim().slice(0, 40)}" for "${label.slice(0, 40)}"`);
        }
        await sleep(400);
      }

      // Radio buttons
      const radioGroups = {};
      for (const r of [...scope.querySelectorAll('input[type="radio"]')].filter(visible)) {
        (radioGroups[r.name || labelTextOf(r)] ||= []).push(r);
      }
      for (const group of Object.values(radioGroups)) {
        if (group.some((r) => r.checked)) continue;
        const groupCtx = (group[0].closest('fieldset')?.textContent || group.map((r) => labelTextOf(r)).join(' ')).slice(0, 200);
        const answer = await answerQuestion(groupCtx);
        const ansLower = (answer || '').toLowerCase();
        const YES = /yes|willing|open|agree|relocat|remote|immediat|i am able|i can|authorized/i;
        let pick = group.find((r) => ansLower && labelTextOf(r).toLowerCase().includes(ansLower.slice(0, 15)));
        pick = pick || group.find((r) => YES.test(labelTextOf(r))) || group[0];
        if (!pick.checked) pick.click();
        log(`  ☑ radio "${labelTextOf(pick).slice(0, 50)}"`);
      }

      // Checkboxes
      for (const cb of [...scope.querySelectorAll('input[type="checkbox"]')].filter(visible)) {
        const own = labelTextOf(cb);
        if (!cb.checked && /agree|confirm|authoriz|terms|acknowledge|consent/i.test(own)) {
          cb.click();
          log(`  ☑ checked "${own.slice(0, 50)}"`);
        }
      }

      // Look for Submit / Apply / Next / Save button
      const submitBtn =
        findButtonByText(scope, /^submit$/i) ||
        findButtonByText(scope, /^apply$/i) ||
        findButtonByText(scope, /^save & apply$/i) ||
        findButtonByText(scope, /^submit application$/i);
      if (submitBtn) {
        if (CONFIG.DRY_RUN) {
          log(`  🔍 DRY_RUN — would click: "${submitBtn.textContent.trim()}"`);
          return true;
        }
        submitBtn.click();
        log('  ✅ applied');
        await sleep(2000);
        return true;
      }

      // Next button in multi-step chatbot
      const nextBtn =
        findButtonByText(scope, /^next$/i) ||
        findButtonByText(scope, /^continue$/i) ||
        findButtonByText(scope, /^proceed$/i);
      if (nextBtn) {
        log(`  ➡ clicking Next (question ${q + 1})`);
        nextBtn.click();
        await sleep(1500);
        continue;
      }

      // No button found — might be loading or done
      if (q >= MAX_Q - 1) {
        log('  ⚠ max questions reached without finding Submit — skipping');
        return false;
      }
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
    const jobs = allCards.filter((j) => !seen.has(j.jid) && titleOk(j.title));

    if (!jobs.length) {
      log(`(this page: ${allCards.length} job cards found, 0 match filters` +
          (allCards.length ? ` — sample titles: ${allCards.slice(0, 3).map((j) => `"${j.title}"`).join(', ')}` : '') + ')');

      // Pagination: Naukri uses numbered pages with a "Next" button
      const nextBtn =
        document.querySelector('a.fright, a[class*="next" i]') ||
        [...document.querySelectorAll('a')].find((a) => visible(a) && /^next$/i.test(a.textContent.trim()) && a.href) ||
        [...document.querySelectorAll('.pagination a, nav a')].find((a) => visible(a) && /^>$|^next$|^›$/i.test(a.textContent.trim()));
      if (nextBtn) {
        log('🌐 Moving to next page');
        nextBtn.click();
        await sleep(5000);
        continue;
      }

      log('All jobs on this page exhausted. Done.');
      break;
    }

    const job = jobs[0];
    seen.add(job.jid);
    STATE.seen = [...seen].slice(-3000);
    saveState(STATE);

    log(`▶ Applying: ${job.title} @ ${job.company || '?'} | ${job.href} | ${job.salary || ''}`);

    // Open the job in a popup window (the runner disables popup blocking)
    let popup;
    try {
      popup = window.open(job.href, '_blank', 'width=1200,height=900,left=100,top=100');
    } catch (e) {
      log('  ⚠ failed to open popup — skipping');
      continue;
    }

    if (!popup) {
      log('  ⚠ popup blocked — ensure popup blocking is disabled');
      continue;
    }

    // Wait for the popup to finish loading
    await new Promise((resolve) => {
      const check = setInterval(() => {
        try {
          if (popup.document.readyState === 'complete') { clearInterval(check); resolve(); }
        } catch {
          // Cross-origin — the page redirected somewhere else; treat as loaded
          clearInterval(check); resolve();
        }
      }, 500);
      setTimeout(() => { clearInterval(check); resolve(); }, 15000);
    });

    let ok = false;
    try {
      ok = await applyInPopup(popup);
    } catch (e) {
      log(`  ⚠ error during apply: ${e.message}`);
    }

    // Close the popup
    try { popup.close(); } catch {}

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
