'use strict';

const productCatalog = {
  product: 'PANORAFUS.AI Global Institution Membership',
  status: 'pilot',
  billingInterval: 'month',
  currency: 'USD',
  checkoutAvailable: false,
  contact: 'paul@seasonedchristianministrychurch.community',
  plans: [
    {
      id: 'community',
      name: 'Community',
      amountMinor: 0,
      features: [
        'Free public access to PANORAFUS.AI resources',
        'Basic institution directory listing where eligible'
      ]
    },
    {
      id: 'profile-plus',
      name: 'Profile Plus',
      amountMinor: 1900,
      features: [
        'Enhanced institution profile of up to 250 words',
        'One website link',
        'One profile update per month'
      ]
    },
    {
      id: 'featured-profile',
      name: 'Featured Profile',
      amountMinor: 4900,
      features: [
        'Everything in Profile Plus',
        'Clearly labeled sponsored placement in one relevant directory category'
      ]
    }
  ],
  terms: [
    'Paid pilot service is fulfilled manually after written confirmation and monthly invoicing.',
    'Prices are pilot prices in USD; taxes, local availability, and any localized quote are confirmed before an order.',
    'Sponsored placement is not verification, endorsement, or a guarantee of ranking, traffic, or outcomes.',
    'Core public resources remain free. No online checkout or automatic renewal is available.'
  ]
};

function getProductCatalog() {
  return productCatalog;
}

module.exports = { getProductCatalog };
