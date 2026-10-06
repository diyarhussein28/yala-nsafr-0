import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_endpoints.dart';
import '../../../../features/auth/providers/auth_provider.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/document_upload_tile.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/i18n/tr.dart';

class DriverVerificationScreen extends ConsumerStatefulWidget {
  const DriverVerificationScreen({super.key});

  @override
  ConsumerState<DriverVerificationScreen> createState() =>
      _DriverVerificationScreenState();
}

class _DriverVerificationScreenState
    extends ConsumerState<DriverVerificationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _makeCtrl = TextEditingController();
  final _modelCtrl = TextEditingController();
  final _yearCtrl = TextEditingController();
  final _colorCtrl = TextEditingController();
  final _plateCtrl = TextEditingController();
  bool _loading = false;
  String? _error;
  bool _submitted = false;
  String? _licenceRef;
  String? _carPhotoRef;
  String? _selfieRef;

  @override
  void initState() {
    super.initState();
    final user = ref.read(authProvider).user;
    if (user != null) {
      _makeCtrl.text = user.vehicleMake ?? '';
      _modelCtrl.text = user.vehicleModel ?? '';
      _yearCtrl.text = user.vehicleYear?.toString() ?? '';
      _colorCtrl.text = user.vehicleColor ?? '';
      _plateCtrl.text = user.vehiclePlate ?? '';
    }
  }

  @override
  void dispose() {
    _makeCtrl.dispose();
    _modelCtrl.dispose();
    _yearCtrl.dispose();
    _colorCtrl.dispose();
    _plateCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_licenceRef == null) {
      setState(() => _error = tr('ارفع صورة رخصة القيادة'));
      return;
    }
    if (_selfieRef == null) {
      setState(() => _error = tr('التقط صورة شخصية لوجهك'));
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      final dio = ref.read(dioProvider);
      await dio.post(Endpoints.driverVerification, data: {
        'vehicleMake': _makeCtrl.text.trim(),
        'vehicleModel': _modelCtrl.text.trim(),
        'vehicleYear': int.parse(_yearCtrl.text.trim()),
        'vehicleColor': _colorCtrl.text.trim(),
        'vehiclePlate': _plateCtrl.text.trim().toUpperCase(),
        'drivingLicencePhotoUrl': _licenceRef,
        if (_carPhotoRef != null) 'vehiclePhotoUrl': _carPhotoRef,
        'selfiePhotoUrl': _selfieRef,
      });
      await ref.read(authProvider.notifier).refreshUser();
      setState(() => _submitted = true);
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_submitted) {
      return Scaffold(
        appBar: AppBar(title: Text(tr('تحقق السائق'))),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.hourglass_top_rounded,
                    size: 72, color: Colors.orange),
                const SizedBox(height: 16),
                Text(
                  tr('تم إرسال بيانات السيارة\nسيتم مراجعتها خلال 48 ساعة'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 18),
                ),
                const SizedBox(height: 24),
                AppButton(
                  label: tr('العودة للملف الشخصي'),
                  onPressed: () => context.go('/profile'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(tr('تحقق السائق'))),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                tr('أدخل بيانات سيارتك ليتمكن الفريق من التحقق منها'),
                style: const TextStyle(fontSize: 15),
              ),
              if (!(ref.watch(authProvider).user?.idVerified ?? false)) ...[
                const SizedBox(height: 14),
                _IdFirstNotice(
                  pending: ref.watch(authProvider).user?.idVerificationPending ?? false,
                ),
              ],
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _makeCtrl,
                      decoration: InputDecoration(labelText: tr('الماركة')),
                      validator: (v) =>
                          v == null || v.trim().isEmpty ? tr('مطلوب') : null,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _modelCtrl,
                      decoration: InputDecoration(labelText: tr('الموديل')),
                      validator: (v) =>
                          v == null || v.trim().isEmpty ? tr('مطلوب') : null,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _yearCtrl,
                      decoration: InputDecoration(labelText: tr('سنة الصنع')),
                      keyboardType: TextInputType.number,
                      validator: (v) {
                        final y = int.tryParse(v ?? '');
                        if (y == null || y < 2000 || y > DateTime.now().year) {
                          return tr('سنة غير صحيحة');
                        }
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _colorCtrl,
                      decoration: InputDecoration(labelText: tr('اللون')),
                      validator: (v) =>
                          v == null || v.trim().isEmpty ? tr('مطلوب') : null,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _plateCtrl,
                decoration: InputDecoration(
                  labelText: tr('رقم اللوحة'),
                  prefixIcon: const Icon(Icons.confirmation_number_rounded),
                ),
                textCapitalization: TextCapitalization.characters,
                validator: (v) =>
                    v == null || v.trim().isEmpty ? tr('مطلوب') : null,
              ),
              const SizedBox(height: 24),
              Text(tr('المستندات'), style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 10),
              DocumentUploadTile(
                label: tr('رخصة القيادة'),
                hint: tr('صورة واضحة للرخصة سارية المفعول'),
                icon: Icons.card_membership_rounded,
                onUploaded: (r) => setState(() => _licenceRef = r),
              ),
              const SizedBox(height: 12),
              DocumentUploadTile(
                label: tr('صورتك الشخصية'),
                hint: tr('التقط صورة واضحة لوجهك الآن — تقارنها الإدارة بصورة بطاقتك'),
                icon: Icons.face_retouching_natural_rounded,
                selfie: true,
                onUploaded: (r) => setState(() => _selfieRef = r),
              ),
              const SizedBox(height: 12),
              DocumentUploadTile(
                label: tr('صورة السيارة (اختياري)'),
                hint: tr('تظهر للركاب ليتعرّفوا على السيارة'),
                icon: Icons.directions_car_rounded,
                private: false,
                onUploaded: (r) => setState(() => _carPhotoRef = r),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!,
                    style: const TextStyle(color: AppColors.error, fontSize: 13)),
              ],
              const SizedBox(height: 28),
              AppButton(
                label: tr('إرسال للمراجعة'),
                loading: _loading,
                onPressed: _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}


/// Drivers are approved only after their ID is: say so up front, with the way to do it.
class _IdFirstNotice extends StatelessWidget {
  final bool pending;
  const _IdFirstNotice({required this.pending});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.info.withValues(alpha: context.isDark ? 0.18 : 0.08),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(Icons.badge_rounded, color: context.readable(AppColors.info)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              pending
                  ? tr('توثيق هويتك قيد المراجعة. تُراجع بيانات السائق بعد قبول الهوية.')
                  : tr('يجب توثيق هويتك أولاً — لن تتمكن من نشر رحلات قبل قبول الهوية وبيانات السائق.'),
              style: const TextStyle(height: 1.4),
            ),
          ),
          if (!pending)
            TextButton(
              onPressed: () => context.push('/profile/id-verification'),
              child: Text(tr('وثّق الآن')),
            ),
        ],
      ),
    );
  }
}
