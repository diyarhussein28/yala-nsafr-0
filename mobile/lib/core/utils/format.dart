/// Arabic display formatting used across the app. Kept dependency-free (no intl locale
/// data to initialise) and consistent: Western digits, Egyptian month names.
class Fmt {
  Fmt._();

  static const _weekdays = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
  static const _months = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];

  static String weekday(DateTime d) => _weekdays[d.weekday - 1];
  static String month(DateTime d) => _months[d.month - 1];

  /// "الأحد 5 أكتوبر"
  static String dayLong(DateTime d) => '${weekday(d)} ${d.day} ${month(d)}';

  /// "5 أكتوبر"
  static String dayShort(DateTime d) => '${d.day} ${month(d)}';

  /// "اليوم" / "غداً" / "الأحد 5 أكتوبر"
  static String relativeDay(DateTime d) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(d.year, d.month, d.day);
    final diff = day.difference(today).inDays;
    if (diff == 0) return 'اليوم';
    if (diff == 1) return 'غداً';
    if (diff == -1) return 'أمس';
    return dayLong(d);
  }

  /// "8:30 ص" / "9:05 م"
  static String time(DateTime d) {
    final local = d.toLocal();
    final h = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final m = local.minute.toString().padLeft(2, '0');
    return '$h:$m ${local.hour < 12 ? 'ص' : 'م'}';
  }

  /// "180 ج.م" — no decimals unless there are piasters
  static String money(num amount) {
    final v = amount.toDouble();
    final text = v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);
    return '$text ج.م';
  }

  /// "منذ 5 دقائق" style relative time for feeds
  static String ago(DateTime d) {
    final diff = DateTime.now().difference(d.toLocal());
    if (diff.inMinutes < 1) return 'الآن';
    if (diff.inMinutes < 60) return 'منذ ${diff.inMinutes} د';
    if (diff.inHours < 24) return 'منذ ${diff.inHours} س';
    if (diff.inDays < 7) return 'منذ ${diff.inDays} يوم';
    return dayShort(d);
  }
}
