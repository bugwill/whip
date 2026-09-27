# Pane switch fix validation — 2026-09-27

Final behavior: cached E-ink Herdr panes retain their controller across foreground pane switches. Hidden panes still pause WebView frame delivery, and activation requests a fresh full baseline. The E-ink cache remains capped at three renderers; eviction releases its Herdr controller. Leaving the terminal screen or entering background still releases controllers. Reconnection also receives the renderer's saved geometry before remote attachment rather than using 80x24.

106 tests passed across terminalRendererHost, terminalBridgeLru, terminalComposerKeyboard and sshShellFallback. TypeScript passed. Targeted ESLint passed excluding the existing jest/valid-expect warning in terminalRendererHost.test.tsx. Generated assets and targeted diff whitespace checks passed.

Earlier device trials showed that geometry seeding and frame-size filtering alone did not eliminate the remote application's transient small layout. Those filters were removed; final code addresses repeated controller takeover instead.

The final APK passed ZIP CRC, aapt2 parsing, signature verification, zipalign 16 KiB validation and post-copy checksum/CRC validation:

```
BUILD SUCCESSFUL in 2m 21s
781 actionable tasks: 22 executed, 759 up-to-date
APK ZIP CRC and arm64 architecture checks passed
Validated Release: /Documents/Coding/whip/android/app/build/outputs/apk/release/app-release.apk
SHA256: 157a83c0f79bcf7cdc5cc01ad672153bea3ed141323c9c9a72be888e88d84124
Bytes: 88894466
```

Final-device verification passed on 192.168.1.189:39477. Installation returned Success; package 1.7.0 (245) lastUpdateTime was 2026-09-27 17:31:39. The local installed-deliverable checksum matched the final APK recorded above.

Both Notion and Coding were warmed before recording to reproduce the user's already-fitted-pane scenario. Recorded selections were Notion → Coding → Notion → Research → Notion → Coding. Frame-by-frame review of all three Notion activation windows showed the full terminal layout throughout presentation, without the previous small top-left layout followed by expansion. No terminal commands or interrupt keys were sent, and no AndroidRuntime crash entries were found in the sampled log. The device was left on Coding.

Evidence: fixed-pane-switches.mp4 and fixed-switch-events.json. This validates the reported warm-cache switching scenario; it does not measure battery impact or cold reconstruction after cache eviction.
