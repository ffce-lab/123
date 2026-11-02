"use strict";
/* ===== 经销商页与管理页共用：数据格式、xlsx 读写、工具函数（无外部依赖） ===== */

/* ================= 工具 ================= */
const CUR_SYM = {CNY:"¥", USD:"$", EUR:"€"};
const esc = s => String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad2 = n => String(n).padStart(2,"0");
function todayStr(){ const d=new Date(); return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }
function nowStr(){ const d=new Date(); return todayStr()+" "+pad2(d.getHours())+":"+pad2(d.getMinutes()); }
function money(v){ return Number(v||0).toFixed(2); }
function curSym(c){ return CUR_SYM[c] || (c ? c+" " : ""); }

const LS = {
  get:(k,d)=>{ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } },
  set:(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); return true; }catch(e){ return false; } },
  del:k=>{ try{ localStorage.removeItem(k); }catch(e){} }
};

function toast(msg, type){
  let box = document.getElementById("toastBox");
  if(!box){ box = document.createElement("div"); box.id = "toastBox"; box.className = "toast-box"; document.body.appendChild(box); }
  const d = document.createElement("div");
  d.className = "toast " + (type||"");
  d.textContent = msg;
  box.appendChild(d);
  setTimeout(()=>{ d.classList.add("out"); setTimeout(()=>d.remove(), 320); }, type==="err"?6000:3600);
}

/* ================= 分页：页码按钮 + 跳转到第几页 + 每页条数 ================= */
const PAGE_SIZES = [20, 50, 100, 200];
function pageCount(total, size){ return Math.max(1, Math.ceil(total / size)); }
/* 页码列表：首页、末页、当前页前后各 2 页，中间用 0 表示省略号 */
function pageList(page, pages){
  const arr = [...new Set([1, pages, page-2, page-1, page, page+1, page+2])].filter(p=>p>=1 && p<=pages).sort((a,b)=>a-b);
  const out = [];
  arr.forEach((p,i)=>{ if(i && p - arr[i-1] > 1) out.push(0); out.push(p); });
  return out;
}
/* L：文字 {total(n), prev, next, goto, of(pages), perPage} */
function pagerHtml(total, page, size, L){
  const pages = pageCount(total, size);
  let h = `<span class="pg-total">${esc(L.total(total))}</span><span class="spacer"></span>`;
  if(pages > 1){
    h += `<button ${page<=1?"disabled":""} data-page="${page-1}">‹ ${esc(L.prev)}</button>`
      + pageList(page, pages).map(p=>p
          ? `<button class="${p===page?"cur":""}" data-page="${p}">${p}</button>`
          : `<span class="gap">…</span>`).join("")
      + `<button ${page>=pages?"disabled":""} data-page="${page+1}">${esc(L.next)} ›</button>`
      + `<label class="pg-jump">${esc(L.goto)} <input type="number" min="1" max="${pages}" value="${page}" data-jump> ${esc(L.of(pages))}</label>`;
  }
  h += `<label class="pg-size">${esc(L.perPage)} <select data-size>${PAGE_SIZES.map(s=>
         `<option value="${s}" ${s===size?"selected":""}>${s}</option>`).join("")}</select></label>`;
  return h;
}
/* 绑定一次即可（分页区域重绘后仍有效）；getPages 返回当前总页数 */
function bindPager(el, getPages, onPage, onSize){
  const jump = input => {
    const p = Math.min(getPages(), Math.max(1, parseInt(input.value, 10) || 1));
    onPage(p);
  };
  el.addEventListener("click", e=>{
    const b = e.target.closest("button[data-page]");
    if(b && !b.disabled) onPage(+b.dataset.page);
  });
  el.addEventListener("change", e=>{
    if(e.target.matches("[data-size]")) onSize(+e.target.value);
    else if(e.target.matches("[data-jump]")) jump(e.target);
  });
  el.addEventListener("keydown", e=>{
    if(e.key === "Enter" && e.target.matches("[data-jump]")){ e.preventDefault(); jump(e.target); }
  });
}

/* ================= 数据格式 =================
 * data/catalog.json  {models:[{id,cn,en}], configs:{机型:[[配置号,中文,英文]]}, parts:{机型:[[配置号,序号,单车用量,图号,中文,英文,规格,备注]]}}
 * data/prices.json   {图号:[物料号,单价,币种,生效日期,失效日期]}
 * data/meta.json     {version,updatedAt,updatedBy,summary}
 * 每条记录占一行，便于在 GitHub 上查看每次修改了哪些行。
 */
const PART_FIELDS = ["cfg","seq","qty","no","cn","en","spec","rm"];
function partObj(a){ const o = {}; PART_FIELDS.forEach((k,i)=>o[k] = a[i]==null ? "" : a[i]); return o; }
function priceObj(a){ return a ? {code:a[0]||"", price:a[1], currency:a[2]||"CNY", from:a[3]||"", to:a[4]||""} : null; }
function trimRow(a){ a = a.map(x=>x==null?"":x); while(a.length && a[a.length-1]==="") a.pop(); return a; }

const DATA_FMT = {
  catalog(c){
    const J = v => JSON.stringify(v);
    const group = obj => Object.keys(obj).map(k=>J(k)+":[\n"+obj[k].map(r=>J(trimRow(r))).join(",\n")+"]").join(",\n");
    return '{"models":[\n' + c.models.map(J).join(",\n") + '],\n"configs":{\n' + group(c.configs)
      + '},\n"parts":{\n' + group(c.parts) + "}}\n";
  },
  prices(p){
    return "{\n" + Object.keys(p).map(k=>JSON.stringify(k)+":"+JSON.stringify(trimRow(p[k]))).join(",\n") + "\n}\n";
  },
  meta(m){ return JSON.stringify(m, null, 2) + "\n"; },
  rates(r){ return JSON.stringify(r, null, 2) + "\n"; }
};

/* ================= 币种与汇率 =================
 * data/rates.json  {base:"CNY", default:"USD", rates:{USD:7.1, EUR:7.8}, date:"2026-11-02", updatedBy:""}
 * rates 为「1 外币 = ? 人民币」，由管理员手工填写；null 表示未设置，经销商端不提供该币种。
 */
const CURRENCIES = ["CNY", "USD", "EUR"];
function normRates(r){
  r = r && typeof r === "object" ? r : {};
  const rates = {};
  CURRENCIES.filter(c=>c !== "CNY").forEach(c=>{ const v = Number(r.rates && r.rates[c]); rates[c] = v > 0 ? v : null; });
  return {base:"CNY", default:CURRENCIES.includes(r.default) ? r.default : "CNY", rates, date:r.date || "", updatedBy:r.updatedBy || ""};
}
/* 1 单位 cur 折合多少人民币；未设置汇率返回 null */
function cnyPer(R, cur){ return cur === "CNY" ? 1 : (R.rates[cur] || null); }
function availCurrencies(R){ return CURRENCIES.filter(c=>cnyPer(R, c)); }
/* 金额换算，结果保留两位小数；原价大于 0 时换算结果至少 0.01，避免小件显示为 0 */
function convertAmount(v, from, to, R){
  if(from === to) return Number(v);
  const a = cnyPer(R, from), b = cnyPer(R, to);
  if(!a || !b) return null;
  const x = Math.round(Number(v) * a / b * 100) / 100;
  return x === 0 && Number(v) > 0 ? 0.01 : x;
}
function fmtRate(v){ return String(Number(Number(v).toFixed(4))); }

/* 读取 data/ 下的数据文件。meta.json 每次都取最新；其余文件按版本号缓存，发布新版本后自动刷新 */
async function loadData(noCache){
  const get = async (path, fresh) => {
    const r = await fetch(path, {cache: fresh ? "no-store" : "default"});
    if(!r.ok) throw new Error(path.split("?")[0] + " → HTTP " + r.status);
    return r.json();
  };
  const meta = await get("data/meta.json?t=" + Date.now(), true);
  const v = encodeURIComponent(meta.version || 0);
  const [catalog, prices, rates] = await Promise.all([
    get("data/catalog.json?v=" + v, noCache), get("data/prices.json?v=" + v, noCache),
    get("data/rates.json?v=" + v, noCache).catch(()=>null)      /* 旧数据没有汇率文件时按只显示原币处理 */
  ]);
  return {meta, catalog, prices, rates: normRates(rates)};
}
function loadErrorHtml(err){
  const local = location.protocol === "file:";
  return `<div class="loading err"><b>数据加载失败 Failed to load data</b><br>${esc(err && err.message || err)}<br><br>`
    + (local ? "本页面需要通过网址访问，不能直接双击 HTML 文件打开。<br>本地预览请运行「本地预览.bat」。"
             : "请检查网络后刷新页面 Please check your network and refresh.") + "</div>";
}

/* 同图号 → 适用机型 */
function buildModelsOf(catalog){
  const map = {};
  catalog.models.forEach(m=>(catalog.parts[m.id]||[]).forEach(a=>{
    const no = a[3];
    if(!map[no]) map[no] = [];
    if(!map[no].includes(m.id)) map[no].push(m.id);
  }));
  return map;
}

/* ================= 轻量 XLSX 读写 ================= */
const XLSX_LITE = (() => {
  const enc = new TextEncoder();
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const x = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const colName = i => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const colIndex = ref => { let n = 0; for (const ch of ref.replace(/[0-9]/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

  function zip(files, type) {
    const parts = [], central = []; let offset = 0;
    files.forEach(f => {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data);
      const lh = new Uint8Array(30 + name.length), dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true);
      dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
      dv.setUint16(26, name.length, true); lh.set(name, 30);
      parts.push(lh, data);
      const ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
      ch.set(name, 46); central.push(ch); offset += lh.length + data.length;
    });
    let cdSize = 0; central.forEach(c => cdSize += c.length);
    const eocd = new Uint8Array(22), ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    return new Blob([...parts, ...central, eocd], { type: type || "application/zip" });
  }

  /* 样式编号（与《出口配件需求定单》模板一致：微软雅黑 10 号、细边框、表头浅蓝底） */
  const S = {TITLE:1, LABEL:2, VALUE:3, HEAD:4, SUBHEAD:5, CTR:6, LEFT:7, MONEY:8, NOTE:9, NOTE_B:10, DHEAD:11, TOTAL:12, MONEY_B:13};
  const BD = '<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>';
  const font = (sz, b, color) => `<font>${b?"<b/>":""}<sz val="${sz}"/>${color?`<color rgb="${color}"/>`:""}<name val="微软雅黑"/><charset val="134"/></font>`;
  const al = (h, wrap) => `<alignment horizontal="${h}" vertical="center"${wrap?' wrapText="1"':""}/>`;
  const xf = (numFmt, fontId, fillId, borderId, align) =>
    `<xf numFmtId="${numFmt}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${align}</xf>`;
  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<fonts count="4">${font(10)}${font(10,1)}${font(16,1)}${font(10,1,"FFFFFFFF")}</fonts>` +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF12395F"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${BD}</borders>` +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="14">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      xf(0,2,0,1,al("center",1)) +   /* 1 TITLE */
      xf(0,1,0,1,al("left")) +       /* 2 LABEL */
      xf(0,0,0,1,al("left")) +       /* 3 VALUE */
      xf(0,1,2,1,al("center",1)) +   /* 4 HEAD */
      xf(0,0,2,1,al("center",1)) +   /* 5 SUBHEAD */
      xf(0,0,0,1,al("center",1)) +   /* 6 CTR */
      xf(0,0,0,1,al("left",1)) +     /* 7 LEFT */
      xf(2,0,0,1,al("center")) +     /* 8 MONEY 0.00 */
      xf(0,0,0,0,al("left")) +       /* 9 NOTE */
      xf(0,1,0,0,al("left")) +       /* 10 NOTE_B */
      xf(0,3,3,1,al("center",1)) +   /* 11 DHEAD 数据表表头 */
      xf(0,1,0,1,al("center")) +     /* 12 TOTAL */
      xf(2,1,0,1,al("center")) +     /* 13 MONEY_B */
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  /* 单元格：原始值，或 {v, s, f}（f 为公式，v 为缓存结果） */
  function cellXml(ref, raw, defStyle) {
    let v = raw, s = defStyle, f = null;
    if (raw && typeof raw === "object") { v = raw.v; f = raw.f || null; if (raw.s != null) s = raw.s; }
    const a = s ? ` s="${s}"` : "";
    if (f) return `<c r="${ref}"${a}><f>${x(f)}</f>${typeof v === "number" && isFinite(v) ? `<v>${v}</v>` : ""}</c>`;
    if (v === null || v === undefined || v === "") return `<c r="${ref}"${a}/>`;
    if (typeof v === "number" && isFinite(v)) return `<c r="${ref}"${a}><v>${v}</v></c>`;
    return `<c r="${ref}"${a} t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  }

  function sheetXml(sh) {
    const rows = sh.rows || [];
    const body = rows.map((row, ri) => {
      const cells = (row || []).map((v, ci) => cellXml(colName(ci) + (ri + 1), v, 0)).join("");
      const h = sh.heights && sh.heights[ri + 1];
      return `<row r="${ri + 1}"${h ? ` ht="${h}" customHeight="1"` : ""}>${cells}</row>`;
    }).join("");
    const cols = (sh.widths && sh.widths.length)
      ? `<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    const pane = sh.freeze ? `<pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/>` : "";
    const filter = sh.autoFilter ? `<autoFilter ref="${sh.autoFilter}"/>` : "";
    const merges = (sh.merges && sh.merges.length)
      ? `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
      `<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${body}</sheetData>${filter}${merges}` +
      '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/></worksheet>';
  }

  /* sheets: [{name, rows, widths, merges, heights, freeze, autoFilter}] */
  function write(sheets) {
    const names = sheets.map((s, i) => String(s.name || ("Sheet" + (i + 1))).replace(/[\\\/\?\*\[\]:]/g, "_").slice(0, 31));
    const files = [
      { name: "[Content_Types].xml", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>') },
      { name: "_rels/.rels", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
      { name: "xl/workbook.xml", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
        + names.map((n, i) => `<sheet name="${x(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + '</sheets><calcPr fullCalcOnLoad="1"/></workbook>') },
      { name: "xl/_rels/workbook.xml.rels", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")
        + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
      { name: "xl/styles.xml", data: enc.encode(STYLES) },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(s)) }))
    ];
    return zip(files, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  async function inflate(data) {
    if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器不支持读取 xlsx，请使用新版 Chrome / Edge。");
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new TextDecoder().decode(new Uint8Array(await new Response(stream).arrayBuffer()));
  }

  /* 读取第一个工作表 → 二维数组 */
  async function read(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const dv = new DataView(buf.buffer);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("不是有效的 xlsx 文件");
    const count = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
    const files = {}; let p = cdOff;
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      files[new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen))] = { method, csize, lho };
      p += 46 + nlen + elen + clen;
    }
    async function entry(name) {
      const f = files[name]; if (!f) return null;
      const nlen = dv.getUint16(f.lho + 26, true), elen = dv.getUint16(f.lho + 28, true);
      const start = f.lho + 30 + nlen + elen;
      const data = buf.subarray(start, start + f.csize);
      return f.method === 0 ? new TextDecoder().decode(data) : inflate(data);
    }
    const parser = new DOMParser();
    /* 只取正文 <t>，忽略拼音注释 <rPh> 里的 <t> */
    const textOf = el => Array.from(el.getElementsByTagName("t")).filter(t => t.parentNode.nodeName !== "rPh").map(t => t.textContent).join("");
    const sharedXml = await entry("xl/sharedStrings.xml");
    const shared = sharedXml ? Array.from(parser.parseFromString(sharedXml, "application/xml").getElementsByTagName("si")).map(textOf) : [];
    let sheetName = "xl/worksheets/sheet1.xml";
    if (!files[sheetName]) {
      sheetName = Object.keys(files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
      if (!sheetName) throw new Error("xlsx 中没有工作表");
    }
    const doc = parser.parseFromString(await entry(sheetName), "application/xml");
    const rows = [];
    Array.from(doc.getElementsByTagName("row")).forEach(r => {
      const ri = parseInt(r.getAttribute("r"), 10) - 1;
      const arr = rows[ri] || (rows[ri] = []);
      Array.from(r.getElementsByTagName("c")).forEach(c => {
        const ref = c.getAttribute("r") || "";
        const ci = ref ? colIndex(ref) : arr.length;
        const t = c.getAttribute("t");
        let v = "";
        if (t === "s") v = shared[parseInt((c.getElementsByTagName("v")[0] || {}).textContent || "-1", 10)] || "";
        else if (t === "inlineStr") v = textOf(c);
        else {
          const vn = c.getElementsByTagName("v")[0];
          v = vn ? vn.textContent : "";
          if (v !== "" && t !== "str" && !isNaN(Number(v))) v = Number(v);
        }
        arr[ci] = v;
      });
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    return rows;
  }

  return { write, read, zip, S, enc };
})();

/* 保存文件：支持“另存为”的浏览器弹出保存对话框，否则下载到默认下载目录；msg 可替换提示文字 {saved, downloaded} */
async function saveFile(blob, fname, msg){
  msg = msg || {saved:"已保存：", downloaded:"已下载到浏览器默认下载目录（Ctrl+J 查看）\n"};
  if(window.showSaveFilePicker){
    try{
      const ext = fname.slice(fname.lastIndexOf("."));
      const h = await window.showSaveFilePicker({suggestedName:fname, types:[{description:ext, accept:{[blob.type||"application/octet-stream"]:[ext]}}]});
      const w = await h.createWritable(); await w.write(blob); await w.close();
      toast(msg.saved + fname, "ok");
      return true;
    }catch(e){
      if(e && e.name === "AbortError") return false;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(msg.downloaded + fname, "ok");
  return true;
}
