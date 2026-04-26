import 'package:flutter/material.dart';
import 'package:projectprice_app/project_price_legal.dart';

class LegalNoticeCard extends StatelessWidget {
  const LegalNoticeCard({
    super.key,
    this.message =
        'By using ProjectPrice, you agree to our Privacy Policy and Data Deletion terms. Homeowner accounts are for the mobile app; contractors should use the pro portal.',
  });

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF4F8FF),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFD6E6FF)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            message,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 8),
          TextButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const ProjectPriceLegalScreen(),
                ),
              );
            },
            icon: const Icon(Icons.policy_outlined),
            label: const Text('Legal & Privacy'),
          ),
        ],
      ),
    );
  }
}
