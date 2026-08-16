# Lumen

Camera AR video field — pin named videos in the real world with GPS. Anyone nearby can discover them.

## Open locally

```bash
npx --yes serve .
```

Allow **camera**, **motion**, and **location** when prompted.

## Use

1. **Open lens**
2. **Add** a video from your phone
3. Give it a **name**
4. It’s pinned where you’re standing/aiming (GPS)
5. Others nearby load the same shared pins
6. Aim at your upload and tap **×** to delete

## Shared world (Firebase)

Uploads persist for everyone through Firebase Anonymous Auth + Storage + Firestore.

1. Create a project at https://console.firebase.google.com  
2. Add a **Web** app and copy the config into `config.js`  
3. Authentication → enable **Anonymous**  
4. Create **Firestore** and paste `firestore.rules`  
5. Create **Storage** and paste `storage.rules`  
6. Redeploy / refresh the site  

Until `config.js` is filled, naming + local placement still work on your phone, but other people won’t see your uploads.

## Notes

- Best on a phone with rear camera + HTTPS (GitHub Pages is fine)
- Nearby radius is about 2.5 km
- Demo starter clips are local-only and not shared
