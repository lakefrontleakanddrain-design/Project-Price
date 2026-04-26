import 'package:flutter/material.dart';
import 'package:projectprice_app/legal_notice_card.dart';
import 'package:projectprice_app/my_projects_screen.dart';
import 'package:projectprice_app/price_project_screen.dart';
import 'package:projectprice_app/project_price_legal.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFEAF3FF), Color(0xFFFFFFFF)],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.asset(
                        'assets/images/app_icon_base.jpg',
                        width: 34,
                        height: 34,
                        fit: BoxFit.cover,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      'ProjectPrice',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Get 3 smart estimate tiers from a photo and request an exact contractor quote when you are ready.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 24),
                _ActionCard(
                  title: 'Price a Project',
                  subtitle: 'Take or upload a photo and describe the job',
                  icon: Icons.photo_camera_back,
                  color: const Color(0xFF0E3A78),
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const PriceProjectScreen(),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 14),
                _ActionCard(
                  title: 'My Projects',
                  subtitle:
                      'Review saved estimate options and homeowner account details',
                  icon: Icons.receipt_long,
                  color: const Color(0xFF16A36A),
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const MyProjectsScreen(),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 14),
                _ActionCard(
                  title: 'Find a Pro',
                  subtitle:
                      'Request one exclusive quote from local contractors',
                  icon: Icons.handyman,
                  color: const Color(0xFF1A73E8),
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const MyProjectsScreen(findProMode: true),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 14),
                _ActionCard(
                  title: 'Legal & Privacy',
                  subtitle: 'View privacy policy and data deletion details',
                  icon: Icons.policy_outlined,
                  color: const Color(0xFF35507A),
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const ProjectPriceLegalScreen(),
                      ),
                    );
                  },
                ),
                const Spacer(),
                const LegalNoticeCard(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Ink(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          color: Colors.white,
          boxShadow: const [
            BoxShadow(
              color: Color(0x150E3A78),
              blurRadius: 14,
              offset: Offset(0, 6),
            ),
          ],
          border: Border.all(color: const Color(0xFFE5EEFB)),
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: Colors.white),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 2),
                  Text(subtitle),
                ],
              ),
            ),
            const Icon(Icons.chevron_right),
          ],
        ),
      ),
    );
  }
}
