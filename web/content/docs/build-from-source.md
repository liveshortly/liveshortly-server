# Build from source

Run and build every part of LiveShortly on your own machine: the server and web app, the `live` CLI, and the PocketAI Mac and iPhone apps. Use this page to work on the code or to run builds you made yourself. If you only want your own server, [Self-hosting](/docs/self-hosting) is shorter. You need Git and, depending on the part, Docker, Go, Node.js, Rust and Xcode.

## The repositories

| Repository | What it is | Built with |
| --- | --- | --- |
| [liveshortly-server](https://github.com/liveshortly/liveshortly-server) | The API (`api/`) and this web app (`web/`) | Go, Next.js, Postgres, Redis, Docker Compose |
| [live](https://github.com/liveshortly/live) | The CLI that wraps your agent, streams sessions and runs `live daemon` | Go |
| [PocketAI.Core](https://github.com/liveshortly/PocketAI.Core) | Shared Rust engine and Swift packages used by both apps | Rust, Swift |
| [PocketAI.Mac](https://github.com/liveshortly/PocketAI.Mac) | The macOS app | SwiftUI, XcodeGen |
| [PocketAI.Iphone](https://github.com/liveshortly/PocketAI.Iphone) | The iPhone app | SwiftUI, XcodeGen |

`live` talks to a server over HTTPS. The apps talk to the same server, and the Mac app runs `live daemon` so the web and the iPhone can start sessions on that Mac. Point every piece at the same server and it all works together.

## Server and web app

### Run the full stack locally

This runs the API, web app, Postgres, Redis and an nginx front on one origin, `http://localhost:8080`. Sign-in needs a Google OAuth client; the [Self-hosting](/docs/self-hosting#create-a-google-oauth-client) page shows how to create one, using `http://localhost:8080/auth/google/callback` as the redirect URI.

```bash
git clone https://github.com/liveshortly/liveshortly-server.git
cd liveshortly-server
```

Put the OAuth client and a session secret in `.env.auth`:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=paste-the-output-of-openssl-rand-hex-32
```

Then start it:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Open `http://localhost:8080`, not port 3000. Sign-in cookies and live streaming only work through the nginx front.

### Work on the web app

The web app is a Next.js project in `web/`.

```bash
cd web
npm install
API_INTERNAL_URL=http://localhost:8000 npm run dev
```

With the Compose stack running, the dev server on `http://localhost:3000` proxies `/api` and `/auth` to the API container on port 8000. Use it for page and style work. Live streaming is buffered through that proxy, so check streaming on `http://localhost:8080`.

### Work on the API

The API is a Go module in `api/` (Go 1.25 or newer).

```bash
cd api
go test ./...
```

After changing the API, rebuild its container with `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build api`.

## The live CLI

`live` is a single Go binary (Go 1.26 or newer).

```bash
git clone https://github.com/liveshortly/live.git
cd live
make build    # builds bin/live
make test
```

To use your build, put `bin/live` on your PATH, or run `make install` (installs to `/usr/local/bin`; set `PREFIX` to change that). Then point it at your server and sign in:

```bash
live host set http://localhost:8080
live login
```

`live host reset` goes back to liveshortly.com. Web-started sessions also need `tmux`, which you can install with `brew install tmux` or `apt install tmux`. Then run the daemon with the folders it may start agents in:

```bash
live daemon --dir ~/code
```

## PocketAI apps

The Mac and iPhone apps build against PocketAI.Core, which must be checked out next to them:

```bash
mkdir pocketai && cd pocketai
git clone https://github.com/liveshortly/PocketAI.Core.git
git clone https://github.com/liveshortly/PocketAI.Mac.git
git clone https://github.com/liveshortly/PocketAI.Iphone.git
```

You need an Apple Silicon Mac with Xcode, [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`) and Rust through rustup. The apps target macOS 14 and iOS 18.

### Build PocketAI.Core first

```bash
cd PocketAI.Core
rustup target add aarch64-apple-ios aarch64-apple-ios-sim aarch64-apple-darwin
scripts/build-xcframework.sh
cargo test --workspace
swift test
```

`scripts/build-xcframework.sh` builds the Rust engine for every Apple target and generates the Swift bindings the apps import. Run it again after changing Rust code.

### Build the Mac app

```bash
cd ../PocketAI.Mac
xcodegen generate
open PocketAI.xcodeproj
```

To run it yourself, choose your own team under Signing & Capabilities, or build it unsigned from the command line:

```bash
xcodebuild -scheme PocketAI -configuration Debug -destination "platform=macOS" CODE_SIGNING_ALLOWED=NO build
```

Never edit `PocketAI.xcodeproj` by hand. It is generated from `project.yml`, so change `project.yml` and run `xcodegen generate` again.

### Build the iPhone app

```bash
cd ../PocketAI.Iphone
xcodegen generate
open PocketAI.xcodeproj
```

Pick an iOS 18 simulator and press Run. To run on your own iPhone, set your development team and a bundle identifier you own in `project.yml`, then run `xcodegen generate` again.

### Point the apps at your server

- **Mac:** open LiveShortly. In the This Mac card, choose Change › Custom… next to Server and enter your address. This runs `live host set` for you. If `live` isn't installed, the card offers to install it.
- **iPhone:** in Settings › Integrations › LiveShortly, enter your server address before you connect. iOS only allows HTTPS, so expose your server over HTTPS (for example with `tailscale serve` or the [TLS setup](/docs/self-hosting#add-https)).

## Release builds

Signing, notarization, TestFlight upload and the `live` release workflow need the maintainers' Apple certificates, App Store Connect key and GitHub secrets. They live in each repo's `scripts/` and `.github/workflows/`. You don't need them to build and run everything yourself.
