import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yala_nsafr/core/i18n/en.dart';
import 'package:yala_nsafr/core/i18n/tr.dart';

/// Every `tr('…')` call in lib/ must have an English entry with the same placeholders,
/// so switching the app to English never shows a stray Arabic string.
void main() {
  final call = RegExp(r"""\btr\(\s*'((?:[^'\\]|\\.)*)'""");
  final placeholder = RegExp(r'\{\d+\}');

  // Undo the escapes a Dart single-quoted literal can contain in our sources.
  String unescape(String s) => s.replaceAll(r'\n', '\n').replaceAll(r"\'", "'").replaceAll(r'\$', r'$');

  test('every tr() string has an English translation', () {
    final missing = <String>{};
    final mismatched = <String>{};
    var calls = 0;
    for (final file in Directory('lib').listSync(recursive: true).whereType<File>()) {
      if (!file.path.endsWith('.dart') || file.path.endsWith('i18n/en.dart')) continue;
      for (final m in call.allMatches(file.readAsStringSync())) {
        calls++;
        final key = unescape(m.group(1)!);
        final en = enStrings[key];
        if (en == null) {
          missing.add('${file.path}: $key');
        } else if (placeholder.allMatches(key).map((p) => p[0]).toSet().difference(
              placeholder.allMatches(en).map((p) => p[0]).toSet(),
            ).isNotEmpty) {
          mismatched.add(key);
        }
      }
    }
    expect(calls, greaterThan(500), reason: 'The scan should find the app\'s tr() calls');
    expect(missing, isEmpty, reason: 'Add these to lib/core/i18n/en.dart');
    expect(mismatched, isEmpty, reason: 'Placeholders differ between Arabic and English');
  });

  test('tr() fills placeholders and follows the app locale', () {
    appLocale.value = const Locale('ar');
    expect(tr('{0} كم', [12]), '12 كم');
    appLocale.value = const Locale('en');
    expect(tr('{0} كم', [12]), '12 km');
    expect(tr('نص غير مترجم'), 'نص غير مترجم');
    appLocale.value = const Locale('ar');
  });
}
