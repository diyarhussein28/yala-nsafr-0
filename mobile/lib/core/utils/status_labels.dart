import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../../core/i18n/tr.dart';

/// One place for how each backend status reads and looks, so a booking that is
/// "awaiting the driver" says so in Arabic everywhere instead of leaking raw codes.
class StatusStyle {
  final String label;
  final Color color;
  final IconData icon;
  const StatusStyle(this.label, this.color, this.icon);
}

StatusStyle bookingStatusStyle(String status) => switch (status) {
      'pending_payment' => StatusStyle(tr('في انتظار الدفع'), AppColors.warning, Icons.credit_card_rounded),
      'pending_driver_approval' => StatusStyle(tr('في انتظار موافقة السائق'), AppColors.warning, Icons.hourglass_top_rounded),
      'confirmed' => StatusStyle(tr('حجز مؤكد'), AppColors.success, Icons.check_circle_rounded),
      'in_progress' => StatusStyle(tr('الرحلة جارية'), AppColors.info, Icons.directions_car_rounded),
      'trip_completed' => StatusStyle(tr('مكتملة'), AppColors.primary, Icons.flag_rounded),
      'cancelled_by_passenger' => StatusStyle(tr('ألغيتَ الحجز'), AppColors.textSecondary, Icons.cancel_rounded),
      'cancelled_by_driver' => StatusStyle(tr('ألغاه السائق'), AppColors.error, Icons.cancel_rounded),
      'disputed' => StatusStyle(tr('نزاع مفتوح'), AppColors.womenOnly, Icons.gavel_rounded),
      'refunded' => StatusStyle(tr('تم الاسترداد'), AppColors.textSecondary, Icons.undo_rounded),
      _ => StatusStyle(status, AppColors.textSecondary, Icons.info_rounded),
    };

StatusStyle tripStatusStyle(String status) => switch (status) {
      'scheduled' => StatusStyle(tr('مجدولة'), AppColors.info, Icons.schedule_rounded),
      'active' || 'ongoing' => StatusStyle(tr('جارية الآن'), AppColors.success, Icons.directions_car_rounded),
      'completed' => StatusStyle(tr('مكتملة'), AppColors.primary, Icons.flag_rounded),
      'cancelled' => StatusStyle(tr('ملغاة'), AppColors.error, Icons.cancel_rounded),
      _ => StatusStyle(status, AppColors.textSecondary, Icons.info_rounded),
    };
