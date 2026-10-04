# Releasing the mobile app

Step-by-step for shipping Yala Nsafr to Google Play and the App Store. The server side is
covered in [`deploy/README.md`](../deploy/README.md); deploy the API first, because the
app is built against its address.

## Build settings shared by both stores

All of these are compile-time `--dart-define`s:

| Define | Required | Example | Purpose |
|---|---|---|---|
| `API_BASE_URL` | yes | `https://api.yalansafr.app/api/v1` | The API the app talks to |
| `SHARE_BASE_URL` | no | `https://api.yalansafr.app` | Host used in shared trip links (defaults to the API host) |
| `MAP_TILE_URL` | recommended | `https://tiles.example.com/{z}/{x}/{y}.png` | Map tiles. The default is the public OpenStreetMap server, whose usage policy does not allow app traffic at scale — use a provider (MapTiler, Stadia, Thunderforest, or your own) for production |

Bump `version:` in `mobile/pubspec.yaml` for every release (e.g. `1.4.0+14` — the part after
`+` is the build number and must always increase). To force old builds to update, set
`APP_MIN_VERSION` on the API; `APP_LATEST_VERSION` shows a dismissible "update available"
prompt instead.

## Android (Google Play)

1. **Create the upload key once** and keep it (and its passwords) somewhere safe — losing
   it means contacting Play support to reset it:
   ```bash
   keytool -genkey -v -keystore ~/yala-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```
2. **Create `mobile/android/key.properties`** (git-ignored):
   ```properties
   storeFile=/Users/you/yala-upload.jks
   storePassword=...
   keyAlias=upload
   keyPassword=...
   ```
   Without this file, release builds fall back to the debug key — fine for testing,
   rejected by Play.
3. **Build the bundle**:
   ```bash
   cd mobile
   flutter build appbundle --release \
     --dart-define=API_BASE_URL=https://api.yalansafr.app/api/v1 \
     --dart-define=MAP_TILE_URL=... \
     -PappLinkHost=api.yalansafr.app
   ```
   Output: `build/app/outputs/bundle/release/app-release.aab`.
4. **App links**: shared trip links (`https://HOST/t/<id>`) open the app once the API
   serves `/.well-known/assetlinks.json` with your signing certificate. In Play Console →
   *App integrity*, copy the **app signing key** SHA-256 and set it on the API:
   `ANDROID_PACKAGE=com.yalansafr.yala_nsafr`, `ANDROID_SHA256_CERT_FINGERPRINTS=AA:BB:...`.
5. **Crashlytics** needs nothing extra — `google-services.json` is already in
   `android/app`. Release builds upload crashes automatically.
6. Play Console: create the app, fill in the store listing (Arabic + English), the
   **Data safety** form (phone number, name, national ID images, precise location while a
   trip is running, payment info handled by Kashier), the content rating, and upload the
   `.aab` to an internal testing track first.

## iOS (App Store)

Requires a Mac with Xcode and an Apple Developer Program membership.

1. **Signing**: open `mobile/ios/Runner.xcworkspace` in Xcode → *Runner* target →
   *Signing & Capabilities* → choose your Team. Keep *Automatically manage signing* on.
   The bundle id is `com.yalansafr.yalaNsafr`.
2. **Capabilities** are declared in `ios/Runner/Runner.entitlements`; Xcode enables them on
   the App ID when you pick the team:
   - *Push Notifications* (`aps-environment`)
   - *Associated Domains* → `applinks:$(APP_LINK_HOST)`. `APP_LINK_HOST` is a build
     setting on the Runner target (default `api.yalansafr.app`); change it there if the
     API lives elsewhere.
   - *Background Modes* (location updates, remote notifications) are already in
     `Info.plist`.
3. **Push (FCM → APNs)**: in the Apple Developer portal create an **APNs Auth Key**
   (.p8), then upload it in Firebase Console → Project settings → Cloud Messaging → Apple
   app configuration. Without it iOS devices never receive notifications.
4. **Universal links**: set `IOS_TEAM_ID` (10 characters, from the developer portal) on
   the API so `/.well-known/apple-app-site-association` lists the app.
5. **Build and upload**:
   ```bash
   cd mobile
   flutter build ipa --release \
     --dart-define=API_BASE_URL=https://api.yalansafr.app/api/v1 \
     --dart-define=MAP_TILE_URL=...
   ```
   Then upload `build/ios/ipa/*.ipa` with Xcode's Organizer or Apple's *Transporter* app,
   and release to TestFlight before submitting for review.
6. **App Review notes**: give the reviewer a demo account. The API's OTP is delivered by
   SMS, so either whitelist a review phone number with a fixed code on the server or run
   a review build against a staging API seeded with `npm run seed` (`+201000000020` is a
   passenger, `+201000000010` a verified driver). Explain that location is used only while
   a driver is running a trip, to show the car to its passengers.

> If a local build fails with `resource fork, Finder information, or similar detritus not
> allowed`, the project sits in a folder synced by iCloud Drive (Documents/Desktop), which
> adds extended attributes Xcode's code signing rejects. Build from a folder outside
> iCloud, or run `xattr -cr mobile` first.

## Before every release

- `cd mobile && flutter analyze && flutter test` (CI runs both)
- Smoke-test on a real device in both languages (Profile → Settings → Language) and in
  dark mode: sign in, search, book with card and wallet, post a trip, live tracking with
  the screen locked, SOS, open a dispute.
- Check the API's `GET /api/v1/health/app-config` returns the versions you expect.
