import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_endpoints.dart';
import '../../../../core/models/booking.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/format.dart';
import '../../../../shared/widgets/ui.dart';
import '../../providers/bookings_provider.dart';
import '../../../../shared/widgets/skeletons.dart';
import '../../../../core/i18n/tr.dart';

// ── Cancel booking dialog ─────────────────────────────────────────────────────

Future<bool> _showCancelDialog(
    BuildContext context, WidgetRef ref, Booking booking) async {
  Map<String, dynamic>? preview;
  bool loading = true;
  String? fetchError;

  bool cancelled = false;

  await showDialog(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setState) {
        if (loading) {
          fetchCancelPreview(ref, booking.id).then((p) {
            if (ctx.mounted) setState(() { preview = p; loading = false; });
          }).catchError((e) {
            if (ctx.mounted) setState(() { fetchError = '$e'; loading = false; });
          });
        }

        if (loading) {
          return const AlertDialog(
            content: Padding(
              padding: EdgeInsets.all(20),
              child: Center(child: CircularProgressIndicator()),
            ),
          );
        }

        if (fetchError != null || preview == null) {
          return AlertDialog(
            title: Text(tr('خطأ')),
            content: Text(fetchError ?? tr('تعذّر جلب تفاصيل الإلغاء')),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: Text(tr('حسناً'))),
            ],
          );
        }

        final policy = preview!['policy'] as String? ?? 'free_cancel';
        final refund = double.tryParse(preview!['refundAmount']?.toString() ?? '') ?? 0;
        final fee = double.tryParse(preview!['cancellationFee']?.toString() ?? '') ?? 0;
        final total = double.tryParse(preview!['totalAmount']?.toString() ?? '') ?? 0;
        final isCash = preview!['isCash'] as bool? ?? false;
        final canCancel = preview!['canCancel'] as bool? ?? false;

        if (!canCancel) {
          return AlertDialog(
            title: Text(tr('لا يمكن الإلغاء')),
            content:
                Text(tr('لا يمكن إلغاء هذا الحجز في الوقت الحالي.')),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: Text(tr('حسناً'))),
            ],
          );
        }

        Widget refundInfo;
        if (isCash) {
          refundInfo = _RefundBanner(
            color: Colors.green,
            icon: Icons.check_circle_outline_rounded,
            title: tr('إلغاء مجاني'),
            body: tr('دفع نقدي — لا توجد رسوم إلغاء'),
          );
        } else if (policy == 'free_cancel') {
          refundInfo = _RefundBanner(
            color: Colors.green,
            icon: Icons.check_circle_outline_rounded,
            title: tr('استرداد كامل'),
            body: tr('ستسترد {0} جنيه كاملاً', [total.toStringAsFixed(0)]),
          );
        } else if (policy == 'late_cancel') {
          refundInfo = _RefundBanner(
            color: Colors.orange,
            icon: Icons.info_outline_rounded,
            title: tr('إلغاء متأخر'),
            body: tr('ستسترد {0} جنيه\nرسوم الإلغاء: {1} جنيه', [refund.toStringAsFixed(0), fee.toStringAsFixed(0)]),
          );
        } else {
          refundInfo = _RefundBanner(
            color: Colors.red,
            icon: Icons.cancel_outlined,
            title: tr('لا يوجد استرداد'),
            body: tr('أقل من ساعتين من انطلاق الرحلة\nلن تسترد أي مبلغ'),
          );
        }

        bool confirming = false;
        return StatefulBuilder(builder: (ctx2, setState2) {
          return AlertDialog(
            title: Text(tr('إلغاء الحجز')),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                refundInfo,
                const SizedBox(height: 8),
                Text(tr('هل أنت متأكد أنك تريد إلغاء هذا الحجز؟'),
                    style: const TextStyle(fontSize: 14)),
              ],
            ),
            actions: [
              TextButton(
                onPressed: confirming ? null : () => Navigator.pop(ctx),
                child: Text(tr('تراجع')),
              ),
              FilledButton(
                style:
                    FilledButton.styleFrom(backgroundColor: Colors.red),
                onPressed: confirming
                    ? null
                    : () async {
                        setState2(() => confirming = true);
                        try {
                          await cancelBooking(ref, booking.id);
                          cancelled = true;
                          if (ctx.mounted) Navigator.pop(ctx, true);
                        } catch (e) {
                          if (ctx.mounted) {
                            setState2(() => confirming = false);
                            ScaffoldMessenger.of(ctx).showSnackBar(
                              SnackBar(content: Text('$e')),
                            );
                          }
                        }
                      },
                child: confirming
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : Text(tr('تأكيد الإلغاء')),
              ),
            ],
          );
        });
      },
    ),
  );

  return cancelled;
}

// ── Screen ────────────────────────────────────────────────────────────────────

class MyBookingsScreen extends ConsumerStatefulWidget {
  const MyBookingsScreen({super.key});

  @override
  ConsumerState<MyBookingsScreen> createState() => _MyBookingsScreenState();
}

class _MyBookingsScreenState extends ConsumerState<MyBookingsScreen> {
  static const _limit = 20;

  int _page = 1;
  List<Booking> _bookings = [];
  int _total = 0;
  bool _loading = false;
  bool _initialLoad = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool reset = false}) async {
    if (reset) _page = 1;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ref.read(dioProvider).get(
        Endpoints.myBookings,
        queryParameters: {'page': _page, 'limit': _limit},
      );
      final body = res.data;
      final list = body is Map
          ? (body['data'] as List? ?? [])
          : body as List;
      final total = body is Map
          ? (body['total'] as num?)?.toInt() ?? 0
          : list.length;
      final incoming = list
          .map((e) => Booking.fromJson(e as Map<String, dynamic>))
          .toList();
      setState(() {
        _bookings = reset ? incoming : [..._bookings, ...incoming];
        _total = total;
        _initialLoad = false;
      });
    } catch (e) {
      setState(() {
        _error = '$e';
        _initialLoad = false;
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool get _hasMore => _bookings.length < _total;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('حجوزاتي'))),
      body: _initialLoad
          ? SkeletonCardList(itemBuilder: () => const ListCardSkeleton())
          : _error != null && _bookings.isEmpty
              ? EmptyState(
                  icon: Icons.cloud_off_rounded,
                  title: tr('تعذّر تحميل حجوزاتك'),
                  message: _error,
                  color: AppColors.error,
                  actionLabel: tr('إعادة المحاولة'),
                  onAction: () => _load(reset: true),
                )
              : _bookings.isEmpty
                  ? EmptyState(
                      icon: Icons.confirmation_number_outlined,
                      title: tr('لا توجد حجوزات بعد'),
                      message: tr('ابحث عن رحلة واحجز مقعدك في دقيقة.'),
                      actionLabel: tr('ابحث عن رحلة'),
                      onAction: () => context.go('/search'),
                    )
                  : RefreshIndicator(
                      onRefresh: () => _load(reset: true),
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                        itemCount:
                            _bookings.length + (_hasMore || _loading ? 1 : 0),
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (_, i) {
                          if (i == _bookings.length) {
                            return _loading
                                ? const Center(
                                    child: Padding(
                                      padding: EdgeInsets.all(16),
                                      child: CircularProgressIndicator(),
                                    ),
                                  )
                                : Center(
                                    child: TextButton(
                                      onPressed: () {
                                        setState(() => _page++);
                                        _load();
                                      },
                                      child: Text(tr('تحميل المزيد')),
                                    ),
                                  );
                          }
                          return _BookingCard(
                            booking: _bookings[i],
                            onRefresh: () => _load(reset: true),
                          );
                        },
                      ),
                    ),
    );
  }
}

// ── Refund banner ─────────────────────────────────────────────────────────────

class _RefundBanner extends StatelessWidget {
  final Color color;
  final IconData icon;
  final String title;
  final String body;
  const _RefundBanner(
      {required this.color,
      required this.icon,
      required this.title,
      required this.body});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: TextStyle(
                        fontWeight: FontWeight.bold, color: color)),
                const SizedBox(height: 2),
                Text(body, style: const TextStyle(fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Booking card ──────────────────────────────────────────────────────────────

class _BookingCard extends ConsumerWidget {
  final Booking booking;
  final VoidCallback onRefresh;
  const _BookingCard({required this.booking, required this.onRefresh});

  bool get _tripIsActive =>
      booking.trip?.status == 'active' || booking.trip?.status == 'ongoing';

  Color get _statusColor => switch (booking.status) {
        'pending_driver_approval' => AppColors.warning,
        'pending' || 'pending_payment' => AppColors.warning,
        'in_progress' => AppColors.info,
        'confirmed' when _tripIsActive => AppColors.info,
        'confirmed' => AppColors.success,
        'completed' || 'trip_completed' => AppColors.primary,
        'cancelled' || 'cancelled_by_passenger' || 'cancelled_by_driver' => AppColors.error,
        'refunded' => AppColors.textSecondary,
        'disputed' => AppColors.womenOnly,
        _ => AppColors.textSecondary,
      };

  String get _statusLabel => switch (booking.status) {
        'pending_driver_approval' => tr('بانتظار السائق'),
        'pending' || 'pending_payment' => tr('قيد الانتظار'),
        'in_progress' => tr('الرحلة جارية'),
        'confirmed' when _tripIsActive => tr('الرحلة جارية'),
        'confirmed' => tr('مؤكد'),
        'completed' || 'trip_completed' => tr('مكتملة'),
        'cancelled' || 'cancelled_by_passenger' || 'cancelled_by_driver' => tr('ملغى'),
        'refunded' => tr('مسترد'),
        'disputed' => tr('نزاع'),
        _ => booking.status,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trip = booking.trip;
    final t = Theme.of(context).textTheme;
    final dimmed = booking.status.startsWith('cancelled') || booking.status == 'refunded';

    final actions = <Widget>[
      if (booking.isActive)
        _CardAction(
          icon: Icons.location_on_rounded,
          label: tr('تتبع السائق'),
          color: Theme.of(context).colorScheme.primary,
          onTap: () => context.push('/trips/${booking.tripId}/live', extra: {'isDriver': false}),
        ),
      if (booking.canRate)
        _CardAction(
          icon: Icons.star_rounded,
          label: tr('قيّم الرحلة'),
          color: AppColors.secondary,
          onTap: () => context.push('/bookings/rate', extra: booking),
        ),
      if (booking.canCancel)
        _CardAction(
          icon: Icons.close_rounded,
          label: tr('إلغاء الحجز'),
          color: AppColors.error,
          onTap: () async {
            final didCancel = await _showCancelDialog(context, ref, booking);
            if (didCancel && context.mounted) onRefresh();
          },
        ),
    ];

    return Opacity(
      opacity: dimmed ? 0.72 : 1,
      child: AppCard(
        padding: EdgeInsets.zero,
        onTap: () => context.push('/trips/${booking.tripId}'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 8, 0),
              child: Row(
                children: [
                  Icon(Icons.event_rounded, size: 16, color: context.textMuted),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      trip != null ? '${Fmt.relativeDay(trip.departureTime)} · ${Fmt.time(trip.departureTime)}' : '',
                      style: t.labelMedium,
                    ),
                  ),
                  StatusPill(label: _statusLabel, color: _statusColor),
                  if (booking.canDispute)
                    PopupMenuButton<String>(
                      icon: Icon(Icons.more_vert_rounded, color: context.textMuted),
                      tooltip: tr('المزيد'),
                      onSelected: (_) => context.push('/disputes/open?bookingId=${booking.id}'),
                      itemBuilder: (_) => [
                        PopupMenuItem(value: 'dispute', child: Text(tr('الإبلاغ عن مشكلة / فتح نزاع'))),
                      ],
                    )
                  else
                    const SizedBox(width: 8),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              child: trip != null
                  ? RouteTimeline(
                      dense: true,
                      fromCity: trip.originCity,
                      toCity: trip.destinationCity,
                      fromDetail: trip.originAddress,
                      toDetail: trip.destinationAddress,
                    )
                  : Text(tr('رحلة #{0}', [booking.tripId.substring(0, 8)]), style: t.titleSmall),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(border: Border(top: BorderSide(color: context.dividerColor))),
              child: Row(
                children: [
                  Icon(Icons.event_seat_rounded, size: 16, color: context.textMuted),
                  const SizedBox(width: 4),
                  Text(Fmt.seats(booking.seatsCount), style: t.bodySmall),
                  const SizedBox(width: 14),
                  Icon(
                    booking.paymentMethod == 'cash' ? Icons.payments_rounded : Icons.credit_card_rounded,
                    size: 16,
                    color: context.textMuted,
                  ),
                  const SizedBox(width: 4),
                  Text(booking.paymentMethod == 'cash' ? tr('كاش') : tr('بطاقة'), style: t.bodySmall),
                  const Spacer(),
                  Text(Fmt.money(booking.totalAmount), style: t.titleMedium),
                ],
              ),
            ),
            if (actions.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(border: Border(top: BorderSide(color: context.dividerColor))),
                child: Row(
                  children: [for (final a in actions) Expanded(child: a)],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _CardAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _CardAction({required this.icon, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 18, color: color),
      label: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w700)),
    );
  }
}
