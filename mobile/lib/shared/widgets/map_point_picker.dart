import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import '../../core/theme/app_theme.dart';
import 'app_button.dart';
import '../../core/i18n/tr.dart';

const _tileUrl = String.fromEnvironment(
  'MAP_TILE_URL',
  defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
);

/// Full-screen map with a fixed centre pin: the driver pans the map under the pin to
/// the exact meeting point and confirms. Pops with the chosen LatLng.
class MapPointPicker extends StatefulWidget {
  final String title;
  final LatLng initial;
  const MapPointPicker({super.key, required this.title, required this.initial});

  @override
  State<MapPointPicker> createState() => _MapPointPickerState();
}

class _MapPointPickerState extends State<MapPointPicker> {
  final _controller = MapController();
  late LatLng _center = widget.initial;

  Future<void> _useMyLocation() async {
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) return;
      final pos = await Geolocator.getCurrentPosition();
      final here = LatLng(pos.latitude, pos.longitude);
      _controller.move(here, 16);
      setState(() => _center = here);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Stack(
        alignment: Alignment.center,
        children: [
          FlutterMap(
            mapController: _controller,
            options: MapOptions(
              initialCenter: widget.initial,
              initialZoom: 14,
              onPositionChanged: (camera, _) => setState(() => _center = camera.center),
            ),
            children: [
              TileLayer(urlTemplate: _tileUrl, userAgentPackageName: 'com.yalansafr.yala_nsafr'),
            ],
          ),
          // The pin's tip marks the map centre
          const Padding(
            padding: EdgeInsets.only(bottom: 44),
            child: Icon(Icons.location_on_rounded, size: 48, color: AppColors.error),
          ),
          PositionedDirectional(
            top: 16,
            end: 16,
            child: FloatingActionButton.small(
              heroTag: 'my-location',
              onPressed: _useMyLocation,
              child: const Icon(Icons.my_location_rounded),
            ),
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 16 + MediaQuery.of(context).padding.bottom,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: context.surfaceColor,
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    boxShadow: AppShadows.card,
                  ),
                  child: Text(tr('حرّك الخريطة حتى يكون الدبوس على نقطة التجمع بالضبط'),
                      textAlign: TextAlign.center),
                ),
                const SizedBox(height: 10),
                AppButton(label: tr('تأكيد الموقع'), onPressed: () => Navigator.pop(context, _center)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
