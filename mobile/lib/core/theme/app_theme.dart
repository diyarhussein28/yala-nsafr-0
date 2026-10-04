import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

/// Brand palette. A deep Nile green for primary actions, a warm desert amber as the
/// accent, and a neutral ink scale for text. Semantic colours are kept separate so a
/// status always reads the same way across screens.
class AppColors {
  AppColors._();

  // Brand
  static const primary = Color(0xFF0B7A62);
  static const primaryLight = Color(0xFF15A383);
  static const primaryDark = Color(0xFF07513F);
  static const primarySoft = Color(0xFFE3F4EF);
  static const secondary = Color(0xFFF2A516);
  static const secondarySoft = Color(0xFFFFF4DC);

  // Semantic
  static const error = Color(0xFFDC2626);
  static const errorSoft = Color(0xFFFDECEC);
  static const success = Color(0xFF16A34A);
  static const successSoft = Color(0xFFE6F6EC);
  static const warning = Color(0xFFD97706);
  static const warningSoft = Color(0xFFFFF3E0);
  static const info = Color(0xFF2563EB);
  static const infoSoft = Color(0xFFE8F0FE);
  static const womenOnly = Color(0xFFDB2777);
  static const womenOnlySoft = Color(0xFFFCE7F3);

  // Neutrals (light)
  static const background = Color(0xFFF4F6F5);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceMuted = Color(0xFFF0F2F1);
  static const onPrimary = Color(0xFFFFFFFF);
  static const onBackground = Color(0xFF111827);
  static const textSecondary = Color(0xFF5B6472);
  static const textTertiary = Color(0xFF8A93A0);
  static const divider = Color(0xFFE6E9EC);
  static const cardShadow = Color(0x14101828);

  // Neutrals (dark)
  static const darkBackground = Color(0xFF0D1412);
  static const darkSurface = Color(0xFF151F1C);
  static const darkSurfaceMuted = Color(0xFF1D2925);
  static const darkDivider = Color(0xFF26332F);
  static const darkText = Color(0xFFE8EEEC);
  static const darkTextSecondary = Color(0xFF9DAAA6);

  static const heroGradient = LinearGradient(
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
    colors: [Color(0xFF0B7A62), Color(0xFF07513F)],
  );
}

/// Spacing and radius scale, so screens compose from the same steps.
class AppSpace {
  AppSpace._();
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 20.0;
  static const xxl = 24.0;
  static const xxxl = 32.0;
}

class AppRadius {
  AppRadius._();
  static const sm = 10.0;
  static const md = 14.0;
  static const lg = 18.0;
  static const xl = 24.0;
  static const pill = 999.0;
}

class AppShadows {
  AppShadows._();
  static const card = [
    BoxShadow(color: Color(0x0F101828), blurRadius: 16, offset: Offset(0, 4)),
    BoxShadow(color: Color(0x08101828), blurRadius: 3, offset: Offset(0, 1)),
  ];
  static const raised = [
    BoxShadow(color: Color(0x1F0B3D30), blurRadius: 28, offset: Offset(0, 12)),
  ];
}

/// Theme-aware colours for widgets that need more than the ColorScheme gives them.
extension AppThemeContext on BuildContext {
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
  Color get textPrimary => isDark ? AppColors.darkText : AppColors.onBackground;
  Color get textMuted => isDark ? AppColors.darkTextSecondary : AppColors.textSecondary;
  Color get surfaceColor => isDark ? AppColors.darkSurface : AppColors.surface;
  Color get surfaceMuted => isDark ? AppColors.darkSurfaceMuted : AppColors.surfaceMuted;
  Color get dividerColor => isDark ? AppColors.darkDivider : AppColors.divider;
}

class AppTheme {
  AppTheme._();

  static TextTheme _textTheme(Color text, Color muted) => GoogleFonts.cairoTextTheme(
        TextTheme(
          displaySmall: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: text, height: 1.25),
          headlineLarge: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: text, height: 1.3),
          headlineMedium: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: text, height: 1.3),
          headlineSmall: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: text, height: 1.35),
          titleLarge: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: text),
          titleMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: text),
          titleSmall: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: text),
          bodyLarge: TextStyle(fontSize: 15, fontWeight: FontWeight.w400, color: text, height: 1.6),
          bodyMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w400, color: text, height: 1.55),
          bodySmall: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w400, color: muted, height: 1.5),
          labelLarge: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: text),
          labelMedium: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: muted),
          labelSmall: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: muted, letterSpacing: 0.2),
        ),
      );

  static ThemeData get light => _build(Brightness.light);
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final background = isDark ? AppColors.darkBackground : AppColors.background;
    final surface = isDark ? AppColors.darkSurface : AppColors.surface;
    final surfaceMuted = isDark ? AppColors.darkSurfaceMuted : AppColors.surfaceMuted;
    final text = isDark ? AppColors.darkText : AppColors.onBackground;
    final muted = isDark ? AppColors.darkTextSecondary : AppColors.textSecondary;
    final divider = isDark ? AppColors.darkDivider : AppColors.divider;
    final primary = isDark ? AppColors.primaryLight : AppColors.primary;
    final textTheme = _textTheme(text, muted);
    final cairo = GoogleFonts.cairo();

    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      brightness: brightness,
    ).copyWith(
      primary: primary,
      onPrimary: Colors.white,
      primaryContainer: isDark ? const Color(0xFF0E3B31) : AppColors.primarySoft,
      onPrimaryContainer: isDark ? const Color(0xFFB7EBDD) : AppColors.primaryDark,
      secondary: AppColors.secondary,
      onSecondary: const Color(0xFF3B2A00),
      secondaryContainer: isDark ? const Color(0xFF3D2E0A) : AppColors.secondarySoft,
      error: AppColors.error,
      surface: surface,
      onSurface: text,
      onSurfaceVariant: muted,
      surfaceContainerLowest: surface,
      surfaceContainerLow: isDark ? const Color(0xFF18231F) : const Color(0xFFF8FAF9),
      surfaceContainer: surfaceMuted,
      surfaceContainerHigh: isDark ? const Color(0xFF22302B) : const Color(0xFFEAEDEB),
      outline: isDark ? const Color(0xFF3A4A45) : const Color(0xFFCDD3D8),
      outlineVariant: divider,
    );

    OutlineInputBorder border(Color color, [double width = 1]) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: BorderSide(color: color, width: width),
        );

    final buttonShape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md));
    final buttonText = cairo.copyWith(fontSize: 16, fontWeight: FontWeight.w700);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      textTheme: textTheme,
      scaffoldBackgroundColor: background,
      splashFactory: InkSparkle.splashFactory,
      dividerColor: divider,
      dividerTheme: DividerThemeData(color: divider, thickness: 1, space: 1),
      appBarTheme: AppBarTheme(
        backgroundColor: background,
        foregroundColor: text,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: true,
        systemOverlayStyle: isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
        titleTextStyle: cairo.copyWith(fontSize: 18, fontWeight: FontWeight.w700, color: text),
        iconTheme: IconThemeData(color: text),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        surfaceTintColor: Colors.transparent,
        shadowColor: AppColors.cardShadow,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.lg),
          side: BorderSide(color: divider),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: Colors.white,
          disabledBackgroundColor: isDark ? const Color(0xFF26332F) : const Color(0xFFDDE3E0),
          disabledForegroundColor: muted,
          elevation: 0,
          minimumSize: const Size(double.infinity, 54),
          shape: buttonShape,
          textStyle: buttonText,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: Colors.white,
          disabledBackgroundColor: isDark ? const Color(0xFF26332F) : const Color(0xFFDDE3E0),
          disabledForegroundColor: muted,
          minimumSize: const Size(64, 50),
          shape: buttonShape,
          textStyle: buttonText,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: primary,
          side: BorderSide(color: isDark ? const Color(0xFF3A4A45) : const Color(0xFFCDD3D8)),
          minimumSize: const Size(double.infinity, 54),
          shape: buttonShape,
          textStyle: buttonText,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: primary,
          shape: buttonShape,
          textStyle: cairo.copyWith(fontSize: 14.5, fontWeight: FontWeight.w700),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(foregroundColor: text),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surfaceMuted,
        border: border(Colors.transparent),
        enabledBorder: border(Colors.transparent),
        focusedBorder: border(primary, 1.6),
        errorBorder: border(AppColors.error),
        focusedErrorBorder: border(AppColors.error, 1.6),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        hintStyle: TextStyle(color: muted, fontSize: 14),
        labelStyle: TextStyle(color: muted, fontSize: 14),
        floatingLabelStyle: TextStyle(color: primary, fontWeight: FontWeight.w600),
        prefixIconColor: muted,
        suffixIconColor: muted,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: surfaceMuted,
        selectedColor: scheme.primaryContainer,
        side: BorderSide.none,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill)),
        labelStyle: cairo.copyWith(fontSize: 13, fontWeight: FontWeight.w600, color: text),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        height: 68,
        indicatorColor: scheme.primaryContainer,
        indicatorShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => cairo.copyWith(
            fontSize: 12,
            fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
            color: states.contains(WidgetState.selected) ? primary : muted,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected) ? primary : muted,
            size: 24,
          ),
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: surface,
        selectedItemColor: primary,
        unselectedItemColor: muted,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: primary,
        unselectedLabelColor: muted,
        indicatorColor: primary,
        indicatorSize: TabBarIndicatorSize.label,
        dividerColor: divider,
        labelStyle: cairo.copyWith(fontSize: 14.5, fontWeight: FontWeight.w700),
        unselectedLabelStyle: cairo.copyWith(fontSize: 14.5, fontWeight: FontWeight.w500),
      ),
      listTileTheme: ListTileThemeData(
        iconColor: muted,
        titleTextStyle: textTheme.titleSmall,
        subtitleTextStyle: textTheme.bodySmall,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? Colors.white : (isDark ? muted : Colors.white),
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? primary : (isDark ? const Color(0xFF2F3D38) : const Color(0xFFD5DBD8)),
        ),
        trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
      ),
      checkboxTheme: CheckboxThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: divider,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.xl)),
        titleTextStyle: textTheme.titleLarge,
        contentTextStyle: textTheme.bodyMedium,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: isDark ? const Color(0xFF2A3833) : const Color(0xFF1F2A27),
        contentTextStyle: cairo.copyWith(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w500),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
        insetPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: primary),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        elevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.lg)),
      ),
      badgeTheme: const BadgeThemeData(backgroundColor: AppColors.error),
      datePickerTheme: DatePickerThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.xl)),
        headerBackgroundColor: primary,
        headerForegroundColor: Colors.white,
      ),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: PredictiveBackPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),
    );
  }
}
