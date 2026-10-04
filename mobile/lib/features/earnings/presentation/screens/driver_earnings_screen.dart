import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/models/earnings.dart';
import '../../../../core/theme/app_theme.dart';
import '../../providers/earnings_provider.dart';
import '../../../../core/api/api_endpoints.dart';
import '../../../../core/utils/format.dart';
import '../../../../shared/widgets/kashier_checkout_screen.dart';
import '../../../../shared/widgets/ui.dart';
import '../../../../core/i18n/tr.dart';
import '../../../../core/constants/egypt_cities.dart';

class DriverEarningsScreen extends ConsumerWidget {
  const DriverEarningsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summaryAsync = ref.watch(earningsSummaryProvider);
    final tripsAsync = ref.watch(earningsTripsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(tr('أرباحي'), style: const TextStyle(color: Colors.white)),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: summaryAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => EmptyState(
          icon: Icons.cloud_off_rounded,
          title: tr('تعذّر تحميل الأرباح'),
          message: '$e',
          color: AppColors.error,
          actionLabel: tr('إعادة المحاولة'),
          onAction: () => ref.invalidate(earningsSummaryProvider),
        ),
        data: (summary) => Column(
          children: [
            _SummaryStrip(summary: summary),
            Expanded(
              child: tripsAsync.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (trips) {
                  if (trips.isEmpty) {
                    return EmptyState(
                      icon: Icons.directions_car_outlined,
                      title: tr('لا توجد رحلات مكتملة بعد'),
                      message: tr('ستظهر أرباح كل رحلة هنا فور إنهائها.'),
                    );
                  }
                  return RefreshIndicator(
                    onRefresh: () async {
                      ref.invalidate(earningsSummaryProvider);
                      ref.invalidate(earningsTripsProvider);
                    },
                    child: ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: trips.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, i) => _TripEarningCard(trip: trips[i]),
                    ),
                  );
                },
              ),
            ),
            _WithdrawBar(summary: summary),
          ],
        ),
      ),
    );
  }
}

// ── Summary strip ─────────────────────────────────────────────────────────────

class _SummaryStrip extends ConsumerStatefulWidget {
  final EarningsSummary summary;
  const _SummaryStrip({required this.summary});

  @override
  ConsumerState<_SummaryStrip> createState() => _SummaryStripState();
}

class _SummaryStripState extends ConsumerState<_SummaryStrip> {
  bool _paying = false;

  // Cash fares never pass through the platform, so the commission on them is paid here
  Future<void> _payCommission() async {
    setState(() => _paying = true);
    try {
      final res = await ref.read(dioProvider).post(Endpoints.commissionCheckout);
      final data = res.data as Map<String, dynamic>;
      if (!mounted) return;
      final paid = await Navigator.of(context).push<bool>(MaterialPageRoute(
        builder: (_) => KashierCheckoutScreen(
          sessionUrl: data['sessionUrl'] as String,
          confirmEndpoint: Endpoints.commissionConfirm(data['paymentId'] as String),
        ),
      ));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(paid == true ? tr('تم سداد العمولة، شكراً لك ✅') : tr('لم يكتمل الدفع')),
      ));
      ref.invalidate(earningsSummaryProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final summary = widget.summary;
    final t = Theme.of(context).textTheme;
    final white70 = Colors.white.withValues(alpha: 0.8);

    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [AppColors.primary, AppColors.primaryDark],
        ),
      ),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(tr('متاح للسحب'), textAlign: TextAlign.center, style: t.labelMedium?.copyWith(color: white70)),
          Text(
            Fmt.money(summary.pendingBalance),
            textAlign: TextAlign.center,
            style: t.displaySmall?.copyWith(color: Colors.white),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: _HeroStat(label: tr('هذا الشهر'), value: Fmt.money(summary.thisMonthTotal))),
              const SizedBox(width: 8),
              Expanded(child: _HeroStat(label: tr('إجمالي الأرباح'), value: Fmt.money(summary.allTimeTotal))),
              const SizedBox(width: 8),
              Expanded(child: _HeroStat(label: tr('تم سحبه'), value: Fmt.money(summary.totalWithdrawn))),
            ],
          ),
          if (summary.heldBalance > 0) ...[
            const SizedBox(height: 10),
            _HeroNote(
              icon: Icons.lock_clock_rounded,
              text: tr('معلّق {0} حتى انتهاء مهلة النزاع{1}', [Fmt.money(summary.heldBalance), summary.nextReleaseAt != null ? tr(' — يتاح {0} {1}', [Fmt.relativeDay(summary.nextReleaseAt!), Fmt.time(summary.nextReleaseAt!)]) : '']),
            ),
          ],
          if (summary.pendingWithdrawal > 0) ...[
            const SizedBox(height: 8),
            _HeroNote(icon: Icons.schedule_rounded, text: tr('قيد التحويل: {0}', [Fmt.money(summary.pendingWithdrawal)])),
          ],
          if (summary.cashCommissionOutstanding > 0) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
              decoration: BoxDecoration(
                color: AppColors.secondary.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(color: AppColors.secondary.withValues(alpha: 0.6)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.receipt_long_rounded, color: AppColors.secondary, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      tr('عمولة مستحقة على رحلات الكاش: {0}{1}', [Fmt.money(summary.cashCommissionOutstanding), summary.cashCommissionOutstanding > summary.cashCommissionLimit ? tr('\nسدّدها لتتمكن من نشر رحلات جديدة') : '']),
                      style: t.bodySmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w600),
                    ),
                  ),
                  FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.secondary,
                      foregroundColor: const Color(0xFF3B2A00),
                      minimumSize: const Size(0, 38),
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                    ),
                    onPressed: _paying ? null : _payCommission,
                    child: _paying
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(tr('سدّد الآن')),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _HeroStat extends StatelessWidget {
  final String label;
  final String value;
  const _HeroStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Column(
        children: [
          FittedBox(child: Text(value, style: t.titleSmall?.copyWith(color: Colors.white))),
          Text(label, style: t.labelSmall?.copyWith(color: Colors.white.withValues(alpha: 0.8))),
        ],
      ),
    );
  }
}

class _HeroNote extends StatelessWidget {
  final IconData icon;
  final String text;
  const _HeroNote({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: Colors.white.withValues(alpha: 0.9)),
        const SizedBox(width: 6),
        Expanded(
          child: Text(text,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.white.withValues(alpha: 0.9))),
        ),
      ],
    );
  }
}

// ── Withdraw bar ──────────────────────────────────────────────────────────────

class _WithdrawBar extends StatelessWidget {
  final EarningsSummary summary;
  const _WithdrawBar({required this.summary});

  @override
  Widget build(BuildContext context) {
    final canWithdraw = summary.pendingBalance >= summary.minWithdrawal;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!canWithdraw)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                  tr('الحد الأدنى للسحب {0} ج — رصيدك {1} ج', [summary.minWithdrawal.toStringAsFixed(0), summary.pendingBalance.toStringAsFixed(0)]),
                  style:
                      TextStyle(color: Colors.grey.shade600, fontSize: 12),
                  textAlign: TextAlign.center,
                ),
              ),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                icon: const Icon(Icons.account_balance_rounded),
                label: Text(tr('طلب سحب الأرباح')),
                onPressed: canWithdraw
                    ? () => _showWithdrawSheet(context, summary)
                    : null,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showWithdrawSheet(BuildContext context, EarningsSummary summary) {
    showModalBottomSheet(
      useRootNavigator: true,
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _WithdrawSheet(summary: summary),
    );
  }
}

// ── Withdrawal form sheet ─────────────────────────────────────────────────────

class _WithdrawSheet extends ConsumerStatefulWidget {
  final EarningsSummary summary;
  const _WithdrawSheet({required this.summary});

  @override
  ConsumerState<_WithdrawSheet> createState() => _WithdrawSheetState();
}

class _WithdrawSheetState extends ConsumerState<_WithdrawSheet> {
  final _formKey = GlobalKey<FormState>();
  final _amountCtrl = TextEditingController();
  final _accountCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _bankCtrl = TextEditingController();

  String _method = 'vodafone_cash';
  bool _loading = false;

  static List<(String, String)> get _methods => [
    ('vodafone_cash', tr('فودافون كاش')),
    ('instapay', tr('إنستاباي')),
    ('bank', tr('تحويل بنكي')),
  ];

  @override
  void dispose() {
    _amountCtrl.dispose();
    _accountCtrl.dispose();
    _nameCtrl.dispose();
    _bankCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await requestWithdrawal(
        ref,
        amount: double.parse(_amountCtrl.text.trim()),
        payoutMethod: _method,
        payoutAccount: _accountCtrl.text.trim(),
        payoutName: _nameCtrl.text.trim(),
        payoutBank: _method == 'bank' ? _bankCtrl.text.trim() : null,
      );
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(tr('تم إرسال طلب السحب بنجاح ✅')),
              backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(e is ApiException ? e.message : '$e'),
              backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final insets = MediaQuery.of(context).viewInsets;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + insets.bottom),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 16),
            Text(tr('طلب سحب الأرباح'),
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(
              tr('الرصيد المتاح: {0} ج', [widget.summary.pendingBalance.toStringAsFixed(0)]),
              style:
                  TextStyle(color: Colors.grey.shade600, fontSize: 13),
            ),
            const SizedBox(height: 20),

            // Amount
            TextFormField(
              controller: _amountCtrl,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: tr('المبلغ (جنيه)'),
                prefixIcon: const Icon(Icons.payments_outlined),
                border: const OutlineInputBorder(),
              ),
              validator: (v) {
                final n = double.tryParse(v ?? '');
                if (n == null) return tr('أدخل مبلغاً صحيحاً');
                if (n < widget.summary.minWithdrawal) {
                  return tr('الحد الأدنى {0} ج', [widget.summary.minWithdrawal.toStringAsFixed(0)]);
                }
                if (n > widget.summary.pendingBalance) {
                  return tr('يتجاوز رصيدك المتاح');
                }
                return null;
              },
            ),
            const SizedBox(height: 14),

            // Method
            DropdownButtonFormField<String>(
              initialValue: _method,
              decoration: InputDecoration(
                labelText: tr('طريقة الاستلام'),
                prefixIcon: const Icon(Icons.account_balance_wallet_outlined),
                border: const OutlineInputBorder(),
              ),
              items: _methods
                  .map((m) => DropdownMenuItem(value: m.$1, child: Text(m.$2)))
                  .toList(),
              onChanged: (v) => setState(() => _method = v!),
            ),
            const SizedBox(height: 14),

            // Account number
            TextFormField(
              controller: _accountCtrl,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: _method == 'bank' ? tr('رقم الحساب / IBAN') : tr('رقم المحفظة'),
                prefixIcon: const Icon(Icons.phone_android_outlined),
                border: const OutlineInputBorder(),
              ),
              validator: (v) {
                if (v == null || v.trim().length < 11) return tr('أدخل رقماً صحيحاً');
                return null;
              },
            ),
            const SizedBox(height: 14),

            // Full name
            TextFormField(
              controller: _nameCtrl,
              decoration: InputDecoration(
                labelText: tr('الاسم الكامل'),
                prefixIcon: const Icon(Icons.person_outline),
                border: const OutlineInputBorder(),
              ),
              validator: (v) =>
                  (v == null || v.trim().length < 2) ? tr('أدخل الاسم') : null,
            ),

            // Bank name (only for bank transfer)
            if (_method == 'bank') ...[
              const SizedBox(height: 14),
              TextFormField(
                controller: _bankCtrl,
                decoration: InputDecoration(
                  labelText: tr('اسم البنك'),
                  prefixIcon: const Icon(Icons.account_balance_outlined),
                  border: const OutlineInputBorder(),
                ),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? tr('أدخل اسم البنك') : null,
              ),
            ],

            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : Text(tr('إرسال الطلب')),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Trip earning card ─────────────────────────────────────────────────────────

class _TripEarningCard extends StatelessWidget {
  final TripEarning trip;
  const _TripEarningCard({required this.trip});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final isCash = trip.isCash;
    final amount = isCash ? trip.totalAmount : trip.driverPayoutAmount;
    return AppCard(
      child: Row(
        children: [
          IconBadge(
            icon: isCash ? Icons.payments_rounded : Icons.credit_card_rounded,
            color: isCash ? AppColors.secondary : AppColors.primary,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(routeLabel(trip.originCity, trip.destinationCity), style: t.titleSmall),
                const SizedBox(height: 2),
                Text(
                  '${Fmt.dayShort(trip.departureTime)} · ${Fmt.time(trip.departureTime)}'
                  '${trip.seatsCount > 1 ? ' · ${Fmt.seats(trip.seatsCount)}' : ''}',
                  style: t.bodySmall,
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(Fmt.money(amount),
                  style: t.titleMedium?.copyWith(
                    color: isCash ? AppColors.warning : Theme.of(context).colorScheme.primary,
                    fontWeight: FontWeight.w800,
                  )),
              Text(isCash ? tr('محصّل نقداً') : tr('صافي بعد العمولة'), style: t.labelSmall),
            ],
          ),
        ],
      ),
    );
  }
}
