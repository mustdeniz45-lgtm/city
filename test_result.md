#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  CityQuest — gamified city guide. Current sub-feature: Friends Leaderboard
  (Approach A2+B1+C3+D1): unique per-user friend code stored on progress row,
  device-local friend list in AsyncStorage, backend batch-resolves codes to
  public leaderboard entries. UI: Profile shows "Your friend code" card with
  Copy, "Add friend by code" prompt, and the Leaderboard section now toggles
  between Global and Friends tabs.

backend:
  - task: "Friends: lazy friend_code generation on GET /api/progress/{device_id}"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          GET /progress/{device_id} now calls repo.progress_ensure_friend_code
          which auto-generates a unique 'CQ'+6-char code and persists it to
          the row if missing. Returns None for a device_id that has no row
          yet (no ghost rows). Verified via curl: existing device returns
          existing code '4B73C0' unchanged.

  - task: "Friends: GET /api/friends/lookup/{code}"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Normalises input (strips spaces, uppercases, allows 6–8 chars for
          legacy compatibility), 400 on bad input, 404 on unknown code, 200
          returns public friend card (display_name, avatar, xp, level, title,
          badges, quests, is_anonymous). Verified: 4B73C0 → Wolfy 760 XP;
          lowercase+spaces normalised; ABC → 400; CQ99ZZZZ → 404.

  - task: "Friends: POST /api/friends/leaderboard (batch)"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Accepts { codes: string[] }, normalises + dedupes + caps at 200,
          returns XP-descending list of public friend entries. Verified with
          mixed real/unknown codes — only real one is returned.

  - task: "Leaderboard: fix pre-existing NameError on `cutoff`"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Ruff caught a latent NameError in GET /leaderboard where `cutoff`
          was referenced but never defined. Added `cutoff = now - 14 days`
          so the active-recently filter now works as originally intended.
          Existing rows without updated_at/check-ins are still kept (legacy).

frontend:
  - task: "Profile: Friend Code card + Copy button"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/profile.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          New "Friends" section renders the user's friend_code in an
          inverse-surface card with a Copy button (uses expo-clipboard).
          Falls back to "Earn some XP to unlock your code" for brand new
          devices where no progress row exists yet. Confirmed rendering
          via screenshot.

  - task: "Profile: Add friend by code (with lookup + local storage)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/profile.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Toggle button reveals a TextInput + submit. On submit: validates
          length (≥6), rejects the user's own code, calls
          /api/friends/lookup/{code} to preview, then persists to
          AsyncStorage via src/friends.ts. Auto-switches board to Friends
          tab and shows success alert. Handles ApiError messages (400/404
          from backend). Verified with valid and invalid codes.

  - task: "Profile: Leaderboard Global | Friends tabs (merged with self)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/profile.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Leaderboard section now has two pill tabs. Friends tab shows the
          batch-resolved friend list merged with a synthetic "you" row so
          the user always sees their own rank. Correctly sorted by XP,
          highlights the "you" row with brand tint. Verified: Wolfy #1 (760
          XP), Traveler (you) #2 (0 XP).

  - task: "Friend chips row + long-press remove"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/profile.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Horizontal scrollable chips show each saved friend with their
          nickname + code. Long-press opens a confirm dialog to remove.
          Instant local delete + trims friendBoard state so no re-fetch
          needed.

metadata:
  created_by: main_agent
  version: 1.0
  test_sequence: 1
  run_ui: true

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: main
    message: |
      Implemented the Friends Leaderboard feature end-to-end (backend +
      frontend). Also fixed a latent NameError on `cutoff` in
      GET /api/leaderboard (uncovered by ruff during this session).
  - agent: testing
    message: |
      All 11 backend pytest cases pass + all 20 frontend acceptance points
      verified via Playwright (390x844). No bugs found. Non-blocking notes:
      pre-existing RN-Web `shadow*` / `pointerEvents` deprecation warnings
      (unrelated to Friends), and Alert.alert on RN-Web doesn't surface as
      a browser dialog (native OK). Feature ready to ship.
  - agent: main
    message: |
      New iteration: (1) CityHeader gained a city-progress bar on the
      Explore hero, mirroring the city-picker style; (2) every Quest card
      now renders a small "X/Y steps · Z%" progress bar plus an "In
      progress" pill when partially done. Added new backend endpoint
      GET /api/cities/{city_id}/quests/progress (batch rollup, reuses
      evaluate_quest_progress). Also fixed an Expo Go crash by (a) making
      CityQuestMap a runtime dispatcher that lazily require()s the
      MapLibre native impl only on real builds, and (b) trimming the
      Map barrel to stop re-exporting `QuestRouteLine` which was
      dragging @maplibre/... into module scope.
  - agent: testing
    message: |
      8/8 backend pytest cases pass for the new batch endpoint. Frontend
      reviewed statically (all testIDs, clamping, and pill logic match
      spec). Two non-blocking observations:
        (a) Wolfy's `completed_quests` contains 5 legacy IDs
            (`q-gaz-1..5`) that no longer exist in the current catalog,
            so his header will show `1/11` not `6/11` — data drift, not
            a code bug.
        (b) Occasional Supabase upstream resets surface as HTTP 500 on
            `/quests/progress` and `/progress/{id}/by-city`. Frontend
            already tolerates via `.catch()`. Recommend adding retry-
            with-backoff in `repo._sb_call` in a later iteration.

      Please test:
        BACKEND
        1) GET /api/progress/{device_id} for a NEW device_id (should NOT
           create a row and NOT return a friend_code — should return the
           empty payload with friend_code:null).
        2) GET /api/progress/{device_id} for an EXISTING device_id without
           a friend_code — should lazily provision one and return it in
           subsequent calls unchanged (idempotent).
        3) GET /api/friends/lookup/{code} happy path (use `4B73C0` which
           belongs to device_id `dev_1781112526529_iml7ard2` = Wolfy).
        4) GET /api/friends/lookup with LOWERCASE input, with SPACES,
           with 3-char (400), with unknown 8-char (404).
        5) POST /api/friends/leaderboard with a mix of valid + invalid
           codes — should return only the valid rows sorted by XP.
        6) GET /api/leaderboard should still return 200 and not crash.

        FRONTEND (Profile tab)
        1) Friend Code card renders with a code for a device that has a
           progress row; Copy button uses expo-clipboard.
        2) "Add friend by code" toggle opens an input + Add button.
        3) Submitting an invalid code shows a friendly Alert.
        4) Submitting `4B73C0` (Wolfy) adds them, closes the panel,
           switches to Friends tab, and shows Wolfy #1 + "you" #2.
        5) Long-pressing the friend chip prompts remove.
        6) Global tab still works and shows the classic device-id list.

      Known device_ids with data (for testing):
        - `dev_1781112526529_iml7ard2` — Wolfy, 760 XP, friend_code=4B73C0
        - `dev_1783276978276_3ik0yb77` — TEST_ac, 110 XP