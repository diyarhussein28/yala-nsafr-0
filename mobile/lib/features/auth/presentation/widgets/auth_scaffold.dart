import 'package:flutter/material.dart';
import '../../../../core/i18n/tr.dart';
import '../../../../core/settings/app_settings.dart';
import '../../../../core/theme/app_theme.dart';

/// Shared frame for the sign-in steps: a branded gradient header with the logo mark,
/// and the step's content on a rounded sheet that rises over it.
class AuthScaffold extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget child;
  final bool showBack;

  const AuthScaffold({
    super.key,
    required this.title,
    required this.subtitle,
    required this.child,
    this.showBack = false,
  });

  @override
  Widget build(BuildContext context) {
    final topInset = MediaQuery.of(context).padding.top;
    return Scaffold(
      backgroundColor: AppColors.primaryDark,
      body: Column(
        children: [
          Container(
            width: double.infinity,
            decoration: const BoxDecoration(gradient: AppColors.heroGradient),
            padding: EdgeInsets.fromLTRB(24, topInset + 12, 24, 44),
            child: Column(
              children: [
                Row(
                  children: [
                    showBack
                        ? IconButton(
                            onPressed: () => Navigator.of(context).maybePop(),
                            icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                          )
                        : const SizedBox(height: 48),
                    const Spacer(),
                    // Language switch, available before signing in
                    TextButton.icon(
                      onPressed: () => AppSettings.setLanguage(isEnglish ? 'ar' : 'en'),
                      style: TextButton.styleFrom(foregroundColor: Colors.white),
                      icon: const Icon(Icons.translate_rounded, size: 18),
                      label: Text(isEnglish ? 'العربية' : 'English'),
                    ),
                  ],
                ),
                const _LogoMark(),
                const SizedBox(height: 18),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: Colors.white),
                ),
                const SizedBox(height: 6),
                Text(
                  subtitle,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Colors.white.withValues(alpha: 0.82),
                      ),
                ),
              ],
            ),
          ),
          Expanded(
            child: Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: Theme.of(context).scaffoldBackgroundColor,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
              ),
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(24, 32, 24, 24 + MediaQuery.of(context).padding.bottom),
                child: child,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LogoMark extends StatelessWidget {
  const _LogoMark();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 76,
      height: 76,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
      ),
      padding: const EdgeInsets.all(10),
      child: Image.asset('assets/images/app_mark.png'),
    );
  }
}
