---
title: Smart speed and Voice boost
description: "The player's two audio effects: where each runs, the shared switches, Android's processor chain (NarrationSilenceProcessor, vendored from Media3, and our own VoiceBoostProcessor), iOS's Voice boost processing tap and why Smart speed isn't on iPhone yet, the web's Web Audio chain, and time saved."
---

Smart speed shortens the silences in narration. Voice boost compresses and lifts speech.
Both are device-wide settings, off by default, and each engine implements them its own
way. They need no wire change: both are client-side, and "time saved" is kept on the
device.

| | Android | iOS | Web |
|---|---|---|---|
| **Smart speed** | every book: a silence-skipping `AudioProcessor` | not yet (see [Why Smart speed isn't on iPhone yet](#why-smart-speed-isnt-on-iphone-yet)) | not offered |
| **Voice boost** | every book: a compressor/limiter `AudioProcessor` after Sonic | every book: an `MTAudioProcessingTap` per item | Web Audio compressor, trim and limiter, never in WebKit-only browsers, same-origin or CORS-mode sources only |

## The Voice boost preset

| | Native (Android and iOS) | Web (see [Web: one Web Audio graph](#web-one-web-audio-graph)) |
|---|---|---|
| High-pass | 80 Hz | - |
| Compressor | -20 dBFS, 3:1, 6 dB soft knee centred on the threshold, 10 ms attack, 200 ms release | the same numbers; the browser's knee runs from the threshold up |
| Make-up | +12 dB | the browser's own, plus a +1.6 dB trim: about +10 dB below the threshold |
| Limiter | -1 dBFS ceiling; attack about 1 ms (Android) or instant (iOS); release 80 ms (Android), 50 ms (iOS) | -3 dBFS, 20:1, 1 ms attack, 80 ms release (lands near -1 dBFS) |

The detector is per-sample peak, so a curve's unity point is threshold + makeup × ratio /
(ratio - 1). Here that is -2 dBFS, above narration's peaks, so the make-up is never taken
back.

Measured on real speech (active-speech RMS), with peaks held at the ceiling:

| Narration | Lift |
|---|---|
| quiet | about +10 to +11 dB |
| normal | +8.5 dB |
| loud | +5 dB |

## The settings and the UI

- `src/stores/settings.ts`: `smartSpeed` and `voiceBoost` (`PlaybackSettings`), default
  `false`. A stored value counts only when it is exactly `true`. They reach the engine
  through the store's `configure` (`PlaybackConfig.smartSpeed` and `voiceBoost`).
- `src/playback/effects.ts` holds the platform rules, pure:
  - `smartSpeedApplies(platform)` is true on Android only.
  - `supportsVoiceBoost(env?)` needs Web Audio with `createMediaElementSource` and
    `createDynamicsCompressor`, and not `isWebKitOnly(userAgent)`. WebKit-only means
    Safari and every browser on iOS and iPadOS. There, routing an `<audio>` element
    through an `AudioContext` plays choppy audio, ignores `playbackRate` and suspends on
    the lock screen (WebKit bugs 240405, 311000, 261554).
- `src/components/player/effects-model.ts` turns those rules into what each switch says:
  - `smartSpeedRow`: where `smartSpeedApplies` says no, the switch is off and disabled,
    with `notInBrowser` on the web and `notOnIphone` on iOS. On Android it shows the hint,
    and the lifetime "Saved 2h 11m" once `hasSaved` (a whole second).
  - `voiceBoostRow`: disabled with `notInThisBrowser` where the web can't run it.
- `EffectsSettings` (`effects-settings.tsx`) renders both switches as Settings `SettingRow`s.
  The speed sheet (`SpeedSheet`, under the presets) and Settings > Listening > Playback
  (`PlaybackPane`) mount the **same component**, so each setting lives in one place.
- The full player's action row adds an effects pill (`sparkles`) on tablet and desktop
  only (`wide`), because the phone row is full. The pill opens the speed sheet.
  `effectsPill` says "Saved 2h 11m" while Smart speed is on and has saved some. Otherwise
  it says "Voice boost" or "Smart speed" for whichever is on, and nothing when both are
  off. The web and iOS only ever show Voice boost.
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

Media3's `DefaultAudioProcessorChain` only accepts Media3's own (final) silence
processor, so the chain replaces it the way Pocket Casts does. There is one chain
instance per sink. The order matters:

1. Silence skipping runs first, on the book's own frames, so its skipped-frame count is
   book time. That count is what `getSkippedOutputFrameCount` reports to the sink's
   position maths, and what time saved counts.
2. Sonic does the speed.
3. Voice boost runs last, so its attack and release are real time at any speed.

- **`NarrationSilenceProcessor`** is a Kotlin port of Media3 **1.11.1**'s
  `SilenceSkippingAudioProcessor` (Apache 2.0, provenance in the file header). It is
  vendored because 1.9.0's copy sizes its "maybe silence" buffer in frames but uses it as
  bytes (androidx/media#3271). That keeps a quarter of the intended padding around each
  word in stereo. The 1.9.0 copy also fades per byte.
  - Narration defaults: threshold 330 (about -40 dBFS peak), minimum silence 300 ms,
    retention ratio 0.25, at most 1 s of silence kept, mute to 10%.
  - It also keeps a monotonic count of the book time the skipped frames were worth
    (`savedUs`). Its per-flush `skippedFrames`, which the sink reads through
    `getSkippedOutputFrameCount`, still resets on every flush, as `applySkipping` needs.
- **`VoiceBoostProcessor`** applies the native preset, then a final clip, with one gain
  for every channel (stereo-linked). It is **always active**, because changing `isActive`
  would make the sink flush (a gap and a position jump). Instead the switch moves a ~20 ms
  ramp between dry and wet. Fully off, the output is the input byte for byte.
  `queueInput` never locks, and allocates nothing beyond the base class's reusable output
  buffer.
- **Switching**: the module's `setConfig` sends the custom session command
  `audiosilo.SET_EFFECTS` (extras `smartSpeed`, `voiceBoost`).
  - The service applies them in `AudioEffects.apply`. It sets
    `player.skipSilenceEnabled`, which lets ExoPlayer drain and re-checkpoint around the
    change, and the boost's atomic flag.
  - The service saves them in the `audiosilo.player` SharedPreferences (`effects.smart`,
    `effects.boost`). A service started without JS (the car, playback resumption) then
    applies the listener's last choice.
- **Time saved**: `AudioEffects.silenceSavedSeconds` (process-wide, monotonic) rides on the
  module's `onProgress` as `silenceSaved`. Silence-skip discontinuities emit no progress of
  their own.

Both processors have JVM tests ([Testing](testing.md#native-checks)).

## iOS: a processing tap

### Voice boost (`VoiceBoostTap.swift`, `VoiceBoostDSP.swift`)

An `MTAudioProcessingTap` on each `AVPlayerItem`'s audio mix runs `VoiceBoostDSP` (pure
Swift, free of AVFoundation). It applies the 80 Hz one-pole high-pass, a soft-knee
compressor linked across channels, the make-up gain and a peak limiter at the ceiling.

It is our own arithmetic rather than `AUDynamicsProcessor` or `AUPeakLimiter`. Those need
an AudioUnit graph pulling from the tap, can't express the knee and ratio, and can
allocate on a first render. Real-time rules hold in `process`: no allocation, no locks,
no Swift reference counting. The state is a plain struct allocated in the tap's `init`
and freed in `finalize`.

**Every item gets its tap before it plays, switch on or off**
(`AudioEngine.attachVoiceBoostTaps`). Setting `audioMix` on a **playing** item rebuilds
its render chain, which is an audible ~1 s dropout on a device. So the engine sets the
mix while an item is still waiting, for the current item and the **two ahead**.

- The window slides on at each file change. It is not the whole queue AVQueuePlayer
  holds, because `loadTracks` on a streamed asset reads the file's header over HTTP, and
  a book can be a hundred files.
- Two ahead means the next item has its tap before AVQueuePlayer prerolls it.
- Playback never waits for a tap.

The switch only flips one process-wide aligned 32-bit word that the tap reads once per
render call. The DSP crossfades toward it over 20 ms. Off and ramped down, the tap leaves
the audio untouched.

The tap sits on the item's audio mix, which AVPlayer runs in the item's own timeline, before
the rate's time-pitch stage, so the attack and release are in book time.

`VoiceBoostDSP` has a host self-check that runs it on speech; it fails when speech comes up by
too little at any level ([Testing](testing.md#native-checks)).

### Why Smart speed isn't on iPhone yet

An `MTAudioProcessingTap` can't drop frames. Changing `AVPlayer`'s rate while it plays
is an audible dropout, so speeding through each silence stutters at every pause. A real
version needs a different audio path for downloaded books: an `AVAudioEngine` graph that
can skip frames. Until then:

- `smartSpeedApplies` is Android only;
- the iOS engine accepts and ignores `config.smartSpeed`;
- its `onProgress` carries no `silenceSaved`.

## Web: one Web Audio graph

`service.web.ts` implements Voice boost only:

- **One `AudioContext` and one chain** to the destination: a `DynamicsCompressorNode`
  (`VOICE_BOOST_COMPRESSOR`), a `GainNode` trim (`VOICE_BOOST_TRIM_DB`) and a second
  compressor as the limiter (`VOICE_BOOST_LIMITER`).
  - A `DynamicsCompressorNode` has no make-up setting and applies its own. The trim and
    the limiter land the chain on the native curve above the knee.
    `service.web.test.ts` recomputes the whole chain from the browser's curve.
  - The context is created **lazily inside a gesture** (the switch turned on, or a play
    tap with the setting on) and never torn down. `ctx.resume()` runs synchronously in
    that gesture.
- **Each `<audio>` element gets one `MediaElementAudioSourceNode` for life**, because a
  second `createMediaElementSource` throws. The service makes it only while the context
  runs, since a suspended one would silence the book. It also makes it only for a source
  Web Audio can hear (`routable`):
  - a **same-origin** source (`sameOrigin`, `src/lib/same-origin.ts`): the player at
    `/web`, or a downloaded copy under `/_offline/`;
  - another origin's source loaded in **CORS mode** (`corsModeFor`,
    `src/lib/cors-mode.ts`; see [the web engine](playback.md#web-engine-servicewebts)).

  Any other source (a `data:` URL) plays unboosted, because a cross-origin element routed
  through Web Audio without CORS plays zeroes. Loading such a source onto an
  already-routed element swaps in a fresh element. A book streamed from another
  signed-in server, or a dev build on Metro talking to a remote API, is boosted when that
  server's `cors_origins` lists the page's origin.
- Switching off reconnects each source straight to the destination; nothing is rebuilt.

## Time saved (`src/playback/time-saved.ts`)

"Time saved" is the book seconds Smart speed removed. That is the same as time saved at
1×, so speed isn't counted. It is kept on the device and counted outside React. Only the
two hooks at the end of this list use React.

- The native bridge's `onSilenceSaved(total)` (from `onProgress`'s `silenceSaved`) goes
  to `noteSilenceSaved(total, bookKey)` with the playing book's `contentKey`.
  `silenceDelta` counts positive growth only:
  - The first total this JS sees is a base. The Android service can outlive the JS, and
    its total then holds savings already counted.
  - A lower total only becomes the new base, adding nothing. This is a guard: Android's
    total is process-wide, so a rebuilt player never lowers it.
- `persistedDocument('audiosilo.timeSaved')` holds `{ lifetime, books }`. It is never
  written per tick. It is flushed when playback halts (the store's `haltAndPersist`), when
  the app leaves the foreground, and every 30 s while it grows. The 30 s flush is an
  `engineTicker`, which Android's paused JS timers can't stop. Hydration merges what was
  counted before the read finished.
- `onConnectionRemoved` drops that connection's books (`withoutConnection`); the lifetime
  total stays, since it is this device's.
- `useTimeSaved()` feeds the speed sheet's "Saved 2h 11m". `useBookTimeSaved(cid,
  libraryId, path)` feeds the book page's **Smart speed saved** row (`listeningFigures`'
  `smartSpeedSaved`).

The engines and the native module are in [Playback](playback.md). CarPlay and Android
Auto, which apply the same settings, are in [Native integrations](native-integrations.md).
