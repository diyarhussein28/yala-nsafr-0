import '../i18n/tr.dart';

/// Display formatting used across the app, in the current app language. Kept
/// dependency-free (no intl locale data to initialise): Western digits throughout.
class Fmt {
  Fmt._();

  static const _weekdaysEn = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  static const _monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  static const _weekdays = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
  static const _months = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];

  static String weekday(DateTime d) => (isEnglish ? _weekdaysEn : _weekdays)[d.weekday - 1];
  static String month(DateTime d) => (isEnglish ? _monthsEn : _months)[d.month - 1];

  /// "الأحد 5 أكتوبر" / "Sunday, 5 Oct"
  static String dayLong(DateTime d) =>
      isEnglish ? '${weekday(d)}, ${d.day} ${month(d)}' : '${weekday(d)} ${d.day} ${month(d)}';

  /// "5 أكتوبر"
  static String dayShort(DateTime d) => '${d.day} ${month(d)}';

  /// Today or tomorrow — when a relative label is worth showing next to the date
  static bool isNear(DateTime d) {
    final now = DateTime.now();
    final diff = DateTime(d.year, d.month, d.day).difference(DateTime(now.year, now.month, now.day)).inDays;
    return diff == 0 || diff == 1;
  }

  /// "اليوم" / "غداً" / "الأحد 5 أكتوبر"
  static String relativeDay(DateTime d) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(d.year, d.month, d.day);
    final diff = day.difference(today).inDays;
    if (diff == 0) return isEnglish ? 'Today' : 'اليوم';
    if (diff == 1) return isEnglish ? 'Tomorrow' : 'غداً';
    if (diff == -1) return isEnglish ? 'Yesterday' : 'أمس';
    return dayLong(d);
  }

  /// "8:30 ص" / "9:05 م"
  static String time(DateTime d) {
    final local = d.toLocal();
    final h = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final m = local.minute.toString().padLeft(2, '0');
    final am = local.hour < 12;
    return '$h:$m ${isEnglish ? (am ? 'AM' : 'PM') : (am ? 'ص' : 'م')}';
  }

  /// "180 ج.م" — no decimals unless there are piasters
  static String money(num amount) {
    final v = amount.toDouble();
    final text = v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);
    return isEnglish ? 'EGP $text' : '$text ج.م';
  }

  /// "منذ 5 دقائق" style relative time for feeds
  static String ago(DateTime d) {
    final diff = DateTime.now().difference(d.toLocal());
    if (isEnglish) {
      if (diff.inMinutes < 1) return 'just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
      if (diff.inHours < 24) return '${diff.inHours} h ago';
      if (diff.inDays < 7) return '${diff.inDays} d ago';
      return dayShort(d);
    }
    if (diff.inMinutes < 1) return 'الآن';
    if (diff.inMinutes < 60) return 'منذ ${diff.inMinutes} د';
    if (diff.inHours < 24) return 'منذ ${diff.inHours} س';
    if (diff.inDays < 7) return 'منذ ${diff.inDays} يوم';
    return dayShort(d);
  }

  /// "3 مقاعد" / "3 seats"
  static String seats(int n) {
    if (isEnglish) return n == 1 ? '1 seat' : '$n seats';
    return '$n ${n == 1 || n > 10 ? 'مقعد' : 'مقاعد'}';
  }

  /// "4 أسابيع" / "4 weeks"
  static String weeks(int n) {
    if (isEnglish) return n == 1 ? '1 week' : '$n weeks';
    return '$n ${n <= 2 || n > 10 ? 'أسبوع' : 'أسابيع'}';
  }

  /// Joins names with the locale's list separator.
  static String list(Iterable<String> items) => items.join(isEnglish ? ', ' : '، ');
}
