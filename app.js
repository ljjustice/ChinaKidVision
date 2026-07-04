const SUPABASE_URL = 'https://xnkjdmvbeqfqsoskidoh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhua2pkbXZiZXFmcXNvc2tpZG9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMjcwMjcsImV4cCI6MjA5ODYwMzAyN30.GVkOadt_o0oqrZRSIhz0UZUaKoZGkwDi3iTMa0Y1n28';
const STORAGE_BASE = '/storage/v1/object/public/';
const VOICES_BASE = `${STORAGE_BASE}voices/`;

function b64url(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let provinceDetails = {};
let palette = [];

const PROVINCE_ABBR = {
  "北京":"京","天津":"津","河北":"冀","山西":"晋","内蒙古":"蒙",
  "辽宁":"辽","吉林":"吉","黑龙江":"黑","上海":"沪","江苏":"苏",
  "浙江":"浙","安徽":"皖","福建":"闽","江西":"赣","山东":"鲁",
  "河南":"豫","湖北":"鄂","湖南":"湘","广东":"粤","广西":"桂",
  "海南":"琼","重庆":"渝","四川":"川","贵州":"黔","云南":"滇",
  "西藏":"藏","陕西":"陕","甘肃":"甘","青海":"青","宁夏":"宁",
  "新疆":"新","台湾":"台","香港":"港","澳门":"澳"
};

async function loadData() {
  const [provRes, itemRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/provinces?order=sort_order.asc`, {
      headers: { 'apikey': SUPABASE_ANON_KEY }
    }),
    fetch(`${SUPABASE_URL}/rest/v1/items?order=sort_order.asc`, {
      headers: { 'apikey': SUPABASE_ANON_KEY }
    })
  ]);

  const provinces = await provRes.json();
  const items = await itemRes.json();

  palette = provinces.map(p => p.color || '#f9d976');

  provinceDetails = {};
  provinces.forEach(p => {
    provinceDetails[p.name] = {
      fullName: p.full_name,
      english: p.english,
      animals: [],
      foods: [],
      places: [],
      cities: []
    };
  });

  items.forEach(item => {
    const p = provinceDetails[item.province_name];
    if (p && p[item.category]) {
      p[item.category].push([item.name, item.english, item.note, item.image_url || "", item.voice_url || ""]);
    }
  });
}

const fields = Object.fromEntries([
  "provinceOutline", "provinceName", "provinceEnglish", "tabContent"
].map((id) => [id, document.querySelector(`#${id}`)]));
const modal = document.querySelector("#provinceModal");
let currentDetail = null;
let currentTab = "animals";

function normalizeProvinceName(name) {
  return String(name || "")
    .replace(/维吾尔自治区|壮族自治区|回族自治区|自治区|特别行政区|省|市/g, "");
}

function getProvinceDetail(name) {
  const shortName = normalizeProvinceName(name);
  return provinceDetails[shortName] || provinceDetails[name] || provinceDetails.四川;
}

function simplifyRing(ring, tolerance) {
  if (ring.length <= 3) return ring;
  let maxDist = 0, maxIdx = 0;
  const first = ring[0], last = ring[ring.length - 1];
  for (let i = 1; i < ring.length - 1; i++) {
    const dx = last[0] - first[0], dy = last[1] - first[1];
    const lenSq = dx * dx + dy * dy;
    const d = lenSq === 0 ? Math.hypot(ring[i][0] - first[0], ring[i][1] - first[1])
      : Math.abs((ring[i][0] - first[0]) * dy - (ring[i][1] - first[1]) * dx) / Math.sqrt(lenSq);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > tolerance) {
    const left = simplifyRing(ring.slice(0, maxIdx + 1), tolerance);
    const right = simplifyRing(ring.slice(maxIdx), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function buildProvinceSvg(name) {
  const shortName = normalizeProvinceName(name);
  const feature = (window.CHINA_GEO_JSON.features || []).find((f) => {
    const fn = normalizeProvinceName(f.properties.name);
    return fn === shortName || f.properties.name === name;
  });
  if (!feature) return "";
  const geom = feature.geometry;
  let allCoords = [];
  const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  polys.forEach((poly) => poly.forEach((ring) => allCoords.push(...ring)));
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = Infinity * -1;
  allCoords.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  });
  const pad = 4, size = 100;
  const rangeX = maxLng - minLng || 1, rangeY = maxLat - minLat || 1;
  const scale = Math.min((size - 2 * pad) / rangeX, (size - 2 * pad) / rangeY);
  const offsetX = pad + ((size - 2 * pad) - rangeX * scale) / 2;
  const offsetY = pad + ((size - 2 * pad) - rangeY * scale) / 2;
  const tolerance = Math.max(rangeX, rangeY) * 0.008;
  let pathD = "";
  polys.forEach((poly) => {
    poly.forEach((ring) => {
      const simplified = simplifyRing(ring, tolerance);
      const pts = simplified.map(([lng, lat]) => {
        const x = offsetX + (lng - minLng) * scale;
        const y = offsetY + (maxLat - lat) * scale;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      pathD += `M${pts[0]}L${pts.slice(1).join("L")}Z`;
    });
  });
  const idx = Object.keys(provinceDetails).indexOf(shortName);
  const color = palette[idx >= 0 ? idx % palette.length : 0];
  const svgStr = `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><path d="${pathD}" fill="${color}" stroke="#4d5963" stroke-width="2" stroke-linejoin="round"/></svg>`;
  const img = document.createElement("img");
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
  img.alt = shortName;
  img.style.maxWidth = "100%";
  img.style.maxHeight = "100%";
  return img;
}

function renderTabContent(tabKey) {
  if (!currentDetail) return;
  const items = currentDetail[tabKey] || [];
  const classMap = { animals: "animal", foods: "food", places: "place", cities: "city" };
  const cls = classMap[tabKey] || "food";
  if (items.length === 0) { fields.tabContent.innerHTML = ""; return; }
  fields.tabContent.innerHTML = items.map((item) => {
    const name = item[0], en = item[1], note = item[2] || "", imageUrl = item[3] || "", voiceUrl = item[4] || "";
    const onclick = `onclick="speakItem('${name.replace(/'/g,"\\'")}','${en.replace(/'/g,"\\'")}','${voiceUrl.replace(/'/g,"\\'")}')"`;
    const mediaHtml = imageUrl
    const mediaHtml = imageUrl
      ? `<div class="card-img-wrap"><img class="card-img" src="${imageUrl}" alt="${name}" onerror="this.parentElement.innerHTML='🖼️';this.parentElement.className='card-emoji'" /></div>`
      : `<div class="card-emoji">🖼️</div>`;
    return `<article class="feature-card ${cls}" ${onclick}>${mediaHtml}<div class="card-info"><h3>${name} <small>${en}</small></h3>${note ? `<p>${note}</p>` : ""}</div></article>`;
  }).join("");
}

function openProvinceByName(name) {
  const shortName = normalizeProvinceName(name);
  const detail = getProvinceDetail(name);
  currentDetail = detail;
  currentTab = "animals";
  fields.provinceOutline.innerHTML = "";
  fields.provinceOutline.appendChild(buildProvinceSvg(name));
  fields.provinceName.innerHTML = `${detail.fullName} <small class="province-abbr">${PROVINCE_ABBR[shortName] || ""}</small>`;
  fields.provinceEnglish.textContent = detail.english;
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === currentTab);
  });
  renderTabContent(currentTab);
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeProvince() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function renderChinaMap() {
  const mapElement = document.querySelector("#chinaMap");
  const errorElement = document.querySelector("#mapError");

  if (!window.echarts) {
    console.error("ECharts 主库没有加载成功。");
    errorElement.hidden = false;
    return;
  }

  if (!window.CHINA_GEO_JSON) {
    console.error("中国地图 GeoJSON 没有加载成功。");
    errorElement.hidden = false;
    return;
  }

  echarts.registerMap("china", window.CHINA_GEO_JSON);

  if (!echarts.getMap || !echarts.getMap("china")) {
    console.error("中国地图注册失败。");
    errorElement.hidden = false;
    return;
  }
  errorElement.hidden = true;

  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const chart = echarts.init(mapElement, null, { renderer: isTouchDevice ? "canvas" : "svg" });
  const provinceNames = Object.keys(provinceDetails);
  const data = provinceNames.map((name, index) => ({ name, value: 1, itemStyle: { areaColor: palette[index % palette.length] } }));
  chart.setOption({
    backgroundColor: "transparent",
    tooltip: { show: false },
    series: [{
      type: "map",
      map: "china",
      roam: true,
      selectedMode: false,
      layoutCenter: ["50%", "63%"],
      layoutSize: "120%",
      data,
      label: {
        show: true,
        color: "#315a63",
        fontSize: 11,
        fontWeight: 700
      },
      itemStyle: {
        areaColor: "#f7dda7",
        borderColor: "#4d5963",
        borderWidth: 1.2,
        shadowBlur: 9,
        shadowColor: "rgba(77, 70, 128, .24)",
        shadowOffsetX: 0,
        shadowOffsetY: 2
      },
      emphasis: {
        label: { color: "#123f4c", fontWeight: 900 },
        itemStyle: { areaColor: "#ffe75f", borderColor: "#33424c", borderWidth: 2 }
      },
      nameMap: {
        "北京市":"北京","天津市":"天津","河北省":"河北","山西省":"山西","内蒙古自治区":"内蒙古",
        "辽宁省":"辽宁","吉林省":"吉林","黑龙江省":"黑龙江","上海市":"上海","江苏省":"江苏",
        "浙江省":"浙江","安徽省":"安徽","福建省":"福建","江西省":"江西","山东省":"山东",
        "河南省":"河南","湖北省":"湖北","湖南省":"湖南","广东省":"广东","广西壮族自治区":"广西",
        "海南省":"海南","重庆市":"重庆","四川省":"四川","贵州省":"贵州","云南省":"云南",
        "西藏自治区":"西藏","陕西省":"陕西","甘肃省":"甘肃","青海省":"青海","宁夏回族自治区":"宁夏",
        "新疆维吾尔自治区":"新疆","台湾省":"台湾","香港特别行政区":"香港","澳门特别行政区":"澳门"
      }
    }]
  });
  chart.on("click", (params) => {
    if (params.name) openProvinceByName(params.name);
  });
  chart.getZr().on("click", (params) => {
    const point = [params.offsetX, params.offsetY];
    const geo = chart.getModel().getComponent("geo") || chart.getModel().getComponent("series")[0];
    if (geo) {
      const data = chart.containPixel({ seriesIndex: 0 }, point);
      if (!data) return;
    }
  });
  chart.on("mouseover", (params) => {
    chart.getZr().setCursorStyle("pointer");
  });
  window.addEventListener("resize", () => chart.resize());
}

let currentAudio = null;

function speakWithChildVoice(text, rate) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = rate || 0.7;
  utterance.pitch = 1.6;
  function trySpeak() {
    const voices = speechSynthesis.getVoices();
    const zhVoice = voices.find((v) => {
      const n = v.name.toLowerCase();
      return v.lang.startsWith("zh") && (n.includes("child") || n.includes("kid") || n.includes("童") || n.includes("儿童") || n.includes("xiao") || n.includes("yunxia"));
    }) || voices.find((v) => v.lang.startsWith("zh"));
    if (zhVoice) utterance.voice = zhVoice;
    window.speechSynthesis.speak(utterance);
  }
  if (speechSynthesis.getVoices().length > 0) {
    trySpeak();
  } else {
    speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = null; trySpeak(); };
  }
}

function speakCurrentProvince() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  const shortName = currentDetail ? normalizeProvinceName(Object.keys(provinceDetails).find(k => provinceDetails[k] === currentDetail) || "") : "";
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = `${VOICES_BASE}${b64url(shortName)}.mp3`;
  currentAudio = audio;
  const playPromise = audio.play();
  if (playPromise !== undefined) {
    playPromise.catch(() => {
      const name = currentDetail ? currentDetail.fullName : fields.provinceName.textContent;
      speakWithChildVoice(name, 0.7);
    });
  }
}

function speakItem(name, english, voiceUrl) {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  const detail = currentDetail;
  const note = detail ? (detail[currentTab] || []).find(it => it[0] === name) : null;
  const noteText = note ? note[2] : "";
  const parts = [name];
  if (english) parts.push(english);
  if (noteText) parts.push(noteText);
  const textWithPauses = parts.join("，……，");

  if (voiceUrl) {
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = voiceUrl;
    currentAudio = audio;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => speakWithChildVoice(textWithPauses, 0.7));
    }
  } else {
    speakWithChildVoice(textWithPauses, 0.7);
  }
}

document.querySelectorAll("[data-close]").forEach((element) => element.addEventListener("click", closeProvince));
document.querySelectorAll(".tab-btn").forEach((btn) => btn.addEventListener("click", () => {
  currentTab = btn.dataset.tab;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
  renderTabContent(currentTab);
}));
document.querySelector("#voiceBtn").addEventListener("click", speakCurrentProvince);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeProvince(); });

const provListToggle = document.querySelector("#provListToggle");
const provListPanel = document.querySelector("#provListPanel");
const provListClose = document.querySelector("#provListClose");
const provListContent = document.querySelector("#provListContent");

provListToggle.addEventListener("click", () => provListPanel.classList.toggle("open"));
provListClose.addEventListener("click", () => provListPanel.classList.remove("open"));

function renderProvList() {
  const names = Object.keys(provinceDetails);
  provListContent.innerHTML = names.map((name, i) => {
    const color = palette[i % palette.length];
    return `<div class="prov-list-item" data-name="${name}"><span class="prov-list-dot" style="background:${color}"></span>${name}</div>`;
  }).join("");
  provListContent.querySelectorAll(".prov-list-item").forEach(el => {
    el.addEventListener("click", () => {
      openProvinceByName(el.dataset.name);
      provListPanel.classList.remove("open");
    });
  });
}

loadData().then(() => {
  renderChinaMap();
  renderProvList();
}).catch((err) => {
  console.error("Failed to load data from Supabase:", err);
});
