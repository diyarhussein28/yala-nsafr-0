import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/models/trip.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/ui.dart';
import '../../../../core/utils/format.dart';
import '../../../auth/providers/auth_provider.dart';
import '../../../notifications/providers/notifications_provider.dart';
import '../widgets/post_trip_guard.dart';
import '../../../../core/i18n/tr.dart';
import '../../../../core/constants/egypt_cities.dart';

// Egyptian cities list
const _cities = [
  'القاهرة', 'الإسكندرية', 'الجيزة', 'أسوان', 'الأقصر',
  'الغردقة', 'شرم الشيخ', 'بورسعيد', 'الإسماعيلية', 'السويس',
  'المنصورة', 'طنطا', 'الزقازيق', 'أسيوط', 'سوهاج',
  'المنيا', 'بني سويف', 'الفيوم', 'دمياط', 'كفر الشيخ',
  'مرسى مطروح', 'العريش', 'الغربية', 'المنوفية',
];

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  String? _from;
  String? _to;
  DateTime _date = DateTime.now();
  int _seats = 1;
  bool _womenOnly = false;
  Timer? _unreadTimer;

  @override
  void initState() {
    super.initState();
    _unreadTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      ref.invalidate(unreadCountProvider);
    });
  }

  @override
  void dispose() {
    _unreadTimer?.cancel();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 90)),
    );
    if (d != null) setState(() => _date = d);
  }

  void _search() {
    if (_from == null || _to == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr('اختر نقطة الانطلاق والوجهة'))),
      );
      return;
    }
    context.push(
      '/trips/results',
      extra: TripSearchParams(
        from: _from!,
        to: _to!,
        date: _date,
        seats: _seats,
        womenOnly: _womenOnly,
      ),
    );
  }

  Future<void> _pickCity({required bool origin}) async {
    final picked = await showModalBottomSheet<String>(
      useRootNavigator: true,
      context: context,
      isScrollControlled: true,
      builder: (_) => _CityPicker(
        title: origin ? tr('من أين تنطلق؟') : tr('إلى أين تذهب؟'),
        exclude: origin ? _to : _from,
      ),
    );
    if (picked != null) setState(() => origin ? _from = picked : _to = picked);
  }

  void _useRoute(String from, String to) {
    setState(() {
      _from = from;
      _to = to;
    });
    _search();
  }

  String get _greeting {
    final h = DateTime.now().hour;
    if (h < 12) return tr('صباح الخير');
    if (h < 18) return tr('نهارك سعيد');
    return tr('مساء الخير');
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final firstName = (user?.fullName ?? '').split(' ').first;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final tomorrow = today.add(const Duration(days: 1));
    final selected = DateTime(_date.year, _date.month, _date.day);
    final isCustomDate = selected != today && selected != tomorrow;
    final t = Theme.of(context).textTheme;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Stack(
              children: [
                Container(
                  height: 230 + MediaQuery.of(context).padding.top,
                  decoration: const BoxDecoration(gradient: AppColors.heroGradient),
                ),
                PositionedDirectional(
                  end: -40,
                  top: 30,
                  child: Icon(Icons.route_rounded, size: 200, color: Colors.white.withValues(alpha: 0.05)),
                ),
                SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 12, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    firstName.isEmpty ? _greeting : tr('{0}، {1}', [_greeting, firstName]),
                                    style: t.titleMedium?.copyWith(color: Colors.white.withValues(alpha: 0.85)),
                                  ),
                                  Text(tr('على فين النهارده؟'), style: t.headlineMedium?.copyWith(color: Colors.white)),
                                ],
                              ),
                            ),
                            const _BellButton(),
                            IconButton(
                              icon: const Icon(Icons.add_road_rounded, color: Colors.white),
                              tooltip: tr('انشر رحلة'),
                              onPressed: () => guardedPostTrip(context, ref),
                            ),
                          ],
                        ),
                        const SizedBox(height: 22),
                        AppCard(
                          padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Stack(
                                children: [
                                  Column(
                                    children: [
                                      _RouteField(
                                        label: tr('من'),
                                        value: _from,
                                        hint: tr('مدينة الانطلاق'),
                                        icon: Icons.trip_origin_rounded,
                                        onTap: () => _pickCity(origin: true),
                                      ),
                                      Padding(
                                        padding: const EdgeInsetsDirectional.only(start: 44, end: 52),
                                        child: Divider(color: context.dividerColor),
                                      ),
                                      _RouteField(
                                        label: tr('إلى'),
                                        value: _to,
                                        hint: tr('مدينة الوصول'),
                                        icon: Icons.location_on_rounded,
                                        onTap: () => _pickCity(origin: false),
                                      ),
                                    ],
                                  ),
                                  PositionedDirectional(
                                    end: 0,
                                    top: 0,
                                    bottom: 0,
                                    child: Center(
                                      child: Material(
                                        color: Theme.of(context).colorScheme.primaryContainer,
                                        shape: const CircleBorder(),
                                        child: IconButton(
                                          icon: Icon(Icons.swap_vert_rounded,
                                              color: Theme.of(context).colorScheme.primary),
                                          tooltip: tr('عكس الاتجاه'),
                                          onPressed: (_from != null || _to != null)
                                              ? () => setState(() {
                                                    final tmp = _from;
                                                    _from = _to;
                                                    _to = tmp;
                                                  })
                                              : null,
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 14),
                              SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                child: Row(
                                  children: [
                                    _DateChip(
                                      label: tr('اليوم'),
                                      selected: selected == today,
                                      onTap: () => setState(() => _date = today),
                                    ),
                                    const SizedBox(width: 8),
                                    _DateChip(
                                      label: tr('غداً'),
                                      selected: selected == tomorrow,
                                      onTap: () => setState(() => _date = tomorrow),
                                    ),
                                    const SizedBox(width: 8),
                                    _DateChip(
                                      label: isCustomDate ? Fmt.dayLong(_date) : tr('تاريخ آخر'),
                                      icon: Icons.calendar_month_rounded,
                                      selected: isCustomDate,
                                      onTap: _pickDate,
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 14),
                              Row(
                                children: [
                                  Expanded(
                                    child: _Stepper(
                                      value: _seats,
                                      onChanged: (v) => setState(() => _seats = v),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: _WomenOnlyToggle(
                                      value: _womenOnly,
                                      onChanged: (v) => setState(() => _womenOnly = v),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              AppButton(
                                label: tr('ابحث عن رحلة'),
                                icon: const Icon(Icons.search_rounded, color: Colors.white),
                                onPressed: _search,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 8),
            sliver: SliverToBoxAdapter(child: SectionHeader(title: tr('وجهات شائعة'))),
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            sliver: SliverList.separated(
              itemCount: _popularRoutes.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (_, i) {
                final r = _popularRoutes[i];
                return AppCard(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  onTap: () => _useRoute(r.$1, r.$2),
                  child: Row(
                    children: [
                      IconBadge(icon: r.$3, color: AppColors.primary),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(routeLabel(r.$1, r.$2), style: t.titleSmall),
                            Text(r.$4, style: t.bodySmall),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right_rounded, color: context.textMuted),
                    ],
                  ),
                );
              },
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 28)),
        ],
      ),
    );
  }
}

// (from, to, icon, hint)
List<(String, String, IconData, String)> get _popularRoutes => [
  ('القاهرة', 'الإسكندرية', Icons.waves_rounded, tr('حوالي 3 ساعات على الطريق الصحراوي')),
  ('الإسكندرية', 'القاهرة', Icons.location_city_rounded, tr('رحلات يومية من الصبح بدري')),
  ('القاهرة', 'المنصورة', Icons.park_rounded, tr('حوالي ساعتين')),
  ('القاهرة', 'الغردقة', Icons.beach_access_rounded, tr('رحلات المصيف والإجازات')),
  ('القاهرة', 'أسيوط', Icons.train_rounded, tr('بديل مريح للقطار')),
];

class _RouteField extends StatelessWidget {
  final String label;
  final String? value;
  final String hint;
  final IconData icon;
  final VoidCallback onTap;

  const _RouteField({
    required this.label,
    required this.value,
    required this.hint,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.sm),
      child: Padding(
        padding: const EdgeInsetsDirectional.only(top: 8, bottom: 8, end: 52),
        child: Row(
          children: [
            Icon(icon, color: Theme.of(context).colorScheme.primary, size: 22),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: t.labelSmall),
                  Text(
                    value != null ? placeName(value) : hint,
                    style: value == null
                        ? t.titleMedium?.copyWith(color: context.textMuted, fontWeight: FontWeight.w500)
                        : t.titleMedium,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DateChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;

  const _DateChip({required this.label, required this.selected, required this.onTap, this.icon});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: selected ? scheme.primary : context.surfaceMuted,
      borderRadius: BorderRadius.circular(AppRadius.pill),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.pill),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 16, color: selected ? Colors.white : context.textMuted),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13.5,
                  color: selected ? Colors.white : context.textPrimary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  final int value;
  final ValueChanged<int> onChanged;
  const _Stepper({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    Widget btn(IconData icon, VoidCallback? onTap) => InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: Padding(
            padding: const EdgeInsets.all(6),
            child: Icon(icon, size: 20, color: onTap == null ? context.dividerColor : Theme.of(context).colorScheme.primary),
          ),
        );
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      decoration: BoxDecoration(color: context.surfaceMuted, borderRadius: BorderRadius.circular(AppRadius.md)),
      child: Row(
        children: [
          Icon(Icons.event_seat_rounded, size: 18, color: context.textMuted),
          const SizedBox(width: 6),
          Expanded(
            child: Text(Fmt.seats(value),
                style: Theme.of(context).textTheme.titleSmall),
          ),
          btn(Icons.remove_rounded, value > 1 ? () => onChanged(value - 1) : null),
          btn(Icons.add_rounded, value < 4 ? () => onChanged(value + 1) : null),
        ],
      ),
    );
  }
}

class _WomenOnlyToggle extends StatelessWidget {
  final bool value;
  final ValueChanged<bool> onChanged;
  const _WomenOnlyToggle({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: value ? AppColors.womenOnly.withValues(alpha: 0.12) : context.surfaceMuted,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.md),
        onTap: () => onChanged(!value),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
          child: Row(
            children: [
              Icon(value ? Icons.check_circle_rounded : Icons.female_rounded,
                  size: 18, color: value ? AppColors.womenOnly : context.textMuted),
              const SizedBox(width: 6),
              Expanded(
                child: Text(tr('نساء فقط'),
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          color: value ? AppColors.womenOnly : null,
                        )),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Searchable city list in a bottom sheet.
class _CityPicker extends StatefulWidget {
  final String title;
  final String? exclude;
  const _CityPicker({required this.title, this.exclude});

  @override
  State<_CityPicker> createState() => _CityPickerState();
}

class _CityPickerState extends State<_CityPicker> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final cities = _cities
        .where((c) => c != widget.exclude && (_query.isEmpty || c.contains(_query) || placeName(c).toLowerCase().contains(_query.toLowerCase())))
        .toList();
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.75,
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 14),
            TextField(
              autofocus: false,
              decoration: InputDecoration(
                hintText: tr('ابحث عن مدينة'),
                prefixIcon: const Icon(Icons.search_rounded),
              ),
              onChanged: (v) => setState(() => _query = v.trim()),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: ListView.builder(
                itemCount: cities.length,
                itemBuilder: (_, i) => ListTile(
                  leading: const Icon(Icons.location_city_rounded),
                  title: Text(placeName(cities[i]), style: Theme.of(context).textTheme.titleSmall),
                  onTap: () => Navigator.of(context).pop(cities[i]),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BellButton extends ConsumerWidget {
  const _BellButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(unreadCountProvider).valueOrNull ?? 0;

    return IconButton(
      tooltip: tr('الإشعارات'),
      icon: Badge(
        isLabelVisible: count > 0,
        label: Text(count > 9 ? '9+' : '$count'),
        child: const Icon(Icons.notifications_none_rounded, color: Colors.white),
      ),
      onPressed: () async {
        await context.push('/notifications');
        ref.invalidate(unreadCountProvider);
      },
    );
  }
}
