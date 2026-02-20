export const metadata = {
  title: "Privacy Policy - Breather",
};

export default function PrivacyPolicy() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 prose prose-invert">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-gray-400">Last updated: February 16, 2026</p>

      <h2>Introduction</h2>
      <p>
        Breather (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates the Breather application and
        related SMS messaging services. This Privacy Policy explains how we collect, use, and protect
        your personal information.
      </p>

      <h2>Information We Collect</h2>
      <ul>
        <li><strong>Phone Numbers:</strong> We collect phone numbers provided with direct consent for the purpose of sending SMS/MMS messages.</li>
        <li><strong>Message Content:</strong> We may store message logs for delivery confirmation and troubleshooting purposes.</li>
        <li><strong>Usage Data:</strong> Basic usage analytics to improve our services.</li>
      </ul>

      <h2>How We Use Your Information</h2>
      <ul>
        <li>To send SMS/MMS messages that you have consented to receive.</li>
        <li>To respond to your inquiries or requests.</li>
        <li>To improve and maintain our services.</li>
      </ul>

      <h2>SMS Messaging</h2>
      <p>
        By providing your phone number and opting in, you consent to receive text messages from us.
        Message frequency varies. Message and data rates may apply. You can opt out at any time by
        replying <strong>STOP</strong> to any message. Reply <strong>HELP</strong> for assistance.
      </p>

      <h2>Data Sharing</h2>
      <p>
        We do not sell, trade, or share your personal information with third parties, except as
        required to deliver messages (e.g., through our telecommunications provider, Twilio) or as
        required by law.
      </p>

      <h2>Data Retention</h2>
      <p>
        We retain your information only as long as necessary to provide our services. You may request
        deletion of your data at any time by contacting us.
      </p>

      <h2>Security</h2>
      <p>
        We implement reasonable security measures to protect your personal information from
        unauthorized access, alteration, or disclosure.
      </p>

      <h2>Contact Us</h2>
      <p>
        If you have questions about this Privacy Policy, please contact us at{" "}
        <a href="mailto:privacy@breather-chi.vercel.app">privacy@breather-chi.vercel.app</a>.
      </p>
    </main>
  );
}
