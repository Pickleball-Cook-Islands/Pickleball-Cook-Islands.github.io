/**
 * Pickleball Cook Islands: schedule change alerts.
 *
 * Add this as a second file in the "PCI week ahead email" Apps Script project
 * (it uses the subscriber list, email design and helpers in weekly-email.gs).
 *
 * Every 5 minutes it compares the calendar's current week (Monday to Saturday,
 * the week the Sunday email covered) with what subscribers were last told. When
 * an upcoming event this week is added, cancelled, or moved to a different date,
 * time or venue, it emails every confirmed subscriber, once the calendar has had
 * no new edits for 30 minutes. That gives admins time to fix mistakes, and several
 * changes made together go out as one email. Changes to TODAY's sessions (a
 * last-minute session, a same-day cancellation) only wait 10 minutes, and the
 * subject starts with "TODAY:" so people notice it.
 *
 * Not emailed: changes to events in later weeks (the Sunday email covers those),
 * events that have already finished, title or description edits, events with
 * #quiet in their description, and private events (no type tag, so not on the site).
 * Adding a type tag to an event counts as adding it; removing it counts as cancelling it.
 *
 * Needs the Google Calendar API advanced service: in the editor, Services (+) ›
 * Google Calendar API › Add. Then run setupChangeAlerts() once.
 */

// The shared calendar's ID (the same as CALENDAR_ID in events-feed.gs).
const CALENDAR_ID = '';

const CHECK_EVERY_MINUTES = 5;   // how often the calendar is checked (Apps Script allows 1, 5, 10, 15 or 30)
const SETTLE_MINUTES = 30;       // wait this long after the last edit before emailing
const TODAY_SETTLE_MINUTES = 10; // shorter wait when a change affects today's sessions

/** Run once from the editor (and again after changing CHECK_EVERY_MINUTES): starts the check and records the calendar as it is now. */
function setupChangeAlerts() {
  if (!CALENDAR_ID) throw new Error('Set CALENDAR_ID at the top of change-alerts.gs.');
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'checkChanges')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkChanges').timeBased().everyMinutes(CHECK_EVERY_MINUTES).create();
  rebaselineChanges_();
  Logger.log('Change alerts on. The calendar is checked every %s minutes.', CHECK_EVERY_MINUTES);
}

/** Stops change alerts (removes the regular check). */
function stopChangeAlerts() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'checkChanges')
    .forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('Change alerts off.');
}

/** Logs what would be emailed right now, without waiting or sending. */
function previewChanges() {
  const props = PropertiesService.getScriptProperties();
  const base = JSON.parse(props.getProperty('CHG_BASE') || 'null');
  const win = changeWindow_(new Date());
  if (!base || base.key !== win.key) return Logger.log('No saved state for this week yet. Run setupChangeAlerts().');
  const changes = diffChanges_(base.ev, snapshot_(win), new Date());
  Logger.log(changes.length ? changesText_(changes, fmt_(new Date(), 'yyyy-MM-dd')) : 'No changes to email.');
}

/**
 * Emails the update to YOU only, straight away. Uses this week's real changes if there
 * are any; otherwise makes up a sample (the next event this week shown as new, changed
 * and cancelled) so you can see the email. Changes nothing: subscribers still get the
 * real update after the usual wait.
 */
function sendChangeTestToMe() {
  const win = changeWindow_(new Date());
  const cur = snapshot_(win);
  const base = JSON.parse(PropertiesService.getScriptProperties().getProperty('CHG_BASE') || 'null');
  let changes = base && base.key === win.key ? diffChanges_(base.ev, cur, new Date()) : [];
  if (!changes.length) {
    const next = Object.values(cur).filter(e => Date.parse(e.e) > Date.now()).sort((a, b) => a.s.localeCompare(b.s))[0];
    if (!next) throw new Error('No upcoming events this week to make a sample from. Add one to the calendar first.');
    const moved = Object.assign({}, next, { place: 'Avatea Hall', loc: 'Avatea Hall' });
    if (/avatea/i.test(next.loc)) moved.place = moved.loc = 'TSA';
    changes = [{ type: 'added', now: next }, { type: 'moved', now: moved, was: next }, { type: 'cancelled', was: next }];
    Logger.log('No real changes this week, so the test email uses a sample.');
  }
  sendChangesTo_(buildChanges_(changes, win), Session.getEffectiveUser().getEmail(), '', '');
  Logger.log('Sent to %s: %s change(s).', Session.getEffectiveUser().getEmail(), changes.length);
}

/**
 * Sends this week's real changes to every confirmed subscriber now, without waiting
 * for the 30 quiet minutes. Does nothing if there are no changes.
 */
function sendChangesNow() {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const win = changeWindow_(new Date());
    const cur = snapshot_(win);
    const base = JSON.parse(PropertiesService.getScriptProperties().getProperty('CHG_BASE') || 'null');
    if (!base || base.key !== win.key) return Logger.log('No saved state for this week yet. Run setupChangeAlerts().');
    const changes = diffChanges_(base.ev, cur, new Date());
    if (!changes.length) return Logger.log('No changes to send.');
    sendChanges_(changes, win);
    saveBase_(win.key, cur);
  } finally { lock.releaseLock(); }
}

/** Time trigger, every CHECK_EVERY_MINUTES. */
function checkChanges() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const now = new Date();
    const win = changeWindow_(now);
    const cur = snapshot_(win);
    const base = JSON.parse(props.getProperty('CHG_BASE') || 'null');

    // A new week starts (Sunday): the Sunday email tells everyone, so just start tracking it.
    // Same until that email has gone out, so nothing is sent the night before it.
    if (!base || base.key !== win.key || (fmt_(now, 'u') === '7' && props.getProperty('LAST_WEEKLY') !== win.key)) {
      saveBase_(win.key, cur);
      return;
    }

    const changes = diffChanges_(base.ev, cur, now);
    if (!changes.length) { props.deleteProperty('CHG_PENDING'); return; }

    // Wait for edits to settle: any further edit restarts the wait.
    const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(changes)));
    const pending = JSON.parse(props.getProperty('CHG_PENDING') || 'null');
    if (!pending || pending.hash !== hash) {
      const lastEdit = Math.max(...changes.map(c => c.now ? Date.parse(c.now.u) || 0 : 0), 0);
      props.setProperty('CHG_PENDING', JSON.stringify({ hash, since: lastEdit || now.getTime() }));
      return;
    }
    const today = fmt_(now, 'yyyy-MM-dd');
    const settle = changes.some(c => isToday_(c, today)) ? TODAY_SETTLE_MINUTES : SETTLE_MINUTES;
    if (now.getTime() - pending.since < settle * 60000) return;

    sendChanges_(changes, win);
    saveBase_(win.key, cur);
  } finally { lock.releaseLock(); }
}

/** Called by sendWeekly() after the Sunday email: subscribers now know the week as it stands. */
function rebaselineChanges_() {
  if (!CALENDAR_ID) return;
  const win = changeWindow_(new Date());
  saveBase_(win.key, snapshot_(win));
  PropertiesService.getScriptProperties().setProperty('LAST_WEEKLY', win.key);
}

/* ---------- Finding changes ---------- */

/** Monday 00:00 to Sunday 00:00 of the week the Sunday email covers (Rarotonga time). */
function changeWindow_(now) {
  const monday = weekMonday_(now);
  return {
    key: monday, monday,
    min: new Date(monday + 'T00:00:00-10:00'),
    max: new Date(addDays_(monday, 6) + 'T00:00:00-10:00')
  };
}

/** The week's events from the calendar, keyed by instance id (stays the same when a session is moved). */
function snapshot_(win) {
  const out = {};
  let pageToken;
  do {
    const res = Calendar.Events.list(CALENDAR_ID, {
      timeMin: win.min.toISOString(), timeMax: win.max.toISOString(),
      singleEvents: true, maxResults: 250, pageToken
    });
    (res.items || []).forEach(ev => {
      const item = ev.status !== 'cancelled' && apiItem_(ev);
      if (item) out[ev.id] = item; // private events (no type tag) aren't tracked
    });
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out;
}

/** A calendar API event in the same shape as the events feed, plus what's needed to spot changes. Null if private (no type tag). */
function apiItem_(ev) {
  const title = String(ev.summary || '').trim() || 'Untitled event';
  const tags = {}, divs = [], note = [];
  String(ev.description || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n').forEach(line => {
      line = line.replace(/#([a-z-]+)/gi, (m, t) => { tags[t.toLowerCase()] = 1; return ''; }).trim();
      if (!line) return;
      const d = /^div(?:ision)?\s*(\d)\b[^,;]{0,24}$/i.exec(line);
      if (d) divs.push([+d[1], line.replace(/^division/i, 'Div')]);
      else note.push(line);
    });
  const KINDS = { league: 'league', dropin: 'dropin', 'drop-in': 'dropin', special: 'special', tournament: 'tourn', tourn: 'tourn', social: 'social' };
  const kind = Object.keys(tags).map(t => KINDS[t]).filter(Boolean)[0];
  if (!kind) return null;

  const allDay = !!ev.start.date;
  const start = allDay ? new Date(ev.start.date + 'T00:00:00-10:00') : new Date(ev.start.dateTime);
  const end = allDay ? new Date(ev.end.date + 'T00:00:00-10:00') : new Date(ev.end.dateTime);
  const clock = d => fmt_(d, 'h:mma').toLowerCase();
  const item = {
    kind, title, date: fmt_(start, 'yyyy-MM-dd'),
    s: start.toISOString(), e: end.toISOString(), u: ev.updated || '',
    loc: String(ev.location || '').trim()
  };
  if (!allDay) item.time = clock(start) + ' – ' + clock(end);
  if (item.loc) item.place = item.loc;
  if (divs.length) item.divs = divs;
  if (note.length) item.note = note.join(' ').slice(0, 200);
  if (tags.quiet) item.quiet = 1;
  return item;
}

/** What changed for upcoming events: added, cancelled, or moved (date, time or venue). */
function diffChanges_(was, now, at) {
  const t = at.getTime(), out = [];
  const upcoming = x => Date.parse(x.e) > t;
  Object.keys(now).forEach(id => {
    const n = now[id], o = was[id];
    if (n.quiet || o && o.quiet) return;
    if (!o) { if (upcoming(n)) out.push({ type: 'added', now: n }); return; }
    if (o.s !== n.s || o.e !== n.e || o.loc !== n.loc) {
      if (upcoming(n) || upcoming(o)) out.push({ type: 'moved', now: n, was: o });
    }
  });
  Object.keys(was).forEach(id => {
    const o = was[id];
    if (!now[id] && !o.quiet && upcoming(o)) out.push({ type: 'cancelled', was: o });
  });
  const ord = { cancelled: 0, moved: 1, added: 2 };
  return out.sort((a, b) => (a.now || a.was).s.localeCompare((b.now || b.was).s) || ord[a.type] - ord[b.type]);
}

/** True when a change touches today: the session is today, or was today before it moved. */
function isToday_(c, today) {
  return (c.now && c.now.date === today) || (c.was && c.was.date === today);
}

function saveBase_(key, ev) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('CHG_BASE', JSON.stringify({ key, ev }));
  props.deleteProperty('CHG_PENDING');
}

/* ---------- The update email ---------- */

function sendChanges_(changes, win) {
  const mail = buildChanges_(changes, win);
  const sh = sheet_();
  const data = sh.getDataRange().getValues();
  let sent = 0, skipped = 0;
  const failed = [];
  for (let k = 1; k < data.length; k++) {
    if (data[k][C.Status] !== 'confirmed') continue;
    if (MailApp.getRemainingDailyQuota() <= QUOTA_RESERVE) { skipped++; continue; }
    try { sendChangesTo_(mail, data[k][C.Email], data[k][C.Name], data[k][C.Token]); sent++; }
    catch (err) { failed.push(data[k][C.Email] + ': ' + err.message); }
  }
  Logger.log(`Schedule update: ${changes.length} change(s); sent ${sent}, skipped for quota ${skipped}, failed ${failed.length}`);
  const problems = [];
  if (skipped) problems.push(`${skipped} subscriber(s) didn't get the schedule update "${mail.subject}" because the daily Gmail limit was reached.`);
  if (failed.length) problems.push('These sends failed:\n' + failed.join('\n'));
  if (problems.length && MailApp.getRemainingDailyQuota() > 0) {
    MailApp.sendEmail(ADMIN_EMAIL || Session.getEffectiveUser().getEmail(), 'PCI schedule update email: needs attention', problems.join('\n\n'));
  }
}

function sendChangesTo_(mail, email, name, token) {
  const unsub = token ? emailLink_('unsub', token) : '';
  const foot = 'Times are Rarotonga time. ' + (unsub
    ? `You subscribed on the ${CLUB} website. <a href="${unsub}" style="color:${P.mute};text-decoration:underline">Unsubscribe</a>`
    : 'Test email: subscribers get an unsubscribe link here.');
  MailApp.sendEmail({
    to: email, name: CLUB, subject: mail.subject,
    body: (name ? `Kia orana ${name},` : 'Kia orana,') + '\n\n' + mail.text + '\n\nWebsite: ' + SITE_URL + (unsub ? '\nUnsubscribe: ' + unsub : ''),
    htmlBody: shell_({ title: 'Schedule update', sub: mail.range, preheader: mail.preheader,
      hi: `Kia orana${name ? ' ' + esc_(name) : ''}! ${mail.hi}`, inner: mail.html, foot })
  });
}

const CHANGE_FLAG = { cancelled: ['Cancelled', '#FF2B2B'], moved: ['Changed', '#FFFFFF'], added: ['New', '#39FF14'] };

function buildChanges_(changes, win) {
  const short = d => fmt_(dateOf_(d), 'EEE d MMM');
  const range = `This week: ${short(win.monday)} – ${short(addDays_(win.monday, 5))}`;
  const one = changes.length === 1 ? changes[0] : null;
  const what = c => `${short((c.now || c.was).date)} ${(c.now || c.was).title}`;
  const today = fmt_(new Date(), 'yyyy-MM-dd');
  const todays = changes.filter(c => isToday_(c, today)).length;
  const at = e => [(e.time || '').split(' – ')[0], e.place ? 'at ' + place_(e.place) : ''].filter(Boolean).join(' ');
  let subject;
  if (one && todays) {
    const e = one.now || one.was;
    subject = one.type === 'cancelled' ? `TODAY: ${e.title} cancelled`
      : one.type === 'added' ? `TODAY: ${e.title}, ${at(e)}`
      : e.date === today ? `TODAY: ${e.title} now ${at(e)}`
      : `TODAY: ${e.title} moved to ${short(e.date)}, ${at(e)}`;
  } else if (one) {
    subject = `PCI update: ${what(one)} ${one.type === 'cancelled' ? 'cancelled' : one.type === 'added' ? 'added' : 'changed'}`;
  } else if (todays === changes.length) {
    subject = `TODAY: ${changes.length} schedule changes`;
  } else {
    subject = `PCI update: ${changes.length} changes this week` + (todays ? ', including today' : '');
  }

  let rows = '';
  changes.forEach((c, i) => {
    const e = Object.assign({}, c.now || c.was);
    e.flag = CHANGE_FLAG[c.type];
    if (c.type === 'cancelled') e.struck = 1;
    if (c.type === 'added') e.showNote = 1; // e.g. "4 courts, sharing with Tereora College"
    if (c.type === 'moved') {
      const o = c.was;
      e.was = (o.date !== e.date ? short(o.date) + ', ' : '') + [o.time, o.place ? place_(o.place) : ''].filter(Boolean).join(' · ');
    }
    const top = i ? `border-top:1px solid ${P.line};` : '';
    const d = dateOf_(e.date);
    rows += `<tr><td width="52" valign="top" style="${top}padding:10px 0 10px 12px">
        <div style="${H}font-size:12px;letter-spacing:.12em;color:${e.date === today ? P.acc : P.mute};line-height:1">${e.date === today ? 'TODAY' : fmt_(d, 'EEE')}</div>
        <div style="${H}font-size:26px;color:${P.fg};line-height:1">${fmt_(d, 'd')}</div></td>${eventCells_(e, top)}</tr>`;
  });
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.card};border-radius:12px;border-collapse:separate">${rows}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px"><tr><td align="right">
    <a href="${SITE_URL}#cal" style="display:inline-block;background:${P.acc};border-radius:8px;padding:8px 14px;${H}font-size:15px;letter-spacing:.05em;color:${P.ink};text-decoration:none">Full calendar</a></td></tr></table>`;
  const preheader = changes.map(c => `${CHANGE_FLAG[c.type][0]}: ${what(c)}`).join(' · ');
  const hi = todays === changes.length ? (changes.length > 1 ? 'There are changes' : "There's a change") + " to today's schedule."
    : (changes.length > 1 ? 'There are changes' : "There's a change") + " to this week's schedule" + (todays ? ', including today.' : '.');
  return { subject, range, preheader, html, hi, count: changes.length, text: changesText_(changes, today) };
}

function changesText_(changes, today) {
  const short = d => (d === today ? 'TODAY ' : '') + fmt_(dateOf_(d), 'EEE d MMM');
  return "Changes to this week's schedule:\n\n" + changes.map(c => {
    const e = c.now || c.was;
    let s = `${CHANGE_FLAG[c.type][0].toUpperCase()}: ${short(e.date)} · ${e.title}\n  ${[e.time, e.place ? place_(e.place) : ''].filter(Boolean).join(' · ')}`;
    if (e.note && c.type !== 'cancelled') s += `\n  ${e.note}`;
    if (c.type === 'moved') s += `\n  Was: ${c.was.date !== e.date ? short(c.was.date) + ', ' : ''}${[c.was.time, c.was.place ? place_(c.was.place) : ''].filter(Boolean).join(' · ')}`;
    return s;
  }).join('\n\n');
}
