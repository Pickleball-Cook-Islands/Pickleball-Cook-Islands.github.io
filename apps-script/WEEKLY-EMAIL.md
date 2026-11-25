# Week ahead email

Visitors sign up on the website and confirm by email. Every Sunday at about 7am Rarotonga time, they get an email
listing the coming week's sessions and events (Monday to Saturday), plus league days and events coming up in the next 4 weeks.
The events come from the same calendar feed as the website ([events-feed.gs](events-feed.gs)), so the email always
matches the site. The email is sent from the Gmail account that owns the script.

Two parts work together:

- [`email.html`](../email.html) on the website: the sign-up form, and the page that confirm and unsubscribe links in emails open.
- [`weekly-email.gs`](weekly-email.gs), an Apps Script: the subscriber list (a Google Sheet), the emails and the Sunday send.
  `email.html` sends sign-ups and button presses to it.

The pages are on the website rather than served by Apps Script, because Google puts a
"This application was created by a Google Apps Script user" banner on every Apps Script page.

## One-time setup

Do this in the account that should send the emails (the club Gmail for the live site), after the events feed is set up.

1. Go to <https://script.google.com> › New project. Name it "PCI week ahead email".
   Replace the contents of `Code.gs` with [`weekly-email.gs`](weekly-email.gs).
2. At the top, set `FEED_URL` to the events feed's `/exec` URL (the same as `CAL_FEED_URL` in `preview.html`)
   and `SITE_URL` to the website's address. Set `ADMIN_EMAIL` if warnings should go somewhere other than this account.
3. Pick `setup` in the toolbar and press Run. Allow access when asked (sheets, email and running on a schedule).
   The Execution log shows the link to **the subscribers sheet**. It's also in your Google Drive.
4. Deploy › New deployment › **Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy and copy the `/exec` URL.
5. In [`email.html`](../email.html), set `WEB_APP_URL` to that URL and merge to `main`.
6. In `preview.html`, `SUBSCRIBE_URL` is `'email.html'`, so the site shows "Get the week ahead by email" on the homepage
   and the Events tab. Set it to `''` to hide the sign-up buttons.

`setup` only runs once. Running it again just logs the sheet link.

**After changing the script later**, use Deploy › Manage deployments › edit (pencil) › Version: **New version** › Deploy.
The web app URL stays the same, so `email.html` doesn't need changing.

### Moving from the Google Form

Sign-ups used to come through a Google Form. If the project still has it, after deploying the new version:

1. Triggers (the clock icon) › delete the **onSignup** trigger ("From form").
2. Delete the "Week ahead emails" form from Google Drive, or close it (Responses › Accepting responses: off).
3. The subscribers sheet may have a "Form Responses" tab. It's no longer used, so you can delete it. Keep the **Subscribers** tab.

## Testing

- `previewWeek`: logs this week's email as text. Sends nothing.
- `sendTestToMe`: emails this week's email to the account running the script. Doesn't touch the subscriber list.
- Sign up on `email.html` with your own address, confirm, then run `sendWeekly` to send the real thing to every confirmed subscriber.

## The subscribers sheet

One row per email address, in the **Subscribers** tab.

| Column | Meaning |
|---|---|
| Status | `pending` (hasn't confirmed), `confirmed` (gets the email) or `unsubscribed` |
| Last sent | The week the person last got the email. `sendWeekly` skips anyone already sent this week, so it's safe to run again |

To remove someone by hand, set their Status to `unsubscribed`. Don't edit the Token column: confirm and unsubscribe links depend on it.

The sheet holds people's email addresses. Keep it shared with the committee only.

## Confirm and unsubscribe

New sign-ups get a "Confirm subscription" email and only start getting the weekly email once they confirm.
This stops people signing up someone else's address. Every weekly email has an unsubscribe link.

Both links open `email.html` with a button, and nothing changes until the button is pressed. Some email services open links
automatically to check them for viruses, and that would otherwise confirm or unsubscribe people without them knowing.

Signing up again with a confirmed address does nothing, and doesn't change their name (the form says the same thing either way, so it doesn't reveal who's subscribed).
Signing up again while a confirmation is waiting sends nothing more for 24 hours (`RESEND_HOURS`); the first email's link still works.
The confirmation email never includes the name typed into the form, because anyone can type any address into it. Names are kept to letters, spaces, apostrophes, hyphens and full stops.
Signing up again after unsubscribing sends a new confirmation email.

The sign-up form has a hidden field that only bots fill in; those sign-ups are ignored. Confirmation emails are capped at 20 a day.

Emails sent before the move to `email.html` link to the Apps Script URL. It now answers with a plain-text line pointing to the same link on `email.html`.

**Don't add an HtmlService page to this project.** Any HtmlService page lets visitors call every function whose name doesn't end in `_` (`sendChangesNow`, `stopChangeAlerts`, `sendTestToMe` and so on) from their browser. Keep the web app to `doPost` and the plain-text `doGet`.

## Gmail's daily limit

A free Gmail account can email about **100 recipients a day** from a script. Confirmation emails count too.

- `sendWeekly` stops before the limit and emails `ADMIN_EMAIL` a warning saying how many people missed out.
  Run `sendWeekly` again the next day to send the rest.
- Confirmation emails are capped at 20 a day, so someone spamming the form can't use up Sunday's emails.
- Once 80 people are subscribed, the Sunday run emails a warning. Past about 90, the club needs a bigger option:
  a Google Workspace account (about 1,500 a day) or a newsletter service such as Mailchimp or Buttondown.

## Schedule change emails

[`change-alerts.gs`](change-alerts.gs) emails every confirmed subscriber when this week's schedule changes:
an upcoming event is **added**, **cancelled** (deleted from the calendar), or **changed** to a different date, time or venue.
"This week" is the Monday to Saturday the Sunday email covered.

- **When:** the calendar is checked every 5 minutes. The email goes out once there have been no further edits for 30 minutes,
  so an admin can fix a mistake first, and changes made together go out in one email. Expect it 30–35 minutes after the last edit.
  An edit that's undone within that time sends nothing.
- **Same-day changes** (a last-minute session, a session cancelled on the day) only wait **10 minutes**, so expect the email
  10–15 minutes after the last edit. The subject starts with **TODAY**, for example
  "TODAY: Members Drop-in Session, 11:00am at TSA", and the email shows any note from the description
  (such as "4 courts, sharing with Tereora College"). Get the details right before saving, since there's less time to fix them.
- **Not emailed:** changes to later weeks (the next Sunday email covers them), events that have already finished,
  title or description edits, events with `#quiet` in the description (handy for test events), and private events
  (no type tag, so not on the site either). Adding a type tag counts as adding the event; removing it counts as cancelling it.
- **Sundays:** nothing is sent until that morning's week ahead email has gone out, since it already lists the week as it stands.
- **Gmail's daily limit:** each change email goes to every subscriber, so several in one day use the limit up quickly.
  If it runs out, the rest are skipped and `ADMIN_EMAIL` gets a warning.

### Turning it on

1. In the "PCI week ahead email" project, click **+** next to Files › Script, name it `change-alerts`, and paste in
   [`change-alerts.gs`](change-alerts.gs).
2. Set `CALENDAR_ID` at the top to the shared calendar's ID (the same as in the events feed script).
3. Click **+** next to Services › **Google Calendar API** › Add.
4. Pick `setupChangeAlerts` in the toolbar and press Run. Allow access when asked. This starts the 5-minute check and
   records the week as it is now, so existing events don't count as new.

Other functions to run from the editor (open `change-alerts` first, so they show in the function menu):

| Function | What it does |
|---|---|
| `sendChangeTestToMe` | Emails the update to you only, straight away. Uses this week's real changes, or a made-up sample if there are none. Changes nothing for subscribers |
| `sendChangesNow` | Sends this week's real changes to every subscriber now, skipping the 30-minute wait |
| `previewChanges` | Logs what would be emailed right now, without sending |
| `stopChangeAlerts` | Turns change emails off |

To change the waits, edit `SETTLE_MINUTES` or `TODAY_SETTLE_MINUTES` at the top of `change-alerts`; the next check uses them.
If you change `CHECK_EVERY_MINUTES`, run `setupChangeAlerts` again.

## Changing the email

Edit the script, then Deploy › Manage deployments › edit › **New version**. The Sunday timer always uses the latest code;
the new version is only needed for the confirm and unsubscribe pages.

To change the send time, change `SEND_HOUR`, delete the old `sendWeekly` trigger (Triggers, the clock icon on the left),
then in the editor run this once: `ScriptApp.newTrigger('sendWeekly').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(SEND_HOUR).inTimezone(TZ).create()`.
