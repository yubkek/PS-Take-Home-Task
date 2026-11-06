# AI usage log

| # | What the tool had done | What I changed | Why |
| --- | --- | --- | --- |
| 1 | Built the summary feature on the Anthropic API with Claude Opus 5.5 | Made the choice to move to Groq, where it then replaced the SDK, request format, error handling, tests and docs, and picked `openai/gpt-oss-120b` | Using this api key over anthropic because it is a free alternative, and although complexity of the task is not too large, being a free option means no harm in using it for extracting relevant information for the summary |
| 2 | Built the list so a stage could only be changed by opening each candidate's page | Added a stage dropdown to each row of the main list | Moving candidates is a frequent task, so I wanted fewer steps for the recruiter and faster changes. This also follows Nielsen's "flexibility and efficiency of use" heuristic |
| 3 | Suggested text file uploads only (.txt, .md), refusing PDFs and Word documents | Changed to allow PDF and DOCX uploads | Resumes are widely accepted in these formats, so it makes sense for this system to adopt them too |
| 4 | Built delete around the browser's built-in `confirm()`, which did nothing in the browser I tested in, so delete did not work | Reported the bug and had `confirm()` replaced with an in-page confirm delete popup | Extra confirmation on deletes to prevent accidental delete button presses, and it no longer depends on the browser's built-in popup |
| 5 | Built candidates so their details could not be changed after adding them | Set to add an option to edit candidate details | More control over information, and it allows for error fixes or adjustments that could happen during the process |
| 6 | Ran the several SQL statements in an update separately, with no transaction | Made the sql queries run in 1 transaction | Makes sure a failure halfway does not partially update data - the update either completes fully or changes nothing |
