import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../bookings/providers/bookings_provider.dart';
import '../../providers/disputes_provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/services/upload_service.dart';
import '../../../../core/theme/app_theme.dart';

const _passengerReasons = [
  ('no_show_driver', 'السائق لم يحضر'),
  ('unsafe_driving', 'قيادة غير آمنة'),
  ('wrong_route', 'مسار خاطئ'),
  ('payment_mismatch', 'خلاف في المبلغ'),
  ('harassment', 'تحرش أو إزعاج'),
  ('other', 'أخرى'),
];

const _driverReasons = [
  ('no_show_passenger', 'الراكب لم يحضر'),
  ('payment_mismatch', 'خلاف في المبلغ'),
  ('harassment', 'تحرش أو إزعاج'),
  ('other', 'أخرى'),
];

class OpenDisputeScreen extends ConsumerStatefulWidget {
  final String bookingId;
  final String role; // 'passenger' or 'driver'
  const OpenDisputeScreen({
    super.key,
    required this.bookingId,
    this.role = 'passenger',
  });

  @override
  ConsumerState<OpenDisputeScreen> createState() => _OpenDisputeScreenState();
}

class _OpenDisputeScreenState extends ConsumerState<OpenDisputeScreen> {
  final _formKey = GlobalKey<FormState>();
  String? _reason;
  final _descCtrl = TextEditingController();
  // Evidence photos, uploaded privately as they are picked
  final List<UploadedImage> _evidence = [];
  bool _uploadingEvidence = false;

  Future<void> _addEvidence() async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1600, imageQuality: 85);
    if (file == null || !mounted) return;
    setState(() => _uploadingEvidence = true);
    try {
      final uploaded = await uploadImage(ref, file, private: true);
      if (mounted) setState(() => _evidence.add(uploaded));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تعذّر رفع الصورة، حاول مرة أخرى')),
        );
      }
    } finally {
      if (mounted) setState(() => _uploadingEvidence = false);
    }
  }

  List<(String, String)> get _reasons =>
      widget.role == 'driver' ? _driverReasons : _passengerReasons;

  @override
  void dispose() {
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final dispute = await ref.read(openDisputeProvider.notifier).open({
      'bookingId': widget.bookingId,
      'reason': _reason,
      'description': _descCtrl.text.trim(),
      if (_evidence.isNotEmpty) 'evidenceUrls': _evidence.map((e) => e.ref).toList(),
    });
    if (!mounted) return;
    if (dispute != null) {
      context.pushReplacement('/disputes/${dispute.id}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(openDisputeProvider);
    final loading = state is AsyncLoading;
    String? apiError;
    if (state is AsyncError) apiError = state.error.toString();

    final isDriver = widget.role == 'driver';
    // Both deadlines are admin-configurable, so the notice quotes what the backend will
    // actually enforce. Falls back to the defaults while the request is in flight.
    final policy = ref.watch(cancellationPolicyProvider).valueOrNull;
    final windowHours = (policy?.disputeWindowHours ?? 48).round();
    final slaHours = (policy?.disputeSlaHours ?? 48).round();

    return Scaffold(
      appBar: AppBar(
        title: Text(isDriver ? 'فتح نزاع على راكب' : 'فتح نزاع'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Card(
                color: Colors.orange.shade50,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline_rounded,
                          color: Colors.orange.shade700),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          isDriver
                              ? 'سيتم إخطار الراكب وأمامه $slaHours ساعة للرد، ثم يُراجع فريق يلا نسافر طلبك.'
                              : 'يمكن فتح النزاع خلال $windowHours ساعة من انتهاء الرحلة، وأمام السائق $slaHours ساعة للرد. سيُراجع فريق يلا نسافر طلبك.',
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),
              DropdownButtonFormField<String>(
                initialValue: _reason,
                decoration: const InputDecoration(
                  labelText: 'سبب النزاع',
                  prefixIcon: Icon(Icons.flag_outlined),
                ),
                items: _reasons
                    .map((r) => DropdownMenuItem(value: r.$1, child: Text(r.$2)))
                    .toList(),
                onChanged: (v) => setState(() => _reason = v),
                validator: (v) => v == null ? 'اختر السبب' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _descCtrl,
                decoration: const InputDecoration(
                  labelText: 'وصف المشكلة',
                  hintText: 'اشرح ما حدث بالتفصيل...',
                  alignLabelWithHint: true,
                ),
                maxLines: 5,
                maxLength: 1000,
                validator: (v) {
                  if (v == null || v.trim().length < 20) {
                    return 'اكتب وصفاً لا يقل عن 20 حرفاً';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 8),
              Text('صور داعمة (اختياري)', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 4),
              Text('لقطات شاشة أو صور تساعد فريقنا على فهم ما حدث — حتى 5 صور.',
                  style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 10),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final (i, e) in _evidence.indexed)
                    Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(AppRadius.md),
                          child: CachedNetworkImage(imageUrl: e.previewUrl, width: 84, height: 84, fit: BoxFit.cover),
                        ),
                        PositionedDirectional(
                          top: 4,
                          end: 4,
                          child: InkWell(
                            onTap: () => setState(() => _evidence.removeAt(i)),
                            child: const CircleAvatar(
                              radius: 11,
                              backgroundColor: Colors.black54,
                              child: Icon(Icons.close_rounded, size: 14, color: Colors.white),
                            ),
                          ),
                        ),
                      ],
                    ),
                  if (_evidence.length < 5)
                    InkWell(
                      onTap: _uploadingEvidence ? null : _addEvidence,
                      borderRadius: BorderRadius.circular(AppRadius.md),
                      child: Container(
                        width: 84,
                        height: 84,
                        decoration: BoxDecoration(
                          color: context.surfaceMuted,
                          borderRadius: BorderRadius.circular(AppRadius.md),
                          border: Border.all(color: context.dividerColor),
                        ),
                        child: _uploadingEvidence
                            ? const Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)))
                            : Icon(Icons.add_photo_alternate_rounded, color: Theme.of(context).colorScheme.primary),
                      ),
                    ),
                ],
              ),
              if (apiError != null) ...[
                const SizedBox(height: 8),
                Text(apiError,
                    style: const TextStyle(color: AppColors.error, fontSize: 13)),
              ],
              const SizedBox(height: 24),
              AppButton(
                label: 'إرسال النزاع',
                loading: loading,
                onPressed: _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
