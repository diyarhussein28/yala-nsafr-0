import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../core/i18n/tr.dart';
import '../../core/constants/egypt_cities.dart';

/// A white (or dark-surface) rounded card with the app's soft shadow.
class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? color;
  final BorderRadius? borderRadius;
  final Border? border;

  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpace.lg),
    this.onTap,
    this.color,
    this.borderRadius,
    this.border,
  });

  @override
  Widget build(BuildContext context) {
    final radius = borderRadius ?? BorderRadius.circular(AppRadius.lg);
    return Container(
      decoration: BoxDecoration(
        color: color ?? context.surfaceColor,
        borderRadius: radius,
        border: border ?? (context.isDark ? Border.all(color: context.dividerColor) : null),
        boxShadow: context.isDark ? null : AppShadows.card,
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: radius,
        child: InkWell(
          borderRadius: radius,
          onTap: onTap,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

/// Small rounded status label: tinted background, strong foreground.
class StatusPill extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;

  const StatusPill({super.key, required this.label, required this.color, this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: context.isDark ? 0.22 : 0.12),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700, height: 1.4),
          ),
        ],
      ),
    );
  }
}

/// Friendly empty / error state: icon in a soft circle, title, explanation, action.
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Color? color;

  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.actionLabel,
    this.onAction,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final tint = color ?? Theme.of(context).colorScheme.primary;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                color: tint.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 44, color: tint),
            ),
            const SizedBox(height: AppSpace.xl),
            Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
            if (message != null) ...[
              const SizedBox(height: AppSpace.sm),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: context.textMuted),
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: AppSpace.xl),
              FilledButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}

/// Section title with an optional trailing action.
class SectionHeader extends StatelessWidget {
  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;

  const SectionHeader({super.key, required this.title, this.actionLabel, this.onAction});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.md),
      child: Row(
        children: [
          Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium)),
          if (actionLabel != null)
            TextButton(onPressed: onAction, child: Text(actionLabel!)),
        ],
      ),
    );
  }
}

/// Circular avatar: network photo when there is one, otherwise the first letter.
class UserAvatar extends StatelessWidget {
  final String? photoUrl;
  final String name;
  final double size;

  const UserAvatar({super.key, this.photoUrl, required this.name, this.size = 44});

  @override
  Widget build(BuildContext context) {
    final initial = name.trim().isEmpty ? tr('؟') : name.trim().characters.first;
    final fallback = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        gradient: AppColors.heroGradient,
        shape: BoxShape.circle,
      ),
      child: Text(
        initial,
        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: size * 0.4),
      ),
    );
    if (photoUrl == null || photoUrl!.isEmpty) return fallback;
    return ClipOval(
      child: CachedNetworkImage(
        imageUrl: photoUrl!,
        width: size,
        height: size,
        fit: BoxFit.cover,
        placeholder: (_, __) => fallback,
        errorWidget: (_, __, ___) => fallback,
      ),
    );
  }
}

/// Origin → destination as a vertical timeline with times and places.
class RouteTimeline extends StatelessWidget {
  final String fromCity;
  final String toCity;
  final String? fromDetail;
  final String? toDetail;
  final String? fromTime;
  final String? toTime;
  final bool dense;

  const RouteTimeline({
    super.key,
    required this.fromCity,
    required this.toCity,
    this.fromDetail,
    this.toDetail,
    this.fromTime,
    this.toTime,
    this.dense = false,
  });

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    final gap = dense ? 14.0 : 22.0;
    // Both stops share the time column whenever either has a time, so the dots and the
    // line between them stay aligned.
    final hasTimes = fromTime != null || toTime != null;

    Widget stop(String city, String? detail, String? time, {required bool origin}) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (hasTimes)
            SizedBox(
              width: 50,
              child: Text(
                time ?? '',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
              ),
            ),
          Container(
            margin: const EdgeInsets.only(top: 5),
            width: 12,
            height: 12,
            decoration: BoxDecoration(
              color: origin ? context.surfaceColor : primary,
              shape: BoxShape.circle,
              border: Border.all(color: primary, width: 3),
            ),
          ),
          const SizedBox(width: AppSpace.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(placeName(city), style: Theme.of(context).textTheme.titleSmall?.copyWith(fontSize: 15)),
                if (detail != null && detail.isNotEmpty)
                  Text(placeName(detail), style: Theme.of(context).textTheme.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
        ],
      );
    }

    return Stack(
      children: [
        PositionedDirectional(
          start: (hasTimes ? 50 : 0) + 5.0,
          top: 18,
          bottom: 18,
          child: Container(width: 2, color: primary.withValues(alpha: 0.25)),
        ),
        Column(
          children: [
            stop(fromCity, fromDetail, fromTime, origin: true),
            SizedBox(height: gap),
            stop(toCity, toDetail, toTime, origin: false),
          ],
        ),
      ],
    );
  }
}

/// Label/value row used in summaries.
class InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final bool emphasize;
  final Color? valueColor;

  const InfoRow({super.key, required this.label, required this.value, this.emphasize = false, this.valueColor});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(child: Text(label, style: t.bodyMedium?.copyWith(color: context.textMuted))),
          Text(
            value,
            style: (emphasize ? t.titleMedium : t.titleSmall)?.copyWith(color: valueColor),
          ),
        ],
      ),
    );
  }
}

/// Tinted rounded square holding an icon — used in tiles, menus and stats.
class IconBadge extends StatelessWidget {
  final IconData icon;
  final Color color;
  final double size;

  const IconBadge({super.key, required this.icon, required this.color, this.size = 40});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color.withValues(alpha: context.isDark ? 0.2 : 0.12),
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: Icon(icon, color: color, size: size * 0.5),
    );
  }
}
