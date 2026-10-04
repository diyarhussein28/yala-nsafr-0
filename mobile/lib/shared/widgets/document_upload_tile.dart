import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/services/upload_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/i18n/tr.dart';

/// A tappable slot for one document photo (ID front/back, licence, car...). Picks from
/// camera or gallery, uploads privately, and reports the stored reference.
class DocumentUploadTile extends ConsumerStatefulWidget {
  final String label;
  final String hint;
  final IconData icon;
  final bool private;
  final String? initialPreviewUrl;
  final ValueChanged<String?> onUploaded;

  const DocumentUploadTile({
    super.key,
    required this.label,
    required this.hint,
    required this.onUploaded,
    this.icon = Icons.badge_rounded,
    this.private = true,
    this.initialPreviewUrl,
  });

  @override
  ConsumerState<DocumentUploadTile> createState() => _DocumentUploadTileState();
}

class _DocumentUploadTileState extends ConsumerState<DocumentUploadTile> {
  String? _preview;
  bool _uploading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _preview = widget.initialPreviewUrl;
  }

  Future<void> _pick() async {
    final source = await showModalBottomSheet<ImageSource>(
      useRootNavigator: true,
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_rounded),
              title: Text(tr('التقاط صورة')),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_rounded),
              title: Text(tr('اختيار من المعرض')),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (source == null) return;
    final file = await ImagePicker().pickImage(source: source, maxWidth: 1600, imageQuality: 85);
    if (file == null || !mounted) return;

    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      final uploaded = await uploadImage(ref, file, private: widget.private);
      if (!mounted) return;
      setState(() => _preview = uploaded.previewUrl);
      widget.onUploaded(uploaded.ref);
    } catch (_) {
      if (mounted) setState(() => _error = tr('تعذّر رفع الصورة، حاول مرة أخرى'));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final t = Theme.of(context).textTheme;
    final done = _preview != null && !_uploading;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InkWell(
          onTap: _uploading ? null : _pick,
          borderRadius: BorderRadius.circular(AppRadius.lg),
          child: Container(
            height: 150,
            decoration: BoxDecoration(
              color: done ? null : context.surfaceMuted,
              borderRadius: BorderRadius.circular(AppRadius.lg),
              border: Border.all(
                color: _error != null
                    ? AppColors.error
                    : done
                        ? scheme.primary
                        : context.dividerColor,
                width: done ? 1.5 : 1,
              ),
            ),
            clipBehavior: Clip.antiAlias,
            child: _uploading
                ? const Center(child: CircularProgressIndicator())
                : done
                    ? Stack(
                        fit: StackFit.expand,
                        children: [
                          CachedNetworkImage(imageUrl: _preview!, fit: BoxFit.cover),
                          PositionedDirectional(
                            top: 8,
                            end: 8,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.black54,
                                borderRadius: BorderRadius.circular(AppRadius.pill),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.check_circle_rounded, color: Colors.white, size: 14),
                                  const SizedBox(width: 4),
                                  Text(tr('تم الرفع · اضغط للتغيير'),
                                      style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w600)),
                                ],
                              ),
                            ),
                          ),
                        ],
                      )
                    : Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(widget.icon, size: 36, color: scheme.primary),
                          const SizedBox(height: 8),
                          Text(widget.label, style: t.titleSmall),
                          const SizedBox(height: 2),
                          Text(widget.hint, style: t.bodySmall),
                        ],
                      ),
          ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(_error!, style: const TextStyle(color: AppColors.error, fontSize: 12.5)),
          ),
      ],
    );
  }
}
