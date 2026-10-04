import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:dio/dio.dart';

/// Compares the installed version with the server's version policy (/health/app-config).
/// Below the minimum: a blocking dialog with only "update". Below the latest: a one-time
/// suggestion per version. Network failures are ignored — the app must still open offline.
class UpdateChecker {
  UpdateChecker._();
  static bool _checked = false;
  static String? _dismissedFor;

  static Future<void> check(BuildContext context, Dio dio) async {
    if (_checked || kIsWeb) return;
    _checked = true;
    try {
      final info = await PackageInfo.fromPlatform();
      final res = await dio.get('/health/app-config');
      final cfg = res.data as Map<String, dynamic>;
      final current = info.version;
      final min = cfg['minSupportedVersion'] as String? ?? '0.0.0';
      final latest = cfg['latestVersion'] as String? ?? current;
      final storeUrl = defaultTargetPlatform == TargetPlatform.iOS
          ? cfg['iosStoreUrl'] as String? ?? ''
          : cfg['androidStoreUrl'] as String? ?? '';
      if (!context.mounted) return;

      if (compare(current, min) < 0) {
        await _show(context, storeUrl, force: true);
      } else if (compare(current, latest) < 0 && _dismissedFor != latest) {
        _dismissedFor = latest;
        await _show(context, storeUrl, force: false);
      }
    } catch (_) {}
  }

  /// Semantic version comparison of "x.y.z" strings
  static int compare(String a, String b) {
    List<int> parts(String v) =>
        v.split('+').first.split('.').map((p) => int.tryParse(p) ?? 0).toList()..addAll([0, 0, 0]);
    final pa = parts(a), pb = parts(b);
    for (var i = 0; i < 3; i++) {
      if (pa[i] != pb[i]) return pa[i].compareTo(pb[i]);
    }
    return 0;
  }

  static Future<void> _show(BuildContext context, String storeUrl, {required bool force}) {
    return showDialog<void>(
      context: context,
      barrierDismissible: !force,
      builder: (ctx) => PopScope(
        canPop: !force,
        child: AlertDialog(
          icon: const Icon(Icons.system_update_rounded, size: 40),
          title: Text(force ? 'يلزم تحديث التطبيق' : 'تحديث جديد متاح'),
          content: Text(force
              ? 'هذا الإصدار لم يعد مدعوماً. حدّث التطبيق للمتابعة.'
              : 'نسخة أحدث من يلا نسافر متاحة بتحسينات وإصلاحات جديدة.'),
          actions: [
            if (!force) TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('لاحقاً')),
            FilledButton(
              onPressed: storeUrl.isEmpty
                  ? null
                  : () => launchUrl(Uri.parse(storeUrl), mode: LaunchMode.externalApplication),
              child: const Text('تحديث الآن'),
            ),
          ],
        ),
      ),
    );
  }
}

