import 'package:flutter/material.dart';
import 'package:projectprice_app/app_supabase.dart';
import 'package:projectprice_app/splash_screen.dart';
import 'package:projectprice_app/theme_data.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeProjectPriceSupabase();
  runApp(const ProjectPriceApp());
}

class ProjectPriceApp extends StatelessWidget {
  const ProjectPriceApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ProjectPrice',
      debugShowCheckedModeBanner: false,
      theme: ProjectPriceTheme.light(),
      home: const SplashScreen(),
    );
  }
}
