import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/models/trip.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/format.dart';
import '../../../../shared/widgets/ui.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/skeletons.dart';
import '../../providers/trips_provider.dart';
import '../widgets/post_trip_guard.dart';
import '../../../../core/services/analytics_service.dart';
import '../../../../core/i18n/tr.dart';
import '../../../../core/constants/egypt_cities.dart';

// ── Sort / Filter state ───────────────────────────────────────────────────────

enum _SortBy { recommended, priceAsc, timeAsc, ratingDesc }

const _sentinel = Object();

class _TripFilters {
  final double? maxPrice;
  final Set<String> periods; // morning, afternoon, evening, night
  final bool womenOnly;
  final bool verifiedOnly;

  const _TripFilters({
    this.maxPrice,
    this.periods = const {},
    this.womenOnly = false,
    this.verifiedOnly = false,
  });

  bool get hasActive =>
      maxPrice != null || periods.isNotEmpty || womenOnly || verifiedOnly;

  int get activeCount =>
      (maxPrice != null ? 1 : 0) +
      (periods.isNotEmpty ? 1 : 0) +
      (womenOnly ? 1 : 0) +
      (verifiedOnly ? 1 : 0);

  _TripFilters copyWith({
    Object? maxPrice = _sentinel,
    Set<String>? periods,
    bool? womenOnly,
    bool? verifiedOnly,
  }) =>
      _TripFilters(
        maxPrice: maxPrice == _sentinel ? this.maxPrice : maxPrice as double?,
        periods: periods ?? this.periods,
        womenOnly: womenOnly ?? this.womenOnly,
        verifiedOnly: verifiedOnly ?? this.verifiedOnly,
      );
}

// ── Screen ────────────────────────────────────────────────────────────────────

class TripResultsScreen extends ConsumerStatefulWidget {
  final TripSearchParams params;
  const TripResultsScreen({super.key, required this.params});

  @override
  ConsumerState<TripResultsScreen> createState() => _TripResultsScreenState();
}

class _TripResultsScreenState extends ConsumerState<TripResultsScreen> {
  _SortBy _sortBy = _SortBy.recommended;
  _TripFilters _filters = const _TripFilters();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(tripSearchProvider.notifier).search(widget.params);
      AnalyticsService.logSearch(
        origin: widget.params.from,
        destination: widget.params.to,
        date: widget.params.date,
        seats: widget.params.seats,
      );
    });
  }

  static String _period(Trip t) {
    final h = t.departureTime.hour;
    if (h >= 5 && h < 12) return 'morning';
    if (h >= 12 && h < 17) return 'afternoon';
    if (h >= 17 && h < 21) return 'evening';
    return 'night';
  }

  List<Trip> _apply(List<Trip> trips) {
    var result = trips.where((t) {
      if (_filters.maxPrice != null && t.pricePerSeat > _filters.maxPrice!) {
        return false;
      }
      if (_filters.periods.isNotEmpty &&
          !_filters.periods.contains(_period(t))) {
        return false;
      }
      if (_filters.womenOnly && !t.womenOnly) return false;
      if (_filters.verifiedOnly && !t.driver.driverVerified) return false;
      return true;
    }).toList();

    switch (_sortBy) {
      case _SortBy.priceAsc:
        result.sort((a, b) => a.pricePerSeat.compareTo(b.pricePerSeat));
      case _SortBy.timeAsc:
        result.sort((a, b) => a.departureTime.compareTo(b.departureTime));
      case _SortBy.ratingDesc:
        result.sort((a, b) =>
            b.driver.ratingAverage.compareTo(a.driver.ratingAverage));
      case _SortBy.recommended:
        break;
    }
    return result;
  }

  Future<void> _showFilters(List<Trip> allTrips) async {
    final maxAvailable = allTrips.isEmpty
        ? 1000.0
        : allTrips.map((t) => t.pricePerSeat).reduce((a, b) => a > b ? a : b);

    final result = await showModalBottomSheet<_TripFilters>(
      useRootNavigator: true,
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _FilterSheet(
        current: _filters,
        maxAvailable: maxAvailable,
        womenOnlySearch: widget.params.womenOnly,
      ),
    );
    if (result != null) setState(() => _filters = result);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(tripSearchProvider);
    final p = widget.params;

    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 64,
        title: Column(
          children: [
            Text(routeLabel(p.from, p.to)),
            Text(
              '${Fmt.relativeDay(p.date)} · ${Fmt.seats(p.seats)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
      body: state.when(
        loading: () =>
            SkeletonCardList(itemBuilder: () => const TripResultSkeleton()),
        error: (e, _) => EmptyState(
          icon: Icons.cloud_off_rounded,
          title: tr('تعذّر تحميل الرحلات'),
          message: '$e',
          color: AppColors.error,
          actionLabel: tr('إعادة المحاولة'),
          onAction: () => ref.read(tripSearchProvider.notifier).search(widget.params),
        ),
        data: (trips) {
          if (trips.isEmpty) {
            return _EmptySearch(
              params: widget.params,
              onChangeDate: () => context.pop(),
              onPostTrip: () => guardedPostTrip(context, ref),
            );
          }

          final displayed = _apply(trips);

          return Column(
            children: [
              _SortFilterBar(
                sortBy: _sortBy,
                filterCount: _filters.activeCount,
                onSort: (s) => setState(() => _sortBy = s),
                onFilterTap: () => _showFilters(trips),
              ),
              Expanded(
                child: displayed.isEmpty
                    ? _EmptyFiltered(
                        hasFilters: _filters.hasActive,
                        onClear: () =>
                            setState(() => _filters = const _TripFilters()),
                      )
                    : RefreshIndicator(
                        onRefresh: () => ref
                            .read(tripSearchProvider.notifier)
                            .search(widget.params),
                        child: ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                          itemCount: displayed.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 12),
                          itemBuilder: (_, i) =>
                              _TripCard(trip: displayed[i], seats: p.seats),
                        ),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }

}

// ── Sort + Filter bar ─────────────────────────────────────────────────────────

class _SortFilterBar extends StatelessWidget {
  final _SortBy sortBy;
  final int filterCount;
  final ValueChanged<_SortBy> onSort;
  final VoidCallback onFilterTap;

  const _SortFilterBar({
    required this.sortBy,
    required this.filterCount,
    required this.onSort,
    required this.onFilterTap,
  });

  @override
  Widget build(BuildContext context) {
    final sorts = [
      (_SortBy.recommended, tr('الأفضل')),
      (_SortBy.priceAsc, tr('الأرخص')),
      (_SortBy.timeAsc, tr('الأقرب وقتاً')),
      (_SortBy.ratingDesc, tr('الأعلى تقييماً')),
    ];

    return SizedBox(
      height: 58,
      child: Row(
        children: [
          Expanded(
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              itemCount: sorts.length,
              separatorBuilder: (_, __) => const SizedBox(width: 6),
              itemBuilder: (_, i) {
                final s = sorts[i];
                final selected = sortBy == s.$1;
                return ChoiceChip(
                  label: Text(s.$2),
                  selected: selected,
                  showCheckmark: false,
                  onSelected: (_) => onSort(s.$1),
                  selectedColor: Theme.of(context).colorScheme.primary,
                  labelStyle: TextStyle(
                    color: selected ? Colors.white : context.textPrimary,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                );
              },
            ),
          ),
          Stack(
            alignment: Alignment.center,
            children: [
              IconButton(
                icon: const Icon(Icons.tune_rounded),
                tooltip: tr('فلترة'),
                onPressed: onFilterTap,
              ),
              if (filterCount > 0)
                Positioned(
                  top: 6,
                  right: 6,
                  child: Container(
                    width: 16,
                    height: 16,
                    decoration: const BoxDecoration(
                      color: AppColors.secondary,
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: Text(
                        '$filterCount',
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
          const SizedBox(width: 4),
        ],
      ),
    );
  }
}

// ── Empty search state (API returned zero trips) ───────────────────────────────

class _EmptySearch extends StatelessWidget {
  final TripSearchParams params;
  final VoidCallback onChangeDate;
  final VoidCallback onPostTrip;

  const _EmptySearch({
    required this.params,
    required this.onChangeDate,
    required this.onPostTrip,
  });

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        children: [
          EmptyState(
            icon: Icons.directions_car_outlined,
            title: tr('لا توجد رحلات {0}', [Fmt.relativeDay(params.date)]),
            message: tr('لم يعلن أي سائق عن رحلة {0} ← {1} في هذا اليوم بعد. جرّب يوماً آخر، أو انشر رحلتك وشارك تكلفة الطريق.', [placeName(params.from), placeName(params.to)]),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              children: [
                AppButton(
                  label: tr('ابحث في يوم آخر'),
                  icon: const Icon(Icons.calendar_month_rounded, color: Colors.white),
                  onPressed: onChangeDate,
                ),
                const SizedBox(height: 10),
                AppButton(
                  label: tr('انشر رحلتك'),
                  outlined: true,
                  icon: const Icon(Icons.add_road_rounded),
                  onPressed: onPostTrip,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Empty filtered state ──────────────────────────────────────────────────────

class _EmptyFiltered extends StatelessWidget {
  final bool hasFilters;
  final VoidCallback onClear;
  const _EmptyFiltered({required this.hasFilters, required this.onClear});

  @override
  Widget build(BuildContext context) {
    return EmptyState(
      icon: Icons.filter_alt_off_rounded,
      title: hasFilters ? tr('لا توجد رحلات بهذه الفلاتر') : tr('لا توجد رحلات متاحة'),
      message: hasFilters ? tr('خفّف الفلاتر لرؤية رحلات أكثر.') : null,
      actionLabel: hasFilters ? tr('مسح الفلاتر') : null,
      onAction: hasFilters ? onClear : null,
    );
  }
}

// ── Filter bottom sheet ───────────────────────────────────────────────────────

class _FilterSheet extends StatefulWidget {
  final _TripFilters current;
  final double maxAvailable;
  final bool womenOnlySearch;

  const _FilterSheet({
    required this.current,
    required this.maxAvailable,
    required this.womenOnlySearch,
  });

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late double _maxPrice;
  late Set<String> _periods;
  late bool _womenOnly;
  late bool _verifiedOnly;

  @override
  void initState() {
    super.initState();
    _maxPrice = widget.current.maxPrice ?? widget.maxAvailable;
    _periods = Set.from(widget.current.periods);
    _womenOnly = widget.current.womenOnly;
    _verifiedOnly = widget.current.verifiedOnly;
  }

  _TripFilters get _result => _TripFilters(
        maxPrice: _maxPrice < widget.maxAvailable ? _maxPrice : null,
        periods: Set.unmodifiable(_periods),
        womenOnly: _womenOnly,
        verifiedOnly: _verifiedOnly,
      );

  void _reset() => setState(() {
        _maxPrice = widget.maxAvailable;
        _periods = {};
        _womenOnly = false;
        _verifiedOnly = false;
      });

  @override
  Widget build(BuildContext context) {
    final periodEntries = [
      ('morning', tr('صباحاً'), Icons.wb_sunny_outlined),
      ('afternoon', tr('ظهراً'), Icons.wb_cloudy_outlined),
      ('evening', tr('مساءً'), Icons.nights_stay_outlined),
      ('night', tr('ليلاً'), Icons.bedtime_outlined),
    ];

    final divisions =
        (widget.maxAvailable / 50).ceil().clamp(2, 200);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Handle
        Container(
          margin: const EdgeInsets.symmetric(vertical: 10),
          width: 40,
          height: 4,
          decoration: BoxDecoration(
            color: Colors.grey[300],
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        // Header
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 8, 0),
          child: Row(
            children: [
              Text(tr('فلترة النتائج'),
                  style:
                      const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              const Spacer(),
              TextButton(
                  onPressed: _reset, child: Text(tr('مسح الكل'))),
            ],
          ),
        ),
        const Divider(height: 1),
        Flexible(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Price ─────────────────────────────────────────────────
                Row(
                  children: [
                    Text(tr('الحد الأقصى للسعر'),
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        tr('{0} جنيه', [_maxPrice.toInt()]),
                        style: const TextStyle(
                            color: AppColors.primary,
                            fontWeight: FontWeight.bold,
                            fontSize: 13),
                      ),
                    ),
                  ],
                ),
                Slider(
                  value: _maxPrice.clamp(0.0, widget.maxAvailable),
                  min: 0,
                  max: widget.maxAvailable > 0 ? widget.maxAvailable : 1,
                  divisions: divisions,
                  activeColor: AppColors.primary,
                  onChanged: (v) => setState(() => _maxPrice = v),
                ),
                const SizedBox(height: 8),

                // ── Departure period ───────────────────────────────────────
                Text(tr('وقت الانطلاق'),
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: periodEntries.map((e) {
                    final selected = _periods.contains(e.$1);
                    return FilterChip(
                      avatar: Icon(e.$3,
                          size: 16,
                          color: selected ? AppColors.primary : null),
                      label: Text(e.$2),
                      selected: selected,
                      selectedColor: AppColors.primary.withValues(alpha: 0.12),
                      checkmarkColor: AppColors.primary,
                      onSelected: (v) => setState(() {
                        if (v) {
                          _periods = {..._periods, e.$1};
                        } else {
                          _periods =
                              _periods.where((p) => p != e.$1).toSet();
                        }
                      }),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 8),

                // ── Toggles ────────────────────────────────────────────────
                if (!widget.womenOnlySearch)
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(tr('نساء فقط')),
                    secondary: Icon(Icons.female_rounded,
                        color: _womenOnly
                            ? AppColors.womenOnly
                            : Colors.grey),
                    value: _womenOnly,
                    activeThumbColor: AppColors.womenOnly,
                    onChanged: (v) => setState(() => _womenOnly = v),
                  ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(tr('سائق موثّق فقط')),
                  subtitle: Text(tr('تحقق من الهوية والسيارة'),
                      style: const TextStyle(fontSize: 12)),
                  secondary: Icon(Icons.verified_rounded,
                      color: _verifiedOnly
                          ? AppColors.primary
                          : Colors.grey),
                  value: _verifiedOnly,
                  activeThumbColor: AppColors.primary,
                  onChanged: (v) => setState(() => _verifiedOnly = v),
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        ),
        const Divider(height: 1),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: FilledButton(
              style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(48)),
              onPressed: () => Navigator.pop(context, _result),
              child: Text(tr('تطبيق الفلاتر')),
            ),
          ),
        ),
      ],
    );
  }
}

// ── Trip card ─────────────────────────────────────────────────────────────────

class _TripCard extends StatelessWidget {
  final Trip trip;
  final int seats;
  const _TripCard({required this.trip, required this.seats});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final d = trip.driver;
    final seatsLeft = trip.availableSeats;
    final (seatText, seatColor) = switch (seatsLeft) {
      <= 0 => (tr('مكتملة'), context.textMuted),
      1 => (tr('آخر مقعد'), AppColors.error),
      2 => (tr('مقعدان متبقيان'), AppColors.warning),
      _ => (tr('{0} مقاعد متاحة', [seatsLeft]), AppColors.success),
    };

    return AppCard(
      padding: EdgeInsets.zero,
      onTap: () {
        AnalyticsService.logViewTrip(
          tripId: trip.id,
          origin: trip.originCity,
          destination: trip.destinationCity,
          price: trip.pricePerSeat,
        );
        context.push('/trips/${trip.id}', extra: trip);
      },
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: RouteTimeline(
                    fromCity: trip.originCity,
                    toCity: trip.destinationCity,
                    fromDetail: trip.originAddress,
                    toDetail: trip.destinationAddress,
                    fromTime: Fmt.time(trip.departureTime),
                    toTime: trip.estimatedArrivalTime != null ? Fmt.time(trip.estimatedArrivalTime!) : null,
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      trip.pricePerSeat.toStringAsFixed(0),
                      style: t.headlineSmall?.copyWith(color: scheme.primary, fontWeight: FontWeight.w800, height: 1),
                    ),
                    Text(tr('ج.م / مقعد'), style: t.labelSmall),
                    if (seats > 1) ...[
                      const SizedBox(height: 4),
                      Text(tr('الإجمالي {0}', [(trip.pricePerSeat * seats).toStringAsFixed(0)]), style: t.labelSmall),
                    ],
                  ],
                ),
              ],
            ),
          ),
          if (trip.stops.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: Row(
                children: [
                  Icon(Icons.alt_route_rounded, size: 16, color: context.textMuted),
                  const SizedBox(width: 6),
                  Expanded(child: Text(tr('عبر {0}', [Fmt.list(trip.stops)]), style: t.bodySmall)),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                StatusPill(label: seatText, color: seatColor, icon: Icons.event_seat_rounded),
                if (trip.womenOnly)
                  StatusPill(label: tr('نساء فقط'), color: AppColors.womenOnly, icon: Icons.female_rounded),
                if (trip.airConditioning)
                  StatusPill(label: tr('تكييف'), color: AppColors.info, icon: Icons.ac_unit_rounded),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: context.dividerColor)),
            ),
            child: Row(
              children: [
                UserAvatar(photoUrl: d.profilePhotoUrl, name: d.fullName, size: 38),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(child: Text(d.fullName, style: t.titleSmall, overflow: TextOverflow.ellipsis)),
                          if (d.driverVerified) ...[
                            const SizedBox(width: 4),
                            Icon(Icons.verified_rounded, size: 16, color: scheme.primary),
                          ],
                        ],
                      ),
                      if (d.vehicleLabel.isNotEmpty)
                        Text(d.vehicleLabel, style: t.bodySmall, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                if (d.ratingCount > 0)
                  Row(
                    children: [
                      const Icon(Icons.star_rounded, size: 18, color: AppColors.secondary),
                      const SizedBox(width: 2),
                      Text(d.ratingAverage.toStringAsFixed(1), style: t.titleSmall),
                      Text(' (${d.ratingCount})', style: t.bodySmall),
                    ],
                  )
                else
                  Text(tr('سائق جديد'), style: t.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
