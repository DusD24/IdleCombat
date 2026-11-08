# Amazon Appstore submission: Breach Squad 1.0.0

Everything needed to fill in the Amazon Developer Console (developer.amazon.com → Apps & Services → Add New App → Android).

## Files

| Field | File |
|---|---|
| APK | `store/BreachSquad-1.0.0.apk` (signed release, 168 KB; rebuild with `cd android && ./gradlew assembleRelease`) |
| Small icon (114×114) | `store/icon-114.png` |
| Large icon (512×512) | `store/icon-512.png` |
| Screenshots (1200×1920) | `store/screenshots/portrait-1..3.png`. These are placeholders from early Level 1; swap in later-level shots once your son has played further |
| Privacy policy URL | https://dusd24.github.io/IdleCombat/privacy.html |

Package name: `io.github.dusd24.breachsquad`. This is permanent once submitted.

## Upload key: back this up

`android/breachsquad-upload.jks` and `android/keystore.properties` (password inside) sign every update. They are git-ignored and exist **only on this Mac**. Copy both to your password manager or another safe place. Amazon signs the app it distributes, but you need this key to send updates under the same app.

## Listing text

**Title:** Breach Squad

**Short description:**
Train squads, line them up, and storm the wall. A strategy auto-battler for kids.

**Long description:**
Command your own squad and break through enemy defenses, one wall at a time!

Your barracks never stop training. Pick a squad for each square of your lineup: riot shields up front, gunners behind, rocket teams for bunkers and trucks. When every square is filled, your wave charges in on its own.

Watch how the fight goes, then change your lineup while the battle is still running. Every enemy has a counter: shields stop rushers, rockets crack armor, grenades get behind cover. Find the right mix, beat your last wave's damage, and the wall comes down.

• 11 different squads to unlock and upgrade
• 5 bases with 20 sections, plus endless operations after the campaign
• Rock-paper-scissors strategy that's easy to learn
• Plays fully offline: no internet needed
• No ads, no in-app purchases, no accounts, no data collection

**Feature bullets:**
- Pick-and-place lineup strategy that kids can master
- 11 squads with clear strengths and counters
- Fully offline, with no ads and no purchases

**Keywords:** strategy, army, squad, auto battler, idle, siege, tactics, kids, offline, no ads

## Console answers

| Question | Answer |
|---|---|
| Category | Games → Strategy |
| Price | Free |
| Device support | Fire tablets: yes. Fire TV: **no** (no remote/D-pad controls). Non-Amazon Android: no (that store closed Aug 2025) |
| Contains advertising | No |
| In-app purchasing | No |
| Collects user data / personal info | No |
| Directed at children under 13 (COPPA) | Yes. The app has no internet permission and collects nothing, so it complies |
| Uses Amazon features / SDKs | No |
| Internet required | No |

## Content rating: read before answering

The game shows cartoon soldiers fighting with **realistically named military weapons** (M4 carbines, RPG-7, M249, C4 charges, mortars, tanks). There's no blood or gore: defeated units vanish in a puff of smoke. When the questionnaire asks about violence and weapons, answer honestly: *cartoon or fantasy violence, mild, frequent; realistic weapons referenced*. Expect a rating around **Guidance Suggested (ages 9+)** rather than All Ages.

That may matter for kids' visibility. If Amazon rates it too high for your son's profile age, you have two options. You can approve the app for his profile in the Parent Dashboard. Or you can genericize weapon names in `src/data.js` (e.g. "Rifles", "Rocket Team", "Charges") and resubmit.

## Kids-category checklist (verified in the build)

- [x] No INTERNET permission in `AndroidManifest.xml`. The app cannot reach the network
- [x] No ads, analytics, tracking, or third-party SDKs (zero dependencies)
- [x] No external links; navigation away from the game is blocked in `MainActivity`
- [x] No in-app purchases or accounts
- [x] Fonts embedded, so no requests to Google Fonts
- [x] Progress saved only on the device (WebView local storage)
- [x] Privacy policy published
- [x] Tested on a Fire HD 10 (KFTUWI, Fire OS 8 / Android 11) in a kids profile: launches fullscreen, plays, and keeps the save after a force-stop
