'use strict';

/*
 * Security notes:
 * - No innerHTML is ever used with user-supplied data; all rows are built
 *   with document.createElement / textContent, so typed input can never be
 *   interpreted as HTML or run as script (no stored/DOM-based XSS surface).
 * - No inline event handler attributes (onclick=, oninput=, ...) are used
 *   in the HTML, so the page's Content-Security-Policy can omit
 *   'unsafe-inline' for script-src entirely.
 * - All numeric inputs are clamped and coerced with Number()/isFinite
 *   checks before use; nothing from the DOM is passed to eval, Function,
 *   setTimeout-with-string, or similar sinks.
 * - The app makes no network requests and stores no personal or academic
 *   data anywhere. The only things persisted are two non-sensitive
 *   preferences, each under its own localStorage key: "light"/"dark"
 *   (pctcalc-theme) and "board"/"quick" (pctcalc-mode, which calculator
 *   view was open last). Both are wrapped in try/catch so the app still
 *   works if storage is unavailable (private browsing, disabled storage,
 *   etc.). All subject/marks data, and the quick calculator's two
 *   numbers, still live in memory for the current tab only and disappear
 *   on refresh.
 */

(function () {
  const MAX_MARKS = 1000; // sane upper bound to stop absurd/garbage input

  let board = 'mp';       // 'mp' | 'hs' | 'grad'
  let stream = 'science'; // used when board === 'hs'
  let gradPattern = 'semester'; // used when board === 'grad': 'semester' | 'annual'
  let subjects = [];
  let idCounter = 0;

  const defaultSubjectsMP = [
    { name: 'First Language (Bengali/Hindi/Urdu/Nepali)', obtained: '', full: 100, count: true },
    { name: 'Second Language (English)', obtained: '', full: 100, count: true },
    { name: 'Mathematics', obtained: '', full: 100, count: true },
    { name: 'Physical Science', obtained: '', full: 100, count: true },
    { name: 'Life Science', obtained: '', full: 100, count: true },
    { name: 'History', obtained: '', full: 100, count: false },
    { name: 'Geography', obtained: '', full: 100, count: false },
    { name: 'Optional Elective Subject', obtained: '', full: 100, count: false },
  ];

  const defaultSubjectsHS = {
    science: [
      { name: 'First Language (Bengali)', obtained: '', full: 100, count: true },
      { name: 'English', obtained: '', full: 100, count: true },
      { name: 'Chemistry', obtained: '', full: 100, count: true },
      { name: 'Mathematics', obtained: '', full: 100, count: true },
      { name: 'Physics', obtained: '', full: 100, count: true },
      { name: 'Biology', obtained: '', full: 100, count: false },
      { name: 'Environmental Studies (qualifying)', obtained: '', full: 100, count: false },
    ],
    arts: [
      { name: 'First Language (Bengali/Hindi/etc.)', obtained: '', full: 100, count: true },
      { name: 'English', obtained: '', full: 100, count: true },
      { name: 'Elective 1', obtained: '', full: 100, count: true },
      { name: 'Elective 2', obtained: '', full: 100, count: true },
      { name: 'Elective 3', obtained: '', full: 100, count: true },
      { name: 'Elective 4', obtained: '', full: 100, count: false },
      { name: 'Environmental Studies (qualifying)', obtained: '', full: 100, count: false },
    ],
    commerce: [
      { name: 'First Language (Bengali/Hindi/etc.)', obtained: '', full: 100, count: true },
      { name: 'English', obtained: '', full: 100, count: true },
      { name: 'Accountancy', obtained: '', full: 100, count: true },
      { name: 'Business Studies', obtained: '', full: 100, count: true },
      { name: 'Costing & Taxation / Economics', obtained: '', full: 100, count: true },
      { name: 'Computer Application', obtained: '', full: 100, count: false },
      { name: 'Environmental Studies (qualifying)', obtained: '', full: 100, count: false },
    ],
    other: [
      { name: 'First Language (Bengali/Hindi/etc.)', obtained: '', full: 100, count: true },
      { name: 'English', obtained: '', full: 100, count: true },
      { name: 'Elective 1', obtained: '', full: 100, count: true },
      { name: 'Elective 2', obtained: '', full: 100, count: true },
      { name: 'Elective 3', obtained: '', full: 100, count: true },
      { name: 'Elective 4', obtained: '', full: 100, count: false },
      { name: 'Environmental Studies (qualifying)', obtained: '', full: 100, count: false },
    ],
  };

  const defaultSubjectsGrad = {
    semester: [
      { name: 'Semester 1 — Paper 1 (Major/Hons)', obtained: '', full: 100, count: true },
      { name: 'Semester 1 — Paper 2', obtained: '', full: 100, count: true },
      { name: 'Semester 2 — Paper 1 (Major/Hons)', obtained: '', full: 100, count: true },
      { name: 'Semester 2 — Paper 2', obtained: '', full: 100, count: true },
      { name: 'Semester 3 — Paper 1 (Major/Hons)', obtained: '', full: 100, count: true },
      { name: 'Semester 3 — Paper 2', obtained: '', full: 100, count: true },
      { name: 'Semester 4 — Paper 1 (Major/Hons)', obtained: '', full: 100, count: true },
      { name: 'Semester 4 — Paper 2', obtained: '', full: 100, count: true },
      { name: 'Semester 5 — Paper 1 (Major/Hons)', obtained: '', full: 100, count: true },
      { name: 'Semester 5 — Paper 2', obtained: '', full: 100, count: true },
      { name: 'Semester 6 — Paper 1 (Major/Hons)', obtained: '', full: 100, count: true },
      { name: 'Semester 6 — Paper 2', obtained: '', full: 100, count: true },
    ],
    annual: [
      { name: '1st Year — Paper 1', obtained: '', full: 100, count: true },
      { name: '1st Year — Paper 2', obtained: '', full: 100, count: true },
      { name: '2nd Year — Paper 1', obtained: '', full: 100, count: true },
      { name: '2nd Year — Paper 2', obtained: '', full: 100, count: true },
      { name: '3rd Year — Paper 1', obtained: '', full: 100, count: true },
      { name: '3rd Year — Paper 2', obtained: '', full: 100, count: true },
    ],
  };

  const gradNotes = {
    semester: 'Rename/add rows to match your actual CBCS papers (Major, Minor, IDC, SEC, AEC, VAC/CVAC, etc.) with each paper\u2019s full marks and marks obtained. This gives your overall marks-based percentage; if your university reports a CGPA instead, this total won\u2019t automatically match the CGPA-to-percentage formula your university publishes \u2014 check your convocation notice for that conversion factor (commonly CGPA \u00D7 9.5, but it varies by university).',
    annual: 'Rows are grouped by year \u2014 rename/add papers to match your actual mark sheet for each year, and tick "Count" for every paper that goes into your final aggregate (usually all of them for the annual/year-wise system).',
  };

  const streamNotes = {
    science: 'Rows follow the order First Language, English, Chemistry, Mathematics, Physics, Biology, then Environmental Studies (qualifying — not counted). Tick "Count" for the five that make up your best-of-five — most students count language, English, Chemistry, Physics and one of Maths/Biology.',
    arts: 'Arts combinations vary a lot, so the elective rows are left generic — rename Elective 1–4 to your actual subjects (History, Political Science, Geography, Education, Philosophy, Sanskrit, etc.) in the order they appear on your mark sheet, then tick "Count" for your best five.',
    commerce: 'Rows follow the usual Commerce mark sheet order: language, English, Accountancy, Business Studies, Costing & Taxation/Economics, then Computer Application and Environmental Studies (qualifying — not counted).',
    other: 'Rows are ordered language, English, then electives, ending with Environmental Studies (qualifying — not counted). Rename the elective rows to match your actual subjects, then tick "Count" for your best five.',
  };

  const mpNote = 'Rows follow the Madhyamik mark sheet order: First Language, Second Language, Mathematics, Physical Science, Life Science, History, Geography, then an Optional Elective Subject if you took one. Tick "Count" for your best five.';

  // Cached DOM references
  const el = {};

  function cacheDom() {
    el.tabMP = document.getElementById('tabMP');
    el.tabHS = document.getElementById('tabHS');
    el.tabGrad = document.getElementById('tabGrad');
    el.streamTabs = document.getElementById('streamTabs');
    el.streamButtons = {
      science: document.getElementById('streamScience'),
      arts: document.getElementById('streamArts'),
      commerce: document.getElementById('streamCommerce'),
      other: document.getElementById('streamOther'),
    };
    el.gradTabs = document.getElementById('gradTabs');
    el.gradButtons = {
      semester: document.getElementById('gradSemester'),
      annual: document.getElementById('gradAnnual'),
    };
    el.shortcutSwitch = document.getElementById('shortcutSwitch');
    el.quickMP = document.getElementById('quickMP');
    el.quickHS = document.getElementById('quickHS');
    el.quickGrad = document.getElementById('quickGrad');
    el.themeToggle = document.getElementById('themeToggle');
    el.themeIcon = document.getElementById('themeIcon');
    el.themeLabel = document.getElementById('themeLabel');
    el.modeToggle = document.getElementById('modeToggle');
    el.modeLabel = document.getElementById('modeLabel');
    el.worksheet = document.getElementById('worksheet');
    el.quickCalc = document.getElementById('quickCalc');
    el.quickRing = document.getElementById('quickRing');
    el.quickPctValue = document.getElementById('quickPctValue');
    el.quickPart = document.getElementById('quickPart');
    el.quickWhole = document.getElementById('quickWhole');
    el.quickSwap = document.getElementById('quickSwap');
    el.qfPart = document.getElementById('qfPart');
    el.qfWhole = document.getElementById('qfWhole');
    el.qfResult = document.getElementById('qfResult');
    el.ruleNote = document.getElementById('ruleNote');
    el.subjectRows = document.getElementById('subjectRows');
    el.addBtn = document.getElementById('addSubjectBtn');
    el.pctBig = document.getElementById('pctBig');
    el.gradeBig = document.getElementById('gradeBig');
    el.sumObtained = document.getElementById('sumObtained');
    el.sumFull = document.getElementById('sumFull');
    el.sumPct = document.getElementById('sumPct');
    el.warning = document.getElementById('warningBox');
  }

  function setBoard(b) {
    board = (b === 'hs' || b === 'grad') ? b : 'mp';

    el.tabMP.classList.toggle('active', board === 'mp');
    el.tabHS.classList.toggle('active', board === 'hs');
    el.tabGrad.classList.toggle('active', board === 'grad');
    el.tabMP.setAttribute('aria-selected', String(board === 'mp'));
    el.tabHS.setAttribute('aria-selected', String(board === 'hs'));
    el.tabGrad.setAttribute('aria-selected', String(board === 'grad'));

    el.streamTabs.classList.toggle('show', board === 'hs');
    el.gradTabs.classList.toggle('show', board === 'grad');

    el.quickMP.classList.toggle('active', board === 'mp');
    el.quickHS.classList.toggle('active', board === 'hs');
    el.quickGrad.classList.toggle('active', board === 'grad');

    if (board === 'mp') {
      el.ruleNote.textContent = mpNote;
      loadDefaults(defaultSubjectsMP);
    } else if (board === 'hs') {
      setStream(stream);
    } else {
      setGradPattern(gradPattern);
    }
  }

  function setStream(s) {
    if (!Object.prototype.hasOwnProperty.call(defaultSubjectsHS, s)) return;
    stream = s;
    Object.keys(el.streamButtons).forEach((name) => {
      el.streamButtons[name].classList.toggle('active', name === s);
    });
    el.ruleNote.textContent = streamNotes[s];
    loadDefaults(defaultSubjectsHS[s]);
  }

  function setGradPattern(p) {
    if (!Object.prototype.hasOwnProperty.call(defaultSubjectsGrad, p)) return;
    gradPattern = p;
    Object.keys(el.gradButtons).forEach((name) => {
      el.gradButtons[name].classList.toggle('active', name === p);
    });
    el.ruleNote.textContent = gradNotes[p];
    loadDefaults(defaultSubjectsGrad[p]);
  }

  function loadDefaults(list) {
    subjects = list.map((s) => ({ id: idCounter++, ...s }));
    render();
  }

  function addSubject() {
    subjects.push({ id: idCounter++, name: '', obtained: '', full: 100, count: true });
    render();
  }

  function removeSubject(id) {
    subjects = subjects.filter((s) => s.id !== id);
    render();
  }

  // Clamp any numeric text input to a finite number within [min, max].
  // Returns '' for empty/invalid input so the field can stay blank.
  function sanitizeNumber(raw, min, max) {
    if (raw === '' || raw === null || raw === undefined) return '';
    const n = Number(raw);
    if (!Number.isFinite(n)) return '';
    return Math.min(Math.max(n, min), max);
  }

  function updateField(id, field, rawValue) {
    const s = subjects.find((x) => x.id === id);
    if (!s) return;

    if (field === 'name') {
      // Cap length to stop pathological input; textContent rendering means
      // this can never be interpreted as markup regardless of content.
      s.name = String(rawValue).slice(0, 120);
    } else if (field === 'obtained') {
      s.obtained = sanitizeNumber(rawValue, 0, MAX_MARKS);
    } else if (field === 'full') {
      s.full = sanitizeNumber(rawValue, 1, MAX_MARKS);
    }
    computeTotals();
  }

  function toggleCount(id, checked) {
    const s = subjects.find((x) => x.id === id);
    if (!s) return;
    s.count = !!checked;
    computeTotals();
  }

  function render() {
    const tbody = el.subjectRows;
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    subjects.forEach((s, i) => {
      const tr = document.createElement('tr');

      const tdNo = document.createElement('td');
      tdNo.className = 'rowno';
      tdNo.textContent = String(i + 1);
      tr.appendChild(tdNo);

      const tdName = document.createElement('td');
      const nameInput = document.createElement('input');
      nameInput.className = 'subj-name';
      nameInput.type = 'text';
      nameInput.maxLength = 120;
      nameInput.autocomplete = 'off';
      nameInput.spellcheck = false;
      nameInput.placeholder = 'Subject name';
      nameInput.value = s.name;
      nameInput.addEventListener('input', (e) => updateField(s.id, 'name', e.target.value));
      tdName.appendChild(nameInput);
      tr.appendChild(tdName);

      const tdObtained = document.createElement('td');
      const obtainedInput = document.createElement('input');
      obtainedInput.className = 'num';
      obtainedInput.type = 'number';
      obtainedInput.min = '0';
      obtainedInput.max = String(MAX_MARKS);
      obtainedInput.step = 'any';
      obtainedInput.inputMode = 'decimal';
      obtainedInput.placeholder = '0';
      obtainedInput.value = s.obtained;
      obtainedInput.addEventListener('input', (e) => updateField(s.id, 'obtained', e.target.value));
      tdObtained.appendChild(obtainedInput);
      tr.appendChild(tdObtained);

      const tdFull = document.createElement('td');
      const fullInput = document.createElement('input');
      fullInput.className = 'num';
      fullInput.type = 'number';
      fullInput.min = '1';
      fullInput.max = String(MAX_MARKS);
      fullInput.step = 'any';
      fullInput.inputMode = 'decimal';
      fullInput.placeholder = '100';
      fullInput.value = s.full;
      fullInput.addEventListener('input', (e) => updateField(s.id, 'full', e.target.value));
      tdFull.appendChild(fullInput);
      tr.appendChild(tdFull);

      const tdChk = document.createElement('td');
      tdChk.className = 'chk';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = !!s.count;
      chk.setAttribute('aria-label', 'Count this subject toward the total');
      chk.addEventListener('change', (e) => toggleCount(s.id, e.target.checked));
      tdChk.appendChild(chk);
      tr.appendChild(tdChk);

      const tdRm = document.createElement('td');
      tdRm.className = 'rm';
      const rmBtn = document.createElement('button');
      rmBtn.type = 'button';
      rmBtn.className = 'rm-btn';
      rmBtn.title = 'Remove subject';
      rmBtn.setAttribute('aria-label', 'Remove subject');
      rmBtn.textContent = '\u2715';
      rmBtn.addEventListener('click', () => removeSubject(s.id));
      tdRm.appendChild(rmBtn);
      tr.appendChild(tdRm);

      tbody.appendChild(tr);
    });

    computeTotals();
  }

  function gradeFor(pct) {
    if (pct >= 90) return 'A1 \u00B7 OUTSTANDING';
    if (pct >= 80) return 'A2 \u00B7 EXCELLENT';
    if (pct >= 70) return 'B1 \u00B7 VERY GOOD';
    if (pct >= 60) return 'B2 \u00B7 GOOD';
    if (pct >= 50) return 'C1 \u00B7 FAIR';
    if (pct >= 40) return 'C2 \u00B7 PASS';
    if (pct > 0) return 'D \u00B7 NEEDS WORK';
    return '\u2014';
  }

  function computeTotals() {
    let obtained = 0;
    let full = 0;
    let hasOverMax = false;

    subjects.forEach((s) => {
      if (!s.count) return;
      const o = Number(s.obtained);
      const f = Number(s.full);
      if (Number.isFinite(o)) obtained += o;
      if (Number.isFinite(f)) full += f;
      if (Number.isFinite(o) && Number.isFinite(f) && o > f) hasOverMax = true;
    });

    const pct = full > 0 ? (obtained / full) * 100 : 0;
    const safePct = Number.isFinite(pct) ? Math.min(Math.max(pct, 0), 100) : 0;

    el.sumObtained.textContent = String(obtained);
    el.sumFull.textContent = String(full);
    el.sumPct.textContent = safePct.toFixed(2) + '%';
    el.pctBig.textContent = safePct.toFixed(1);
    const sign = document.createElement('span');
    sign.className = 'pct-sign';
    sign.textContent = '%';
    el.pctBig.appendChild(sign);
    el.gradeBig.textContent = gradeFor(safePct);

    if (el.warning) {
      el.warning.classList.toggle('show', hasOverMax);
    }
  }

  // --- Theme (light / dark) -------------------------------------------
  const THEME_KEY = 'pctcalc-theme';

  function applyTheme(t) {
    const theme = t === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    if (el.themeIcon) el.themeIcon.textContent = theme === 'dark' ? '\u2600' : '\u263D';
    if (el.themeLabel) el.themeLabel.textContent = theme === 'dark' ? 'LIGHT' : 'DARK';
    if (el.themeToggle) {
      el.themeToggle.setAttribute(
        'aria-label',
        theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
      );
    }
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      // localStorage may be unavailable (private browsing, etc.) — theme
      // just won't persist across visits, which is harmless.
    }
  }

  function initTheme() {
    let saved = null;
    try {
      saved = window.localStorage.getItem(THEME_KEY);
    } catch (e) {
      saved = null;
    }
    if (saved === 'dark' || saved === 'light') {
      applyTheme(saved);
      return;
    }
    const prefersDark = window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  // --- Mode (board mark-sheet calculator / everyday quick calculator) --
  const MODE_KEY = 'pctcalc-mode';

  function applyMode(m) {
    const mode = m === 'quick' ? 'quick' : 'board';
    el.worksheet.classList.toggle('hide', mode === 'quick');
    el.quickCalc.classList.toggle('show', mode === 'quick');
    el.quickCalc.setAttribute('aria-hidden', String(mode !== 'quick'));
    if (el.modeToggle) {
      el.modeToggle.setAttribute('aria-pressed', String(mode === 'quick'));
      el.modeToggle.setAttribute(
        'aria-label',
        mode === 'quick'
          ? 'Switch to the board mark sheet calculator'
          : 'Switch to the everyday quick percentage calculator'
      );
    }
    if (el.modeLabel) el.modeLabel.textContent = mode === 'quick' ? 'BOARD CALC' : 'QUICK CALC';
    try {
      window.localStorage.setItem(MODE_KEY, mode);
    } catch (e) {
      // localStorage may be unavailable — mode just won't persist, harmless.
    }
    if (mode === 'quick') computeQuick();
  }

  function initMode() {
    let saved = null;
    try {
      saved = window.localStorage.getItem(MODE_KEY);
    } catch (e) {
      saved = null;
    }
    applyMode(saved === 'quick' ? 'quick' : 'board');
  }

  function toggleMode() {
    const current = el.quickCalc.classList.contains('show') ? 'quick' : 'board';
    applyMode(current === 'quick' ? 'board' : 'quick');
  }

  // --- Quick calculator: the everyday "part of a whole" shortcut ------
  // (part / whole) * 100 — same idea as the board worksheet's total, just
  // for one arbitrary pair of numbers instead of a table of subjects.
  // Completely separate state from `subjects` above; nothing here affects
  // the board calculator's function.
  function computeQuick() {
    const partRaw = el.quickPart.value;
    const wholeRaw = el.quickWhole.value;
    const part = partRaw === '' ? NaN : Number(partRaw);
    const whole = wholeRaw === '' ? NaN : Number(wholeRaw);

    const validPart = Number.isFinite(part);
    const validWhole = Number.isFinite(whole) && whole !== 0;
    const pct = (validPart && validWhole) ? (part / whole) * 100 : 0;
    const safePct = Number.isFinite(pct) ? pct : 0;

    // The ring can only ever show a full circle, so its fill is clamped —
    // but the printed number below is never clamped, since an everyday
    // percentage (growth, markup, etc.) can legitimately exceed 100%.
    const ringFill = Math.min(Math.max(safePct, 0), 100);
    el.quickRing.style.setProperty('--p', String(ringFill));

    el.quickPctValue.textContent = safePct.toFixed(1);
    el.qfPart.textContent = validPart ? String(part) : '0';
    el.qfWhole.textContent = validWhole ? String(whole) : '0';
    el.qfResult.textContent = safePct.toFixed(2) + '%';
  }

  function swapQuick() {
    const p = el.quickPart.value;
    const w = el.quickWhole.value;
    el.quickPart.value = w;
    el.quickWhole.value = p;
    computeQuick();
  }

  function init() {
    cacheDom();
    initTheme();
    initMode();

    el.tabMP.addEventListener('click', () => setBoard('mp'));
    el.tabHS.addEventListener('click', () => setBoard('hs'));
    el.tabGrad.addEventListener('click', () => setBoard('grad'));

    el.quickMP.addEventListener('click', () => setBoard('mp'));
    el.quickHS.addEventListener('click', () => setBoard('hs'));
    el.quickGrad.addEventListener('click', () => setBoard('grad'));

    Object.keys(el.streamButtons).forEach((name) => {
      el.streamButtons[name].addEventListener('click', () => setStream(name));
    });
    Object.keys(el.gradButtons).forEach((name) => {
      el.gradButtons[name].addEventListener('click', () => setGradPattern(name));
    });

    el.themeToggle.addEventListener('click', toggleTheme);
    el.modeToggle.addEventListener('click', toggleMode);
    el.addBtn.addEventListener('click', addSubject);

    el.quickPart.addEventListener('input', computeQuick);
    el.quickWhole.addEventListener('input', computeQuick);
    el.quickSwap.addEventListener('click', swapQuick);

    setBoard('mp');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
