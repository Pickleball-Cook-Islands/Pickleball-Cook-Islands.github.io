# Pickleball Cook Islands

Static site for Pickleball Cook Islands, served by GitHub Pages at
https://pickleball-cook-islands.github.io/

No build step: anything merged to `main` goes live within a minute or two.

**Before launch:** the home page (`index.html`) is a "coming soon" page. The real site is at
[`/preview.html`](https://pickleballcookislands.com/preview.html), which isn't linked from anywhere public and is hidden from
search engines. Anyone given the link can still open it, and this repository is public, so treat it as unlisted, not private.
See [Going live](#going-live).

## Running it locally

To check changes before they go live, start a local web server from the repository folder:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000/preview.html in a browser (http://localhost:8000/ shows the coming soon page). Press Ctrl+C in the terminal to stop the server.

- Open `preview.html` through the server, not by double-clicking the file. League pages load their `league.json` with `fetch`, and browsers block that for files opened directly from disk.
- A league: http://localhost:8000/leagues/league.html?l=tjpl4
- Light mode is the default. Dark mode: http://localhost:8000/preview.html?theme=dark (`?theme=light` switches back). Visitors switch with the button in the header and the site remembers their choice.
- If port 8000 is already in use, pick another number, e.g. `python3 -m http.server 8080`.

## What's where

| Path | What it is | Who edits it |
|---|---|---|
| `index.html` | The "coming soon" page, until launch | At launch (see [Going live](#going-live)) |
| `preview.html` | The club site: page, styles and script (becomes `index.html` at launch) | Edit the content block at the top of the script (between `EDIT CONTENT HERE` and `END CONTENT`) for events (until the Google Calendar feed is switched on), news, fees, venues, the list of leagues and the homepage photo carousel (`HERO_PHOTOS`) |
| `email.html` | Week ahead email: the sign-up form, and the page confirm and unsubscribe links open ([apps-script/WEEKLY-EMAIL.md](apps-script/WEEKLY-EMAIL.md)) | Rarely |
| `apps-script/` | Google Apps Scripts: the events feed from the club's Google Calendar ([apps-script/README.md](apps-script/README.md)) and the Sunday week ahead email ([apps-script/WEEKLY-EMAIL.md](apps-script/WEEKLY-EMAIL.md)) | Rarely; admins use Google Calendar |
| `assets/img/` | Logo and artwork, `hof/` Hall of Fame photos | Rarely |
| `assets/img/photos/` | `hero/`: homepage carousel (`hero/spare/` holds unused ones to swap in); one folder per album (`club-days/`, `world-cup-2026/`) | When adding photos |
| `leagues/league.html` | The league page shared by every league: layout, styling and logic | Rarely, only to change how leagues work |
| `leagues/<id>/league.json` | One league's teams, players, fixtures, scores, news, subs, colours and finals details | Admins, after every round |
| `leagues/<id>/images/` | That league's logos | Rarely |

A league is opened at `leagues/league.html?l=<id>`, for example
`leagues/league.html?l=tjpl4` for Trader Jacks Pickleball League IV.

## Updating a league

Edit `leagues/<id>/league.json` (with Claude and the GitHub connector, or the pencil icon on GitHub).
Ladders are worked out from the scores, so never edit them by hand.

- **Scores:** find the game in `games` and change `"score": null` to `"score": [11, 7]`. The first number is `teamA`'s score, the second `teamB`'s.
- **News:** add a new line at the top of `news` with the next `id` number. The newest post shows a "new announcement" banner.
- **Subs:** add or remove lines in `subs`. `divs` lists the divisions the player can sub in; `"rank": 1` etc. sets an order.
- **Updated line:** change `season.updated` after each round.

Keep the commas and quote marks exactly as they are. If the page shows "Could not load league data", the JSON has a typo; check the last edit.

## Adding a new league

1. Copy `leagues/tjpl4/` to a new folder, e.g. `leagues/bizhouse27/` (lowercase letters, numbers and dashes only).
2. Edit its `league.json`:
   - `season`: `title`, `shortName`, `headerTop`, `headerSub`, `dates`, `updated`.
   - `divisions`: any number of them, each with `name`, `short`, `color`, `glow` and `teams`. A division can have its own `images`.
   - `rounds`: any number of rounds, each with `date` and `venue` (optional `divOrder` sets the order divisions are listed in that round).
   - `finals`: `date`, `venue`, `qualifiers` and the `info` cards. Leave `finals` out for a league with no finals.
   - `theme` and `images`: default colours and logos. Images are optional; without a logo the league title is shown as text.
   - `games`, `players`, `news`, `subs`, `links`.
3. Replace the files in its `images/` folder.
4. Add one line to `LEAGUES` in the content block of `preview.html`, with the folder name as `id`. To link an event card to a specific league, add `league:'<id>'` to that event.

## Security

- **Content security policy.** Each page has a `Content-Security-Policy` meta tag near the top. It only lets the page load scripts and images from this site, fonts from Google Fonts, and data from the Apps Script feed and email scripts. If you add something from another site (an embedded map or video, an image hosted elsewhere, a new script URL), add that site to the policy on that page, or the browser will block it. Check the browser console for "Content Security Policy" errors.
- **Links and images in content** must be `https://` links or files in this repository. Anything else (for example `javascript:` links) is dropped.
- **Apps Script web apps** run as the club account. Never add an HtmlService page to the week ahead email project (see [apps-script/WEEKLY-EMAIL.md](apps-script/WEEKLY-EMAIL.md)).
- `main` is the live site: anything merged there is public within minutes.

## Privacy

This repository is public. Everything in a `league.json`, including subs' phone numbers, can be read by anyone and stays in the Git history even after it's removed. Only list numbers people have agreed to share publicly.

## Going live

1. Delete the coming soon `index.html` and rename `preview.html` to `index.html`.
2. In `index.html` and `leagues/league.html`, remove the `<meta name="robots" content="noindex">` line.
3. In `leagues/league.html`, change the three `../preview.html` links back to `../`.
4. Replace the test events, news and info with the real content.

