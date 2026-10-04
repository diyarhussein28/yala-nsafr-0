import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/providers/connectivity_provider.dart';
import '../../core/api/api_client.dart';
import '../../core/services/update_checker.dart';
import '../../features/auth/providers/auth_provider.dart';
import '../../features/notifications/providers/notifications_provider.dart';
import '../widgets/verified_badge.dart';
import '../../core/i18n/tr.dart';

class MainShell extends ConsumerStatefulWidget {
  final Widget child;
  const MainShell({super.key, required this.child});

  @override
  ConsumerState<MainShell> createState() => _MainShellState();
}

class _MainShellState extends ConsumerState<MainShell> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) UpdateChecker.check(context, ref.read(dioProvider));
    });
  }

  int _indexForPath(String path) => switch (path) {
        String p when p.startsWith('/search') => 0,
        String p when p.startsWith('/my-bookings') => 1,
        String p when p.startsWith('/my-trips') => 2,
        String p when p.startsWith('/profile') => 3,
        _ => 0,
      };

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    final currentIndex = _indexForPath(location);
    final user = ref.watch(authProvider).user;

    // Default true so the banner doesn't flash on cold start
    final isOnline = ref.watch(connectivityProvider).valueOrNull ?? true;

    ref.listen(connectivityProvider, (prev, next) {
      final wasOffline = prev?.valueOrNull == false;
      final nowOnline = next.valueOrNull == true;
      if (wasOffline && nowOnline) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.wifi_rounded, color: Colors.white, size: 16),
                const SizedBox(width: 8),
                Text(tr('عاد الاتصال بالإنترنت')),
              ],
            ),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 2),
          ),
        );
        // Refresh the bell badge — individual screens use pull-to-refresh
        ref.invalidate(unreadCountProvider);
      }
    });

    return Scaffold(
      body: Column(
        children: [
          ClipRect(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeInOut,
              height: isOnline ? 0 : 36,
              color: Colors.red.shade700,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.wifi_off_rounded, size: 14, color: Colors.white),
                  const SizedBox(width: 6),
                  Text(
                    tr('لا يوجد اتصال بالإنترنت'),
                    style: const TextStyle(color: Colors.white, fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
          Expanded(child: widget.child),
        ],
      ),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
        ),
        child: NavigationBar(
          selectedIndex: currentIndex,
          onDestinationSelected: (i) {
            switch (i) {
              case 0:
                context.go('/search');
              case 1:
                context.go('/my-bookings');
              case 2:
                context.go('/my-trips');
              case 3:
                context.go('/profile');
            }
          },
          destinations: [
            NavigationDestination(
              icon: const Icon(Icons.search_rounded),
              selectedIcon: const Icon(Icons.travel_explore_rounded),
              label: tr('بحث'),
            ),
            NavigationDestination(
              icon: const Icon(Icons.confirmation_number_outlined),
              selectedIcon: const Icon(Icons.confirmation_number_rounded),
              label: tr('حجوزاتي'),
            ),
            NavigationDestination(
              icon: const Icon(Icons.directions_car_outlined),
              selectedIcon: const Icon(Icons.directions_car_rounded),
              label: tr('رحلاتي'),
            ),
            NavigationDestination(
              icon: user?.idVerified == false
                  ? const VerifiedBadge(child: Icon(Icons.person_outline_rounded))
                  : const Icon(Icons.person_outline_rounded),
              selectedIcon: const Icon(Icons.person_rounded),
              label: tr('حسابي'),
            ),
          ],
        ),
      ),
    );
  }
}
