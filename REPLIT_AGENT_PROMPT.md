# REPLIT AGENT PROMPT: ENVIRONMENT PROVISIONING ONLY (DO NOT BUILD)

Copy and paste the exact text below into the **Replit Agent** when opening the Repl:

```markdown
CRITICAL INSTRUCTION: DO NOT BUILD, REWRITE, OR GENERATE ANY APPLICATION CODE OR UI.
All application logic, forensic telematics engines, interactive maps, and legal evidence dossiers are ALREADY FULLY AUTHORED. I will be uploading data and operating Gemini CLI / Claude directly in the Replit terminal.

Your ONLY task is to PROVISION AND VERIFY THE RUNTIME ENVIRONMENT so that the system is ready for CLI agents and local serving.

---

### YOUR TASKS:

1. **Verify Runtime Tools & Shell:**
   - Confirm Node.js (v18+ or v20+) and npm are available: `node -v && npm -v`.
   - Confirm Python 3.11 and pip are available: `python3 --version && pip --version`.
   - Confirm Git, curl, and jq are installed and available in the terminal.

2. **Install Node Dependencies:**
   - Run `npm install` in the project root to ensure `express` is installed from `package.json`.

3. **Start the Existing Web Server:**
   - Execute `node server.js` to ensure the existing HTTP server binds to `0.0.0.0:3000`.
   - Ensure the Replit Webview detects port 3000 and serves the existing application:
     * `/` (or `/reconstruction`) -> Serves the interactive accident reconstruction.
     * `/portal` -> Serves the master legal evidence portal.
     * `/dossier` -> Serves the 16-page case dossier PDF.

4. **DO NOT MODIFY:**
   - Do NOT rewrite or modify `index.html`, `telemetry_engine.js`, `gps_full_data.js`, or any evidence folders (`00_...` through `11_...`).
   - Do NOT attempt to redesign or create new components.

5. **Completion Report:**
   - Once port 3000 is running and the environment tools (Node, Python, Git) are confirmed healthy, output a confirmation message with the live webview URL and stop. I will take over from the CLI.
```
