import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import '../../../../core/constants/egypt_cities.dart';
import '../../../../shared/widgets/map_point_picker.dart';
import '../../../../core/utils/format.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/models/trip.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../providers/trips_provider.dart';
import '../../../../core/i18n/tr.dart';

const _cities = [
  'القاهرة',
  'الإسكندرية',
  'الجيزة',
  'أسوان',
  'الأقصر',
  'الغردقة',
  'شرم الشيخ',
  'بورسعيد',
  'الإسماعيلية',
  'السويس',
  'المنصورة',
  'طنطا',
  'الزقازيق',
  'أسيوط',
  'سوهاج',
  'المنيا',
  'بني سويف',
  'الفيوم',
  'دمياط',
  'كفر الشيخ',
];

const _cityAreas = <String, List<String>>{
  'القاهرة': [
    'مدينة نصر',
    'المعادي',
    'التجمع الخامس',
    'المهندسين',
    'الزمالك',
    'الدقي',
    'شبرا',
    'وسط البلد',
    'مصر الجديدة',
    'الهرم',
    'المطرية',
    'حدائق القبة',
    'عين شمس',
    'حلوان',
  ],
  'الجيزة': [
    'الشيخ زايد',
    '6 أكتوبر',
    'الدقي',
    'المهندسين',
    'الهرم',
    'فيصل',
    'إمبابة',
    'البدرشين',
    'أبو النمرس',
  ],
  'الإسكندرية': [
    'سيدي جابر',
    'سموحة',
    'المنتزه',
    'العجمي',
    'الرمل',
    'المعمورة',
    'ستانلي',
    'بكوس',
    'محطة الرمل',
    'الميناء',
  ],
  'الغردقة': [
    'الهضبة',
    'الكورنيش',
    'المارينا',
    'الممشى',
    'الدهار',
    'سيتى سنتر',
  ],
  'شرم الشيخ': ['نعمة باي', 'شرم القديم', 'الميراج', 'رأس نصراني', 'هيلتون'],
  'المنصورة': ['المدينة', 'ميت غمر', 'طلخا', 'المنزلة'],
  'طنطا': ['وسط البلد', 'زفتى', 'السنطة'],
  'بورسعيد': ['البحيرة', 'العرب', 'الشرق', 'الضواحي'],
};

const _otherChip = 'أخرى';

class PostTripScreen extends ConsumerStatefulWidget {
  final Trip? editTrip;
  const PostTripScreen({super.key, this.editTrip});

  bool get isEditing => editTrip != null;

  @override
  ConsumerState<PostTripScreen> createState() => _PostTripScreenState();
}

class _PostTripScreenState extends ConsumerState<PostTripScreen> {
  final _formKey = GlobalKey<FormState>();
  String? _from;
  String? _to;
  String? _fromArea;
  String? _toArea;
  final _fromAreaCtrl = TextEditingController();
  final _toAreaCtrl = TextEditingController();
  late DateTime _departure;
  late int _seats;
  final _priceCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  late bool _womenOnly;
  // Intermediate cities, in driving order
  final List<String> _stops = [];
  // Weekly repeat (new trips only); weekdays use the API's 0 = Sunday … 6 = Saturday
  bool _repeat = false;
  final Set<int> _repeatDays = {};
  int _repeatWeeks = 4;
  // Exact meeting / drop-off points chosen on the map (optional)
  LatLng? _pickupPoint;
  LatLng? _dropoffPoint;

  Future<void> _pickPoint({required bool pickup}) async {
    final city = pickup ? _from : _to;
    final initial = (pickup ? _pickupPoint : _dropoffPoint) ??
        egyptCityCenters[city] ??
        const LatLng(30.0444, 31.2357);
    final point = await Navigator.of(context).push<LatLng>(MaterialPageRoute(
      builder: (_) => MapPointPicker(
        title: pickup ? tr('نقطة التجمع') : tr('نقطة النزول'),
        initial: initial,
      ),
    ));
    if (point != null) setState(() => pickup ? _pickupPoint = point : _dropoffPoint = point);
  }
  late bool _smoking;
  late bool _pets;
  late bool _ac;

  @override
  void initState() {
    super.initState();
    final t = widget.editTrip;
    _from = t?.originCity;
    _to = t?.destinationCity;
    _departure =
        t?.departureTime ?? DateTime.now().add(const Duration(hours: 2));
    _seats = t?.totalSeats ?? 3;
    _priceCtrl.text = t != null ? t.pricePerSeat.toStringAsFixed(0) : '';
    _notesCtrl.text = t?.notes ?? '';
    _womenOnly = t?.womenOnly ?? false;
    _smoking = t?.smokingAllowed ?? false;
    _pets = t?.petsAllowed ?? false;
    _ac = t?.airConditioning ?? false;

    // Restore area if editing
    if (t?.originAddress != null) {
      final areas = _cityAreas[t!.originCity] ?? [];
      if (areas.contains(t.originAddress)) {
        _fromArea = t.originAddress;
      } else {
        _fromArea = _otherChip;
        _fromAreaCtrl.text = t.originAddress!;
      }
    }
    if (t?.destinationAddress != null) {
      final areas = _cityAreas[t!.destinationCity] ?? [];
      if (areas.contains(t.destinationAddress)) {
        _toArea = t.destinationAddress;
      } else {
        _toArea = _otherChip;
        _toAreaCtrl.text = t.destinationAddress!;
      }
    }
  }

  @override
  void dispose() {
    _priceCtrl.dispose();
    _notesCtrl.dispose();
    _fromAreaCtrl.dispose();
    _toAreaCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDeparture() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _departure,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 90)),
    );
    if (d == null || !mounted) return;
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_departure),
    );
    if (t == null) return;
    setState(() {
      _departure = DateTime(d.year, d.month, d.day, t.hour, t.minute);
    });
  }

  String? _resolvedArea(String? area, TextEditingController ctrl) {
    if (area == null) return null;
    if (area == _otherChip) {
      final txt = ctrl.text.trim();
      return txt.isEmpty ? null : txt;
    }
    return area;
  }

  Future<void> _addStop() async {
    final options = _cities
        .where((c) => c != _from && c != _to && !_stops.contains(c))
        .toList();
    final picked = await showModalBottomSheet<String>(
      useRootNavigator: true,
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SizedBox(
        height: MediaQuery.of(ctx).size.height * 0.6,
        child: Column(
          children: [
            Text(
              tr('أضف محطة على الطريق'),
              style: Theme.of(ctx).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Expanded(
              child: ListView(
                children: [
                  for (final c in options)
                    ListTile(
                      leading: const Icon(Icons.location_city_rounded),
                      title: Text(c),
                      onTap: () => Navigator.pop(ctx, c),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
    if (picked != null) setState(() => _stops.add(picked));
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final body = <String, dynamic>{
      if (!widget.isEditing) 'originCity': _from,
      if (!widget.isEditing) 'destinationCity': _to,
      // Sent as UTC with an explicit "Z". A local time without an offset was read by
      // the server in its own timezone (UTC in production), shifting every trip posted
      // from Egypt by two to three hours.
      'departureTime': _departure.toUtc().toIso8601String(),
      'totalSeats': _seats,
      'pricePerSeat': double.parse(_priceCtrl.text.trim()),
      'womenOnly': _womenOnly,
      'smokingAllowed': _smoking,
      'petsAllowed': _pets,
      'airConditioning': _ac,
      'notes': _notesCtrl.text.trim(),
      if (_resolvedArea(_fromArea, _fromAreaCtrl) != null)
        'originAddress': _resolvedArea(_fromArea, _fromAreaCtrl),
      if (_resolvedArea(_toArea, _toAreaCtrl) != null)
        'destinationAddress': _resolvedArea(_toArea, _toAreaCtrl),
    };

    if (!widget.isEditing && _stops.isNotEmpty) {
      body['stops'] = List<String>.from(_stops);
    }

    if (!widget.isEditing && _repeat) {
      final days = _repeatDays.isEmpty ? {_departure.weekday % 7} : _repeatDays;
      final count = await ref.read(postTripProvider.notifier).postSeries({
        ...body,
        'repeat': {'weekdays': days.toList()..sort(), 'weeks': _repeatWeeks},
      });
      if (!mounted || count == null) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr('تم نشر {0} رحلة ضمن السلسلة الأسبوعية', [count]))),
      );
      ref.read(tripsRefreshTokenProvider.notifier).state++;
      context.go('/my-trips');
      return;
    }

    Trip? trip;
    if (widget.isEditing) {
      trip = await ref
          .read(updateTripProvider.notifier)
          .update(widget.editTrip!.id, body);
    } else {
      trip = await ref.read(postTripProvider.notifier).post(body);
    }
    if (!mounted) return;
    if (trip != null) {
      ref.read(tripsRefreshTokenProvider.notifier).state++;
      context.go('/my-trips');
    }
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<void> actionState = widget.isEditing
        ? ref.watch(updateTripProvider)
        : ref.watch(postTripProvider);
    final loading = actionState is AsyncLoading;

    String? apiError;
    if (actionState is AsyncError) apiError = actionState.error.toString();

    final depLabel = '${Fmt.relativeDay(_departure)} · ${Fmt.time(_departure)}';

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isEditing ? tr('تعديل الرحلة') : tr('نشر رحلة جديدة')),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: AppButton(
            label: widget.isEditing ? tr('حفظ التعديلات') : tr('نشر الرحلة'),
            loading: loading,
            onPressed: _submit,
          ),
        ),
      ),
      body: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        behavior: HitTestBehavior.translucent,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _SectionLabel(tr('المسار'), Icons.route_rounded),
                DropdownButtonFormField<String>(
                  initialValue: _from,
                  decoration: InputDecoration(labelText: tr('من')),
                  items: _cities
                      .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                      .toList(),
                  onChanged: widget.isEditing
                      ? null
                      : (v) => setState(() {
                          _from = v;
                          _fromArea = null;
                          _fromAreaCtrl.clear();
                        }),
                  validator: (v) => v == null ? tr('مطلوب') : null,
                ),
                if (_from != null && !widget.isEditing) ...[
                  const SizedBox(height: 8),
                  _AreaPicker(
                    city: _from!,
                    selected: _fromArea,
                    customCtrl: _fromAreaCtrl,
                    onChanged: (v) => setState(() => _fromArea = v),
                  ),
                ],
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _to,
                  decoration: InputDecoration(labelText: tr('إلى')),
                  items: _cities
                      .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                      .toList(),
                  onChanged: widget.isEditing
                      ? null
                      : (v) => setState(() {
                          _to = v;
                          _toArea = null;
                          _toAreaCtrl.clear();
                        }),
                  validator: (v) => v == null ? tr('مطلوب') : null,
                ),
                if (_to != null && !widget.isEditing) ...[
                  const SizedBox(height: 8),
                  _AreaPicker(
                    city: _to!,
                    selected: _toArea,
                    customCtrl: _toAreaCtrl,
                    onChanged: (v) => setState(() => _toArea = v),
                  ),
                ],
                if (!widget.isEditing && _from != null && _to != null) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 46)),
                          icon: Icon(_pickupPoint != null ? Icons.check_circle_rounded : Icons.add_location_rounded),
                          label: Text(_pickupPoint != null ? tr('تم تحديد التجمع') : tr('نقطة التجمع على الخريطة')),
                          onPressed: () => _pickPoint(pickup: true),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 46)),
                          icon: Icon(_dropoffPoint != null ? Icons.check_circle_rounded : Icons.flag_rounded),
                          label: Text(_dropoffPoint != null ? tr('تم تحديد النزول') : tr('نقطة النزول')),
                          onPressed: () => _pickPoint(pickup: false),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    tr('محطات على الطريق (اختياري)'),
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    tr('يقدر الركاب يركبوا أو ينزلوا في أي محطة منها'),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final (i, stop) in _stops.indexed)
                        InputChip(
                          label: Text('${i + 1}. $stop'),
                          onDeleted: () => setState(() => _stops.removeAt(i)),
                        ),
                      if (_stops.length < 5)
                        ActionChip(
                          avatar: const Icon(
                            Icons.add_location_alt_rounded,
                            size: 18,
                          ),
                          label: Text(tr('إضافة محطة')),
                          onPressed: _addStop,
                        ),
                    ],
                  ),
                ],
                _SectionLabel(tr('الموعد'), Icons.schedule_rounded),
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.event_rounded),
                    title: Text(
                      depLabel,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    subtitle: Text(Fmt.dayLong(_departure)),
                    trailing: const Icon(Icons.edit_calendar_rounded),
                    onTap: _pickDeparture,
                  ),
                ),
                if (!widget.isEditing) ...[
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _repeat,
                    onChanged: (v) => setState(() {
                      _repeat = v;
                      if (v && _repeatDays.isEmpty) {
                        _repeatDays.add(_departure.weekday % 7);
                      }
                    }),
                    title: Text(tr('كرّر الرحلة أسبوعياً')),
                    subtitle: Text(
                      tr('نفس المسار والموعد في الأيام التي تختارها'),
                    ),
                    secondary: const Icon(Icons.event_repeat_rounded),
                  ),
                  if (_repeat) ...[
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final (day, label) in [
                          (6, tr('السبت')),
                          (0, tr('الأحد')),
                          (1, tr('الاثنين')),
                          (2, tr('الثلاثاء')),
                          (3, tr('الأربعاء')),
                          (4, tr('الخميس')),
                          (5, tr('الجمعة')),
                        ])
                          FilterChip(
                            label: Text(label),
                            selected: _repeatDays.contains(day),
                            onSelected: (on) => setState(
                              () => on
                                  ? _repeatDays.add(day)
                                  : _repeatDays.remove(day),
                            ),
                          ),
                      ],
                    ),
                    Row(
                      children: [
                        Expanded(child: Text(tr('لمدة'))),
                        IconButton(
                          icon: const Icon(Icons.remove_circle_outline_rounded),
                          onPressed: _repeatWeeks > 1
                              ? () => setState(() => _repeatWeeks--)
                              : null,
                        ),
                        Text(
                          Fmt.weeks(_repeatWeeks),
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                        IconButton(
                          icon: const Icon(Icons.add_circle_outline_rounded),
                          onPressed: _repeatWeeks < 12
                              ? () => setState(() => _repeatWeeks++)
                              : null,
                        ),
                      ],
                    ),
                  ],
                ],
                _SectionLabel(tr('السعر والمقاعد'), Icons.payments_rounded),
                TextFormField(
                  controller: _priceCtrl,
                  decoration: InputDecoration(
                    labelText: tr('سعر المقعد (جنيه)'),
                    prefixIcon: const Icon(Icons.payments_rounded),
                  ),
                  keyboardType: TextInputType.number,
                  validator: (v) {
                    final n = double.tryParse(v ?? '');
                    if (n == null || n <= 0) return tr('أدخل سعراً صحيحاً');
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Text(tr('عدد المقاعد المتاحة')),
                    const Spacer(),
                    IconButton(
                      icon: const Icon(Icons.remove_circle_outline_rounded),
                      onPressed: _seats > 1
                          ? () => setState(() => _seats--)
                          : null,
                    ),
                    Text(
                      '$_seats',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.add_circle_outline_rounded),
                      onPressed: _seats < 7
                          ? () => setState(() => _seats++)
                          : null,
                    ),
                  ],
                ),
                _SectionLabel(tr('تفضيلات الرحلة'), Icons.tune_rounded),
                Card(
                  child: Column(
                    children: [
                      SwitchListTile(
                        value: _womenOnly,
                        onChanged: (v) => setState(() => _womenOnly = v),
                        title: Text(tr('رحلة نساء فقط')),
                      ),
                      SwitchListTile(
                        value: _smoking,
                        onChanged: (v) => setState(() => _smoking = v),
                        title: Text(tr('التدخين مسموح')),
                      ),
                      SwitchListTile(
                        value: _pets,
                        onChanged: (v) => setState(() => _pets = v),
                        title: Text(tr('حيوانات أليفة مسموح')),
                      ),
                      SwitchListTile(
                        value: _ac,
                        onChanged: (v) => setState(() => _ac = v),
                        title: Text(tr('تكييف هواء')),
                        secondary: const Icon(
                          Icons.ac_unit_rounded,
                          color: Colors.lightBlue,
                        ),
                      ),
                    ],
                  ),
                ),
                _SectionLabel(tr('ملاحظات'), Icons.sticky_note_2_rounded),
                TextFormField(
                  controller: _notesCtrl,
                  decoration: InputDecoration(
                    labelText: tr('ملاحظات للركاب (اختياري)'),
                    hintText:
                        tr('مثال: سأنطلق من مطار القاهرة الترمينال 2 الساعة 12 ظهراً'),
                    prefixIcon: const Icon(Icons.notes_rounded),
                    alignLabelWithHint: true,
                  ),
                  maxLines: 3,
                  minLines: 2,
                  maxLength: 500,
                ),
                if (apiError != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    apiError,
                    style: const TextStyle(color: Colors.red, fontSize: 13),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Area picker ───────────────────────────────────────────────────────────────

class _AreaPicker extends StatelessWidget {
  final String city;
  final String? selected;
  final TextEditingController customCtrl;
  final ValueChanged<String?> onChanged;

  const _AreaPicker({
    required this.city,
    required this.selected,
    required this.customCtrl,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final areas = _cityAreas[city] ?? [];
    final chips = [...areas, _otherChip];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          tr('نقطة الانطلاق/التحميل (اختياري)'),
          style: Theme.of(
            context,
          ).textTheme.labelSmall?.copyWith(color: Colors.grey[600]),
        ),
        const SizedBox(height: 6),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: chips.map((chip) {
              final isSelected = selected == chip;
              return Padding(
                padding: const EdgeInsets.only(left: 6),
                child: ChoiceChip(
                  label: Text(chip == _otherChip ? tr('أخرى') : placeName(chip), style: const TextStyle(fontSize: 12)),
                  selected: isSelected,
                  onSelected: (_) => onChanged(isSelected ? null : chip),
                  selectedColor: Theme.of(context).colorScheme.primaryContainer,
                  labelStyle: TextStyle(
                    color: isSelected
                        ? Theme.of(context).colorScheme.onPrimaryContainer
                        : null,
                    fontSize: 12,
                  ),
                ),
              );
            }).toList(),
          ),
        ),
        if (selected == _otherChip) ...[
          const SizedBox(height: 8),
          TextFormField(
            controller: customCtrl,
            decoration: InputDecoration(
              hintText: tr('اكتب نقطة الانطلاق/التحميل'),
              prefixIcon: const Icon(Icons.edit_location_alt_rounded, size: 20),
              isDense: true,
            ),
            maxLength: 100,
          ),
        ],
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  final IconData icon;
  const _SectionLabel(this.text, this.icon);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 20, bottom: 10),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 8),
          Text(text, style: Theme.of(context).textTheme.titleSmall),
        ],
      ),
    );
  }
}
