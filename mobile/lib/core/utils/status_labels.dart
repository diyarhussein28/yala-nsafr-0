import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// One place for how each backend status reads and looks, so a booking that is
/// "awaiting the driver" says so in Arabic everywhere instead of leaking raw codes.
class StatusStyle {
  final String label;
  final Color color;
  final IconData icon;
  const StatusStyle(this.label, this.color, this.icon);
}

StatusStyle bookingStatusStyle(String status) => switch (status) {
      'pending_payment' => const StatusStyle('في انتظار الدفع', AppColors.warning, Icons.credit_card_rounded),
      'pending_driver_approval' => const StatusStyle('في انتظار موافقة السائق', AppColors.warning, Icons.hourglass_top_rounded),
      'confirmed' => const StatusStyle('حجز مؤكد', AppColors.success, Icons.check_circle_rounded),
      'in_progress' => const StatusStyle('الرحلة جارية', AppColors.info, Icons.directions_car_rounded),
      'trip_completed' => const StatusStyle('مكتملة', AppColors.primary, Icons.flag_rounded),
      'cancelled_by_passenger' => const StatusStyle('ألغيتَ الحجز', AppColors.textSecondary, Icons.cancel_rounded),
      'cancelled_by_driver' => const StatusStyle('ألغاه السائق', AppColors.error, Icons.cancel_rounded),
      'disputed' => const StatusStyle('نزاع مفتوح', AppColors.womenOnly, Icons.gavel_rounded),
      'refunded' => const StatusStyle('تم الاسترداد', AppColors.textSecondary, Icons.undo_rounded),
      _ => StatusStyle(status, AppColors.textSecondary, Icons.info_rounded),
    };

StatusStyle tripStatusStyle(String status) => switch (status) {
      'scheduled' => const StatusStyle('مجدولة', AppColors.info, Icons.schedule_rounded),
      'active' || 'ongoing' => const StatusStyle('جارية الآن', AppColors.success, Icons.directions_car_rounded),
      'completed' => const StatusStyle('مكتملة', AppColors.primary, Icons.flag_rounded),
      'cancelled' => const StatusStyle('ملغاة', AppColors.error, Icons.cancel_rounded),
      _ => StatusStyle(status, AppColors.textSecondary, Icons.info_rounded),
    };
