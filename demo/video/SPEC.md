# VTE Watch: 30-second submission film (spec)

_AI-assisted: written with Claude Code. Every claim traces to README/CLAIMS; app footage is real screenshots of the synthetic cases._

GOAL:    a judge understands in 30 s why clot monitoring far from Earth needs more than one score, and that VTE Watch keeps NASA's score and leaves the decision with the flight surgeon.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps. Event limit: video of 30 s or less.
TIME:    ≤ 30.0 s = ≤ 900 frames. Narrated: the voice is the clock (ElevenLabs eleven_v4, George, 1.12x tempo; labelled on screen).
STRUCTURE (Ahmed's): hook → problem → data (what is different) → solution → close.

SCRIPT v3 (every fact sourced; Ahmed: planet hook, show what is different with DATA, show the workflow):
1. HOOK (space, Earth with 31 crew dots, 8 amber): "Eight of thirty-one astronauts in NASA's study had abnormal jugular-vein flow in flight." (NASA/SP-20260005258 REV1)
2. PROBLEM (same Earth, signal to Mars): "Near Mars, a clot can't wait: NASA lists delays of up to 40 minutes, and no evacuation." (OCHMO-TB-007: "Extended communication latencies (0-40 minutes)", "No evacuation capability")
3. DATA (NASA score alone vs VTE Watch, the engine's own output on the 12 synthetic cases; CLAIMS row 15 Nov): "In our twelve test cases, five scored low. VTE Watch still flagged three: a seventy-five percent flow drop, a missing scan, and an emergency symptom." On screen: 12 tiles with NASA points; the five 0-1 point cases light up; cards C06 WATCH, C10 DATA_INSUFFICIENT, C11 RED_FLAG_OVERRIDE, C01/C02 STABLE "No false alarm"; "3 of 5 flagged"; footer "Rule-based flags for flight-surgeon review, not diagnoses · synthetic data · no accuracy measured".
4. HOW IT WORKS (15 Nov 16:25: a real screenshot of the Flight Surgeon Console replaces the workflow diagram, which stays on deck slide 5; camera: full console → IJV trend + evidence timeline at "checks run onboard" → the state card, "Decided by the flight surgeon" ringed, at "signs every decision"): "Scans and symptoms go in, checks run onboard, and the flight surgeon signs every decision."
5. CLOSE: end card, no voice.

LOOK:    four worlds, one palette (the app's own): ink #e9eff4, teal #5cc8da (accent: one word or object per shot), amber #e8a33d (abnormal finding only), red #e5574b (emergency only).
         W1 hook: clinical light #eef2f5, ink #0b1a22. W2 problem: space black #04070a. W3/W4: the product, app ground #080d12, real screenshots ≥ 55% of frame height. W5 close: teal flood #5cc8da, ink #062027.
         Type: Inter 900 display 120-220 px, -2% tracking; Inter 500 body 34-40 px; JetBrains Mono 26 px for sources and state names.
         No glow, no particles, no glass, no gradients except the two planet discs.
OBJECTS: 31 cohort bars (one per astronaut in NASA's study), Earth and Mars discs with a signal travelling between them, the real app screens (score, scan trend, symptom checklist, medication panel), the real workflow diagram.
MOTION:  arrivals expo.out 0.5-0.7 s; camera moves power2.inOut; exits power3.in, 40% shorter; titles land then hold dead still.
SHOTS:   1 cohort strip, 8 bars turn amber in a stagger, "8 / 31" lands (0-~5 s) → 2 signal travels Earth→Mars, latency counter, stamp "No evacuation capability" (~5-11 s) → 3 the score screenshot flashes like a photo, shrinks left; a timeline of real scan cards (32 → 17.5 → 8 cm/s) grows right (~11-16 s) → 4 solution: score, trend with L+47 highlighted, red emergency box punch-in, medication panel, workflow "Flight surgeon decides and signs" (~16-27 s) → 5 teal flood, "VTE Watch" typed in, credits (~27-30 s).
SOUND:   ElevenLabs voice; ElevenLabs music bed at ~0.14 under the voice: quiet low pulse for hook/problem, opens at "VTE Watch"; no click sounds.
COMPLIANCE: persistent strip "SIMULATION · SYNTHETIC DATA · AI VOICE AND MUSIC: ELEVENLABS"; no NASA logos; no AI-generated images or video (all visuals are the app, drawn shapes or our diagram).
BANNED:  dark void with small floating things; glow; three cards in a row; title over a dimmed screenshot; every scene fading up the same way; text moving while read.
QA:      t=0.2 (frame 0 not blank), 3.5 (8/31 legible), 8 (counter + stamp), 13 (snapshot + timeline), 21 (red box legible), 25.5 (decision), 29 (end card + AI label).
