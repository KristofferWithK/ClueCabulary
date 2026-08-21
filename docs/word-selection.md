# Word selection: which 900 words, and which city each one belongs to

Keywords: word selection, word distribution, curriculum, clueable, scenery,
function words, city composition, dataset.

Written 2026-08-21. Status: **decided, not yet applied.** The dataset in the
tree still has the shape described under "What ships today"; the section
"The change to make" is the job, sized for one session plus an audio bake.
The reasoning and the research are at the end for whoever picks it up.

## The decision in one paragraph

The 900 card words are the most frequent Danish words **that a one-word clue
can point at**: nouns, verbs and adjectives with associations. Everything a
clue cannot reach — *ikke, også, så, nu, der, hvis, fordi, ja, nej, tak*, the
greetings, the numerals, the modals — is a **sentence word**: never on a card,
never collected or wrapped, taught by appearing repeatedly in the example
sentences on the round summary and in the train-ride stories, which are
written to the `functionWords` ledger. Cities are frequency order over the
card words, deliberately **un-themed** (a board works by cross-domain
association, and the research says themed sets interfere with learning),
with city 1 staying hand-curated for the opening board. Collect, wrap and
travel do not change.

## What ships today, measured

Two ranks on every word (`src/data/types.ts`): `freqRank`, corpus rank, never
touched; `curriculumRank`, teaching order, decides the city. City 1 was
curated by `scripts/apply-city-one.mjs` because frequency put *ikke, også, nu*
on the first board; cities 2–9 are plain frequency with city 1 removed.

| City | Nouns | Verbs | Adj | Adverbs etc. | On the closed-class ledger |
|---|---|---|---|---|---|
| 1 Sønderborg | 84 | 8 | 8 | 0 | 0 |
| 2 Ribe | 23 | 26 | 17 | 34 | **31** |
| 3 Kolding | 18 | 24 | 19 | 39 | **24** |
| 4 Aarhus | 24 | 20 | 21 | 35 | **11** |
| 5 Aalborg | 36 | 30 | 23 | 11 | 2 |
| 6 Skagen | 33 | 32 | 35 | 0 | 0 |
| 7 Odense | 33 | 36 | 31 | 0 | 0 |
| 8 Roskilde | 46 | 27 | 27 | 0 | 1 |
| 9 København | 69 | 29 | 2 | 0 | 0 |

`src/lang/types.ts` says of `functionWords`: *"Nothing in the nine hundred is
one of these, because none of them can be clued."* That is false of 69 card
words, 66 of them in cities 2–4. The curation pushed the unclueable words one
stop down the line, where Ribe asks the player to collect (a green each way)
and wrap (type the Danish) *også* before Kolding opens. And the most concrete
hundred — *gaffel, gryde, ovn, køleskab, vaskemaskine* — lands at stop 9.
After Sønderborg the difficulty curve runs backwards.

A second, repo-specific reason *ja/nej/tak* and the greetings cannot be card
words: an example may not contain its own headword (`validate-words` warns),
so as card words they are taught nowhere — no clue reaches them and their
own sentence may not show them. As sentence words, *tak* can sit in a
hundred sentences.

## The change to make

### Remove: 113 headwords, by city

Everything on the `functionWords` ledger, plus the greetings and replies
(*tak, hej, farvel, goddag, godmorgen, godnat, hallo, velkommen, undskyld,
skål, okay*), plus every numeral and interjection, plus fourteen adverbs the
ledger does not name but which associate with nothing (*så, op, ud, ind,
ned, mere, mest, mindre, mindst, nemlig, egentlig, cirka, engang,
selvfølgelig*).

- **City 2 (41):** ikke, være, der, så, kunne, også, nu, skulle, her, blive,
  meget, ja, nej, ville, kun, lige, bare, gøre, op, ud, ind, ned, igen,
  tilbage, altid, aldrig, måtte, måske, lidt, mere, hvor, hvordan, samme,
  hvorfor, hvornår, tak, hej, en, to, tre, hjemme
- **City 3 (36):** væk, ude, inde, oppe, nede, frem, sammen, have, ofte,
  tit, snart, allerede, stadig, endnu, helt, næsten, nok, sådan, gerne,
  hellere, virkelig, faktisk, egentlig, selvfølgelig, først, fire, fem,
  seks, syv, otte, ni, ti, mest, mindre, mindst, ret
- **City 4 (23):** derfor, alligevel, ellers, altså, nemlig, pludselig,
  længe, sjældent, engang, straks, endelig, cirka, især, undskyld, okay,
  hallo, farvel, velkommen, jo, goddag, godmorgen, godnat, skål
- **City 5 (12):** av, første, anden, burde, tredje, tyve, hundrede, tusind,
  tredive, fyrre, halvtreds, nul
- **City 8 (1):** mod

Judgement calls inside that list, all resolved toward removal: *gøre, have,
blive, være* (the light verbs — clueable in theory, but a clue for *gøre*
points at nothing), *hjemme, samme, tilbage, lidt, meget, helt, godt* —
*godt* is KEPT. Seventeen adverbs stay because they associate: *godt, alene,
desværre, hurtigt, langsomt, heldigvis, tidligt, sent, nogensinde,
sommetider, bagefter, tidligere, senere, dårligt, overalt, udenfor,
indenfor*.

Remaining: **787** card words.

### Add: 100 from the pool, and 13 new

Ranks 901–1000 are still in `src/data/generated/words-batch-*.json`; they
were dropped when the tenth city (Viborg) went and `merge-batches.mjs`
capped at 900. All 100 are concrete, 67 nouns and 33 verbs:

reparere, ødelægge, bage, koge, rydde, appelsin, pære, citron, jordbær,
agurk, gulerod, løg, skinke, peber, slik, sodavand, bukser, briller,
sweater, bluse, ring, radio, skærm, kamera, batteri, hjemmeside, app,
toilet, bad, pande, pose, hylde, skuffe, saks, fryser, blyant, pen, ordbog,
lektie, kursus, pas, kørekort, bagage, grænse, færge, turist, ko, gris, får,
mus, and, tå, kind, læbe, hjerne, græs, bjerg, flod, plante, blad, torden,
lyn, tåge, kok, tjener, frisør, landmand, journalist, håndværker,
politibetjent, venskab, ægteskab, snakke, trykke, fylde, skære, råbe, ryge,
tørre, blande, ordne, hoppe, rulle, bade, binde, klippe, stege, hælde,
smøre, servere, diskutere, ryste, skrige, hviske, glide, klatre, bekymre,
irritere, kramme, trøste

787 + 100 = 887. **Thirteen more** are needed: generate them the way the
batches were (frequency-ranked nouns/verbs/adjectives from rank ~1001 on,
with `exampleDa`/`exampleEn`, gender, countability), verified by the owner,
and appended to a batch so `validate-words` can trace them.

Note the pool is full of semantic sets — six fruit/vegetables, five farm
animals, six professions, four weather words. By frequency they would all
land in city 9 as a clump. **Interleave them across cities 2–9** instead
(see the spread rule below); they all sit within 250 ranks of where they
would otherwise fall.

### Then

1. **Ledger:** add a `greetings and replies` class (and `numerals`, if they
   are to be tracked) to `src/data/function-words.da.json`, early in
   priority order — it is the scenery a beginner meets first. Add the
   fourteen removed adverbs to `adverbs and particles`.
2. **Re-number `curriculumRank`** 1–900 with no gaps: city 1 untouched,
   then frequency order, then enforce per hundred (a) POS quota ≈ 55 nouns /
   25 verbs / 20 adjectives ±10 and (b) no semantic domain above ~15 of 100,
   moving a word no more than 250 ranks from its frequency position. Never
   pair opposites or near-synonyms on purpose.
3. **`scripts/validate-words.mjs`:** fail on any headword that is in
   `function-words.da.json`; fail on numeral/interjection POS; check the
   quotas; extend the gloss-collision check from the opening fifteen to each
   whole city.
4. **Re-measure** `node scripts/measure-function-words.mjs` — the removed
   words' example sentences leave with them, so coverage moves. Target: no
   sentence word under eight appearances across the pool. Where it falls
   short, that is H5's job (sentences written to the ledger).
5. **Audio:** bump `BAKE_NONCE` in `.github/workflows/bake-audio.yml`; the
   113 new headwords need clips and the bake runs in Actions, not in a
   session. The removed words' clips become dead weight until a cleanup;
   bump the service worker `cacheName` if any filename is reused.
6. **Migration:** progress is keyed by word id, so removed ids simply drop
   out of collected/wrapped counts. Check `migrateJourney`
   (`src/stores/journeyStore.ts`) still clamps a mid-journey city index
   sensibly, and that the per-city wrap count (100 to travel) is computed
   against the new membership.
7. **Pins:** run `src/ai/selfplay.test.ts` per city slice and pin the
   clue-hit rate so no city falls below city 9's floor — the instrument
   that catches a reorder recreating the Ribe wall.

## Why un-themed cities

A clue works by spanning domains: *kold* pulls *is, vinter, øl* from three
corners of the board, and a good board is one where two greens share an
association the bystanders do not. A hundred words on one theme is the
opposite — every card near every other, no clue able to separate greens
from bystanders. Cities are dealt onto boards together (`CARRY_OVER` pulls
earlier words forward), so a city's composition IS the board for a long
time. The learning research says the same thing from the other side.

## What the research says

- **Semantically clustered sets are learned worse than unrelated ones.**
  Tinkham (1997) — semantic clusters (*eye, nose, ear*) hinder, thematic
  cross-domain sets (*frog, green, hop*) help —
  [Second Language Research](https://journals.sagepub.com/doi/10.1191/026765897672376469).
  Replicated by Waring (1997); Erten & Tekin (2008) found related sets take
  longer and confuse —
  [System](https://www.sciencedirect.com/science/article/abs/pii/S0346251X08000420).
  A 2022 incidental-learning experiment (102 learners): unrelated items
  benefit more from repetition, significant at eight exposures —
  [PMC9556891](https://pmc.ncbi.nlm.nih.gov/articles/PMC9556891/).
- **Opposites and near-synonyms interfere most.** Nation, after Higa
  (1963): antonyms and near-synonyms are the most confusable pairs to
  present together —
  [ERIC EJ887869](https://files.eric.ed.gov/fulltext/EJ887869.pdf);
  [Lexical sets: dangers and guidelines](https://www.researchgate.net/publication/234594080_Learning_Vocabulary_in_Lexical_Sets_Dangers_and_Guidelines).
  Hence no deliberate *altid/aldrig* pairs.
- **Imageability drives learnability and falls noun → verb → function
  word.** Bird, Franklin & Howard (2001),
  [Behavior Research Methods](https://link.springer.com/article/10.3758/BF03195349);
  [early words are frequent AND imageable](https://direct.mit.edu/opmi/article/doi/10.1162/opmi_a_00130/120435/It-s-All-in-the-Interaction-Early-Acquired-Words).
  Concrete L2 words are retained better —
  [Farley, Ramonda & Liu 2012](https://journals.sagepub.com/doi/abs/10.1177/1362168812436910);
  [app-based concreteness effects](https://www.cambridge.org/core/journals/applied-psycholinguistics/article/word-learning-in-the-wild-appbased-evidence-for-valence-and-concreteness-effects/CE06F035484CAB8E72F96467502862C4).
  The reason *ikke* cannot be clued and the reason it is hard to learn in
  isolation are the same property.
- **Frequency is the right basis; the head of the list is closed-class.**
  The first 1,000 word families cover ~78% of running text
  ([Nation & Waring 1997](https://www.lextutor.ca/research/nation_waring_97.html)),
  and the top hundred-odd are overwhelmingly function words — which is why
  a frequency list's head cannot be a clue game's first board.
- **Incidental exposure alone is the weaker channel for adults; explicit
  attention on top of it is what works** —
  [explicit vs incidental](https://ccsenet.org/journal/index.php/ijel/article/download/0/0/41378/42886);
  [meta-analysis](https://www.cambridge.org/core/journals/language-teaching/article/how-effective-is-second-language-incidental-vocabulary-learning-a-metaanalysis/E38E3468FD2090B1FA3051051DE8E70C).
  So a sentence word should be *noticeable* in its sentence (a tap to
  translate, a faint mark on the round summary), not merely present.
- **Retrieval beats restudy, and retrieval plus elaboration beats both** —
  [word retrieval in L2 learning](https://www.researchgate.net/publication/227793575_Effects_of_Opportunities_for_Word_Retrieval_During_Second_Language_Vocabulary_Learning);
  [covert retrieval and retention](https://www.mdpi.com/2076-328X/16/7/1124).
  Cluing is elaboration, guessing and packing are retrieval; a Codenames
  classroom study found word-association skill improves with play —
  [ScholarSpace](https://scholarspace.manoa.hawaii.edu/items/cc5394fa-5ef5-49db-be5c-4f14d767af66).
  That is the argument for the cross-domain board, and against any change
  that makes a board easier by making its words more alike.

## What the research does not settle

The quota numbers (55/25/20, ≤15 per domain, 250-rank drift, eight
exposures) are judgement; the literature gives direction, not thresholds.
They are the kind of number this repo measures rather than argues — the
per-city selfplay run and `measure-function-words.mjs` are the instruments.
A "heard on the way" shelf in the suitcase for sentence words is product,
not dataset, and is not decided.
