import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_endpoints.dart';
import '../widgets/admin_scaffold.dart';
import '../../../../core/i18n/tr.dart';

final _adminDisputesProvider =
    FutureProvider.autoDispose.family<List<dynamic>, String?>(
  (ref, status) async {
    final dio = ref.read(dioProvider);
    final res = await dio.get(
      Endpoints.adminDisputes,
      queryParameters: {
        'limit': 50,
        if (status != null) 'status': status,
      },
    );
    return (res.data as Map<String, dynamic>)['data'] as List<dynamic>;
  },
);

class AdminDisputesScreen extends ConsumerStatefulWidget {
  const AdminDisputesScreen({super.key});

  @override
  ConsumerState<AdminDisputesScreen> createState() =>
      _AdminDisputesScreenState();
}

class _AdminDisputesScreenState
    extends ConsumerState<AdminDisputesScreen> {
  String? _filterStatus;

  static List<(String?, String)> get _filters => [
    (null, tr('الكل')),
    ('open', tr('مفتوح')),
    ('under_review', tr('تحت المراجعة')),
    ('resolved_refund', tr('استرداد')),
    ('resolved_release', tr('إفراج')),
    ('resolved_split', tr('تقسيم')),
  ];

  @override
  Widget build(BuildContext context) {
    final disputesAsync = ref.watch(_adminDisputesProvider(_filterStatus));

    return AdminScaffold(
      title: tr('النزاعات'),
      body: Column(
        children: [
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              children: _filters.map((f) {
                final selected = _filterStatus == f.$1;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(f.$2),
                    selected: selected,
                    onSelected: (_) =>
                        setState(() => _filterStatus = f.$1),
                  ),
                );
              }).toList(),
            ),
          ),
          Expanded(
            child: disputesAsync.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('$e')),
              data: (disputes) {
                if (disputes.isEmpty) {
                  return Center(
                    child: Text(tr('لا توجد نزاعات'),
                        style: const TextStyle(color: Colors.grey)),
                  );
                }
                return RefreshIndicator(
                  onRefresh: () => ref.refresh(
                      _adminDisputesProvider(_filterStatus).future),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: disputes.length,
                    separatorBuilder: (_, __) =>
                        const SizedBox(height: 8),
                    itemBuilder: (_, i) {
                      final d = disputes[i] as Map<String, dynamic>;
                      return _DisputeRow(data: d);
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _DisputeRow extends StatelessWidget {
  final Map<String, dynamic> data;
  const _DisputeRow({required this.data});

  static const _statusColors = {
    'open': Colors.deepOrange,
    'under_review': Colors.orange,
    'resolved_refund': Colors.green,
    'resolved_release': Colors.blue,
    'resolved_split': Colors.purple,
    'closed': Colors.grey,
  };

  static Map<String, String> get _reasonLabels => {
    'no_show_driver': tr('السائق غائب'),
    'no_show_passenger': tr('الراكب غائب'),
    'unsafe_driving': tr('قيادة خطرة'),
    'wrong_route': tr('مسار خاطئ'),
    'payment_mismatch': tr('خلاف مبلغ'),
    'harassment': tr('تحرش'),
    'other': tr('أخرى'),
  };

  static Map<String, String> get _statusLabels => {
    'open': tr('مفتوح'),
    'under_review': tr('قيد المراجعة'),
    'resolved_refund': tr('استرداد'),
    'resolved_release': tr('إفراج'),
    'resolved_split': tr('تقسيم'),
    'closed': tr('مغلق'),
  };

  @override
  Widget build(BuildContext context) {
    final status = data['status'] as String? ?? 'open';
    final reason = data['reason'] as String? ?? '';
    final color = _statusColors[status] ?? Colors.grey;
    final opener = data['openedBy'] as Map<String, dynamic>?;
    final openerName = (opener?['fullName'] as String?)?.isNotEmpty == true
        ? opener!['fullName'] as String
        : (opener?['phoneNumber'] as String? ?? '?');
    final createdAt =
        DateTime.tryParse(data['createdAt'] as String? ?? '');

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/admin/disputes/${data['id']}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 4,
                height: 48,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_reasonLabels[reason] ?? reason,
                        style: const TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 2),
                    Text(tr('فتحه: {0}', [openerName]),
                        style: TextStyle(
                            color: Colors.grey[600], fontSize: 12)),
                    if (createdAt != null)
                      Text(
                        '${createdAt.day}/${createdAt.month}/${createdAt.year}',
                        style: TextStyle(
                            color: Colors.grey[500], fontSize: 11),
                      ),
                  ],
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: color),
                ),
                child: Text(_statusLabels[status] ?? status,
                    style: TextStyle(color: color, fontSize: 12)),
              ),
              const SizedBox(width: 4),
              const Icon(Icons.chevron_left_rounded, color: Colors.grey),
            ],
          ),
        ),
      ),
    );
  }
}
