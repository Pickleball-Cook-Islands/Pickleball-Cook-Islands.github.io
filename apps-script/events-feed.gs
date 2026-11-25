/**
 * Pickleball Cook Islands: events feed.
 *
 * Reads the club's shared Google Calendar and returns the upcoming events as
 * JSON for the website (preview.html loads it from CAL_FEED_URL).
 *
 * Setup is in apps-script/README.md. In short: paste this file into a new
 * Apps Script project owned by the account that owns the calendar, set
 * CALENDAR_ID below, then Deploy > New deployment > Web app, Execute as: Me,
 * Who has access: Anyone.
 *
 * How admins mark up events (in the event description, anywhere):
 *   #league #dropin #special #tournament #social   the type of event
 *   #featured                                      show it as a big card
 *   #tbc                                           day not confirmed: show the month only
 *   Div 1 · 1pm (one line per division)            division chips on league days
 * Everything else in the description becomes the note on the event card.
 * Events with no type tag are private: they're left out of the feed completely,
 * so the same calendar can hold admin-only events (committee meetings, court
 * bookings) without them showing on the site or in emails.
 */

// The calendar's ID: Google Calendar > Settings for the calendar > Integrate calendar > Calendar ID.
// Leave '' to use the default calendar of the account running the script.
const CALENDAR_ID = '';

const TZ = 'Pacific/Rarotonga';
const MONTHS_AHEAD = 18;      // one-off events this far ahead
const DROPIN_WEEKS_AHEAD = 8; // repeating drop-ins only this far ahead (the site shows 4 weeks)
const CACHE_SECONDS = 300;    // how long a fetched copy is reused, so changes show within ~5 minutes

const KINDS = {
  league: 'league', dropin: 'dropin', 'drop-in': 'dropin', special: 'special',
  tournament: 'tourn', tourn: 'tourn', social: 'social'
};

// The feed is public, so every request is served from the cache: nobody can make each request
// read the calendar and use up the account's daily Apps Script quota. To see changes straight
// away, run testFeed() in the editor. Errors are logged here, not shown to visitors, and cached
// for a minute.
function doGet() {
  const cache = CacheService.getScriptCache();
  let body = cache.get('events');
  if (!body) {
    try {
      body = JSON.stringify(buildFeed());
      cache.put('events', body, CACHE_SECONDS);
    } catch (err) {
      console.error('Events feed: ' + (err && err.stack || err));
      body = JSON.stringify({ error: 'The events feed is unavailable right now.' });
      // Cache the error briefly too, so a calendar outage doesn't make every request retry it.
      cache.put('events', body, 60);
    }
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function buildFeed() {
  const cal = CALENDAR_ID ? CalendarApp.getCalendarById(CALENDAR_ID) : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error('Calendar not found. Check CALENDAR_ID and that this account can see it.');

  // Start of today in Rarotonga, so today's events stay on the site until they finish.
  const now = new Date();
  const start = new Date(Utilities.formatDate(now, TZ, "yyyy-MM-dd'T'00:00:00") + '-10:00');
  const end = new Date(start); end.setMonth(end.getMonth() + MONTHS_AHEAD);
  const dropinEnd = new Date(start.getTime() + DROPIN_WEEKS_AHEAD * 7 * 864e5);

  const seriesPlace = {}; // recurring event id -> the series' usual location
  const out = [];
  cal.getEvents(start, end).forEach(ev => {
    const item = toItem(ev);
    if (!item) return; // private: no type tag
    if (item.kind === 'dropin' && ev.getStartTime() > dropinEnd) return;
    if (ev.isRecurringEvent() && item.place) {
      const id = ev.getId();
      if (!(id in seriesPlace)) {
        let p = '';
        try { p = ev.getEventSeries().getLocation() || ''; } catch (_) {}
        seriesPlace[id] = p.trim();
      }
      if (seriesPlace[id] && norm(seriesPlace[id]) !== norm(item.place)) item.moved = 1;
    }
    out.push(item);
  });
  return { updated: new Date().toISOString(), tz: TZ, events: out };
}

/** An event as the site shows it, or null if it's private (no type tag). */
function toItem(ev) {
  const title = ev.getTitle().trim();
  const lines = cleanDescription(ev.getDescription()).split('\n');
  const tags = {};
  const divs = [];
  const note = [];
  lines.forEach(line => {
    line = line.replace(/#([a-z-]+)/gi, (m, t) => { tags[t.toLowerCase()] = 1; return ''; }).trim();
    if (!line) return;
    const d = /^div(?:ision)?\s*(\d)\b[^,;]{0,24}$/i.exec(line); // "Div 1 · 1pm", not a sentence about divisions
    if (d) divs.push([+d[1], line.replace(/^division/i, 'Div')]);
    else note.push(line);
  });

  const kind = Object.keys(tags).map(t => KINDS[t]).filter(Boolean)[0];
  if (!kind) return null;

  const item = { kind, title };
  if (ev.isAllDayEvent()) {
    const s = ev.getAllDayStartDate();
    const last = new Date(ev.getAllDayEndDate().getTime() - 864e5); // end date is exclusive
    item.date = fmt(s, 'yyyy-MM-dd');
    if (fmt(last, 'yyyy-MM-dd') !== item.date) {
      const sameMonth = fmt(s, 'MM') === fmt(last, 'MM');
      item.time = fmt(s, sameMonth ? 'EEE d' : 'EEE d MMM') + ' – ' + fmt(last, 'EEE d MMM');
    }
  } else {
    item.date = fmt(ev.getStartTime(), 'yyyy-MM-dd');
    item.time = clock(ev.getStartTime()) + ' – ' + clock(ev.getEndTime());
  }
  if (tags.tbc) { item.date = item.date.slice(0, 7); delete item.time; }
  const place = (ev.getLocation() || '').trim();
  if (place) item.place = place;
  if (note.length) item.note = note.join(' ');
  if (divs.length) item.divs = divs;
  if (tags.featured) item.big = 1;
  return item;
}

// Calendar descriptions edited on the web are HTML: keep the text and line breaks only.
function cleanDescription(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

const fmt = (d, pattern) => Utilities.formatDate(d, TZ, pattern);
const clock = d => fmt(d, 'h:mma').toLowerCase();
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Run this from the editor to check what the site will get (View > Logs). */
function testFeed() {
  Logger.log(JSON.stringify(buildFeed(), null, 2));
}
