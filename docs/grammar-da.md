# Nine chapters of Danish, one per leg

The curriculum the train ride teaches (card **T2** in `PLAN-2.md`). One chapter
is told on the ride *out of* a city, so the vocabulary a chapter may use is
every word from that city and the ones before it — nothing later.

**That constraint turned out to be free.** The dataset is ordered by frequency,
and frequency put almost nothing but nouns in Sønderborg (84 of its 100) and
all the core verbs in Ribe. So the grammar order the language wants — articles,
then plurals, then verbs — is the order the word list already had. Nobody
arranged that.

---

## What still needs a human

Everything below is written from standard descriptions of Danish and every
example is checked by `scripts/validate-grammar.mjs` against the shipped
dataset: the words exist, they are unlocked by that chapter, and every gender
or article claim matches `words.da.json`. What a machine **cannot** check, and
what a Danish speaker should read before any of it ships:

- **Naturalness.** A sentence can be grammatical and still not be something a
  Dane would say.
- **The edges.** Irregular plurals, the `er`/`har` split in the perfect, and
  which adjectives refuse `-e` are the places to look hardest.
- **Register.** Chapter 9 makes claims about politeness that are cultural, not
  grammatical.

A wrong rule is worse than a wrong example sentence: an example is forgotten,
a rule is believed and repeated. This file is a draft for review, not content
to ship unread.

---

## 1 · Leaving Sønderborg — *en, et, og enden af ordet* / A, an, and the end of the word

**The rule.** Every Danish noun is either *en*-words or *et*-words, and you
cannot tell which from the meaning. "The" is not a word — it is glued onto the
end of the noun.

| | a / an | the |
|---|---|---|
| common gender (~75%) | **en** hund | hund**en** |
| neuter (~25%) | **et** hus | hus**et** |

If the word already ends in **-e**, you add only the consonant:

- en pige → pige**n**  ·  et æble → æble**t**

**Examples from your hundred.** en kat → katten · et bord → bordet · en sol →
solen · et vindue → vinduet · en kvinde → kvinden · et hjerte → hjertet.

**The trap.** There is no rule for guessing gender. *Hus* is *et*, *hjem* is
*et*, but *by* is *en* — and no meaning connects them. This is why every card
in the game has printed **en** or **et** in front of the word since your first
board: it is not decoration, it is half the word.

> Editorial: this chapter explains a mark that has been on screen for a hundred
> words without ever being named. That is the strongest opening the spine has.

---

## 2 · Leaving Ribe — *Én, eller mange* / One, or many

**The rule.** Danish has three plural endings, and then adds **-ne** to make
the plural definite.

| singular | plural | the plural |
|---|---|---|
| en bil | bil**er** | bil**erne** |
| et hus | hus**e** | hus**ene** |
| et år | år *(unchanged)* | år**ene** |

So the ladder is always: *a house · the house · houses · the houses* →
**et hus · huset · huse · husene.**

**Examples.** en dag → dage → dagene · en bog → bøger → bøgerne · en ven →
venner → vennerne · et land → lande → landene · en fisk → fisk → fiskene.

**The trap.** Which of the three endings a word takes is not predictable
either, so it is learned with the word — but **-er** is the safe guess for
anything new, and it is what Danish does to borrowed words. Watch for the
vowel that changes underneath: *bog → bøger*, *hånd → hænder*, *barn → børn*.

---

## 3 · Leaving Kolding — *Verbet står nummer to* / The verb comes second

**The rule, and it is a gift.** The Danish present tense has **one form for
everybody**. Take the infinitive and add **-r**.

> at spise → jeg spise**r** · du spise**r** · han spise**r** · vi spise**r** ·
> I spise**r** · de spise**r**

No endings to learn per person. None.

**The second rule, and it is the one that makes you sound Danish.** In a normal
sentence the verb is the **second element** — not the second word, the second
*thing*.

| first thing | verb | the rest |
|---|---|---|
| Jeg | **spiser** | et æble. |
| I dag | **spiser** | jeg et æble. |
| Om morgenen | **drikker** | vi kaffe. |

When something else takes the first position, the subject moves behind the
verb. *I dag jeg spiser* is the mistake; *I dag spiser jeg* is Danish.

**The trap.** The pull to say *I dag jeg spiser* is strong because that is what
English does. Danish will not have it — and neither will German, which places
the verb the same way.

---

## 4 · Leaving Aarhus — *Spørgsmål og ikke* / Questions, and where "not" lives

**Asking.** A yes/no question is the same sentence with the verb first.

- Du taler dansk. → **Taler du** dansk?
- Han har en bil. → **Har han** en bil?

For open questions, the question word takes first position and the verb still
comes second:

> **Hvor** bor du? · **Hvad** hedder du? · **Hvornår** kommer toget? ·
> **Hvorfor** spørger du? · **Hvordan** går det?

**Saying no.** *Ikke* comes **after** the verb.

- Jeg forstår **ikke**.
- Han kommer **ikke** i dag.
- Kan du **ikke** se det?

**The trap.** *Jeg ikke forstår* is the error every learner makes once. In a
main clause, verb first, then *ikke*. Chapter 8 is where that flips — and it
flips completely, which is why it waits until Roskilde.

---

## 5 · Leaving Aalborg — *Det, der skete* / What happened

**The rule.** Two past forms, and you need both.

**Datid** (simple past) — regular verbs fall into two groups:

| group | infinitive | past | perfect |
|---|---|---|---|
| **-ede** | at elske | elsk**ede** | har elsk**et** |
| **-te** | at købe | køb**te** | har køb**t** |

**Perfektum** (the perfect) is **har** or **er** plus the participle:

- Jeg **har** spist. · Vi **har** læst bogen.
- Jeg **er** gået. · Han **er** kommet.

**The trap, and it is the whole chapter.** Most verbs take *har*. Verbs of
**movement or change of state** take *er* — *gå, komme, blive, rejse*. "I have
gone" is *jeg er gået*, never *jeg har gået*.

And the common verbs are irregular, as common verbs always are:

> være → var → har været · have → havde → har haft · gå → gik → er gået ·
> se → så → har set · få → fik → har fået · sige → sagde → har sagt ·
> drikke → drak → har drukket · spise → spiste → har spist

---

## 6 · Leaving Skagen — *Store huse og den røde bil* / Adjectives, and their three coats

**The rule.** An adjective has three forms, and which one you use depends on
the noun's gender, its number, and whether it is definite.

| | form | example |
|---|---|---|
| common, indefinite singular | base | en **rød** bil |
| neuter, indefinite singular | **-t** | et **rødt** hus |
| plural — *any* gender | **-e** | **røde** biler |
| definite — *any* gender, any number | **-e** | den **røde** bil |

So there is really one thing to remember: **-t only for an indefinite neuter
singular. Everywhere else, -e.**

**Definite is where Danish differs from its neighbours.** With an adjective,
Danish puts a free-standing **den / det / de** in front and leaves the noun
*indefinite*:

- **den** røde bil  ·  **det** store hus  ·  **de** røde biler

Not *den røde bilen*. Swedish and Norwegian double the definite that way;
Danish does not.

**The trap.** *Lille* and *gammel* misbehave: *en lille pige* but *små piger*,
and *en gammel mand* but *den gamle mand*. And adjectives already ending in a
vowel often refuse the **-e**: *blå* stays *blå*.

---

## 7 · Leaving Odense — *Min, din, og den fælde der hedder sin* / Mine, yours, and the trap called "sin"

**The people.**

| | subject | object |
|---|---|---|
| I | jeg | mig |
| you | du | dig |
| he / she | han / hun | ham / hende |
| it | den / det | den / det |
| we | vi | os |
| you (pl.) | I | jer |
| they | de | dem |

*Den* for an *en*-word, *det* for an *et*-word — the gender you learned in
chapter 1 comes back as "it".

**Possessives.** Only the first and second person change shape with the noun:

- **min** bil · **mit** hus · **mine** bøger
- **din** bil · **dit** hus · **dine** bøger
- **hans / hendes / deres / vores** — never change. *hans bil, hans hus, hans
  bøger.*

**The trap, and it is the most Danish thing in this course.** *Sin / sit / sine*
means "his or her own", and it points back at the subject of its own sentence.

- Han tager **sin** bog. → his own book.
- Han tager **hans** bog. → somebody else's book.

Two sentences, one letter of difference, two different people's property.
*Sin* can never be the subject, and it exists only in the third person.

---

## 8 · Leaving Roskilde — *Fordi, hvis, at — og ordet der flytter sig* / The word that moves

**The rule.** These join two clauses: **at** (that), **fordi** (because),
**hvis** (if), **når** (when), **da** (when, once, in the past), **mens**
(while), **selvom** (although), **som / der** (who, which).

**And then the word order changes.** In a subordinate clause, *ikke* and words
like it move **in front of** the verb — the exact opposite of chapter 4.

| | |
|---|---|
| main clause | Jeg kommer **ikke**. |
| subordinate | …fordi jeg **ikke** kommer. |
| main clause | Han taler **ikke** dansk. |
| subordinate | Jeg ved, at han **ikke** taler dansk. |

There is also no verb-second inversion inside a subordinate clause: whatever
comes before it, the order stays *conjunction → subject → adverb → verb*.

**The trap.** This is the rule that separates a learner from a speaker, and it
is the one nothing before this point in the game could teach you — a clue is a
single word, and a one-clause example sentence has no second clause to put
*hvis* or *fordi* inside.

> Editorial: this is where the measured hole gets filled. The function-word
> study found *hvis* at 0 of 900 and *fordi* at 2, structurally, because a
> single-clause A1 example cannot hold a subordinating conjunction.

---

## 9 · Leaving København — *Kan, skal, vil — og at sige det pænt* / Modals, and saying it nicely

**The rule.** The modal verbs take a bare infinitive — **no *at***.

> Jeg **kan** tale dansk. · Vi **skal** rejse i morgen. · Han **vil** gerne
> hjælpe. · Du **må** godt spørge.

- **kan** — ability · **skal** — an arrangement, or an obligation
- **vil** — intention or will · **må** — permission (and, with *ikke*,
  prohibition) · **bør** — ought to

**The future is mostly the present.** Danish rarely needs a future tense; a
present verb plus a time word does the job.

> Jeg rejser **i morgen**. · Toget kommer **klokken syv**.

Use *skal* for something arranged and *vil* for something intended.

**Saying it nicely.** Danish has no everyday polite "you" — *De* survives only
in letters from the tax office. Politeness is carried by small words instead:

- **gerne** — Jeg vil **gerne** have en kaffe, tak.
- **lige** — Kan du **lige** hjælpe mig?
- **tak** — which goes almost everywhere.

**The trap.** *Jeg vil have en kaffe* is grammatical and lands like a demand.
*Jeg vil gerne have en kaffe* is the same sentence and lands like a person.
One word, and it is the difference between correct Danish and Danish you would
want to be spoken to in.

---

## How the next city reinforces the chapter

Owner's call, 2026-08-21: the example sentences of the city you arrive in
should exercise the chapter you were just taught, so the rule is met again in
ordinary play rather than only on the train.

| taught leaving | reinforced by the example sentences of | the structure to hit |
|---|---|---|
| Sønderborg (1) | Ribe | definite nouns — *huset*, *bilen* |
| Ribe (2) | Kolding | plurals and definite plurals |
| Kolding (3) | Aarhus | a non-subject first, verb second |
| Aarhus (4) | Aalborg | questions, and *ikke* after the verb |
| Aalborg (5) | Skagen | past and perfect |
| Skagen (6) | Odense | adjectives in all three coats |
| Odense (7) | Roskilde | possessives, and at least some *sin* |
| Roskilde (8) | København | subordinate clauses with the shifted *ikke* |
| København (9) | — *(the journey ends)* | — |

This is **measurable, and it should be measured** rather than hoped for: the
same stemmed matcher that proves a ride covers a city's hundred words can count
how many of a city's example sentences contain a definite form, a plural, a
subordinate clause. The target is a share, not all hundred — a sentence forced
into a structure it does not want is worse than a sentence that misses it.

**The ordering consequence, and it matters:** if the example sentences are
going to be rewritten to hit these targets, then **S2 must not bake them
first.** Baking 900 sentences and then changing them is the bake paid for
twice.
