/**
 * Pickleball Cook Islands: "week ahead" email.
 *
 * Visitors sign up on the website (email.html), confirm by email, then get an email
 * every Sunday morning listing the week's sessions and events. The events come
 * from the same calendar feed the website uses (events-feed.gs), so the email
 * always matches the site.
 *
 * Setup is in apps-script/WEEKLY-EMAIL.md. In short: new Apps Script project in
 * the club account, paste this file, set FEED_URL and SITE_URL, run setup(),
 * deploy as a web app (Execute as: Me, Who has access: Anyone), and put the
 * /exec URL in WEB_APP_URL in email.html on the website.
 *
 * Free Gmail accounts can email about 100 recipients a day from a script.
 * sendWeekly() stops before the limit and emails ADMIN_EMAIL a warning.
 */

// The events feed's /exec URL (the same as CAL_FEED_URL in preview.html).
const FEED_URL = 'https://script.google.com/macros/s/AKfycbyZUnUIvZzfO74bNgzacGXwDpkucXIn9DxVYVYzQZkncesPgE4IXhdwp75ZJErEiIE/exec';
// This script's own web app URL (ends in /exec) goes in WEB_APP_URL in email.html on the website,
// which sends confirm / unsubscribe requests here. The script itself doesn't need it.
const SITE_URL = 'https://pickleballcookislands.com/';
// Who gets warnings (quota, errors). '' = the account that owns the script.
const ADMIN_EMAIL = '';

const CLUB = 'Pickleball Cook Islands';
const TZ = 'Pacific/Rarotonga';
const SEND_HOUR = 7;        // Sunday, Rarotonga time (Google runs it within the hour)
const COMING_UP_DAYS = 28;  // "Coming up" lists league days and events this far after the week
const QUOTA_RESERVE = 3;    // emails kept back for the admin warning and new sign-ups
const WARN_AT = 80;         // warn the admin once this many people are subscribed
const MAX_CONFIRMS_PER_DAY = 20; // caps confirmation emails, so form spam can't use up the Sunday quota

const SHEET = 'Subscribers';
const COLS = ['Email', 'Name', 'Status', 'Token', 'Signed up', 'Confirmed', 'Unsubscribed', 'Last sent'];
const C = {}; COLS.forEach((c, i) => { C[c] = i; });
const KIND = {
  league: "Trader Jack's league", dropin: 'Members drop-in', special: 'Special event',
  tourn: 'Tournament', social: 'Social'
};

/* ---------- One-time setup ---------- */

/** Run once from the editor. Creates the subscribers sheet and the Sunday trigger. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHEET_ID')) {
    Logger.log('Already set up. Subscribers sheet: ' + SpreadsheetApp.openById(props.getProperty('SHEET_ID')).getUrl());
    return;
  }
  const ss = SpreadsheetApp.create(CLUB + ' – Week ahead subscribers');
  const sh = ss.getSheets()[0].setName(SHEET);
  sh.appendRow(COLS);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, COLS.length).setFontWeight('bold');

  props.setProperty('SHEET_ID', ss.getId());
  ScriptApp.newTrigger('sendWeekly').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(SEND_HOUR).inTimezone(TZ).create();

  Logger.log('Subscribers sheet: ' + ss.getUrl());
}

/* ---------- Sign-up and confirm / unsubscribe ---------- */

/**
 * A sign-up from the website: add or update the subscriber and send the confirmation email.
 * Returns 'invalid', 'already' (confirmed already: nothing sent), 'limit' (daily cap reached) or 'sent'.
 */
function signup_(rawEmail, rawName) {
  const email = String(rawEmail || '').trim().toLowerCase().slice(0, 254);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'invalid';
  const name = String(rawName || '').trim().replace(/\s+/g, ' ').slice(0, 60);

  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let row, token;
  try {
    const sh = sheet_();
    const data = sh.getDataRange().getValues();
    const i = data.findIndex((r, k) => k > 0 && String(r[C.Email]).toLowerCase() === email);
    if (i > 0 && data[i][C.Status] === 'confirmed') {
      if (name) sh.getRange(i + 1, C.Name + 1).setValue(cell_(name));
      return 'already'; // nothing to send
    }
    token = Utilities.getUuid();
    row = [cell_(email), cell_(name), 'pending', token, new Date(), '', '', ''];
    if (i > 0) sh.getRange(i + 1, 1, 1, COLS.length).setValues([row]);
    else sh.appendRow(row);
  } finally { lock.releaseLock(); }

  const props = PropertiesService.getScriptProperties();
  const today = fmt_(new Date(), 'yyyy-MM-dd');
  const count = props.getProperty('CONFIRMS_DAY') === today ? +props.getProperty('CONFIRMS_N') : 0;
  if (count >= MAX_CONFIRMS_PER_DAY || MailApp.getRemainingDailyQuota() <= QUOTA_RESERVE) {
    Logger.log('Confirmation for ' + email + ' not sent (daily limit). They can sign up again tomorrow.');
    return 'limit';
  }
  props.setProperties({ CONFIRMS_DAY: today, CONFIRMS_N: String(count + 1) });
  const link = emailLink_('confirm', token);
  const hi = name ? 'Kia orana ' + esc_(name) + ',' : 'Kia orana,';
  MailApp.sendEmail({
    to: email, name: CLUB,
    subject: 'Confirm your PCI week ahead emails',
    body: (name ? 'Kia orana ' + name + ',' : 'Kia orana,') + '\n\nConfirm your subscription to the Pickleball Cook Islands week ahead email:\n' + link +
      "\n\nIf you didn't sign up, ignore this email and you won't hear from us.",
    htmlBody: shell_({ title: 'Confirm your subscription', preheader: 'One tap to start getting the PCI week ahead email.',
      inner: `<p style="margin:0 0 12px">${hi}</p><p style="margin:0 0 20px">Tap the button to start getting the ${CLUB} week ahead email every Sunday morning: the week's drop-ins, league days and events.</p>` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:10px;background:${P.acc}"><a href="${link}" style="display:inline-block;padding:13px 26px;${H}font-size:18px;letter-spacing:.06em;color:${P.ink};text-decoration:none">Confirm subscription</a></td></tr></table>` +
        `<p style="margin:20px 0 0;color:${P.mute};font-size:14px">If you didn't sign up, ignore this email and you won't hear from us.</p>` })
  });
  return 'sent';
}

/** Stops a value starting with = + - @ being treated as a formula when the sheet is opened. */
const cell_ = v => /^[=+\-@]/.test(v) ? "'" + v : v;

/**
 * Requests from email.html on the website: the sign-up form (a=signup) and the confirm /
 * unsubscribe buttons. Confirm and unsubscribe links in emails open that page, and the change
 * happens only when its button is pressed, so email link scanners that open links automatically
 * can't confirm or unsubscribe anyone. The pages are on the website rather than served by
 * Apps Script, because Google puts a "This application was created by a Google Apps Script
 * user" banner on Apps Script pages.
 */
function doPost(e) {
  const p = (e && e.parameter) || {};
  if (p.a === 'signup') return json_(signupReply_(p));
  const a = p.a === 'unsub' || p.a === 'confirm' ? p.a : '';
  const t = /^[0-9a-f-]{36}$/i.test(p.t || '') ? p.t : '';
  let out;
  if (!a || !t) out = { ok: false, msg: "This link isn't complete. Try the link in your email again." };
  else {
    try { out = { ok: true, msg: act(a, t) }; }
    catch (err) { Logger.log('doPost: ' + err.message); out = { ok: false, msg: 'Something went wrong. Try again in a minute.' }; }
  }
  return json_(out);
}

function signupReply_(p) {
  // "website" is a field people can't see: only bots fill it in. Pretend it worked.
  const done = { ok: true, msg: "Thanks! Check your inbox (and spam folder) for an email from us, and tap the button in it to confirm." };
  if (p.website) return done;
  let r;
  try { r = signup_(p.email, p.name); }
  catch (err) { Logger.log('signup: ' + err.message); return { ok: false, msg: 'Something went wrong. Try again in a minute.' }; }
  if (r === 'invalid') return { ok: false, msg: "That email address doesn't look right. Check it and try again." };
  if (r === 'limit') return { ok: false, msg: "We can't send any more sign-up emails today. Please try again tomorrow." };
  return done; // 'sent', or 'already' (same message, so the form doesn't reveal who's subscribed)
}

const json_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);

/**
 * The old confirm / unsubscribe page, served by Apps Script (with Google's banner). Emails now
 * link to email.html instead; this stays so links in emails sent before that still work.
 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  const a = p.a === 'unsub' ? 'unsub' : p.a === 'confirm' ? 'confirm' : '';
  const t = /^[0-9a-f-]{36}$/i.test(p.t || '') ? p.t : '';
  const title = a === 'unsub' ? 'Unsubscribe' : 'Confirm subscription';
  const body = !a || !t
    ? `<h1>${CLUB}</h1><p>This link isn't complete. Try the link in your email again.</p>`
    : `<h1>${title}</h1><p id="m">${a === 'unsub'
        ? 'Stop getting the PCI week ahead email?'
        : 'Start getting the PCI week ahead email every Sunday morning?'}</p>
       <button id="b" onclick="go()">${a === 'unsub' ? 'Unsubscribe' : 'Yes, subscribe me'}</button>
       <script>function go(){var b=document.getElementById('b');b.disabled=true;b.textContent='One moment…';
       google.script.run.withSuccessHandler(function(msg){document.getElementById('m').textContent=msg;b.remove()})
       .withFailureHandler(function(){b.disabled=false;b.textContent='Try again'}).act('${a}','${t}')}</script>`;
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 16px;color:#0B2906}
    h1{font-size:24px}button{background:#39FF14;color:#061D01;font-weight:700;padding:10px 18px;border-radius:8px;border:0;cursor:pointer;font-size:16px}a{color:#0B2906}</style>
    ${body}<p style="margin-top:32px"><a href="${SITE_URL}" target="_top">${CLUB} website</a></p>`;
  return HtmlService.createHtmlOutput(html).setTitle(title + ' – ' + CLUB);
}

/** Confirms or unsubscribes. Called by doPost (email.html) and the old doGet page. */
function act(a, t) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = sheet_();
    const data = sh.getDataRange().getValues();
    const i = data.findIndex((r, k) => k > 0 && r[C.Token] === t);
    if (i < 1) return "We couldn't find that subscription. It may have been replaced by a newer sign-up.";
    const r = i + 1;
    if (a === 'confirm') {
      if (data[i][C.Status] === 'unsubscribed') return "You're unsubscribed. Sign up again on the website to resubscribe.";
      sh.getRange(r, C.Status + 1).setValue('confirmed');
      if (!data[i][C.Confirmed]) sh.getRange(r, C.Confirmed + 1).setValue(new Date());
      return "You're subscribed. Your first email arrives on Sunday morning.";
    }
    sh.getRange(r, C.Status + 1).setValue('unsubscribed');
    sh.getRange(r, C.Unsubscribed + 1).setValue(new Date());
    return "You're unsubscribed and won't get any more week ahead emails.";
  } finally { lock.releaseLock(); }
}

/* ---------- The Sunday email ---------- */

/**
 * Time trigger (Sunday morning). Safe to run again by hand: anyone already sent
 * this week's email is skipped.
 */
function sendWeekly() {
  const week = buildWeek_(new Date());
  const sh = sheet_();
  const data = sh.getDataRange().getValues();
  const subs = [];
  for (let k = 1; k < data.length; k++) if (data[k][C.Status] === 'confirmed') subs.push(k);

  let sent = 0, skipped = 0, failed = [];
  for (const k of subs) {
    if (data[k][C['Last sent']] === week.key) continue;
    if (MailApp.getRemainingDailyQuota() <= QUOTA_RESERVE) { skipped++; continue; }
    try {
      sendWeekTo_(week, data[k][C.Email], data[k][C.Name], data[k][C.Token]);
      sh.getRange(k + 1, C['Last sent'] + 1).setValue(week.key);
      sent++;
    } catch (err) { failed.push(data[k][C.Email] + ': ' + err.message); }
  }
  Logger.log(`Week ${week.key}: sent ${sent}, skipped for quota ${skipped}, failed ${failed.length}, subscribers ${subs.length}`);

  const problems = [];
  if (skipped) problems.push(`${skipped} subscriber(s) didn't get this week's email because the daily Gmail limit was reached. ` +
    'Run sendWeekly again from the script editor tomorrow to send the rest.');
  if (failed.length) problems.push('These sends failed:\n' + failed.join('\n'));
  if (subs.length >= WARN_AT) problems.push(`There are ${subs.length} confirmed subscribers. A free Gmail account can send about 100 emails a day, ` +
    'so it is time to plan a bigger sending option (see apps-script/WEEKLY-EMAIL.md).');
  if (problems.length && MailApp.getRemainingDailyQuota() > 0) {
    MailApp.sendEmail(ADMIN_EMAIL || Session.getEffectiveUser().getEmail(),
      'PCI week ahead email: needs attention', problems.join('\n\n'));
  }
  // Change alerts (change-alerts.gs): subscribers now know this week as it stands.
  if (typeof rebaselineChanges_ === 'function') {
    try { rebaselineChanges_(); } catch (err) { Logger.log('Change alerts: ' + err.message); }
  }
}

/** Sends this week's email to you (the script owner) only. Doesn't touch the subscriber list. */
function sendTestToMe() {
  sendWeekTo_(buildWeek_(new Date()), Session.getEffectiveUser().getEmail(), '', '');
}

/** Logs this week's email as text, without sending anything. */
function previewWeek() {
  Logger.log(buildWeek_(new Date()).text);
}

/** The Monday of the week the email covers: tomorrow on a Sunday, otherwise this week's Monday. */
function weekMonday_(from) {
  const today = fmt_(from, 'yyyy-MM-dd');
  const dow = +fmt_(from, 'u'); // 1 = Monday … 7 = Sunday
  return addDays_(today, dow === 7 ? 1 : 1 - dow);
}

function sendWeekTo_(week, email, name, token) {
  const unsub = token ? emailLink_('unsub', token) : '';
  const foot = 'Times are Rarotonga time. ' + (unsub
    ? `You subscribed on the ${CLUB} website. <a href="${unsub}" style="color:${P.mute};text-decoration:underline">Unsubscribe</a>`
    : 'Test email: subscribers get an unsubscribe link here.');
  MailApp.sendEmail({
    to: email, name: CLUB, subject: week.subject,
    body: (name ? `Kia orana ${name},` : 'Kia orana,') + '\n\n' + week.text + '\n\nWebsite: ' + SITE_URL + (unsub ? '\nUnsubscribe: ' + unsub : ''),
    htmlBody: shell_({ title: 'The week ahead', sub: week.range, preheader: week.preheader,
      hi: `Kia orana${name ? ' ' + esc_(name) : ''}!`, inner: week.html, foot })
  });
}

/**
 * Builds the email for Monday to Saturday. Sent on Sunday, that's the coming week;
 * run again Monday to Saturday (e.g. to finish after hitting the Gmail limit), it's the
 * current week, so the week key stays the same and nobody gets it twice.
 */
function buildWeek_(from) {
  const monday = weekMonday_(from);
  const days = [];
  for (let i = 0; i < 6; i++) days.push(addDays_(monday, i));
  const endComing = addDays_(days[5], 1 + COMING_UP_DAYS);

  const events = fetchEvents_();
  const inWeek = events.filter(e => e.date.length === 10 && e.date >= days[0] && e.date <= days[5]);
  const later = events.filter(e => e.date.length === 10 && e.date > days[5] && e.date < endComing && e.kind !== 'dropin');

  const label = d => fmt_(dateOf_(d), 'EEEE d MMMM');
  const short = d => fmt_(dateOf_(d), 'EEE d MMM');
  const range = `${short(days[0])} – ${short(days[5])}`;
  const subject = `PCI this week: ${range}`;

  // One table for the whole week: a date block per day, one row per event.
  let rows = '', first = true;
  let text = `What's on at ${CLUB}, ${range}. Times are Rarotonga time.\n`;
  days.forEach(d => {
    const L = inWeek.filter(e => e.date === d);
    if (!L.length) return;
    text += `\n${label(d).toUpperCase()}\n`;
    L.forEach((e, i) => {
      const top = i === 0 && !first ? `border-top:1px solid ${P.line};` : '';
      const date = i === 0 ? `<td rowspan="${L.length}" width="52" valign="top" style="${top}padding:10px 0 10px 12px">
          <div style="${H}font-size:12px;letter-spacing:.12em;color:${P.mute};line-height:1">${fmt_(dateOf_(d), 'EEE')}</div>
          <div style="${H}font-size:26px;color:${P.fg};line-height:1">${fmt_(dateOf_(d), 'd')}</div></td>` : '';
      rows += `<tr>${date}${eventCells_(e, top + (i ? `border-top:1px dashed ${P.line};` : ''))}</tr>`;
      text += eventText_(e);
    });
    first = false;
  });

  let html = inWeek.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.card};border-radius:12px;border-collapse:separate">${rows}</table>`
    : `<div style="background:${P.card};border-radius:12px;padding:16px;${H}font-size:18px;color:${P.fg}">No sessions this week
        <div style="font-family:${BODY};font-weight:400;text-transform:none;font-size:14px;color:${P.mute};margin-top:2px">Keep an eye on the website and Facebook for updates.</div></div>`;
  if (!inWeek.length) text += '\nNo sessions are scheduled this week.\n';

  if (later.length) {
    html += `<div style="${H}font-size:13px;letter-spacing:.16em;color:${P.mute};margin:16px 0 6px">Coming up</div>` +
      later.map(e => `<div style="font-size:14px;line-height:1.5;color:${P.fg}">
        <span style="${H}font-size:14px;letter-spacing:.05em;color:${COLOR[e.kind] || P.acc}">${esc_(short(e.date))}</span>
        &nbsp;${esc_(e.title)}${e.place ? `<span style="color:${P.mute}"> · ${esc_(place_(e.place))}</span>` : ''}</div>`).join('');
    text += '\nCOMING UP\n';
    later.forEach(e => { text += `${short(e.date)} · ${e.title}${e.place ? ' · ' + place_(e.place) : ''}\n`; });
  }

  const kinds = Object.keys(COLOR).filter(k => inWeek.some(e => e.kind === k));
  const key = kinds.length > 1 ? kinds.map(k => `<span style="white-space:nowrap"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${COLOR[k]}"></span>&nbsp;${esc_(KIND[k])}</span>`).join('&nbsp;&nbsp;&nbsp;') : '';
  html += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px"><tr>
    <td style="font-size:12px;color:${P.mute}">${key}</td>
    <td align="right" style="white-space:nowrap"><a href="${SITE_URL}#cal" style="display:inline-block;background:${P.acc};border-radius:8px;padding:8px 14px;${H}font-size:15px;letter-spacing:.05em;color:${P.ink};text-decoration:none">Full calendar</a></td></tr></table>`;

  const lead = inWeek.find(e => e.kind !== 'dropin') || inWeek[0];
  const preheader = !inWeek.length ? 'No sessions scheduled this week.'
    : `${inWeek.length} session${inWeek.length > 1 ? 's' : ''} this week` +
      (lead ? ` · ${fmt_(dateOf_(lead.date), 'EEE')}: ${lead.title}` : '');
  return { key: 'week of ' + monday, subject, range, preheader, html, text }; // text key, so Sheets doesn't turn it into a date
}

/** One event as two table cells: a colour bar, then time · venue over the title. */
function eventCells_(e, border) {
  const c = COLOR[e.kind] || P.acc;
  const pill = (t, bg) => `<span style="display:inline-block;${H}font-size:11px;letter-spacing:.06em;padding:1px 6px;border-radius:3px;background:${bg};color:${P.dark};vertical-align:1px">${esc_(t)}</span>`;
  const crab = e.kind === 'league' ? `<img src="${SITE_URL}assets/img/crab.png" width="16" height="14" alt="" style="vertical-align:-1px;margin-right:4px;border:0">` : '';
  const when = [e.time, e.place ? place_(e.place) : ''].filter(Boolean).map(esc_).join(' · ');
  const flag = e.flag ? pill(e.flag[0], e.flag[1]) + ' ' : '';
  const title = e.struck ? `<s style="color:${P.mute}">${esc_(e.title)}</s>` : esc_(e.title);
  const was = e.was ? `<div style="font-size:13px;line-height:1.35;color:${P.mute};margin-top:2px">Was ${esc_(e.was)}</div>` : '';
  const extras = (e.moved ? ' ' + pill('Venue change', '#FFFFFF') : '') +
    (e.divs ? ' ' + e.divs.map(d => pill(d[1], DIV[d[0]] || c)).join(' ') : '');
  const note = e.note && (e.showNote || e.kind !== 'dropin' && !e.flag)
    ? `<div style="font-size:13px;line-height:1.35;color:${P.mute};margin-top:2px">${esc_(e.note.length > 110 ? e.note.slice(0, 107).trim() + '…' : e.note)}</div>` : '';
  return `<td width="12" style="${border}padding:10px 0 10px 8px"><div style="width:4px;height:34px;border-radius:2px;background:${c}"></div></td>
    <td style="${border}padding:9px 12px 9px 6px">
      <div style="${H}font-size:14px;letter-spacing:.03em;color:${c};line-height:1.2">${when}</div>
      <div style="${H}font-size:18px;color:${P.fg};line-height:1.2">${flag}${crab}${title}${extras}</div>${was}${note}</td>`;
}

function eventText_(e) {
  return `- ${e.title}${e.moved ? ' (VENUE CHANGE)' : ''}\n  ${[e.time, e.place ? place_(e.place) : ''].filter(Boolean).join(' · ')}\n` +
    (e.divs ? '  ' + e.divs.map(d => d[1]).join(' · ') + '\n' : '') + (e.note ? '  ' + e.note + '\n' : '');
}

/* ---------- Helpers ---------- */

function fetchEvents_() {
  if (!FEED_URL) throw new Error('Set FEED_URL at the top of the script.');
  const res = UrlFetchApp.fetch(FEED_URL, { muteHttpExceptions: true, followRedirects: true });
  const j = JSON.parse(res.getContentText());
  if (!j || !Array.isArray(j.events)) throw new Error('Events feed error: ' + (j && j.error || res.getResponseCode()));
  return j.events.filter(e => e && typeof e.date === 'string' && e.title);
}

function sheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Run setup() first.');
  return SpreadsheetApp.openById(id).getSheetByName(SHEET);
}

/** A confirm or unsubscribe link: the page on the website (email.html), which calls doPost. */
function emailLink_(a, token) {
  return SITE_URL + 'email.html?a=' + a + '&t=' + token;
}

/**
 * The branded email frame: dark PCI green, logo beside a condensed title, built
 * compact so a normal week fits on one phone screen. Tables and inline styles so it
 * holds together in Gmail, Outlook and Apple Mail. Barlow Condensed loads where the
 * email app allows web fonts (Apple Mail, iOS); elsewhere it falls back to Arial Narrow / Arial.
 */
function shell_(o) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${esc_(o.title || CLUB)}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Barlow:wght@400;500&display=swap" rel="stylesheet">
<style>@media (max-width:620px){.px{padding-left:12px!important;padding-right:12px!important}}</style></head>
<body style="margin:0;padding:0;background:${P.bg}">
${o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${P.bg}">${esc_(o.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.bg}"><tr><td align="center" style="padding:14px 0">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;font-family:${BODY};color:${P.fg}">
  <tr><td class="px" style="padding:0 20px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle" style="border-bottom:3px solid ${P.acc};padding-bottom:10px">
        <div style="${H}font-size:30px;line-height:1;color:${P.fg}">${esc_(o.title || CLUB)}</div>
        ${o.sub ? `<div style="${H}margin-top:3px;font-size:15px;letter-spacing:.1em;color:${P.acc}">${esc_(o.sub)}</div>` : ''}
      </td>
      <td valign="middle" align="right" width="96" style="border-bottom:3px solid ${P.acc};padding-bottom:10px">
        <a href="${SITE_URL}"><img src="${SITE_URL}assets/img/logo.png" width="90" height="36" alt="PCI" style="display:block;border:0;color:${P.acc};${H}font-size:18px"></a></td>
    </tr></table>
    ${o.hi ? `<div style="margin-top:10px;font-size:14px;color:${P.mute}">${o.hi}</div>` : ''}
  </td></tr>
  <tr><td class="px" style="padding:0 20px 4px;font-size:15px;line-height:1.5">${o.inner}</td></tr>
  <tr><td class="px" style="padding:12px 20px 4px;font-size:12px;line-height:1.5;color:${P.mute};text-align:center">
    <a href="${SITE_URL}" style="color:${P.acc};text-decoration:none">Website</a> · <a href="${FB_URL}" style="color:${P.acc};text-decoration:none">Facebook</a>${o.foot ? `<br>${o.foot}` : ''}
  </td></tr>
</table></td></tr></table></body></html>`;
}

// PCI colours, matching the website
const P = { bg: '#061D01', card: '#0B2906', line: '#244A1B', fg: '#FFFFFF', mute: '#9CB893', acc: '#39FF14', ink: '#061D01', dark: '#061D01' };
const COLOR = { dropin: '#39FF14', league: '#F2DA1A', special: '#FA00BE', tourn: '#FA34BC', social: '#9CB893' };
const DIV = { 1: '#F4FF00', 2: '#FF7A00', 3: '#FF2B2B' };
const H = "font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;font-weight:800;text-transform:uppercase;";
const BODY = "'Barlow',Arial,Helvetica,sans-serif";
const FB_URL = 'https://www.facebook.com/profile.php?id=61572906476405';
const place_ = p => String(p).split(',')[0].trim();
const fmt_ = (d, pattern) => Utilities.formatDate(d, TZ, pattern);
const dateOf_ = iso => new Date(iso + 'T12:00:00-10:00');
const addDays_ = (iso, n) => fmt_(new Date(dateOf_(iso).getTime() + n * 864e5), 'yyyy-MM-dd');
const esc_ = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
