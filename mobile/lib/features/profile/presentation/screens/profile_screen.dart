import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_endpoints.dart';
import '../../../../features/auth/providers/auth_provider.dart';
import '../../../../shared/widgets/ui.dart';
import '../../../../core/i18n/tr.dart';
import '../../../../core/settings/app_settings.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  String _themeLabel(ThemeMode mode) => switch (mode) {
        ThemeMode.light => tr('فاتح'),
        ThemeMode.dark => tr('داكن'),
        ThemeMode.system => tr('حسب إعدادات الهاتف'),
      };

  Future<void> _pickLanguage() async {
    final code = await showModalBottomSheet<String>(
      context: context,
      useRootNavigator: true,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (value, label) in const [('ar', 'العربية'), ('en', 'English')])
              ListTile(
                title: Text(label),
                trailing: appLocale.value.languageCode == value
                    ? const Icon(Icons.check_rounded, color: AppColors.primary)
                    : null,
                onTap: () => Navigator.pop(ctx, value),
              ),
          ],
        ),
      ),
    );
    if (code == null || code == appLocale.value.languageCode) return;
    await AppSettings.setLanguage(code);
    // Remember it on the account too (best effort), so it follows the user.
    ref.read(authProvider.notifier).updateProfile({'preferredLanguage': code}).ignore();
  }

  Future<void> _pickTheme() async {
    final mode = await showModalBottomSheet<ThemeMode>(
      context: context,
      useRootNavigator: true,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (value, icon) in const [
              (ThemeMode.light, Icons.light_mode_rounded),
              (ThemeMode.dark, Icons.dark_mode_rounded),
              (ThemeMode.system, Icons.brightness_auto_rounded),
            ])
              ListTile(
                leading: Icon(icon),
                title: Text(_themeLabel(value)),
                trailing: appThemeMode.value == value
                    ? const Icon(Icons.check_rounded, color: AppColors.primary)
                    : null,
                onTap: () => Navigator.pop(ctx, value),
              ),
          ],
        ),
      ),
    );
    if (mode != null) await AppSettings.setThemeMode(mode);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(authProvider.notifier).refreshUser();
    });
  }

  Future<void> _refresh() => ref.read(authProvider.notifier).refreshUser();

  Future<void> _confirmSignOut() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(tr('تسجيل الخروج')),
        content: Text(tr('هل تريد تسجيل الخروج من حسابك؟')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: Text(tr('إلغاء'))),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(tr('خروج')),
          ),
        ],
      ),
    );
    if (ok == true) ref.read(authProvider.notifier).signOut();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    if (user == null) return const SizedBox.shrink();
    final t = Theme.of(context).textTheme;
    final isDriver = user.role == 'both' || user.role == 'driver' || user.canDrive;

    (String, Color) verifState(bool verified, bool pending) => verified
        ? (tr('موثّق'), AppColors.success)
        : pending
            ? (tr('قيد المراجعة'), AppColors.warning)
            : (tr('غير موثّق'), AppColors.textSecondary);
    final id = verifState(user.idVerified, user.idVerificationPending);
    final drv = verifState(user.driverVerified, user.driverVerificationPending);

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            Container(
              decoration: const BoxDecoration(gradient: AppColors.heroGradient),
              padding: EdgeInsets.fromLTRB(20, MediaQuery.of(context).padding.top + 8, 20, 28),
              child: Column(
                children: [
                  Row(
                    children: [
                      Text(tr('حسابي'), style: t.titleLarge?.copyWith(color: Colors.white)),
                      const Spacer(),
                      IconButton(
                        tooltip: tr('تعديل الملف'),
                        icon: const Icon(Icons.edit_outlined, color: Colors.white),
                        onPressed: () => context.push('/profile/edit'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(3),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white.withValues(alpha: 0.6), width: 2),
                    ),
                    child: UserAvatar(photoUrl: user.profilePhotoUrl, name: user.fullName, size: 88),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Flexible(
                        child: Text(user.fullName,
                            style: t.headlineSmall?.copyWith(color: Colors.white),
                            overflow: TextOverflow.ellipsis),
                      ),
                      if (user.idVerified) ...[
                        const SizedBox(width: 6),
                        const Icon(Icons.verified_rounded, color: Colors.white, size: 20),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Directionality(
                    textDirection: TextDirection.ltr,
                    child: Text(user.phoneNumber,
                        style: t.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: 0.8))),
                  ),
                  const SizedBox(height: 18),
                  Row(
                    children: [
                      _HeaderStat(
                        value: user.ratingCount > 0 ? user.ratingAverage.toStringAsFixed(1) : '—',
                        label: tr('التقييم'),
                        icon: Icons.star_rounded,
                      ),
                      _HeaderStat(value: '${user.completedTripsAsPassenger}', label: tr('رحلة كراكب')),
                      _HeaderStat(value: '${user.completedTripsAsDriver}', label: tr('رحلة كسائق')),
                    ],
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _MenuGroup(title: tr('التوثيق'), children: [
                    _MenuTile(
                      icon: Icons.badge_rounded,
                      color: AppColors.info,
                      title: tr('البطاقة الشخصية'),
                      subtitle: id.$1,
                      subtitleColor: id.$2,
                      onTap: user.idVerified || user.idVerificationPending
                          ? null
                          : () => context.push('/profile/id-verification'),
                    ),
                    _MenuTile(
                      icon: Icons.drive_eta_rounded,
                      color: AppColors.primary,
                      title: isDriver ? tr('توثيق السائق') : tr('كن سائقاً على يلا نسافر'),
                      subtitle: isDriver ? drv.$1 : tr('انشر رحلاتك وشارك تكلفة الطريق'),
                      subtitleColor: isDriver ? drv.$2 : null,
                      onTap: user.driverVerified || user.driverVerificationPending
                          ? null
                          : () => context.push('/profile/driver-verification'),
                    ),
                  ]),
                  if (isDriver) ...[
                    const SizedBox(height: 16),
                    _MenuGroup(title: tr('السائق'), children: [
                      _MenuTile(
                        icon: Icons.account_balance_wallet_rounded,
                        color: AppColors.success,
                        title: tr('أرباحي'),
                        subtitle: tr('الرصيد والسحب وسجل الرحلات'),
                        onTap: () => context.push('/drivers/earnings'),
                      ),
                    ]),
                    const SizedBox(height: 12),
                    _SubscriptionTile(),
                  ],
                  if (user.referralCode != null) ...[
                    const SizedBox(height: 16),
                    _ReferralCard(code: user.referralCode!, promoBalance: user.promoBalance),
                  ],
                  const SizedBox(height: 16),
                  _MenuGroup(title: tr('الإعدادات'), children: [
                    _MenuTile(
                      icon: Icons.translate_rounded,
                      color: AppColors.info,
                      title: tr('اللغة'),
                      subtitle: isEnglish ? 'English' : 'العربية',
                      onTap: _pickLanguage,
                    ),
                    _MenuTile(
                      icon: Icons.dark_mode_rounded,
                      color: AppColors.secondary,
                      title: tr('المظهر'),
                      subtitle: _themeLabel(appThemeMode.value),
                      onTap: _pickTheme,
                    ),
                  ]),
                  const SizedBox(height: 16),
                  _MenuGroup(title: tr('المساعدة'), children: [
                    _MenuTile(
                      icon: Icons.notifications_rounded,
                      color: AppColors.secondary,
                      title: tr('الإشعارات'),
                      onTap: () => context.push('/notifications'),
                    ),
                    _MenuTile(
                      icon: Icons.gavel_rounded,
                      color: AppColors.womenOnly,
                      title: tr('نزاعاتي'),
                      subtitle: tr('متابعة البلاغات والنزاعات المفتوحة'),
                      onTap: () => context.push('/disputes'),
                    ),
                  ]),
                  if (user.role == 'admin') ...[
                    const SizedBox(height: 16),
                    _MenuGroup(title: tr('الإدارة'), children: [
                      _MenuTile(icon: Icons.dashboard_rounded, color: AppColors.primary, title: tr('لوحة التحكم'), onTap: () => context.push('/admin')),
                      _MenuTile(icon: Icons.people_alt_rounded, color: AppColors.info, title: tr('المستخدمون والتوثيق'), onTap: () => context.push('/admin/users')),
                      _MenuTile(icon: Icons.route_rounded, color: AppColors.primary, title: tr('الرحلات'), onTap: () => context.push('/admin/trips')),
                      _MenuTile(icon: Icons.gavel_rounded, color: AppColors.womenOnly, title: tr('النزاعات'), onTap: () => context.push('/admin/disputes')),
                      _MenuTile(icon: Icons.payments_rounded, color: AppColors.success, title: tr('طلبات السحب'), onTap: () => context.push('/admin/withdrawals')),
                      _MenuTile(icon: Icons.tune_rounded, color: AppColors.secondary, title: tr('إعدادات المنصة'), onTap: () => context.push('/admin/config')),
                    ]),
                  ],
                  const SizedBox(height: 24),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.error,
                      side: BorderSide(color: AppColors.error.withValues(alpha: 0.4)),
                    ),
                    icon: const Icon(Icons.logout_rounded),
                    label: Text(tr('تسجيل الخروج')),
                    onPressed: _confirmSignOut,
                  ),
                  const SizedBox(height: 12),
                  Text(tr('يلا نسافر'), textAlign: TextAlign.center, style: t.labelSmall),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeaderStat extends StatelessWidget {
  final String value;
  final String label;
  final IconData? icon;
  const _HeaderStat({required this.value, required this.label, this.icon});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (icon != null) ...[
                  Icon(icon, color: AppColors.secondary, size: 18),
                  const SizedBox(width: 3),
                ],
                Text(value, style: t.titleLarge?.copyWith(color: Colors.white)),
              ],
            ),
            Text(label, style: t.labelSmall?.copyWith(color: Colors.white.withValues(alpha: 0.8))),
          ],
        ),
      ),
    );
  }
}

class _MenuGroup extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _MenuGroup({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.only(start: 4, bottom: 8),
          child: Text(title, style: Theme.of(context).textTheme.labelMedium),
        ),
        AppCard(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Column(
            children: [
              for (var i = 0; i < children.length; i++) ...[
                if (i > 0) Divider(indent: 64, endIndent: 16, color: context.dividerColor),
                children[i],
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _MenuTile extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String? subtitle;
  final Color? subtitleColor;
  final VoidCallback? onTap;

  const _MenuTile({
    required this.icon,
    required this.color,
    required this.title,
    this.subtitle,
    this.subtitleColor,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      leading: IconBadge(icon: icon, color: color, size: 38),
      title: Text(title, style: Theme.of(context).textTheme.titleSmall),
      subtitle: subtitle == null
          ? null
          : Text(subtitle!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: subtitleColor,
                    fontWeight: subtitleColor != null ? FontWeight.w600 : null,
                  )),
      trailing: onTap != null ? Icon(Icons.chevron_right_rounded, color: context.textMuted) : null,
    );
  }
}

class _ReferralCard extends StatelessWidget {
  final String code;
  final double promoBalance;
  const _ReferralCard({required this.code, required this.promoBalance});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      color: AppColors.secondary.withValues(alpha: context.isDark ? 0.14 : 0.1),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        side: BorderSide(color: AppColors.secondary.withValues(alpha: 0.35)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.card_giftcard_rounded, color: context.readable(AppColors.primary)),
                const SizedBox(width: 8),
                Text(
                  tr('دعوة الأصدقاء'),
                  style: theme.textTheme.titleMedium?.copyWith(
                      color: context.readable(AppColors.primary), fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              tr('شارك كودك واحصل على 30 جنيه لكل صديق يكمل أول رحلة'),
              style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 12),
            InkWell(
              onTap: () async {
                await Clipboard.setData(ClipboardData(text: code));
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(tr('تم نسخ الكود!')),
                      duration: const Duration(seconds: 2),
                    ),
                  );
                }
              },
              borderRadius: BorderRadius.circular(8),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                      color: AppColors.primary.withValues(alpha: 0.3), width: 1.5),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      code,
                      style: theme.textTheme.titleLarge?.copyWith(
                        color: context.readable(AppColors.primary),
                        fontWeight: FontWeight.w800,
                        letterSpacing: 4,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Icon(Icons.copy_rounded,
                        size: 18, color: context.readable(AppColors.primary)),
                  ],
                ),
              ),
            ),
            if (promoBalance > 0) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(Icons.account_balance_wallet_rounded,
                      size: 16, color: Colors.green),
                  const SizedBox(width: 6),
                  Text(
                    tr('رصيدك الترحيبي: {0} جنيه', [promoBalance.toStringAsFixed(0)]),
                    style: theme.textTheme.bodySmall?.copyWith(
                        color: Colors.green, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ── Subscription tile ─────────────────────────────────────────────────────────

class _SubscriptionTile extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusAsync = ref.watch(_subStatusProvider);

    return statusAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (data) {
        final isFreeTrial = data['isFreeTrial'] as bool? ?? false;
        final trialDaysLeft = data['trialDaysLeft'] as int? ?? 0;
        final sub = data['subscription'] as Map<String, dynamic>?;
        final isActive = data['isActive'] as bool? ?? (sub != null && sub['status'] == 'active');
        final price = (data['priceEgp'] as num?)?.toStringAsFixed(0) ?? '200';

        Color bgColor;
        Color borderColor;
        IconData icon;
        String title;
        String subtitle;

        if (isFreeTrial) {
          bgColor = Colors.green.shade50;
          borderColor = Colors.green.shade300;
          icon = Icons.verified_rounded;
          title = tr('الاشتراك المجاني');
          subtitle = tr('متبقي {0} يوم من الفترة المجانية', [trialDaysLeft]);
        } else if (isActive) {
          bgColor = AppColors.primary.withValues(alpha: 0.06);
          borderColor = AppColors.primary.withValues(alpha: 0.3);
          icon = Icons.workspace_premium_rounded;
          title = tr('مشترك Pro');
          subtitle = tr('اشتراك نشط — {0} ج/شهر', [price]);
        } else {
          bgColor = Colors.orange.shade50;
          borderColor = Colors.orange.shade300;
          icon = Icons.star_border_rounded;
          title = tr('اشترك في يلا Pro');
          subtitle = tr('انتهت الفترة المجانية — {0} ج/شهر لنشر الرحلات', [price]);
        }

        return GestureDetector(
          onTap: () => context.push('/subscription'),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: bgColor,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: borderColor),
            ),
            child: Row(
              children: [
                Icon(icon,
                    color: isFreeTrial
                        ? Colors.green.shade700
                        : isActive
                            ? AppColors.primary
                            : Colors.orange.shade700,
                    size: 28),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          style: const TextStyle(
                              fontWeight: FontWeight.bold, fontSize: 15)),
                      const SizedBox(height: 2),
                      Text(subtitle,
                          style: TextStyle(
                              fontSize: 12, color: Colors.grey[700])),
                    ],
                  ),
                ),
                if (!isActive)
                  const Icon(Icons.chevron_right_rounded, color: Colors.grey),
              ],
            ),
          ),
        );
      },
    );
  }
}

final _subStatusProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final res = await ref.read(dioProvider).get(Endpoints.subscriptionStatus);
  return res.data as Map<String, dynamic>;
});

