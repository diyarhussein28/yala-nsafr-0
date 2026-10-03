import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/services/fcm_service.dart';
import 'core/theme/app_theme.dart';
import 'core/router/app_router.dart';
import 'firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  await FcmService.initialize();

  runApp(const ProviderScope(child: YalaApp()));
}

class YalaApp extends ConsumerStatefulWidget {
  const YalaApp({super.key});

  @override
  ConsumerState<YalaApp> createState() => _YalaAppState();
}

class _YalaAppState extends ConsumerState<YalaApp> {
  @override
  void initState() {
    super.initState();
    // Wait for the first frame so the router is fully built before navigating
    WidgetsBinding.instance.addPostFrameCallback((_) {
      FcmService.handlePendingInitialMessage();
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'يلا نسافر',
      theme: AppTheme.light,
      routerConfig: router,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      debugShowCheckedModeBanner: false,
    );
  }
}
