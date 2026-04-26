import 'package:flutter/material.dart';

class ProjectPriceLegalScreen extends StatelessWidget {
  const ProjectPriceLegalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Legal & Privacy')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'ProjectPrice Legal Information',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 10),
              const Text(
                'ProjectPrice is for homeowner accounts in the mobile app. '
                'Professional accounts should use the pro portal.',
              ),
              const SizedBox(height: 20),
              const _LegalCard(
                title: 'Privacy Policy',
                description:
                    'How ProjectPrice handles app and website data.',
                url: 'https://project-price-app.netlify.app/privacy-policy.html',
              ),
              const SizedBox(height: 12),
              const _LegalCard(
                title: 'Data Deletion',
                description:
                    'How to request deletion of eligible account-related data.',
                url: 'https://project-price-app.netlify.app/data-deletion.html',
              ),
              const SizedBox(height: 20),
              const Text(
                'Tip: If links do not open automatically in your app environment, '
                'copy the URL and open it in your browser.',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LegalCard extends StatelessWidget {
  const _LegalCard({
    required this.title,
    required this.description,
    required this.url,
  });

  final String title;
  final String description;
  final String url;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF6FBFF),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFD6E6FF)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(description),
          const SizedBox(height: 8),
          SelectableText(
            url,
            style: const TextStyle(color: Color(0xFF0E3A78)),
          ),
        ],
      ),
    );
  }
}
