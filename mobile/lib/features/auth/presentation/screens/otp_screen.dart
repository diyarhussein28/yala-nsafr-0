import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:pinput/pinput.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../providers/auth_provider.dart';
import '../widgets/auth_scaffold.dart';
import '../../../../core/i18n/tr.dart';

class OtpScreen extends ConsumerStatefulWidget {
  final String phone;
  const OtpScreen({super.key, required this.phone});

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  String _code = '';
  bool _loading = false;
  String? _error;

  Future<void> _verify() async {
    if (_code.length < 6) return;
    setState(() { _loading = true; _error = null; });
    try {
      final isNewUser = await ref.read(authProvider.notifier).verifyOtp(widget.phone, _code);
      if (!mounted) return;
      if (isNewUser) {
        context.go('/auth/setup');
      } else {
        context.go('/search');
      }
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final defaultPinTheme = PinTheme(
      width: 50,
      height: 58,
      textStyle: Theme.of(context).textTheme.headlineSmall,
      decoration: BoxDecoration(
        color: context.surfaceMuted,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
    );

    return AuthScaffold(
      showBack: true,
      title: tr('أدخل رمز التحقق'),
      subtitle: tr('أرسلنا رمزاً من 6 أرقام إلى {0}', [widget.phone]),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Directionality(
            textDirection: TextDirection.ltr,
            child: Pinput(
              length: 6,
              autofocus: true,
              defaultPinTheme: defaultPinTheme,
              focusedPinTheme: defaultPinTheme.copyWith(
                decoration: defaultPinTheme.decoration!.copyWith(
                  color: context.surfaceColor,
                  border: Border.all(color: scheme.primary, width: 2),
                ),
              ),
              submittedPinTheme: defaultPinTheme.copyWith(
                decoration: defaultPinTheme.decoration!.copyWith(
                  color: scheme.primaryContainer,
                ),
              ),
              errorPinTheme: defaultPinTheme.copyWith(
                decoration: defaultPinTheme.decoration!.copyWith(
                  border: Border.all(color: AppColors.error),
                ),
              ),
              forceErrorState: _error != null,
              onChanged: (v) => setState(() {
                _code = v;
                _error = null;
              }),
              onCompleted: (_) => _verify(),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.error, fontSize: 13)),
          ],
          const SizedBox(height: 28),
          AppButton(
            label: tr('تأكيد والدخول'),
            loading: _loading,
            onPressed: _code.length == 6 ? _verify : null,
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: _loading ? null : () => Navigator.of(context).maybePop(),
            child: Text(tr('تغيير رقم الموبايل')),
          ),
        ],
      ),
    );
  }
}
