import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../api/api_client.dart';
import '../api/api_endpoints.dart';

/// Result of an upload: `ref` is what gets submitted to the API, `previewUrl` is what the
/// app can show. For private files (ID, licence, evidence) `ref` is an opaque reference
/// and `previewUrl` a short-lived signed link.
class UploadedImage {
  final String ref;
  final String previewUrl;
  const UploadedImage(this.ref, this.previewUrl);
}

/// Uploads a picked image. Read as bytes rather than from a path so it works on every
/// platform, including the web build.
Future<UploadedImage> uploadImage(WidgetRef ref, XFile file, {bool private = false}) async {
  final bytes = await file.readAsBytes();
  final name = file.name.isNotEmpty ? file.name : 'photo.jpg';
  final form = FormData.fromMap({
    'photo': MultipartFile.fromBytes(bytes, filename: name, contentType: _contentType(name)),
  });
  final res = await ref.read(dioProvider).post<Map<String, dynamic>>(
        Endpoints.uploadPhoto,
        data: form,
        queryParameters: private ? {'visibility': 'private'} : null,
      );
  final data = res.data ?? const {};
  final url = data['url'] as String? ?? '';
  return UploadedImage(data['ref'] as String? ?? url, url);
}

DioMediaType _contentType(String name) {
  final lower = name.toLowerCase();
  if (lower.endsWith('.png')) return DioMediaType('image', 'png');
  if (lower.endsWith('.webp')) return DioMediaType('image', 'webp');
  return DioMediaType('image', 'jpeg');
}
