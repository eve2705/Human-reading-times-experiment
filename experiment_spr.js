const DESIGN = 'all_versions';

const INCLUDE_FILLERS = true;

const NUMBER_OF_ATTENTION_CHECKS = 4;

const CONDITIONS = ['GRLR', 'GRLU', 'GULR', 'GULU'];

const PRACTICE_PASSAGES = [
    {
        id: "practice_1",
        text: "Maria had been looking forward to her weekend. On Saturday morning, she packed her bag, picked up her cousins and drove out to the lake, where they spent the afternoon swimming and reading.",
        question: "Who went to the lake with Maria?",
        options: ["Her cousins", "Her sisters", "Her best friends", "Her coworkers"],
        correct_answer: "Her cousins"
    },
    {
        id: "practice_2",
        text: "The library closes early on Fridays. Daniel hurried over after work to return a stack of overdue books, but the door was already locked when he arrived, so he left them in the drop box outside.",
        question: "Where did Daniel leave the books?",
        options: ["In the drop box outside", "At the front desk", "In the back of his car", "On a bench by the door"],
        correct_answer: "In the drop box outside"
    },
    {
        id: "practice_3",
        text: "Every Thursday evening, Priya volunteers at the animal shelter near her apartment. Last week, a family came in looking for a dog, and they adopted a golden retriever that had been at the shelter for almost a year.",
        question: "Where does Priya volunteer?",
        options: ["At an animal shelter", "At a school", "At a hospital", "At a food bank"],
        correct_answer: "At an animal shelter"
    }
];

const FILLER_PASSAGES = [
    {
        id: "filler_1",
        text: "Every Sunday, Grandpa Joe walks to the park with a bag of bread crumbs to feed the ducks. Last week it rained all day, so instead he stayed inside and taught his granddaughter how to play chess.",
        question: "What did Grandpa Joe do on the rainy Sunday?",
        options: ["Taught his granddaughter chess", "Fed the ducks anyway", "Went grocery shopping", "Baked bread with his son"],
        correct_answer: "Taught his granddaughter chess"
    },
    {
        id: "filler_2",
        text: "The museum opened a new exhibit about ancient Egypt. Hundreds of visitors lined up on the first day to see the golden masks and painted coffins. One little boy asked the guide whether the mummies were real, and everyone around him laughed.",
        question: "What was the new exhibit about?",
        options: ["Ancient Egypt", "Dinosaurs", "Outer space", "The ocean"],
        correct_answer: "Ancient Egypt"
    },
    {
        id: "filler_3",
        text: "After months of practice, the school choir finally performed at the spring concert. Every seat in the hall was taken, and parents recorded each song on their phones. At the end, the audience stood up and applauded for several minutes.",
        question: "Who performed at the spring concert?",
        options: ["The school choir", "A rock band", "A string quartet", "A dance troupe"],
        correct_answer: "The school choir"
    },
    {
        id: "filler_4",
        text: "Sam left his umbrella at home on the one morning it poured. By the time he reached the office, his shoes were soaked and his hair was dripping.",
        question: "What had Sam left at home?",
        options: ["His umbrella", "His keys", "His lunch", "His phone"],
        correct_answer: "His umbrella"
    }
];

let experimentStartTime = null;
let consentData = {};
let practiceTrials = [];
let mainTrials = [];
let practiceIndex = 0;
let mainIndex = 0;
let current = null;
let practiceEndTime = null;
let mainStartTime = null;

const practiceResults = [];
const trialResults = [];
const wordRTs = [];
const attentionCheckResults = [];

const SCREENS = ['error-container', 'welcome-container', 'consent-container', 'instructions-container',
                 'trial-container', 'transition-container', 'feedback-container', 'completion-container'];

function getUrlParameter(name) {
    return new URLSearchParams(window.location.search).get(name);
}

function shouldDownloadData() {
    return getUrlParameter('download') === '1';
}

function downloadDataAsJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function shuffled(array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function tokenize(text) {
    return (text || '').trim().split(/\s+/).filter(Boolean);
}

function letterCount(word) {
    return word.replace(/[^\p{L}\p{N}]/gu, '').length;
}

function round1(x) {
    return Math.round(x * 10) / 10;
}

function minutesSinceStart() {
    return (Date.now() - experimentStartTime) / 60000;
}

function eventTime(e) {
    return (e.timeStamp > 0 && e.timeStamp < 1e12) ? e.timeStamp : performance.now();
}

function blurFocus() {
    if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
    }
}

function showScreen(id) {
    SCREENS.forEach(s => {
        document.getElementById(s).style.display = (s === id) ? 'block' : 'none';
    });
    if (id !== 'trial-container') {
        document.getElementById('progress').textContent = '';
    }
    blurFocus();
    window.scrollTo(0, 0);
}

function showError(message) {
    document.getElementById('error-message').textContent = message;
    showScreen('error-container');
}

function makeSimpleTrial(p, type) {
    return {
        id: p.id,
        type: type,
        family: type === 'filler' ? 'filler' : p.id,
        itemId: null, condition: null, globalRelated: null, localRelated: null,
        targetWord: null, itemName: null,
        words: tokenize(p.text).map((w, i) => ({ text: w, region: type, regionIndex: i })),
        question: p.question,
        options: p.options,
        correctAnswer: p.correct_answer
    };
}

function makeExperimentalTrial(row) {
    const words = [];
    const addRegion = (text, region) => {
        tokenize(text).forEach((w, i) => words.push({ text: w, region: region, regionIndex: i }));
    };
    addRegion(row.global_context, 'global');
    addRegion(row.local_context, 'local');
    addRegion(row.target_word + '.', 'target');
    addRegion(row.buffer_sentence, 'buffer');
    return {
        id: `${row.item_id}_${row.condition}`,
        type: 'experimental',
        family: 'item_' + row.family,
        itemId: row.item_id,
        condition: row.condition,
        globalRelated: row.global_related,
        localRelated: row.local_related,
        targetWord: row.target_word,
        itemName: row.item_name,
        words: words,
        question: row.question,
        options: row.options,
        correctAnswer: row.correct_answer
    };
}

function getListIndex() {
    const raw = getUrlParameter('list');
    if (raw === null) return 0;
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 0 || n >= CONDITIONS.length) {
        throw new Error(`Invalid list index: ${raw}. Valid range: 0-${CONDITIONS.length - 1}`);
    }
    return n;
}

function selectExperimentalRows() {
    if (DESIGN === 'all_versions') {
        return EXPERIMENT_ITEMS.slice();
    }
    if (DESIGN === 'latin_square') {
        const list = getListIndex();
        const families = [...new Set(EXPERIMENT_ITEMS.map(r => r.family))];
        const itemIds = [...new Set(EXPERIMENT_ITEMS.map(r => r.item_id))];
        return itemIds.map(id => {
            const family = EXPERIMENT_ITEMS.find(r => r.item_id === id).family;
            const condition = CONDITIONS[(families.indexOf(family) + list) % CONDITIONS.length];
            const row = EXPERIMENT_ITEMS.find(r => r.item_id === id && r.condition === condition);
            if (!row) throw new Error(`Item ${id} has no ${condition} version.`);
            return row;
        });
    }
    throw new Error(`Unknown DESIGN "${DESIGN}" (use 'all_versions' or 'latin_square').`);
}

function orderTrials(trials) {
    const counts = {};
    trials.forEach(t => { counts[t.family] = (counts[t.family] || 0) + 1; });
    if (trials.length && Math.max(...Object.values(counts)) > Math.ceil(trials.length / 2)) {
        return shuffled(trials);
    }
    for (let attempt = 0; attempt < 2000; attempt++) {
        const pool = shuffled(trials);
        const order = [];
        while (pool.length) {
            const remaining = {};
            pool.forEach(t => { remaining[t.family] = (remaining[t.family] || 0) + 1; });
            const prev = order.length ? order[order.length - 1].family : null;
            const forced = Object.keys(remaining).find(f => f !== prev && remaining[f] > pool.length / 2);
            const idx = pool.findIndex(t => forced ? t.family === forced : t.family !== prev);
            if (idx === -1) break;
            order.push(pool.splice(idx, 1)[0]);
        }
        if (order.length === trials.length) return order;
    }
    console.warn('Could not keep related passages apart; using a plain random order.');
    return shuffled(trials);
}

function buildMainTrials() {
    const experimental = selectExperimentalRows().map(makeExperimentalTrial);
    const fillers = INCLUDE_FILLERS
        ? FILLER_PASSAGES.slice(0, NUMBER_OF_ATTENTION_CHECKS).map(p => makeSimpleTrial(p, 'filler'))
        : [];
    return orderTrials(experimental.concat(fillers));
}

function checkTrials(trials) {
    trials.forEach(t => {
        if (!t.options || t.options.length < 2 || !t.options.includes(t.correctAnswer)) {
            throw new Error(`Passage ${t.id}: its correct answer must be one of its options.`);
        }
        if (!t.words.length) throw new Error(`Passage ${t.id} has no text.`);
    });
}

function showConsent() {
    showScreen('consent-container');
}

function handleConsent() {
    consentData = {
        future_research_consent: document.querySelector('input[name="future_research_consent"]:checked').value,
        github_repo_consent: document.querySelector('input[name="github_repo_consent"]:checked').value,
        timestamp: new Date().toISOString()
    };
    showScreen('instructions-container');
}

function startPractice() {
    practiceIndex = 0;
    showScreen('trial-container');
    startTrial(practiceTrials[0], 'practice', 1, practiceTrials.length);
}

function showTransition() {
    current = null;
    practiceEndTime = minutesSinceStart();
    showScreen('transition-container');
}

function startMain() {
    mainStartTime = minutesSinceStart();
    mainIndex = 0;
    showScreen('trial-container');
    startTrial(mainTrials[0], 'main', 1, mainTrials.length);
}

function showFeedbackForm() {
    current = null;
    showScreen('feedback-container');
}

function startTrial(trial, phase, number, total) {
    current = {
        trial: trial,
        phase: phase,
        number: number,
        stage: 'reading',
        revealed: 0,
        pressTimes: [],
        displayTime: null,
        displayedOptions: shuffled(trial.options),
        selected: null,
        stageChangedAt: 0
    };
    document.getElementById('progress').textContent = (phase === 'practice')
        ? `Practice passage ${number} of ${total}`
        : `Passage ${number} of ${total}`;
    renderPassage(trial.words);
    document.getElementById('question-screen').style.display = 'none';
    document.getElementById('reading-screen').style.display = 'block';
    blurFocus();
    current.displayTime = performance.now();
}

function renderPassage(words) {
    const box = document.getElementById('passage');
    box.innerHTML = '';
    words.forEach((w, i) => {
        if (i > 0) box.appendChild(document.createTextNode(' '));
        const span = document.createElement('span');
        span.className = 'word masked';
        span.id = 'word-' + i;
        span.textContent = w.text;
        box.appendChild(span);
    });
}

function handleKeydown(e) {
    const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
    if (!isSpace || !current) return;
    e.preventDefault();
    if (current.stage !== 'reading' || e.repeat) return;
    handleSpacePress(eventTime(e));
}

function handleSpacePress(t) {
    const c = current;
    c.pressTimes.push(t);
    if (c.revealed < c.trial.words.length) {
        document.getElementById('word-' + c.revealed).classList.remove('masked');
        c.revealed++;
    } else {
        finishReading();
    }
}

function finishReading() {
    const c = current;
    const p = c.pressTimes;
    c.wordRTs = c.trial.words.map((w, i) => p[i + 1] - p[i]);
    c.firstPressLatency = p[0] - c.displayTime;
    c.totalReadingTime = p[p.length - 1] - p[0];
    document.getElementById('reading-screen').style.display = 'none';
    showQuestion();
}

function showQuestion() {
    const c = current;
    c.stage = 'question';
    c.stageChangedAt = performance.now();
    document.getElementById('question-text').textContent = c.trial.question;
    const list = document.getElementById('options');
    list.innerHTML = '';
    c.displayedOptions.forEach(option => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option-btn';
        btn.textContent = option;
        btn.addEventListener('click', () => selectOption(btn, option));
        list.appendChild(btn);
    });
    const continueBtn = document.getElementById('question-continue-btn');
    continueBtn.textContent = 'Continue';
    continueBtn.disabled = true;
    document.getElementById('practice-feedback').style.display = 'none';
    document.getElementById('question-screen').style.display = 'block';
    blurFocus();
    c.questionOnset = performance.now();
}

function selectOption(btn, option) {
    if (!current || current.stage !== 'question') return;
    current.selected = option;
    document.querySelectorAll('.option-btn').forEach(b => b.classList.toggle('selected', b === btn));
    document.getElementById('question-continue-btn').disabled = false;
}

function handleQuestionContinue() {
    const c = current;
    if (!c) return;
    if (performance.now() - c.stageChangedAt < 400) return;
    if (c.stage === 'question') {
        if (c.selected === null) return;
        c.questionRT = performance.now() - c.questionOnset;
        c.correct = (c.selected === c.trial.correctAnswer);
        recordTrial();
        if (c.phase === 'practice') {
            showPracticeFeedback();
        } else {
            nextTrial();
        }
    } else if (c.stage === 'feedback') {
        nextTrial();
    }
}

function showPracticeFeedback() {
    const c = current;
    c.stage = 'feedback';
    c.stageChangedAt = performance.now();
    document.querySelectorAll('.option-btn').forEach(b => {
        b.disabled = true;
        if (b.textContent === c.trial.correctAnswer) {
            b.classList.add('correct-answer');
        } else if (b.classList.contains('selected')) {
            b.classList.add('wrong-answer');
        }
    });
    const isLast = practiceIndex === practiceTrials.length - 1;
    const buttonLabel = isLast ? 'Finish practice' : 'Next passage';
    const box = document.getElementById('practice-feedback');
    box.innerHTML = '';
    const verdict = document.createElement('strong');
    const message = document.createElement('span');
    if (c.correct) {
        box.className = 'feedback-box good';
        verdict.textContent = 'Correct!';
        message.textContent = '';
    } else {
        box.className = 'feedback-box bad';
        verdict.textContent = 'Not quite.';
        message.textContent = ' Remember to read each passage carefully.';
    }
    box.appendChild(verdict);
    box.appendChild(message);
    box.style.display = 'block';
    const continueBtn = document.getElementById('question-continue-btn');
    continueBtn.textContent = buttonLabel;
    continueBtn.disabled = false;
    blurFocus();
}

function nextTrial() {
    if (current.phase === 'practice') {
        practiceIndex++;
        if (practiceIndex < practiceTrials.length) {
            startTrial(practiceTrials[practiceIndex], 'practice', practiceIndex + 1, practiceTrials.length);
        } else {
            showTransition();
        }
    } else {
        mainIndex++;
        if (mainIndex < mainTrials.length) {
            startTrial(mainTrials[mainIndex], 'main', mainIndex + 1, mainTrials.length);
        } else {
            showFeedbackForm();
        }
    }
}

function recordTrial() {
    const c = current;
    const t = c.trial;
    const targetIndex = t.words.findIndex(w => w.region === 'target');
    const hasTarget = targetIndex >= 0;

    const row = {
        phase: c.phase,
        trial_number: c.number,
        trial_type: t.type,
        passage_id: t.id,
        item_id: t.itemId,
        family: t.type === 'experimental' ? t.family.replace(/^item_/, '') : null,
        condition: t.condition,
        global_related: t.globalRelated,
        local_related: t.localRelated,
        target_word: t.targetWord,
        item_name: t.itemName,
        is_attention_check: t.type === 'filler',
        passage: t.words.map(w => w.text).join(' '),
        n_words: t.words.length,
        target_word_index: hasTarget ? targetIndex : null,
        target_rt_ms: hasTarget ? round1(c.wordRTs[targetIndex]) : null,
        spillover_rt_ms: (hasTarget && targetIndex + 1 < t.words.length) ? round1(c.wordRTs[targetIndex + 1]) : null,
        first_press_latency_ms: round1(c.firstPressLatency),
        total_reading_time_ms: round1(c.totalReadingTime),
        question: t.question,
        options_displayed: c.displayedOptions.join(' | '),
        correct_answer: t.correctAnswer,
        response: c.selected,
        response_position: c.displayedOptions.indexOf(c.selected) + 1,
        correct: c.correct,
        question_rt_ms: round1(c.questionRT),
        timestamp: new Date().toISOString(),
        time_in_minutes: minutesSinceStart()
    };
    (c.phase === 'practice' ? practiceResults : trialResults).push(row);

    t.words.forEach((w, i) => {
        wordRTs.push({
            phase: c.phase,
            trial_number: c.number,
            trial_type: t.type,
            passage_id: t.id,
            item_id: t.itemId,
            condition: t.condition,
            word_index: i,
            word: w.text,
            region: w.region,
            region_word_index: w.regionIndex,
            position_from_target: hasTarget ? i - targetIndex : null,
            word_length: letterCount(w.text),
            rt_ms: round1(c.wordRTs[i])
        });
    });

    if (t.type === 'filler') {
        attentionCheckResults.push({
            attention_check_number: attentionCheckResults.length + 1,
            passage_id: t.id,
            trial_number: c.number,
            passed: c.correct,
            response: c.selected,
            correct_answer: t.correctAnswer
        });
    }
}

function submitData() {
    const button = document.getElementById('submit-feedback-btn');
    if (button.disabled) return;
    button.disabled = true;

    const experimental = trialResults.filter(r => r.trial_type === 'experimental');
    const experimentData = {
        "consent_data": consentData,
        "practice_trials": practiceResults,
        "trials": trialResults,
        "word_rts": wordRTs,
        "attention_checks": attentionCheckResults,
        "feedback": document.getElementById('feedback-text').value.trim(),
        "experiment_info": {
            "design": DESIGN,
            "include_fillers": INCLUDE_FILLERS,
            "list_index": getUrlParameter('list'),
            "n_practice_passages": practiceResults.length,
            "n_main_passages": trialResults.length,
            "n_experimental_passages": experimental.length,
            "n_filler_passages": trialResults.length - experimental.length,
            "experimental_question_accuracy": experimental.length
                ? experimental.filter(r => r.correct).length / experimental.length : null,
            "attention_checks_passed": attentionCheckResults.filter(r => r.passed).length,
            "attention_checks_total": attentionCheckResults.length,
            "practice_end_time_in_minutes": practiceEndTime,
            "main_start_time_in_minutes": mainStartTime,
            "experiment_duration_minutes": minutesSinceStart(),
            "completion_time": new Date().toISOString()
        }
    };

    if (shouldDownloadData()) {
        downloadDataAsJson(experimentData, 'trial_responses.json');
    }

    try {
        if (typeof proliferate !== 'undefined') {
            proliferate.submit(experimentData);
        } else {
            console.log('Proliferate not available, logging data to console:', experimentData);
        }
    } catch (error) {
        console.error('Proliferate submission failed:', error);
    }

    showScreen('completion-container');
}

function initExperiment() {
    try {
        if (typeof EXPERIMENT_ITEMS === 'undefined' || !EXPERIMENT_ITEMS.length) {
            throw new Error('No experimental passages found. Is stimuli_spr.js in the same folder as index.html?');
        }
        practiceTrials = PRACTICE_PASSAGES.map(p => makeSimpleTrial(p, 'practice'));
        mainTrials = buildMainTrials();
        checkTrials(practiceTrials.concat(mainTrials));
    } catch (error) {
        console.error('Error loading the experiment:', error);
        showError(error.message);
        return;
    }
    experimentStartTime = Date.now();

    document.querySelectorAll('.n-practice').forEach(el => { el.textContent = practiceTrials.length; });
    const nPassages = document.getElementById('n-passages');
    if (nPassages) nPassages.textContent = mainTrials.length;

    document.addEventListener('keydown', handleKeydown);
    document.getElementById('welcome-btn').addEventListener('click', showConsent);
    document.getElementById('consent-btn').addEventListener('click', handleConsent);
    document.getElementById('start-practice-btn').addEventListener('click', startPractice);
    document.getElementById('question-continue-btn').addEventListener('click', handleQuestionContinue);
    document.getElementById('start-main-btn').addEventListener('click', startMain);
    document.getElementById('submit-feedback-btn').addEventListener('click', submitData);

    console.log(`Loaded ${mainTrials.length} passages (${DESIGN}):`, mainTrials.map(t => t.id).join(', '));
    showScreen('welcome-container');
}

document.addEventListener('DOMContentLoaded', initExperiment);
