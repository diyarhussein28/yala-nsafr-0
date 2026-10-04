import 'package:flutter/material.dart';
import '../../core/models/trip.dart';
import '../../core/theme/app_theme.dart';
import '../../core/i18n/tr.dart';

class TripBadgeRow extends StatelessWidget {
  final bool womenOnly;
  final bool smokingAllowed;
  final bool petsAllowed;
  final bool airConditioning;
  final bool quietRide;
  final bool driverVerified;

  const TripBadgeRow({
    super.key,
    this.womenOnly = false,
    this.smokingAllowed = false,
    this.petsAllowed = false,
    this.airConditioning = false,
    this.quietRide = false,
    this.driverVerified = false,
  });

  factory TripBadgeRow.fromTrip(Trip trip) => TripBadgeRow(
        womenOnly: trip.womenOnly,
        smokingAllowed: trip.smokingAllowed,
        petsAllowed: trip.petsAllowed,
        airConditioning: trip.airConditioning,
        quietRide: trip.chatPreference == 'quiet',
        driverVerified: trip.driver.driverVerified,
      );

  @override
  Widget build(BuildContext context) {
    final specs = <_BadgeSpec>[];
    if (driverVerified) {
      specs.add(_BadgeSpec(Icons.verified_rounded, tr('موثق'), AppColors.primary));
    }
    if (womenOnly) {
      specs.add(_BadgeSpec(Icons.female_rounded, tr('نساء فقط'), AppColors.womenOnly));
    }
    if (airConditioning) {
      specs.add(_BadgeSpec(Icons.ac_unit_rounded, tr('تكييف'), Colors.lightBlue));
    }
    if (smokingAllowed) {
      specs.add(_BadgeSpec(Icons.smoking_rooms_rounded, tr('تدخين'), Colors.amber.shade700));
    }
    if (petsAllowed) {
      specs.add(_BadgeSpec(Icons.pets_rounded, tr('حيوانات'), Colors.green.shade600));
    }
    if (quietRide) {
      specs.add(_BadgeSpec(Icons.volume_off_rounded, tr('هادئة'), Colors.indigo));
    }

    if (specs.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Wrap(
        spacing: 4,
        runSpacing: 4,
        children: specs.map((s) => _Pill(spec: s)).toList(),
      ),
    );
  }
}

class _BadgeSpec {
  final IconData icon;
  final String label;
  final Color color;
  const _BadgeSpec(this.icon, this.label, this.color);
}

class _Pill extends StatelessWidget {
  final _BadgeSpec spec;
  const _Pill({required this.spec});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: spec.color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: spec.color.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(spec.icon, size: 11, color: spec.color),
          const SizedBox(width: 3),
          Text(
            spec.label,
            style: TextStyle(
              fontSize: 10,
              color: spec.color,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
