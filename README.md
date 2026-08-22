# 900words

Learn Danish one clue at a time. 900words is a single-player, mobile-first
word game inspired by cooperative word-association games: a board of Danish
words, a secret key, and an AI companion — Casey — who gives and guesses clues
**without ever seeing your key**. Vocabulary sticks because every clue forces
you to build connections between words.

## The journey

900words is a journey through Denmark: nine stops from **Sønderborg** in the
far south, up Jutland to the tip at **Skagen**, then back across Funen and
Zealand to **København** — made with **Casey**, the suitcase with eyes who is
also the companion cluing and guessing beside you. Each city owns 100 words —
the most frequent hundred first — and an ordinary journey board is dealt from
the **current city only**: a word from an earlier city stops appearing on a
board once you travel on, and is reviewed only by travelling back to that
city, since the wrap-up round also packs the current city only (the daily
challenge is the exception — it draws globally, the same board for everyone).
Nine cities of a
hundred is the whole dataset: 900 words, and the route length and the word
count are one number, checked against each other by `scripts/validate-words.mjs`.

Every word is in one of four states, leafed through in **the suitcase** (tap
Casey on Home): **undiscovered** until you meet it, **discovered** once you
have, **collected** after it has earned a green each way — once under your
clue, once by your own guess — and **wrapped** once a wrap-up round has packed
it safely.

Collected words still break on the road; **wrap-up rounds** are how you pack
them. A wrap-up board is 4×5, dealt entirely from the city's collected words,
and every card starts English-side up: type the Danish to pack a card before
the clues begin — the dictionary is closed, the first miss on a word is
remembered — or start early and leave cards unpacked at your own risk, playing
English-side up all round and ineligible to wrap. Every packed word that ends
the round green is wrapped for good, win or lose. The board's clue economy is
deliberately the forgiving one — 16 distinct greens over 10 shared tokens, the
beginner ratio, and measured against the others it is the softest board in the
game — because the packing gate is the difficulty and putting a second one in
the clue budget would only tax the same ritual twice. Wrap all hundred words of
a city — `WRAP_TO_TRAVEL` in `src/journey/progress.ts` — and the road onward
opens.

How far that is, is a **train**: ten wagons, one per ten of the city's hundred,
ghosts for the road still to come and solid for what is packed, with the wagon
being loaded fading in. Collected words ride as a fainter load under the
wrapped ones, so the two counts that matter are one picture. It sits where the
progress bar used to on Home, and again on the map screen, which has the room
to say what it means: *You need 80 more wrapped-up words to take the train to
Kolding.*

**And the train is how you travel.** Once every wagon is full it stops being a
readout and becomes the control: it pulses softly, it is a real button named
*Board the train to Ribe*, and tapping it goes straight into the ride out of
the city — the story of its hundred words — and then the arrival at the next
one. That is one tap, on the thing you spent a hundred words filling. It used
to be two, on neither: Home grew a green *Travel on →* button whose only job
was to open the map, where a second button of the same name did the travelling.
The map keeps that button, and its train now boards as well. Under
`prefers-reduced-motion` the pulse does not run.

## How a round works

1. The board is **3×6** — eighteen Danish words, three across and six down.
   There is one board and nothing to choose: the three sizes and the Settings
   picker that offered them are gone. From the 900 most common, each noun with its gender in front of it —
   **et hus**, the way the pair is learned — and where a noun has no ordinary
   indefinite singular, the card says the gender instead: **(com)** or
   **(neut)**. Gender decides the definite ending and every agreeing adjective,
   so it is shown whether or not the word can be counted.

   Countability is a rule applied to all 366 nouns, not a list of exceptions
   (`src/lang/da/grammar.ts`): a noun is uncountable when "en X" / "et X"
   would be wrong or clearly odd in everyday Danish — mass and abstract nouns,
   plus the plural-only ones. Where **both** readings are ordinary the article
   stays, because *en øl*, *et brød*, *en ost*, *et hår* and *et papir* are all
   things Danes say and they teach the gender in the form a learner meets. The
   validator refuses any drift between the module and the data. Words outside
   the shipped nine hundred get the same treatment from Casey, who is asked for
   gender and countability along with the translation — *trafik* comes back
   `(com)`, not `en trafik`.

   Your own key is the card's border: a solid green frame around each of your
   targets and nothing at all around the rest, so the only thing your key tells
   you is what to clue toward. There was a second, dashed black border for a
   long time — a forbidden word, fatal if it was ever named — and no board has
   one now. Nothing under the board explains that any more: there was a legend
   reading *▭ your target · ⓘ look up*, and it was deleted for saying in 17.3px
   of every phase of every round what the border already says and what a ⓘ
   explains the moment it is tapped. The card's accessible name still says
   "your target" in words.
2. You open: you give a one-word clue, Casey guesses — then Casey clues and you
   guess. A clue's number is the whole allowance: guess that many right and the
   turn ends itself. (There is no Codenames-style bonus guess. It existed to
   pick up a word left over from an earlier clue, and in practice only read as
   the turn refusing to end once you had found everything the clue promised.)
   Stopping short is still yours to choose. Guesses are judged against the
   clue-giver's key. Casey is told how
   many of her greens are left against how many clues remain, so she aims for
   two or three words a clue rather than picking off one at a time — and on her
   last clue, for everything she has left, since a green she never points at is
   one you cannot find in last chance.
3. Find every green word before the shared clue tokens run out and you both
   win. The board gives eight, shared between you — four clue-givings each.
   Running out is not the end: the clues stop but the board does not, and
   **last chance** lets you keep naming words with nothing left to go on. Name
   a green and you are still alive; name anything else and the round is over.
   Walking away there is allowed, and is a loss — the difference between
   deciding you are beaten and being told.

   **A guess is judged against the clue-giver's key and nothing else.** Every
   other rule hangs off that one, and it is the easiest thing here to read
   backwards. Under *your* clue, Casey's guesses are read off *your* key: a card
   you marked green scores, and one you did not costs the turn even if it is
   green on her. Under *her* clue it is her key that is read. So a card can be
   spent one way round and still be worth finding the other — a bystander reveal
   is directional, burning the card for the side that named it and leaving it
   live for the side that did not. Last chance is the one exception, because
   there is no clue-giver: a green on **either** key counts, and anything else
   ends it. `game.test.ts` pins the whole rule; two mutations of the engine were
   checked to fail it.

   Nothing on a board is fatal any more. Duet's assassin — which this game
   called a forbidden word — is gone, and so is the translate-every-unsolved-word
   ending that existed to soften it. Every key now holds greens and nothing
   else. That removed the only ending that could arrive early, which makes the
   tokens the whole clock, so we re-measured what they are worth rather than
   assuming they survived the change.

   `src/ai/selfplay.test.ts` plays both sides against themselves on one dial:
   the chance **p** that a guess finds a word the clue-giver actually meant. At
   0 it is board arithmetic and nothing else; at 1 every clue is read perfectly.
   Over 2000 seeded games a cell, both sides cluing for what is left up to three
   at a time:

   | board | p=0 | 0.6 | 0.7 | 0.8 | perfect | clues a perfect pair spends |
   |---|---|---|---|---|---|---|
   | **3×6, 8 clues** | 0.3% | 74.7% | 90.0% | 98.2% | 100% | 5.00 |
   | wrap-up 4×5, 10 clues | 1.2% | 84.8% | 95.2% | 99.2% | 100% | 6.00 |

   One row where there were four, because there is one board. (The scripted
   tutorial round is dealt on a 3×4 of its own — 76.1% at p=0.6 — and is a
   thing you enter once, not a difficulty you keep.)

   Those are a floor and a ceiling with a made-up dial between them, not a
   forecast: a biased coin is not Danish word association, and a real round sits
   somewhere inside. What the brackets are good for is the shape, and the shape
   says three things. A guesser that knows nothing spends every token —
   last chance on 100% of seeds, the tokens going with 8.5 of the board's 13
   greens still hidden — and wins 0.3% of the time, so the floor did not rise
   when the hazards went, it moved *later*: every loss now happens in last
   chance, from a board barely touched. A perfect pair wins every seed with
   three clues to spare, which is what a fair budget looks like. And in between
   the board still has a real losing side, and still comes down to the wire
   often enough to be worth playing — at p=0.7 the clues run out on 24.6% of
   rounds, and most of those are still won from there. Last chance is a second
   act, not a formality.

   **The 3×6 replaced a 3×5, and the bigger board is the kinder one.** The
   default was fifteen words, seven greens a side and six tokens: 1.83 distinct
   greens per clue, the tightest budget the game has ever had, 67.1% at p=0.6
   and the clock running out on 38.8% of rounds at p=0.7. Eighteen words with
   eight greens a side, three shared and eight tokens is 1.63 per clue — 74.7%
   and 24.6%. Losing to the clock roughly halves, and there are thirteen
   distinct greens a round rather than eleven, which is about 18% more green
   events feeding the collection.

   The neighbours were measured too, and two of them are counter-intuitive
   enough to record. **More green on the board plays harder**: 8/2/8 is fourteen
   distinct greens and only four dead cards, and it wins 69.8% at p=0.6 against
   8/3/8's 74.7%, because a card on nobody's key is a card nobody ever has to
   point at — padding makes a board easier, not slower. And the token count is
   the sharpest dial in the game: seven tokens is 59.7%, nine is 84.9%. Eight is
   where the round still has a losing side without the clock being the thing you
   play against. `src/engine/config.ts` carries the full table.

   None of this could have been done a week earlier. A sixth row needs 46px of
   board that did not exist until the composer work (K1) and the dock work (K2)
   handed 79.26px back: before them a sixth row measured 33.22px, under the 44px
   floor a card cannot go below, and the board would have overflowed the phone
   *invisibly* — a flex column paints over what is under it rather than
   lengthening the document. Measured after: six rows of 46.42px at 360×640, and
   layout-drive asserts that floor directly.
4. **Reroll before you start.** If nothing on the board connects, **↻**
   in the header deals a different board. Only before the
   first clue — once one is on the table the round has a history, and re-dealing
   under it would be a way to unsee a bad guess — and never on the daily
   challenge, which is one shared board per date.

   Two rules meet here and they pull opposite ways. Every board carries exactly
   three words out of the last one (`CARRY_OVER` in `src/srs/sampler.ts`), and a
   rejected board is precisely the one whose words must *not* come back. So the
   reroll replaces the head of the two-board window rather than pushing onto it,
   and passes the rejected board to the sampler's `avoid` set. Before that
   second half existed a reroll came back measuring **7 of the same 12
   words** (on the 3×4 that was then the small board); it is 0 now, carry-over included, because the rejected board took
   only three words off the played one and the quota can be drawn from the other
   nine.
5. **Clue in Danish.** Tap ⓘ on any board word for the built-in dictionary
   (translation, gender, example sentence), or type into **Look up a word** in
   the clue dock to go the other way — English in, Danish out — which is the
   direction composing a clue actually needs. It is a field, not a drawer: it
   was a `<details>` and the lid cost a tap every turn, because the dock
   unmounts with the phase and a `<details>` keeps its open state on the element
   rather than in React. Casey clues in Danish too, and one tap loads her clue
   into the same box. **Both sides speak Danish**: type an
   English word into the clue box and it says so, with the lookup one tap away,
   because Casey is handed the clue as a bare string beside a Danish board and
   an English word there is one she cannot place.

   The nine hundred settle most of it offline and recognise far more Danish than
   they contain — æ/ø/å can only be Danish, an inflection of a headword is that
   headword (*hunden*, *bilerne*), and a compound of two of them is Danish
   (*dyreliv*, *morgenmad*). Anything else is **unknown**, which is permission
   rather than suspicion: that is where every Danish word we do not ship lives,
   *trafik* included. Only a word that looks positively English is questioned,
   and even then the offline guess is never the last word — the button becomes
   *Give clue anyway* and Casey judges it, so a Danish word we happen not to
   ship is never refused by a list.
   Toggle **Aa** to overlay every translation — off to start with, so the board
   opens as a grid of Danish words rather than twice as many lines of text, and there
   is no opening study phase either (Settings can turn one back on; a save from
   before that default changed is migrated, since a persisted setting kept the
   old behaviour alive long after the default moved). Every lookup tells the practice
   scheduler which words to bring back sooner — including one done in the
   lookup box, which costs exactly what tapping ⓘ costs, and neither is
   available during the translation challenge or a wrap-up packing phase. A clue may be
   any Danish word, so the lookup answers any word: the shipped nine hundred come
   back instantly and offline, and anything else is asked of Casey without
   being asked twice. The answer is ONE line — the best hit, its first gloss
   and a 🔊, with the rest of the entry a tap away in the same sheet ⓘ opens —
   because the composer is a fixed height and that line is all the room there
   is. A hit that is already on the board says so, since it is the right
   translation and an illegal clue.

   The composer is a fixed height because **every dock is the same one**. The
   complaint it answers: *"when guessing it's a giant text block that adjusts
   the sizing of the grid. The grid should stay locked. and the text can be
   cut."* The board is a flexible band sharing the screen with whatever dock
   the phase is in, so every line a dock gained came straight off the grid and
   resized every card with it. The clue composer, the guess bar, Casey's panel,
   the last-chance bar, the study dock and the wrap-up packing dock are now one
   measured height — 150px, the composer's own 149.41 rounded up — each with
   three regions and one line where anything variable goes, so the leftover
   handed to the board is identical in every phase and the grid is locked by
   construction rather than by arithmetic. Measured at 360×640: the board is
   318.56px with a 57.31px card row in all of them, where before the docks
   agreed it was 239.3px with cards riding their 44px minimum inside a 41.46px
   row. `layout-drive` samples the dock's rectangle on every animation frame of
   a whole round, of a wrap-up round from packing through the clues, and of the
   tutorial — the board's rectangle beside it, so a failure says which of the
   two broke.
6. After each round the summary shows **what was said, and why** —
   every clue and every guess with the reasoning behind it, including what Casey
   deliberately steered away from and how sure she was of each guess. Tap ⚑ on
   anything of hers that was a bad call: flags are kept (newest 24) and quoted
   back to her in later rounds, with her own sentence attached, so the
   correction has something to bite on. They carry a clue word, a board word and
   her own reasoning — no key data — so they pass the AI firewall by
   construction, which `src/ai/flags.test.ts` asserts directly.
7. The summary also puts the round's green words back into Danish: each with
   its example sentence, and then — when Casey is connected — woven into a
   tiny **story written to a coverage target**. The story exists for the words
   no board can hold. Nothing in the nine hundred is a conjunction, a pronoun,
   a particle, a numeral or a greeting, because none can be clued — that
   sentence stood here for months while 69 card words were exactly those
   things, and it is true now because `docs/word-selection.md` took them out
   and `scripts/validate-words.mjs` fails on any headword that is also on the
   ledger. The shipped example sentences reach 139 of the 252-word inventory
   and 113 of it not at all (`scripts/measure-function-words.mjs` reproduces
   the numbers). So each story is *asked* for the least-met of them
   by name, the reply is verified to actually contain them before anything is
   recorded (`storyProblem` in `src/ai/companion.ts` — a story is rejected and
   retried rather than trusted), and a ledger (`coverageStore`) walks the
   targets through the whole 252-word inventory round by round. The line under
   the story names what was smuggled in. It costs the one model call per round
   that the retired debrief used to spend; offline or in practice mode the
   sentences stand alone, exactly as before.

Progress is tracked per word with a spaced-repetition scheduler; new words are
introduced along the frequency ranking while struggling words return more
often. Every board carries exactly three words over from the one before —
weighted toward the three that went worst, and no word may carry twice running
— so a board is mostly new without ever dropping what you just struggled with.

The same signal steers the deal itself. Every slot on a board asks the player
for one of three things (`SlotTier` in `src/engine/keygen.ts`), and the words
are handed out in that order: **recall** is green on Casey's key, so you have to
retrieve the word from her clue, and the words you keep forgetting go here
first; **produce** is green only on yours, which needs enough command of a word
to find an association for it; **filler** is on neither key and asks nothing, so
the words you know best drift into it. There used to be a fourth — **hazard**,
filled last, which turned your best-known words into the traps you had to
knowingly steer around. Forbidden words are gone and that channel went with
them, so a word you know cold now costs a card rather than earning one. Recall
was always the half that taught, and it is untouched.

### Keeping your collection

It lives in this phone's localStorage and nowhere else, so **Settings → Your
collection** writes it to a single JSON file. Restoring offers a merge that
keeps the better record for every word — it can never turn a green word grey —
or a wholesale replace. The file is your learning record and nothing else —
there has been no API key anywhere in the app to worry about since settings
v7 retired them.

## Hearing it

Every word is baked to an mp3 twice, in the same neural voice
(`da-DK-Chirp3-HD-Aoede`, chosen by ear from a 35-voice audition): once at the
ordinary reading speed, which is what every tap plays, and once at **0.6**,
which is what the 🐢 in the dictionary sheet plays. Two files rather than one
file slowed down at playback — a stretched clip is a processed clip, and both
of these are real synthesis at the rate they claim. A phone with no clips in
the build falls back to its own voice at the same two rates, so the buttons
mean the same thing either way.

The clips ship in the repository and are runtime-cached, never precached: 900
words twice over is too much to make an install download before the app will
open offline. `HearBoard`'s tour paces the board at **1500ms** a word, which is
measured rather than chosen — 240 clips read with `audio.duration` in the
browser that plays them give a median of 1.01s and a p95 of 1.54.

The train ride out of a city says each of its sentences **four times**: the
Danish, its English translation, the Danish slowly, then the Danish again. The
order is `src/journey/rideCycle.ts` and the last pass is the first clip
replayed — ending on the ordinary reading, after the slow one has taken it
apart, is the point of ending there. Sønderborg's ride is **8m13s** of audio
where one reading was 2m53s — 2.85×, measured, and less than the four passes
imply, because three of them are the 1.0 clips and the reading they replaced
was a 0.6 one. It has always been skippable, and any single line can be tapped
for just that sentence.

The bake is `scripts/make-audio.mjs`, run by `.github/workflows/bake-audio.yml`
because the TTS key is an Actions secret. Each source carries its own rate and
its own directory, so nothing else has to remember what "slow" means:

| `--source` | rate | writes to |
|---|---|---|
| `words` | 1.0 | `public/audio/<lang>/` |
| `words-slow` | 0.6 | `public/audio/<lang>/slow/` |
| `stories` | 1.0 | `public/audio/<lang>/story/` |
| `stories-slow` | 0.6 | `public/audio/<lang>/story/slow/` |
| `stories-en` | 1.0, in `en-US` | `public/audio/<lang>/story/en/` |

A manifest per directory records the provider, voice, rate and a per-clip stamp,
so a run only pays for what actually changed — and a rate change alone re-bakes
everything, which is the trap that was fixed by putting the rate in the stamp.

## Setup

There isn't one. Open the deployed page on your phone, "Add to Home Screen",
press play. No account, no API key, no model to choose. A first open starts
inside the train — Casey introduces herself in three lines and punches your
ticket (the language pick, one confirm card while Danish is the only pack) —
and then plays you through one real round: a 3×4 board of its own, dealt on
the real engine from Sønderborg's first twelve words with a fixed seed, Casey
scripted beside it. She clues first in Danish and points at the dictionary
rather than glossing; one miss is staged on purpose so the game's central rule
— a guess is judged against the **clue-giver's** key — gets said at the moment
it visibly happens, and the burned card is then won back under your own clue.
The round is offline by construction, its words count toward the collection
for real, and it records no game — the first won *real* round stays the moment
that earns anything. The win opens Casey herself: a four-step spotlight walks
the real suitcase screen top to bottom — the loose strip holding the twelve
words just met, the empty lid (collected needs a green each way, and one round
gives each word one), the tray, and the sleeping wrap-up button with both of
its conditions named. Then the arrival at Sønderborg, exactly as travelling
lands one, and the app is Home — with zero coach marks waiting there. Skip is
always on screen; Settings → **Replay the intro** brings the whole thing back
any time.

After the intro the teaching goes quiet rather than away. **?** opens a
trimmed reference card — the two demo tiles, four short rules with the
clue-giver's-key rule stated once and forwards, and its own Replay-the-intro
button; it never opens itself. The first real clue turn and the first real
guessing turn each say one extra sentence in the dock's existing hint slot,
once ever. And Casey's Home bubble spends its first days on the critical tips
in priority order — whose greens count, how a word is collected, what wrap-ups
keep, how one is earned — before joining the daily rotation.

That is worth saying plainly because it used to be false. For most of this
project's life the first screen after install asked you to go and fetch a
Gemini key, paste it in, and pick a model name off a list — three chores
between a person and a vocabulary game, and the last one had a wrong answer
that looked like a broken app. Casey's key now lives on a Cloudflare Worker
([`proxy/`](proxy/README.md)) as a server-side secret, the app sends no key at
all, and there is no longer a field to type one into. Settings v7 cleared the
keys already stored on devices, because a stale one would have been sent ahead
of the proxy's own and rejected mid-round.

The app does not name a model either. It asks for `cluey`, which is an alias
the worker resolves — so which model answers is a proxy setting rather than an
app release every installed PWA has to notice, and a model id retired upstream
is fixed in one place instead of breaking every install at once.

Nothing about this needs the network to be good, or to exist. Casey is the only
part of the game that talks to a server: if she cannot be reached, the error
banner offers **Play on without Casey** and the round finishes with a practice
companion that runs entirely on the phone. The same offer appears if the
proxy's [daily cap](proxy/README.md#the-daily-caps) is spent.

### Running it against something else

The **Base URL** field in Settings is still free text, and it is the escape
hatch — for a local Ollama, for your own copy of the worker, or for any other
OpenAI-compatible endpoint. Point it somewhere and tap **List models this
server accepts**, which asks the server for real names rather than leaving you
to guess between `gpt-oss:120b` and `gpt-oss:120b-cloud`; a wrong guess returns
a 404 that reads exactly like a broken endpoint. Tapping the **Casey** chip
puts it back.

There is no key field, so a service that wants one needs the key at build time:
paste it into `src/ai/bundled-key.ts`, which is empty by default. Worth knowing
before you do — this is a static site, so anything in the bundle is readable by
anyone who opens the page. A key sent by the app takes priority over the
worker's own secret, and requests carrying one are not counted against the
proxy's daily cap — they are spending your budget rather than the worker's.

To deploy the worker yourself, [`proxy/README.md`](proxy/README.md) has the
whole thing — including the phone-only route, where three repository secrets
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `OLLAMA_API_KEY`) and the
**Deploy the AI proxy** workflow in the Actions tab do it with no terminal
involved. One worker fronts either Ollama Cloud or Gemini; the origin lock and
the daily caps are documented there too.

## Development

```bash
npm install
npm run dev            # local dev server
npm test               # engine, SRS, AI-layer and firewall tests
npm run build          # typecheck + production build
npm run typecheck      # the typecheck alone — and note it is `tsc -b`, not
                       # `tsc --noEmit`, which silently checks NOTHING here:
                       # the root tsconfig is files:[] with project references
npm run validate:words # dataset sanity checks
node scripts/make-audio.mjs --source words --dry-run   # what a bake would cost
node scripts/make-map.mjs # regenerate the Denmark outline
node scripts/make-icons.mjs                   # regenerate the PWA icons
```

Playwright drives run against the built app and each start their own preview
server, so `npm run build` first — or use `npm run drives`, which builds for you
and runs all seventeen. (`node scripts/run-drives.mjs --list` names them; six
more are opt-in and not in the default set, since they want a real key, a real
Worker, or measure and print rather than assert — and a PASS from something
that asserts nothing is worth less than no line.)

```bash
node e2e/smoke-drive.mjs      # a round played end to end
node e2e/onboarding-drive.mjs # the intro end to end: train, ticket, the
                              # scripted round, the case tour, the arrival
                              # — and the gate that keeps all of it away
                              # from a phone that has already played
node e2e/wrapup-drive.mjs     # the packing gate: type the Danish, then play
node e2e/journey-drive.mjs    # a packed suitcase opens the road → travel → arrival
node e2e/suitcase-drive.mjs   # the suitcase: four word states, paging, the wrap-up button
node e2e/key-visible-drive.mjs # your own key is drawn on the board
node e2e/backup-drive.mjs     # export, wipe, restore, merge without loss
node e2e/update-drive.mjs     # a new service worker is noticed and applied
node e2e/nav-drive.mjs        # system Back peels one layer at a time
node e2e/layout-drive.mjs     # fold, map labels, journey's end — and the
                              # no-scroll rule: every screen fits the phone
node e2e/offline-drive.mjs    # the dictionary works with the network off
node e2e/ai-drive.mjs         # the real AI client against a fake Ollama:
                              # messy JSON, retries, the HTTP error taxonomy,
                              # and the key firewall asserted on the wire
node e2e/translate-drive.mjs  # look up a word mid-round, both directions,
                              # and the two rules that stop it reading the board
node e2e/article-drive.mjs    # en/et on every card, across all nine cities, on
                              # a 360px phone — and costing the word no line
node e2e/endgame-drive.mjs    # Casey opens; the 3x6 board; and last chance
                              # won, lost and walked away from
node e2e/repeat-drive.mjs     # every board shares exactly three words with the
                              # one before it — across a reload and a v1 save
node e2e/proxy-drive.mjs      # the bundled CORS proxy, on the real Cloudflare
                              # runtime, fixing a CORS failure that is really
                              # there — including the key living on the worker
node e2e/map-preview.mjs      # (opt-in) render the map to a PNG for inspection
node e2e/home-space-probe.mjs # (opt-in) where Home's vertical budget goes, and
                              # how much of the map's card is empty — the sheet
                              # `.home-map`'s height is chosen against
```

`proxy-drive` runs [`proxy/worker.js`](proxy/worker.js) unmodified on workerd
(via miniflare), with the app talking to it from a browser and an upstream that
deliberately sends no CORS headers — so it checks that the proxy solves a
problem that is actually present, that the key and the HTTP status both survive
the extra hop, and that the README's optional origin lock both lets you in and
shuts everyone else out. Without miniflare installed it prints
`PROXY DRIVE SKIPPED` and exits 0.

Two things no drive here can settle, because they need a key and a network.
First, whether a browser is allowed to talk to ollama.com at all — ten seconds,
plain node, no build and no browser:

```bash
OLLAMA_API_KEY=... node e2e/ollama-probe.mjs
```

It reads the CORS preflight rather than guessing from "the request worked"
(node enforces no CORS, so a successful call there proves nothing about a
phone), and says either "no proxy needed" or "this is what `proxy/` is for".
`OLLAMA_BASE_URL`, `OLLAMA_MODEL` and `ORIGIN` override the defaults; re-run it
against your worker to confirm the proxy fixed it.

Second, whether the clues are any good:

```bash
OLLAMA_API_KEY=... node e2e/live-drive.mjs
```

It plays one round and prints the clue Casey actually gave, so the prompts can
be judged against real output. Without a key it prints `LIVE DRIVE SKIPPED` and
exits 0. Set `OLLAMA_BASE_URL` to your Cloudflare Worker (see
[`proxy/README.md`](proxy/README.md)) if ollama.com refuses browser requests,
and `OLLAMA_MODEL` to try another model. The key is read from the environment,
never placed in a URL and never printed.

Useful dev URLs: `?mock=1` forces the offline companion, `?seed=N` fixes the
board, `?first=player` / `?first=ai` pins who opens the round (the engine's
default is the player; only the tutorial deals Casey in first),
`?howto=0` suppresses first-run chrome (the onboarding train, and historically
the rules overlay — the overlay no longer opens itself), `?onboard=1` forces a
transient run of the onboarding flow, and `?city=N&collected=K&almost=K&wrapped=W` jumps the journey
to a given stop with K words collected (or one interaction short of it) and W
already wrapped into the suitcase.

All of those need a keyboard, and the device the game is actually played on has
none. So the one that matters most for playtesting is also a switch you can
tap: **five taps on the build stamp** in Settings reveals the keyboard readout
and, beside it, **Travel to the next city** — a stop up the route, position
only, suitcase untouched, no ride and no arrival. It is gated on
`devSwitchesAllowed()` as well as the gesture, so it exists on the dev server,
on a local preview, and in the native shell (which serves from `localhost`, and
is where the playtesting happens) — and never on the deployed site.
`journey-drive` checks both halves, loading the same preview server through a
non-local hostname to prove the absent one.

### Architecture notes

- `src/engine/` — pure TypeScript game rules: dual-key generation
  (Duet-scaled, configurable in `config.ts`), turn state machine, clue
  legality, and `packing.ts`, which grades the wrap-up round's typed
  English→Danish answers. No React, no network. Every board number in
  `config.ts` carries the measurement it came from; `src/ai/selfplay.test.ts`
  is where they are measured and re-measurable.
- `src/ai/` — the companion. `projections.ts` is the **firewall**: prompt
  builders can only consume views that structurally exclude the player's key
  (clue-giving sees the AI's own key; guessing sees no key at all). Tests
  assert prompts are byte-identical under player-key permutations.
- `src/srs/` — Leitner scheduler + board sampler (frequency-ordered
  introduction bounded by the journey, overdue/struggling words oversampled).
- `src/journey/` — pure progression logic: word bands, the four word states,
  the wrap-up board draw and travel rules. Every route forward is monotonic —
  counters only rise, the wrapped ledger only grows — so the collection cannot
  regress. `cities.ts` and `map.ts` are facades over the active language's
  route; the Denmark data lives in `src/lang/da/`.
- `src/lang/` — **the language seam.** One pack per language, holding
  everything the game knows about it: orthography, morphology, grammar, the
  route and map, the language-specific half of the prompts, and the few UI
  strings that are not English. The engine and the graders take a pack as a
  parameter and never import one; everything above them reads the single
  active pack, resolved once from localStorage at load. Danish is the only
  pack that ships. `src/lang/types.ts` is the interface and, at the top of it,
  the checklist for adding German. `src/lang/da/map.ts` is generated by
  `scripts/make-map.mjs` from the official DAGI region polygons, simplified
  into an inline SVG path so the map needs no runtime fetch.
- `src/backup/` — pure export, validation and merge of a saved collection,
  separate from the stores it reads and writes.

## Credits

The map of Denmark is derived from Danish public-sector geodata: **DAGI**
(Danmarks Administrative Geografiske Inddeling), Geodatastyrelsen and Danske
Kommuner, FOT dataset at 1:500 000. The outline is reprojected and simplified
by `scripts/make-map.mjs`; the source data is unmodified upstream.
- Deployment: GitHub Actions → GitHub Pages on push to `main`.
