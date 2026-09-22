# Android final device acceptance — 2026-09-22

Device `BA51B0H2FK7A007000047`, package `io.github.kaminarios.whip` 1.7.0 (245). Evidence is under `/tmp/whip-device-test-20260922/final-acceptance/`.

## Result

- 10 terminal pane switches completed using fresh UI-dump coordinates. PSS baseline 315,284 KiB, after switches 322,400 KiB; native heap 89,464 → 90,120 KiB; graphics 19,056 → 24,148 KiB. `gfxinfo` cumulative counters increased 870 → 920 frames and 187 → 198 janky frames (11/50 additional frames, about 22%); the reported percentiles are cumulative, not a 10-switch batch percentile.
- After a 61-second background interval and return, PSS was 335,987 KiB, native heap 86,840 KiB, graphics 37,144 KiB. This finite sample cannot exclude a long-term leak. A CPU snapshot after return was 8.3% for the Whip process at that instant.
- Hosts: opened New host, entered only local marker `QA_local_only`, then used Back; no save/connect.
- Herd: opened Run command and closed it via its fresh-dump Close action; no command was launched.
- More: Short title focused from terminal exit; fresh UI dump showed it focused with Fcitx served view on the More field, demonstrating terminal composer mode release.
- Normal Composer and fullscreen editor were exercised. Normal mode showed a focused edit field and Fcitx keyboard. Fullscreen editor layout/focus was present; one stable fullscreen sample had `mInputShown=true`, `InputMethod` window visible, and a shortened editor area but no visible Fcitx keycaps in the screenshot. This is reported as a visual-observation limitation, not a new product defect; an earlier fullscreen sample did show the keyboard.
- Sequence 1: exact draft was verified before send; `echo qa_a; sleep 1; ...; echo qa_l` printed `qa_a` through `qa_l` in order. Output was allowed to finish, then the pane was hidden for ~5 seconds and returned; no new output appeared.
- Sequence 2: exact draft was verified before send; `echo qb_a; sleep 1; ...; echo qb_l` printed `qb_a` through `qb_l` in order. It was switched to the other pane at 18:47:26 while the 1-second-per-marker command was still running; it remained hidden for 5 seconds, then returned (the first automated return-coordinate extraction was empty; the valid fresh-dump return was at 18:48:05). The returned screenshot contains the complete ordered output.
- During this run no crash-log matches or active test `sleep` process remained; this supports “no crash/ANR observed during this run” only, not a claim about historical exits.

Cleanup: the explicitly created plain `whip` test pane was closed through the confirmation dialog at 18:50:45. Existing codex/glow panes and user sessions were left intact. Fcitx5 was restored explicitly and remained the selected IME.
