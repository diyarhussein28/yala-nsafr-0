import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_endpoints.dart';
import '../../../../core/constants/egypt_cities.dart';
import '../../../../core/i18n/tr.dart';
import '../../../../core/models/booking.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/format.dart';
import '../../../../shared/widgets/app_button.dart';

enum _PayState { waiting, confirmed, failed, timeout }

class PaymentProcessingScreen extends ConsumerStatefulWidget {
  final String bookingId;
  final String paymentUrl;

  const PaymentProcessingScreen({
    super.key,
    required this.bookingId,
    required this.paymentUrl,
  });

  @override
  ConsumerState<PaymentProcessingScreen> createState() =>
      _PaymentProcessingScreenState();
}

class _PaymentProcessingScreenState
    extends ConsumerState<PaymentProcessingScreen>
    with WidgetsBindingObserver {
  _PayState _state = _PayState.waiting;
  bool _polling = false;
  Booking? _booking;

  // Poll every 3 s for up to 5 minutes (100 attempts)
  static const _interval = Duration(seconds: 3);
  static const _maxAttempts = 100;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _openUrl();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // User returned from browser — start polling
    if (state == AppLifecycleState.resumed &&
        _state == _PayState.waiting &&
        !_polling) {
      _startPolling();
    }
  }

  Future<void> _openUrl() async {
    if (widget.paymentUrl.startsWith('mock://')) {
      // Mock mode: call backend to confirm immediately, then poll
      try {
        await ref
            .read(dioProvider)
            .post(Endpoints.bookingMockConfirm(widget.bookingId));
      } catch (_) {}
      if (mounted && !_polling) _startPolling();
      return;
    }
    final uri = Uri.parse(widget.paymentUrl);
    await launchUrl(uri, mode: LaunchMode.externalApplication);
    // Start polling immediately — don't wait for lifecycle events
    if (mounted && !_polling) _startPolling();
  }

  Future<void> _startPolling() async {
    if (_polling || _state != _PayState.waiting) return;
    _polling = true;

    for (var attempt = 0; attempt < _maxAttempts; attempt++) {
      if (!mounted || _state != _PayState.waiting) break;

      try {
        final res = await ref
            .read(dioProvider)
            .get(Endpoints.bookingById(widget.bookingId));
        final data = res.data as Map<String, dynamic>;
        final status = data['status'] as String?;

        if (status == 'confirmed' || status == 'pending_driver_approval') {
          Booking? booking;
          try {
            booking = Booking.fromJson(data);
          } catch (_) {}
          if (mounted) {
            setState(() {
              _booking = booking;
              _state = _PayState.confirmed;
            });
          }
          _polling = false;
          return;
        }

        if (status == 'cancelled' || status == 'refunded') {
          if (mounted) setState(() => _state = _PayState.failed);
          _polling = false;
          return;
        }
      } catch (_) {
        // Network error — keep trying
      }

      await Future.delayed(_interval);
    }

    if (mounted && _state == _PayState.waiting) {
      setState(() => _state = _PayState.timeout);
    }
    _polling = false;
  }

  Future<void> _retryPoll() async {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(tr('جاري التحقق من حالة الدفع...')),
          duration: const Duration(seconds: 3),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
    setState(() {
      _state = _PayState.waiting;
      _polling = false;
    });
    _startPolling();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (_state == _PayState.confirmed) return;
        final leave = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: Text(tr('هل تريد المغادرة؟')),
            content: Text(
                tr('الدفع لم يكتمل بعد. يمكنك مراجعة حجوزاتك لاحقاً.')),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: Text(tr('متابعة الدفع'))),
              TextButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: Text(tr('مغادرة')),
              ),
            ],
          ),
        );
        if ((leave ?? false) && context.mounted) context.go('/my-bookings');
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(_state == _PayState.confirmed ? tr('تم الدفع') : tr('تأكيد الدفع')),
          automaticallyImplyLeading: false,
        ),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: switch (_state) {
              _PayState.waiting => _WaitingView(
                  onReopen: _openUrl,
                  onCheckNow: _retryPoll,
                ),
              _PayState.confirmed => _ConfirmedView(
                  booking: _booking,
                  onGoBookings: () => context.go('/my-bookings'),
                ),
              _PayState.timeout => _TimeoutView(
                  onRetry: _retryPoll,
                  onReopen: _openUrl,
                  onGoBookings: () => context.go('/my-bookings'),
                ),
              _PayState.failed => _FailedView(
                  onGoBookings: () => context.go('/my-bookings'),
                ),
            },
          ),
        ),
      ),
    );
  }
}

// ── State views ───────────────────────────────────────────────────────────────

/// Icon badge, title and message shared by every state, centred, with actions below.
class _StateLayout extends StatelessWidget {
  final Widget badge;
  final String title;
  final String message;
  final Widget? body;
  final List<Widget> actions;

  const _StateLayout({
    required this.badge,
    required this.title,
    required this.message,
    this.body,
    this.actions = const [],
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        padding: EdgeInsets.only(bottom: 16 + MediaQuery.of(context).padding.bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight - 16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 24),
              Center(child: badge),
              const SizedBox(height: 28),
              Text(
                title,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 10),
              Text(
                message,
                textAlign: TextAlign.center,
                style: TextStyle(color: context.textMuted, height: 1.55, fontSize: 15),
              ),
              if (body != null) ...[const SizedBox(height: 28), body!],
              if (actions.isNotEmpty) ...[
                const SizedBox(height: 32),
                for (var i = 0; i < actions.length; i++) ...[
                  if (i > 0) const SizedBox(height: 10),
                  actions[i],
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// A soft tinted halo around a solid circle holding the icon.
class _Badge extends StatelessWidget {
  final IconData icon;
  final Color color;
  final Widget? child;
  const _Badge({required this.icon, required this.color, this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 132,
      height: 132,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color.withValues(alpha: context.isDark ? 0.18 : 0.10),
      ),
      alignment: Alignment.center,
      child: Container(
        width: 92,
        height: 92,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: color,
          boxShadow: [BoxShadow(color: color.withValues(alpha: 0.35), blurRadius: 24, offset: const Offset(0, 10))],
        ),
        alignment: Alignment.center,
        child: child ?? Icon(icon, color: Colors.white, size: 48),
      ),
    );
  }
}

class _WaitingView extends StatelessWidget {
  final VoidCallback onReopen;
  final VoidCallback onCheckNow;
  const _WaitingView({required this.onReopen, required this.onCheckNow});

  @override
  Widget build(BuildContext context) {
    return _StateLayout(
      badge: const _Badge(
        icon: Icons.lock_clock_rounded,
        color: AppColors.primary,
        child: SizedBox(
          width: 44,
          height: 44,
          child: CircularProgressIndicator(strokeWidth: 3.5, color: Colors.white),
        ),
      ),
      title: tr('في انتظار تأكيد الدفع'),
      message: tr('أكمل عملية الدفع في المتصفح وسيتم تأكيد حجزك تلقائياً.'),
      body: const _SecureNote(),
      actions: [
        AppButton(
          label: tr('إعادة فتح صفحة الدفع'),
          outlined: true,
          icon: const Icon(Icons.open_in_browser_rounded),
          onPressed: onReopen,
        ),
        TextButton(onPressed: onCheckNow, child: Text(tr('تحققت من الدفع — تحقق الآن'))),
      ],
    );
  }
}

class _SecureNote extends StatelessWidget {
  const _SecureNote();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: context.surfaceMuted,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(Icons.verified_user_rounded, size: 20, color: context.readable(AppColors.primary)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              tr('الدفع آمن عبر Kashier. لن يُخصم المبلغ إلا بعد انتهاء الرحلة.'),
              style: TextStyle(fontSize: 13, color: context.textMuted, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}

class _ConfirmedView extends StatelessWidget {
  final Booking? booking;
  final VoidCallback onGoBookings;
  const _ConfirmedView({required this.booking, required this.onGoBookings});

  @override
  Widget build(BuildContext context) {
    final awaitingDriver = booking?.status == 'pending_driver_approval';
    return _StateLayout(
      badge: const _Badge(icon: Icons.check_rounded, color: AppColors.success),
      title: awaitingDriver ? tr('تم الدفع بنجاح') : tr('تم الحجز بنجاح!'),
      message: awaitingDriver
          ? tr('المبلغ محجوز فقط. سيُؤكَّد مقعدك عند موافقة السائق، وإن رفض يعود المبلغ إليك كاملاً.')
          : tr('مقعدك مؤكد. ستصلك تذكرة بموعد الرحلة ويمكنك مراسلة السائق من حجوزاتك.'),
      body: booking == null ? null : _BookingSummary(booking: booking!, awaitingDriver: awaitingDriver),
      actions: [
        AppButton(label: tr('عرض حجوزاتي'), onPressed: onGoBookings),
      ],
    );
  }
}

class _BookingSummary extends StatelessWidget {
  final Booking booking;
  final bool awaitingDriver;
  const _BookingSummary({required this.booking, required this.awaitingDriver});

  @override
  Widget build(BuildContext context) {
    final trip = booking.trip;
    final t = Theme.of(context).textTheme;

    Widget row(IconData icon, String label, String value, {bool strong = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 7),
          child: Row(
            children: [
              Icon(icon, size: 18, color: context.textMuted),
              const SizedBox(width: 10),
              Text(label, style: TextStyle(color: context.textMuted)),
              const Spacer(),
              Flexible(
                child: Text(
                  value,
                  textAlign: TextAlign.end,
                  style: strong
                      ? t.titleMedium?.copyWith(fontWeight: FontWeight.w800, color: context.readable(AppColors.primary))
                      : const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        );

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (trip != null) ...[
            Text(
              routeLabel(trip.originCity, trip.destinationCity),
              style: t.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text(
              '${Fmt.relativeDay(trip.departureTime)} · ${Fmt.time(trip.departureTime)}',
              style: TextStyle(color: context.textMuted),
            ),
            const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Divider(height: 1)),
          ],
          row(Icons.event_seat_rounded, tr('المقاعد'), Fmt.seats(booking.seatsCount)),
          row(
            Icons.info_outline_rounded,
            tr('الحالة'),
            awaitingDriver ? tr('في انتظار موافقة السائق') : tr('حجز مؤكد'),
          ),
          row(Icons.payments_rounded, tr('المبلغ'), Fmt.money(booking.totalAmount), strong: true),
        ],
      ),
    );
  }
}

class _TimeoutView extends StatelessWidget {
  final VoidCallback onRetry;
  final VoidCallback onReopen;
  final VoidCallback onGoBookings;
  const _TimeoutView({required this.onRetry, required this.onReopen, required this.onGoBookings});

  @override
  Widget build(BuildContext context) {
    return _StateLayout(
      badge: const _Badge(icon: Icons.hourglass_bottom_rounded, color: AppColors.warning),
      title: tr('لم يتم تأكيد الدفع بعد'),
      message: tr('إذا أتممت الدفع، قد يستغرق التأكيد بضع دقائق. تحقق من حجوزاتك.'),
      actions: [
        AppButton(label: tr('تحقق مجدداً'), icon: const Icon(Icons.refresh_rounded), onPressed: onRetry),
        AppButton(
          label: tr('إعادة فتح صفحة الدفع'),
          outlined: true,
          icon: const Icon(Icons.open_in_browser_rounded),
          onPressed: onReopen,
        ),
        TextButton(onPressed: onGoBookings, child: Text(tr('عرض حجوزاتي'))),
      ],
    );
  }
}

class _FailedView extends StatelessWidget {
  final VoidCallback onGoBookings;
  const _FailedView({required this.onGoBookings});

  @override
  Widget build(BuildContext context) {
    return _StateLayout(
      badge: const _Badge(icon: Icons.close_rounded, color: AppColors.error),
      title: tr('تم إلغاء الدفع'),
      message: tr('لم يتم الحجز. يمكنك المحاولة مجدداً من شاشة البحث.'),
      actions: [
        AppButton(label: tr('عرض حجوزاتي'), onPressed: onGoBookings),
      ],
    );
  }
}
