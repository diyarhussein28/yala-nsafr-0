import 'package:flutter/widgets.dart';
import 'en.dart';

/// App language. Arabic is the source language: every UI string is written in Arabic in
/// the code and wrapped in [tr], which returns it as-is in Arabic or its English
/// translation from [enStrings]. Placeholders {0}, {1}… are filled from [args].
final ValueNotifier<Locale> appLocale = ValueNotifier(const Locale('ar'));

bool get isEnglish => appLocale.value.languageCode == 'en';

String tr(String ar, [List<Object?> args = const []]) {
  var text = isEnglish ? (enStrings[ar] ?? ar) : ar;
  for (var i = 0; i < args.length; i++) {
    text = text.replaceAll('{$i}', '${args[i] ?? ''}');
  }
  return text;
}
