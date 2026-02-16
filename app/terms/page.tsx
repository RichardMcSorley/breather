export const metadata = {
  title: "Terms & Conditions - Breather",
};

export default function TermsAndConditions() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 prose prose-invert">
      <h1>Terms &amp; Conditions</h1>
      <p className="text-sm text-gray-400">Last updated: February 16, 2026</p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using Breather (&quot;the Service&quot;), you agree to be bound by these
        Terms &amp; Conditions. If you do not agree, do not use the Service.
      </p>

      <h2>2. Description of Service</h2>
      <p>
        Breather provides a gig worker expense tracking application and related SMS/MMS messaging
        services for personal and family communication purposes.
      </p>

      <h2>3. SMS/MMS Messaging Terms</h2>
      <ul>
        <li>By opting in, you consent to receive SMS/MMS messages from Breather.</li>
        <li>Message frequency varies based on your preferences and interactions.</li>
        <li>Message and data rates may apply depending on your mobile carrier plan.</li>
        <li>Reply <strong>STOP</strong> at any time to opt out of messages.</li>
        <li>Reply <strong>HELP</strong> for support information.</li>
        <li>Carriers are not liable for delayed or undelivered messages.</li>
      </ul>

      <h2>4. User Responsibilities</h2>
      <p>You agree to:</p>
      <ul>
        <li>Provide accurate information when using the Service.</li>
        <li>Not use the Service for any unlawful or unauthorized purpose.</li>
        <li>Not attempt to interfere with the proper functioning of the Service.</li>
      </ul>

      <h2>5. Intellectual Property</h2>
      <p>
        All content, features, and functionality of the Service are owned by Breather and are
        protected by applicable intellectual property laws.
      </p>

      <h2>6. Limitation of Liability</h2>
      <p>
        The Service is provided &quot;as is&quot; without warranties of any kind. We shall not be
        liable for any indirect, incidental, or consequential damages arising from your use of the
        Service.
      </p>

      <h2>7. Changes to Terms</h2>
      <p>
        We reserve the right to modify these Terms at any time. Continued use of the Service after
        changes constitutes acceptance of the updated Terms.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions about these Terms? Contact us at{" "}
        <a href="mailto:terms@breather-chi.vercel.app">terms@breather-chi.vercel.app</a>.
      </p>
    </main>
  );
}
