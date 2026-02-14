/*
  HIRO's トレンドインサイト - front controller
  - research -> calls server /api/research
  - history -> stores reports in localStorage
  - compare/dashboard -> simple stats
*/
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const LS_KEY = "hiro_trend_insight_reports_v1";
const nowISO = () => new Date().toISOString();

function loadReports(){
  try{ return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }catch(e){ return []; }
}
function saveReports(reports){
  localStorage.setItem(LS_KEY, JSON.stringify(reports));
}

function setTheme(theme){
  if(theme === "dark") document.documentElement.setAttribute("data-theme","dark");
  else document.documentElement.removeAttribute("data-theme");
  localStorage.setItem("hiro_theme", theme);
}
function initTheme(){
  const t = localStorage.getItem("hiro_theme") || "light";
  setTheme(t);
  const icon = $("#theme-toggle i");
  if(icon) icon.className = (t==="dark") ? "fas fa-sun" : "fas fa-moon";
}

function switchTab(tab){
  $$(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".tab-pane").forEach(p => p.classList.toggle("active", p.id === `${tab}-tab`));
  if(tab === "history") renderHistory();
  if(tab === "dashboard") renderDashboard();
  if(tab === "compare") renderCompareSelection();
}

function getSelectedPeriod(){
  const active = $(".period-btn.active");
  if(!active) return { type:"days", days:7 };
  const v = active.dataset.period;
  if(v === "custom"){
    const s = $("#start-date").value;
    const e = $("#end-date").value;
    return { type:"custom", start:s, end:e };
  }
  return { type:"days", days: Number(v) };
}

function getSelections(name){
  return $$(`input[name="${name}"]:checked`).map(x => x.value);
}

function getMode(){
  const active = $(".mode-card.active");
  return active ? active.dataset.mode : "auto";
}

function showProgress(show){
  const sec = $("#progress-section");
  if(!sec) return;
  sec.classList.toggle("hidden", !show);
}
function showReport(show){
  const sec = $("#report-section");
  if(!sec) return;
  sec.classList.toggle("hidden", !show);
}
function setProgress(pct, status, sourcesCount, factStatus){
  const fill = $("#progress-fill");
  if(fill) fill.style.width = `${pct}%`;
  const st = $("#progress-status");
  if(st) st.textContent = status || "";
  const sc = $("#sources-count");
  if(sc) sc.textContent = String(sourcesCount ?? 0);
  const fs = $("#factcheck-status");
  if(fs) fs.textContent = factStatus || "待機中";
}

function escapeHTML(s){
  return (s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderReport(report){
  const root = $("#report-content");
  if(!root) return;

  const metaBadges = [
    `期間: ${report.period_label}`,
    `業界: ${report.industries.join(" / ") || "-"}`,
    `チャネル: ${report.channels.join(" / ") || "-"}`,
    `信頼性: ${report.credibility_score ?? "-"} / 5`,
  ].map(x => `<span class="badge">${escapeHTML(x)}</span>`).join("");

  const sourcesHtml = (report.sources || []).map((s, idx) => {
    return `<li>
      ${escapeHTML(s.title || `Source ${idx+1}`)}
      <div style="color:var(--muted);font-size:12px;margin-top:4px;">
        ${escapeHTML(s.publisher || "")} ${escapeHTML(s.date || "")}
        ${s.url ? ` | <a href="${escapeHTML(s.url)}" target="_blank" rel="noreferrer">開く</a>` : ""}
      </div>
    </li>`;
  }).join("");

  const bullets = (arr) => (arr||[]).map(x=>`<li>${escapeHTML(x)}</li>`).join("");

  root.innerHTML = `
    <h2>${escapeHTML(report.title || "トレンドレポート")}</h2>
    <div style="margin:8px 0 12px 0;">${metaBadges}</div>

    <h3>エグゼクティブサマリー</h3>
    <p>${escapeHTML(report.summary || "")}</p>

    <h3>主要トレンド（5〜8件）</h3>
    <ol>${bullets(report.trends)}</ol>

    <h3>示唆（意思決定ポイント）</h3>
    <ul>${bullets(report.implications)}</ul>

    <h3>リスクと前提（誤読防止）</h3>
    <ul>${bullets(report.risks)}</ul>

    <h3>次アクション（今週やること）</h3>
    <ul>${bullets(report.next_actions)}</ul>

    <h3>参照ソース</h3>
    <ol>${sourcesHtml || "<li>（ソースなし）</li>"}</ol>

    <div style="margin-top:18px;color:var(--muted);font-size:12px;">
      生成日時: ${escapeHTML(report.generated_at || nowISO())}
    </div>
  `;
}

function periodLabel(period){
  if(period.type === "custom"){
    return `カスタム: ${period.start || "?"}〜${period.end || "?"}`;
  }
  if(period.days === 7) return "直近7日";
  if(period.days === 30) return "直近1ヶ月";
  if(period.days === 90) return "直近3ヶ月";
  return `直近${period.days}日`;
}

async function runResearch(){
  const topic = $("#topic-input").value.trim();
  if(!topic){
    alert("調査トピックを入力してください。");
    return;
  }

  const period = getSelectedPeriod();
  if(period.type === "custom" && (!period.start || !period.end)){
    alert("カスタム期間の開始日と終了日を入力してください。");
    return;
  }

  const industries = getSelections("industry");
  const channels = getSelections("channel");
  const mode = getMode();

  showReport(false);
  showProgress(true);
  setProgress(5, "初期化中...", 0, "待機中");

  const payload = { topic, period, industries, channels, mode, settings: getSettings() };

  try{
    setProgress(15, "AIに調査依頼を送信...", 0, "準備中");
    const res = await fetch("/api/research", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    if(!res.ok){
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }
    const data = await res.json();
    setProgress(100, "完了", (data.sources||[]).length, "完了");

    const report = {
      id: data.id || crypto.randomUUID(),
      title: data.title,
      summary: data.summary,
      trends: data.trends,
      implications: data.implications,
      risks: data.risks,
      next_actions: data.next_actions,
      sources: data.sources,
      credibility_score: data.credibility_score,
      topic,
      period_label: periodLabel(period),
      industries,
      channels,
      generated_at: data.generated_at || nowISO()
    };

    renderReport(report);
    showProgress(false);
    showReport(true);

    if(getSettings().autoSave){
      const reports = loadReports();
      reports.unshift(report);
      saveReports(reports.slice(0, 200));
      renderDashboard();
    }
  }catch(e){
    console.error(e);
    showProgress(false);
    alert("調査に失敗しました。サーバーのログとAPIキー設定を確認してください。\n\n" + (e.message || e));
  }
}

function renderHistory(){
  const list = $("#history-list");
  if(!list) return;
  const q = ($("#history-search")?.value || "").trim().toLowerCase();
  const filter = $("#history-filter")?.value || "all";
  const reports = loadReports();

  const now = Date.now();
  const withinDays = (iso, days) => {
    const t = Date.parse(iso || "");
    if(Number.isNaN(t)) return false;
    return (now - t) <= days*24*3600*1000;
  };

  const filtered = reports.filter(r => {
    if(q){
      const hay = `${r.title||""} ${r.topic||""}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    if(filter === "recent") return withinDays(r.generated_at, 7);
    if(filter === "month") return withinDays(r.generated_at, 31);
    if(filter === "favorite") return !!r.favorite;
    return true;
  });

  list.innerHTML = filtered.map(r => `
    <div class="history-item" data-id="${escapeHTML(r.id)}">
      <div class="title">${escapeHTML(r.title || r.topic || "レポート")}</div>
      <div class="meta">${escapeHTML(r.generated_at || "")} / ${escapeHTML(r.period_label || "")}</div>
      <button class="secondary-btn btn-open">開く</button>
      <button class="secondary-btn btn-fav">${r.favorite ? "★ お気に入り解除" : "☆ お気に入り"}</button>
      <button class="secondary-btn btn-del">削除</button>
    </div>
  `).join("") || `<div style="color:var(--muted);padding:10px;">履歴はまだありません。</div>`;

  $$(".history-item", list).forEach(card => {
    const id = card.getAttribute("data-id");
    $(".btn-open", card).addEventListener("click", () => {
      const rep = loadReports().find(x => x.id === id);
      if(rep){
        switchTab("research");
        renderReport(rep);
        showReport(true);
        showProgress(false);
        window.scrollTo({top:0, behavior:"smooth"});
      }
    });
    $(".btn-fav", card).addEventListener("click", () => {
      const reps = loadReports();
      const idx = reps.findIndex(x => x.id === id);
      if(idx>=0){
        reps[idx].favorite = !reps[idx].favorite;
        saveReports(reps);
        renderHistory();
        renderDashboard();
      }
    });
    $(".btn-del", card).addEventListener("click", () => {
      if(!confirm("このレポートを削除しますか？")) return;
      const reps = loadReports().filter(x => x.id !== id);
      saveReports(reps);
      renderHistory();
      renderDashboard();
    });
  });
}

function renderCompareSelection(){
  const root = $("#compare-selection");
  const result = $("#compare-result");
  if(!root || !result) return;
  const reports = loadReports();
  root.innerHTML = reports.slice(0, 30).map(r => `
    <label class="checkbox-label">
      <input type="checkbox" name="cmp" value="${escapeHTML(r.id)}">
      <span class="checkbox-custom"></span>
      ${escapeHTML(r.title || r.topic || "レポート")}
      <span style="color:var(--muted);font-size:12px;margin-left:8px;">${escapeHTML(r.generated_at||"")}</span>
    </label>
  `).join("") || `<div style="color:var(--muted);padding:10px;">比較できるレポートがありません。</div>`;

  const btn = document.createElement("button");
  btn.className = "primary-btn";
  btn.textContent = "比較する";
  btn.style.marginTop = "12px";
  root.appendChild(btn);

  btn.addEventListener("click", () => {
    const ids = $$('input[name="cmp"]:checked', root).map(x=>x.value);
    if(ids.length < 2){
      alert("2つ以上選択してください。");
      return;
    }
    const chosen = reports.filter(r => ids.includes(r.id));
    const unionTrends = new Map();
    chosen.forEach(r => (r.trends||[]).forEach(t => unionTrends.set(t, (unionTrends.get(t)||0)+1)));

    const top = Array.from(unionTrends.entries()).sort((a,b)=>b[1]-a[1]).slice(0, 10);

    result.classList.remove("hidden");
    result.innerHTML = `
      <div class="report-content">
        <h2>比較サマリー</h2>
        <p>対象レポート数: ${ids.length}</p>
        <h3>共通トレンド上位</h3>
        <ol>${top.map(([t,c])=>`<li>${escapeHTML(t)} <span style="color:var(--muted);font-size:12px;">(登場 ${c})</span></li>`).join("")}</ol>
      </div>
    `;
  });
}

function renderDashboard(){
  const reps = loadReports();
  const total = reps.length;
  const sources = reps.reduce((acc,r)=>acc + (r.sources?.length||0), 0);
  const avgCred = (() => {
    const vals = reps.map(r=>Number(r.credibility_score)).filter(x=>Number.isFinite(x));
    if(!vals.length) return "-";
    const s = vals.reduce((a,b)=>a+b,0)/vals.length;
    return s.toFixed(2);
  })();
  const topTopic = (() => {
    const m = new Map();
    reps.forEach(r => {
      const k = (r.topic||"").trim();
      if(!k) return;
      m.set(k, (m.get(k)||0)+1);
    });
    let best = null, bestv = 0;
    m.forEach((v,k)=>{ if(v>bestv){bestv=v;best=k;} });
    return best || "-";
  })();

  if($("#total-research")) $("#total-research").textContent = String(total);
  if($("#total-sources")) $("#total-sources").textContent = String(sources);
  if($("#avg-credibility")) $("#avg-credibility").textContent = String(avgCred);
  if($("#top-topic")) $("#top-topic").textContent = String(topTopic);

  // Charts are optional; Chart.js is already loaded in index.html.
  // To keep setup simple, render only if canvas exists & Chart available.
  if(window.Chart){
    const trendCanvas = $("#trend-chart");
    if(trendCanvas){
      const byDay = new Map();
      const days = 30;
      for(let i=days-1;i>=0;i--){
        const d = new Date(Date.now()-i*24*3600*1000);
        const key = d.toISOString().slice(0,10);
        byDay.set(key, 0);
      }
      reps.forEach(r => {
        const k = (r.generated_at||"").slice(0,10);
        if(byDay.has(k)) byDay.set(k, byDay.get(k)+1);
      });
      const labels = Array.from(byDay.keys());
      const values = Array.from(byDay.values());
      if(window._trendChart) window._trendChart.destroy();
      window._trendChart = new Chart(trendCanvas, {
        type:"line",
        data:{ labels, datasets:[{ label:"調査数", data: values }] },
        options:{ responsive:true, maintainAspectRatio:false }
      });
      trendCanvas.parentElement.style.height = "280px";
    }
    const indCanvas = $("#industry-chart");
    if(indCanvas){
      const m = new Map();
      reps.forEach(r => (r.industries||[]).forEach(i => m.set(i,(m.get(i)||0)+1)));
      const labels = Array.from(m.keys());
      const values = Array.from(m.values());
      if(window._indChart) window._indChart.destroy();
      window._indChart = new Chart(indCanvas, {
        type:"bar",
        data:{ labels, datasets:[{ label:"件数", data: values }] },
        options:{ responsive:true, maintainAspectRatio:false }
      });
      indCanvas.parentElement.style.height = "280px";
    }
  }
}

function getSettings(){
  return {
    factcheckLevel: $("#factcheck-level")?.value || "standard",
    credibilityThreshold: Number($("#credibility-threshold")?.value || 3),
    autoSave: !!$("#auto-save")?.checked
  };
}
function applySettingsUI(){
  const s = JSON.parse(localStorage.getItem("hiro_settings") || "{}");
  if(s.factcheckLevel && $("#factcheck-level")) $("#factcheck-level").value = s.factcheckLevel;
  if(Number.isFinite(s.credibilityThreshold) && $("#credibility-threshold")) $("#credibility-threshold").value = s.credibilityThreshold;
  if(typeof s.autoSave === "boolean" && $("#auto-save")) $("#auto-save").checked = s.autoSave;
  if($("#threshold-value")) $("#threshold-value").textContent = String($("#credibility-threshold")?.value || 3);
}
function saveSettings(){
  const s = getSettings();
  localStorage.setItem("hiro_settings", JSON.stringify(s));
  return s;
}

function initEvents(){
  // Tabs
  $$(".tab-btn").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

  // Theme
  $("#theme-toggle")?.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme")==="dark";
    setTheme(isDark ? "light" : "dark");
    initTheme();
  });

  // Settings modal
  const modal = $("#settings-modal");
  const showModal = () => modal?.classList.add("show");
  const hideModal = () => modal?.classList.remove("show");
  $("#settings-btn")?.addEventListener("click", showModal);
  $$(".close-modal").forEach(x => x.addEventListener("click", hideModal));
  modal?.addEventListener("click", (e)=>{ if(e.target === modal) hideModal; });
  $("#save-settings-btn")?.addEventListener("click", () => { saveSettings(); applySettingsUI(); hideModal(); });

  $("#credibility-threshold")?.addEventListener("input", () => {
    if($("#threshold-value")) $("#threshold-value").textContent = String($("#credibility-threshold").value);
  });

  // Period selection
  $$(".period-btn").forEach(btn => btn.addEventListener("click", () => {
    $$(".period-btn").forEach(b => b.classList.toggle("active", b===btn));
    const custom = $("#custom-period");
    if(custom) custom.classList.toggle("hidden", btn.dataset.period !== "custom");
  }));

  // Mode selection
  $$(".mode-card").forEach(card => card.addEventListener("click", () => {
    $$(".mode-card").forEach(c => c.classList.toggle("active", c===card));
  }));

  // Start
  $("#start-research-btn")?.addEventListener("click", runResearch);

  // History controls
  $("#history-search")?.addEventListener("input", renderHistory);
  $("#history-filter")?.addEventListener("change", renderHistory);

  // Export buttons - client side (simple: copy HTML; user can use existing libs if needed)
  $("#save-report-btn")?.addEventListener("click", () => {
    // Save currently shown report by re-reading rendered content is unreliable; instead require rerun or open from history.
    alert("自動保存がONの場合は実行後に履歴へ保存されます。OFFの場合は設定からONにしてください。");
  });

  // jsPDF / xlsx hooks are kept in HTML, but to avoid brittle implementation we leave them as-is.
}

function boot(){
  initTheme();
  applySettingsUI();
  initEvents();
  switchTab("research");
  renderDashboard();
}
document.addEventListener("DOMContentLoaded", boot);
