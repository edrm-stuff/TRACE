# TRACE

**Tuning & Race Analysis Calibration Engine** — a telemetry-driven tuning assistant for Forza Horizon 6.

TRACE reads Forza Horizon 6's live "Data Out" telemetry while you drive and turns it into a calculated baseline setup, plain-language handling diagnostics, and concrete suggestions for what to tune next.

<!-- TODO: add a screenshot of the app here -->

---

## Why I built this

I wanted to actually learn to tune my own cars — to understand upgrades and setup, not just slap a share-code on a car and drive off. Most tutorials I found were "put this value on X, this value on Y" lists that did the thinking for me, and I wanted to use my own head a bit.

## ⚠️ Honest disclaimer

I'm not a tuning expert. I can't promise that every label, description, or suggestion in TRACE is "correct" — and honestly, in tuning there often isn't a single correct answer. A lot of it comes down to your driving style and your taste.

So treat TRACE as a **thinking aid, not gospel**. It points you at what *might* be happening and what you *could* try next. You stay the tuner. If something looks off, trust the car and your feel over the tool — and feedback is very welcome.

## What it does

- **Baseline calculator** — generates a calculated starting setup so you have a sensible launch point to tweak from, instead of a blank sheet.
- **Symptom-based diagnostics** — watches live telemetry and detects handling symptoms (understeer/oversteer on entry, mid-corner and exit, wheel lockup, body roll, bottoming out, high-speed instability, and more). You can also flag symptoms yourself, and TRACE suggests what to tune next for each.
- **Gear-ratio helper** — record a pull and it captures your shifting, redline, peak-power RPM and top speed to suggest ideal gear ratios and final drive.
- **Tire-width check** — from a low-gear launch it flags whether your tire width is too wide or too narrow for the power you're putting down.
- **Live HUD** — gear, speed, RPM, shift lights, tire temperatures, throttle/brake, power/torque, and a live understeer/oversteer balance readout.

## How it works

Forza Horizon 6 broadcasts a "Data Out" UDP telemetry stream while you drive. TRACE is a small desktop app — a [Wails](https://wails.io/) build with a Go backend and a vanilla-JS frontend — that listens for those packets, decodes them, and feeds the values to the UI in real time. Nothing leaves your machine; it's all local.

## Setup

### 1. Get TRACE

Download the latest `forzatunes.exe` from the [Releases](../../releases) page, or build it yourself (see below).

### 2. Turn on telemetry in Forza Horizon 6

TRACE shows nothing until Forza Horizon 6 is sending data. In the game's settings, go to **Settings → HUD and Gameplay → Data Out** and set:

- **Data Out:** `ON`
- **IP Address:** `127.0.0.1`
- **Port:** `7777`

### 3. Run it

Launch TRACE, then drive. The panel switches from *"Waiting for Forza…"* to live as soon as packets arrive.

> Using a different port? TRACE reads the `FORZA_PORT` environment variable if you need to override `7777`. There's also a `FORZA_DEMO=1` mode that emits synthetic telemetry so you can poke around the UI without launching the game.

## Build from source

Requires [Go](https://go.dev/) and the [Wails v2 CLI](https://wails.io/docs/gettingstarted/installation).

```bash
# live development with hot reload
wails dev

# production build → build/bin/forzatunes.exe
wails build
```

## Status

Early, solo project — currently **v0.1.0**. It works and has been tested live in-game, but suggestions and labels may be wrong or incomplete, and things will change. Issues and feedback are welcome, especially from people who actually know their way around a tune.

## Credits

The telemetry side of TRACE started from [richstokes/Forza-data-tools](https://github.com/richstokes/Forza-data-tools) — that project was the bridge that got me reading Forza's "Data Out" stream in the first place, and the foundation the parsing grew from. Big thanks.

Built with [Wails](https://wails.io/) (Go + JavaScript), and with a good amount of AI assistance along the way — including digesting the tuning guides that shaped the calculator's logic.
