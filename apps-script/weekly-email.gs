/**
 * Pickleball Cook Islands: "week ahead" email.
 *
 * Visitors sign up with a Google Form, confirm by email, then get an email
 * every Sunday morning listing the week's sessions and events. The events come
 * from the same calendar feed the website uses (events-feed.gs), so the email
 * always matches the site.
 *
 * Setup is in apps-script/WEEKLY-EMAIL.md. In short: new Apps Script project in
 * the club account, paste this file, set FEED_URL and SITE_URL, run setup(),
 * deploy as a web app (Execute as: Me, Who has access: Anyone), paste the
 * /exec URL into WEB_APP_URL, deploy a new version.
 *
 * Free Gmail accounts can email about 100 recipients a day from a script.
 * sendWeekly() stops before the limit and emails ADMIN_EMAIL a warning.
 */

// The events feed's /exec URL (the same as CAL_FEED_URL in index.html).
const FEED_URL = '';
// This script's own web app URL (ends in /exec). Fill in after the first deployment.
const WEB_APP_URL = '';
const SITE_URL = 'https://pickleball-cook-islands.github.io/';
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

/** Run once from the editor. Creates the form, the subscribers sheet and the triggers. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FORM_ID')) {
    Logger.log('Already set up. Form: ' + FormApp.openById(props.getProperty('FORM_ID')).getPublishedUrl());
    return;
  }
  const ss = SpreadsheetApp.create(CLUB + ' – Week ahead subscribers');
  const form = FormApp.create(CLUB + ' – Week ahead emails')
    .setDescription("Get an email every Sunday morning with the week's drop-ins, league days and events. " +
      "We'll send you a link to confirm first. Every email has a one-click unsubscribe link. " +
      'We only use your email address for these emails.')
    .setConfirmationMessage("Thanks! Check your inbox (and spam folder) for an email to confirm your subscription.")
    .setCollectEmail(false)
    .setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(false);
  form.addTextItem().setTitle('Email address').setRequired(true)
    .setValidation(FormApp.createTextValidation().setHelpText('Enter a valid email address').requireTextIsEmail().build());
  form.addTextItem().setTitle('First name').setRequired(false);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  const sh = ss.insertSheet(SHEET, 0);
  sh.appendRow(COLS);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, COLS.length).setFontWeight('bold');

  props.setProperties({ FORM_ID: form.getId(), SHEET_ID: ss.getId() });
  ScriptApp.newTrigger('onSignup').forForm(form).onFormSubmit().create();
  ScriptApp.newTrigger('sendWeekly').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(SEND_HOUR).inTimezone(TZ).create();

  Logger.log('Form (share this link): ' + form.getPublishedUrl());
  Logger.log('Subscribers sheet: ' + ss.getUrl());
}

/* ---------- Sign-up and confirm / unsubscribe ---------- */

/** Form trigger: add or update the subscriber and send the confirmation email. */
function onSignup(e) {
  const answers = {};
  e.response.getItemResponses().forEach(r => { answers[r.getItem().getTitle()] = String(r.getResponse() || '').trim(); });
  const email = (answers['Email address'] || '').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  const name = answers['First name'] || '';

  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let row, token;
  try {
    const sh = sheet_();
    const data = sh.getDataRange().getValues();
    const i = data.findIndex((r, k) => k > 0 && String(r[C.Email]).toLowerCase() === email);
    if (i > 0 && data[i][C.Status] === 'confirmed') {
      if (name) sh.getRange(i + 1, C.Name + 1).setValue(name);
      return; // already subscribed: nothing to send
    }
    token = Utilities.getUuid();
    row = [email, name, 'pending', token, new Date(), '', '', ''];
    if (i > 0) sh.getRange(i + 1, 1, 1, COLS.length).setValues([row]);
    else sh.appendRow(row);
  } finally { lock.releaseLock(); }

  const props = PropertiesService.getScriptProperties();
  const today = fmt_(new Date(), 'yyyy-MM-dd');
  const count = props.getProperty('CONFIRMS_DAY') === today ? +props.getProperty('CONFIRMS_N') : 0;
  if (count >= MAX_CONFIRMS_PER_DAY || MailApp.getRemainingDailyQuota() <= QUOTA_RESERVE) {
    Logger.log('Confirmation for ' + email + ' not sent (daily limit). They can sign up again tomorrow.');
    return;
  }
  props.setProperties({ CONFIRMS_DAY: today, CONFIRMS_N: String(count + 1) });
  const link = webAppUrl_() + '?a=confirm&t=' + token;
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
}

/**
 * Confirm and unsubscribe links open a page with a button. The change happens
 * only when the button is pressed, so email link scanners that open links
 * automatically can't confirm or unsubscribe anyone.
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

/** Called from the confirm / unsubscribe page. */
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
}

/** Sends this week's email to you (the script owner) only. Doesn't touch the subscriber list. */
function sendTestToMe() {
  sendWeekTo_(buildWeek_(new Date()), Session.getEffectiveUser().getEmail(), '', '');
}

/** Logs this week's email as text, without sending anything. */
function previewWeek() {
  Logger.log(buildWeek_(new Date()).text);
}

function sendWeekTo_(week, email, name, token) {
  const unsub = token ? webAppUrl_() + '?a=unsub&t=' + token : '';
  const hi = `Kia orana${name ? ' ' + esc_(name) : ''}, here's what's on this week.`;
  const foot = 'Times are Rarotonga time. ' + (unsub
    ? `You're getting this because you subscribed on the ${CLUB} website.<br><a href="${unsub}" style="color:${P.mute};text-decoration:underline">Unsubscribe</a>`
    : 'Test email: subscribers get an unsubscribe link here.');
  MailApp.sendEmail({
    to: email, name: CLUB, subject: week.subject,
    body: (name ? `Kia orana ${name},` : 'Kia orana,') + '\n\n' + week.text + '\n\nWebsite: ' + SITE_URL + (unsub ? '\nUnsubscribe: ' + unsub : ''),
    htmlBody: shell_({ title: 'The week ahead', sub: week.range, preheader: week.preheader,
      inner: `<p style="margin:0 0 6px;font-size:16px;color:${P.fg}">${hi}</p>${week.html}`, foot })
  });
}

/** Builds the email for the 7 days starting on the given day (Rarotonga time). */
function buildWeek_(from) {
  const day0 = fmt_(from, 'yyyy-MM-dd');
  const days = [];
  for (let i = 0; i < 7; i++) days.push(addDays_(day0, i));
  const endComing = addDays_(day0, 7 + COMING_UP_DAYS);

  const events = fetchEvents_();
  const inWeek = events.filter(e => e.date.length === 10 && e.date >= days[0] && e.date <= days[6]);
  const later = events.filter(e => e.date.length === 10 && e.date > days[6] && e.date < endComing && e.kind !== 'dropin');

  const label = d => fmt_(dateOf_(d), 'EEEE d MMMM');
  const short = d => fmt_(dateOf_(d), 'EEE d MMM');
  const range = `${short(days[0])} – ${short(days[6])}`;
  const subject = `PCI this week: ${range}`;

  let html = '';
  let text = `What's on at ${CLUB}, ${range}. Times are Rarotonga time.\n`;
  if (!inWeek.length) {
    html += card_(P.mute, `<div style="${H}font-size:22px;color:${P.fg}">No sessions this week</div>
      <div style="margin-top:4px;color:${P.mute};font-size:15px">Keep an eye on the website and Facebook for updates.</div>`);
    text += '\nNo sessions are scheduled this week.\n';
  }
  days.forEach(d => {
    const L = inWeek.filter(e => e.date === d);
    if (!L.length) return;
    html += dayHead_(label(d));
    text += `\n${label(d).toUpperCase()}\n`;
    L.forEach(e => { html += eventHtml_(e); text += eventText_(e); });
  });
  if (later.length) {
    html += dayHead_('Coming up');
    html += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.card};border-radius:12px">` +
      later.map((e, i) => `<tr><td style="padding:12px 16px;${i ? `border-top:1px solid ${P.line};` : ''}">
        <span style="${H}font-size:15px;letter-spacing:.06em;color:${COLOR[e.kind] || P.acc}">${esc_(short(e.date))}</span>
        <span style="color:${P.fg};font-size:15px">&nbsp;·&nbsp;${esc_(e.title)}</span>${e.place ? `<span style="color:${P.mute};font-size:14px">&nbsp;·&nbsp;${esc_(place_(e.place))}</span>` : ''}</td></tr>`).join('') +
      '</table>';
    text += '\nCOMING UP\n';
    later.forEach(e => { text += `${short(e.date)} · ${e.title}${e.place ? ' · ' + place_(e.place) : ''}\n`; });
  }
  html += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 4px"><tr><td style="border-radius:10px;background:${P.acc}">
    <a href="${SITE_URL}#cal" style="display:inline-block;padding:13px 26px;${H}font-size:18px;letter-spacing:.06em;color:${P.ink};text-decoration:none">See the full calendar</a></td></tr></table>`;

  const first = inWeek.find(e => e.kind !== 'dropin') || inWeek[0];
  const preheader = !inWeek.length ? 'No sessions scheduled this week.'
    : `${inWeek.length} session${inWeek.length > 1 ? 's' : ''} this week` +
      (first ? ` · ${fmt_(dateOf_(first.date), 'EEE')}: ${first.title}` : '');
  return { key: 'week of ' + day0, subject, range, preheader, html, text }; // text key, so Sheets doesn't turn it into a date
}

function dayHead_(t) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 10px"><tr>
    <td style="${H}font-size:15px;letter-spacing:.16em;color:${P.mute};white-space:nowrap;padding-right:12px">${esc_(t)}</td>
    <td width="100%" style="border-bottom:1px solid ${P.line};font-size:0;line-height:0">&nbsp;</td></tr></table>`;
}

function card_(color, inner) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;background:${P.card};border-radius:12px;border-collapse:separate">
    <tr><td width="6" style="background:${color};border-radius:12px 0 0 12px;font-size:0;line-height:0">&nbsp;</td>
    <td style="padding:14px 16px 15px">${inner}</td></tr></table>`;
}

function eventHtml_(e) {
  const c = COLOR[e.kind] || P.acc;
  const pill = (t, bg, fg) => `<span style="display:inline-block;${H}font-size:12px;letter-spacing:.12em;padding:3px 8px;border-radius:4px;background:${bg};color:${fg}">${esc_(t)}</span>`;
  const tags = pill(KIND[e.kind] || 'Event', c, e.kind === 'special' || e.kind === 'tourn' ? '#FFFFFF' : P.ink) +
    (e.moved ? '&nbsp;' + pill('Venue change', '#FFFFFF', P.ink) : '');
  const crab = e.kind === 'league' ? `<img src="${SITE_URL}assets/img/crab.png" width="22" height="19" alt="" style="vertical-align:-2px;margin-right:6px;border:0">` : '';
  const when = [e.time, e.place ? place_(e.place) : ''].filter(Boolean).map(esc_).join('&nbsp;&nbsp;·&nbsp;&nbsp;');
  const divs = e.divs ? `<div style="margin-top:10px">${e.divs.map(d =>
    pill(d[1], DIV[d[0]] || c, P.ink)).join('&nbsp;')}</div>` : '';
  const note = e.note ? `<div style="margin-top:8px;color:${P.mute};font-size:14px;line-height:1.45">${esc_(e.note)}</div>` : '';
  return card_(c, `<div>${tags}</div>
    <div style="${H}margin-top:8px;font-size:22px;line-height:1.1;color:${P.fg}">${crab}${esc_(e.title)}</div>
    ${when ? `<div style="${H}margin-top:5px;font-size:17px;letter-spacing:.03em;color:${c}">${when}</div>` : ''}${divs}${note}`);
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

function webAppUrl_() {
  const u = WEB_APP_URL || ScriptApp.getService().getUrl();
  if (!u) throw new Error('Deploy the script as a web app and set WEB_APP_URL.');
  return u;
}

/**
 * The branded email frame: dark PCI green, logo, big condensed title. Built from
 * tables with inline styles so it holds together in Gmail, Outlook and Apple Mail.
 * Barlow Condensed loads where the email app allows web fonts (Apple Mail, iOS);
 * elsewhere it falls back to Arial Narrow / Arial.
 */
function shell_(o) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${esc_(o.title || CLUB)}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Barlow:wght@400;500&display=swap" rel="stylesheet">
<style>@media (max-width:620px){.px{padding-left:16px!important;padding-right:16px!important}.ttl{font-size:40px!important}}</style></head>
<body style="margin:0;padding:0;background:${P.bg}">
${o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${P.bg}">${esc_(o.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.bg}"><tr><td align="center" style="padding:24px 0">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;font-family:${BODY};color:${P.fg}">
  <tr><td class="px" style="padding:8px 28px 0">
    <a href="${SITE_URL}"><img src="${SITE_URL}assets/img/logo.png" width="130" height="52" alt="${CLUB}" style="display:block;border:0;color:${P.acc};${H}font-size:20px"></a>
  </td></tr>
  <tr><td class="px" style="padding:22px 28px 0">
    <div class="ttl" style="${H}font-size:52px;line-height:.95;letter-spacing:.01em;color:${P.fg}">${esc_(o.title || CLUB)}</div>
    ${o.sub ? `<div style="${H}margin-top:8px;font-size:20px;letter-spacing:.1em;color:${P.acc}">${esc_(o.sub)}</div>` : ''}
    <div style="margin-top:18px;height:4px;width:64px;background:${P.acc};font-size:0;line-height:0">&nbsp;</div>
  </td></tr>
  <tr><td class="px" style="padding:20px 28px 8px;font-size:16px;line-height:1.5">${o.inner}</td></tr>
  <tr><td class="px" style="padding:24px 28px 8px;font-size:13px;line-height:1.6;color:${P.mute};text-align:center;border-top:1px solid ${P.line}">
    <a href="${SITE_URL}" style="color:${P.acc};text-decoration:none;${H}font-size:15px;letter-spacing:.08em">Website</a>
    &nbsp;&nbsp;·&nbsp;&nbsp;<a href="${FB_URL}" style="color:${P.acc};text-decoration:none;${H}font-size:15px;letter-spacing:.08em">Facebook</a>
    ${o.foot ? `<div style="margin-top:10px">${o.foot}</div>` : ''}
  </td></tr>
</table></td></tr></table></body></html>`;
}

// PCI colours, matching the website
const P = { bg: '#061D01', card: '#0B2906', line: '#244A1B', fg: '#FFFFFF', mute: '#9CB893', acc: '#39FF14', ink: '#061D01' };
const COLOR = { dropin: '#39FF14', league: '#F2DA1A', special: '#FA00BE', tourn: '#FA34BC', social: '#9CB893' };
const DIV = { 1: '#F4FF00', 2: '#FF7A00', 3: '#FF2B2B' };
const H = "font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;font-weight:800;text-transform:uppercase;";
const BODY = "'Barlow',Arial,Helvetica,sans-serif";
const FB_URL = 'https://www.facebook.com/pickleballcookislands';
const place_ = p => String(p).split(',')[0].trim();
const fmt_ = (d, pattern) => Utilities.formatDate(d, TZ, pattern);
const dateOf_ = iso => new Date(iso + 'T12:00:00-10:00');
const addDays_ = (iso, n) => fmt_(new Date(dateOf_(iso).getTime() + n * 864e5), 'yyyy-MM-dd');
const esc_ = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
