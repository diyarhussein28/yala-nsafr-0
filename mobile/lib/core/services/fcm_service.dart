import 'dart:convert';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../router/app_router.dart';
import '../../core/i18n/tr.dart';

@pragma('vm:entry-point')
Future<void> _onBackgroundMessage(RemoteMessage message) async {
  // Background messages are shown automatically by FCM on Android.
}

class FcmService {
  FcmService._();

  static final _messaging = FirebaseMessaging.instance;
  static final _localNotifications = FlutterLocalNotificationsPlugin();

  static final _channel = AndroidNotificationChannel(
    'yala_high',
    tr('يلا نسافر'),
    description: tr('إشعارات الحجوزات والرحلات'),
    importance: Importance.high,
  );

  // Holds the message that launched the app from terminated state.
  // Consumed once by handlePendingInitialMessage().
  static RemoteMessage? _pendingInitialMessage;
  static Future<void>? _initialization;

  /// Runs after the first frame is on screen; nothing here may hold up startup.
  static Future<void> initialize() => _initialization ??= _initialize().catchError((Object e) {
        if (kDebugMode) debugPrint('FCM init failed: $e');
      });

  static Future<void> _initialize() async {
    FirebaseMessaging.onBackgroundMessage(_onBackgroundMessage);

    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);

    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings();
    await _localNotifications.initialize(
      const InitializationSettings(android: androidSettings, iOS: iosSettings),
      // Foreground notification tap → deep link
      onDidReceiveNotificationResponse: (details) {
        final payload = details.payload;
        if (payload == null) return;
        try {
          final data = jsonDecode(payload) as Map<String, dynamic>;
          _handleData(data);
        } catch (_) {}
      },
    );

    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    if (kDebugMode) {
      debugPrint('FCM permission: ${settings.authorizationStatus}');
    }

    // Foreground: show local notification with payload for tap handling
    FirebaseMessaging.onMessage.listen(_showForegroundNotification);

    // Background → foreground via notification tap
    FirebaseMessaging.onMessageOpenedApp.listen((msg) => _handleData(msg.data));

    // Terminated → cold start via notification tap (stored, consumed later)
    // Under the iOS UIScene lifecycle this future can never complete.
    _pendingInitialMessage = await _messaging
        .getInitialMessage()
        .timeout(const Duration(seconds: 3), onTimeout: () => null);
  }

  /// Call this once from YalaApp.initState via addPostFrameCallback,
  /// after the router has been created and the first frame drawn.
  static Future<void> handlePendingInitialMessage() async {
    await initialize();
    final msg = _pendingInitialMessage;
    _pendingInitialMessage = null;
    if (msg != null) _handleData(msg.data);
  }

  static Future<String?> getToken() => _messaging.getToken();

  static Stream<String> get onTokenRefresh => _messaging.onTokenRefresh;

  static void _showForegroundNotification(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;

    _localNotifications.show(
      notification.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: const DarwinNotificationDetails(),
      ),
      // Encode data so the tap handler can deep link
      payload: message.data.isNotEmpty ? jsonEncode(message.data) : null,
    );
  }

  static void _handleData(Map<String, dynamic> data) {
    final route = _routeFrom(data);
    if (route == null) return;
    final extra = _extraFrom(data);
    navigateFromNotification(route, extra: extra);
  }

  /// Where a notification's data payload should take the user. Shared by push taps and
  /// the in-app inbox so both stay in step.
  static String? routeFor(Map<String, dynamic> data) => _routeFrom(data);

  static String? _routeFrom(Map<String, dynamic> data) {
    final screen = data['screen'] as String?;
    final tripId = data['tripId'] as String?;
    final disputeId = data['disputeId'] as String?;

    return switch (screen) {
      'trip_detail' when tripId != null => '/trips/$tripId',
      'trip_chat' when tripId != null => '/trips/$tripId/chat',
      'driver_bookings' when tripId != null => '/trips/$tripId/passengers',
      'driver_bookings' => '/my-trips',
      'my_bookings' => '/my-bookings',
      'dispute_detail' when disputeId != null => '/disputes/$disputeId',
      'admin_disputes' => '/admin/disputes',
      'admin_sos' when tripId != null => '/trips/$tripId',
      'admin_sos' => '/admin/disputes',
      'earnings' || 'driver_earnings' => '/drivers/earnings',
      'trip_passengers' when tripId != null => '/trips/$tripId/passengers',
      'trip_passengers' || 'my_trips' => '/my-trips',
      'subscription' => '/subscription',
      'profile' => '/profile',
      'id_verification' => '/profile/id-verification',
      'driver_verification' => '/profile/driver-verification',
      // Anything else that names a trip still lands somewhere useful
      _ when tripId != null => '/trips/$tripId',
      _ => '/notifications',
    };
  }

  static Object? _extraFrom(Map<String, dynamic> data) {
    if (data['screen'] == 'trip_chat') {
      return <String, dynamic>{'label': data['tripLabel'] as String? ?? ''};
    }
    return null;
  }
}
