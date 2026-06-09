// Founding Access payment link.
// Paste your Stripe Payment Link URL between the quotes below.
// Leave it empty to show the "opening shortly" message instead.
window.BPP_FOUNDING_ACCESS_URL = 'https://buy.stripe.com/4gM8wOgWa235fTfcAX2oE00';

window.openFoundingAccess = function () {
  var url = (window.BPP_FOUNDING_ACCESS_URL || '').trim();
  if (url) {
    window.location.href = url;
  } else {
    alert('Founder payments are opening shortly. Join the waitlist and we will send your invite.');
  }
};
