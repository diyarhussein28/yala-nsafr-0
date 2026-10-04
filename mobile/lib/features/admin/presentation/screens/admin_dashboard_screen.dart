import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/api/api_client.dart';
import '../widgets/admin_scaffold.dart';
import '../../../../core/i18n/tr.dart';
import '../../../../core/constants/egypt_cities.dart';

final _analyticsProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final resp = await ref.read(dioProvider).get('/admin/analytics');
  return resp.data as Map<String, dynamic>;
});

class AdminDashboardScreen extends ConsumerWidget {
  const AdminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_analyticsProvider);
    return AdminScaffold(
      title: tr('لوحة التحكم'),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (data) => RefreshIndicator(
          onRefresh: () => ref.refresh(_analyticsProvider.future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _StatsGrid(data: data),
              const SizedBox(height: 16),
              _TopRoutesCard(
                routes: (data['topRoutes'] as List?)
                        ?.cast<Map<String, dynamic>>() ??
                    [],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Stat cards ────────────────────────────────────────────────────────────────

class _StatsGrid extends StatelessWidget {
  final Map<String, dynamic> data;
  const _StatsGrid({required this.data});

  @override
  Widget build(BuildContext context) {
    final u = data['users'] as Map<String, dynamic>? ?? {};
    final t = data['trips'] as Map<String, dynamic>? ?? {};
    final rev = data['revenue'] as Map<String, dynamic>? ?? {};
    final dis = data['disputes'] as Map<String, dynamic>? ?? {};

    final cards = [
      _Card(label: tr('المستخدمون'), value: '${u['total'] ?? 0}', icon: Icons.people_rounded, color: Colors.blue),
      _Card(label: tr('الرحلات'), value: '${t['total'] ?? 0}', icon: Icons.directions_car_rounded, color: Colors.green),
      _Card(
        label: tr('الإيرادات'),
        value: tr('{0} ج', [(rev['totalEgp'] as num?)?.toStringAsFixed(0) ?? 0]),
        icon: Icons.attach_money_rounded,
        color: Colors.orange,
      ),
      _Card(label: tr('نزاعات مفتوحة'), value: '${dis['open'] ?? 0}', icon: Icons.gavel_rounded, color: Colors.red),
      _Card(label: tr('تحقق هوية معلق'), value: '${u['pendingIdVerifications'] ?? 0}', icon: Icons.badge_rounded, color: Colors.purple),
      _Card(label: tr('تحقق سائق معلق'), value: '${u['pendingDriverVerifications'] ?? 0}', icon: Icons.drive_eta_rounded, color: Colors.teal),
      _Card(label: tr('مكتملة (30 يوم)'), value: '${t['completedLast30Days'] ?? 0}', icon: Icons.check_circle_rounded, color: Colors.green.shade700),
      _Card(label: tr('ثقة منخفضة'), value: '${u['trustFlagged'] ?? 0}', icon: Icons.flag_rounded, color: Colors.red.shade700),
    ];

    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 1.65,
      children: cards,
    );
  }
}

class _Card extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _Card({required this.label, required this.value, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 22),
            const Spacer(),
            Text(value,
                style: TextStyle(
                    fontSize: 22, fontWeight: FontWeight.bold, color: color)),
            Text(label,
                style: Theme.of(context).textTheme.bodySmall,
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }
}

// ── Top routes ────────────────────────────────────────────────────────────────

class _TopRoutesCard extends StatelessWidget {
  final List<Map<String, dynamic>> routes;
  const _TopRoutesCard({required this.routes});

  @override
  Widget build(BuildContext context) {
    if (routes.isEmpty) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.route_rounded, size: 18),
                const SizedBox(width: 8),
                Text(tr('أكثر المسارات رحلات'),
                    style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 12),
            ...routes.asMap().entries.map((e) {
              final r = e.value;
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 13,
                      backgroundColor:
                          Theme.of(context).colorScheme.primaryContainer,
                      child: Text('${e.key + 1}',
                          style: const TextStyle(fontSize: 11)),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        routeLabel(r['originCity'] as String?, r['destinationCity'] as String?),
                        style:
                            const TextStyle(fontWeight: FontWeight.w500),
                      ),
                    ),
                    Text(tr('{0} رحلة', [r['tripCount']]),
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}
