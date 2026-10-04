import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/providers/connectivity_provider.dart';
import '../../features/auth/providers/auth_provider.dart';
import '../../features/notifications/providers/notifications_provider.dart';
import '../widgets/verified_badge.dart';

class MainShell extends ConsumerWidget {
  final Widget child;
  const MainShell({super.key, required this.child});

  int _indexForPath(String path) => switch (path) {
        String p when p.startsWith('/search') => 0,
        String p when p.startsWith('/my-bookings') => 1,
        String p when p.startsWith('/my-trips') => 2,
        String p when p.startsWith('/profile') => 3,
        _ => 0,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
          const SnackBar(
            content: Row(
              children: [
                Icon(Icons.wifi_rounded, color: Colors.white, size: 16),
                SizedBox(width: 8),
                Text('عاد الاتصال بالإنترنت'),
              ],
            ),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 2),
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
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.wifi_off_rounded, size: 14, color: Colors.white),
                  SizedBox(width: 6),
                  Text(
                    'لا يوجد اتصال بالإنترنت',
                    style: TextStyle(color: Colors.white, fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
          Expanded(child: child),
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
            const NavigationDestination(
              icon: Icon(Icons.search_rounded),
              selectedIcon: Icon(Icons.travel_explore_rounded),
              label: 'بحث',
            ),
            const NavigationDestination(
              icon: Icon(Icons.confirmation_number_outlined),
              selectedIcon: Icon(Icons.confirmation_number_rounded),
              label: 'حجوزاتي',
            ),
            const NavigationDestination(
              icon: Icon(Icons.directions_car_outlined),
              selectedIcon: Icon(Icons.directions_car_rounded),
              label: 'رحلاتي',
            ),
            NavigationDestination(
              icon: user?.idVerified == false
                  ? const VerifiedBadge(child: Icon(Icons.person_outline_rounded))
                  : const Icon(Icons.person_outline_rounded),
              selectedIcon: const Icon(Icons.person_rounded),
              label: 'حسابي',
            ),
          ],
        ),
      ),
    );
  }
}
