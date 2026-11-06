# Candidate Tracker

## Run it

1. Install Node 22.22.3 or later.

2. Install the dependencies:

   ```bash
   npm install
   ```

3. For AI summaries, copy `.env.example` to `.env` and set `GROQ_API_KEY`. Everything else works without a key.
- To get the key -> go to https://console.groq.com/home -> signup/login -> go to API Keys -> create a key -> set using above instructions.

4. Load the sample candidates:

   ```bash
   npm run seed
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

6. Open http://localhost:4200.
