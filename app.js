const storeKey = "networkQuizSystem.v3";
const accessPassword = "赵喆";
const authSessionKey = "networkQuizSystem.authenticated";

const state = {
  banks: [],
  selectedBankIds: new Set(),
  filter: "all",
  recordView: "all",
  mode: "practice",
  index: 0,
  selected: new Set(),
  submitted: false,
  examFinished: false,
  examResult: null,
  examAnswers: {},
  examQuestionIds: null,
  shuffledIds: null,
  optionsShuffled: false,
  optionShuffleMaps: {},
  keepVisibleId: null,
  keepVisibleIds: new Set(),
  sessionCard: {},
  collapsedGroups: new Set(),
  progress: loadProgress(),
};

function loadProgress() {
  const empty = { wrong: {}, favorites: {}, attempts: {} };
  try {
    return { ...empty, ...(JSON.parse(localStorage.getItem(storeKey)) || {}) };
  } catch {
    return empty;
  }
}

function saveProgress() {
  localStorage.setItem(storeKey, JSON.stringify(state.progress));
}

function unlockApp() {
  document.body.classList.remove("auth-locked");
  document.querySelector("#authGate").classList.add("hidden");
  document.querySelector(".app").removeAttribute("aria-hidden");
}

function requireAuth() {
  if (sessionStorage.getItem(authSessionKey) === "yes") {
    unlockApp();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const form = document.querySelector("#authForm");
    const input = document.querySelector("#authPassword");
    const error = document.querySelector("#authError");
    const toggle = document.querySelector("#toggleAuthPassword");
    toggle.addEventListener("click", () => {
      const masked = input.classList.toggle("masked");
      toggle.textContent = masked ? "显示" : "隐藏";
    });
    input.focus();
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (input.value.trim() === accessPassword) {
        sessionStorage.setItem(authSessionKey, "yes");
        input.value = "";
        error.classList.add("hidden");
        unlockApp();
        resolve();
        return;
      }
      error.classList.remove("hidden");
      input.select();
    });
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeAnswer(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[，、；;\s]+/g, "")
    .replace(/[^A-Z0-9.-]/g, "");
}

function normalizeTextAnswer(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[，,。．.、；;：:\s"'“”‘’（）()【】\[\]<>《》]/g, "");
}

function answerVariants(answer) {
  const raw = String(answer || "").trim();
  const parts = raw.split(/\s*(?:\/|\\|\||；|;|或|或者)\s*/).filter(Boolean);
  return parts.length ? parts : [raw];
}

function isAnswerCorrect(question, userAnswer) {
  if (!question.hasAnswer) return false;
  if (question.options.length) {
    const correctAnswer = displayedAnswerLabels(question).join("");
    return normalizeAnswer(userAnswer) === normalizeAnswer(correctAnswer);
  }
  const normalizedUser = normalizeTextAnswer(userAnswer);
  if (!normalizedUser) return false;
  return answerVariants(question.answer).some((answer) => normalizeTextAnswer(answer) === normalizedUser);
}

function answerLabels(question) {
  return normalizeAnswer(question.answer).split("").filter(Boolean);
}

function optionLabels(question) {
  return question.options.map((option) => option.label);
}

function optionMapFor(question) {
  const labels = optionLabels(question);
  const mapped = state.optionShuffleMaps[question.id];
  if (!state.optionsShuffled || !mapped || mapped.length !== labels.length) return labels;
  return mapped;
}

function displayedOptions(question) {
  const labels = optionLabels(question);
  const byOriginalLabel = new Map(question.options.map((option) => [option.label, option]));
  const map = optionMapFor(question);
  return labels.map((displayLabel, index) => {
    const original = byOriginalLabel.get(map[index]) || question.options[index];
    return {
      label: displayLabel,
      originalLabel: original.label,
      text: original.text,
      images: original.images || [],
    };
  });
}

function mediaList(items) {
  return Array.isArray(items) ? items.filter(Boolean) : [];
}

function renderImages(container, images, className = "question-images") {
  const list = mediaList(images);
  if (!list.length) return;
  const wrap = document.createElement("div");
  wrap.className = className;
  list.forEach((src, index) => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = `题图 ${index + 1}`;
    img.loading = "lazy";
    wrap.appendChild(img);
  });
  container.appendChild(wrap);
}

function renderImageAttachments(container, images) {
  const list = mediaList(images);
  if (!list.length) return;
  const details = document.createElement("details");
  details.className = "image-attachments";
  details.innerHTML = `<summary>查看原题图片（${list.length} 张）</summary>`;
  renderImages(details, list);
  container.appendChild(details);
}

function bankGroupName(bank) {
  if (/植物生理学/.test(bank.title) || /植物生理学/.test(bank.fileName || "")) return "植物生理学";
  if (/编译原理/.test(bank.title) || /编译原理/.test(bank.fileName || "")) return "编译原理";
  if (/数据库/.test(bank.title) || /数据库/.test(bank.fileName || "")) return "数据库系统";
  if (/计算机网络/.test(bank.title) || /计算机网络/.test(bank.fileName || "")) return "计算机网络";
  return "其他题库";
}

function displayedAnswerLabels(question) {
  if (!question.options.length) return answerLabels(question);
  const originals = new Set(answerLabels(question));
  return displayedOptions(question)
    .filter((option) => originals.has(option.originalLabel))
    .map((option) => option.label);
}

function isMulti(question) {
  return question.type.includes("多选") || displayedAnswerLabels(question).length > 1;
}

function allQuestions() {
  return state.banks.flatMap((bank) =>
    bank.questions.map((question) => ({ ...question, bankId: bank.id, bankTitle: bank.title }))
  );
}

function currentQuestions() {
  let questions = allQuestions().filter((question) => state.selectedBankIds.has(question.bankId));
  if (state.filter === "wrong") {
    questions = questions.filter((question) => state.progress.wrong[question.id] || state.keepVisibleIds.has(question.id));
  }
  if (state.filter === "favorite") {
    questions = questions.filter((question) => state.progress.favorites[question.id] || state.keepVisibleIds.has(question.id));
  }
  if (state.shuffledIds) {
    const byId = new Map(questions.map((question) => [question.id, question]));
    const ordered = state.shuffledIds.map((id) => byId.get(id)).filter(Boolean);
    const remaining = questions.filter((question) => !state.shuffledIds.includes(question.id));
    questions = [...ordered, ...remaining];
  }
  if (state.mode === "exam" && state.examQuestionIds) {
    const byId = new Map(questions.map((question) => [question.id, question]));
    questions = state.examQuestionIds.map((id) => byId.get(id)).filter(Boolean);
  }
  return questions;
}

function currentQuestion() {
  return currentQuestions()[state.index];
}

function isObjectiveQuestion(question) {
  return question && question.options && question.options.length > 0;
}

function isMajorQuestion(question) {
  return question && /SQL|分析|设计/.test(question.type || "");
}

function shouldUseListView(question) {
  return state.mode !== "exam" && isMajorQuestion(question);
}

function needsWrittenAnswer(question) {
  return question && !isObjectiveQuestion(question);
}

function currentListQuestions(questions) {
  if (!questions.length) return [];
  const start = state.index;
  const currentType = questions[start]?.type || "";
  if (!isMajorQuestion(questions[start])) return [];
  return questions.slice(start).filter((question) => isMajorQuestion(question) && question.type === currentType);
}

function resetRun(keepExam = false) {
  state.index = 0;
  state.selected = new Set();
  state.submitted = false;
  state.shuffledIds = null;
  state.optionsShuffled = false;
  state.optionShuffleMaps = {};
  state.keepVisibleId = null;
  state.keepVisibleIds.clear();
  state.sessionCard = {};
  if (!keepExam) {
    state.examFinished = false;
    state.examResult = null;
    state.examAnswers = {};
    state.examQuestionIds = null;
  }
  document.querySelector("#fillAnswer").value = "";
}

function resetPosition(keepExam = false) {
  state.index = 0;
  state.selected = new Set();
  state.submitted = false;
  state.keepVisibleId = null;
  state.keepVisibleIds.clear();
  if (!keepExam) {
    state.examFinished = false;
    state.examResult = null;
    state.examAnswers = {};
    state.examQuestionIds = null;
  }
  document.querySelector("#fillAnswer").value = "";
}

function setMode(mode) {
  state.keepVisibleId = null;
  state.keepVisibleIds.clear();
  state.mode = mode;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  resetPosition();
  if (mode === "exam") applyExamQuestionLimit();
  render();
}

function requestedExamSize() {
  const value = Number.parseInt(document.querySelector("#examSizeInput").value, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function baseExamQuestions() {
  const saved = state.examQuestionIds;
  state.examQuestionIds = null;
  const questions = currentQuestions();
  state.examQuestionIds = saved;
  return questions;
}

function applyExamQuestionLimit() {
  const questions = baseExamQuestions();
  const size = requestedExamSize();
  const limited = size ? shuffleArray(questions).slice(0, Math.min(size, questions.length)) : questions;
  state.examQuestionIds = limited.map((question) => question.id);
  state.index = 0;
  state.selected = new Set();
  state.submitted = false;
  state.examFinished = false;
  state.examResult = null;
  state.examAnswers = {};
  document.querySelector("#fillAnswer").value = "";
}

function render() {
  renderBanks();
  renderRecords();
  renderExamResult();

  ensureListView();
  const questions = currentQuestions();
  if (state.index >= questions.length) state.index = Math.max(0, questions.length - 1);
  const question = questions[state.index];
  const listMode = shouldUseListView(question);
  document.querySelectorAll(".stem-media").forEach((item) => item.remove());

  document.querySelector("#progressText").textContent = `${questions.length ? state.index + 1 : 0} / ${questions.length}`;
  document.querySelector("#scoreText").textContent = `错题 ${Object.keys(state.progress.wrong).length} · 收藏 ${Object.keys(state.progress.favorites).length}`;
  document.querySelector("#shuffleBtn").disabled = questions.length < 2;
  document.querySelector("#shuffleBtn").textContent = state.shuffledIds ? "题序已随机" : "随机题序";
  document.querySelector("#shuffleOptionsBtn").disabled = !questions.some((item) => item.options.length > 1);
  document.querySelector("#shuffleOptionsBtn").textContent = state.optionsShuffled ? "选项已随机" : "随机选项内容";
  document.querySelector("#wrongCount").textContent = Object.keys(state.progress.wrong).length;
  document.querySelector("#favoriteCount").textContent = Object.keys(state.progress.favorites).length;
  document.querySelector(".exam-size-control").classList.toggle("hidden", state.mode !== "exam");
  document.querySelectorAll(".quick-card").forEach((button) => button.classList.toggle("active", button.dataset.filter === state.recordView));
  document.querySelectorAll(".scope-card, .quick-card").forEach((button) => button.classList.toggle("scope-active", button.dataset.filter === state.filter));
  document.querySelector("#listView").classList.toggle("hidden", !listMode);

  if (!question) {
    document.querySelector(".actions").classList.remove("hidden");
    const hasSelectedBank = state.selectedBankIds.size > 0;
    document.querySelector("#questionMeta").textContent = hasSelectedBank ? "暂无题目" : "请选择题库";
    document.querySelector("#questionStem").textContent = hasSelectedBank ? "当前范围下没有题目。" : "请先在左侧选择一个或多个题库开始练习。";
    document.querySelector("#options").innerHTML = "";
    document.querySelector("#listView").innerHTML = "";
    document.querySelector("#feedback").classList.add("hidden");
    document.querySelector("#fillWrap").classList.add("hidden");
    document.querySelector("#favoriteBtn").disabled = true;
    renderQuestionCard(questions);
    renderActions(null, 0);
    return;
  }

  if (listMode) {
    const listQuestions = currentListQuestions(questions);
    document.querySelector("#questionMeta").textContent = `${question.bankTitle} · ${question.type}题单`;
    document.querySelector("#questionStem").textContent = "当前是主观题，已切换为题单复习；选择题和判断题仍按原来的答题模式显示。";
    document.querySelector("#favoriteBtn").disabled = true;
    document.querySelector("#options").innerHTML = "";
    document.querySelector("#feedback").classList.add("hidden");
    document.querySelector("#fillWrap").classList.add("hidden");
    renderListView(listQuestions);
    renderQuestionCard(questions);
    renderActions(question, questions.length);
    document.querySelector(".actions").classList.remove("hidden");
    return;
  }
  document.querySelector(".actions").classList.remove("hidden");

  document.querySelector("#questionMeta").innerHTML = `${escapeHtml(question.bankTitle)} · 第 ${question.number} 题 · ${escapeHtml(question.type)}${question.score ? ` · ${question.score} 分` : ""}${teacherBadge(question)}`;
  const stem = document.querySelector("#questionStem");
  stem.textContent = question.stem;
  const stemMedia = document.createElement("div");
  stemMedia.className = "stem-media";
  renderImages(stemMedia, question.images);
  if (stemMedia.childElementCount) stem.after(stemMedia);
  document.querySelector("#favoriteBtn").textContent = state.progress.favorites[question.id] ? "★" : "☆";
  document.querySelector("#favoriteBtn").disabled = false;

  renderOptions(question);
  renderFeedback(question);
  renderQuestionCard(questions);
  renderActions(question, questions.length);
}

function ensureListView() {
  if (document.querySelector("#listView")) return;
  const feedback = document.querySelector("#feedback");
  if (!feedback) return;
  const list = document.createElement("div");
  list.id = "listView";
  list.className = "list-view hidden";
  feedback.after(list);
}

function renderListView(questions) {
  const list = document.querySelector("#listView");
  list.innerHTML = "";
  const grouped = questions.reduce((result, question) => {
    const key = question.type || "题目";
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(question);
    return result;
  }, new Map());

  grouped.forEach((items, type) => {
    const section = document.createElement("section");
    section.className = "question-list-section";
    section.innerHTML = `<div class="list-section-title"><strong>${escapeHtml(type)}</strong><span>${items.length} 题</span></div>`;
    items.forEach((question) => section.appendChild(renderListQuestion(question)));
    list.appendChild(section);
  });
}

function renderListQuestion(question) {
  const article = document.createElement("article");
  article.className = `list-question ${/分析|设计/.test(question.type || "") ? "major-question" : ""}`;
  article.id = `question-${question.id}`;

  const head = document.createElement("div");
  head.className = "list-question-head";
  head.innerHTML = `
    <span>${question.number}</span>
    <div class="list-stem">${formatStudyText(question.stem)}</div>
    <button class="mini-btn" type="button">${state.progress.favorites[question.id] ? "取消收藏" : "收藏"}</button>
  `;
  head.querySelector("button").addEventListener("click", () => {
    if (state.progress.favorites[question.id]) delete state.progress.favorites[question.id];
    else state.progress.favorites[question.id] = { at: Date.now() };
    saveProgress();
    render();
  });
  article.appendChild(head);
  if (/分析|设计|SQL/.test(question.type || "")) renderImageAttachments(article, question.images);
  else renderImages(article, question.images);

  if (question.options.length) {
    const options = document.createElement("div");
    options.className = "list-options";
    question.options.forEach((option) => {
      const row = document.createElement("div");
      row.className = "list-option";
      row.innerHTML = `<span>${escapeHtml(option.label)}</span><em>${escapeHtml(option.text)}</em>`;
      renderImages(row, option.images, "option-images");
      options.appendChild(row);
    });
    article.appendChild(options);
  }

  if (state.mode === "memorize") {
    article.appendChild(renderListAnswer(question));
  } else {
    const answerArea = document.createElement("div");
    answerArea.className = "list-write";
    answerArea.innerHTML = `
      <textarea placeholder="在这里写下你的作答内容"></textarea>
      <button class="soft mini-answer-btn" type="button">看答案</button>
    `;
    answerArea.querySelector("button").addEventListener("click", () => {
      if (answerArea.querySelector(".list-answer")) return;
      state.sessionCard[question.id] = "answered";
      answerArea.appendChild(renderListAnswer(question));
      renderQuestionCard(currentQuestions());
    });
    article.appendChild(answerArea);
  }

  return article;
}

function renderListAnswer(question) {
  const answer = document.createElement("div");
  answer.className = "list-answer";
  const notice = question.answerNotice ? `<div class="answer-notice">${formatStudyText(question.answerNotice)}</div>` : "";
  answer.innerHTML = `${notice}<strong>参考答案</strong><div class="answer-body">${formatStudyText(question.answer || "暂无答案")}</div>${question.explanation && question.explanation !== question.answer ? `<div class="answer-note">${formatStudyText(question.explanation)}</div>` : ""}`;
  renderImages(answer, question.answerImages);
  renderImages(answer, question.explanationImages);
  return answer;
}

function formatStudyText(value) {
  return escapeHtml(value)
    .replace(/\r?\n/g, "<br>")
    .replace(/\s+(?=(?:[一二三四五六七八九十]+、|\d+[、.．]|[A-Z]．|[A-Z]\.|[ABCDEF]、|①|②|③|④|⑤|⑥|⑦|⑧|⑨|要求|例如|答题要点|答：))/g, "<br>")
    .replace(/(?<!<br>)(?=(?:[ABCDEF]．|[ABCDEF]、|①|②|③|④|⑤|⑥|⑦|⑧|⑨))/g, "<br>")
    .replace(/；/g, "；<br>");
}

function teacherBadge(question) {
  return question.answerNotice && /^老师解读：/.test(question.answerNotice) ? `<span class="teacher-badge">老师解读</span>` : "";
}

function renderBanks() {
  const list = document.querySelector("#bankList");
  list.innerHTML = "";
  const groups = state.banks.reduce((result, bank) => {
    const group = bankGroupName(bank);
    if (!result.has(group)) result.set(group, []);
    result.get(group).push(bank);
    return result;
  }, new Map());

  groups.forEach((banks, group) => {
    const selectedCount = banks.filter((bank) => state.selectedBankIds.has(bank.id)).length;
    const questionCount = banks.reduce((sum, bank) => sum + bank.questionCount, 0);
    const collapsed = state.collapsedGroups.has(group);
    const section = document.createElement("section");
    section.className = `bank-group ${collapsed ? "collapsed" : ""}`;

    const header = document.createElement("button");
    header.className = "bank-group-head";
    header.type = "button";
    header.innerHTML = `
      <span class="bank-group-arrow">${collapsed ? "›" : "⌄"}</span>
      <strong>${escapeHtml(group)}</strong>
      <em>${selectedCount}/${banks.length} 已选 · ${questionCount} 题</em>
    `;
    header.addEventListener("click", () => {
      if (state.collapsedGroups.has(group)) state.collapsedGroups.delete(group);
      else state.collapsedGroups.add(group);
      renderBanks();
    });
    section.appendChild(header);

    const body = document.createElement("div");
    body.className = "bank-group-body";
    banks.forEach((bank) => {
      const button = document.createElement("button");
      button.className = `bank-card ${state.selectedBankIds.has(bank.id) ? "active" : ""}`;
      button.innerHTML = `<strong>${escapeHtml(bank.title)}</strong><span>${bank.questionCount} 题 · ${bank.answeredCount} 题有答案</span>`;
      button.addEventListener("click", () => {
        if (state.selectedBankIds.has(bank.id)) {
          state.selectedBankIds.delete(bank.id);
        } else {
          state.selectedBankIds.add(bank.id);
        }
        resetRun();
        render();
      });
      body.appendChild(button);
    });
    section.appendChild(body);
    list.appendChild(section);
  });

  const total = state.banks.reduce((sum, bank) => sum + bank.questionCount, 0);
  document.querySelector("#bankSummary").textContent = `${state.banks.length} 个题库，共 ${total} 题`;
  document.querySelector("#selectedCount").textContent = `${state.selectedBankIds.size} 个已选`;
}

function shuffleCurrentQuestions() {
  state.keepVisibleId = null;
  state.keepVisibleIds.clear();
  const questions = currentQuestions();
  if (questions.length < 2) return;
  const ids = questions.map((question) => question.id);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  }
  if (ids.every((id, index) => id === questions[index].id)) {
    ids.push(ids.shift());
  }
  state.shuffledIds = ids;
  resetPosition();
  render();
}

function shuffleArray(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  if (result.length > 1 && result.every((value, index) => value === values[index])) {
    result.push(result.shift());
  }
  return result;
}

function shuffleCurrentOptions() {
  const questions = currentQuestions();
  const maps = {};
  questions.forEach((question) => {
    if (question.options.length > 1) maps[question.id] = shuffleArray(optionLabels(question));
  });
  if (!Object.keys(maps).length) return;
  state.optionsShuffled = true;
  state.optionShuffleMaps = maps;
  state.selected = new Set();
  state.submitted = false;
  if (state.mode === "exam") {
    state.examAnswers = {};
    state.examFinished = false;
    state.examResult = null;
    state.examQuestionIds = null;
    applyExamQuestionLimit();
  }
  document.querySelector("#fillAnswer").value = "";
  render();
}

function renderRecords() {
  const list = document.querySelector("#recordList");
  const wrongIds = Object.keys(state.progress.wrong);
  const favoriteIds = Object.keys(state.progress.favorites);
  const ids = state.recordView === "wrong" ? wrongIds : state.recordView === "favorite" ? favoriteIds : [...new Set([...wrongIds, ...favoriteIds])];
  const questionsById = new Map(allQuestions().map((question) => [question.id, question]));
  const records = ids.map((id) => questionsById.get(id)).filter(Boolean);

  document.querySelector("#recordTitle").textContent = state.recordView === "wrong" ? "错题本" : state.recordView === "favorite" ? "收藏夹" : "题目本";
  document.querySelector("#showAllRecords").textContent = state.recordView === "all" ? "全部" : "返回";
  list.innerHTML = "";

  if (!records.length) {
    list.innerHTML = `<div class="empty">还没有记录</div>`;
    return;
  }

  records.forEach((question) => {
    const row = document.createElement("div");
    const marks = [
      state.progress.wrong[question.id] ? "错题" : "",
      state.progress.favorites[question.id] ? "收藏" : "",
    ].filter(Boolean).join(" · ");
    row.className = "record-item";
    row.innerHTML = `
      <button class="record-open" type="button">
        <span>${escapeHtml(marks)}</span>
        <strong>${escapeHtml(question.bankTitle)} · 第 ${question.number} 题</strong>
        <em>${escapeHtml(question.stem)}</em>
      </button>
      <div class="record-tools">
        ${state.progress.wrong[question.id] ? `<button class="record-delete" data-kind="wrong" data-id="${question.id}" type="button">删错题</button>` : ""}
        ${state.progress.favorites[question.id] ? `<button class="record-delete" data-kind="favorite" data-id="${question.id}" type="button">删收藏</button>` : ""}
      </div>
    `;
    row.querySelector(".record-open").addEventListener("click", () => jumpToQuestion(question.id, true));
    row.querySelectorAll(".record-delete").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        removeRecord(button.dataset.id, button.dataset.kind);
      });
    });
    list.appendChild(row);
  });
}

function removeRecord(id, kind) {
  if (kind === "wrong") delete state.progress.wrong[id];
  if (kind === "favorite") delete state.progress.favorites[id];
  saveProgress();
  if (state.keepVisibleId === id) state.keepVisibleId = null;
  state.keepVisibleIds.delete(id);
  const questions = currentQuestions();
  if (state.index >= questions.length) state.index = Math.max(0, questions.length - 1);
  render();
}

function renderOptions(question) {
  const wrap = document.querySelector("#options");
  wrap.innerHTML = "";
  const fillWrap = document.querySelector("#fillWrap");
  const answerBox = document.querySelector("#fillAnswer");
  const showWrittenBox = state.mode !== "memorize" && needsWrittenAnswer(question);
  fillWrap.classList.toggle("hidden", !showWrittenBox);
  fillWrap.classList.toggle("essay-wrap", showWrittenBox && !/填空/.test(question.type || ""));
  answerBox.placeholder = /填空/.test(question.type || "") ? "输入你的答案" : "在这里写下你的作答内容";

  displayedOptions(question).forEach((option) => {
    const button = document.createElement("button");
    const selected = state.selected.has(option.label);
    const labels = displayedAnswerLabels(question);
    let status = "";
    if ((state.submitted || state.mode === "memorize") && question.hasAnswer) {
      if (labels.includes(option.label)) status = "correct";
      else if (selected) status = "wrong";
    }
    button.className = `option ${selected ? "selected" : ""} ${status}`;
    const content = document.createElement("span");
    content.className = "option-content";
    const text = document.createElement("span");
    text.className = "option-text";
    text.innerHTML = formatStudyText(option.text);
    content.appendChild(text);
    renderImages(content, option.images, "option-images");
    button.innerHTML = `<span class="label">${option.label}</span>`;
    button.appendChild(content);
    button.addEventListener("click", () => chooseOption(question, option.label));
    wrap.appendChild(button);
  });
}

function questionCardStatus(question) {
  if (state.mode === "exam") {
    if (state.examFinished && state.examResult) {
      const item = state.examResult.review.find((reviewItem) => reviewItem.id === question.id);
      if (!item || !question.hasAnswer) return "neutral";
      return item.correct ? "correct" : "wrong";
    }
    return state.examAnswers[question.id] ? "answered" : "empty";
  }
  if (state.mode === "practice") {
    return state.sessionCard[question.id] || "empty";
  }
  return "empty";
}

function jumpByIndex(index) {
  const question = currentQuestion();
  if (state.mode === "exam" && question) state.examAnswers[question.id] = getUserAnswer(question);
  state.keepVisibleId = null;
  state.keepVisibleIds.clear();
  state.index = index;
  const next = currentQuestion();
  const nextAnswer = state.mode === "exam" && next ? state.examAnswers[next.id] || "" : "";
  state.selected = new Set(nextAnswer.split("").filter(Boolean));
  state.submitted = state.mode === "exam" && state.examFinished;
  document.querySelector("#fillAnswer").value = nextAnswer;
  render();
}

function renderQuestionCard(questions) {
  const card = document.querySelector("#questionCard");
  card.innerHTML = "";
  card.classList.toggle("hidden", !questions.length);
  if (!questions.length) return;

  const title = document.createElement("div");
  title.className = "question-card-title";
  title.innerHTML = `<strong>题卡</strong><button id="resetQuestionCard" class="mini-btn" type="button">刷新</button><span>${state.index + 1} / ${questions.length}</span>`;
  card.appendChild(title);
  title.querySelector("#resetQuestionCard").addEventListener("click", () => {
    state.sessionCard = {};
    render();
  });

  const groups = [];
  const groupMap = new Map();
  questions.forEach((question, index) => {
    const type = question.type || "未分类";
    if (!groupMap.has(type)) {
      const group = { type, items: [] };
      groupMap.set(type, group);
      groups.push(group);
    }
    groupMap.get(type).items.push({ question, index });
  });

  const grouped = document.createElement("div");
  grouped.className = "question-card-groups";
  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "question-card-group";

    const head = document.createElement("div");
    head.className = "question-card-group-title";
    head.innerHTML = `<strong>${escapeHtml(group.type)}</strong><span>${group.items.length} 题</span>`;
    section.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "question-card-grid";
    group.items.forEach(({ question, index }, groupIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `question-chip ${questionCardStatus(question)} ${index === state.index ? "current" : ""}`;
      button.textContent = groupIndex;
      button.title = `${group.type}第 ${groupIndex} 题 · 原第 ${index + 1} 题`;
      button.addEventListener("click", () => jumpByIndex(index));
      grid.appendChild(button);
    });
    section.appendChild(grid);
    grouped.appendChild(section);
  });
  card.appendChild(grouped);
}

function chooseOption(question, label) {
  if (state.submitted && state.mode !== "exam") return;
  if (isMulti(question)) {
    state.selected.has(label) ? state.selected.delete(label) : state.selected.add(label);
  } else {
    state.selected = new Set([label]);
  }
  if (state.mode === "exam") {
    state.examAnswers[question.id] = [...state.selected].sort().join("");
  } else if (state.mode === "practice" && question.hasAnswer) {
    const expectedCount = displayedAnswerLabels(question).length;
    if (!isMulti(question) || state.selected.size >= expectedCount) {
      state.submitted = true;
      recordPracticeAnswer(question, getUserAnswer(question));
    }
  }
  render();
}

function getUserAnswer(question) {
  return question.options.length ? [...state.selected].sort().join("") : document.querySelector("#fillAnswer").value;
}

function renderFeedback(question) {
  const feedback = document.querySelector("#feedback");
  const shouldShow = state.mode === "memorize" || state.submitted;
  feedback.className = "feedback";
  feedback.classList.toggle("hidden", !shouldShow);
  if (!shouldShow) return;

  if (!question.hasAnswer) {
    feedback.innerHTML = "<strong>这道题当前题库没有参考答案。</strong><br>可以先自答，再收藏或之后补充答案。";
    return;
  }
  const answerNotice = question.answerNotice ? `<div class="answer-notice">${formatStudyText(question.answerNotice)}</div>` : "";

  if (!isObjectiveQuestion(question) && !/填空/.test(question.type || "")) {
    feedback.classList.add("good");
    feedback.innerHTML = `${answerNotice}<strong>参考答案</strong><br>${formatStudyText(question.answer)}${question.explanation && question.explanation !== question.answer ? `<br>${formatStudyText(question.explanation)}` : ""}`;
    renderImages(feedback, question.answerImages);
    renderImages(feedback, question.explanationImages);
    return;
  }

  const userAnswer = getUserAnswer(question);
  const correctAnswer = question.options.length ? displayedAnswerLabels(question).join("") : question.answer;
  if (state.mode === "memorize") {
    feedback.classList.add("good");
    feedback.innerHTML = `${answerNotice}<strong>参考答案：${escapeHtml(correctAnswer)}</strong>${question.explanation ? `<br>${formatStudyText(question.explanation)}` : ""}`;
    renderImages(feedback, question.answerImages);
    renderImages(feedback, question.explanationImages);
    return;
  }
  const correct = isAnswerCorrect(question, userAnswer);
  feedback.classList.add(correct ? "good" : "bad");
  const verdict = correct ? "回答正确" : "回答错误";
  feedback.innerHTML = `${answerNotice}<strong>${verdict} · 参考答案：${escapeHtml(correctAnswer)}</strong>${state.mode !== "memorize" ? `<br>你的答案：${escapeHtml(userAnswer || "未作答")}` : ""}${question.explanation ? `<br>${formatStudyText(question.explanation)}` : ""}`;
  renderImages(feedback, question.answerImages);
  renderImages(feedback, question.explanationImages);
}

function renderActions(question, total) {
  const optionPractice = question && state.mode === "practice" && question.options.length > 0;
  const listPractice = question && state.mode !== "exam" && isMajorQuestion(question);
  document.querySelector("#prevBtn").disabled = !question || (state.mode !== "exam" && state.index === 0);
  document.querySelector("#nextBtn").disabled = !question || (state.mode !== "exam" && state.index >= total - 1);
  document.querySelector("#submitBtn").classList.toggle("hidden", state.mode === "memorize" || optionPractice || listPractice);
  document.querySelector("#showAnswerBtn").classList.toggle("hidden", state.mode === "exam" || listPractice);
  document.querySelector("#submitBtn").textContent = state.mode === "exam" ? "交卷" : "提交";
  document.querySelector("#submitBtn").disabled = !question || (state.submitted && state.mode !== "exam");
  document.querySelector("#showAnswerBtn").disabled = !question;
}

function submitAnswer() {
  const question = currentQuestion();
  if (!question) return;

  if (state.mode === "exam") {
    if (!confirm("确定要交卷吗？交卷后会生成本次考试结果。")) return;
    state.examAnswers[question.id] = getUserAnswer(question);
    finishExam();
    return;
  }

  state.submitted = true;
  if (needsWrittenAnswer(question) && !/填空/.test(question.type || "")) {
    state.sessionCard[question.id] = "answered";
  } else {
    recordPracticeAnswer(question, getUserAnswer(question));
  }
  render();
}

function recordPracticeAnswer(question, userAnswer) {
  if (!question.hasAnswer) return;
  const correct = isAnswerCorrect(question, userAnswer);
  state.sessionCard[question.id] = correct ? "correct" : "wrong";
  state.progress.attempts[question.id] = (state.progress.attempts[question.id] || 0) + 1;
  if (correct) {
    delete state.progress.wrong[question.id];
    if (state.filter === "wrong") state.keepVisibleIds.add(question.id);
  } else {
    state.progress.wrong[question.id] = { at: Date.now(), answer: userAnswer };
    state.keepVisibleIds.delete(question.id);
  }
  saveProgress();
}

function finishExam() {
  const questions = currentQuestions();
  let correctCount = 0;
  let checkedCount = 0;
  const review = questions.map((question) => {
    const userAnswer = state.examAnswers[question.id] || "";
    const correctAnswer = question.options.length ? displayedAnswerLabels(question).join("") : question.answer;
    const correct = isAnswerCorrect(question, userAnswer);
    if (question.hasAnswer) {
      checkedCount += 1;
      if (correct) {
        correctCount += 1;
        delete state.progress.wrong[question.id];
      } else {
        state.progress.wrong[question.id] = { at: Date.now(), answer: userAnswer };
      }
    }
    return { id: question.id, userAnswer, correct, correctAnswer };
  });
  saveProgress();
  state.examFinished = true;
  state.examResult = { checkedCount, correctCount, review };
  state.submitted = true;
  render();
}

function renderExamResult() {
  const result = document.querySelector("#examResult");
  if (!state.examFinished || !state.examResult) {
    result.classList.add("hidden");
    return;
  }

  const questionsById = new Map(allQuestions().map((question) => [question.id, question]));
  const { checkedCount, correctCount, review } = state.examResult;
  const rate = checkedCount ? Math.round((correctCount / checkedCount) * 100) : 0;
  const rows = review
    .map((item, index) => {
      const question = questionsById.get(item.id);
      if (!question) return "";
      const status = !question.hasAnswer ? "未判分" : item.correct ? "正确" : "错误";
      const cls = !question.hasAnswer ? "neutral" : item.correct ? "ok" : "no";
      const correctAnswer = item.correctAnswer || (question.options.length ? displayedAnswerLabels(question).join("") : question.answer);
      return `<button class="review-row ${cls}" data-question-id="${item.id}">
        <span>${index + 1}</span>
        <strong>${status}</strong>
        <em>${escapeHtml(question.stem)}</em>
        <small>你的答案：${escapeHtml(item.userAnswer || "未作答")} · 参考答案：${escapeHtml(correctAnswer || "无")}</small>
      </button>`;
    })
    .join("");

  result.classList.remove("hidden");
  result.innerHTML = `
    <div class="result-head">
      <div>
        <p class="meta">考试完成</p>
        <h2>${correctCount} / ${checkedCount}</h2>
      </div>
      <div class="rate">${rate}%</div>
    </div>
    <div class="review-list">${rows}</div>
  `;

  result.querySelectorAll(".review-row").forEach((row) => {
    row.addEventListener("click", () => jumpToQuestion(row.dataset.questionId, true, state.examAnswers[row.dataset.questionId] || ""));
  });
}

function showAnswer() {
  const question = currentQuestion();
  if (question && state.mode === "practice" && needsWrittenAnswer(question) && !/填空/.test(question.type || "")) {
    state.sessionCard[question.id] = "answered";
  }
  state.submitted = true;
  render();
}

function go(delta) {
  const question = currentQuestion();
  if (state.mode === "exam" && question) state.examAnswers[question.id] = getUserAnswer(question);
  state.keepVisibleId = null;
  state.keepVisibleIds.clear();
  const total = currentQuestions().length;
  if (delta > 0 && state.mode !== "exam" && isMajorQuestion(question)) {
    const questions = currentQuestions();
    const type = question.type;
    while (state.index < total && questions[state.index] && isMajorQuestion(questions[state.index]) && questions[state.index].type === type) {
      state.index += 1;
    }
  } else {
    state.index += delta;
  }
  if (state.mode === "exam" && total) {
    if (state.index < 0) state.index = total - 1;
    if (state.index >= total) state.index = 0;
  }
  const next = currentQuestion();
  const nextAnswer = state.mode === "exam" && next ? state.examAnswers[next.id] || "" : "";
  state.selected = new Set(nextAnswer.split("").filter(Boolean));
  state.submitted = state.mode === "exam" && state.examFinished;
  document.querySelector("#fillAnswer").value = nextAnswer;
  render();
}

function jumpToQuestion(id, reveal = false, answer = "") {
  state.keepVisibleId = null;
  state.keepVisibleIds.clear();
  const question = allQuestions().find((item) => item.id === id);
  if (!question) return;
  state.selectedBankIds = new Set([question.bankId]);
  if (state.recordView === "wrong" && state.progress.wrong[id]) state.filter = "wrong";
  else if (state.recordView === "favorite" && state.progress.favorites[id]) state.filter = "favorite";
  else state.filter = "all";
  state.mode = "practice";
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === "practice"));
  state.index = currentQuestions().findIndex((item) => item.id === id);
  state.selected = new Set(String(answer || state.progress.wrong[id]?.answer || "").split("").filter(Boolean));
  document.querySelector("#fillAnswer").value = answer || state.progress.wrong[id]?.answer || "";
  state.submitted = reveal;
  render();
  document.querySelector(".question-shell").scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleFavorite() {
  const question = currentQuestion();
  if (!question) return;
  if (state.progress.favorites[question.id]) {
    delete state.progress.favorites[question.id];
    if (state.filter === "favorite") state.keepVisibleIds.add(question.id);
  } else {
    state.progress.favorites[question.id] = { at: Date.now() };
    if (state.keepVisibleId === question.id) state.keepVisibleId = null;
    state.keepVisibleIds.delete(question.id);
  }
  saveProgress();
  render();
}

async function boot() {
  await requireAuth();
  const data = window.__QUESTION_BANK_DATA__;
  if (!data || !Array.isArray(data.banks)) throw new Error("question bank data missing");
  state.banks = data.banks;
  state.selectedBankIds = new Set();
  state.collapsedGroups = new Set(state.banks.map((bank) => bankGroupName(bank)));

  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
  document.querySelector("#submitBtn").addEventListener("click", submitAnswer);
  document.querySelector("#showAnswerBtn").addEventListener("click", showAnswer);
  document.querySelector("#prevBtn").addEventListener("click", () => go(-1));
  document.querySelector("#nextBtn").addEventListener("click", () => go(1));
  document.querySelector("#favoriteBtn").addEventListener("click", toggleFavorite);
  document.querySelector("#shuffleBtn").addEventListener("click", shuffleCurrentQuestions);
  document.querySelector("#shuffleOptionsBtn").addEventListener("click", shuffleCurrentOptions);
  document.querySelector("#allOnly").addEventListener("click", () => {
    state.keepVisibleId = null;
    state.filter = "all";
    state.recordView = "all";
    resetRun();
    render();
  });
  document.querySelector("#wrongOnly").addEventListener("click", () => {
    state.keepVisibleId = null;
    state.filter = "wrong";
    state.recordView = "wrong";
    resetRun();
    render();
  });
  document.querySelector("#favoriteOnly").addEventListener("click", () => {
    state.keepVisibleId = null;
    state.filter = "favorite";
    state.recordView = "favorite";
    resetRun();
    render();
  });
  document.querySelector("#showAllRecords").addEventListener("click", () => {
    state.keepVisibleId = null;
    state.recordView = "all";
    state.filter = "all";
    resetRun();
    render();
  });
  document.querySelector("#clearProgress").addEventListener("click", () => {
    if (confirm("确定清空错题、收藏和作答记录吗？")) {
      state.progress = { wrong: {}, favorites: {}, attempts: {} };
      saveProgress();
      resetRun();
      render();
    }
  });
  document.querySelector("#fillAnswer").addEventListener("input", () => {
    const question = currentQuestion();
    if (state.mode === "exam" && question) state.examAnswers[question.id] = document.querySelector("#fillAnswer").value;
  });
  document.querySelector("#applyExamSizeBtn").addEventListener("click", () => {
    if (state.mode === "exam") {
      applyExamQuestionLimit();
      render();
    }
  });
  render();
}

boot().catch((error) => {
  unlockApp();
  document.querySelector("#questionStem").textContent = "题库加载失败，请确认 data/question-banks.js 是否存在。";
  console.error(error);
});

