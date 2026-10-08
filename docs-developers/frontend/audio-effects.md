---
title: Smart Speed and Voice Boost
description: "The player's two audio effects: where each runs, the shared switches, Android's processor chain (the vendored NarrationSilenceProcessor and VoiceBoostProcessor), iOS's processing tap and look-ahead Smart Speed planner, the web's Web Audio graph, and time saved."
---

Smart Speed (shorten the silences in narration) and Voice Boost (compress and lift speech)
are two device-wide settings, off by default, that each engine implements its own way.
No wire change: both are client-side, and "time saved" is kept on the device.

| | Android | iOS | Web |
|---|---|---|---|
| **Smart Speed** | every book: a silence-skipping `AudioProcessor` | **downloaded books only**: the player's rate raised inside known silences | not offered |
| **Voice Boost** | every book: a compressor/limiter `AudioProcessor` after Sonic | every book: an `MTAudioProcessingTap` per item | Web Audio `DynamicsCompressorNode`, never in WebKit-only browsers, same-origin sources only |

## The settings and the UI

- `src/stores/settings.ts`: `smartSpeed` and `voiceBoost` (`PlaybackSettings`), default
  `false`; a stored value counts only when it is exactly `true`. They reach the engine
  through the store's `configure` (`PlaybackConfig.smartSpeed` / `voiceBoost`).
- `src/playback/effects.ts` holds the platform rules, pure: `smartSpeedApplies(platform,
  queue)` (Android always; iOS only when every track URL is `file://`; never the web) and
  `supportsVoiceBoost(env?)` (Web Audio with `createMediaElementSource` and
  `createDynamicsCompressor`, and not `isWebKitOnly(userAgent)`: Safari and every browser on
  iOS/iPadOS, because routing an `<audio>` element through an `AudioContext` there plays
  choppy audio, ignores `playbackRate` and suspends on the lock screen - WebKit bugs 240405,
  311000, 261554).
- `src/components/player/effects-model.ts` turns those into what each switch says:
  `smartSpeedRow` (web: off, disabled, `notInBrowser`; elsewhere the hint, the lifetime
  "Saved 2h 11m" once `hasSaved` (a whole second), and on iOS with the switch on and a book
  that isn't all local, `downloadedOnly`) and `voiceBoostRow` (disabled with
  `notInThisBrowser` where the web can't run it).
- `EffectsSettings` (`effects-settings.tsx`) renders both switch rows. The speed sheet
  (`SpeedSheet`, under the presets) and Settings > Listening > Playback (`PlaybackPane`)
  mount the **same component**, so each setting lives in one place.
- The full player's action row adds an effects pill on tablet and desktop only (`wide`; the
  phone row is full): `effectsPill` says "Saved 2h 11m" while Smart Speed is on and has saved
  some, else "Voice boost" or "Smart speed" for whichever is on, nothing when both are off;
  the web only ever shows Voice Boost. It opens the speed sheet. It wears `sparkles`: the
  style guide's `wave` glyph isn't vendored yet.
- Strings live under the `effects` namespace (`effects.smartSpeed.*`,
  `effects.voiceBoost.*`, `effects.saved`, `effects.bookSaved`, `effects.pillLabel`).

## Android: one processor chain

`effects/AudioEffects.kt` is the seam the service and the module share. Its
`renderersFactory(context)` builds ExoPlayer's renderers with our own
`AudiosiloAudioChain` (`effects/AudiosiloAudioChain.kt`):

```
NarrationSilenceProcessor  ->  SonicAudioProcessor  ->  VoiceBoostProcessor
   (book time)                    (speed)                 (what you hear)
```

Media3 1.5.1's `DefaultAudioProcessorChain` only accepts Media3's own (final) silence
processor, so the chain replaces it the way Pocket Casts does. Order matters: silence
skipping runs first, on the book's own frames, so its skipped-frame count is book time (what
`getSkippedOutputFrameCount` reports to the sink's position maths, and what time saved
counts); Sonic does the speed; Voice Boost runs last, so its attack and release are real
time at any speed. One chain instance per sink.

- **`NarrationSilenceProcessor`** is a Kotlin port of Media3 **1.11.1**'s
  `SilenceSkippingAudioProcessor` (Apache 2.0, provenance in the file header). It is vendored
  because 1.5.1's copy sizes its "maybe silence" buffer in frames but uses it as bytes
  (androidx/media#3271), keeping a quarter of the intended padding around each word in
  stereo, and fades per byte. Narration defaults: threshold 330 (about -40 dBFS peak),
  minimum silence 300 ms, retention ratio 0.25, at most 1 s of silence kept, mute to 10%. It
  also keeps a monotonic count of skipped frames and the book time they were worth (the sink's
  own `skippedFrames` still resets on every flush, as `applySkipping` needs).
- **`VoiceBoostProcessor`**: an 80 Hz high-pass, a compressor (-24 dBFS, 3:1, 6 dB soft
  knee, 10 ms attack, 200 ms release, +6 dB make-up), a peak limiter (-1 dBFS ceiling, about
  1 ms attack, 80 ms release) and a final clip; one gain for every channel (stereo-linked).
  It is **always active**: changing `isActive` would make the sink flush (a gap and a position
  jump), so the switch instead moves a ~20 ms ramp between dry and wet, and fully off the
  output is the input byte for byte. `queueInput` never allocates or locks.
- **Switching**: the module's `setConfig` sends the custom session command
  `audiosilo.SET_EFFECTS` (extras `smartSpeed`, `voiceBoost`); the service applies them
  (`AudioEffects.apply`: `player.skipSilenceEnabled`, which lets ExoPlayer drain and
  re-checkpoint around the change, and the boost's atomic flag) and saves them in the
  `audiosilo.player` SharedPreferences (`effects.smart`, `effects.boost`), so a service
  started without JS (the car, playback resumption) applies the listener's last choice.
- **Time saved**: `AudioEffects.silenceSavedSeconds` (process-wide, monotonic) rides on the
  module's `onProgress` as `silenceSaved`. Silence-skip discontinuities emit no progress of
  their own.

JVM tests: `NarrationSilenceProcessorTest`, `VoiceBoostProcessorTest` (synthetic PCM from
`effects/Pcm.kt`); see [Testing](testing.md#native-checks).

## iOS: a processing tap and a look-ahead planner

### Voice Boost (`VoiceBoostTap.swift`)

An `MTAudioProcessingTap` on each `AVPlayerItem`'s audio mix, running our own small DSP with
the Android numbers (high-pass, soft-knee compressor, peak limiter), so the platforms sound
alike. Apple's `AUDynamicsProcessor`/`AUPeakLimiter` were rejected: they need an AudioUnit
graph pulling from the tap, can't express the knee and ratio, and a first render can
allocate. Real-time rules hold in `process`: no allocation, no locks, no Swift reference
counting (the state is a plain struct allocated in the tap's `init` and freed in
`finalize`). The switch is one process-wide aligned 32-bit word read once per render call,
with a 20 ms gain ramp, so toggling never rebuilds or re-mixes an item.

Taps are attached only once the switch has been on during this engine's life: a listener
who never enables Voice Boost keeps the exact pre-effects audio path (no audio mix on any
item). The tap is expected to sit before the rate's time-pitch stage (the item's audio mix runs in the item's own timeline), so its attack and release would be in book time; the source notes this as unverified without a device.

### Smart Speed (`SmartSpeed.swift`, `SmartSpeedPlanner.swift`)

An `MTAudioProcessingTap` can't drop frames, and raising the rate after the tap hears a
silence lands on the next word. So iOS plans ahead, and only for a book whose every track is
a `file://` URL:

1. **Look-ahead**: `SmartSpeed` decodes the local file with `AVAssetReader` on a background
   queue in 30 s chunks, keeping the silence map about 60 s ahead of the playhead.
2. **Detection** (`SmartSpeedPlanner.swift`, pure Swift): `SilenceDetector` streams 16-bit
   PCM with Android's rules (`SmartSpeedRules`: a frame is silent at a peak of at most 330, a silence
   is at least 0.3 s). It is a value type, so a chunk continues exactly where the last
   stopped and a silence straddling two chunks is reported once.
3. **Plan**: each silence becomes a `BoostSpan`, its middle with 150 ms kept at the base rate
   on each side (`edgeKeep`); the restore fires 50 ms earlier still (`restoreLead`), since a
   boundary callback's latency is tripled while boosted. Middles shorter than 0.1 s are
   skipped.
4. **Boost**: boundary time observers raise the player's rate to base x 3, capped at 6x (2x
   on an item whose `canPlayFastForward` is false), and drop it back before the next word. A
   restore timer runs beside the observer, so a missed boundary can never leave the book
   running fast into speech. Every pause, seek, rebuild and file advance cancels a boost
   first, and the plan is re-evaluated once the playhead has settled (boundary observers
   don't fire for seeks).

Now Playing always shows the **base** rate (`nowPlayingRate`), never the boost, so the lock
screen's clock doesn't race through a silence. `SavedTimeMeter` counts each boosted span as
the book time it covered minus what the base rate would have covered in the same wall time,
clamped to what the boost could possibly save; it rides on `onProgress` as `silenceSaved`.

The pure parts (detector, planner, meter, and the lock screen's chapter-clip maths) have a
host self-check that needs no Simulator: see [Testing](testing.md#native-checks).

## Web: one Web Audio graph

`service.web.ts` implements Voice Boost only (there is no web Smart Speed):

- One `AudioContext` and one `DynamicsCompressorNode` (`VOICE_BOOST_COMPRESSOR`: threshold
  -24, knee 6, ratio 3, attack 0.005 s, release 0.25 s) to the destination, created
  **lazily inside a gesture** (the switch turned on, or a play tap with the setting on) and
  never torn down; `ctx.resume()` runs synchronously in that gesture.
- Each `<audio>` element gets **one** `MediaElementAudioSourceNode` for life (a second
  `createMediaElementSource` throws), made only while the context runs (a suspended one would
  silence the book) and only for a **same-origin** source (`isSameOrigin`): a cross-origin
  element routed through Web Audio without CORS plays zeroes. So a book from another
  signed-in server, or the Metro dev server talking to a remote API, plays unboosted; a load
  of such a source onto an already-routed element swaps in a fresh element.
- Switching off reconnects each source straight to the destination; nothing is rebuilt.

## Time saved (`src/playback/time-saved.ts`)

"Time saved" is the book seconds Smart Speed removed: the same as time saved at 1x, so speed
isn't counted. Framework-free and kept on the device:

- The native bridge's `onSilenceSaved(total)` (from `onProgress`'s `silenceSaved`, absent on
  older binaries) goes to `noteSilenceSaved(total, bookKey)` with the playing book's
  `contentKey`. `silenceDelta` counts positive growth only: the first total this JS sees is a
  base (the Android service can outlive the JS, and its total then holds savings already
  counted), and a lower total means a new engine (new base, nothing added).
- `persistedDocument('audiosilo.timeSaved')` holds `{ lifetime, books }`. Never a write per
  tick: flushed when playback halts (the store's `haltAndPersist`), when the app leaves the
  foreground, and every 30 s while it grows (an `engineTicker`, which Android's paused JS
  timers can't stop). Hydration merges what was counted before the read finished.
- `onConnectionRemoved` drops that connection's books (`withoutConnection`); the lifetime
  total stays, since it is this device's.
- `useTimeSaved()` (the speed sheet's "Saved 2h 11m") and `useBookTimeSaved(cid, libraryId,
  path)` (the book page's **Smart speed saved** row, `listeningFigures`'
  `smartSpeedSaved`).

Elsewhere: the engines and the native module are in [Playback](playback.md); CarPlay and
Android Auto, which apply the same settings, are in [Native integrations](native-integrations.md).
