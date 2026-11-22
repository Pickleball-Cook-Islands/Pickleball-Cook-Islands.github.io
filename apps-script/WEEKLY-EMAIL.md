# Week ahead email

Visitors sign up on a Google Form and confirm by email. Every Sunday at about 7am Rarotonga time, they get an email
listing the coming week's sessions and events (Monday to Saturday), plus league days and events coming up in the next 4 weeks.
The events come from the same calendar feed as the website ([events-feed.gs](events-feed.gs)), so the email always
matches the site. The email is sent from the Gmail account that owns the script.

[`weekly-email.gs`](weekly-email.gs) does everything: the form, the subscriber list, the confirm and unsubscribe pages,
and the Sunday send.

## One-time setup

Do this in the account that should send the emails (the club Gmail for the live site), after the events feed is set up.

1. Go to <https://script.google.com> › New project. Name it "PCI week ahead email".
   Replace the contents of `Code.gs` with [`weekly-email.gs`](weekly-email.gs).
2. At the top, set `FEED_URL` to the events feed's `/exec` URL (the same as `CAL_FEED_URL` in `index.html`).
   Set `ADMIN_EMAIL` if warnings should go somewhere other than this account.
3. Pick `setup` in the toolbar and press Run. Allow access when asked (forms, sheets, email and running on a schedule).
   The Execution log shows two links: **the form** (for the website) and **the subscribers sheet**. Both are also in your Google Drive.
4. Deploy › New deployment › **Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy and copy the `/exec` URL.
   This is the page that confirm and unsubscribe links open.
5. Paste that URL into `WEB_APP_URL` at the top of the script and save. Then Deploy › Manage deployments ›
   edit (pencil) › Version: **New version** › Deploy, so the URL stays the same.
6. In `index.html`, set `SUBSCRIBE_URL` to the form link from step 3. The site then shows
   "Get the week ahead by email" on the homepage and the Events tab.

`setup` only runs once. Running it again just logs the form link.

## Testing

- `previewWeek`: logs this week's email as text. Sends nothing.
- `sendTestToMe`: emails this week's email to the account running the script. Doesn't touch the subscriber list.
- Sign up on the form with your own address, confirm, then run `sendWeekly` to send the real thing to every confirmed subscriber.

## The subscribers sheet

One row per email address, in the **Subscribers** tab. The other tab holds the raw form responses.

| Column | Meaning |
|---|---|
| Status | `pending` (hasn't confirmed), `confirmed` (gets the email) or `unsubscribed` |
| Last sent | The week the person last got the email. `sendWeekly` skips anyone already sent this week, so it's safe to run again |

To remove someone by hand, set their Status to `unsubscribed`. Don't edit the Token column: confirm and unsubscribe links depend on it.

The sheet holds people's email addresses. Keep it shared with the committee only.

## Confirm and unsubscribe

New sign-ups get a "Confirm subscription" email and only start getting the weekly email once they confirm.
This stops people signing up someone else's address. Every weekly email has an unsubscribe link.

Both links open a page with a button, and nothing changes until the button is pressed. Some email services open links
automatically to check them for viruses, and that would otherwise confirm or unsubscribe people without them knowing.

Signing up again with a confirmed address does nothing. Signing up again after unsubscribing sends a new confirmation email.

## Gmail's daily limit

A free Gmail account can email about **100 recipients a day** from a script. Confirmation emails count too.

- `sendWeekly` stops before the limit and emails `ADMIN_EMAIL` a warning saying how many people missed out.
  Run `sendWeekly` again the next day to send the rest.
- Confirmation emails are capped at 20 a day, so someone spamming the form can't use up Sunday's emails.
- Once 80 people are subscribed, the Sunday run emails a warning. Past about 90, the club needs a bigger option:
  a Google Workspace account (about 1,500 a day) or a newsletter service such as Mailchimp or Buttondown.

## Changing the email

Edit the script, then Deploy › Manage deployments › edit › **New version**. The Sunday timer always uses the latest code;
the new version is only needed for the confirm and unsubscribe pages.

To change the send time, change `SEND_HOUR`, delete the old `sendWeekly` trigger (Triggers, the clock icon on the left),
then in the editor run this once: `ScriptApp.newTrigger('sendWeekly').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(SEND_HOUR).inTimezone(TZ).create()`.
