import 'package:flutter/material.dart';

class ProjectPriceTheme {
  // Derived from the official logo: deep navy + emerald accent.
  static const Color navy = Color(0xFF0E3A78);
  static const Color emerald = Color(0xFF16A36A);
  static const Color white = Colors.white;

  static ThemeData light() {
    const colorScheme = ColorScheme.light(
      primary: navy,
      onPrimary: white,
      secondary: emerald,
      onSecondary: white,
      surface: white,
      onSurface: navy,
      error: Color(0xFFB3261E),
      onError: white,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: white,
      appBarTheme: const AppBarTheme(
        backgroundColor: white,
        foregroundColor: navy,
        elevation: 0,
        centerTitle: false,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: emerald,
          foregroundColor: white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        ),
      ),
      textTheme: const TextTheme(
        headlineMedium: TextStyle(
          color: navy,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.4,
        ),
        titleLarge: TextStyle(
          color: navy,
          fontWeight: FontWeight.w700,
        ),
        titleMedium: TextStyle(
          color: navy,
          fontWeight: FontWeight.w700,
        ),
        bodyMedium: TextStyle(
          color: navy,
        ),
      ),
      snackBarTheme: const SnackBarThemeData(
        backgroundColor: emerald,
        contentTextStyle: TextStyle(color: white, fontWeight: FontWeight.w600),
      ),
    );
  }
}
