import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — Juno',
}

export default function TermsOfService() {
  return (
    <div style={{
      background: '#0c0c0b',
      color: '#f0ead2',
      fontFamily: "'DM Sans', sans-serif",
      fontSize: '15px',
      lineHeight: 1.7,
      minHeight: '100vh',
    }}>
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 48px',
        height: '60px',
        borderBottom: '1px solid #222220',
      }}>
        <a href="/" style={{
          fontFamily: "'Instrument Serif', serif",
          fontSize: '22px',
          color: '#f0ead2',
          textDecoration: 'none',
          letterSpacing: '-0.02em',
        }}>juno<span style={{ color: '#c8f04a' }}>.</span></a>
        <a href="/" style={{ color: '#8a8678', textDecoration: 'none', fontSize: '14px' }}>
          &larr; Back to home
        </a>
      </nav>

      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '80px 24px 120px' }}>
        <h1 style={{
          fontFamily: "'Instrument Serif', serif",
          fontSize: '42px',
          fontWeight: 400,
          marginBottom: '8px',
          letterSpacing: '-0.02em',
        }}>Terms of Service</h1>
        <p style={{ color: '#8a8678', marginBottom: '48px' }}>Last updated: April 30, 2026</p>

        <Section title="1. Acceptance of Terms">
          <p>
            By accessing or using Juno (the &ldquo;Service&rdquo;), operated by Juno AI LLC (&ldquo;we,&rdquo;
            &ldquo;us,&rdquo; or &ldquo;our&rdquo;), you agree to be bound by these Terms of Service.
            If you do not agree to these terms, do not use the Service.
          </p>
        </Section>

        <Section title="2. Description of Service">
          <p>
            Juno is a keyword attribution platform that connects Google Ads to CRM systems
            (including HubSpot and RD Station) to calculate Customer Acquisition Cost (CAC) by keyword.
            The Service provides spend analysis, attribution reporting, and budget recommendations
            based on your advertising and CRM data.
          </p>
        </Section>

        <Section title="3. Account Registration">
          <p>To use Juno, you must:</p>
          <Ul items={[
            'Provide accurate and complete registration information.',
            'Be authorized to connect the Google Ads and CRM accounts you integrate with Juno.',
            'Maintain the security of your account credentials.',
            'Notify us immediately of any unauthorized use of your account.',
          ]} />
          <p>You are responsible for all activity that occurs under your account.</p>
        </Section>

        <Section title="4. Authorized Use of Third-Party APIs">
          <p>
            Juno accesses your Google Ads and CRM data through OAuth-authorized API connections that you
            explicitly grant. You represent that you have the authority to grant Juno access to these accounts
            and that your use of Juno complies with the terms of service of Google Ads, HubSpot, RD Station,
            and any other integrated platforms.
          </p>
        </Section>

        <Section title="5. Data Ownership">
          <p>
            You retain full ownership of your Google Ads data, CRM data, and any other data you provide to Juno.
            We do not claim ownership of your data. We use your data solely to provide and improve the Service
            as described in our <a href="/privacy" style={{ color: '#c8f04a' }}>Privacy Policy</a>.
          </p>
        </Section>

        <Section title="6. Acceptable Use">
          <p>You agree not to:</p>
          <Ul items={[
            'Use the Service for any unlawful purpose.',
            'Attempt to gain unauthorized access to any part of the Service or its systems.',
            'Reverse engineer, decompile, or disassemble any part of the Service.',
            'Use the Service to collect data about other users without their consent.',
            'Resell or redistribute the Service without our written permission.',
            'Interfere with or disrupt the integrity or performance of the Service.',
          ]} />
        </Section>

        <Section title="7. Service Availability">
          <p>
            We strive to maintain high availability but do not guarantee uninterrupted access to the Service.
            We may modify, suspend, or discontinue any part of the Service at any time with reasonable notice.
            We are not liable for any downtime, data sync delays, or temporary unavailability of
            third-party APIs (Google Ads, HubSpot, RD Station).
          </p>
        </Section>

        <Section title="8. Payment Terms">
          <p>
            Certain features of Juno may require a paid subscription. Payment terms, pricing, and billing
            cycles will be communicated to you before any charges are incurred. All fees are non-refundable
            unless otherwise stated in writing.
          </p>
        </Section>

        <Section title="9. Disclaimer of Warranties">
          <p>
            The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties
            of any kind, whether express or implied. We do not warrant that attribution results, CAC calculations,
            or budget recommendations will be error-free or that acting on them will produce specific financial outcomes.
            Juno provides data analysis tools — business decisions remain your responsibility.
          </p>
        </Section>

        <Section title="10. Limitation of Liability">
          <p>
            To the maximum extent permitted by law, Juno AI LLC shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages, including but not limited to loss of
            profits, data, or business opportunities, arising out of or related to your use of the Service.
            Our total liability shall not exceed the amount you paid us in the twelve (12) months preceding
            the claim.
          </p>
        </Section>

        <Section title="11. Termination">
          <p>
            You may stop using Juno and disconnect your integrations at any time.
            We may suspend or terminate your access if you violate these Terms.
            Upon termination, your right to use the Service ceases immediately,
            and we will delete your synced data in accordance with our <a href="/privacy" style={{ color: '#c8f04a' }}>Privacy Policy</a>.
          </p>
        </Section>

        <Section title="12. Changes to These Terms">
          <p>
            We may update these Terms from time to time. We will notify you of material changes by posting
            the updated terms on this page. Continued use of the Service after changes constitutes acceptance
            of the revised terms.
          </p>
        </Section>

        <Section title="13. Governing Law">
          <p>
            These Terms are governed by and construed in accordance with the laws of the State of California,
            without regard to its conflict of law principles. Any disputes arising from these Terms shall
            be resolved in the courts of San Francisco County, California.
          </p>
        </Section>

        <Section title="14. Contact Us">
          <p>
            If you have questions about these Terms, contact us at:<br />
            <a href="mailto:agustinvolantesilva@gmail.com" style={{ color: '#c8f04a' }}>agustinvolantesilva@gmail.com</a><br />
            Juno AI LLC, San Francisco, CA
          </p>
        </Section>
      </main>

      <footer style={{
        textAlign: 'center',
        padding: '32px 24px',
        borderTop: '1px solid #222220',
        color: '#4a4840',
        fontSize: '13px',
      }}>
        <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: '18px', color: '#f0ead2', marginBottom: '8px' }}>
          juno<span style={{ color: '#c8f04a' }}>.</span>
        </div>
        <div>&copy; 2026 Juno &middot; San Francisco, CA &middot; <a href="/privacy" style={{ color: '#8a8678' }}>Privacy Policy</a> &middot; <a href="/terms" style={{ color: '#8a8678' }}>Terms of Service</a></div>
      </footer>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '40px' }}>
      <h2 style={{
        fontSize: '20px',
        fontWeight: 600,
        marginBottom: '12px',
        color: '#f0ead2',
      }}>{title}</h2>
      <div style={{ color: '#c4bfa8', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {children}
      </div>
    </section>
  )
}

function Ul({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}
