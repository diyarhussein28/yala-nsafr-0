import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/services/analytics_service.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_endpoints.dart';
import '../../../../core/models/trip.dart';
import '../../../../core/models/trip_comment.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/format.dart';
import '../../../../core/utils/status_labels.dart';
import '../../../../shared/widgets/ui.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../providers/trips_provider.dart';
import '../../../auth/providers/auth_provider.dart';
import '../../../bookings/providers/bookings_provider.dart';
import '../../../../core/i18n/tr.dart';
import '../../../../core/constants/egypt_cities.dart';

class TripDetailScreen extends ConsumerStatefulWidget {
  final String tripId;
  const TripDetailScreen({super.key, required this.tripId});

  @override
  ConsumerState<TripDetailScreen> createState() => _TripDetailScreenState();
}

class _TripDetailScreenState extends ConsumerState<TripDetailScreen> {
  int _seats = 1;
  final _commentCtrl = TextEditingController();
  bool _postingComment = false;
  bool _startingTrip = false;
  bool _endingTrip = false;

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }


  Future<void> _startTrip(String tripId) async {
    setState(() => _startingTrip = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.patch('/trips/$tripId/start');
      ref.invalidate(tripDetailProvider(widget.tripId));
      ref.invalidate(myTripsProvider);
      if (mounted) {
        context.push('/trips/$tripId/live', extra: {'isDriver': true});
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('فشل بدء الرحلة: {0}', [e]))),
        );
      }
    } finally {
      if (mounted) setState(() => _startingTrip = false);
    }
  }

  void _showAddSeatsSheet(BuildContext context, trip) {
    int extraSeats = 1;
    showModalBottomSheet(
      useRootNavigator: true,
      context: context,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2)),
              ),
              const SizedBox(height: 16),
              Text(tr('إضافة مقاعد أخرى'),
                  style: Theme.of(ctx).textTheme.titleLarge
                      ?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    icon: const Icon(Icons.remove_circle_outline_rounded,
                        size: 32),
                    onPressed: extraSeats > 1
                        ? () => setModalState(() => extraSeats--)
                        : null,
                  ),
                  const SizedBox(width: 16),
                  Text('$extraSeats',
                      style: const TextStyle(
                          fontSize: 32, fontWeight: FontWeight.bold)),
                  const SizedBox(width: 16),
                  IconButton(
                    icon: const Icon(Icons.add_circle_outline_rounded,
                        size: 32),
                    onPressed: extraSeats < trip.availableSeats
                        ? () => setModalState(() => extraSeats++)
                        : null,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                tr('الإجمالي: {0} جنيه', [(trip.pricePerSeat * extraSeats).toStringAsFixed(0)]),
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    context.push(
                      '/bookings/confirm',
                      extra: {'trip': trip, 'seats': extraSeats},
                    );
                  },
                  child: Text(tr('متابعة للدفع')),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _endTrip(String tripId) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('إنهاء الرحلة')),
        content: Text(tr('هل أنت متأكد من إنهاء الرحلة؟')),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(tr('إلغاء'))),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(tr('إنهاء'))),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _endingTrip = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.patch('/trips/$tripId/complete');
      ref.invalidate(tripDetailProvider(widget.tripId));
      ref.invalidate(myTripsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('تم إنهاء الرحلة بنجاح'))),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('فشل إنهاء الرحلة: {0}', [e]))),
        );
      }
    } finally {
      if (mounted) setState(() => _endingTrip = false);
    }
  }

  Future<void> _postComment() async {
    final text = _commentCtrl.text.trim();
    if (text.isEmpty) return;
    setState(() => _postingComment = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.post(Endpoints.tripComments(widget.tripId), data: {'body': text});
      _commentCtrl.clear();
      ref.invalidate(tripCommentsProvider(widget.tripId));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('حدث خطأ أثناء إرسال التعليق'))),
        );
      }
    } finally {
      if (mounted) setState(() => _postingComment = false);
    }
  }

  bool _viewLogged = false;

  Future<void> _shareTrip(Trip trip) async {
    AnalyticsService.logTripShared(tripId: trip.id).ignore();
    final buf = StringBuffer()
      ..writeln(tr('🚗 رحلة على يلا نسافر'))
      ..writeln()
      ..writeln(routeLabel(trip.originCity, trip.destinationCity))
      ..writeln('📅 ${Fmt.dayLong(trip.departureTime)} — ${Fmt.time(trip.departureTime)}')
      ..writeln(tr('💺 {0} مقعد متاح', [trip.availableSeats]))
      ..writeln(tr('💰 {0} للمقعد', [Fmt.money(trip.pricePerSeat)]));
    final vehicle = trip.driver.vehicleLabel;
    if (vehicle.isNotEmpty) buf.writeln('🚙 $vehicle');
    buf
      ..writeln('👤 ${trip.driver.fullName}${trip.driver.driverVerified ? tr(' (سائق موثّق)') : ''}')
      ..writeln()
      ..writeln(tr('احجز مقعدك من هنا:'))
      // Served by the API (ShareController): a preview page that opens the app
      ..write('$shareBaseUrl/t/${trip.id}');

    await Share.share(buf.toString());
  }

  @override
  Widget build(BuildContext context) {
    final tripAsync = ref.watch(tripDetailProvider(widget.tripId));
    final currentUserId = ref.watch(authProvider).user?.id;

    return Scaffold(
      appBar: AppBar(
        title: Text(tr('تفاصيل الرحلة')),
        actions: [
          tripAsync.maybeWhen(
            data: (trip) => IconButton(
              icon: const Icon(Icons.share_rounded),
              tooltip: tr('مشاركة الرحلة'),
              onPressed: () => _shareTrip(trip),
            ),
            orElse: () => const SizedBox.shrink(),
          ),
          if (currentUserId != null)
            tripAsync.maybeWhen(
              data: (trip) => IconButton(
                icon: const Icon(Icons.chat_bubble_outline_rounded),
                tooltip: tr('مجموعة الرحلة'),
                onPressed: () => context.push(
                  '/trips/${trip.id}/chat',
                  extra: {
                    'label': routeLabel(trip.originCity, trip.destinationCity),
                  },
                ),
              ),
              orElse: () => const SizedBox.shrink(),
            ),
        ],
      ),
      body: tripAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => EmptyState(
          icon: Icons.cloud_off_rounded,
          title: tr('تعذّر تحميل الرحلة'),
          message: '$e',
          color: AppColors.error,
          actionLabel: tr('إعادة المحاولة'),
          onAction: () => ref.invalidate(tripDetailProvider(widget.tripId)),
        ),
        data: (trip) {
          if (!_viewLogged) {
            _viewLogged = true;
            AnalyticsService.logViewTrip(
              tripId: trip.id,
              origin: trip.originCity,
              destination: trip.destinationCity,
              price: trip.pricePerSeat,
            ).ignore();
          }
          final isDriver = currentUserId != null && currentUserId == trip.driverId;
          final myBookings = ref.watch(myBookingsProvider).valueOrNull ?? [];
          final existingBooking = myBookings.where((b) =>
            b.tripId == trip.id &&
            b.status != 'cancelled_by_passenger' &&
            b.status != 'cancelled_by_driver' &&
            b.status != 'refunded' &&
            b.status != 'trip_completed',
          ).firstOrNull;
          return Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _RouteHeader(trip: trip),
                      const SizedBox(height: 16),
                      _DriverCard(trip: trip),
                      const SizedBox(height: 16),
                      _CoPassengersSection(tripId: widget.tripId),
                      const SizedBox(height: 16),
                      _PreferencesCard(trip: trip),
                      if (trip.notes != null && trip.notes!.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        _NotesCard(notes: trip.notes!),
                      ],
                      const SizedBox(height: 24),
                      if (isDriver) ...[
                        _SeatsSummary(trip: trip),
                        const SizedBox(height: 16),
                        OutlinedButton.icon(
                          icon: const Icon(Icons.people_rounded),
                          label: Text(tr('عرض الركاب')),
                          onPressed: () =>
                              context.push('/trips/${trip.id}/passengers'),
                        ),
                        const SizedBox(height: 8),
                        if (trip.status == 'scheduled')
                          FilledButton.icon(
                            icon: _startingTrip
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2, color: Colors.white),
                                  )
                                : const Icon(Icons.play_arrow_rounded),
                            label: Text(tr('بدء الرحلة')),
                            onPressed: _startingTrip
                                ? null
                                : () => _startTrip(trip.id),
                          )
                        else if (trip.status == 'active' ||
                            trip.status == 'ongoing') ...[
                          FilledButton.icon(
                            icon: const Icon(Icons.location_on_rounded),
                            label: Text(tr('مشاركة الموقع الحي')),
                            style: FilledButton.styleFrom(
                                backgroundColor: Colors.orange),
                            onPressed: () => context.push(
                              '/trips/${trip.id}/live',
                              extra: {'isDriver': true},
                            ),
                          ),
                          const SizedBox(height: 8),
                          OutlinedButton.icon(
                            icon: _endingTrip
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2),
                                  )
                                : const Icon(Icons.flag_rounded,
                                    color: Colors.red),
                            label: Text(tr('إنهاء الرحلة'),
                                style: const TextStyle(color: Colors.red)),
                            style: OutlinedButton.styleFrom(
                                side: const BorderSide(color: Colors.red)),
                            onPressed:
                                _endingTrip ? null : () => _endTrip(trip.id),
                          ),
                          const SizedBox(height: 8),
                          _SosButton(tripId: trip.id),
                        ],
                      ] else if (existingBooking != null) ...[
                        Builder(builder: (context) {
                          final st = bookingStatusStyle(existingBooking.status);
                          return AppCard(
                            color: st.color.withValues(alpha: 0.08),
                            border: Border.all(color: st.color.withValues(alpha: 0.3)),
                            child: Row(
                              children: [
                                IconBadge(icon: st.icon, color: st.color),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(tr('لديك حجز في هذه الرحلة'),
                                          style: Theme.of(context).textTheme.titleSmall),
                                      const SizedBox(height: 2),
                                      Text(
                                        '${st.label} · ${Fmt.seats(existingBooking.seatsCount)}',
                                        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: st.color, fontWeight: FontWeight.w600),
                                      ),
                                    ],
                                  ),
                                ),
                                TextButton(
                                  onPressed: () => context.push('/my-bookings'),
                                  child: Text(tr('حجوزاتي')),
                                ),
                              ],
                            ),
                          );
                        }),
                        if (trip.status == 'active' || trip.status == 'ongoing') ...[
                          const SizedBox(height: 10),
                          _SosButton(tripId: trip.id),
                        ],
                        if (trip.availableSeats > 0 &&
                            trip.status == 'scheduled' &&
                            (existingBooking.status == 'pending_driver_approval' ||
                             existingBooking.status == 'confirmed')) ...[
                          const SizedBox(height: 10),
                          SizedBox(
                            width: double.infinity,
                            child: OutlinedButton.icon(
                              icon: const Icon(Icons.add_circle_outline_rounded),
                              label: Text(tr('إضافة مقاعد أخرى')),
                              onPressed: () => _showAddSeatsSheet(context, trip),
                            ),
                          ),
                        ],
                      ] else if (trip.status != 'scheduled') ...[
                        // A completed booking is excluded from existingBooking above, so
                        // without this the seat picker reappears once the trip ends — and
                        // the backend rejects any booking on a non-scheduled trip.
                        _TripClosedNotice(status: trip.status),
                      ] else ...[
                        AppCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(tr('عدد المقاعد'), style: Theme.of(context).textTheme.titleSmall),
                                        Text(
                                          trip.availableSeats == 1
                                              ? tr('آخر مقعد متاح')
                                              : tr('{0} مقاعد متاحة', [trip.availableSeats]),
                                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                                color: trip.availableSeats <= 2 ? AppColors.warning : null,
                                              ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  _RoundIconButton(
                                    icon: Icons.remove_rounded,
                                    onTap: _seats > 1 ? () => setState(() => _seats--) : null,
                                  ),
                                  SizedBox(
                                    width: 44,
                                    child: Text('$_seats',
                                        textAlign: TextAlign.center,
                                        style: Theme.of(context).textTheme.headlineSmall),
                                  ),
                                  _RoundIconButton(
                                    icon: Icons.add_rounded,
                                    onTap: _seats < trip.availableSeats ? () => setState(() => _seats++) : null,
                                  ),
                                ],
                              ),
                              const Padding(
                                padding: EdgeInsets.symmetric(vertical: 14),
                                child: Divider(),
                              ),
                              Row(
                                children: [
                                  Text(tr('الإجمالي'), style: Theme.of(context).textTheme.titleSmall),
                                  const Spacer(),
                                  Text(
                                    Fmt.money(trip.pricePerSeat * _seats),
                                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                          color: Theme.of(context).colorScheme.primary,
                                          fontWeight: FontWeight.w800,
                                        ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text(
                                tr('لن يُخصم المبلغ إلا بعد انتهاء الرحلة — يُحجز فقط عند الدفع بالبطاقة.'),
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                              const SizedBox(height: 16),
                              AppButton(
                                label: tr('احجز الآن'),
                                onPressed: trip.availableSeats >= _seats
                                    ? () {
                                        AnalyticsService.logBookingStart(
                                          tripId: trip.id,
                                          seats: _seats,
                                          pricePerSeat: trip.pricePerSeat,
                                        ).ignore();
                                        context.push(
                                          '/bookings/confirm',
                                          extra: {'trip': trip, 'seats': _seats},
                                        );
                                      }
                                    : null,
                              ),
                            ],
                          ),
                        ),
                      ],
                      const SizedBox(height: 28),
                      _CommentsList(tripId: widget.tripId),
                      const SizedBox(height: 20),
                    ],
                  ),
                ),
              ),
              if (currentUserId != null)
                _CommentInputBar(
                  commentCtrl: _commentCtrl,
                  posting: _postingComment,
                  onPost: _postComment,
                ),
            ],
          );
        },
      ),
    );
  }
}

class _SeatsSummary extends StatelessWidget {
  final Trip trip;
  const _SeatsSummary({required this.trip});

  @override
  Widget build(BuildContext context) {
    final booked = trip.totalSeats - trip.availableSeats;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            _StatItem(label: tr('إجمالي'), value: '${trip.totalSeats}'),
            _StatItem(label: tr('محجوز'), value: '$booked', color: Colors.orange),
            _StatItem(label: tr('متاح'), value: '${trip.availableSeats}', color: AppColors.primary),
          ],
        ),
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;
  final Color? color;
  const _StatItem({required this.label, required this.value, this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value,
            style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.bold,
                color: color ?? Colors.black87)),
        const SizedBox(height: 2),
        Text(label, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

class _CommentsList extends ConsumerWidget {
  final String tripId;
  const _CommentsList({required this.tripId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final commentsAsync = ref.watch(tripCommentsProvider(tripId));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(tr('أسئلة وتعليقات'),
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        commentsAsync.when(
          loading: () =>
              const Center(child: CircularProgressIndicator(strokeWidth: 2)),
          error: (_, __) => const SizedBox.shrink(),
          data: (comments) => comments.isEmpty
              ? Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(tr('لا توجد تعليقات بعد. كن أول من يسأل!'),
                      style: TextStyle(color: Colors.grey[600])),
                )
              : Column(
                  children:
                      comments.map((c) => _CommentTile(comment: c)).toList(),
                ),
        ),
      ],
    );
  }
}

class _CommentInputBar extends StatelessWidget {
  final TextEditingController commentCtrl;
  final bool posting;
  final VoidCallback onPost;

  const _CommentInputBar({
    required this.commentCtrl,
    required this.posting,
    required this.onPost,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(12, 10, 12, 10 + MediaQuery.of(context).padding.bottom),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        border: Border(top: BorderSide(color: context.dividerColor)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: TextField(
              controller: commentCtrl,
              decoration: InputDecoration(
                hintText: tr('اسأل السائق أو أضف تعليقاً…'),
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              ),
              maxLines: 4,
              minLines: 1,
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 46,
            height: 46,
            child: posting
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : IconButton.filled(
                    icon: const Icon(Icons.send_rounded, color: Colors.white),
                    onPressed: onPost,
                  ),
          ),
        ],
      ),
    );
  }
}

class _RoundIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  const _RoundIconButton({required this.icon, this.onTap});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: onTap == null ? context.surfaceMuted : scheme.primaryContainer,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Icon(icon, size: 20, color: onTap == null ? context.textMuted : scheme.primary),
        ),
      ),
    );
  }
}

class _CommentTile extends StatelessWidget {
  final TripComment comment;
  const _CommentTile({required this.comment});

  @override
  Widget build(BuildContext context) {
    final name = comment.displayName;
    final t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          UserAvatar(name: name, size: 34),
          const SizedBox(width: 10),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(color: context.dividerColor),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(name, style: t.titleSmall)),
                      Text(Fmt.ago(comment.createdAt), style: t.labelSmall),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(comment.body, style: t.bodyMedium),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NotesCard extends StatelessWidget {
  final String notes;
  const _NotesCard({required this.notes});

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const IconBadge(icon: Icons.sticky_note_2_rounded, color: AppColors.secondary, size: 36),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tr('ملاحظات السائق'), style: Theme.of(context).textTheme.labelMedium),
                const SizedBox(height: 4),
                Text(notes, style: Theme.of(context).textTheme.bodyMedium),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RouteHeader extends StatelessWidget {
  final Trip trip;
  const _RouteHeader({required this.trip});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final st = tripStatusStyle(trip.status);
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.6),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
            ),
            child: Row(
              children: [
                Icon(Icons.event_rounded, size: 18, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 8),
                Expanded(child: Text(
                    Fmt.isNear(trip.departureTime)
                        ? '${Fmt.relativeDay(trip.departureTime)} · ${Fmt.dayLong(trip.departureTime)}'
                        : Fmt.dayLong(trip.departureTime),
                    style: t.titleSmall)),
                StatusPill(label: st.label, color: st.color),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: RouteTimeline(
                    fromCity: trip.originCity,
                    toCity: trip.destinationCity,
                    fromDetail: trip.originAddress,
                    toDetail: trip.stops.isNotEmpty
                        ? tr('{0}{1}عبر {2}', [trip.destinationAddress ?? '', trip.destinationAddress != null ? ' · ' : '', Fmt.list(trip.stops)])
                        : trip.destinationAddress,
                    fromTime: Fmt.time(trip.departureTime),
                    toTime: trip.estimatedArrivalTime != null ? Fmt.time(trip.estimatedArrivalTime!) : null,
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(trip.pricePerSeat.toStringAsFixed(0),
                        style: t.headlineMedium?.copyWith(
                          color: Theme.of(context).colorScheme.primary,
                          fontWeight: FontWeight.w800,
                          height: 1,
                        )),
                    Text(tr('ج.م / مقعد'), style: t.labelSmall),
                  ],
                ),
              ],
            ),
          ),
          if (trip.originLat != null && trip.originLng != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(minimumSize: const Size(double.infinity, 44)),
                icon: const Icon(Icons.navigation_rounded),
                label: Text(tr('الاتجاهات إلى نقطة التجمع')),
                onPressed: () => launchUrl(
                  Uri.parse('https://www.google.com/maps/dir/?api=1'
                      '&destination=${trip.originLat},${trip.originLng}&travelmode=driving'),
                  mode: LaunchMode.externalApplication,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _DriverCard extends StatelessWidget {
  final Trip trip;
  const _DriverCard({required this.trip});

  @override
  Widget build(BuildContext context) {
    final d = trip.driver;
    final t = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return AppCard(
      onTap: () => context.push('/users/${trip.driverId}'),
      child: Column(
        children: [
          Row(
            children: [
              UserAvatar(photoUrl: d.profilePhotoUrl, name: d.fullName, size: 54),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(child: Text(d.fullName, style: t.titleMedium, overflow: TextOverflow.ellipsis)),
                        if (d.driverVerified) ...[
                          const SizedBox(width: 4),
                          Icon(Icons.verified_rounded, size: 18, color: scheme.primary),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      d.driverVerified ? tr('سائق موثّق بالبطاقة والرخصة') : tr('السائق'),
                      style: t.bodySmall,
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: context.textMuted),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _MiniStat(
                  icon: Icons.star_rounded,
                  color: AppColors.secondary,
                  value: d.ratingCount > 0 ? d.ratingAverage.toStringAsFixed(1) : tr('جديد'),
                  label: d.ratingCount > 0 ? tr('{0} تقييم', [d.ratingCount]) : tr('لا تقييمات بعد'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _MiniStat(
                  icon: Icons.route_rounded,
                  color: AppColors.primary,
                  value: '${d.completedTripsAsDriver}',
                  label: tr('رحلة مكتملة'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _MiniStat(
                  icon: Icons.directions_car_rounded,
                  color: AppColors.info,
                  value: d.vehicleMake ?? '—',
                  label: [d.vehicleModel, d.vehicleColor].whereType<String>().join(' · '),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String value;
  final String label;
  const _MiniStat({required this.icon, required this.color, required this.value, required this.label});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(color: context.surfaceMuted, borderRadius: BorderRadius.circular(AppRadius.md)),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(width: 4),
              Flexible(child: Text(value, style: t.titleSmall, overflow: TextOverflow.ellipsis)),
            ],
          ),
          const SizedBox(height: 2),
          Text(label, style: t.labelSmall, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

class _PreferencesCard extends StatelessWidget {
  final Trip trip;
  const _PreferencesCard({required this.trip});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(tr('التفضيلات'), style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (trip.womenOnly)
                  _prefChip(
                      icon: Icons.female_rounded,
                      label: tr('نساء فقط'),
                      allowed: true),
                _prefChip(
                    icon: Icons.smoke_free_rounded,
                    label:
                        trip.smokingAllowed ? tr('التدخين مسموح') : tr('لا تدخين'),
                    allowed: trip.smokingAllowed),
                _prefChip(
                    icon: Icons.pets_rounded,
                    label:
                        trip.petsAllowed ? tr('حيوانات أليفة') : tr('لا حيوانات'),
                    allowed: trip.petsAllowed),
                _prefChip(
                    icon: Icons.luggage_rounded,
                    label: trip.luggageSize != 'none'
                        ? tr('حقائب مسموح')
                        : tr('بدون حقائب'),
                    allowed: trip.luggageSize != 'none'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _prefChip(
      {required IconData icon,
      required String label,
      required bool allowed}) {
    return Chip(
      avatar: Icon(icon, size: 16, color: allowed ? AppColors.primary : Colors.grey),
      label: Text(label, style: const TextStyle(fontSize: 12)),
    );
  }
}

// ── Co-passengers section ─────────────────────────────────────────────────────

class _CoPassengersSection extends ConsumerWidget {
  final String tripId;
  const _CoPassengersSection({required this.tripId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(coPassengersProvider(tripId));

    // Silently hide on error (403 = not a participant, no need to show anything)
    return async.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (passengers) {
        if (passengers.isEmpty) return const SizedBox.shrink();
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.people_rounded,
                        size: 18, color: AppColors.primary),
                    const SizedBox(width: 8),
                    Text(
                      tr('رفقاء الرحلة ({0})', [passengers.length]),
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                if (passengers.length <= 4)
                  Row(
                    children: passengers
                        .map((p) => _PassengerChip(p: p))
                        .toList(),
                  )
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: passengers
                        .map((p) => _PassengerChip(p: p))
                        .toList(),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _SosButton extends ConsumerStatefulWidget {
  final String tripId;
  const _SosButton({required this.tripId});

  @override
  ConsumerState<_SosButton> createState() => _SosButtonState();
}

class _SosButtonState extends ConsumerState<_SosButton> {
  bool _loading = false;

  Future<void> _triggerSos() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('تأكيد SOS')),
        content: Text(
          tr('سيتم الاتصال بالطوارئ (123) وإرسال تنبيه للسائق والإدارة فوراً.'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(tr('إلغاء')),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('SOS'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _loading = true);
    try {
      // 1. Dial emergency services immediately
      await launchUrl(Uri.parse('tel:123'));

      // 2. Notify driver and admin via backend (best-effort)
      final dio = ref.read(dioProvider);
      await dio.post('/trips/${widget.tripId}/sos');

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(tr('تم إرسال تنبيه الطوارئ. فريق الدعم في طريقه.')),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (_) {
      // SOS call still happened — swallow backend errors silently
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        icon: _loading
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: Colors.white),
              )
            : const Icon(Icons.sos_rounded),
        label: Text(tr('SOS — طوارئ')),
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.red,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12)),
        ),
        onPressed: _loading ? null : _triggerSos,
      ),
    );
  }
}

class _PassengerChip extends StatelessWidget {
  final Map<String, dynamic> p;
  const _PassengerChip({required this.p});

  @override
  Widget build(BuildContext context) {
    final firstName = p['firstName'] as String? ?? tr('راكب');
    final rating = double.tryParse(p['ratingAverage']?.toString() ?? '') ?? 0.0;
    final ratingCount = (p['ratingCount'] as num?)?.toInt() ?? 0;
    final gender = p['gender'] as String?;
    final seatsCount = (p['seatsCount'] as num?)?.toInt() ?? 1;
    final isFemale = gender == 'female';

    return GestureDetector(
      onTap: () {
        final id = p['id'] as String?;
        if (id != null && id.isNotEmpty) {
          context.push('/users/$id');
        }
      },
      child: Container(
        width: 72,
        margin: const EdgeInsets.only(left: 8),
        child: Column(
          children: [
            Stack(
              children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                  child: Text(
                    firstName.isNotEmpty ? firstName[0] : tr('؟'),
                    style: const TextStyle(
                      fontSize: 20,
                      color: AppColors.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                if (isFemale)
                  Positioned(
                    bottom: 0,
                    right: 0,
                    child: Container(
                      width: 16,
                      height: 16,
                      decoration: const BoxDecoration(
                        color: AppColors.womenOnly,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.female_rounded,
                          color: Colors.white, size: 11),
                    ),
                  ),
                if (seatsCount > 1)
                  Positioned(
                    top: 0,
                    left: 0,
                    child: Container(
                      width: 17,
                      height: 17,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade600,
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: Text(
                          '$seatsCount',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 5),
            Text(
              firstName,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
            ),
            if (ratingCount > 0)
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.star_rounded,
                      size: 11, color: Colors.amber),
                  Text(
                    rating.toStringAsFixed(1),
                    style: TextStyle(
                        fontSize: 10, color: Colors.grey[600]),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}


/// Shown instead of the seat picker once a trip is no longer bookable, so a passenger
/// is told why rather than being handed a button the backend will reject.
class _TripClosedNotice extends StatelessWidget {
  final String status;
  const _TripClosedNotice({required this.status});

  @override
  Widget build(BuildContext context) {
    final (icon, message, color) = switch (status) {
      'active' || 'ongoing' => (
          Icons.directions_car_filled_rounded,
          tr('الرحلة جارية بالفعل — لم يعد الحجز متاحاً'),
          Colors.orange,
        ),
      'completed' => (
          Icons.check_circle_outline_rounded,
          tr('انتهت هذه الرحلة'),
          Colors.grey,
        ),
      'cancelled' => (
          Icons.cancel_outlined,
          tr('تم إلغاء هذه الرحلة'),
          Colors.red,
        ),
      _ => (
          Icons.info_outline_rounded,
          tr('الحجز غير متاح على هذه الرحلة'),
          Colors.grey,
        ),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
