# Rift

A gaming-style browser: Chromium engine (via Electron), docked sidebar apps, memory limiter,
ad-host blocking, encrypted sync, plus a small Android app.

## Run
```
npm install
npm start
```

## Build installers
| Target | Command | Output | Build on |
|---|---|---|---|
| Windows | `npm run dist:win` | `dist/*.exe` (NSIS installer) | Windows (or CI) |
| macOS | `npm run dist:mac` | `dist/*.dmg` | macOS only |
| Linux | `npm run dist:linux` | `.AppImage`, `.deb` | Linux |
| Android | `gradle -p android assembleDebug` or open `android/` in Android Studio | `app-debug.apk` | any |

No Mac? Push to GitHub and run the **build** workflow (`.github/workflows/build.yml`): it builds
.exe, .dmg, .AppImage and the .apk on GitHub's runners.

Unsigned builds show SmartScreen / Gatekeeper warnings. For release you need a Windows code-signing
certificate and an Apple Developer ID (notarization). Sign the APK with your own keystore.

## Sync server
```
npm run server              # listens on :8787, stores encrypted blobs in server/data
```
Put it behind HTTPS (Caddy, nginx or a Cloudflare Tunnel). In the browser open GX Control (Ctrl/Cmd+Shift+G)
> Sync, enter the server URL, a username and a passphrase. Use the same details in the Android app.
The passphrase derives the encryption key on-device; the server only stores ciphertext.
Sync covers bookmarks and history (Android: bookmarks). Deleting a bookmark on one device does not
propagate yet (merge is a union).

## Known limits
- This is Electron (Chromium engine), not a full Chromium fork. Chrome Web Store extensions are not supported.
- Spotify, Netflix and other DRM sites need Widevine, which stock Electron lacks. Use castlabs'
  "Electron for Content Security" build (electron-releases) and VMP-sign the app to enable it.
- Google Chrome sync cannot be used by third-party browsers; this project ships its own sync.
- Android uses the system WebView (also Chromium): no ad blocking or extensions.
- Pick your own name, icon and sidebar services; do not ship Opera's or Google's branding.

## Shortcuts
Ctrl/Cmd+T new tab, W close, L address bar, R reload, D bookmark, Ctrl+Tab next tab, Shift+Ctrl+G GX Control, F12 devtools.
