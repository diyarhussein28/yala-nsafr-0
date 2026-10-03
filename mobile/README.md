# Yala Nsafr — Mobile app

Flutter (3.32+), Riverpod, GoRouter. Arabic-first, RTL. See the
[repository README](../README.md) for the full setup.

```bash
flutter pub get
flutter run                                    # debug, talks to http://localhost:3000
adb reverse tcp:3000 tcp:3000                  # on a physical Android device
flutter build apk --release --dart-define=API_BASE_URL=https://api.example.com/api/v1
```

All card payments (trip fares and driver subscriptions) go through Kashier's hosted
checkout in a WebView; there is no native payment SDK.
