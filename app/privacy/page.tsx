import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Juno',
}

export default function PrivacyPolicy() {
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
        }}>Privacy Policy</h1>
        <p style={{ color: '#8a8678', marginBottom: '48px' }}>Last updated: April 30, 2026</p>

        <Section title="1. Who We Are">
          <p>
            Juno (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is operated by Caerus AI LLC,
            a company based in San Francisco, California. Juno is a keyword attribution platform that connects
            Google Ads data to CRM systems (such as HubSpot and RD Station) so businesses can measure
            Customer Acquisition Cost (CAC) by keyword.
          </p>
          <p>Contact: <a href="mailto:chaska@caerusai.com" style={{ color: '#c8f04a' }}>chaska@caerusai.com</a></p>
        </Section>

        <Section title="2. Information We Collect">
          <p>When you use Juno, we may collect the following categories of information:</p>
          <Ul items={[
            <><strong>Account information:</strong> Your name, email address, and company name when you sign up.</>,
            <><strong>Google Ads data:</strong> Keyword performance data, campaign metrics, search term reports, and ad spend figures accessed via the Google Ads API through your authorized OAuth connection.</>,
            <><strong>CRM data:</strong> Contact records, deal/pipeline information, UTM parameters, and analytics source data accessed via the HubSpot API or RD Station API through your authorized OAuth connection.</>,
            <><strong>Usage data:</strong> Pages visited, features used, and interactions within the Juno dashboard.</>,
            <><strong>Authentication tokens:</strong> OAuth tokens required to maintain your authorized connections to Google Ads and your CRM.</>,
          ]} />
        </Section>

        <Section title="3. How We Use Your Information">
          <p>We use the data we collect solely to provide and improve Juno&rsquo;s services:</p>
          <Ul items={[
            'Performing keyword-to-deal attribution analysis across your Google Ads and CRM data.',
            'Calculating Customer Acquisition Cost (CAC) per keyword.',
            'Generating spend recommendations (scale, monitor, or cut) based on attribution results.',
            'Producing weekly and monthly performance summaries.',
            'Identifying negative keyword candidates and wasted ad spend.',
            'Maintaining and improving the reliability and performance of our platform.',
          ]} />
        </Section>

        <Section title="4. Google Ads API — Limited Use Disclosure">
          <p>
            Juno&rsquo;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" style={{ color: '#c8f04a' }} target="_blank" rel="noopener noreferrer">
              Google API Services User Data Policy
            </a>, including the Limited Use requirements.
          </p>
          <p>Specifically:</p>
          <Ul items={[
            'We only access Google Ads data that is necessary to provide our keyword attribution service.',
            'We do not sell your Google Ads data to third parties.',
            'We do not use your Google Ads data for advertising or marketing purposes unrelated to providing Juno\'s services.',
            'We do not transfer your Google Ads data to any third party except as necessary to provide or improve our service, as required by law, or with your explicit consent.',
          ]} />
        </Section>

        <Section title="5. Data Storage and Security">
          <p>
            Your data is stored in a secure PostgreSQL database hosted on Supabase with encryption at rest.
            OAuth tokens are stored encrypted and are only used to maintain your authorized API connections.
            We use industry-standard security practices including HTTPS encryption for all data in transit,
            role-based access controls, and regular security reviews.
          </p>
        </Section>

        <Section title="6. Data Sharing">
          <p>We do not sell, rent, or trade your personal or business data. We may share data only in these circumstances:</p>
          <Ul items={[
            <>With <strong>service providers</strong> that help us operate Juno (e.g., Supabase for database hosting, Vercel for application hosting), bound by data processing agreements.</>,
            <>To comply with <strong>legal obligations</strong>, respond to lawful requests, or protect our rights.</>,
            <>With your <strong>explicit consent</strong>.</>,
          ]} />
        </Section>

        <Section title="7. Data Retention">
          <p>
            We retain your data for as long as your account is active and as needed to provide our services.
            If you disconnect your integrations or delete your account, we will delete your synced Google Ads
            and CRM data within 30 days. Aggregated, anonymized analytics data may be retained indefinitely.
          </p>
        </Section>

        <Section title="8. Your Rights">
          <p>You have the right to:</p>
          <Ul items={[
            'Access the data we hold about you.',
            'Request correction of inaccurate data.',
            'Request deletion of your data and account.',
            'Revoke OAuth access to your Google Ads or CRM accounts at any time through your Google or CRM account settings.',
            'Export your attribution data.',
          ]} />
          <p>To exercise any of these rights, contact us at <a href="mailto:chaska@caerusai.com" style={{ color: '#c8f04a' }}>chaska@caerusai.com</a>.</p>
        </Section>

        <Section title="9. Cookies">
          <p>
            Juno uses essential cookies required for authentication and session management.
            We do not use third-party advertising or tracking cookies.
          </p>
        </Section>

        <Section title="10. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We will notify you of material changes
            by posting the updated policy on this page with a revised &ldquo;Last updated&rdquo; date.
          </p>
        </Section>

        <Section title="11. Contact Us">
          <p>
            If you have questions about this Privacy Policy or how we handle your data, contact us at:<br />
            <a href="mailto:chaska@caerusai.com" style={{ color: '#c8f04a' }}>chaska@caerusai.com</a><br />
            Caerus AI LLC, San Francisco, CA
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
