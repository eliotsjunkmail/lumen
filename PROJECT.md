# SnapTrax — project specs

## Summary

**SnapTrax** is a camera-based AR web app for watching videos in the world around you. Live rear-camera view with spatial video screens (Pokémon Go look-around + Spectacles-style HUD), focused on watching rather than collecting.

## Goals

- See the real world through the device camera
- Overlay AR video screens in 3D space around the viewer
- Lock onto a screen by aiming, then watch it in an immersive theater overlay
- Work on mobile (tilt + touch) and desktop (drag / arrow keys)

## Experience flow

1. Brand entry gate → **Open lens**
2. Camera permission → full-bleed world view
3. Look around (drag / device orientation)
4. Aim reticle locks a nearby video; radar shows directions
5. **Watch** opens theater playback
6. **Back to field** returns to AR scanning

## Tech

| Layer | Choice |
| --- | --- |
| App shell | Static HTML / CSS / JS |
| 3D / AR overlay | Three.js (ES modules via CDN) |
| Camera | `getUserMedia` (environment-facing) |
| Look controls | Pointer drag + `deviceorientation` + arrow keys |
| Focus | Aim-cone selection toward view center |
| Media | Local MP4 clips in `media/` |
| Serve | Any static server (`npx serve .`) |

## Product defaults

Five spatial screens: Bloom, Pulse, Drift, Rush, Glow — placed around the viewer at eye height with gentle float motion, lime HUD accent, Syne + Manrope typography.

## Non-goals (v1)

- Persistent world anchors / GPS map
- Multiplayer
- Native app store builds
- User-uploaded video library UI

## Local run

```bash
npx --yes serve .
```

Open the printed URL (usually http://localhost:3000), allow camera, then Open lens.

## Repo layout

```text
index.html    Entry gate + AR shell
styles.css    Brand, HUD, theater
app.js        Camera, Three.js field, watch flow
media/        Demo MP4 clips
README.md     Quick start
PROJECT.md    This spec
```
