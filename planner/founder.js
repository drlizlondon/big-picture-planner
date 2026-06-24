// Founding Access payment link — INVITE FLOW ONLY.
// This script is intentionally not loaded on any public landing page; it is
// used by invite.html, which is noindexed and only sent by email to invited
// founder users. Paste your Stripe Payment Link URL between the quotes below.
// Leave it empty to show the "opening shortly" message instead.
window.BPP_FOUNDING_ACCESS_URL = 'https://buy.stripe.com/4gM8wOgWa235fTfcAX2oE00';

window.openFoundingAccess = function (source) {
  var url = (window.BPP_FOUNDING_ACCESS_URL || '').trim();
  if (url) {
    // client_reference_id shows up on the Stripe payment, so purchases can be
    // attributed to the pricing box vs the bottom CTA.
    if (source) {
      url += (url.indexOf('?') === -1 ? '?' : '&') + 'client_reference_id=' + encodeURIComponent(source);
    }
    window.location.href = url;
  } else {
    alert('Founder payments are opening shortly. Try the demo in the meantime and check back soon.');
  }
};
