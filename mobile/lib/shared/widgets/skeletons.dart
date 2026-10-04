import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

// A single white box — takes the shimmer color from the parent Shimmer widget.
class _SBox extends StatelessWidget {
  final double? width; // null → fills available space
  final double height;
  final double radius;
  final bool circle;

  const _SBox({
    this.width,
    required this.height,
    this.radius = 6,
    this.circle = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width ?? double.infinity,
      height: height,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: circle ? null : BorderRadius.circular(radius),
        shape: circle ? BoxShape.circle : BoxShape.rectangle,
      ),
    );
  }
}

Widget _shimmerWrap(BuildContext context, Widget child) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  return Shimmer.fromColors(
    baseColor: isDark ? Colors.grey.shade800 : Colors.grey.shade200,
    highlightColor: isDark ? Colors.grey.shade700 : Colors.grey.shade50,
    child: child,
  );
}

// ── Trip search result card skeleton ─────────────────────────────────────────

class TripResultSkeleton extends StatelessWidget {
  const TripResultSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: _shimmerWrap(
          context,
          const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Driver row
              Row(
                children: [
                  _SBox(width: 44, height: 44, circle: true),
                  SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _SBox(width: 130, height: 13),
                        SizedBox(height: 6),
                        _SBox(width: 80, height: 10),
                      ],
                    ),
                  ),
                ],
              ),
              SizedBox(height: 16),
              // Info row
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _SBox(width: 100, height: 10),
                        SizedBox(height: 6),
                        _SBox(width: 70, height: 10),
                        SizedBox(height: 8),
                        _SBox(width: 120, height: 18, radius: 9),
                      ],
                    ),
                  ),
                  SizedBox(width: 16),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      _SBox(width: 64, height: 20),
                      SizedBox(height: 4),
                      _SBox(width: 40, height: 10),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── My-bookings / My-trips card skeleton ─────────────────────────────────────

class ListCardSkeleton extends StatelessWidget {
  const ListCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: _shimmerWrap(
          context,
          const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Title + status pill
              Row(
                children: [
                  Expanded(child: _SBox(height: 14)),
                  SizedBox(width: 12),
                  _SBox(width: 56, height: 22, radius: 11),
                ],
              ),
              SizedBox(height: 10),
              // Time + seats
              Row(
                children: [
                  _SBox(width: 110, height: 10),
                  Spacer(),
                  _SBox(width: 80, height: 10),
                ],
              ),
              SizedBox(height: 6),
              _SBox(width: 90, height: 10),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Notification tile skeleton ────────────────────────────────────────────────

class NotifTileSkeleton extends StatelessWidget {
  const NotifTileSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: _shimmerWrap(
        context,
        const Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SBox(width: 40, height: 40, circle: true),
            SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: _SBox(height: 13)),
                      SizedBox(width: 16),
                      _SBox(width: 36, height: 10),
                    ],
                  ),
                  SizedBox(height: 6),
                  _SBox(height: 10),
                  SizedBox(height: 4),
                  _SBox(width: 160, height: 10),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Convenience list builders ─────────────────────────────────────────────────

/// A scrollable list of [count] skeleton cards separated by 8px gaps.
class SkeletonCardList extends StatelessWidget {
  final Widget Function() itemBuilder;
  final int count;
  final EdgeInsetsGeometry padding;

  const SkeletonCardList({
    super.key,
    required this.itemBuilder,
    this.count = 5,
    this.padding = const EdgeInsets.all(16),
  });

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: padding,
      itemCount: count,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, __) => itemBuilder(),
    );
  }
}
