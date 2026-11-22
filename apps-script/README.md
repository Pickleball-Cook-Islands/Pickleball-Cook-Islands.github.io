# Events from Google Calendar

For the Sunday "week ahead" email to subscribers, see [WEEKLY-EMAIL.md](WEEKLY-EMAIL.md).

The site's Events tab, "Next session" panel and week strip come from the club's shared Google Calendar.
[`events-feed.gs`](events-feed.gs) is a small Google Apps Script that reads the calendar and gives the site
the upcoming events. Admins only ever use Google Calendar. Changes show on the site within about 5 minutes.

Until `CAL_FEED_URL` in `index.html` is set, the site uses the lists typed into `index.html`
(`DROPINS`, `DROPIN_CHANGES`, `EVENTS`) as before.

## One-time setup (calendar owner)

Do this in the account that should own the calendar (the club account for the live site).

1. **Create the calendar.** In Google Calendar, Other calendars › + › Create new calendar, e.g. "PCI Events".
   In its settings, set the time zone to **(GMT-10:00) Cook Islands Time**.
2. **Give admins access.** In the calendar's settings, Share with specific people › add each admin with
   **Make changes to events**. Don't use "Make changes and manage sharing" unless you want them to add or remove admins too.
3. **Copy the calendar ID.** Settings › Integrate calendar › Calendar ID (looks like `abc123@group.calendar.google.com`).
4. **Create the script.** Go to <https://script.google.com> › New project. Name it "PCI events feed".
   Replace the contents of `Code.gs` with [`events-feed.gs`](events-feed.gs), and paste the calendar ID into `CALENDAR_ID`.
5. **Check it.** Pick `testFeed` in the toolbar and press Run. Allow access when asked (it only reads your calendars).
   The Execution log shows the events the site will get.
6. **Publish it.** Deploy › New deployment › type **Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy.
   Copy the Web app URL (ends in `/exec`).
7. **Connect the site.** In `index.html`, set `const CAL_FEED_URL='<the /exec URL>';` and merge to `main`.

After editing the script later, use Deploy › Manage deployments › edit (pencil) › Version: New version,
so the URL stays the same.

"Anyone" means anyone with the URL can see the event list, the same as anyone visiting the site. It doesn't let
anyone see the rest of your Google account or change the calendar.

## Adding events (admins)

Add events to the **PCI Events** calendar as normal: title, date, time and location. The site shows:

| In Google Calendar | On the site |
|---|---|
| Title | Event title |
| Date and time (or all day) | Date and time, Rarotonga time. An all-day event over several days shows as e.g. "Mon 8 – Sat 13 Nov" |
| Location | Venue. "TSA", "Telecom Sports Arena", "Avatea Hall" or "Apii Nikao School" link to that venue's map |
| Description | Note under the event, plus the tags below |

Put these tags anywhere in the description:

| Tag | What it does |
|---|---|
| `#league` | Trader Jack's league day (links to fixtures and ladders) |
| `#dropin` | Members drop-in session |
| `#special` | Special event (pink card) |
| `#tournament` | Tournament |
| `#social` | Social |
| `#featured` | Shows it as a big card |
| `#tbc` | The day isn't confirmed yet: shows just the month. Put the event on any day in that month |
| `#quiet` | Don't email subscribers about adding, moving or cancelling this event (e.g. a test event). It still shows on the site |

No type tag: titles with "drop-in" in them are drop-ins, everything else is a special event.

On league days, put each division on its own line in the description, starting with "Div", for example:

```
#league
Div 1 · 1pm
Div 2 · 2pm
Div 3 · 3pm
```

### Regular drop-ins

Create each weekly drop-in once as a repeating event (Repeat › Weekly). The site shows the next 4 weeks.

- **Moving one session:** open that day's session, change the location, save › **This event**. The site marks it "Venue change".
- **Cancelling one session:** delete that day's session › **This event**.
- **Changing the timetable from now on:** edit › **This and following events**.
- **A special event replacing a drop-in:** delete or move that day's drop-in. The site no longer hides drop-ins automatically.

The weekly timetable on the Visitors page and in the FAQ still comes from `DROPINS` and the FAQ text in `index.html`,
so update those if the regular timetable changes.

## Testing locally

Serve the site (`python3 -m http.server 8000`) and add `?events=<feed URL>` to load any feed, e.g. a saved JSON file:
<http://localhost:8000/?events=test-events.json>. This only works on localhost.

Add `?fresh=1` to the `/exec` URL in a browser to see the feed without the 5-minute cache.
