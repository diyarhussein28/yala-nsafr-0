import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_endpoints.dart';
import '../../../core/i18n/tr.dart';

class TripLocationPoint {
  final double latitude;
  final double longitude;
  final DateTime recordedAt;

  const TripLocationPoint({
    required this.latitude,
    required this.longitude,
    required this.recordedAt,
  });

  factory TripLocationPoint.fromJson(Map<String, dynamic> json) =>
      TripLocationPoint(
        latitude: double.tryParse(json['latitude']?.toString() ?? '') ?? 0,
        longitude: double.tryParse(json['longitude']?.toString() ?? '') ?? 0,
        recordedAt:
            DateTime.tryParse(json['recordedAt'] as String? ?? '') ?? DateTime.now(),
      );
}

/// Passenger: fetch the latest GPS point for a trip.
final tripLocationProvider =
    FutureProvider.autoDispose.family<TripLocationPoint?, String>((ref, tripId) async {
  final dio = ref.read(dioProvider);
  try {
    final res = await dio.get(Endpoints.tripLocationLatest(tripId));
    if (res.data == null) return null;
    return TripLocationPoint.fromJson(res.data as Map<String, dynamic>);
  } catch (_) {
    return null;
  }
});

/// Passenger: the path driven so far.
final tripTrailProvider =
    FutureProvider.autoDispose.family<List<TripLocationPoint>, String>((ref, tripId) async {
  try {
    final res = await ref.read(dioProvider).get(Endpoints.tripLocationTrail(tripId));
    return (res.data as List)
        .map((e) => TripLocationPoint.fromJson(e as Map<String, dynamic>))
        .toList();
  } catch (_) {
    return const [];
  }
});

/// Driver: streams the position to the backend for the whole trip.
///
/// The previous version posted once a minute from a Timer, which stops as soon as the
/// phone locks or the app goes to the background — so passengers lost the car mid-trip.
/// This listens to the platform location stream instead: on Android with a foreground-
/// service notification, on iOS with background location updates. Positions are sent at
/// most every 20 seconds, and sharing stops by itself once the server reports the trip
/// is no longer active.
class DriverLocationNotifier extends StateNotifier<bool> {
  final Dio _dio;
  final String _tripId;
  StreamSubscription<Position>? _sub;
  DateTime _lastSent = DateTime.fromMillisecondsSinceEpoch(0);

  DriverLocationNotifier(this._dio, this._tripId) : super(false);

  Future<void> start() async {
    if (state) return;
    final granted = await _requestPermission();
    if (!granted) return;
    state = true;
    _sub = Geolocator.getPositionStream(locationSettings: _settings()).listen(
      _onPosition,
      onError: (_) {},
    );
  }

  LocationSettings _settings() {
    if (kIsWeb) return const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 30);
    if (defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 30,
        intervalDuration: const Duration(seconds: 15),
        foregroundNotificationConfig: ForegroundNotificationConfig(
          notificationTitle: tr('يلا نسافر — رحلة جارية'),
          notificationText: tr('يتم مشاركة موقعك مع ركاب الرحلة'),
          enableWakeLock: true,
          setOngoing: true,
        ),
      );
    }
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 30,
        activityType: ActivityType.automotiveNavigation,
        allowBackgroundLocationUpdates: true,
        showBackgroundLocationIndicator: true,
        pauseLocationUpdatesAutomatically: false,
      );
    }
    return const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 30);
  }

  Future<void> _onPosition(Position pos) async {
    final now = DateTime.now();
    if (now.difference(_lastSent) < const Duration(seconds: 20)) return;
    _lastSent = now;
    try {
      await _dio.post(
        Endpoints.tripLocation(_tripId),
        data: {'latitude': pos.latitude, 'longitude': pos.longitude},
      );
    } on DioException catch (e) {
      // The trip ended (or was never started): stop sharing
      if (e.response?.statusCode == 400 || e.response?.statusCode == 403) stop();
    } catch (_) {}
  }

  void stop() {
    _sub?.cancel();
    _sub = null;
    if (mounted) state = false;
  }

  Future<bool> _requestPermission() async {
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    return perm != LocationPermission.denied &&
        perm != LocationPermission.deniedForever;
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}

// Kept alive while the app runs, so leaving the screen does not stop sharing mid-trip
final driverLocationProvider = StateNotifierProvider
    .family<DriverLocationNotifier, bool, String>(
  (ref, tripId) => DriverLocationNotifier(ref.read(dioProvider), tripId),
);
