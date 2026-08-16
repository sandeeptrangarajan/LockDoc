# LockDoc

A DigiLocker/banking-style secure document vault, built as a static, client-side
web app. Share a permanent QR code, let people request access to specific
documents, approve or deny requests with a PIN, and let approved viewers see
watermarked, view-only documents that auto-close after 60 seconds.

Everything runs in the browser — there is no backend. All data (your profile,
documents, QR token, and connection/approval sessions) lives in `localStorage`,
which makes this ideal as a prototype, demo, or teaching example of the flow.

## Getting started

Because the app uses `fetch`-free, pure client-side storage, you can open
`index.html` directly in a browser. For camera-based QR scanning to work
(it requires a secure context), serve the folder over local HTTP instead:

```bash
cd LockDoc
python3 -m http.server 8080
# then open http://localhost:8080
```

or with Node:

```bash
npx serve LockDoc
```

## Demo flow

1. **Home** (`index.html`) — dashboard with quick stats, categories, and recent activity.
2. **My QR** (`qr.html`) — your permanent QR code (generated once, never expires unless you regenerate it).
3. **Scan** (`scan.html`) — scan a LockDoc QR with your camera, or paste a code/link manually.
4. **Connect** (`connect.html`) — enter your name and reason to start a connection request.
5. **Select documents** (`request.html`) — choose which documents to request, then wait for approval.
6. **Requests** (`approval.html`) — the vault owner reviews pending requests and approves/denies with the PIN **`123456`**.
7. **Viewer** (`viewer.html`) — once approved, the requester can view documents read-only, with a tiled watermark and a 60-second countdown that force-closes the session.

Since this is a single-device demo, you play both roles (requester and
approver) in the same browser — open `approval.html` from the "waiting for
approval" screen to simulate the owner's device.

## Project structure

```
LockDoc/
├── index.html          Dashboard
├── qr.html              Permanent QR code
├── scan.html             Camera QR scanner + manual entry
├── connect.html           Connection handshake
├── categories.html        Document vault browser
├── request.html            Document selection + approval waiting screen
├── approval.html            Owner's request queue + PIN verification
├── viewer.html               Secure, watermarked, view-only document viewer
├── css/
│   ├── style.css        Design tokens, layout, resets
│   ├── components.css   Buttons, cards, nav, forms, modal, keypad, toast
│   └── viewer.css       Viewer-specific styling (watermark, countdown)
├── js/
│   ├── storage.js       localStorage data layer + seed data
│   ├── app.js            Shared utilities: icons, toast, nav, formatting
│   ├── qr.js               QR code generation
│   ├── scan.js               Camera scanning (jsQR) + manual fallback
│   ├── connection.js           Session create/approve/deny logic
│   ├── request.js                Document selection + approval polling
│   ├── approval.js                 PIN keypad + approve/deny actions
│   ├── viewer.js                     Countdown timer, anti-copy guards
│   └── watermark.js                    Tiled diagonal watermark builder
├── data/                Reference JSON documenting the seed/data shapes
├── assets/               Place logos/icons/images here
└── app-config.json       Documentation of config values (edit storage.js to change behavior)
```

## Configuration

Runtime configuration lives in `js/storage.js` under `LD.CONFIG`:

| Key                     | Default  | Meaning                                          |
|--------------------------|----------|---------------------------------------------------|
| `PIN`                    | `123456` | Verification PIN required to approve/deny requests |
| `VIEW_SESSION_SECONDS`   | `60`     | Auto-close timer in the document viewer            |
| `ACCESS_VALID_MINUTES`   | `10`     | How long an approved session stays viewable         |

## Notes & limitations

- This is a **prototype**: the PIN check, "encryption," and access control are
  simulated in the browser and are **not cryptographically secure**. Do not
  use it to store real sensitive documents.
- Document content in the viewer is generated on the fly from metadata (name,
  issuer, verification status) rather than real uploaded files, to keep the
  demo self-contained.
- Anti-copy guards (disabled right-click, blocked Ctrl+P/S/C/U) are a
  deterrent, not a real DRM system — browsers cannot fully prevent
  screenshots or capture.
- QR generation uses `qrcodejs` and scanning uses `jsQR`, both loaded from
  cdnjs. An internet connection is required on first load for these to work.

## License

Prototype / demo code — free to use and modify.
