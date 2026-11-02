"use strict";
/* ===== 管理页：导入 / 编辑配件与价格 → 草稿 → 发布到 GitHub（网站自动更新） ===== */

let ORIG = null;           /* 网站当前数据 {meta, catalog, prices, rates} */
let W = null;              /* 草稿（工作副本）{catalog, prices, rates} */
let BASE_VER = 0;          /* 草稿基于的网站版本号 */
let DIFF = {list:[], changed:new Set()};
let VIEW = [], page = 1;
let pageSize = PAGE_SIZES.includes(LS.get("yc_admin_page_size", 100)) ? LS.get("yc_admin_page_size", 100) : 100;
const NEW_CFG = ["NEW", "新上线配件", "NEW PARTS"];
const F = {cfg:0, seq:1, qty:2, no:3, cn:4, en:5, spec:6, rm:7};
const FIELD_CN = ["配置号","序号","单车用量","图号","中文名","英文名","规格","备注"];
const clone = o => JSON.parse(JSON.stringify(o));
const todayDot = () => todayStr().replace(/-/g, ".");
/* 日期统一为 2026.12.31 格式；支持 2026-12-31、2026/12/31、2026年12月31日、Excel 日期序号；无法识别返回 null */
function normDate(v){
  v = String(v == null ? "" : v).trim();
  if(!v) return "";
  if(/^\d{5}(\.\d+)?$/.test(v)){ const d = new Date(Math.round((Number(v) - 25569) * 864e5)); return d.getUTCFullYear() + "." + pad2(d.getUTCMonth()+1) + "." + pad2(d.getUTCDate()); }
  const m = v.match(/^(\d{4})\s*[.\-\/年]\s*(\d{1,2})\s*[.\-\/月]\s*(\d{1,2})/);
  return m ? m[1] + "." + pad2(m[2]) + "." + pad2(m[3]) : null;
}

/* ================= 草稿保存（IndexedDB，关闭页面不丢） ================= */
const IDB = {
  db: null,
  open(){
    if(this.db) return Promise.resolve(this.db);
    return new Promise((res, rej)=>{
      const r = indexedDB.open("yc_admin", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async run(mode, fn){
    const db = await this.open();
    return new Promise((res, rej)=>{
      const tx = db.transaction("kv", mode), q = fn(tx.objectStore("kv"));
      tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error);
    });
  },
  get(k){ return this.run("readonly", s => s.get(k)); },
  set(k, v){ return this.run("readwrite", s => s.put(v, k)); },
  del(k){ return this.run("readwrite", s => s.delete(k)); }
};
let draftTimer = null;
function saveDraft(){
  clearTimeout(draftTimer);
  draftTimer = setTimeout(()=>{
    const p = DIFF.list.length ? IDB.set("draft", {base:BASE_VER, catalog:W.catalog, prices:W.prices, rates:W.rates}) : IDB.del("draft");
    p.catch(e=>toast("草稿保存失败：" + e.message, "err"));
  }, 400);
}

/* ================= 与网站数据对比 ================= */
function rowKeys(rows){
  const seen = {}, m = new Map();
  rows.forEach((a, i)=>{
    const k = a[F.cfg] + "|" + a[F.seq] + "|" + a[F.no];
    const n = seen[k] = (seen[k] || 0) + 1;
    m.set(k + "#" + n, {a, i});
  });
  return m;
}
const fmtPrice = v => v ? (v[1] === "" || v[1] == null ? "无单价" : curSym(v[2]) + v[1] + " " + (v[2]||"")) + (v[4] ? " 至" + v[4] : "") + (v[0] ? " · 物料号" + v[0] : "") : "无";
function computeDiff(){
  const list = [], changed = new Set();
  const models = new Set([...Object.keys(ORIG.catalog.parts), ...Object.keys(W.catalog.parts)]);
  models.forEach(m=>{
    const o = rowKeys(ORIG.catalog.parts[m] || []), w = rowKeys(W.catalog.parts[m] || []);
    w.forEach(({a, i}, k)=>{
      const old = o.get(k);
      if(!old){ list.push({t:"新增", m, cfg:a[F.cfg], no:a[F.no], d:a[F.cn] + " " + (a[F.en]||"")}); changed.add(m + "#" + i); }
      else if(JSON.stringify(trimRow(old.a)) !== JSON.stringify(trimRow(a))){
        const d = [];
        for(let f = 0; f < 8; f++) if(String(old.a[f]??"") !== String(a[f]??""))
          d.push(`${FIELD_CN[f]}：<span class="old">${esc(old.a[f]??"")}</span> → <span class="new">${esc(a[f]??"")}</span>`);
        list.push({t:"修改", m, cfg:a[F.cfg], no:a[F.no], d:d.join("；"), html:true}); changed.add(m + "#" + i);
      }
    });
    o.forEach(({a}, k)=>{ if(!w.has(k)) list.push({t:"删除", m, cfg:a[F.cfg], no:a[F.no], d:a[F.cn] + " " + (a[F.en]||"")}); });
    if(JSON.stringify(ORIG.catalog.configs[m]||[]) !== JSON.stringify(W.catalog.configs[m]||[]))
      list.push({t:"分类", m, cfg:"", no:"", d:"分类目录有变化（如新增「新上线配件」分类）"});
  });
  const nos = new Set([...Object.keys(ORIG.prices), ...Object.keys(W.prices)]);
  const priceChanged = new Set();
  nos.forEach(no=>{
    const a = ORIG.prices[no], b = W.prices[no];
    if(JSON.stringify(a ? trimRow(a) : null) === JSON.stringify(b ? trimRow(b) : null)) return;
    priceChanged.add(no);
    list.push({t: !a ? "新价格" : !b ? "删除价格" : "改价格", m:"", cfg:"", no,
      d:`<span class="old">${esc(fmtPrice(a))}</span> → <span class="new">${esc(fmtPrice(b))}</span>`, html:true});
  });
  if(priceChanged.size) Object.keys(W.catalog.parts).forEach(m=>W.catalog.parts[m].forEach((a,i)=>{ if(priceChanged.has(a[F.no])) changed.add(m + "#" + i); }));
  const ro = ORIG.rates, rw = W.rates;
  if(JSON.stringify(ro) !== JSON.stringify(rw)){
    const f = R => CURRENCIES.filter(c=>c !== "CNY").map(c=>"1 " + c + " = " + (R.rates[c] ? fmtRate(R.rates[c]) : "未设置") + " CNY").join("，")
      + "；默认 " + R.default + (R.date ? "；" + R.date : "");
    list.push({t:"汇率", m:"", cfg:"", no:"", d:`<span class="old">${esc(f(ro))}</span> → <span class="new">${esc(f(rw))}</span>`, html:true});
  }
  DIFF = {list, changed};
}
function diffCounts(){
  const c = {}; DIFF.list.forEach(x=>c[x.t] = (c[x.t]||0) + 1);
  return Object.entries(c).map(([k,v])=>k + " " + v).join("，");
}
function afterChange(){
  computeDiff(); saveDraft();
  if(!DIFF.list.length) document.getElementById("fChanged").checked = false;   /* 没有修改时取消「只看本次修改」，避免列表为空 */
  renderStats(); renderRows();
}

/* ================= 列表 ================= */
function renderStats(){
  document.getElementById("stVer").textContent = "网站数据 v" + (ORIG.meta.version||0) + " · " + (ORIG.meta.updatedAt||"");
  const d = document.getElementById("stDraft");
  d.textContent = DIFF.list.length ? "未发布修改 " + DIFF.list.length + " 项（点击查看）" : "无未发布修改";
  d.className = "stat-chip draft-chip" + (DIFF.list.length ? " danger" : "");
  const nos = new Set(); let rows = 0;
  Object.values(W.catalog.parts).forEach(l=>l.forEach(a=>{ nos.add(a[F.no]); rows++; }));
  let noPrice = 0; nos.forEach(no=>{ const p = W.prices[no]; if(!p || p[1] === "" || p[1] == null) noPrice++; });
  document.getElementById("stParts").textContent = "配件 " + rows + " 行 / 图号 " + nos.size;
  document.getElementById("stNoPrice").textContent = "无价格图号 " + noPrice;
  const today = todayDot(), soon = (()=>{ const t = new Date(); t.setDate(t.getDate()+60);
    return t.getFullYear() + "." + pad2(t.getMonth()+1) + "." + pad2(t.getDate()); })();
  let expired = 0, expSoon = 0;
  Object.values(W.prices).forEach(p=>{ const to = p[4]; if(!to) return; if(to < today) expired++; else if(to <= soon) expSoon++; });
  const e = document.getElementById("stExpire");
  e.textContent = "价格已过期 " + expired + " · 60 天内到期 " + expSoon;
  e.className = "stat-chip" + (expired ? " danger" : expSoon ? " warn" : "");
  const R = W.rates, set = availCurrencies(R).filter(c=>c !== "CNY");
  const age = R.date ? Math.floor((new Date(todayStr()) - new Date(R.date)) / 864e5) : null;
  const rc = document.getElementById("stRate");
  rc.textContent = set.length
    ? "汇率 " + set.map(c=>c + " " + fmtRate(R.rates[c])).join(" · ") + "（" + (R.date || "无日期") + (age > 0 ? "，" + age + " 天前" : age === 0 ? "，今天" : "") + "）"
    : "未设置汇率（经销商只能看人民币）";
  rc.className = "stat-chip draft-chip" + (!set.length || age == null || age > 7 ? " warn" : "");
}

/* ================= 汇率 ================= */
function openRates(){
  const R = W.rates;
  setVal("rUSD", R.rates.USD || ""); setVal("rEUR", R.rates.EUR || "");
  setVal("rDefault", R.default); setVal("rDate", todayStr());
  previewRates();
  document.getElementById("rateMask").classList.add("show");
}
function readRateForm(){
  const num = id => { const v = getVal(id); if(v === "") return null; const n = Number(v); return n > 0 ? n : NaN; };
  return {usd:num("rUSD"), eur:num("rEUR"), def:getVal("rDefault"), date:getVal("rDate")};
}
function previewRates(){
  const f = readRateForm(), h = document.getElementById("rPreview");
  const sample = W.prices["S35EA1-0100001"] || Object.values(W.prices).find(p=>p[1] !== "" && p[2] === "CNY");
  const cny = sample ? Number(sample[1]) : 100;
  const lines = [["USD", f.usd], ["EUR", f.eur]].map(([c, r])=>{
    if(r == null) return c + "：未设置（经销商不能选" + c + "）";
    if(isNaN(r)) return c + "：⚠ 请输入大于 0 的数字";
    const warn = r < 1 || r > 20 ? "　⚠ 数值看起来不对：这里填「1 " + c + " 等于多少人民币」，通常在 6–9 之间" : "";
    return c + "：¥" + money(cny) + " → " + curSym(c) + money(Math.round(cny / r * 100) / 100) + warn;
  });
  h.className = "hint" + (lines.some(l=>l.includes("⚠")) ? " warn" : "");
  h.innerHTML = "换算示例：<br>" + lines.map(esc).join("<br>");
}
function saveRates(andPublish){
  const f = readRateForm();
  if(isNaN(f.usd) || isNaN(f.eur)){ toast("汇率必须是大于 0 的数字", "err"); return; }
  if(f.def === "USD" && !f.usd || f.def === "EUR" && !f.eur){ toast("默认货币 " + f.def + " 还没有填写汇率", "err"); return; }
  if((f.usd && (f.usd < 1 || f.usd > 20) || f.eur && (f.eur < 1 || f.eur > 20))
     && !confirm("汇率数值看起来不正常（应填「1 外币 = 多少人民币」，通常在 6–9 之间）。\n确定要保存吗？")) return;
  W.rates = normRates({default:f.def, rates:{USD:f.usd, EUR:f.eur}, date:f.date || todayStr(), updatedBy:GH.name || ""});
  closeMask("rateMask");
  afterChange();
  if(andPublish){ openPublish(); setVal("pubMsg", "更新汇率"); }
  else toast("汇率已保存到草稿，点「发布到网站」后生效", "ok");
}
["rUSD","rEUR","rDefault"].forEach(id=>document.getElementById(id).addEventListener("input", previewRates));
function renderRows(){
  const q = document.getElementById("q").value.trim().toLowerCase();
  const fm = document.getElementById("fModel").value;
  const onlyNoPrice = document.getElementById("fNoPrice").checked;
  const onlyChanged = document.getElementById("fChanged").checked;
  VIEW = [];
  W.catalog.models.forEach(m=>{
    if(fm && m.id !== fm) return;
    (W.catalog.parts[m.id]||[]).forEach((a, i)=>{
      const p = W.prices[a[F.no]];
      if(onlyNoPrice && p && p[1] !== "" && p[1] != null) return;
      if(onlyChanged && !DIFF.changed.has(m.id + "#" + i)) return;
      if(q){
        const hay = (a[F.no] + " " + a[F.cn] + " " + (a[F.en]||"") + " " + a[F.cfg] + " " + (p ? p[0] : "")).toLowerCase();
        if(!hay.includes(q)) return;
      }
      VIEW.push({m:m.id, i});
    });
  });
  const pages = pageCount(VIEW.length, pageSize);
  if(page > pages) page = pages;
  const view = VIEW.slice((page-1)*pageSize, page*pageSize);
  document.getElementById("resInfo").textContent = "共 " + VIEW.length + " 行";
  const today = todayDot();
  document.getElementById("rows").innerHTML = view.length ? view.map(({m, i})=>{
    const a = W.catalog.parts[m][i], p = W.prices[a[F.no]];
    const has = p && p[1] !== "" && p[1] != null;
    const to = p && p[4] ? p[4] : "";
    return `<tr class="${DIFF.changed.has(m + "#" + i) ? "in-cart" : ""}">
      <td><span class="tag">${esc(m)}</span></td>
      <td><span class="cfg-badge">${esc(a[F.cfg])}</span></td>
      <td>${esc(a[F.seq])}</td>
      <td class="partno">${esc(a[F.no])}</td>
      <td><div class="desc-cn">${esc(a[F.cn]||"—")}</div><div class="desc-en">${esc(a[F.en]||"")}</div></td>
      <td><div class="spec">${esc(a[F.spec]||"—")}</div>${a[F.rm]?`<div class="rmk">${esc(a[F.rm])}</div>`:""}</td>
      <td style="text-align:center">${esc(a[F.qty])}</td>
      <td class="spec">${esc(p ? p[0] : "")}</td>
      <td>${has ? `<span class="price"><span class="cur">${esc(curSym(p[2]))}</span>${money(p[1])}</span><div class="spec">${esc(p[2])}</div>` : '<span class="tag err">无价格</span>'}</td>
      <td class="spec" style="${to && to < today ? "color:var(--danger);font-weight:700" : ""}">${esc(to || "—")}</td>
      <td><button class="btn btn-ghost btn-sm" data-edit="${esc(m)}|${i}">编辑</button>
          <button class="btn btn-del btn-sm" data-del="${esc(m)}|${i}">删除</button></td>
    </tr>`;
  }).join("") : '<tr class="empty-row"><td colspan="11">没有符合条件的配件</td></tr>';
  const pg = document.getElementById("pager");
  pg.innerHTML = pagerHtml(VIEW.length, page, pageSize, ADMIN_PAGER_TEXT);
}
const ADMIN_PAGER_TEXT = {total: n => "共 " + n + " 行", prev: "上一页", next: "下一页", goto: "跳至", of: n => "/ " + n + " 页", perPage: "每页"};

/* ================= 编辑 / 新增 ================= */
let editing = null;   /* {m, i} 或 null（新增） */
function closeMask(id){ document.getElementById(id).classList.remove("show"); }
function fillCfgOptions(model, selected){
  const cfgs = (W.catalog.configs[model] || []).slice();
  if(!cfgs.some(c=>c[0] === NEW_CFG[0])) cfgs.unshift(NEW_CFG);
  document.getElementById("eCfg").innerHTML = cfgs.map(c=>
    `<option value="${esc(c[0])}" ${c[0]===selected?"selected":""}>${esc(c[0])} ${esc(c[1]||"")}</option>`).join("");
}
function setVal(id, v){ document.getElementById(id).value = v == null ? "" : v; }
function getVal(id){ return document.getElementById(id).value.trim(); }
function fillPrice(no){
  const p = W.prices[no];
  setVal("eCode", p ? p[0] : ""); setVal("ePrice", p ? p[1] : ""); setVal("eCur", p && p[2] ? p[2] : "CNY"); setVal("eTo", p ? p[4] : "");
}
function openEdit(m, i){
  editing = {m, i};
  const a = W.catalog.parts[m][i];
  document.getElementById("editTitle").textContent = "编辑配件（" + m + "）";
  document.getElementById("eModel").innerHTML = `<option>${esc(m)}</option>`;
  document.getElementById("eModel").disabled = true;
  fillCfgOptions(m, a[F.cfg]);
  document.getElementById("eModelsBox").style.display = "none";
  setVal("eNo", a[F.no]); document.getElementById("eNo").disabled = true;
  setVal("eQty", a[F.qty]); setVal("eCn", a[F.cn]); setVal("eEn", a[F.en]); setVal("eSpec", a[F.spec]); setVal("eRm", a[F.rm]);
  fillPrice(a[F.no]);
  const others = W.catalog.models.filter(x=>x.id !== m && (W.catalog.parts[x.id]||[]).some(r=>r[F.no] === a[F.no])).map(x=>x.id);
  const h = document.getElementById("eHint");
  h.style.display = "block"; h.className = "hint";
  h.textContent = "名称、规格等只修改本机型这一行；价格按图号统一修改" + (others.length ? "，同时影响：" + others.join("、") : "") + "。";
  document.getElementById("editMask").classList.add("show");
}
function openAdd(){
  editing = null;
  const m = document.getElementById("fModel").value || W.catalog.models[0].id;
  document.getElementById("editTitle").textContent = "新增配件";
  const sel = document.getElementById("eModel");
  sel.disabled = false;
  sel.innerHTML = W.catalog.models.map(x=>`<option value="${esc(x.id)}" ${x.id===m?"selected":""}>${esc(x.cn)}</option>`).join("");
  fillCfgOptions(m, NEW_CFG[0]);
  document.getElementById("eModelsBox").style.display = "";
  renderModelPicks(m);
  ["eNo","eCn","eEn","eSpec","eRm","eCode","ePrice","eTo"].forEach(id=>setVal(id, ""));
  setVal("eQty", 1); setVal("eCur", "CNY");
  document.getElementById("eNo").disabled = false;
  document.getElementById("eHint").style.display = "none";
  document.getElementById("editMask").classList.add("show");
}
function renderModelPicks(main){
  document.getElementById("eModels").innerHTML = W.catalog.models.filter(x=>x.id !== main)
    .map(x=>`<label><input type="checkbox" value="${esc(x.id)}">${esc(x.id)}</label>`).join("");
}
function lookupNo(){
  if(editing) return;
  const no = getVal("eNo"), h = document.getElementById("eHint");
  if(!no){ h.style.display = "none"; return; }
  const where = []; let first = null;
  W.catalog.models.forEach(x=>{ const r = (W.catalog.parts[x.id]||[]).find(a=>a[F.no] === no); if(r){ where.push(x.id); first = first || r; } });
  if(first && !getVal("eCn")){ setVal("eCn", first[F.cn]); setVal("eEn", first[F.en]); setVal("eSpec", first[F.spec]); }
  if(W.prices[no]) fillPrice(no);
  h.style.display = "block";
  h.className = "hint " + (where.length ? "warn" : "ok");
  h.textContent = where.length ? "该图号已存在于：" + where.join("、") + "（已自动带出名称和价格；已存在的机型会跳过）" : "新图号";
}
/* 价格表单 → 价格记录；返回 undefined 表示不变 */
function priceFromForm(no){
  const old = W.prices[no];
  const code = getVal("eCode"), ps = getVal("ePrice"), cur = getVal("eCur") || "CNY", to = normDate(getVal("eTo"));
  if(ps !== "" && !(Number(ps) >= 0)) throw new Error("单价必须是数字");
  if(to === null) throw new Error("有效期格式应为 2026.12.31");
  const price = ps === "" ? "" : Number(ps);
  if(!old){
    if(price === "" && !code) return undefined;
    return [code, price, cur, price === "" ? "" : todayDot(), to];
  }
  const changedPrice = String(old[1] ?? "") !== String(price) || (old[2]||"CNY") !== cur;
  const v = [code, price, cur, changedPrice && price !== "" ? todayDot() : (old[3]||""), to];
  return JSON.stringify(trimRow(v)) === JSON.stringify(trimRow(old)) ? undefined : v;
}
function ensureCfg(model, cfg){
  const list = W.catalog.configs[model] = W.catalog.configs[model] || [];
  if(list.some(c=>c[0] === cfg)) return cfg;
  if(cfg === NEW_CFG[0]){ list.unshift(NEW_CFG.slice()); return cfg; }
  return ensureCfg(model, NEW_CFG[0]);
}
function nextSeq(model, cfg){
  let mx = 0; (W.catalog.parts[model]||[]).forEach(a=>{ if(a[F.cfg] === cfg && Number(a[F.seq]) > mx) mx = Number(a[F.seq]); });
  return mx + 1;
}
function saveEdit(){
  const no = getVal("eNo"), cn = getVal("eCn");
  if(!no || !cn){ toast("图号和中文名称必填", "err"); return; }
  let pv;
  try{ pv = priceFromForm(no); }catch(e){ toast(e.message, "err"); return; }
  const qty = getVal("eQty") === "" ? 1 : Number(getVal("eQty"));
  const fields = {cn, en:getVal("eEn"), spec:getVal("eSpec"), rm:getVal("eRm")};
  if(editing){
    const a = W.catalog.parts[editing.m][editing.i];
    a[F.cfg] = ensureCfg(editing.m, getVal("eCfg"));
    a[F.qty] = qty; a[F.cn] = fields.cn; a[F.en] = fields.en; a[F.spec] = fields.spec; a[F.rm] = fields.rm;
    while(a.length < 8) a.push("");
  } else {
    const main = getVal("eModel"), cfgSel = getVal("eCfg");
    const targets = [main, ...Array.from(document.querySelectorAll("#eModels input:checked")).map(x=>x.value)];
    const added = [], skipped = [];
    targets.forEach(m=>{
      if((W.catalog.parts[m]||[]).some(a=>a[F.no] === no)){ skipped.push(m); return; }
      const cfg = ensureCfg(m, m === main ? cfgSel : ((W.catalog.configs[m]||[]).some(c=>c[0] === cfgSel) ? cfgSel : NEW_CFG[0]));
      (W.catalog.parts[m] = W.catalog.parts[m] || []).push([cfg, nextSeq(m, cfg), qty, no, fields.cn, fields.en, fields.spec, fields.rm]);
      added.push(m);
    });
    if(!added.length && pv === undefined){ toast("该图号在所选机型中都已存在，未新增", "err"); return; }
    toast((added.length ? "已加入草稿：" + added.join("、") : "") + (skipped.length ? "\n已存在跳过：" + skipped.join("、") : ""), "ok");
  }
  if(pv !== undefined) W.prices[no] = pv;
  closeMask("editMask");
  afterChange();
}
function deleteRow(m, i){
  const a = W.catalog.parts[m][i];
  if(!confirm(`从 ${m} 中删除这一行？\n\n${a[F.no]}  ${a[F.cn]}\n配置号 ${a[F.cfg]}\n\n（只影响草稿，发布前可撤销）`)) return;
  W.catalog.parts[m].splice(i, 1);
  afterChange();
}
function discardDraft(){
  if(!DIFF.list.length){ toast("没有未发布的修改"); return; }
  if(!confirm("撤销全部 " + DIFF.list.length + " 项未发布修改，恢复为网站当前数据？")) return;
  W = clone({catalog:ORIG.catalog, prices:ORIG.prices, rates:ORIG.rates});
  BASE_VER = ORIG.meta.version || 0;
  afterChange();
  toast("已撤销全部修改", "ok");
}
function openChanges(){
  document.getElementById("chgSummary").innerHTML = DIFF.list.length
    ? `<div class="hint">共 ${DIFF.list.length} 项：${esc(diffCounts())}</div>` : '<div class="hint ok">草稿与网站数据一致，没有需要发布的修改。</div>';
  document.getElementById("chgRows").innerHTML = DIFF.list.slice(0, 2000).map(x=>
    `<tr><td><span class="tag ${x.t.includes("删除") ? "err" : x.t.includes("新") ? "add" : "upd"}">${esc(x.t)}</span></td>
     <td>${esc(x.m)}</td><td>${esc(x.cfg)}</td><td class="partno">${esc(x.no)}</td><td>${x.html ? x.d : esc(x.d)}</td></tr>`).join("")
    + (DIFF.list.length > 2000 ? `<tr><td colspan="5" class="spec">只显示前 2000 项，其余 ${DIFF.list.length - 2000} 项省略</td></tr>` : "");
  document.getElementById("chgMask").classList.add("show");
}

/* ================= 导入配件表 ================= */
const KEY = {
  no:["图号","partno","零件号"], mat:["物料号","物料编码","material"], cn:["中文","name(cn)"], en:["英文","name(en)"],
  price:["单价","unitprice"], rm:["备注","remark"], qty:["数量","用量","qty"], spec:["规格","spec"],
  models:["适用机型","applicable","models"], cfg:["所属配置号","配置号","config"], cur:["币种","currency"], to:["有效期","validto"]
};
function findHeader(rows){
  const norm = s => String(s==null?"":s).replace(/\s+/g,"").replace(/[*＊]/g,"").toLowerCase();
  const findCol = (cells, keys) => {
    for(let i = 0; i < cells.length; i++){
      const t = norm(cells[i]);
      if(!t || t.length > 16) continue;          /* 只认短标签，避免说明文字被当成表头 */
      if(keys.some(k=>t.includes(k))) return i;
    }
    return -1;
  };
  for(let i = 0; i < Math.min(rows.length, 40); i++){
    const cells = rows[i] || [];
    if(findCol(cells, KEY.no) < 0) continue;
    if(findCol(cells, KEY.cn) < 0 && findCol(cells, KEY.en) < 0 && findCol(cells, KEY.price) < 0) continue;
    const im = {}; Object.keys(KEY).forEach(k=>im[k] = findCol(cells, KEY[k]));
    return {row:i, im};
  }
  return null;
}
function modelTokens(){
  const t = W.catalog.models.map(m=>({tok:m.id.toUpperCase(), id:m.id}));
  W.catalog.models.forEach(m=>{ const base = m.id.split(/[·.\-]/)[0]; if(base !== m.id) t.push({tok:base.toUpperCase(), id:m.id}); });
  return t.sort((a,b)=>b.tok.length - a.tok.length);
}
function detectModels(text){
  let hay = String(text||"").toUpperCase().replace(/[.．。\-]/g, "·");
  if(!hay.trim()) return [];
  if(/全部|(^|[^A-Z])ALL([^A-Z]|$)/.test(hay)) return W.catalog.models.map(m=>m.id);
  const out = [];
  modelTokens().forEach(({tok, id})=>{
    const t = tok.replace(/[.\-]/g, "·");
    if(hay.includes(t)){ if(!out.includes(id)) out.push(id); hay = hay.split(t).join(" "); }
  });
  return out;
}
const onlyModelTokens = text => !String(text).toUpperCase().replace(/YC80[·.\-]?9|[A-Z]\d{2}[A-Z]?|全部|ALL|[\/、,，;；\s]+/g, "").trim();

let IMP = null;   /* {fname, records, defaultModel, plan} */
function pickImport(){ document.getElementById("importFile").click(); }
document.getElementById("importFile").addEventListener("change", async e=>{
  const f = e.target.files[0]; e.target.value = "";
  if(!f) return;
  if(!/\.xlsx$/i.test(f.name)){ toast("请选择 .xlsx 文件（旧版 .xls 请先在 Excel 中另存为 .xlsx）", "err"); return; }
  let rows;
  try{ rows = await XLSX_LITE.read(f); }
  catch(err){ toast("读取失败：" + err.message, "err"); return; }
  const h = findHeader(rows);
  if(!h){ toast("没有找到表头：需要有「图号」列，以及「配件名称」或「单价」列。\n建议先点「导入模板」下载标准模板。", "err"); return; }
  const records = [];
  for(let r = h.row + 1; r < rows.length; r++){
    const c = rows[r] || [];
    const cell = k => (h.im[k] >= 0 && c[h.im[k]] != null) ? String(c[h.im[k]]).trim() : "";
    const no = cell("no");
    if(!no || no.length > 40 || /[。；：]/.test(no)) continue;     /* 空行 / 说明文字行 */
    records.push({row:r + 1, no, cn:cell("cn"), en:cell("en"), mat:cell("mat"), price:cell("price"), rm:cell("rm"),
      qty:cell("qty"), spec:cell("spec"), models:cell("models"), cfg:cell("cfg"), cur:cell("cur").toUpperCase(), to:cell("to")});
  }
  if(!records.length){ toast("表格中没有配件数据行", "err"); return; }
  IMP = {fname:f.name, records, defaultModel:document.getElementById("fModel").value};
  planImport(); renderImport();
  document.getElementById("impMask").classList.add("show");
});

function planImport(){
  const plan = [], seenNo = {};
  IMP.records.forEach(r=>{ seenNo[r.no] = (seenNo[r.no]||0) + 1; });
  const dupDone = {};
  IMP.records.forEach(r=>{
    const e = {row:r.row, no:r.no, name:r.cn || r.en, models:[], status:"same", notes:[], warn:[], ops:[]};
    plan.push(e);
    if(/示例行/.test(r.rm)){ e.status = "skip"; e.notes.push("模板示例行，已跳过"); return; }
    if(seenNo[r.no] > 1){
      dupDone[r.no] = (dupDone[r.no]||0) + 1;
      if(dupDone[r.no] < seenNo[r.no]){ e.status = "skip"; e.notes.push("图号在表中重复，以最后一行为准"); return; }
    }
    if(r.price !== "" && !(Number(r.price) >= 0)){ e.status = "err"; e.notes.push("单价不是有效数字：" + r.price); return; }
    if(r.cur && !/^[A-Z]{3}$/.test(r.cur)){ e.status = "err"; e.notes.push("币种应为 CNY / USD / EUR 等三位代码"); return; }
    if(normDate(r.to) === null){ e.status = "err"; e.notes.push("有效期格式应为 2026.12.31：" + r.to); return; }
    r.to = normDate(r.to);

    let models = detectModels(r.models), rm = r.rm;
    if(!models.length && r.rm){ models = detectModels(r.rm); if(models.length && onlyModelTokens(r.rm)) rm = ""; }
    if(!models.length){
      if(IMP.defaultModel){ models = [IMP.defaultModel]; e.warn.push("未填适用机型，按默认机型 " + IMP.defaultModel); }
    }
    e.models = models;
    const inCatalog = W.catalog.models.some(m=>(W.catalog.parts[m.id]||[]).some(a=>a[F.no] === r.no));
    if(!models.length && !inCatalog){ e.status = "err"; e.notes.push("新图号没有适用机型：请在「适用机型」列填写，或在上方选择默认机型"); return; }

    let touched = false;
    models.forEach(m=>{
      const rows = W.catalog.parts[m] || [];
      const hits = []; rows.forEach((a,i)=>{ if(a[F.no] === r.no) hits.push(i); });
      if(hits.length){
        const fields = {};
        [["cn",F.cn],["en",F.en],["spec",F.spec],["rm",F.rm]].forEach(([k,f])=>{
          const v = k === "rm" ? rm : r[k];
          if(v && hits.some(i=>String(rows[i][f]??"") !== v)) fields[f] = v;
        });
        if(Object.keys(fields).length){
          e.ops.push({t:"upd", m, idx:hits, fields}); touched = true;
          e.notes.push(m + "：更新 " + Object.keys(fields).map(f=>FIELD_CN[f]).join("、") + (hits.length > 1 ? "（" + hits.length + " 行）" : ""));
        }
      } else {
        if(!r.cn && !r.en){ e.warn.push(m + "：新配件缺少名称，未添加"); return; }
        const cfgOk = r.cfg && (W.catalog.configs[m]||[]).some(c=>c[0] === r.cfg);
        if(r.cfg && !cfgOk) e.warn.push(m + "：配置号 " + r.cfg + " 不存在，归入「新上线配件」");
        const cfg = cfgOk ? r.cfg : NEW_CFG[0];
        const qty = Number(r.qty) > 0 ? Number(r.qty) : 1;
        e.ops.push({t:"add", m, row:[cfg, 0, qty, r.no, r.cn || r.en, r.en, r.spec, rm]}); touched = true;
        e.notes.push(m + "：新增到 " + cfg);
        if(!r.en) e.warn.push("缺少英文名称（海外经销商看不懂中文）");
      }
    });

    /* 价格：只在单价 / 物料号 / 币种 / 有效期 有填写时更新，空白不清除原值 */
    const old = W.prices[r.no];
    if(r.price !== "" || r.mat || r.cur || r.to){
      const v = old ? old.slice() : ["", "", "CNY", "", ""];
      while(v.length < 5) v.push("");
      if(r.mat) v[0] = r.mat;
      if(r.cur) v[2] = r.cur;
      if(r.price !== "") v[1] = Number(r.price);
      if(r.to) v[4] = r.to;
      if(!old || String(old[1]??"") !== String(v[1]) || (old[2]||"CNY") !== v[2]) v[3] = v[1] === "" ? "" : todayDot();
      if(JSON.stringify(trimRow(v)) !== JSON.stringify(old ? trimRow(old) : null)){
        e.ops.push({t:"price", no:r.no, v}); touched = true;
        e.notes.push("价格：" + fmtPrice(old) + " → " + fmtPrice(v));
      }
    }
    if(!old && r.price === "" && e.ops.some(o=>o.t === "add")) e.warn.push("没有单价，经销商端显示「待报价」");
    if(touched) e.status = e.ops.some(o=>o.t === "add") ? "add" : "upd";
  });
  IMP.plan = plan;
}
function renderImport(){
  const P = IMP.plan, cnt = s => P.filter(x=>x.status === s).length;
  const opN = P.reduce((s,x)=>s + x.ops.length, 0);
  const noModel = P.some(x=>x.status === "err" && x.notes.some(n=>n.startsWith("新图号没有适用机型")));
  document.getElementById("impSummary").innerHTML =
    `<div class="hint">文件：<b>${esc(IMP.fname)}</b>　读取 ${P.length} 行 → 新增 <b>${cnt("add")}</b>　更新 <b>${cnt("upd")}</b>　无变化 ${cnt("same")}　跳过 ${cnt("skip")}　<span style="color:var(--danger)">错误 ${cnt("err")}</span></div>
     <div class="form-grid" style="margin-top:8px"><div><label>没填「适用机型」的行，导入到：</label>
       <select id="impDefModel"><option value="">（不导入这些行）</option>${W.catalog.models.map(m=>
         `<option value="${esc(m.id)}" ${m.id===IMP.defaultModel?"selected":""}>${esc(m.cn)}</option>`).join("")}</select></div></div>
     ${noModel ? '<div class="hint warn">有配件没有填写适用机型，可在上面选择默认机型。</div>' : ""}
     <div class="hint warn">导入只写入草稿，点「发布到网站」后经销商才能看到。表格中空白的单元格不会清除原有数据。</div>`;
  document.getElementById("impDefModel").onchange = e=>{ IMP.defaultModel = e.target.value; planImport(); renderImport(); };
  const tag = {add:["新增","add"], upd:["更新","upd"], same:["无变化","same"], skip:["跳过","same"], err:["错误","err"]};
  const order = {err:0, add:1, upd:2, skip:3, same:4};
  document.getElementById("impRows").innerHTML = P.slice().sort((a,b)=>order[a.status]-order[b.status] || a.row-b.row).map(x=>
    `<tr><td>${x.row}</td><td><span class="tag ${tag[x.status][1]}">${tag[x.status][0]}</span></td>
     <td>${x.models.map(m=>`<span class="tag">${esc(m)}</span>`).join("")}</td>
     <td class="partno">${esc(x.no)}</td><td>${esc(x.name)}</td>
     <td>${x.notes.map(esc).join("<br>")}${x.warn.length ? `<div style="color:#a66a00">⚠ ${x.warn.map(esc).join("<br>⚠ ")}</div>` : ""}</td></tr>`).join("");
  const ok = document.getElementById("impOk");
  ok.disabled = !opN;
  ok.textContent = opN ? `确认导入（${cnt("add") + cnt("upd")} 行）` : "没有需要导入的修改";
}
function confirmImport(){
  IMP.plan.forEach(e=>e.ops.forEach(o=>{
    if(o.t === "add"){
      const cfg = ensureCfg(o.m, o.row[0]);
      const row = o.row.slice(); row[0] = cfg; row[1] = nextSeq(o.m, cfg);
      (W.catalog.parts[o.m] = W.catalog.parts[o.m] || []).push(row);
    } else if(o.t === "upd"){
      o.idx.forEach(i=>{ const a = W.catalog.parts[o.m][i]; while(a.length < 8) a.push(""); Object.entries(o.fields).forEach(([f,v])=>a[f] = v); });
    } else if(o.t === "price"){
      W.prices[o.no] = o.v;
    }
  }));
  closeMask("impMask");
  afterChange();
  toast("已导入到草稿：" + IMP.fname + "\n检查无误后点「发布到网站」", "ok");
  document.getElementById("fChanged").checked = true; page = 1; renderRows();
}

/* ================= 导出（xlsx，列与导入模板一致，可修改后再导入） ================= */
const TPL_COLS = [
  ["序号",6], ["配件名称(中文) *",26], ["配件名称(英文) *",30], ["图号 *",22], ["物料号 *",14], ["单价 *",10],
  ["备注 *",24], ["数量",8], ["规格",18], ["适用机型",18], ["所属配置号",18], ["币种",8], ["有效期至",12]
];
function rowForExport(m, a, n){
  const p = W.prices[a[F.no]] || [];
  return [n, a[F.cn]||"", a[F.en]||"", a[F.no], p[0]||"", p[1] === "" || p[1] == null ? "" : Number(p[1]),
          a[F.rm]||"", a[F.qty], a[F.spec]||"", m, a[F.cfg], p[2]||"", p[4]||""];
}
function exportAll(){
  const list = VIEW.length ? VIEW : [];
  if(!list.length){ toast("当前筛选结果为空", "err"); return; }
  const S = XLSX_LITE.S;
  const rows = [TPL_COLS.map(c=>({v:c[0], s:S.DHEAD}))];
  list.forEach(({m, i}, n)=>rows.push(rowForExport(m, W.catalog.parts[m][i], n + 1)));
  const fm = document.getElementById("fModel").value;
  const blob = XLSX_LITE.write([{name:"配件清单", rows, widths:TPL_COLS.map(c=>c[1]), freeze:1, autoFilter:`A1:M${rows.length}`}]);
  saveFile(blob, "配件清单_" + (fm || "全部机型") + "_" + todayStr() + ".xlsx");
}
function downloadTemplate(){
  const S = XLSX_LITE.S, rows = [], mg = [];
  const line = (t, s) => { rows.push([{v:t, s:s||S.NOTE}]); mg.push(`A${rows.length}:M${rows.length}`); };
  rows.push([{v:"配件导入表格模板（* 为必填项）  /  PARTS IMPORT TEMPLATE", s:S.TITLE}]); mg.push("A1:M1");
  line("适用机型可填：" + W.catalog.models.map(m=>m.id).join("、") + "；多个机型用 / 分隔（如 U17/U18/U20），填「全部」表示所有机型。");
  line("一行一个配件。图号已存在于该机型时更新名称 / 规格 / 备注；表中空白的单元格不会清除原有数据。");
  line("单价按图号统一（所有机型共用）；币种不填时沿用原币种，新配件默认 CNY。");
  rows.push([]);
  rows.push(TPL_COLS.map(c=>({v:c[0], s:S.HEAD})));
  const m0 = W.catalog.models[0].id;
  (W.catalog.parts[m0]||[]).filter(a=>W.prices[a[F.no]]).slice(0, 3).forEach((a, n)=>{
    const r = rowForExport(m0, a, n + 1); r[6] = "示例行，可删除";
    rows.push(r.map((v, k)=>({v, s:[1,2,6,8].includes(k) ? S.LEFT : S.CTR})));
  });
  rows.push([]);
  line("填写说明 Instructions：", S.NOTE_B);
  line("1. 从第 7 行开始填写；备注含「示例行」的行导入时自动跳过。表头文字请勿修改，系统按表头识别各列，列的顺序可以调整。");
  line("2. 所属配置号需与该机型目录中的配置号一致（如 S35E-AE02.01）；不填或填错的新配件归入「新上线配件」分类。");
  line("3. 数量 = 单车用量，只对新增配件生效。有效期至格式：2026.12.31。");
  line("4. 在管理页点「导入配件表」选择本文件，确认预览后写入草稿，再点「发布到网站」。");
  const blob = XLSX_LITE.write([{name:"配件导入模板", rows, merges:mg, heights:{1:28}, widths:TPL_COLS.map(c=>c[1])}]);
  saveFile(blob, "配件导入表格模板.xlsx");
}

/* ================= 发布 ================= */
const GH_KEY = "yc_admin_gh";
let GH = LS.get(GH_KEY, {owner:"", repo:"", branch:"main", name:"", token:""});
function openSettings(){
  ["owner","repo","branch","name","token"].forEach(k=>setVal("s" + k[0].toUpperCase() + k.slice(1), GH[k] || (k === "branch" ? "main" : "")));
  document.getElementById("sHint").style.display = "none";
  document.getElementById("setMask").classList.add("show");
}
function readSettings(){
  return {owner:getVal("sOwner"), repo:getVal("sRepo"), branch:getVal("sBranch") || "main", name:getVal("sName"), token:getVal("sToken")};
}
function saveSettings(){ GH = readSettings(); LS.set(GH_KEY, GH); closeMask("setMask"); toast("设置已保存（仅本机）", "ok"); }
function clearToken(){ GH.token = ""; setVal("sToken", ""); LS.set(GH_KEY, GH); toast("令牌已从本机清除", "ok"); }
async function gh(cfg, path, method, body){
  let r;
  try{
    r = await fetch("https://api.github.com/repos/" + encodeURIComponent(cfg.owner) + "/" + encodeURIComponent(cfg.repo) + path, {
      method: method || "GET", cache:"no-store",
      headers: {"Authorization":"Bearer " + cfg.token, "Accept":"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28",
                ...(body ? {"Content-Type":"application/json"} : {})},
      body: body ? JSON.stringify(body) : undefined
    });
  }catch(e){ throw new Error("连接不上 GitHub（国内网络可能不稳定）。可稍后重试，或改用「下载数据包（手动上传）」。"); }
  const j = await r.json().catch(()=>null);
  if(!r.ok){
    const msg = {401:"令牌无效或已过期", 403:"令牌没有该仓库的写入权限", 404:"找不到仓库 / 分支 / 文件，或令牌未授权该仓库", 409:"仓库为空或分支冲突", 422:"请求被拒绝"}[r.status];
    throw new Error("GitHub " + r.status + "：" + (msg || "") + (j && j.message ? "（" + j.message + "）" : ""));
  }
  return j;
}
function b64utf8(b64){ return new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), c=>c.charCodeAt(0))); }
async function testConn(){
  const cfg = readSettings(), h = document.getElementById("sHint");
  h.style.display = "block"; h.className = "hint"; h.textContent = "正在连接…";
  try{
    if(!cfg.owner || !cfg.repo || !cfg.token) throw new Error("请填写用户名、仓库名和令牌");
    const repo = await gh(cfg, "");
    if(!repo.permissions || !repo.permissions.push) throw new Error("令牌只有读取权限，请在 GitHub 中给它 Contents: Read and write");
    const meta = JSON.parse(b64utf8((await gh(cfg, "/contents/data/meta.json?ref=" + encodeURIComponent(cfg.branch))).content));
    h.className = "hint ok"; h.textContent = "✓ 连接成功：" + repo.full_name + "，仓库中数据版本 v" + meta.version;
  }catch(e){ h.className = "hint err"; h.textContent = e.message; }
}
/* 生成要发布的三个文件内容 */
function buildFiles(version, summary){
  const catalog = clone(W.catalog);
  Object.keys(catalog.configs).forEach(m=>{
    const used = new Set((catalog.parts[m]||[]).map(a=>a[F.cfg]));
    catalog.configs[m] = catalog.configs[m].filter(c=>c[0] !== NEW_CFG[0] || used.has(NEW_CFG[0]));
  });
  const meta = {version, updatedAt:nowStr(), updatedBy:GH.name || "管理员", summary};
  return {meta, files:{"data/catalog.json":DATA_FMT.catalog(catalog), "data/prices.json":DATA_FMT.prices(W.prices), "data/rates.json":DATA_FMT.rates(W.rates), "data/meta.json":DATA_FMT.meta(meta)}};
}
function openPublish(){
  if(!DIFF.list.length){ toast("没有需要发布的修改"); return; }
  document.getElementById("pubSummary").innerHTML = `<div class="hint">将发布 ${DIFF.list.length} 项修改：${esc(diffCounts())}　<a href="#" onclick="openChanges();return false">查看明细</a></div>`
    + (GH.token ? "" : '<div class="hint warn">还没有填写发布设置（GitHub 令牌）。可以先点右上角「⚙ 发布设置」，或使用「下载数据包」手动上传。</div>');
  document.getElementById("pubBtn").disabled = false;
  document.getElementById("pubMask").classList.add("show");
}
async function publish(){
  if(!GH.owner || !GH.repo || !GH.token){ toast("请先在「⚙ 发布设置」中填写 GitHub 信息", "err"); openSettings(); return; }
  const btn = document.getElementById("pubBtn"), hint = document.getElementById("pubHint");
  btn.disabled = true; hint.className = "hint"; hint.textContent = "正在检查网站数据版本…";
  try{
    const br = encodeURIComponent(GH.branch);
    const remoteMeta = JSON.parse(b64utf8((await gh(GH, "/contents/data/meta.json?ref=" + br)).content));
    if((remoteMeta.version || 0) !== BASE_VER &&
       !confirm(`网站数据已被更新为 v${remoteMeta.version}（${remoteMeta.updatedAt || ""} ${remoteMeta.updatedBy || ""}），你的草稿基于 v${BASE_VER}。\n\n继续发布会覆盖对方的修改。确定继续？`)){
      hint.textContent = "已取消。建议刷新页面加载最新数据后重新修改。"; btn.disabled = false; return;
    }
    const summary = (getVal("pubMsg") || "数据更新") + "（" + diffCounts() + "）";
    const out = buildFiles((remoteMeta.version || 0) + 1, summary);
    hint.textContent = "正在上传…";
    const ref = await gh(GH, "/git/ref/heads/" + br);
    const head = await gh(GH, "/git/commits/" + ref.object.sha);
    const tree = [];
    for(const [path, content] of Object.entries(out.files)){
      const blob = await gh(GH, "/git/blobs", "POST", {content, encoding:"utf-8"});
      tree.push({path, mode:"100644", type:"blob", sha:blob.sha});
    }
    const t = await gh(GH, "/git/trees", "POST", {base_tree:head.tree.sha, tree});
    const commit = await gh(GH, "/git/commits", "POST", {message:"数据 v" + out.meta.version + "：" + summary, tree:t.sha, parents:[ref.object.sha]});
    await gh(GH, "/git/refs/heads/" + br, "PATCH", {sha:commit.sha});
    ORIG = {meta:out.meta, catalog:JSON.parse(out.files["data/catalog.json"]), prices:clone(W.prices), rates:clone(W.rates)};
    W.catalog = clone(ORIG.catalog);
    BASE_VER = out.meta.version;
    setVal("pubMsg", "");
    closeMask("pubMask");
    afterChange();
    toast("✓ 已发布 v" + out.meta.version + "，约 1–2 分钟后网站自动更新", "ok");
  }catch(e){
    hint.className = "hint err"; hint.textContent = e.message; btn.disabled = false;
  }
}
function downloadPackage(){
  const out = buildFiles(BASE_VER + 1, (getVal("pubMsg") || "数据更新") + "（" + diffCounts() + "）");
  const files = Object.entries(out.files).map(([name, s])=>({name, data:XLSX_LITE.enc.encode(s)}));
  saveFile(XLSX_LITE.zip(files), "配件数据_v" + out.meta.version + "_" + todayStr() + ".zip");
  const hint = document.getElementById("pubHint");
  hint.className = "hint warn";
  hint.innerHTML = "手动上传：解压后打开 GitHub 仓库页面 → Add file → Upload files → 把解压出的 <b>data 文件夹</b>整个拖进去 → Commit changes。<br>上传完成后刷新本页面，并在提示时选择放弃旧草稿。";
}

/* ================= 事件 / 初始化 ================= */
document.getElementById("rows").addEventListener("click", e=>{
  const ed = e.target.closest("[data-edit]"), dl = e.target.closest("[data-del]");
  if(ed){ const [m, i] = ed.dataset.edit.split("|"); openEdit(m, +i); }
  if(dl){ const [m, i] = dl.dataset.del.split("|"); deleteRow(m, +i); }
});
bindPager(document.getElementById("pager"), () => pageCount(VIEW.length, pageSize),
  p => { page = p; renderRows(); document.querySelector(".wrap .card").scrollIntoView({behavior:"smooth"}); },
  s => { page = Math.floor((page-1) * pageSize / s) + 1; pageSize = s; LS.set("yc_admin_page_size", s); renderRows(); });
let qTimer = null;
document.getElementById("q").addEventListener("input", ()=>{ clearTimeout(qTimer); qTimer = setTimeout(()=>{ page = 1; renderRows(); }, 200); });
["fModel","fNoPrice","fChanged"].forEach(id=>document.getElementById(id).addEventListener("change", ()=>{ page = 1; renderRows(); }));
document.getElementById("eModel").addEventListener("change", e=>{ fillCfgOptions(e.target.value, NEW_CFG[0]); renderModelPicks(e.target.value); });
document.getElementById("eNo").addEventListener("change", lookupNo);
document.querySelectorAll(".mask").forEach(m=>m.addEventListener("click", e=>{ if(e.target === m) m.classList.remove("show"); }));
document.addEventListener("keydown", e=>{ if(e.key === "Escape") document.querySelectorAll(".mask.show").forEach(m=>m.classList.remove("show")); });
window.addEventListener("beforeunload", e=>{ if(DIFF.list.length){ e.preventDefault(); e.returnValue = ""; } });

(async function init(){
  try{
    const d = await loadData(true);
    ORIG = {meta:d.meta, catalog:d.catalog, prices:d.prices, rates:d.rates};
  }catch(err){
    document.getElementById("loading").outerHTML = loadErrorHtml(err);
    return;
  }
  W = clone({catalog:ORIG.catalog, prices:ORIG.prices, rates:ORIG.rates});
  BASE_VER = ORIG.meta.version || 0;
  let restored = false;
  try{
    const draft = await IDB.get("draft");
    if(draft){
      if(draft.base === BASE_VER || confirm(`本机有一份未发布的草稿（基于 v${draft.base}），但网站数据已更新为 v${BASE_VER}。\n\n确定 = 继续使用旧草稿（发布时可能覆盖新数据）\n取消 = 放弃旧草稿`)){
        W = {catalog:draft.catalog, prices:draft.prices, rates:normRates(draft.rates || ORIG.rates)}; BASE_VER = draft.base; restored = true;
      } else await IDB.del("draft");
    }
  }catch(e){ toast("读取草稿失败：" + e.message, "err"); }
  document.getElementById("fModel").innerHTML += W.catalog.models.map(m=>`<option value="${esc(m.id)}">${esc(m.cn)}</option>`).join("");
  document.getElementById("loading").remove();
  document.getElementById("app").style.display = "";
  computeDiff(); renderStats(); renderRows();
  if(restored && DIFF.list.length) toast("已恢复上次未发布的草稿（" + DIFF.list.length + " 项修改）", "ok");
})();
