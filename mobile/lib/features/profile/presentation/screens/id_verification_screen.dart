import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_endpoints.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../features/auth/providers/auth_provider.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/document_upload_tile.dart';
import '../../../../shared/widgets/ui.dart';

/// National ID verification: the 14-digit number plus photos of both sides of the card.
/// Photos are uploaded privately — only the admin reviewing them can open them.
class IdVerificationScreen extends ConsumerStatefulWidget {
  const IdVerificationScreen({super.key});

  @override
  ConsumerState<IdVerificationScreen> createState() => _IdVerificationScreenState();
}

class _IdVerificationScreenState extends ConsumerState<IdVerificationScreen> {
  final _nationalIdCtrl = TextEditingController();
  String? _frontRef;
  String? _backRef;
  bool _loading = false;
  String? _error;
  bool _submitted = false;

  @override
  void dispose() {
    _nationalIdCtrl.dispose();
    super.dispose();
  }

  bool get _canSubmit =>
      _nationalIdCtrl.text.trim().length == 14 && _frontRef != null && _backRef != null;

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(dioProvider).post(Endpoints.idVerification, data: {
        'nationalIdNumber': _nationalIdCtrl.text.trim(),
        'nationalIdPhotoUrl': _frontRef,
        'nationalIdBackPhotoUrl': _backRef,
      });
      await ref.read(authProvider.notifier).refreshUser();
      if (mounted) setState(() => _submitted = true);
    } on DioException catch (e) {
      setState(() => _error = ApiException.fromDioError(e).message);
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;

    if (_submitted) {
      return Scaffold(
        appBar: AppBar(title: const Text('توثيق الهوية')),
        body: EmptyState(
          icon: Icons.hourglass_top_rounded,
          color: AppColors.warning,
          title: 'تم إرسال طلب التوثيق',
          message: 'سيراجع فريقنا بياناتك خلال 24 ساعة، وسيصلك إشعار بالنتيجة.',
          actionLabel: 'العودة للحساب',
          onAction: () => context.go('/profile'),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('توثيق الهوية')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(20, 8, 20, 24 + MediaQuery.of(context).padding.bottom),
        children: [
          AppCard(
            color: Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.6),
            child: Row(
              children: [
                const IconBadge(icon: Icons.shield_rounded, color: AppColors.primary),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'التوثيق يبني الثقة بين الركاب والسائقين، ويفتح لك الرحلات النسائية إن كانت البطاقة لسيدة.',
                    style: t.bodyMedium,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Text('الرقم القومي', style: t.titleSmall),
          const SizedBox(height: 8),
          TextField(
            controller: _nationalIdCtrl,
            keyboardType: TextInputType.number,
            textDirection: TextDirection.ltr,
            maxLength: 14,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(
              hintText: '14 رقماً كما في البطاقة',
              prefixIcon: Icon(Icons.badge_rounded),
              counterText: '',
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 20),
          Text('صورة البطاقة', style: t.titleSmall),
          const SizedBox(height: 4),
          Text('صورة واضحة بالكامل، بدون انعكاس ضوء', style: t.bodySmall),
          const SizedBox(height: 10),
          DocumentUploadTile(
            label: 'الوجه الأمامي',
            hint: 'الجهة التي بها الصورة والاسم',
            icon: Icons.credit_card_rounded,
            onUploaded: (r) => setState(() => _frontRef = r),
          ),
          const SizedBox(height: 12),
          DocumentUploadTile(
            label: 'الوجه الخلفي',
            hint: 'الجهة التي بها العنوان',
            icon: Icons.flip_rounded,
            onUploaded: (r) => setState(() => _backRef = r),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(Icons.lock_rounded, size: 16, color: context.textMuted),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'صورك محفوظة بشكل خاص ولا يراها إلا فريق المراجعة.',
                  style: t.bodySmall,
                ),
              ),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: AppColors.error, fontSize: 13)),
          ],
          const SizedBox(height: 24),
          AppButton(
            label: 'إرسال للمراجعة',
            loading: _loading,
            onPressed: _canSubmit ? _submit : null,
          ),
        ],
      ),
    );
  }
}
