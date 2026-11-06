# Write-up

## How this was built

I built this with Claude Code, which wrote most of the code and tests from my direction. I normally use React, so I chose Angular as the unfamiliar framework.

I set the direction, used the app, and changed what I found lacking:

- I moved the AI provider to Groq because it has a free plan.
- I added a stage dropdown to the main list so recruiters need fewer steps.
- I added PDF and DOCX uploads, because resumes usually come in those formats.
- I split the resume and cover letter, and added pasting, Remove buttons and automatic summary updates.
- I found that delete did nothing in the browser I tested in, so I had it replaced with a confirm popup.
- I added editing so mistakes in a candidate's details can be fixed.
- I asked for a design review and acted on its finding that updates needed a transaction.
- I tried adding a login, then removed it because it was out of scope.

## Design choices

**Angular.** The list uses one `httpResource` that reads four signals, so changing a filter reloads the data automatically. Reads use `httpResource`, and writes go through one small service.

**SQLite.** I used Node's built-in `node:sqlite`, so there is no database to install. The downside is that it is still experimental and cannot be shared across servers. The deployment plan moves to Postgres, which would also mean changing the routes, because Postgres calls are asynchronous.

**Filtering and sorting.** These happen on the server, because stage order is a business rule and belongs next to the data.

**Stage changes.** Stages can be changed from the list or the candidate page. The list reloads after a move, because the row may change position or leave the current filter.

**Archive and delete.** Archive is the everyday action and can be undone. Delete is permanent, so it asks first with a popup that names the candidate.

**Editing.** Name, email, phone, role and source can be changed on the candidate page. They follow the same rules as the add form.

**Notes.** Notes can only be added. The API has no way to edit or delete one, and a test proves it.

**Updates.** One update can run several SQL statements, so they all run in one transaction. If a step fails, nothing changes, and a test proves it.

## The AI feature

The AI logic is in `server/src/ai/`, `index.ts` only creates the Groq client, and the only UI is the `summary-panel` component. The resume and cover letter are joined and summarised together.

**How it works.** The app cleans the text, rejects anything unusable, calls the model once, checks the output and stores it.

**When it runs.** A summary is made the first time someone opens a candidate, then stored. This means we only pay for candidates people view, and adding a candidate never depends on the AI service. Changing a document deletes the old summary and makes a new one.

**Model.** I use `openai/gpt-oss-120b` on Groq. I chose Groq because it is free, and this task is simple enough that a free option does no harm. This was the largest model my key could use with strict JSON output, but I did not compare it against smaller models. If the model refuses a resume, the user sees an error and nothing is saved.

The deployment plan uses the Anthropic API instead. That change has not been built or tested.

**Bad and adversarial input.** A resume is written by someone who may want to game the system. I assumed an injection will sometimes work, so the design limits the damage:

| Guard | What it does |
| --- | --- |
| No authority | The model has no tools and cannot change any data. The worst case is a false claim in the AI summary panel. |
| Separation | The text sits inside tags, and it cannot close those tags because they are removed first. |
| Cleaning | Invisible characters are removed, so they cannot hide an instruction. |
| Instructions | The prompt treats the text as untrusted, allows only stated facts, and bans recommendations. |
| Skill check | A skill is dropped unless its text appears in the document. It matches inside words, so `Java` passes on `JavaScript`. |
| Warning | The model and a separate regex both look for injections, so a fooled model cannot hide the warning. The regex will miss rewordings. |
| Pre-filter | Empty, very short or garbled text never reaches the model. |

If the AI call fails, the user sees a clear error and nothing is saved.

**Testing.** The AI tests use the real Groq SDK with a fake network, so they cannot show how the real model behaves. The sample candidates were also run against the live API with my key:

- Sam Rivers (injection): the attack failed and the warning showed. This was only one attack, so it is a good sign rather than proof.
- Jo Marsh (garbled) and Alex Byrne (empty): both were refused without calling the model.
- Two flaws appeared. One run of Sam's summary added details that were not in the resume, though a later run did not. Tom Okafor's skills included something that is not a skill in both runs, so the output varies and still needs checking.

There are 102 automated tests. None of them run in a real browser, which is why they did not catch the delete bug, so the main flows also need checking by hand.

## Tradeoffs

- The shared dataset was not available, so the sample candidates are made up.
- The summary does not use a job description. The brief only asks for skills and highlights, and comparing people to a role moves towards automated assessment.
- Uploads were tested with small generated files, so real resumes with complex layouts may extract badly.
- Scanned PDFs have no text to read, so the user gets a message instead.
- On the candidate page, a document can be replaced or removed, but not edited.
- The checks run on the joined text, so a good cover letter can hide a garbled resume.
- Uploads are limited to 5 MB, but a crafted file could still tie up the server. This needs fixing before the app goes online.
- Resume text goes to a third party, which is Groq today and Anthropic in the deployment plan. A real deployment needs a data agreement and a notice to candidates, and must meet Australian privacy rules.
- There is no login, so the server only runs on the local machine.
- The regex can raise false alarms, but a false warning only costs a second look.
- The client and server each keep their own stage list, which could drift apart.
- Two candidates can share an email, and edits are not recorded.
- One test run hung once. It did not happen again in 28 more runs, and I do not know the cause.

## With more time

1. I would test different models and more injection attacks on the real dataset.
2. I would fix the summary flaws by matching whole words and checking each document separately.
3. I would split `CandidateDetail` into smaller components and move business rules into a service.
4. I would add a stage history so changes can be traced.
5. I would add pagination and name search.
6. I would add a login, which is needed before any real deployment.
