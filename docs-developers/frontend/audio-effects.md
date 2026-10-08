---
title: Smart Speed and Voice Boost
description: "The player's two audio effects: where each runs, the shared switches, Android's processor chain (the vendored NarrationSilenceProcessor and VoiceBoostProcessor), iOS's Voice Boost processing tap and why Smart Speed isn't on iPhone yet, the web's Web Audio chain, and time saved."
---

Smart Speed (shorten the silences in narration) and Voice Boost (compress and lift speech)
are two device-wide settings, off by default, that each engine implements its own way.
No wire change: both are client-side, and "time saved" is kept on the device.

| | Android | iOS | Web |
|---|---|---|---|
| **Smart Speed** | every book: a silence-skipping `AudioProcessor` | **not yet** ([why](#why-smart-speed-isnt-on-iphone-yet)) | not offered |
| **Voice Boost** | every book: a compressor/limiter `AudioProcessor` after Sonic | every book: an `MTAudioProcessingTap` per item | Web Audio compressor, trim and limiter, never in WebKit-only browsers, same-origin sources only |

**The Voice Boost preset** is the same on every platform: a -20 dBFS threshold, 3:1, a 6 dB
soft knee, 10 ms attack, 200 ms release, +12 dB make-up and a -1 dBFS ceiling (plus an
80 Hz high-pass natively). The detector is per-sample peak, so a curve's unity point is
threshold + makeup x ratio / (ratio - 1); the first presets (-24 dBFS / +6 dB, then -30 /
+9) put it below narration's peaks, so the compressor took the make-up back and a device
test heard no difference. This one's unity point is -2 dBFS. Measured on real speech
(active-speech RMS): quiet narration comes up about +10 to +11 dB, normal +8.5 dB, loud
+5 dB, with peaks held at the ceiling.

## The settings and the UI

- `src/stores/settings.ts`: `smartSpeed` and `voiceBoost` (`PlaybackSettings`), default
  `false`; a stored value counts only when it is exactly `true`. They reach the engine
  through the store's `configure` (`PlaybackConfig.smartSpeed` / `voiceBoost`).
- `src/playback/effects.ts` holds the platform rules, pure: `smartSpeedApplies(platform)`
  (Android only) and
  `supportsVoiceBoost(env?)` (Web Audio with `createMediaElementSource` and
  `createDynamicsCompressor`, and not `isWebKitOnly(userAgent)`: Safari and every browser on
  iOS/iPadOS, because routing an `<audio>` element through an `AudioContext` there plays
  choppy audio, ignores `playbackRate` and suspends on the lock screen - WebKit bugs 240405,
  311000, 261554).
- `src/components/player/effects-model.ts` turns those into what each switch says:
  `smartSpeedRow` (where `smartSpeedApplies` says no: off and disabled, `notInBrowser` on
  the web, `notOnIphone` on iOS, "Not available on iPhone yet"; on Android the hint and the
  lifetime "Saved 2h 11m" once `hasSaved`, a whole second) and `voiceBoostRow` (disabled
  with `notInThisBrowser` where the web can't run it). The `smartSpeed` setting itself stays
  on iOS (iOS accepts and ignores it), so a stored value isn't lost.
- `EffectsSettings` (`effects-settings.tsx`) renders both switch rows. The speed sheet
  (`SpeedSheet`, under the presets) and Settings > Listening > Playback (`PlaybackPane`)
  mount the **same component**, so each setting lives in one place.
- The full player's action row adds an effects pill on tablet and desktop only (`wide`; the
  phone row is full): `effectsPill` says "Saved 2h 11m" while Smart Speed is on and has saved
  some, else "Voice boost" or "Smart speed" for whichever is on, nothing when both are off;
  the web and iOS only ever show Voice Boost. It opens the speed sheet. It wears `sparkles`: the
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
- **`VoiceBoostProcessor`**: an 80 Hz high-pass, a compressor with the preset above, a
  peak limiter (-1 dBFS ceiling, about 1 ms attack, 80 ms release) and a final clip; one gain for every channel (stereo-linked).
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

## iOS: a processing tap

### Voice Boost (`VoiceBoostTap.swift`, `VoiceBoostDSP.swift`)

An `MTAudioProcessingTap` on each `AVPlayerItem`'s audio mix runs `VoiceBoostDSP` (pure Swift,
free of AVFoundation): the 80 Hz one-pole high-pass, a soft-knee compressor linked across
channels, the make-up gain and a peak limiter at the ceiling, with the preset above (its
limiter releases in 50 ms). Apple's `AUDynamicsProcessor`/`AUPeakLimiter` were rejected: they
need an AudioUnit graph pulling from the tap, can't express the knee and ratio, and a first
render can allocate. Real-time rules hold in `process`: no allocation, no locks, no Swift
reference counting (the state is a plain struct allocated in the tap's `init` and freed in
`finalize`).

**Every queued item gets its tap when it is queued, switch on or off**
(`AudioEngine.attachVoiceBoostTaps`): setting `audioMix` on a **playing** item rebuilds its
render chain, an audible ~1 s dropout on a device. So the mix is set while an item is still
waiting, for the current item and the **two ahead** (a whole window, not the whole queue:
`loadTracks` on a streamed asset reads the file's header over HTTP, and a book can be a hundred
files; two ahead means the next item has its tap before AVQueuePlayer prerolls it). Playback
never waits for a tap. The switch then only flips one process-wide aligned 32-bit word that the
tap reads once per render call, and the DSP crossfades toward it over 20 ms; off and ramped
down, the tap leaves the audio untouched.

The tap sits on the item's audio mix, which AVPlayer runs in the item's own timeline, before
the rate's time-pitch stage, so the attack and release are in book time.

### Why Smart Speed isn't on iPhone yet

It was built and withdrawn after a device test. An `MTAudioProcessingTap` can't drop frames,
so the iOS design raised `AVPlayer`'s rate inside each known silence (found by reading ahead
through a downloaded file) and dropped it back before the next word. On a device, every rate
change while playing is an audible dropout, so narration stuttered at every pause. A real
version needs a different audio path for downloaded books (an `AVAudioEngine` graph that can
skip frames), not rate changes on `AVPlayer`. Until then `smartSpeedApplies` is Android only,
the iOS engine accepts and ignores `config.smartSpeed`, and its `onProgress` carries no
`silenceSaved`.

The pure parts (Voice Boost's DSP on synthetic signals and on `say` speech, and the lock
screen's chapter-clip maths) have a host self-check that needs no Simulator; it fails when
normal speech comes up by less than 6 dB. See [Testing](testing.md#native-checks).

## Web: one Web Audio graph

`service.web.ts` implements Voice Boost only (there is no web Smart Speed):

- One `AudioContext` and one chain to the destination: a `DynamicsCompressorNode`
  (`VOICE_BOOST_COMPRESSOR`: threshold -20, knee 6, ratio 3, attack 0.01 s, release 0.2 s),
  a +1.6 dB `GainNode` trim (`VOICE_BOOST_TRIM_DB`) and a second compressor as a limiter
  (`VOICE_BOOST_LIMITER`: -3 dBFS, hard knee, 20:1, 1 ms attack, 80 ms release). A
  `DynamicsCompressorNode` has no make-up setting: it applies its own (`(1 / curve(1.0))^0.6`
  in the Web Audio spec, the same in Chromium and Firefox), +6.9 dB for the compressor and
  +1.7 dB for the limiter, and its knee runs from the threshold up (the native knee is
  centred on it). The trim and the limiter's make-up land the chain on the native curve above
  the knee; below the threshold the web lifts about 10.2 dB (native 12), and a full-scale input
  ends near -1.1 dBFS. `service.web.test.ts` recomputes the whole chain from the browser's
  curve. It is created **lazily inside a gesture** (the switch turned on, or a play tap with the setting on) and
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
isn't counted. Android only for now (the only engine with Smart Speed). Framework-free and kept on the device:

- The native bridge's `onSilenceSaved(total)` (from `onProgress`'s `silenceSaved`: Android
  only, absent on iOS and on older binaries) goes to `noteSilenceSaved(total, bookKey)` with the playing book's
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
