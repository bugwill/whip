# Terminal interrupt control Release validation

Date: 2026-09-27

The fixed toolbar includes an interrupt button beside Escape. Its octagon and stop-square icon is defined in TerminalScreen.tsx; terminal-interrupt-icon.svg is the preview. It sends explicit Ctrl+C independently of sticky Alt/Shift: ETX for legacy terminals and CSI 99;5:1u for Kitty report-all. It is disabled while disconnected.

Validation: 58 tests passed across terminalControls, terminalComposerKeyboard, and terminalInput; TypeScript passed; generated terminal assets passed sync-terminal-assets --check. Targeted ESLint passed with the existing sonarjs/use-type-alias finding excluded (pendingTerminalControlsRef union, unrelated to this change).

The arm64 preview-signed Release APK passed ZIP CRC, aapt2 parsing, apksigner signature verification, and zipalign 16 KiB alignment validation. Copied artifact checksum and CRC also passed. Build caches are retained for incremental compilation.

```
BUILD SUCCESSFUL in 2m 20s
781 actionable tasks: 22 executed, 759 up-to-date
APK ZIP CRC and arm64 architecture checks passed
Validated Release: /Documents/Coding/whip/android/app/build/outputs/apk/release/app-release.apk
SHA256: dc5c4f7850a6476ebcbc4f941441ad8d80ddf03fc42ff90091a89d8c9d22ae22
Bytes: 88894478
```

Pane switch investigation: activation fits immediately, after two animation frames, and after 120 ms, with stable geometry deduplication. E-ink Herdr panes release remote controller ownership on deselection and acquire it again on selection, requesting a fresh full frame. This may produce intermediate rendering during restoration; the reported visual scaling has not been reproduced on a device or fixed in this change.
