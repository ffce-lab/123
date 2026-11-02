"use strict";
/* ===== 经销商页界面文字（中文 / English / Français）=====
 * 新增语言：在 LANGS 里加一项，并在 I18N 里补齐同样的键。
 * 配件名称、分类名称来自数据（只有中文、英文）；英文 / 法文界面下显示英文名称，没有英文名时显示中文。
 */
const LANGS = [
  {id:"zh", label:"中文"},
  {id:"en", label:"English"},
  {id:"fr", label:"Français"}
];

const I18N = {
  zh: {
    pageTitle: "海外经销商配件下单查询系统",
    brand: "海外配件商城", brandSub: "OVERSEAS PARTS MALL",
    cart: "购物车", loading: "正在加载配件数据…",
    partsCount: "配件：{n}", updated: "数据更新：{d}",
    searchPh: "搜索图号 / 名称",
    categories: "配件分类 / 总成目录",
    allParts: "全部配件", itemsN: "共 {n} 项", catN: "{n} 项",
    scope: "当前范围：", clickCat: "· 按总成分类浏览请点击左侧目录", curCat: "当前分类：",
    partsBook: "零部件图册",
    thNo: "序号", thPartNo: "零件图号", thDesc: "名称", thSpec: "规格 / 备注", thQtyUnit: "单车用量",
    thModels: "适用机型", thPrice: "单价", thQty: "数量", thAction: "操作",
    emptyCat: "该分类在图册中无独立零件明细", noMatch: "无匹配配件",
    onRequest: "待报价", common: "通用件", add: "加入", inCart: "✓ 已加 ×{n}",
    added: "已加入购物车：{no} × {q}", badQty: "请输入有效数量",
    pgTotal: "共 {n} 条", pgFiltered: "（已按关键词筛选）", pgPrev: "上一页", pgNext: "下一页",
    pgGoto: "跳至", pgOf: "/ {n} 页", pgPerPage: "每页",
    cartTitle: "购物车 / 订单", close: "关闭",
    selected: "已选配件（{n}）",
    cartEmpty: "购物车是空的，请在配件列表中点击「加入」。",
    cPartNo: "图号", cDesc: "名称", cModel: "机型", cPrice: "单价", cQty: "数量", cSubtotal: "小计",
    discontinued: "已下架", remove: "删除",
    orderInfo: "订单信息",
    fCust: "客户名称（售达方/送达方）", fCustPh: "经销商公司名称",
    fContact: "联系人", fTel: "联系方式（电话 / WhatsApp / 邮箱）",
    fDeliv: "期望交货日期", fTrans: "运输方式", fSelect: "— 请选择 —",
    tSea: "海运", tAir: "空运", tExpress: "快递", tMachine: "随整机发货", tOther: "其他（请在备注说明）",
    fPayer: "收票方/付款方（选填）",
    fRemark: "备注（机器序列号、故障说明等）",
    staffNote: "定单编号、编制人、付款方式、报关方式由我司业务人员填写，无需填写。",
    total: "合计：", onReqN: "（另有 {n} 项待报价）",
    clear: "清空", continue: "继续选购", generate: "生成订单 Excel",
    confirmClear: "确定清空购物车？", cartIsEmpty: "购物车是空的", fillReq: "请填写必填项：\n{list}",
    doneTitle: "✓ 订单文件已生成", fileName: "文件名：{f}",
    nextStep: "下一步：请将这个 Excel 文件通过微信 / WhatsApp / 邮件发送给我司业务员，订单以我方收到文件为准。",
    findFile: "找不到文件？按 Ctrl+J 打开浏览器下载记录。",
    keepCart: "保留购物车", clearCart: "清空购物车",
    saved: "已保存：", downloaded: "已下载到浏览器默认下载目录（Ctrl+J 查看）：\n",
    footer: "选好配件后点击右上角「购物车」生成订单 Excel，并将文件发送给我司业务员。",
    currency: "货币",
    rateNote: "价格按管理员设定的参考汇率换算（1 {cur} = {rate} CNY，{date} 更新），不是实时汇率，最终以我司报价为准。",
    rateNoteShort: "参考汇率 1 {cur} = {rate} CNY（{date}），非实时汇率",
    origPrice: "原价 {p}",
    langLabel: "语言"
  },

  en: {
    pageTitle: "Overseas Distributor Parts Ordering",
    brand: "Overseas Parts Mall", brandSub: "SPARE PARTS ORDERING",
    cart: "Cart", loading: "Loading parts data…",
    partsCount: "Parts: {n}", updated: "Updated: {d}",
    searchPh: "Search part no. or name",
    categories: "Categories",
    allParts: "All parts", itemsN: "{n} items", catN: "{n}",
    scope: "Scope:", clickCat: "· Click a category on the left to browse by assembly", curCat: "Category:",
    partsBook: "Spare Parts Book",
    thNo: "No.", thPartNo: "Part No.", thDesc: "Description", thSpec: "Spec / Remark", thQtyUnit: "Qty per machine",
    thModels: "Applicable models", thPrice: "Unit price", thQty: "Qty", thAction: "Action",
    emptyCat: "No separate parts list for this category", noMatch: "No matching parts",
    onRequest: "On request", common: "Common part", add: "Add", inCart: "✓ In cart ×{n}",
    added: "Added to cart: {no} × {q}", badQty: "Please enter a valid quantity",
    pgTotal: "{n} items", pgFiltered: " (filtered)", pgPrev: "Prev", pgNext: "Next",
    pgGoto: "Go to", pgOf: "of {n}", pgPerPage: "Per page",
    cartTitle: "Cart & Order", close: "Close",
    selected: "Selected parts ({n})",
    cartEmpty: "Your cart is empty. Click \"Add\" in the parts list.",
    cPartNo: "Part No.", cDesc: "Description", cModel: "Model", cPrice: "Price", cQty: "Qty", cSubtotal: "Subtotal",
    discontinued: "Discontinued", remove: "Remove",
    orderInfo: "Order information",
    fCust: "Customer / Company", fCustPh: "Distributor company name",
    fContact: "Contact person", fTel: "Phone / WhatsApp / Email",
    fDeliv: "Expected delivery date", fTrans: "Transport", fSelect: "— Please select —",
    tSea: "Sea", tAir: "Air", tExpress: "Express", tMachine: "Ship with machine", tOther: "Other (specify in remark)",
    fPayer: "Bill-to / Payer (optional)",
    fRemark: "Remark (machine serial no., fault description, etc.)",
    staffNote: "Order No., prepared by, payment term and customs declaration will be filled in by our staff.",
    total: "Total:", onReqN: " ({n} item(s) on request)",
    clear: "Clear", continue: "Continue shopping", generate: "Generate order (Excel)",
    confirmClear: "Clear all items in the cart?", cartIsEmpty: "Your cart is empty", fillReq: "Please fill in:\n{list}",
    doneTitle: "✓ Order file generated", fileName: "File name: {f}",
    nextStep: "Next step: please send this Excel file to our sales representative via WeChat / WhatsApp / Email. The order is placed once we receive the file.",
    findFile: "Can't find the file? Press Ctrl+J to open your browser downloads.",
    keepCart: "Keep cart", clearCart: "Clear cart",
    saved: "Saved: ", downloaded: "Downloaded to your default Downloads folder (Ctrl+J):\n",
    footer: "Add parts to the cart, generate the order Excel file and send it to our sales representative.",
    currency: "Currency",
    rateNote: "Prices are converted at a reference rate set by us (1 {cur} = {rate} CNY, updated {date}). This is NOT a real-time exchange rate; final prices are subject to our quotation.",
    rateNoteShort: "Reference rate 1 {cur} = {rate} CNY ({date}), not real-time",
    origPrice: "Original {p}",
    langLabel: "Language"
  },

  fr: {
    pageTitle: "Commande de pièces – Distributeurs internationaux",
    brand: "Boutique de pièces", brandSub: "PIÈCES DE RECHANGE",
    cart: "Panier", loading: "Chargement des pièces…",
    partsCount: "Pièces : {n}", updated: "Mise à jour : {d}",
    searchPh: "Rechercher par référence ou désignation",
    categories: "Catégories",
    allParts: "Toutes les pièces", itemsN: "{n} articles", catN: "{n}",
    scope: "Affichage :", clickCat: "· Cliquez sur une catégorie à gauche pour parcourir par ensemble", curCat: "Catégorie :",
    partsBook: "Catalogue de pièces de rechange",
    thNo: "N°", thPartNo: "Référence", thDesc: "Désignation", thSpec: "Spécification / Remarque", thQtyUnit: "Qté par machine",
    thModels: "Modèles compatibles", thPrice: "Prix unitaire", thQty: "Qté", thAction: "Action",
    emptyCat: "Aucune liste de pièces distincte pour cette catégorie", noMatch: "Aucune pièce correspondante",
    onRequest: "Sur demande", common: "Pièce commune", add: "Ajouter", inCart: "✓ Au panier ×{n}",
    added: "Ajouté au panier : {no} × {q}", badQty: "Veuillez saisir une quantité valide",
    pgTotal: "{n} articles", pgFiltered: " (filtré)", pgPrev: "Précédent", pgNext: "Suivant",
    pgGoto: "Aller à", pgOf: "sur {n}", pgPerPage: "Par page",
    cartTitle: "Panier et commande", close: "Fermer",
    selected: "Pièces sélectionnées ({n})",
    cartEmpty: "Votre panier est vide. Cliquez sur « Ajouter » dans la liste des pièces.",
    cPartNo: "Référence", cDesc: "Désignation", cModel: "Modèle", cPrice: "Prix", cQty: "Qté", cSubtotal: "Sous-total",
    discontinued: "Plus disponible", remove: "Supprimer",
    orderInfo: "Informations de commande",
    fCust: "Client / Société", fCustPh: "Nom de la société du distributeur",
    fContact: "Personne à contacter", fTel: "Téléphone / WhatsApp / E-mail",
    fDeliv: "Date de livraison souhaitée", fTrans: "Mode de transport", fSelect: "— Veuillez choisir —",
    tSea: "Maritime", tAir: "Aérien", tExpress: "Express", tMachine: "Expédié avec la machine", tOther: "Autre (préciser en remarque)",
    fPayer: "Facturé à / Payeur (facultatif)",
    fRemark: "Remarque (n° de série de la machine, description de la panne, etc.)",
    staffNote: "Le n° de commande, le rédacteur, les conditions de paiement et la déclaration en douane seront renseignés par notre équipe.",
    total: "Total :", onReqN: " ({n} article(s) sur demande)",
    clear: "Vider", continue: "Continuer mes achats", generate: "Générer la commande (Excel)",
    confirmClear: "Vider tout le panier ?", cartIsEmpty: "Votre panier est vide", fillReq: "Veuillez renseigner :\n{list}",
    doneTitle: "✓ Fichier de commande généré", fileName: "Nom du fichier : {f}",
    nextStep: "Étape suivante : envoyez ce fichier Excel à notre commercial par WeChat / WhatsApp / e-mail. La commande est prise en compte dès réception du fichier.",
    findFile: "Fichier introuvable ? Appuyez sur Ctrl+J pour ouvrir les téléchargements du navigateur.",
    keepCart: "Garder le panier", clearCart: "Vider le panier",
    saved: "Enregistré : ", downloaded: "Téléchargé dans le dossier Téléchargements (Ctrl+J) :\n",
    footer: "Ajoutez les pièces au panier, générez le fichier Excel de commande et envoyez-le à notre commercial.",
    currency: "Devise",
    rateNote: "Les prix sont convertis selon un taux de référence fixé par nos soins (1 {cur} = {rate} CNY, mis à jour le {date}). Il ne s’agit PAS d’un taux de change en temps réel ; les prix définitifs sont soumis à notre devis.",
    rateNoteShort: "Taux de référence 1 {cur} = {rate} CNY ({date}), non en temps réel",
    origPrice: "Prix d’origine {p}",
    langLabel: "Langue"
  }
};

/* 机型类别名称（数据中只有中文、英文） */
const MODEL_TYPE_I18N = {
  "ELECTRIC SKID STEER LOADER":   {en:"Electric Skid Steer Loader",   fr:"Chargeuse compacte électrique"},
  "HYDRAULIC EXCAVATOR":          {en:"Hydraulic Excavator",          fr:"Pelle hydraulique"},
  "ELECTRIC HYDRAULIC EXCAVATOR": {en:"Electric Hydraulic Excavator", fr:"Pelle hydraulique électrique"},
  "ELECTRIC WHEEL LOADER":        {en:"Electric Wheel Loader",        fr:"Chargeuse sur pneus électrique"}
};

/* 订单里运输方式统一记录为「中文 英文」，方便我方阅读，与界面语言无关 */
const TRANSPORT_OPTS = [
  {v:"海运 Sea", k:"tSea"}, {v:"空运 Air", k:"tAir"}, {v:"快递 Express", k:"tExpress"},
  {v:"随整机发货 With machine", k:"tMachine"}, {v:"其他 Other", k:"tOther"}
];

function detectLang(){
  const saved = LS.get("yc_lang", "");
  if(I18N[saved]) return saved;
  const nav = (navigator.languages || [navigator.language || ""]).map(x=>String(x).toLowerCase());
  for(const l of nav){
    if(l.startsWith("zh")) return "zh";
    if(l.startsWith("fr")) return "fr";
    if(l.startsWith("en")) return "en";
  }
  return "en";
}
let LANG = "en";
/* t("key", {n:3}) → 当前语言文字；缺失时依次回退英文、中文、键名 */
function t(key, params){
  let s = (I18N[LANG] && I18N[LANG][key]) ?? I18N.en[key] ?? I18N.zh[key] ?? key;
  if(params) s = s.replace(/\{(\w+)\}/g, (m, k)=>params[k] != null ? params[k] : m);
  return s;
}
/* 套用到带 data-i18n / data-i18n-ph / data-i18n-title 属性的元素 */
function applyI18n(root){
  (root || document).querySelectorAll("[data-i18n]").forEach(el=>el.textContent = t(el.dataset.i18n));
  (root || document).querySelectorAll("[data-i18n-ph]").forEach(el=>el.placeholder = t(el.dataset.i18nPh));
  (root || document).querySelectorAll("[data-i18n-title]").forEach(el=>el.title = t(el.dataset.i18nTitle));
  document.documentElement.lang = LANG === "zh" ? "zh-CN" : LANG;
  document.title = t("pageTitle");
}
/* 配件 / 分类名称：中文界面中文为主、英文为辅；其他语言只显示英文（无英文时用中文） */
function nameMain(cn, en){ return LANG === "zh" ? (cn || en) : (en || cn); }
function nameSub(cn, en){ return LANG === "zh" && cn && en ? en : ""; }
function modelTitle(m){
  if(LANG === "zh") return m.cn;
  const tr = MODEL_TYPE_I18N[String(m.en).toUpperCase()];
  return m.id + " " + (tr && tr[LANG] ? tr[LANG] : m.en);
}
