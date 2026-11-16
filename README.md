# Pickleball Cook Islands

Static site for Pickleball Cook Islands, served by GitHub Pages at
https://pickleball-cook-islands.github.io/

No build step: anything merged to `main` goes live within a minute or two.

## Running it locally

To check changes before they go live, start a local web server from the repository folder:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000/ in a browser. Press Ctrl+C in the terminal to stop the server.

- Open `index.html` through the server, not by double-clicking the file. League pages load their `league.json` with `fetch`, and browsers block that for files opened directly from disk.
- A league: http://localhost:8000/leagues/league.html?l=tjpl4
- The new look: http://localhost:8000/?theme=day (`?theme=classic` switches back).
- If port 8000 is already in use, pick another number, e.g. `python3 -m http.server 8080`.

## What's where

| Path | What it is | Who edits it |
|---|---|---|
| `index.html` | The club site: page, styles and script | Edit the content block at the top of the script (between `EDIT CONTENT HERE` and `END CONTENT`) for events, news, fees, venues and the list of leagues |
| `assets/img/` | Logo and artwork, `photos/` albums, `hof/` Hall of Fame photos | Rarely |
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
4. Add one line to `LEAGUES` in the content block of `index.html`, with the folder name as `id`. To link an event card to a specific league, add `league:'<id>'` to that event.

## Privacy

This repository is public. Everything in a `league.json`, including subs' phone numbers, can be read by anyone and stays in the Git history even after it's removed. Only list numbers people have agreed to share publicly.
