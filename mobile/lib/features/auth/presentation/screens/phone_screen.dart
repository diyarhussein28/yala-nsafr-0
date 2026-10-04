import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl_phone_field/intl_phone_field.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../providers/auth_provider.dart';
import '../widgets/auth_scaffold.dart';

class PhoneScreen extends ConsumerStatefulWidget {
  const PhoneScreen({super.key});

  @override
  ConsumerState<PhoneScreen> createState() => _PhoneScreenState();
}

class _PhoneScreenState extends ConsumerState<PhoneScreen> {
  String _completePhone = '';
  bool _phoneValid = false;
  bool _loading = false;
  String? _error;

  Future<void> _send() async {
    if (_completePhone.isEmpty) return;
    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(authProvider.notifier).sendOtp(_completePhone);
      if (mounted) {
        context.push('/auth/otp?phone=${Uri.encodeComponent(_completePhone)}');
      }
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = context.textMuted;
    return AuthScaffold(
      title: 'أهلاً بك في يلا نسافر',
      subtitle: 'رحلات بين المحافظات بأمان وبسعر أقل',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('رقم الموبايل', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            'هنبعتلك رمز تحقق في رسالة نصية',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 20),
          Directionality(
            textDirection: TextDirection.ltr,
            child: IntlPhoneField(
              initialCountryCode: 'EG',
              disableLengthCheck: false,
              decoration: const InputDecoration(hintText: '10X XXX XXXX', counterText: ''),
              onChanged: (phone) {
                setState(() {
                  _completePhone = phone.completeNumber;
                  _phoneValid = phone.isValidNumber();
                });
              },
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _send(),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: AppColors.error, fontSize: 13)),
          ],
          const SizedBox(height: 20),
          AppButton(
            label: 'إرسال رمز التحقق',
            loading: _loading,
            onPressed: _phoneValid ? _send : null,
          ),
          const SizedBox(height: 28),
          Row(
            children: [
              Icon(Icons.verified_user_rounded, size: 18, color: AppColors.primary.withValues(alpha: 0.8)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'سائقون موثّقون بالبطاقة والرخصة، ودفع آمن لا يُخصم إلا بعد انتهاء الرحلة.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: muted),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Text(
            'بالمتابعة أنت توافق على شروط الاستخدام وسياسة الخصوصية',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.labelSmall,
          ),
        ],
      ),
    );
  }
}
