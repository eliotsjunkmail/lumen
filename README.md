# Lumen

Camera-based AR video field — see the world through your lens with watchable screens floating in space (Pokémon Go + Spectacles energy, focused on watching).

## Open locally

```bash
npx --yes serve .
```

Then open the printed URL (usually http://localhost:3000). Allow camera access when prompted.

## Use

1. Tap **Open lens**
2. Drag (or tilt the phone) to look around
3. Aim at a floating video screen
4. Tap **Watch** (or the screen) to play in the theater overlay
5. **Back to field** returns you to AR scanning

Demo clips live in `media/` as spatial video textures.

## Notes

- Best on a phone with rear camera + HTTPS (or localhost)
- If camera permission is denied, the AR field still works over a dark backdrop
- iOS may ask for motion permission for tilt look
- Arrow keys also pan the look direction on desktop
