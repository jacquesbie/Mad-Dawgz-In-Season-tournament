"use strict";
// Mad Dawgz In-Season Tournament: en lille enkeltsides-app uden build-trin.
// Data kommer fra data.js (window.MDIST_DATA), som den daglige kørsel skriver.

const app = document.getElementById("app");
let D = null;
let chart = null;

const PALETTE = ["#2f6fd1", "#f26b1d", "#16a34a", "#dc2626", "#9333ea", "#0891b2",
                 "#ca8a04", "#db2777", "#64748b", "#65a30d", "#7c3aed", "#0f766e"];
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

// ---------- hjælpere ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const team = (id) => D.teams[String(id)];
const name = (id) => (id === null || id === undefined ? "" : esc(team(id)?.name ?? "?"));
const roundById = (id) => D.rounds.find((r) => r.id === id);
const standing = (id) => D.standings.find((s) => s.team === id);
const signed = (n) => (n > 0 ? "+" + n : String(n));
const sgnClass = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "zero");
const pct3 = (v) => (v >= 1 ? "1.000" : v.toFixed(3).replace(/^0/, ""));
const shortDate = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${d}/${m}`; };
const longDate = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${d}. ${MONTHS[m - 1]}`; };
const isPct = (cat) => cat.endsWith("%");
const fmtCat = (cat, v) => (isPct(cat) ? pct3(v) : String(Math.round(v)));
const teamColor = (id) => PALETTE[Object.keys(D.teams).map(Number).sort((a, b) => a - b).indexOf(Number(id)) % PALETTE.length];

function logo(id, cls = "") {
  const t = team(id);
  if (!t) return `<span class="lg ${cls}"></span>`;
  const initials = esc(t.abbrev || t.name.slice(0, 3));
  if (!t.logo) return `<span class="lg ${cls}">${initials}</span>`;
  return `<img class="lg ${cls}" src="${esc(t.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer"
    onerror="this.outerHTML='<span class=&quot;lg ${cls}&quot;>${initials}</span>'">`;
}

// Holdets placering lige nu: den foreløbige stilling mens en runde er i gang, ellers den officielle.
// Før der er spillet noget, findes der ingen placering.
function currentRank(id) {
  if (D.standings_live) return { rank: D.standings_live.find((s) => s.team === id).rank, live: true };
  if (D.any_final) return { rank: standing(id).rank, live: false };
  return null;
}

function record(id) {
  const s = standing(id);
  return s ? `${s.w}-${s.d}-${s.l}` : "";
}

// MDIST-bæltet: et mærke ved den regerende mester. Bæltet skifter først ejer, når finalen er afgjort.
const BELT_SVG = '<svg viewBox="0 0 28 20" aria-hidden="true"><rect x="0" y="6" width="28" height="8" rx="2" fill="currentColor" opacity=".55"/><circle cx="14" cy="10" r="8" fill="currentColor"/><circle cx="14" cy="10" r="4.5" fill="#f5c542"/></svg>';
const beltMark = (text = "") => `<span class="belt ${text ? "" : "icon"}" title="MDIST-bæltet · ${esc(D.belt ? D.belt.title : "")}">${BELT_SVG}${text}</span>`;
const holdsBelt = (id) => D.belt && D.belt.holder === id;

// Er der spillet noget i kampen endnu? (mandag står alt 0-0, indtil første NBA-kamp er i gang)
const hasScore = (m) => !!m.score && (m.started !== false || m.status === "final");

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = resolve;
    el.onerror = () => { el.remove(); reject(new Error(src)); };
    document.head.appendChild(el);
  });
}

function statusPill(round) {
  if (round.status === "live") {
    const [day, n] = round.progress || [];
    return `<span class="pill live">Live${day ? ` · dag ${day} af ${n}` : ""}</span>`;
  }
  if (round.status === "final") return `<span class="pill final">Afsluttet</span>`;
  return `<span class="pill upcoming">Starter ${longDate(round.start)}</span>`;
}

function findMatchup(id) {
  const [rid, idx] = String(id).split("-").map(Number);
  const round = roundById(rid);
  return round ? [round, round.matchups[idx]] : [null, null];
}

// ---------- kampe (scoreboard) ----------
function scoreboard(rid) {
  const round = roundById(rid) || roundById(D.league.current_round) || D.rounds[0];
  const chips = D.rounds.map((r) => `
    <a class="chip ${r.id === round.id ? "on" : ""}" href="#/kampe/${r.id}" ${r.id === round.id ? 'aria-current="page"' : ""}>
      <b>${esc(r.short)}</b><small>${shortDate(r.start)}</small>${r.status === "live" ? '<i class="dot"></i>' : ""}
    </a>`).join("");
  const note = round.days > 7 ? `<p class="note">Dobbeltuge: ${round.days} dage, ${esc(round.label)}.</p>` : "";
  app.innerHTML = `
    <div class="strip" id="strip">${chips}</div>
    <div class="head-row"><h1>${esc(round.name)}</h1><span class="sub">${esc(round.label)}</span>${statusPill(round)}</div>
    ${note}
    <div class="grid2">${round.matchups.map((m) => matchCard(round, m)).join("") || '<p class="empty">Ingen kampe.</p>'}</div>`;
  document.querySelector(".chip.on")?.scrollIntoView({ inline: "center", block: "nearest" });
}

function matchCard(round, m) {
  const played = hasScore(m);
  const final = played && m.status === "final";
  const drawn = final && (m.winner === null || m.winner === undefined);
  const placeholders = (D.bracket.rounds.find((r) => r.round === round.id)?.matches[Number(m.id.split("-")[1])] || {}).placeholders || [];
  const projected = round.playoff === 1 && D.bracket.projected;
  const row = (side, i) => {
    const id = m[side];
    const known = id !== null && id !== undefined;
    const cls = [side, final && m.winner === id ? "won" : "", final && !drawn && known && m.winner !== id ? "lost" : ""].join(" ");
    const slot = D.bracket.rounds.find((r) => r.round === round.id)?.matches[Number(m.id.split("-")[1])];
    const seed = m[`${side}_seed`] || (round.playoff && known ? D.bracket.seeds.indexOf(id) + 1 : "") || (!known && slot ? slot[`${side}_seed`] || "" : "");
    const label = known ? `${projected ? "<i>" : ""}${name(id)}${projected ? "</i>" : ""}` : esc(placeholders[i] || "Afgøres senere");
    const belt = known && holdsBelt(id) ? beltMark() : "";
    const through = drawn && round.playoff && m.advancing === id ? '<span class="through">videre</span>' : "";
    return `<div class="mrow ${cls}">
      ${known ? logo(id) : '<span class="lg"></span>'}
      <div class="tn"><div>${seed ? `<span class="seed">${seed}</span>` : ""}${label}${belt}${through}</div><small>${known ? record(id) : "&nbsp;"}</small></div>
      <div class="sc">${played ? m.score[i] : ""}</div></div>`;
  };
  let foot, strip = "";
  if (played) {
    strip = `<div class="cgrid">${m.cats.map((c) => `<span class="${c.w === "=" ? "" : c.w}" title="${c.cat}: ${fmtCat(c.cat, c.h)} – ${fmtCat(c.cat, c.a)}">${c.cat}</span>`).join("")}</div>`;
    const ties = m.score[2] ? ` · ${m.score[2]} lige` : "";
    const state = m.status === "live" ? "Live" : drawn ? "Uafgjort" : "Slut";
    foot = `<span>${state}${ties}</span><span class="more">Detaljer ›</span>`;
  } else {
    const wait = round.status === "upcoming" ? "Starter " + longDate(round.start) : "Ingen NBA-kampe spillet endnu";
    foot = `<span>${wait}</span>`;
  }
  const body = `${row("home", 0)}${row("away", 1)}${strip}<div class="mfoot">${foot}</div>`;
  return played ? `<a class="card mcard" href="#/kamp/${m.id}">${body}</a>` : `<div class="card mcard">${body}</div>`;
}

// ---------- kampdetaljer ----------
function matchup(id) {
  const [round, m] = findMatchup(id);
  if (!m) return notFound();
  const played = hasScore(m);
  const side = (s) => {
    const tid = m[s];
    if (tid === null || tid === undefined) return `<div class="mteam ${s}"><span class="lg big"></span><b>Afgøres senere</b></div>`;
    const seed = m[`${s}_seed`] ? `Seed ${m[`${s}_seed`]} · ` : "";
    return `<a class="mteam ${s}" href="#/hold/${tid}">${logo(tid, "big")}<b>${name(tid)}${holdsBelt(tid) ? beltMark() : ""}</b><small>${seed}${record(tid)}</small></a>`;
  };
  // Resultatlinjen står på sin egen række under holdene, så den ikke klemmer navnene på en telefon
  const bits = [];
  let center;
  if (played) {
    const [h, a, t] = m.score;
    center = `<div class="big">${h}<i>–</i>${a}</div>`;
    if (t) bits.push(`${t} kategori${t > 1 ? "er" : ""} lige`);
    if (m.status === "live") {
      bits.push(statusPill(round));
      if (round.playoff && m.home_seed) bits.push(`Ved uafgjort går ${name(m.home)} videre som bedst seedet`);
    } else if (m.winner !== null && m.winner !== undefined) {
      bits.push(`${name(m.winner)} vandt`);
    } else if (round.playoff && m.advancing !== null && m.advancing !== undefined) {
      bits.push(`Uafgjort · ${name(m.advancing)} går videre som bedst seedet`);
    } else {
      bits.push("Uafgjort");
    }
  } else {
    center = '<div class="big" style="color:var(--faint)">vs</div>';
    bits.push(round.status === "live" ? "Ingen NBA-kampe spillet endnu i runden" : statusPill(round));
  }
  let html = `
    <a class="back" href="#/kampe/${round.id}">‹ ${esc(round.name)}</a>
    <div class="card mhead">${side("home")}<div class="mscore">${center}</div>${side("away")}
      <div class="mverdict">${bits.map((b) => `<span>${b}</span>`).join("")}</div></div>
    <p class="note">${esc(round.name)} · ${esc(round.label)}${round.days > 7 ? ` · dobbeltuge (${round.days} dage)` : ""}</p>`;
  if (!played) { app.innerHTML = html; return; }

  const cats = D.categories;
  const catRow = (s, i) => `<tr><td><span class="tcell">${logo(m[s], "sm")}<span>${name(m[s])}</span></span></td>
    ${m.cats.map((c) => { const v = s === "home" ? c.h : c.a; const won = c.w === (s === "home" ? "H" : "A");
      return `<td class="${won ? "win" : c.w === "=" ? "tie" : ""}">${fmtCat(c.cat, v)}</td>`; }).join("")}
    <td class="score">${m.score[i]}</td></tr>`;
  html += `
    <div class="card tablewrap hm"><table>
      <thead><tr><th>Hold</th>${cats.map((c) => `<th>${c}</th>`).join("")}<th>Score</th></tr></thead>
      <tbody>${catRow("home", 0)}${catRow("away", 1)}</tbody></table></div>
    <div class="section"><h2>Hvor tæt er det?</h2><div class="card pad">${m.cats.map(tug).join("")}</div>
    <p class="note">Bjælken viser forspringet i hver kategori. Gul kategori = tæt nok til at vippe.</p></div>
    <div class="section"><h2>Box score · ${name(m.home)}</h2>${boxTable(m.box.home, m.totals.home)}</div>
    <div class="section"><h2>Box score · ${name(m.away)}</h2>${boxTable(m.box.away, m.totals.away)}</div>
    <p class="note">Kun kampe hvor spilleren stod på en aktiv plads (ikke bænk/IR) tæller.</p>`;
  app.innerHTML = html;
}

function tug(c) {
  let d = isPct(c.cat) ? (c.h - c.a) / 0.06 : (c.h - c.a) / Math.max(c.h, c.a, 1);
  if (c.cat === "TO") d = -d;
  const width = Math.min(1, Math.abs(d)) * 100;
  const close = c.w !== "=" && Math.abs(d) < 0.08;
  const diff = isPct(c.cat) ? pct3(Math.abs(c.h - c.a)) : Math.abs(Math.round(c.h - c.a));
  return `<div class="tug">
    <span class="v l" style="${c.w === "H" ? "font-weight:800" : ""}">${fmtCat(c.cat, c.h)}</span>
    <span class="bar l">${d > 0 ? `<i style="width:${width}%"></i>` : ""}</span>
    <span class="lab ${close || c.w === "=" ? "close" : ""}" title="Forskel: ${diff}">${c.cat}</span>
    <span class="bar r">${d < 0 ? `<i style="width:${width}%"></i>` : ""}</span>
    <span class="v r" style="${c.w === "A" ? "font-weight:800" : ""}">${fmtCat(c.cat, c.a)}</span></div>`;
}

function boxTable(rows, tot) {
  const line = (p, total) => {
    const fg = p.FGA ? pct3(p.FGM / p.FGA) : "–";
    const ft = p.FTA ? pct3(p.FTM / p.FTA) : "–";
    return `<tr class="${total ? "total" : ""}">
      <td class="left">${total ? "Total" : esc(p.player)}</td><td>${total ? "" : esc(p.pro || "")}</td><td>${p.GP}</td>
      <td>${p.FGM}-${p.FGA}</td><td>${fg}</td><td>${p.FTM}-${p.FTA}</td><td>${ft}</td>
      <td>${p["3PM"]}</td><td>${p.PTS}</td><td>${p.REB}</td><td>${p.AST}</td><td>${p.STL}</td><td>${p.BLK}</td><td>${p.TO}</td></tr>`;
  };
  if (!rows.length) return '<p class="empty">Ingen kampe spillet endnu.</p>';
  return `<div class="card tablewrap"><table class="box">
    <thead><tr><th class="left">Spiller</th><th>NBA</th><th>K</th><th>FGM-A</th><th>FG%</th><th>FTM-A</th><th>FT%</th>
      <th>3PM</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th></tr></thead>
    <tbody>${rows.map((p) => line(p, false)).join("")}${line(tot, true)}</tbody></table></div>`;
}

// ---------- stilling ----------
function formDots(form) {
  return `<span class="form">${form.map((o) => `<i class="${o}">${o}</i>`).join("") || '<span class="zero">–</span>'}</span>`;
}

function liveCell(s) {
  return s.live.map((l) => {
    if (l.started === false) return `<span class="zero" title="mod ${name(l.opp)}">– ${esc(team(l.opp)?.abbrev || "")}</span>`;
    const [mine, theirs] = l.score;
    const cls = mine > theirs ? "V" : mine < theirs ? "T" : "U";
    return `<a class="res ${cls}" href="#/kamp/${l.matchup}" title="Fører/bagud mod ${name(l.opp)}">${mine}-${theirs} ${esc(team(l.opp)?.abbrev || "")}</a>`;
  }).join(" ");
}

// view: "live" (hvis runden sluttede nu) eller "officiel" (kun afsluttede runder)
function standings(view) {
  const cut = D.league.playoff_teams;
  const hasLive = !!D.standings_live;
  const live = hasLive && view !== "officiel";
  const unranked = !live && !D.any_final;   // ingen runder er afgjort: vis ikke en placering
  let table = live ? D.standings_live : D.standings;
  if (unranked) table = [...table].sort((a, b) => team(a.team).name.localeCompare(team(b.team).name, "da"));
  const rows = table.map((s) => {
    const mv = s.move > 0 ? `<span class="mv up">▲${s.move}</span>` : s.move < 0 ? `<span class="mv down">▼${-s.move}</span>` : "";
    return `<tr class="${!unranked && s.rank === cut ? "cut" : ""}">
      <td class="rk">${unranked ? "–" : s.rank + mv}</td>
      <td class="left"><a class="tcell" href="#/hold/${s.team}">${logo(s.team, "sm")}<span>${name(s.team)}</span>${holdsBelt(s.team) ? beltMark() : ""}${s.clinch ? `<span class="cl ${s.clinch}">${s.clinch}</span>` : ""}</a></td>
      <td>${s.w}</td><td>${s.d}</td><td>${s.l}</td><td class="hm">${s.played ? pct3(s.pct) : "–"}</td>
      <td class="hm">${s.gb ? s.gb : "–"}</td><td class="hm">${s.cat_for}</td><td class="hm">${s.cat_against}</td>
      <td class="${sgnClass(s.cat_diff)}">${signed(s.cat_diff)}</td><td class="hm">${s.streak || "–"}</td>
      <td class="hm">${formDots(s.form)}</td><td>${liveCell(s)}</td></tr>`;
  });
  const seg = (href, label, on) => `<a class="seg ${on ? "on" : ""}" href="${href}">${label}</a>`;
  const toggle = hasLive ? `<div class="controls"><span class="segs">${seg("#/stilling", "Live", live)}${seg("#/stilling/officiel", "Officiel", !live)}</span>
    <span class="small">${live ? "Foreløbig: sådan står det, hvis runden sluttede nu" : "Kun afsluttede runder tæller"}</span></div>` : "";
  const intro = unranked ? '<p class="note">Ingen kampe er afgjort endnu, så der er ingen placering. Holdene står i alfabetisk rækkefølge.</p>' : "";
  app.innerHTML = `
    <div class="head-row"><h1>Stilling</h1><span class="sub">${esc(D.league.season)}</span>${live ? '<span class="pill live">Foreløbig</span>' : ""}</div>
    ${toggle}${intro}
    <div class="card tablewrap"><table>
      <thead><tr><th>#</th><th class="left">Hold</th><th>V</th><th>U</th><th>T</th><th class="hm">Sejr%</th><th class="hm">GB</th>
        <th class="hm">Kat +</th><th class="hm">Kat −</th><th>+/-</th><th class="hm">Stime</th><th class="hm">Form</th><th>Denne runde</th></tr></thead>
      <tbody>${rows.join("")}</tbody></table></div>
    <p class="note">Top ${cut} går i slutspil (orange streg). ${live ? "Pilene viser flytning i forhold til den officielle stilling." : "x = sikret slutspil, e = ude."}
      Placering: flest sejre, så flest uafgjorte, så indbyrdes kamp, så kategori +/-, så flest vundne kategorier.
      <span class="hm">GB = kampe efter nr. 1.</span></p>`;
}

// ---------- program ----------
function teamResult(m, teamId) {
  // Resultat set fra ét holds side: [klasse, tekst] eller null hvis kampen ikke er startet.
  // "U 4-4 ↑" = uafgjort i slutspillet, holdet gik videre som bedst seedet.
  if (!hasScore(m)) return null;
  const home = m.home === teamId;
  const [mine, theirs] = home ? [m.score[0], m.score[1]] : [m.score[1], m.score[0]];
  const drawn = m.winner === null || m.winner === undefined;
  const cls = m.status === "live" ? "live" : drawn ? "U" : m.winner === teamId ? "V" : "T";
  const through = cls === "U" && m.advancing === teamId ? " ↑" : "";
  return [cls, `${cls === "live" ? "" : cls + " "}${mine}-${theirs}${through}`];
}

// view: "skema" (hold × runder), "runder" (runde for runde) eller et hold-id
function schedule(view) {
  const teams = Object.values(D.teams).sort((a, b) => a.name.localeCompare(b.name));
  const teamId = typeof view === "number" ? view : null;
  const options = teams.map((t) => `<option value="${t.id}" ${t.id === teamId ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  const reg = D.rounds.filter((r) => !r.playoff);
  let body;
  if (teamId) {
    const rows = D.rounds.flatMap((r) => r.matchups.filter((m) => m.home === teamId || m.away === teamId).map((m) => {
      const home = m.home === teamId;
      const opp = home ? m.away : m.home;
      const res = teamResult(m, teamId);
      const result = res ? `<a class="res ${res[0]}" href="#/kamp/${m.id}">${res[1]}</a>` : '<span class="zero">–</span>';
      const oppCell = opp === null || opp === undefined ? '<span class="zero">Afgøres senere</span>'
        : `<a class="tcell" href="#/hold/${opp}">${logo(opp, "sm")}<span>${name(opp)}</span></a>`;
      return `<tr><td><span class="full">${esc(r.name)}</span><span class="abbr">${esc(r.short)}</span></td><td class="hm">${esc(r.label)}</td><td class="hm">${home ? "Hjemme" : "Ude"}</td>
        <td class="left">${oppCell}</td><td>${result}</td></tr>`;
    })).join("");
    body = `<div class="card tablewrap"><table><thead><tr><th>Runde</th><th class="hm">Datoer</th><th class="hm"></th><th class="left">Modstander</th><th>Resultat</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  } else if (view === "runder") {
    body = reg.map((r) => `
      <div class="section"><div class="head-row"><h3>${esc(r.name)}</h3><span class="sub">${esc(r.label)}</span>${statusPill(r)}</div>
      <div class="card tablewrap"><table><tbody>${r.matchups.map((m) => {
        const score = hasScore(m) ? `<a href="#/kamp/${m.id}"><b>${m.score[0]}-${m.score[1]}</b></a>` : '<span class="zero">vs</span>';
        return `<tr><td class="left"><span class="tcell">${logo(m.home, "sm")}<span>${name(m.home)}</span></span></td>
          <td style="width:80px">${score}</td>
          <td class="left"><span class="tcell">${logo(m.away, "sm")}<span>${name(m.away)}</span></span></td></tr>`;
      }).join("")}</tbody></table></div></div>`).join("");
  } else {
    // Skema: én række pr. hold, én kolonne pr. runde, modstander og resultat i cellen
    const head = reg.map((r) => `<th class="${r.status}">${esc(r.short)}<small>${shortDate(r.start)}</small></th>`).join("");
    const rows = teams.map((t) => `<tr><td class="left"><a class="tcell" href="#/program/${t.id}">${logo(t.id, "sm")}<span class="full">${esc(t.name)}</span><span class="abbr">${esc(t.abbrev)}</span></a></td>
      ${reg.map((r) => {
        const m = r.matchups.find((x) => x.home === t.id || x.away === t.id);
        if (!m) return "<td></td>";
        const home = m.home === t.id;
        const opp = home ? m.away : m.home;
        const res = teamResult(m, t.id);
        const href = res ? `#/kamp/${m.id}` : `#/kampe/${r.id}`;
        return `<td class="${r.status}"><a class="sk" href="${href}" title="${home ? "Hjemme" : "Ude"} mod ${name(opp)}">
          ${logo(opp, "sm")}<b>${esc(team(opp)?.abbrev || "")}</b>
          ${res ? `<span class="res ${res[0]}">${res[1]}</span>` : `<small>${home ? "hjemme" : "ude"}</small>`}</a></td>`;
      }).join("")}</tr>`).join("");
    body = `<div class="card tablewrap"><table class="skema"><thead><tr><th class="left">Hold</th>${head}</tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="note">Klik på et hold for dets program, eller på en kamp for detaljer. Slutspillet står under Slutspil.</p>`;
  }
  const tab = (href, label, on) => `<a class="seg ${on ? "on" : ""}" href="${href}">${label}</a>`;
  app.innerHTML = `
    <div class="head-row"><h1>Program</h1><span class="sub">${longDate(reg[0].start)} – ${longDate(reg[reg.length - 1].end)}</span></div>
    <div class="controls">
      <span class="segs">${tab("#/program", "Skema", !teamId && view !== "runder")}${tab("#/program/runder", "Runde for runde", view === "runder")}</span>
      <select id="teamsel" aria-label="Vælg hold"><option value="">Vælg hold…</option>${options}</select>
    </div>
    ${body}`;
  document.getElementById("teamsel").addEventListener("change", (e) => {
    location.hash = e.target.value ? `#/program/${e.target.value}` : "#/program";
  });
}

// ---------- slutspil ----------
function bracket() {
  const b = D.bracket;
  const col = (rd, i) => {
    const matches = rd.matches.map((m, k) => {
      const lines = [["home", 0], ["away", 1]].map(([s, j]) => {
        const id = m[s];
        if (id === null || id === undefined) {
          return `<div class="bt ph"><span class="seed">${m[`${s}_seed`] || ""}</span><span></span><span class="nm">${esc((m.placeholders || [])[j] || "")}</span><span></span></div>`;
        }
        const adv = m.advancing !== undefined && m.advancing !== null;
        const cls = adv ? (m.advancing === id ? "adv" : "out") : b.projected ? "proj" : "";
        return `<div class="bt ${cls}"><span class="seed">${m[`${s}_seed`] || ""}</span>${logo(id, "sm")}
          <span class="nm">${name(id)}</span><span class="s">${m.score ? m.score[j] : ""}</span></div>`;
      }).join("");
      const linkable = m.score && !b.projected;
      return linkable ? `<a class="card bm" href="#/kamp/${m.matchup}">${lines}</a>` : `<div class="card bm">${lines}</div>`;
    }).join("");
    return `<div class="bcol"><h3>${esc(rd.name)} <small>${esc(rd.label)}</small></h3><div class="bmatches">${matches}</div></div>`;
  };
  const champ = b.champion !== null && b.champion !== undefined
    ? `<div class="card champ won">${logo(b.champion, "big")}<b>${name(b.champion)}</b><span>Mester ${esc(D.league.season)}</span></div>`
    : `<div class="card champ"><span class="lg big">?</span><b style="color:var(--faint)">Mester</b></div>`;
  const seeds = b.seeds.map((id, i) => `<tr><td class="rk">${i + 1}</td><td class="left"><a class="tcell" href="#/hold/${id}">${logo(id, "sm")}<span>${name(id)}</span></a></td><td>${record(id)}</td></tr>`).join("");
  app.innerHTML = `
    <div class="head-row"><h1>Slutspil</h1><span class="sub">${esc(D.league.season)}</span></div>
    ${b.empty ? `<div class="banner">Top ${D.league.playoff_teams} i grundspillet går i slutspil. Holdene sættes ind, når der er spillet kampe.</div>`
      : b.projected ? '<div class="banner">Foreløbige seeds: sådan ser slutspillet ud, hvis grundspillet sluttede nu.</div>' : ""}
    <div class="bracket">${b.rounds.map(col).join("")}
      <div class="bcol"><h3>Mester <small>&nbsp;</small></h3><div class="bmatches">${champ}</div></div></div>
    ${b.seeds.length ? `<div class="section"><h2>Seeds${b.projected ? " (foreløbige)" : ""}</h2>
      <div class="card tablewrap" style="max-width:460px"><table><tbody>${seeds}</tbody></table></div></div>` : ""}
    <p class="note">Kvartfinaler: 1-8, 4-5, 3-6, 2-7. Det bedst seedede hold er hjemmehold og går videre ved uafgjort, også i finalen.
      Seeds og hver runde låses ved morgenopdateringen mandag; rettelser fra ESPN efter det ændrer ikke, hvem der gik videre.</p>`;
}

// ---------- hold ----------
function teamsList() {
  const ranked = D.standings_live || (D.any_final ? D.standings : null);
  const list = ranked || [...D.standings].sort((a, b) => team(a.team).name.localeCompare(team(b.team).name, "da"));
  const cards = list.map((s) => `
    <a class="card tcard" href="#/hold/${s.team}">${logo(s.team, "big")}
      <span><b>${name(s.team)}${holdsBelt(s.team) ? beltMark() : ""}</b><small>${ranked ? `Nr. ${s.rank} · ` : ""}${s.w}-${s.d}-${s.l} · Kat ${signed(s.cat_diff)}</small></span></a>`).join("");
  app.innerHTML = `<div class="head-row"><h1>Hold</h1></div><div class="grid3">${cards}</div>`;
}

function teamPage(id) {
  const t = team(id);
  const s = standing(id);
  if (!t || !s) return notFound();
  const games = D.rounds.flatMap((r) => r.matchups.filter((m) => m.home === id || m.away === id).map((m) => [r, m]));
  const rows = games.map(([r, m]) => {
    const home = m.home === id;
    const opp = home ? m.away : m.home;
    const res = teamResult(m, id);
    const result = res ? `<a class="res ${res[0]}" href="#/kamp/${m.id}">${res[1]}</a>` : '<span class="zero">–</span>';
    const oppCell = opp === null || opp === undefined ? '<span class="zero">Afgøres senere</span>'
      : `<a class="tcell" href="#/hold/${opp}">${logo(opp, "sm")}<span>${name(opp)}</span></a>`;
    return `<tr><td>${esc(r.short)}</td><td class="hm">${esc(r.label)}</td><td class="left">${oppCell}</td><td>${result}</td></tr>`;
  }).join("");

  const strength = D.category_strength[String(id)] || {};
  const n = Object.keys(D.teams).length;
  const anyFinal = D.rounds.some((r) => !r.playoff && r.status === "final");
  const bars = D.categories.map((c) => {
    const x = strength[c];
    if (!x || !anyFinal) return "";
    const share = (n - x.rank + 1) / n;
    const color = x.rank <= 3 ? "var(--win)" : x.rank >= n - 2 ? "var(--loss)" : "var(--home)";
    return `<div class="catbar"><b>${c}</b><span class="bar"><i style="width:${share * 100}%;background:${color}"></i></span>
      <span>${fmtCat(c, x.value)}</span><span class="rank">#${x.rank}</span></div>`;
  }).join("");

  // Spillere: læg box scores sammen over alle holdets kampe
  const players = {};
  for (const [, m] of games) {
    if (!m.box) continue;
    for (const p of m.box[m.home === id ? "home" : "away"]) {
      const acc = players[p.player] ||= { player: p.player, pro: p.pro, GP: 0, FGM: 0, FGA: 0, FTM: 0, FTA: 0, "3PM": 0, PTS: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0 };
      for (const k of Object.keys(acc)) if (typeof acc[k] === "number") acc[k] += p[k] || 0;
      acc.pro = p.pro || acc.pro;
    }
  }
  const top = Object.values(players).sort((a, b) => b.PTS - a.PTS);
  const totals = top.reduce((acc, p) => { for (const k of Object.keys(acc)) acc[k] += p[k]; return acc; },
    { GP: 0, FGM: 0, FGA: 0, FTM: 0, FTA: 0, "3PM": 0, PTS: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0 });

  app.innerHTML = `
    <a class="back" href="#/hold">‹ Alle hold</a>
    <div class="card thead">${logo(id, "big")}
      <div><h1>${name(id)}${holdsBelt(id) ? ` ${beltMark("MDIST-bæltet")}` : ""}</h1>
        ${holdsBelt(id) ? `<span class="small">${esc(D.belt.title)}</span>` : ""}
        <div class="stats-row">
          <span class="stat"><b>${currentRank(id) ? "#" + currentRank(id).rank : "–"}</b><small>Placering${currentRank(id)?.live ? " (foreløbig)" : ""}</small></span>
          <span class="stat"><b>${s.w}-${s.d}-${s.l}</b><small>V-U-T</small></span>
          <span class="stat"><b class="${sgnClass(s.cat_diff)}">${signed(s.cat_diff)}</b><small>Kat +/-</small></span>
          <span class="stat"><b>${s.streak || "–"}</b><small>Stime</small></span>
        </div></div></div>
    <div class="section"><h2>Kampe</h2><div class="card tablewrap"><table>
      <thead><tr><th>Runde</th><th class="hm">Datoer</th><th class="left">Modstander</th><th>Resultat</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    <div class="section"><h2>Kategoristyrker</h2><div class="card pad">${bars || '<p class="empty">Vises efter første afsluttede runde.</p>'}</div>
      <p class="note">Samlet i afsluttede grundspilsrunder. #1 er bedst i ligaen.</p></div>
    <div class="section"><h2>Spillere i turneringen</h2>${top.length ? boxTable(top, totals) : '<p class="empty">Ingen kampe spillet endnu.</p>'}</div>`;
}

// ---------- statistik ----------
function stats() {
  const hist = D.rank_history;
  const power = D.power.map((p, i) => `<tr><td class="rk">${i + 1}</td>
    <td class="left"><a class="tcell" href="#/hold/${p.team}">${logo(p.team, "sm")}<span>${name(p.team)}</span></a></td>
    <td>${p.rec.join("-")}</td><td>${pct3(p.pct)}</td><td>${pct3(p.actual)}</td>
    <td class="${sgnClass(Math.round(p.luck * 1000))}">${p.luck > 0 ? "+" : ""}${(p.luck * 100).toFixed(1)}%</td></tr>`).join("");
  const n = Object.keys(D.teams).length;
  const heatColor = (rank) => {
    const x = (rank - 1) / (n - 1);
    return x <= 0.5 ? `color-mix(in srgb, var(--win-bg) ${Math.round((1 - x * 2) * 100)}%, transparent)`
                    : `color-mix(in srgb, var(--loss-bg) ${Math.round((x - 0.5) * 200)}%, transparent)`;
  };
  const heat = D.standings.map((s) => `<tr><td class="left"><a class="tcell" href="#/hold/${s.team}">${logo(s.team, "sm")}<span>${name(s.team)}</span></a></td>
    ${D.categories.map((c) => { const x = D.category_strength[String(s.team)][c];
      return `<td style="background:${heatColor(x.rank)}" title="#${x.rank}">${fmtCat(c, x.value)}</td>`; }).join("")}</tr>`).join("");
  const rec = D.records;
  const catRec = rec.categories.map((r) => `<tr><td><b>${r.cat}</b></td><td class="left"><span class="tcell">${logo(r.team, "sm")}<span>${name(r.team)}</span></span></td>
    <td><b>${fmtCat(r.cat, r.value)}</b></td><td>${esc(r.round)}</td><td>${r.gp}</td></tr>`).join("");
  const wins = rec.biggest_wins.map((r) => `<tr><td>${esc(r.round)}</td><td class="left"><span class="tcell">${logo(r.winner, "sm")}<span>${name(r.winner)}</span></span></td>
    <td><a href="#/kamp/${r.matchup}"><b>${r.score.join("-")}</b></a></td><td class="left">${name(r.loser)}</td></tr>`).join("");
  const tow = rec.team_of_week.map((r) => `<tr><td>${esc(r.round)}</td><td class="left"><span class="tcell">${logo(r.team, "sm")}<span>${name(r.team)}</span></span></td><td>${r.rec.join("-")}</td></tr>`).join("");
  const anyFinal = D.rounds.some((r) => r.status === "final");

  app.innerHTML = `
    <div class="head-row"><h1>Statistik</h1><span class="sub">${esc(D.league.season)}</span></div>
    ${anyFinal ? "" : '<p class="empty">Statistikken fyldes ud, når første runde er afsluttet.</p>'}
    <div class="section"><h2>Placering runde for runde</h2><div class="card pad">
      ${hist.labels.length >= 2 ? '<div class="chartbox"><canvas id="race" aria-label="Placering pr. runde"></canvas></div>' : '<p class="empty">Kurven vises efter to afsluttede runder.</p>'}</div></div>
    <div class="section"><h2>Power ranking · alle mod alle</h2><div class="card tablewrap"><table>
      <thead><tr><th>#</th><th class="left">Hold</th><th>V-U-T</th><th>Sejr%</th><th>Faktisk</th><th>Held</th></tr></thead><tbody>${power}</tbody></table></div>
      <p class="note">Rekorden hvis hvert hold havde mødt alle andre hold hver runde. Held = faktisk sejr% minus alle-mod-alle sejr%.</p></div>
    <div class="section"><h2>Kategoristyrker</h2><div class="card tablewrap"><table class="heat">
      <thead><tr><th class="left">Hold</th>${D.categories.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${heat}</tbody></table></div>
      <p class="note">Samlet i afsluttede grundspilsrunder. Grøn = top i ligaen, rød = bund.</p></div>
    <div class="section cols2">
      <div><h2>Kategorirekorder (bedste uge)</h2><div class="card tablewrap"><table><thead><tr><th>Kat</th><th class="left">Hold</th><th>Værdi</th><th>Runde</th><th>K</th></tr></thead><tbody>${catRec}</tbody></table></div>
        <p class="note">Kun almindelige uger på 7 dage tæller med.</p></div>
      <div><h2>Største sejre</h2><div class="card tablewrap"><table><thead><tr><th>Runde</th><th class="left">Vinder</th><th>Score</th><th class="left">Taber</th></tr></thead><tbody>${wins}</tbody></table></div>
        <h2 style="margin-top:18px">Ugens hold</h2><div class="card tablewrap"><table><thead><tr><th>Runde</th><th class="left">Hold</th><th>Alle mod alle</th></tr></thead><tbody>${tow}</tbody></table></div></div>
    </div>`;

  if (hist.labels.length >= 2) drawRace(hist, n);
}

// Grafbiblioteket (Chart.js) bruges kun her, så det hentes først, når Statistik åbnes.
// Kan det ikke hentes, virker resten af siden stadig.
const CHART_JS = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";
async function drawRace(hist, n) {
  const box = document.querySelector(".chartbox");
  if (!window.Chart) {
    try { await loadScript(CHART_JS); } catch { if (box) box.outerHTML = '<p class="empty">Grafen kunne ikke hentes lige nu.</p>'; return; }
  }
  if (!document.getElementById("race")) return;   // brugeren er gået videre til en anden side
  const css = getComputedStyle(document.documentElement);
  const grid = css.getPropertyValue("--line").trim();
  const ink = css.getPropertyValue("--muted").trim();
  const datasets = D.standings.map((s) => ({
    label: team(s.team).name, data: hist.teams[String(s.team)], borderColor: teamColor(s.team),
    backgroundColor: teamColor(s.team), cubicInterpolationMode: "monotone", pointRadius: 3, borderWidth: 2.5,
  }));
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("race"), {
    type: "line", data: { labels: hist.labels, datasets },
    options: {
      maintainAspectRatio: false, interaction: { mode: "nearest", intersect: false },
      scales: { y: { reverse: true, min: 1, max: n, ticks: { stepSize: 1, color: ink }, grid: { color: grid } },
                x: { ticks: { color: ink }, grid: { color: grid } } },
      plugins: { legend: { position: "bottom", labels: { color: ink, boxWidth: 12, usePointStyle: true } } },
    },
  });
}

// ---------- regler ----------
function rules() {
  const reg = D.rounds.filter((r) => !r.playoff);
  const po = D.rounds.filter((r) => r.playoff);
  const belt = D.belt ? `
      <h2>MDIST-bæltet</h2>
      <p>Bæltet tilhører den regerende mester. ${name(D.belt.holder)} har det som ${esc(D.belt.title.toLowerCase())} og beholder det hele sæsonen.
        Først når finalen er afgjort, overtager den nye mester bæltet.</p>` : "";
  app.innerHTML = `
    <div class="head-row"><h1>Regler</h1><span class="sub">${esc(D.league.season)}</span></div>
    <div class="card pad rules">
      <h2>Format</h2>
      <p>Grundspil: ${reg.length} runder fra ${longDate(reg[0].start)} til ${longDate(reg[reg.length - 1].end)}. Alle ${Object.keys(D.teams).length} hold møder hinanden én gang, én kamp pr. runde.</p>
      <p>Slutspil: top ${D.league.playoff_teams} går videre. ${po.map((r) => `${esc(r.name)} ${esc(r.label)}`).join(", ")}.
        Kvartfinaler: 1-8, 4-5, 3-6, 2-7. Ved uafgjort går det bedst seedede hold videre. Det gælder også finalen.</p>
      <h2>Kampene</h2>
      <p>Hver kamp afgøres i 9 kategorier: FG%, FT%, 3PM, PTS, REB, AST, STL, BLK og TO (færrest vinder).
        Holdet med flest vundne kategorier vinder runden. Lige mange er uafgjort.</p>
      <p>Kun statistik fra spillere på aktive pladser tæller, dag for dag, præcis som i ESPN-ligaen. Bænk og IR tæller ikke.
        Uger går mandag til søndag (amerikansk tid). ${esc(D.league.calendar_note)}</p>
      <h2>Stillingen</h2>
      <p>1) Flest sejre. 2) Flest uafgjorte. 3) Indbyrdes kamp mellem de hold der står lige. 4) Kategori +/-.
        5) Flest vundne kategorier. 6) Bedste rekord mod alle hold (se power ranking under Statistik). 7) Lodtrækning.</p>
      <h2>Hvornår er et resultat endeligt?</h2>
      <p>ESPN retter af og til stats et par dage efter en kamp, så en rundes tal kan flytte sig lidt i dagene efter.
        Slutspillet låses ved morgenopdateringen mandag: seeds efter sidste grundspilsrunde, og derefter hvem der går videre
        efter hver slutspilsrunde. Rettelser fra ESPN efter låsningen ændrer ikke resultatet.</p>${belt}
      <h2>Data</h2>
      <p>Al statistik hentes automatisk fra ESPN. Mens der spilles NBA-kampe, opdateres siden ca. hvert 10. minut,
        og hver morgen laves en fuld opdatering.</p>
    </div>`;
}

// ---------- tidligere sæsoner ----------
let HISTORY = null;
async function historyPage(id) {
  if (!HISTORY) {
    app.innerHTML = '<p class="empty">Henter sæsonen…</p>';
    try { await loadScript(`history.js?v=${Date.now()}`); } catch { app.innerHTML = '<p class="empty">Sæsonen kunne ikke hentes.</p>'; return; }
    HISTORY = window.MDIST_HISTORY || [];
    if (!/^#\/saeson\//.test(location.hash)) return;   // brugeren er gået videre imens
  }
  const h = HISTORY.find((x) => x.id === id);
  if (!h) { app.innerHTML = '<p class="empty">Den sæson findes ikke. Vælg en anden i sæsonvælgeren øverst.</p>'; return; }
  const nm = (id) => esc(h.teams[String(id)] || "?");
  const lg = (id, cls = "sm") => (team(id) ? logo(id, cls) : `<span class="lg ${cls}"></span>`);
  const won = (c) => (c[0] === "TO" ? (c[1] < c[2] ? "H" : c[2] < c[1] ? "A" : "") : (c[1] > c[2] ? "H" : c[2] > c[1] ? "A" : ""));
  const strip = (cats) => (cats ? `<div class="cgrid">${cats.map((c) => `<span class="${won(c)}" title="${c[0]}: ${fmtCat(c[0], c[1])} – ${fmtCat(c[0], c[2])}">${c[0]}</span>`).join("")}</div>` : "");
  const card = (m, playoff) => {
    const [a, b] = m.score;
    const adv = playoff ? m.advancing : (a > b ? m.home : b > a ? m.away : null);
    const row = (side, sc, seed) => {
      const id = m[side];
      const cls = adv === null ? "" : adv === id ? "won" : "lost";
      const through = playoff && a === b && adv === id ? '<span class="through">videre</span>' : "";
      return `<div class="mrow ${side} ${cls}">${lg(id, "")}<div class="tn"><div>${seed ? `<span class="seed">${seed}</span>` : ""}${nm(id)}${through}</div></div><div class="sc">${sc}</div></div>`;
    };
    return `<div class="card mcard">${row("home", a, m.home_seed)}${row("away", b, m.away_seed)}${strip(m.cats)}</div>`;
  };
  const col = (rd) => `<div class="bcol"><h3>${esc(rd.name)} <small>${esc(rd.label)}</small></h3><div class="bmatches">${rd.matches.map((m) => {
    const line = (side, j) => { const id = m[side]; const cls = m.advancing === id ? "adv" : "out";
      return `<div class="bt ${cls}"><span class="seed">${m[`${side}_seed`] || ""}</span>${lg(id)}<span class="nm">${nm(id)}</span><span class="s">${m.score[j]}</span></div>`; };
    return `<div class="card bm">${line("home", 0)}${line("away", 1)}</div>`; }).join("")}</div></div>`;
  const table = h.standings.map((s) => `<tr class="${s.rank === 8 ? "cut" : ""}"><td class="rk">${s.rank}</td>
    <td class="left"><span class="tcell">${lg(s.team)}<span>${nm(s.team)}</span></span></td>
    <td>${s.w}</td><td>${s.d}</td><td>${s.l}</td><td class="hm">${s.cat_for}</td><td class="hm">${s.cat_against}</td>
    <td class="${sgnClass(s.cat_for - s.cat_against)}">${signed(s.cat_for - s.cat_against)}</td></tr>`).join("");
  const final = h.playoffs[h.playoffs.length - 1].matches[0];
  const runnerUp = final.advancing === final.home ? final.away : final.home;
  const fscore = final.advancing === final.home ? final.score : [final.score[1], final.score[0]];
  app.innerHTML = `
    <div class="head-row"><h1>Sæson ${esc(h.season)}</h1><a class="sub" href="#/kampe" style="text-decoration:underline">Tilbage til ${esc(D.league.season)}</a></div>
    <div class="card belthero" style="border-top-color:var(--accent)">${lg(h.champion, "big")}
      <div><span class="small">Mester ${esc(h.season)}</span><h1>${nm(h.champion)}</h1>
        <p class="small" style="margin:6px 0 0">Vandt finalen ${fscore[0]}–${fscore[1]} over ${nm(runnerUp)}.${D.belt && D.belt.holder === h.champion && D.belt.title === "Mester " + h.season ? ` Har derfor MDIST-bæltet i ${esc(D.league.season)}.` : ""}</p></div></div>
    <div class="section"><h2>Slutspillet</h2>
      <div class="bracket" style="grid-template-columns:repeat(3, minmax(210px, 1fr))">${h.playoffs.map(col).join("")}</div>
      <p class="note">${esc(h.seed_note || "")} Ved uafgjort gik det bedst seedede hold videre.</p></div>
    <div class="section"><h2>Slutstilling i grundspillet</h2><div class="card tablewrap" style="max-width:720px"><table>
      <thead><tr><th>#</th><th class="left">Hold</th><th>V</th><th>U</th><th>T</th><th class="hm">Kat +</th><th class="hm">Kat −</th><th>+/-</th></tr></thead>
      <tbody>${table}</tbody></table></div></div>
    <div class="section"><h2>Slutspilskampene</h2>${h.playoffs.map((rd) => `<div class="head-row"><h3>${esc(rd.name)}</h3><span class="sub">${esc(rd.label)}</span></div>
      <div class="grid2" style="margin-bottom:14px">${rd.matches.map((m) => card(m, true)).join("")}</div>`).join("")}</div>
    <div class="section"><h2>Grundspillet uge for uge</h2>${h.rounds.map((rd) => `<div class="head-row"><h3>${esc(rd.name)}</h3><span class="sub">${esc(rd.label)}</span></div>
      <div class="grid2" style="margin-bottom:14px">${rd.matchups.map((m) => card(m, false)).join("")}</div>`).join("")}
      <p class="note">Farverne viser, hvem der vandt hver kategori: blå = øverste hold, orange = nederste. Enkelte kampe vises uden kategorier.</p></div>`;
}

function notFound() {
  app.innerHTML = '<p class="empty">Siden findes ikke. <a href="#/" style="text-decoration:underline">Til forsiden</a></p>';
}

// ---------- routing ----------
const ROUTES = [
  [/^#?\/?$/, () => scoreboard(D.league.current_round), "kampe"],
  [/^#\/kampe\/?$/, () => scoreboard(D.league.current_round), "kampe"],
  [/^#\/kampe\/(\d+)$/, (m) => scoreboard(Number(m[1])), "kampe"],
  [/^#\/kamp\/(\d+-\d+)$/, (m) => matchup(m[1]), "kampe"],
  [/^#\/stilling(?:\/(live|officiel))?$/, (m) => standings(m[1]), "stilling"],
  [/^#\/saeson\/([\w-]+)$/, (m) => historyPage(m[1]), "saeson"],
  [/^#\/baeltet$/, () => { location.replace("#/kampe"); }, "kampe"],
  [/^#\/sidste-saeson$/, () => { location.replace(D.seasons.length ? `#/saeson/${D.seasons[0].id}` : "#/kampe"); }, "saeson"],
  [/^#\/program(?:\/(\d+|runder))?$/, (m) => schedule(m[1] === "runder" ? "runder" : m[1] ? Number(m[1]) : "skema"), "program"],
  [/^#\/slutspil$/, bracket, "slutspil"],
  [/^#\/hold$/, teamsList, "hold"],
  [/^#\/hold\/(\d+)$/, (m) => teamPage(Number(m[1])), "hold"],
  [/^#\/statistik$/, stats, "statistik"],
  [/^#\/regler$/, rules, "regler"],
];

function render() {
  const hash = location.hash || "#/";
  for (const [re, fn, tab] of ROUTES) {
    const m = hash.match(re);
    if (m) {
      document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
      setSeasonPicker();
      document.querySelector("#tabs a.on")?.scrollIntoView({ inline: "center", block: "nearest" });
      fn(m);
      return;
    }
  }
  notFound();
}

// Sæsonvælgeren øverst: den aktuelle sæson og alle tidligere sæsoner
function setSeasonPicker() {
  const sel = document.getElementById("season");
  const past = (location.hash.match(/^#\/saeson\/([\w-]+)$/) || [])[1] || "";
  sel.innerHTML = `<option value="">${esc(D.league.season)}</option>` +
    D.seasons.map((x) => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join("");
  sel.value = past;
  sel.hidden = !D.seasons.length;
  document.getElementById("tabs").hidden = !!past;   // fanerne gælder den aktuelle sæson
  const shown = D.seasons.find((x) => x.id === past)?.label || D.league.season;
  document.getElementById("league-sub").textContent = `In-Season Tournament ${shown}`;
}

function setHeader() {
  document.getElementById("league-name").textContent = D.league.name;
  document.getElementById("league-sub").textContent = `In-Season Tournament ${D.league.season}`;
  const started = D.rounds.some((r) => r.status !== "upcoming");
  document.getElementById("updated").textContent = started ? `Opdateret ${D.league.updated}`
    : `Turneringen starter ${longDate(D.rounds[0].start)}`;
  document.title = `${D.league.name} · In-Season Tournament ${D.league.season}`;
  document.getElementById("updated-foot").textContent = started ? `Opdateret ${D.league.updated}.` : "";
  // Mens turneringen er i gang, kommer der mindst én opdatering i døgnet. Er tallene over
  // 26 timer gamle, er opdateringen gået i stå, og det skal kunne ses.
  const notice = document.getElementById("notice");
  const day = 24 * 3600 * 1000;
  const now = Date.now();
  const from = new Date(D.league.active_from + "T12:00:00").getTime();
  const to = new Date(D.league.active_to + "T12:00:00").getTime() + 2 * day;
  const age = now - new Date(D.league.updated_iso).getTime();
  const stale = now > from + day && now < to && age > 26 * 3600 * 1000;
  notice.hidden = !stale;
  if (stale) notice.textContent = `Tallene er måske forældede: siden blev sidst opdateret ${D.league.updated}.`;
}

// data.js hentes med et tidsstempel, så browseren ikke viser gamle tal
function loadData(onload, onerror) {
  const s = document.createElement("script");
  s.src = `data.js?v=${Date.now()}`;
  s.onload = () => { s.remove(); onload(); };
  s.onerror = () => { s.remove(); onerror(); };
  document.head.appendChild(s);
}

// Nye tal hentes automatisk: hvert 3. minut mens en runde er live, ellers hvert 15. minut,
// og med det samme når man vender tilbage til fanen (fx på telefonen)
let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  const live = D.rounds.some((r) => r.status === "live");
  refreshTimer = setTimeout(refresh, (live ? 3 : 15) * 60 * 1000);
}
function refresh() {
  loadData(() => {
    const fresh = window.MDIST_DATA;
    if (fresh && fresh.league.updated_iso !== D.league.updated_iso) {
      D = fresh;
      setHeader();
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    }
    scheduleRefresh();
  }, scheduleRefresh);
}

function init() {
  D = window.MDIST_DATA;
  setHeader();
  document.getElementById("season").addEventListener("change", (e) => {
    location.hash = e.target.value ? `#/saeson/${e.target.value}` : "#/kampe";
  });
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  render();
  scheduleRefresh();
}

loadData(init, () => { app.innerHTML = '<p class="empty">Kunne ikke hente data.</p>'; });
