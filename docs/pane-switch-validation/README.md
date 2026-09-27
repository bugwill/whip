# Pane switch observation — 2026-09-27

Device: Wi-Fi ADB 192.168.1.189:45951. Installed Release 1.7.0 (245), SHA256 dc5c4f7850a6476ebcbc4f941441ad8d80ddf03fc42ff90091a89d8c9d22ae22.

Test: six selections across Notion, Coding and Research, followed by four selections only between Notion and Coding. The keyboard was dismissed before recording; the final selection was restored to Coding. No terminal commands or interrupt keys were sent.

Result: reproduced the transient small Notion layout in both the initial and warm-cache recordings. The warm recording shows the previously fitted content, then a small top-left layout, then the fitted content again. Glyph sizes remain visually similar; the layout/frame bounds change. This is a terminal geometry and application redraw issue rather than evidence of a font-scale animation. The screenshots from the first recording are at 17.705767 s (small) and 18.058478 s (fitted); these timestamps bound an observed transition, not its exact duration.

Source evidence: TerminalRendererHost.releaseEinkController relinquishes inactive Herdr controllers. TerminalBridgeController.releaseTerminal calls closeHerdrBridge, which calls runtime.closeTerminal. Rust close_terminal_intent removes the terminal runtime entry, including its stored geometry. TerminalBridgeController.ensureTerminalBridge obtains herdrBridgeGeometry or falls back to DEFAULT_TERMINAL_SIZE (80 columns, 24 rows). React Native activation calls connectEntry before injecting herdrActivate; the asynchronous WebView fit later restores measured geometry. This path strongly explains the observed redraw, although no wire-level resize trace was captured in this Release.

Evidence: notion-coding-switches.mp4, notion-small.png, notion-fitted.png, switch-events.json. These are private local test artifacts showing the user's existing terminal content.

No source fix or additional build was made during this verification.
