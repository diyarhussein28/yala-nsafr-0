import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../i18n/tr.dart';

/// Light / dark / follow-the-phone. Read by MaterialApp in main.dart.
final ValueNotifier<ThemeMode> appThemeMode = ValueNotifier(ThemeMode.light);

/// Per-device UI preferences (language and theme), kept across launches.
class AppSettings {
  static const _storage = FlutterSecureStorage();
  static const _languageKey = 'app_language';
  static const _themeKey = 'app_theme';

  /// Restores the saved choices before the first frame so the app never flashes the
  /// wrong language or theme.
  static Future<void> load() async {
    try {
      final lang = await _storage.read(key: _languageKey);
      if (lang == 'en' || lang == 'ar') appLocale.value = Locale(lang!);
      final theme = await _storage.read(key: _themeKey);
      appThemeMode.value = ThemeMode.values.firstWhere(
        (m) => m.name == theme,
        orElse: () => ThemeMode.light,
      );
    } catch (_) {
      // Storage can be unavailable (e.g. first launch on some web browsers): keep defaults.
    }
  }

  static Future<void> setLanguage(String code) async {
    appLocale.value = Locale(code);
    try {
      await _storage.write(key: _languageKey, value: code);
    } catch (_) {}
  }

  static Future<void> setThemeMode(ThemeMode mode) async {
    appThemeMode.value = mode;
    try {
      await _storage.write(key: _themeKey, value: mode.name);
    } catch (_) {}
  }
}
