const DEFAULT_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSoT6qXTuTRLuAjta-U-9Lq2ARjhbhWg4LBgpbdd4-2Ylauw77E9plERZTVGwh9bvLjSlZQNve5KnAz/pub?output=csv";
const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const COLOR_BY_INDEX = {
  1: "#ef4444",
  2: "#3b82f6",
  3: "#f97316",
  4: "#ffffff",
  5: "#374151",
  6: "#06b6d4",
  7: "#eab308",
  8: "#22c55e",
};

let csvUrl = DEFAULT_CSV_URL;
let pollIntervalSec = DEFAULT_POLL_INTERVAL_SECONDS;
let pollTimer = null;

let svg, trackPathElement, racersLayer;
let pathLength = 0;
const LOGO_FOLDER = "logos";
const MAX_LAPS_DISPLAY = 62;
const FINISH_LINE_T = 0.637;

let racers = [];
let globalLapT = 0;
const LAPS_PER_SECOND = 0.08;
let lapCount = 1;
let prevLeaderName = null;
let prevLeaderT = null;

function showToast(message, { error = false, duration = 3000 } = {}) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
      <div class="toast-dot"></div>
      <span class="toast-text"></span>
    `;
    document.body.appendChild(toast);
  }

  toast.classList.toggle("toast-error", error);
  toast.querySelector(".toast-text").textContent = message;
  toast.classList.add("visible");

  window.clearTimeout(toast._hideTimer);
  toast._hideTimer = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, duration);
}

function parseCsv(text) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (rows.length === 0) return [];

  let startIndex = 0;
  const headerColumns = rows[0].split(",").map((col) => col.trim().toLowerCase());
  const hasHeader =
    headerColumns.includes("name") ||
    headerColumns.includes("team") ||
    headerColumns.includes("points") ||
    headerColumns.includes("pontos");
  if (hasHeader) startIndex = 1;

  const headerIndex = {
    name: headerColumns.findIndex((col) => col === "name" || col === "team"),
    points: headerColumns.findIndex((col) => col === "points" || col === "pontos"),
    color: headerColumns.findIndex((col) => col === "color" || col === "cor"),
    logo: headerColumns.findIndex((col) => col === "logo"),
    tag: headerColumns.findIndex((col) => col === "tag"),
  };

  const parsed = [];
  for (let i = startIndex; i < rows.length; i++) {
    const cols = rows[i].split(",");
    if (cols.length < 2) continue;

    const getCol = (columnName, fallbackIndex) => {
      const idx = hasHeader ? headerIndex[columnName] : fallbackIndex;
      if (idx < 0 || idx >= cols.length) return "";
      return cols[idx].trim();
    };

    const name = getCol("name", 0);
    const points = parseFloat(getCol("points", 1));
    const colorIndexRaw = getCol("color", 2);
    const colorIndex = Number.parseInt(colorIndexRaw, 10);
    const logo = getCol("logo", 3);
    const tagRaw = getCol("tag", 4);
    const tag = tagRaw ? tagRaw.toUpperCase().slice(0, 3) : "";
    if (!name || Number.isNaN(points)) continue;
    parsed.push({
      name,
      points,
      colorIndex: Number.isNaN(colorIndex) ? null : colorIndex,
      logo,
      tag,
    });
  }

  return parsed;
}

async function fetchStandings() {
  try {
    const res = await fetch(csvUrl, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      showToast("CSV is empty or invalid.", { error: true });
      return;
    }
    updateRacers(parsed);
  } catch (err) {
    console.error("Failed to fetch CSV", err);
    showToast(`Failed to load CSV: ${err.message}`, { error: true });
  }
}

function updateRacers(data) {
  data.sort((a, b) => b.points - a.points);

  const count = data.length;

  const newRacers = data.map((row, index) => {
    const existing = racers.find((r) => r.name === row.name);
    const rank = index + 1;
    const spacing = 0.06;
    return {
      name: row.name,
      points: row.points,
      rank,
      color:
        COLOR_BY_INDEX[row.colorIndex] ||
        existing?.color ||
        COLOR_BY_INDEX[((index % 8) + 1)],
      logo: row.logo || "",
      tag: row.tag || existing?.tag || row.name.slice(0, 3).toUpperCase(),
      offsetT: spacing * (count - rank),
    };
  });

  racers = newRacers;
  renderSidebar();
  ensureRacerNodes();
}

function renderSidebar() {
  const leaderLabel = document.getElementById("leaderLabel");
  const leaderEntry1 = document.getElementById("leaderEntry1");
  const leaderEntry2 = document.getElementById("leaderEntry2");
  const leaderCardName1 = document.getElementById("leaderName1");
  const leaderCardName2 = document.getElementById("leaderName2");
  const leaderCardPoints = document.getElementById("leaderPoints");
  const leaderLogo1 = document.getElementById("leaderLogo1");
  const leaderLogo2 = document.getElementById("leaderLogo2");
  const list = document.getElementById("standingsList");

  list.innerHTML = "";
  if (racers.length === 0) {
    leaderLabel.textContent = "Líder Atual";
    leaderCardName1.textContent = "–";
    leaderCardName2.textContent = "–";
    leaderCardPoints.textContent = "– points";
    leaderEntry2.style.display = "none";
    leaderLogo1.style.display = "none";
    leaderLogo1.removeAttribute("src");
    leaderLogo2.style.display = "none";
    leaderLogo2.removeAttribute("src");
    return;
  }

  const topPoints = racers[0].points;
  const topLeaders = racers.filter((r) => r.points === topPoints).slice(0, 2);
  const isTie = topLeaders.length > 1;

  leaderLabel.textContent = isTie ? "Líderes Atuais" : "Líder Atual";
  leaderEntry2.style.display = isTie ? "flex" : "none";

  leaderCardName1.textContent = `${topLeaders[0].name} (${topLeaders[0].tag})`;
  if (topLeaders[0].logo) {
    leaderLogo1.src = `${LOGO_FOLDER}/${topLeaders[0].logo}.png`;
    leaderLogo1.style.display = "block";
  } else {
    leaderLogo1.style.display = "none";
    leaderLogo1.removeAttribute("src");
  }

  if (isTie) {
    leaderCardName2.textContent = `${topLeaders[1].name} (${topLeaders[1].tag})`;
    if (topLeaders[1].logo) {
      leaderLogo2.src = `${LOGO_FOLDER}/${topLeaders[1].logo}.png`;
      leaderLogo2.style.display = "block";
    } else {
      leaderLogo2.style.display = "none";
      leaderLogo2.removeAttribute("src");
    }
    leaderCardPoints.textContent = `${topPoints} points (empate)`;
  } else {
    leaderCardPoints.textContent = `${topPoints} points`;
    leaderLogo2.style.display = "none";
    leaderLogo2.removeAttribute("src");
  }

  for (const racer of racers) {
    const li = document.createElement("li");
    li.className = "standings-item";
    if (racer.rank === 1) li.classList.add("leader");

    const left = document.createElement("div");
    left.className = "standings-item-left";

    const badge = document.createElement("div");
    badge.className = "badge-rank";
    if (racer.rank === 2) badge.classList.add("rank-2");
    else if (racer.rank === 3) badge.classList.add("rank-3");
    else if (racer.rank > 3) badge.classList.add("rank-other");

    badge.textContent = racer.rank;

    const nameSpan = document.createElement("span");
    nameSpan.className = "racer-name";
    nameSpan.textContent = `${racer.name} (${racer.tag})`;

    const colorDot = document.createElement("span");
    colorDot.className = "team-color-dot";
    colorDot.style.backgroundColor = racer.color;

    left.appendChild(badge);
    left.appendChild(colorDot);
    left.appendChild(nameSpan);

    const pointsSpan = document.createElement("span");
    pointsSpan.className = "racer-points";
    pointsSpan.textContent = racer.points === topPoints ? `${racer.points} pts` : "?? pts";

    li.appendChild(left);
    li.appendChild(pointsSpan);
    list.appendChild(li);
  }
}

function ensureRacerNodes() {
  racersLayer.innerHTML = "";

  if (racers.length === 0) return;

  for (const racer of racers) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("data-name", racer.name);

    const carGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    carGroup.classList.add("racer-car");
    if (racer.rank === 1) carGroup.classList.add("leader");

    const glow = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    glow.setAttribute("cx", "0");
    glow.setAttribute("cy", "0");
    glow.setAttribute("rx", "14");
    glow.setAttribute("ry", "7");
    glow.setAttribute("fill", racer.color);
    glow.classList.add("racer-car-glow");

    const rearWing = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rearWing.setAttribute("x", "-12");
    rearWing.setAttribute("y", "-6");
    rearWing.setAttribute("width", "4");
    rearWing.setAttribute("height", "12");
    rearWing.setAttribute("fill", racer.color);
    rearWing.classList.add("racer-car-part");

    const body = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    body.setAttribute("x", "-9");
    body.setAttribute("y", "-3.8");
    body.setAttribute("width", "13");
    body.setAttribute("height", "7.6");
    body.setAttribute("rx", "2");
    body.setAttribute("fill", racer.color);
    body.classList.add("racer-car-part");

    const nose = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    nose.setAttribute("points", "4,-2.6 11,0 4,2.6");
    nose.setAttribute("fill", racer.color);
    nose.classList.add("racer-car-part");

    const frontWing = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    frontWing.setAttribute("x", "10");
    frontWing.setAttribute("y", "-5");
    frontWing.setAttribute("width", "3.5");
    frontWing.setAttribute("height", "10");
    frontWing.setAttribute("fill", racer.color);
    frontWing.classList.add("racer-car-part");

    const cockpit = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    cockpit.setAttribute("cx", "-1");
    cockpit.setAttribute("cy", "0");
    cockpit.setAttribute("rx", "3");
    cockpit.setAttribute("ry", "2.1");
    cockpit.setAttribute("fill", "#0f172a");
    cockpit.classList.add("racer-car-cockpit");

    const wheelPositions = [
      { x: -6.5, y: -5.2 },
      { x: -6.5, y: 5.2 },
      { x: 5.8, y: -5.2 },
      { x: 5.8, y: 5.2 },
    ];
    for (const wheelPos of wheelPositions) {
      const wheel = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      wheel.setAttribute("cx", String(wheelPos.x));
      wheel.setAttribute("cy", String(wheelPos.y));
      wheel.setAttribute("r", "1.9");
      wheel.classList.add("racer-car-wheel");
      carGroup.appendChild(wheel);
    }

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.textContent = racer.tag;
    label.classList.add("racer-label");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dy", "-14");

    carGroup.appendChild(glow);
    carGroup.appendChild(rearWing);
    carGroup.appendChild(body);
    carGroup.appendChild(nose);
    carGroup.appendChild(frontWing);
    carGroup.appendChild(cockpit);
    g.appendChild(carGroup);
    g.appendChild(label);

    racersLayer.appendChild(g);
  }
}

function hasCrossedFinish(prevT, currentT, finishT) {
  if (prevT === null || currentT === null) return false;
  if (prevT <= currentT) {
    return prevT < finishT && currentT >= finishT;
  }
  return finishT > prevT || finishT <= currentT;
}

function updateLapDisplay() {
  const lapCounter = document.getElementById("lapCounter");
  const lapMessage = document.getElementById("lapMessage");
  if (!lapCounter || !lapMessage) return;

  lapCounter.textContent = `${Math.min(lapCount, MAX_LAPS_DISPLAY)}/${MAX_LAPS_DISPLAY}`;
  lapMessage.style.display = lapCount >= MAX_LAPS_DISPLAY ? "inline" : "none";
}

let lastFrameTime = performance.now();

function animate(now) {
  const dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  if (trackPathElement && pathLength > 0 && racers.length > 0) {
    globalLapT = (globalLapT + dt * LAPS_PER_SECOND) % 1;

    const leader = racers[0];
    if (leader) {
      const leaderT = (globalLapT + leader.offsetT) % 1;
      if (prevLeaderName === leader.name) {
        if (hasCrossedFinish(prevLeaderT, leaderT, FINISH_LINE_T)) {
          lapCount += 1;
          updateLapDisplay();
        }
      }
      prevLeaderName = leader.name;
      prevLeaderT = leaderT;
    }

    for (const racer of racers) {
      const t = (globalLapT + racer.offsetT) % 1;
      const distance = t * pathLength;
      const point = trackPathElement.getPointAtLength(distance);
      const aheadDistance = ((t + 0.002) % 1) * pathLength;
      const ahead = trackPathElement.getPointAtLength(aheadDistance);
      const angle = (Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180) / Math.PI;

      const group = racersLayer.querySelector(
        `g[data-name="${CSS.escape(racer.name)}"]`
      );
      if (!group) continue;

      group.setAttribute("transform", `translate(${point.x}, ${point.y})`);
      const car = group.querySelector(".racer-car");
      if (car) car.setAttribute("transform", `rotate(${angle})`);
    }
  }

  requestAnimationFrame(animate);
}

function startPolling() {
  if (pollTimer) window.clearInterval(pollTimer);
  pollTimer = window.setInterval(fetchStandings, pollIntervalSec * 1000);
}

function bootstrap() {
  svg = document.getElementById("raceTrack");
  trackPathElement = document.getElementById("trackPath");
  racersLayer = document.getElementById("racersLayer");

  if (!svg || !trackPathElement || !racersLayer) {
    console.error("SVG elements not found.");
    return;
  }

  try {
    pathLength = trackPathElement.getTotalLength();
  } catch (e) {
    console.error("Failed to measure path length", e);
  }

  csvUrl = DEFAULT_CSV_URL;
  pollIntervalSec = DEFAULT_POLL_INTERVAL_SECONDS;
  lapCount = 1;
  prevLeaderName = null;
  prevLeaderT = null;
  updateLapDisplay();

  fetchStandings();
  startPolling();
  requestAnimationFrame(animate);
}

window.addEventListener("DOMContentLoaded", bootstrap);

