import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../features/auth/providers/auth_provider.dart';
import '../../providers/location_provider.dart';
import '../../providers/trips_provider.dart';
import '../../../../core/constants/egypt_cities.dart';
import '../../../../core/utils/format.dart';
import '../../../../shared/widgets/ui.dart';

class TrackTripScreen extends ConsumerWidget {
  final String tripId;
  final bool isDriver;

  const TrackTripScreen({
    super.key,
    required this.tripId,
    required this.isDriver,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return isDriver
        ? _DriverView(tripId: tripId)
        : _PassengerMap(tripId: tripId);
  }
}

// ── Driver view ────────────────────────────────────────────────────────────────

class _DriverView extends ConsumerStatefulWidget {
  final String tripId;
  const _DriverView({required this.tripId});

  @override
  ConsumerState<_DriverView> createState() => _DriverViewState();
}

class _DriverViewState extends ConsumerState<_DriverView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(driverLocationProvider(widget.tripId).notifier).start();
    });
  }

  @override
  Widget build(BuildContext context) {
    final isPosting = ref.watch(driverLocationProvider(widget.tripId));

    return Scaffold(
      appBar: AppBar(title: const Text('مشاركة الموقع')),
      floatingActionButton: _SosFab(tripId: widget.tripId),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                isPosting
                    ? Icons.location_on_rounded
                    : Icons.location_off_rounded,
                size: 88,
                color: isPosting ? AppColors.primary : Colors.grey,
              ),
              const SizedBox(height: 24),
              Text(
                isPosting
                    ? 'موقعك يُشارك مع الركاب'
                    : 'جاري تفعيل مشاركة الموقع…',
                style:
                    const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 10),
              Text(
                'يستمر الإرسال حتى لو أغلقت الشاشة أو انتقلت لتطبيق آخر،\nويتوقف تلقائياً عند إنهاء الرحلة.',
                style: TextStyle(
                    color: Colors.grey[600], fontSize: 14, height: 1.6),
                textAlign: TextAlign.center,
              ),
              if (isPosting) ...[
                const SizedBox(height: 32),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                    border:
                        Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.circle, color: AppColors.primary, size: 10),
                      SizedBox(width: 8),
                      Text('بث مباشر',
                          style: TextStyle(
                              color: AppColors.primary,
                              fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ── Passenger map ──────────────────────────────────────────────────────────────

// OpenStreetMap's public tiles are for light use only; for production pass a provider
// URL with a key, e.g. --dart-define=MAP_TILE_URL=https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=...
const _tileUrl = String.fromEnvironment(
  'MAP_TILE_URL',
  defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
);

class _PassengerMap extends ConsumerStatefulWidget {
  final String tripId;
  const _PassengerMap({required this.tripId});

  @override
  ConsumerState<_PassengerMap> createState() => _PassengerMapState();
}

class _PassengerMapState extends ConsumerState<_PassengerMap> {
  final _mapController = MapController();
  Timer? _pollTimer;
  bool _fitted = false;
  static const _distance = Distance();

  @override
  void initState() {
    super.initState();
    _pollTimer = Timer.periodic(const Duration(seconds: 30), (_) => _refresh());
  }

  void _refresh() {
    if (!mounted) return;
    ref.invalidate(tripLocationProvider(widget.tripId));
    ref.invalidate(tripTrailProvider(widget.tripId));
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _mapController.dispose();
    super.dispose();
  }

  void _fit(LatLng car, LatLng? destination, List<LatLng> path) {
    if (_fitted) return;
    _fitted = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      try {
        if (destination == null && path.length < 2) {
          _mapController.move(car, 14);
        } else {
          _mapController.fitCamera(CameraFit.bounds(
            bounds: LatLngBounds.fromPoints([car, ?destination, ...path]),
            padding: const EdgeInsets.fromLTRB(48, 48, 48, 220),
          ));
        }
      } catch (_) {}
    });
  }

  @override
  Widget build(BuildContext context) {
    final locationAsync = ref.watch(tripLocationProvider(widget.tripId));
    final trail = ref.watch(tripTrailProvider(widget.tripId)).valueOrNull ?? const [];
    final trip = ref.watch(tripDetailProvider(widget.tripId)).valueOrNull;
    final destination = trip == null
        ? null
        : (trip.destinationLat != null && trip.destinationLng != null
            ? LatLng(trip.destinationLat!, trip.destinationLng!)
            : egyptCityCenters[trip.destinationCity]);
    final t = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(
        title: Text(trip != null ? '${trip.originCity} ← ${trip.destinationCity}' : 'تتبع الرحلة'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh_rounded), tooltip: 'تحديث الآن', onPressed: _refresh),
        ],
      ),
      floatingActionButton: _SosFab(tripId: widget.tripId),
      floatingActionButtonLocation: FloatingActionButtonLocation.startTop,
      body: locationAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => EmptyState(
          icon: Icons.wifi_off_rounded,
          title: 'تعذّر تحميل الموقع',
          actionLabel: 'إعادة المحاولة',
          onAction: _refresh,
        ),
        data: (location) {
          if (location == null) {
            return const EmptyState(
              icon: Icons.location_searching_rounded,
              title: 'في انتظار موقع السائق',
              message: 'سيظهر موقع السيارة هنا فور بدء السائق مشاركة موقعه. يتم التحديث تلقائياً.',
            );
          }

          final car = LatLng(location.latitude, location.longitude);
          final remainingKm = destination == null ? null : _distance.as(LengthUnit.Kilometer, car, destination);
          // Straight-line distance × 1.3 for roads, at an average intercity 80 km/h
          final eta = remainingKm == null
              ? null
              : DateTime.now().add(Duration(minutes: (remainingKm * 1.3 / 80 * 60).round()));
          final path = trail.map((p) => LatLng(p.latitude, p.longitude)).toList();
          _fit(car, destination, path);
          final primary = Theme.of(context).colorScheme.primary;

          return Stack(
            children: [
              FlutterMap(
                mapController: _mapController,
                options: MapOptions(initialCenter: car, initialZoom: 13),
                children: [
                  TileLayer(
                    urlTemplate: _tileUrl,
                    userAgentPackageName: 'com.yalansafr.yala_nsafr',
                  ),
                  PolylineLayer(polylines: [
                    if (destination != null)
                      Polyline(
                        points: [car, destination],
                        color: Colors.black26,
                        strokeWidth: 3,
                        pattern: StrokePattern.dashed(segments: const [10, 8]),
                      ),
                    if (path.length > 1)
                      Polyline(points: [...path, car], color: primary, strokeWidth: 5),
                  ]),
                  MarkerLayer(markers: [
                    if (destination != null)
                      Marker(
                        point: destination,
                        width: 44,
                        height: 44,
                        alignment: Alignment.topCenter,
                        child: const Icon(Icons.location_on_rounded, size: 44, color: AppColors.error),
                      ),
                    Marker(
                      point: car,
                      width: 48,
                      height: 48,
                      child: Container(
                        decoration: BoxDecoration(
                          color: primary,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 3),
                          boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 8)],
                        ),
                        child: const Icon(Icons.directions_car_rounded, color: Colors.white, size: 24),
                      ),
                    ),
                  ]),
                ],
              ),
              Positioned(
                left: 16,
                right: 16,
                bottom: 16 + MediaQuery.of(context).padding.bottom,
                child: AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          const StatusPill(label: 'مباشر', color: AppColors.success, icon: Icons.circle),
                          const SizedBox(width: 8),
                          Expanded(child: Text('آخر تحديث ${Fmt.ago(location.recordedAt)}', style: t.bodySmall)),
                        ],
                      ),
                      if (remainingKm != null) ...[
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: _MapStat(
                                label: 'المتبقي تقريباً',
                                value: '${(remainingKm * 1.3).round()} كم',
                              ),
                            ),
                            Expanded(
                              child: _MapStat(label: 'الوصول المتوقع', value: Fmt.time(eta!)),
                            ),
                          ],
                        ),
                      ],
                      if (destination != null) ...[
                        const SizedBox(height: 12),
                        OutlinedButton.icon(
                          icon: const Icon(Icons.map_rounded),
                          label: const Text('عرض الطريق في خرائط جوجل'),
                          onPressed: () => launchUrl(
                            Uri.parse('https://www.google.com/maps/dir/?api=1'
                                '&origin=${car.latitude},${car.longitude}'
                                '&destination=${destination.latitude},${destination.longitude}'
                                '&travelmode=driving'),
                            mode: LaunchMode.externalApplication,
                          ),
                        ),
                      ],
                    ],
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

class _MapStat extends StatelessWidget {
  final String label;
  final String value;
  const _MapStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: t.labelSmall),
        Text(value, style: t.titleLarge),
      ],
    );
  }
}

// ── SOS FAB ───────────────────────────────────────────────────────────────────

class _SosFab extends ConsumerStatefulWidget {
  final String tripId;
  const _SosFab({required this.tripId});

  @override
  ConsumerState<_SosFab> createState() => _SosFabState();
}

class _SosFabState extends ConsumerState<_SosFab>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  bool _triggered = false;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2500),
    )..addStatusListener((s) {
        if (s == AnimationStatus.completed && !_triggered) {
          _triggered = true;
          _activate();
        }
      });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _onLongPressStart(LongPressStartDetails _) => _ctrl.forward();

  void _onLongPressEnd(LongPressEndDetails _) {
    if (!_triggered) _ctrl.reverse();
  }

  void _onLongPressCancel() {
    if (!_triggered) _ctrl.reverse();
  }

  Future<void> _activate() async {
    HapticFeedback.heavyImpact();

    final user = ref.read(authProvider).user;
    final contactPhone = user?.emergencyContactPhone;
    final contactName = user?.emergencyContactName;

    // Backend notification — fire-and-forget, don't block
    reportSos(ref, widget.tripId).catchError((_) {});

    // Best-effort GPS for SMS body
    String? mapsLink;
    try {
      final pos = await Geolocator.getLastKnownPosition();
      if (pos != null) {
        mapsLink =
            'https://maps.google.com/?q=${pos.latitude},${pos.longitude}';
      }
    } catch (_) {}

    final smsBody = 'أحتاج مساعدة عاجلة! أنا في رحلة يلا نسافر.'
        '${mapsLink != null ? '\nموقعي: $mapsLink' : ''}';

    // Open emergency contact dialer immediately
    if (contactPhone != null && mounted) {
      launchUrl(Uri.parse('tel:$contactPhone')).catchError((_) async => false);
    }

    if (!mounted) return;
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => _SosModal(
        contactPhone: contactPhone,
        contactName: contactName,
        smsBody: smsBody,
      ),
    );

    if (mounted) {
      setState(() => _triggered = false);
      _ctrl.reset();
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('اضغط مطولاً 3 ثوانٍ لتفعيل الطوارئ'),
          duration: Duration(seconds: 2),
          behavior: SnackBarBehavior.floating,
        ),
      ),
      onLongPressStart: _onLongPressStart,
      onLongPressEnd: _onLongPressEnd,
      onLongPressCancel: _onLongPressCancel,
      child: AnimatedBuilder(
        animation: _ctrl,
        builder: (_, __) => SizedBox(
          width: 72,
          height: 72,
          child: Stack(
            alignment: Alignment.center,
            children: [
              SizedBox(
                width: 72,
                height: 72,
                child: CircularProgressIndicator(
                  value: _ctrl.value,
                  strokeWidth: 5,
                  color: Colors.red.shade300,
                  backgroundColor: Colors.red.withValues(alpha: 0.15),
                ),
              ),
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: Colors.red,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.red.withValues(alpha: 0.45),
                      blurRadius: 14,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: const Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.sos_rounded, color: Colors.white, size: 26),
                    Text(
                      'SOS',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.5,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── SOS activated modal ───────────────────────────────────────────────────────

class _SosModal extends StatelessWidget {
  final String? contactPhone;
  final String? contactName;
  final String smsBody;

  const _SosModal({
    required this.contactPhone,
    required this.contactName,
    required this.smsBody,
  });

  Future<void> _call(String number) async {
    await launchUrl(Uri.parse('tel:$number'));
  }

  Future<void> _sms(String phone) async {
    final encoded = Uri.encodeFull(smsBody);
    await launchUrl(Uri.parse('sms:$phone?body=$encoded'));
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Container(
              width: 72,
              height: 72,
              decoration: const BoxDecoration(
                  color: Colors.red, shape: BoxShape.circle),
              child:
                  const Icon(Icons.sos_rounded, color: Colors.white, size: 40),
            ),
            const SizedBox(height: 16),
            const Text(
              'تم إرسال تنبيه الطوارئ',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 6),
            const Text(
              'فريق يلا نسافر تم إخطاره',
              style: TextStyle(color: Colors.grey, fontSize: 13),
            ),
            const SizedBox(height: 24),

            // Emergency contact buttons
            if (contactPhone != null) ...[
              _SosButton(
                icon: Icons.phone_rounded,
                label:
                    'اتصل بـ ${contactName?.isNotEmpty == true ? contactName! : contactPhone!}',
                color: Colors.green,
                onTap: () => _call(contactPhone!),
              ),
              const SizedBox(height: 8),
              _SosButton(
                icon: Icons.sms_rounded,
                label: 'إرسال SMS مع الموقع',
                color: Colors.teal,
                onTap: () => _sms(contactPhone!),
              ),
              const SizedBox(height: 16),
              const Row(
                children: [
                  Expanded(child: Divider()),
                  Padding(
                    padding: EdgeInsets.symmetric(horizontal: 10),
                    child: Text('أرقام الطوارئ',
                        style: TextStyle(color: Colors.grey, fontSize: 12)),
                  ),
                  Expanded(child: Divider()),
                ],
              ),
              const SizedBox(height: 12),
            ],

            // Egyptian emergency numbers
            Row(
              children: [
                Expanded(
                  child: _SosButton(
                    icon: Icons.local_police_rounded,
                    label: 'الشرطة\n123',
                    color: Colors.blue[700]!,
                    onTap: () => _call('123'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _SosButton(
                    icon: Icons.emergency_rounded,
                    label: 'الإسعاف\n122',
                    color: Colors.orange[800]!,
                    onTap: () => _call('122'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('إغلاق'),
            ),
          ],
        ),
      ),
    );
  }
}

class _SosButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _SosButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
          child: Row(
            children: [
              Icon(icon, color: color, size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                      color: color,
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                      height: 1.4),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
